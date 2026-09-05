import { adminClient, cleanText, corsHeaders, escapeHtml, json, sendEmail } from "../_shared/helpers.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed." }, 405);
  try {
    const body = await req.json();
    if (cleanText(body.website, 100)) return json(req, { ok: true });
    const name = cleanText(body.name, 100);
    const email = cleanText(body.email, 200).toLowerCase();
    const phone = cleanText(body.phone, 30);
    const message = cleanText(body.message, 2000);
    if (name.length < 2 || !email.includes("@") || phone.length < 10 || message.length < 5) throw new Error("Please complete all contact details.");

    const client = adminClient();
    const authorization = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: userData } = authorization ? await client.auth.getUser(authorization) : { data: { user: null } };
    const { data, error } = await client.from("contact_messages").insert({ user_id: userData.user?.id || null, name, email, phone, message }).select("id").single();
    if (error) throw error;

    const adminEmail = Deno.env.get("ADMIN_NOTIFICATION_EMAIL");
    if (adminEmail) {
      await sendEmail({
        to: adminEmail,
        subject: `New website enquiry from ${name}`,
        html: `<div style="font-family:Arial,sans-serif"><h2>New Tripti Jewellers enquiry</h2><p><strong>Name:</strong> ${escapeHtml(name)}</p><p><strong>Email:</strong> ${escapeHtml(email)}</p><p><strong>Phone:</strong> ${escapeHtml(phone)}</p><p>${escapeHtml(message).replace(/\n/g, "<br>")}</p></div>`,
        idempotencyKey: `contact-${data.id}`
      });
    }
    return json(req, { ok: true, id: data.id });
  } catch (error) {
    return json(req, { error: error instanceof Error ? error.message : "Your message could not be sent." }, 400);
  }
});
