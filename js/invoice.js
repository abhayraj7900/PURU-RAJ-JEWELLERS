/* Secure customer invoice view. Access is protected by Supabase row-level security. */
(function () {
  "use strict";

  const api = window.TriptiSupabase;
  const loading = document.querySelector("#invoice-loading");
  const errorBox = document.querySelector("#invoice-error");
  const documentBox = document.querySelector("#invoice-document");
  const actions = document.querySelector("#invoice-actions");

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>\"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;" })[character]);
  }

  function price(value) {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value || 0));
  }

  function date(value) {
    return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(value));
  }

  function title(value) {
    return String(value || "pending").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function fail(message) {
    loading.hidden = true;
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  async function initialize() {
    if (!api) return fail("Invoice service could not load. Please refresh this page.");
    const orderId = new URLSearchParams(window.location.search).get("order") || "";
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) return fail("This invoice link is not valid.");
    const user = await api.getUser();
    if (!user) {
      window.location.replace(`login.html?returnTo=${encodeURIComponent(`invoice.html?order=${orderId}`)}`);
      return;
    }
    try {
      const rows = await api.select("orders", `select=*,order_items(product_name,price,quantity,size)&id=eq.${encodeURIComponent(orderId)}&limit=1`);
      const order = rows?.[0];
      if (!order) throw new Error("Invoice not found or you do not have permission to view it.");
      document.querySelector("#invoice-number").textContent = order.invoice_number || order.order_number;
      document.querySelector("#invoice-order-number").textContent = order.order_number;
      document.querySelector("#invoice-date").textContent = date(order.created_at);
      document.querySelector("#invoice-payment").textContent = `${title(order.payment_method)} · ${title(order.payment_status)}`;
      document.querySelector("#invoice-order-status").textContent = title(order.status);
      document.querySelector("#invoice-customer").textContent = order.customer_name;
      document.querySelector("#invoice-address").textContent = [order.address, order.shipping_city, order.shipping_state, order.shipping_pincode].filter(Boolean).join(", ");
      document.querySelector("#invoice-contact").textContent = `${order.phone} · ${order.email}`;
      document.querySelector("#invoice-items").innerHTML = (order.order_items || []).map((item) => `<tr><td><strong>${escapeHtml(item.product_name)}</strong>${item.size ? `<small>Size: ${escapeHtml(item.size)}</small>` : ""}</td><td>${price(item.price)}</td><td>${Number(item.quantity)}</td><td>${price(Number(item.price) * Number(item.quantity))}</td></tr>`).join("");
      document.querySelector("#invoice-subtotal").textContent = price(order.subtotal);
      document.querySelector("#invoice-shipping").textContent = Number(order.shipping) === 0 ? "Complimentary" : price(order.shipping);
      document.querySelector("#invoice-total").textContent = price(order.total);
      if (Number(order.discount) > 0) {
        const row = document.createElement("div");
        row.innerHTML = `<span>Coupon ${escapeHtml(order.coupon_code || "")}</span><strong>− ${price(order.discount)}</strong>`;
        document.querySelector(".invoice-grand-total").before(row);
      }
      document.title = `${order.invoice_number || order.order_number} | Puru Raj Jewelllers`;
      loading.hidden = true;
      documentBox.hidden = false;
      actions.hidden = false;
    } catch (error) {
      fail(error.message);
    }
  }

  document.querySelector("#print-invoice").addEventListener("click", () => window.print());
  initialize();
})();
