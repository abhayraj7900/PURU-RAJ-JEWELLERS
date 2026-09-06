# Tripti store tools — activation and delivery setup

The storefront code is separate from database activation. Do not describe the new tools as operational until the SQL migration has succeeded and the checks below pass.

## 1. Database activation

In the existing Supabase project, run `supabase/store-tools-upgrade.sql` once, after the original setup, commerce and order-service migrations. It is transactional and can be rerun. Back up the database first. No historical emails are sent, and previously cancelled orders are not restocked.

Stock is already deducted atomically by `place_order` / `place_order_v2`. This migration does NOT deduct it again. A unique order-level restoration record and an order-row trigger restore cancellation stock exactly once in the same transaction. Cancelled orders cannot be reopened. Dispatched/delivered goods must use the return process. Returns do NOT automatically restore stock or refund money; inspect received goods and adjust inventory separately.

Admin: Stock & low-stock alerts, Returns & exchanges, Sales reports, Appointments & notifications. Customer: My account → notification preferences, appointments, delivered-purchase returns and reviews. Product pages show verified reviews. Cart reminder opt-in is also on the bag page.

Appointment submissions are requests, not guaranteed bookings. An admin confirms the time and supplies meeting/location instructions. One confirmed appointment is allowed at an exact timestamp; admins must check overlapping appointment duration themselves. There is no automatic video meeting creation. Return eligibility is delivered-purchase based, with manual policy review; no invented fixed return window.

Review photos and display names are explicitly public; return evidence is private, opened with five-minute signed links. Uploads allow JPG/PNG/WebP only, up to 5 MB. Orphan uploads after a failed submission may be cleaned up manually in Storage after confirming no record references them. No automatic deletion is performed.

## 2. Notification provider activation

### Built-in providers (no custom adapter required)

Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` on Vercel. Then configure either or both:

- **Email / Resend:** `RESEND_API_KEY` and `EMAIL_FROM` (a sender on a verified domain). Confirmation, shipment, cancellation, delivery and consent-based cart reminder text are already implemented.
- **WhatsApp / Twilio:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` (international number with country code), and `TWILIO_WHATSAPP_CONTENT_SID` (approved Content Template SID). The template must have exactly these variable meanings: `{{1}}` order number, `{{2}}` order status, `{{3}}` account URL. Include a fixed explanation that cancellation does not itself confirm a completed refund. Use a production-approved WhatsApp sender; no account purchase or template submission was performed.

Email retries keep the same Resend idempotency key and stop automatically after 23 hours from the first attempt. Direct Twilio delivery is attempted once: uncertainty or interruption requires manual reconciliation against provider logs, preventing blind duplicate sends. Do not reset attempts until acceptance/non-acceptance is established. The dashboard uses the same queue for both providers.

Provider references: [Resend sending](https://resend.com/docs/api-reference/emails/send-email), [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [Twilio WhatsApp templates](https://www.twilio.com/docs/whatsapp/tutorial/send-whatsapp-notification-messages-templates).

### Optional custom adapters

No email/WhatsApp provider is assumed or purchased. Configure these **server-only Vercel environment variables**, never in a browser file:

- `SUPABASE_URL`: existing project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: project service-role secret.
- `EMAIL_DELIVERY_URL`: HTTPS endpoint of your email delivery adapter.
- `WHATSAPP_DELIVERY_URL`: HTTPS endpoint of your WhatsApp Business delivery adapter.
- `DELIVERY_ADAPTER_SECRET`: shared secret checked by the adapters.
- `CRON_SECRET`: random secret used only by your scheduler.

Adapters must authenticate the bearer secret, honor `Idempotency-Key` across retries, and translate the event to your provider's approved email/WhatsApp template. Do not use an arbitrary public endpoint. Each POST contains `channel`, `to`, `event`, `order_number`, `account_url`, and `preferences_url`. Respond **only after provider acceptance** with `{ "accepted": true, "provider_id": "actual-provider-message-id" }`. Never return a fake success. A timeout is retried using the same key; the adapter must deduplicate even if its previous provider response was lost. Until adapters exist, message sending is not active.

Events: order_received, order_confirmed, order_shipped, order_cancelled, order_delivered, cart_reminder. WhatsApp order notifications require customer opt-in. Optional email cart reminders require separate opt-in and are limited to one reminder per seven days, after 24 hours of inactivity. Consent and cart/order state are checked again when claiming jobs. Every message should include the preferences URL for opting out. “Sent” in the dashboard means provider accepted, not recipient delivery/read confirmation.

Call GET `/api/store-notifications` from a scheduler with `Authorization: Bearer <CRON_SECRET>` every 5–15 minutes, subject to your hosting plan. No paid scheduler is enabled automatically. Admins can also use “Process pending notifications” to send a batch manually. Each run claims at most 20 jobs with row locks, recovers claims after 10 minutes, and retries failed delivery up to five attempts. No provider keys or recipient details are returned to callers. Configure the platform function timeout to cover 30 seconds. After five failures investigate before an administrator resets attempts in the database.

Redeploy the updated Supabase `commerce` function if you use it: its email confirmation is suppressed only when the new outbox table is available, avoiding two email confirmation senders. A Vercel deployment alone does not update Supabase functions. Existing SMS/courier integrations are unchanged; their deployment and credentials are separate.

## 3. Acceptance checks before real use

Use a staging project and test accounts. Do not cancel real orders or send customer messages for testing.

1. Place an order, verify stock decreases once. Approve cancellation, verify exact quantities restore once. Repeat status update, verify no increase. Reopening must fail. Concurrent approvals must not double-restock.
2. Customer B cannot read or modify customer A's requests, preferences, appointments or private evidence. Anonymous requests cannot write. Non-admins cannot decide requests, read reports or run the dispatcher.
3. Only a delivered item owned by the signed-in customer accepts a review or return request. Duplicate reviews and multiple return/exchange requests for the same item are rejected.
4. Upload a small raster photo; confirm return photo is private, review photo public. Reject SVG/oversize uploads. View evidence as owner/admin only.
5. Book a future appointment; admin confirms/rejects with instructions; customer refresh sees status. Duplicate confirmed times must fail.
6. Compare daily/monthly totals with orders in India time. Gross value excludes pending/cancelled orders but is not net of refunds or a payment settlement report. Product ranking uses item values before order-level coupons; gross order value includes shipping and order discounts.
7. With opt-in absent, no cart/WhatsApp notifications are queued. Withdraw consent before dispatch; queue entry is skipped. Empty/converted cart is not reminded. Repeated dispatcher requests cannot double-claim a job. Provider failures must never show “sent”.

Tests shipped in `tests/store-tools.test.cjs` cover UI helpers/dispatcher, and `tests/store-tools-db.test.cjs` exercises the migration against a disposable PostgreSQL-compatible PGlite database when its package path is supplied. They do not prove live provider or production RLS configuration.

Storage API reference: https://supabase.com/docs/reference/self-hosting-storage/upload-a-new-object
