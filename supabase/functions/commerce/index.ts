import { adminClient, authenticatedUser, cleanText, corsHeaders, invoiceEmail, json, sendEmail, sendOrderSms, SITE_URL } from "../_shared/helpers.ts";

async function hmacHex(value: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function loadOrder(client: any, orderId: string, userId: string) {
  const { data, error } = await client.from("orders")
    .select("*,order_items(product_id,product_name,price,quantity,size)")
    .eq("id", orderId).eq("user_id", userId).single();
  if (error || !data) throw new Error("Order was not found.");
  return data;
}

async function logResult(client: any, order: any, channel: string, event: string, result: any) {
  await client.from("notification_log").upsert({
    order_id: order.id,
    user_id: order.user_id,
    channel,
    event,
    status: result.status,
    provider_id: result.id || "",
    error_message: result.error || ""
  }, { onConflict: "order_id,channel,event" });
}

async function createShipment(client: any, order: any) {
  if (order.shipment_id) return { status: "sent", id: order.shipment_id, error: "" };
  const email = Deno.env.get("SHIPROCKET_EMAIL");
  const password = Deno.env.get("SHIPROCKET_PASSWORD");
  const pickup = Deno.env.get("SHIPROCKET_PICKUP_LOCATION");
  if (!email || !password || !pickup) return { status: "skipped", id: "", error: "Shiprocket is not configured." };

  const authResponse = await fetch("https://apiv2.shiprocket.in/v1/external/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password })
  });
  const auth = await authResponse.json().catch(() => ({}));
  if (!authResponse.ok || !auth.token) return { status: "failed", id: "", error: auth.message || "Shiprocket login failed." };

  const response = await fetch("https://apiv2.shiprocket.in/v1/external/orders/create/adhoc", {
    method: "POST",
    headers: { "Authorization": `Bearer ${auth.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      order_id: order.order_number,
      order_date: new Date(order.created_at).toISOString().slice(0, 19).replace("T", " "),
      pickup_location: pickup,
      billing_customer_name: order.customer_name,
      billing_last_name: "",
      billing_address: order.address,
      billing_city: order.shipping_city,
      billing_pincode: order.shipping_pincode,
      billing_state: order.shipping_state,
      billing_country: "India",
      billing_email: order.email,
      billing_phone: order.phone,
      shipping_is_billing: true,
      order_items: order.order_items.map((item: any) => ({
        name: item.product_name,
        sku: `TJ-${item.product_id || "ITEM"}`,
        units: item.quantity,
        selling_price: item.price,
        discount: 0,
        tax: 0,
        hsn: "7113"
      })),
      payment_method: order.payment_status === "paid" ? "Prepaid" : "COD",
      shipping_charges: order.shipping,
      total_discount: 0,
      sub_total: order.subtotal,
      length: Number(Deno.env.get("SHIPMENT_LENGTH_CM") || 10),
      breadth: Number(Deno.env.get("SHIPMENT_BREADTH_CM") || 10),
      height: Number(Deno.env.get("SHIPMENT_HEIGHT_CM") || 5),
      weight: Number(Deno.env.get("SHIPMENT_WEIGHT_KG") || 0.5)
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.shipment_id) return { status: "failed", id: "", error: payload.message || "Shipment could not be created." };
  await client.from("orders").update({
    shipping_provider: "shiprocket",
    shipping_order_id: String(payload.order_id || ""),
    shipment_id: String(payload.shipment_id),
    shipping_status: "created"
  }).eq("id", order.id);
  return { status: "sent", id: String(payload.shipment_id), error: "" };
}

async function runPostOrderServices(client: any, order: any) {
  const safely = async (operation: Promise<any>, fallback: string) => {
    try { return await operation; }
    catch (error) { return { status: "failed", id: "", error: error instanceof Error ? error.message : fallback }; }
  };
  const [emailResult, smsResult, shippingResult] = await Promise.all([
    safely(sendEmail({
      to: order.email,
      subject: `Order ${order.order_number} confirmed | Tripti Jewellers`,
      html: invoiceEmail(order),
      idempotencyKey: `order-confirmed-${order.id}`
    }), "Email notification failed."),
    safely(sendOrderSms({ mobile: order.phone, orderNumber: order.order_number, total: order.total, status: "confirmed" }), "SMS notification failed."),
    safely(createShipment(client, order), "Shipment creation failed.")
  ]);
  await Promise.all([
    logResult(client, order, "email", "order_confirmed", emailResult),
    logResult(client, order, "sms", "order_confirmed", smsResult),
    logResult(client, order, "shipping", "shipment_create", shippingResult)
  ]);
  return { email: emailResult.status, sms: smsResult.status, shipping: shippingResult.status };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed." }, 405);
  try {
    const user = await authenticatedUser(req);
    const body = await req.json();
    const action = cleanText(body.action, 40);
    const orderId = cleanText(body.order_id, 80);
    const client = adminClient();
    let order = await loadOrder(client, orderId, user.id);

    if (action === "create-payment") {
      if (order.payment_status === "paid") throw new Error("This order is already paid.");
      if (order.status === "cancelled" || order.payment_method !== "Razorpay") throw new Error("This order is not eligible for online payment.");
      const keyId = Deno.env.get("RAZORPAY_KEY_ID");
      const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
      if (!keyId || !keySecret) throw new Error("Online payment is not configured yet.");
      if (order.provider_order_id) return json(req, { key_id: keyId, order_id: order.provider_order_id, amount: Number(order.total) * 100, currency: "INR" });
      const paymentResponse = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: { "Authorization": `Basic ${btoa(`${keyId}:${keySecret}`)}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(order.total) * 100,
          currency: "INR",
          receipt: order.order_number.slice(0, 40),
          notes: { tripti_order_id: order.id, customer_email: order.email }
        })
      });
      const paymentOrder = await paymentResponse.json().catch(() => ({}));
      if (!paymentResponse.ok || !paymentOrder.id) throw new Error(paymentOrder.error?.description || "Payment order could not be created.");
      await client.from("orders").update({
        payment_provider: "razorpay",
        provider_order_id: paymentOrder.id,
        payment_status: "created"
      }).eq("id", order.id);
      return json(req, { key_id: keyId, order_id: paymentOrder.id, amount: paymentOrder.amount, currency: "INR", name: "Tripti Jewellers", description: order.order_number });
    }

    if (action === "verify-payment") {
      const providerOrderId = cleanText(body.razorpay_order_id, 100);
      const paymentId = cleanText(body.razorpay_payment_id, 100);
      const signature = cleanText(body.razorpay_signature, 200);
      const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET") || "";
      if (!keySecret || providerOrderId !== order.provider_order_id) throw new Error("Payment details do not match this order.");
      const expected = await hmacHex(`${providerOrderId}|${paymentId}`, keySecret);
      if (!constantTimeEqual(signature, expected)) throw new Error("Payment verification failed.");
      const keyId = Deno.env.get("RAZORPAY_KEY_ID");
      const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
        headers: { Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}` }
      });
      const captured = await response.json();
      if (!response.ok || captured.order_id !== providerOrderId || captured.currency !== "INR" || captured.amount !== Number(order.total) * 100 || captured.status !== "captured") throw new Error("Payment is not captured yet. Please check your order again shortly; do not pay twice.");
      if (order.payment_status === "paid") return json(req, { ok: true, order_number: order.order_number });
      if (order.status === "cancelled") throw new Error("This order has been cancelled. Contact the store about this payment.");
      const { error } = await client.from("orders").update({
        provider_payment_id: paymentId,
        payment_status: "paid",
        paid_at: new Date().toISOString(),
        status: "confirmed"
      }).eq("id", order.id).eq("provider_order_id", providerOrderId);
      if (error) throw error;
      await client.from("cart_items").delete().eq("user_id", user.id);
      order = await loadOrder(client, order.id, user.id);
      const services = await runPostOrderServices(client, order);
      return json(req, { ok: true, order_number: order.order_number, invoice_number: order.invoice_number, invoice_url: `${SITE_URL}/invoice.html?order=${encodeURIComponent(order.id)}`, services });
    }

    if (action === "finalize-cod") {
      if (order.payment_method.toLowerCase() !== "cash on delivery") throw new Error("This order is not marked for cash on delivery.");
      if (order.status === "cancelled") throw new Error("This order has been cancelled.");
      if (order.status !== "pending") return json(req, { ok: true, order_number: order.order_number });
      const { error } = await client.from("orders").update({ payment_status: "cod_pending", status: "confirmed" }).eq("id", order.id);
      if (error) throw error;
      await client.from("cart_items").delete().eq("user_id", user.id);
      order = await loadOrder(client, order.id, user.id);
      const services = await runPostOrderServices(client, order);
      return json(req, { ok: true, order_number: order.order_number, invoice_number: order.invoice_number, invoice_url: `${SITE_URL}/invoice.html?order=${encodeURIComponent(order.id)}`, services });
    }

    return json(req, { error: "Unknown commerce action." }, 400);
  } catch (error) {
    return json(req, { error: error instanceof Error ? error.message : "Commerce request failed." }, 400);
  }
});
