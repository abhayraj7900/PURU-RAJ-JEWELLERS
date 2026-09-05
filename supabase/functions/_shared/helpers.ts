import { createClient } from "npm:@supabase/supabase-js@2.95.0";

export const SITE_URL = Deno.env.get("SITE_URL") || "https://triptijewllers.vercel.app";

function readNamedKey(name: string, fallbackName: string) {
  const direct = Deno.env.get(fallbackName);
  if (direct) return direct;
  try {
    const values = JSON.parse(Deno.env.get(name) || "{}");
    return values.default || Object.values(values)[0] || "";
  } catch {
    return "";
  }
}

export function adminClient() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const secret = readNamedKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !secret) throw new Error("Supabase server secrets are not configured.");
  return createClient(url, String(secret), { auth: { persistSession: false } });
}

export async function authenticatedUser(req: Request) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Please sign in again.");
  const client = adminClient();
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new Error("Your session is not valid. Please sign in again.");
  return data.user;
}

function allowedOrigin(requestOrigin: string | null) {
  const configured = (Deno.env.get("ALLOWED_ORIGINS") || `${SITE_URL},http://127.0.0.1:8765,http://localhost:8765`)
    .split(",").map((value) => value.trim()).filter(Boolean);
  return requestOrigin && configured.includes(requestOrigin) ? requestOrigin : configured[0];
}

export function corsHeaders(req: Request) {
  return {
    "Access-Control-Allow-Origin": allowedOrigin(req.headers.get("Origin")),
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}

export function json(req: Request, body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

export function cleanText(value: unknown, maximum = 500) {
  return String(value ?? "").trim().slice(0, maximum);
}

export function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[character] || character));
}

export function normalizeIndianMobile(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return digits;
}

export async function sendEmail(input: { to: string; subject: string; html: string; idempotencyKey: string }) {
  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL");
  if (!key || !from) return { status: "skipped", id: "", error: "Resend is not configured." };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey
    },
    body: JSON.stringify({ from, to: [input.to], subject: input.subject, html: input.html })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return { status: "failed", id: "", error: payload.message || "Email could not be sent." };
  return { status: "sent", id: payload.id || "", error: "" };
}

export async function sendOrderSms(input: { mobile: string; orderNumber: string; total: number; status: string }) {
  const authKey = Deno.env.get("MSG91_AUTH_KEY");
  const templateId = Deno.env.get("MSG91_TEMPLATE_ID");
  const mobile = normalizeIndianMobile(input.mobile);
  if (!authKey || !templateId || mobile.length !== 12) return { status: "skipped", id: "", error: "MSG91 is not configured." };
  const response = await fetch("https://control.msg91.com/api/v5/flow", {
    method: "POST",
    headers: { "accept": "application/json", "authkey": authKey, "content-type": "application/json" },
    body: JSON.stringify({
      template_id: templateId,
      short_url: "0",
      recipients: [{ mobiles: mobile, ORDER_NUMBER: input.orderNumber, ORDER_TOTAL: String(input.total), ORDER_STATUS: input.status }]
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.type === "error") return { status: "failed", id: "", error: payload.message || "SMS could not be sent." };
  return { status: "sent", id: payload.request_id || "", error: "" };
}

export function invoiceEmail(order: any) {
  const invoiceUrl = `${SITE_URL}/invoice.html?order=${encodeURIComponent(order.id)}`;
  const items = (order.order_items || []).map((item: any) => `<li>${escapeHtml(cleanText(item.product_name, 120))} × ${Number(item.quantity)}</li>`).join("");
  return `<div style="font-family:Arial,sans-serif;color:#2c1017"><h1>Tripti Jewellers</h1><p>Thank you for your order <strong>${escapeHtml(cleanText(order.order_number))}</strong>.</p><ul>${items}</ul><p><strong>Total: ₹${Number(order.total).toLocaleString("en-IN")}</strong></p><p><a href="${invoiceUrl}">View or download invoice ${escapeHtml(cleanText(order.invoice_number))}</a></p></div>`;
}
