# Tripti Jewellers commerce integrations

These local files prepare the store for Razorpay payments, Shiprocket fulfilment, Resend email, MSG91 SMS, synced carts, invoices, and saved contact messages. Nothing is live until the database migration, Edge Functions, and secrets are deployed.

## Combined activation and coupons

Run `supabase/activate-all-upgrades.sql` in the existing project's SQL Editor to apply commerce, website content and coupon migrations together. The original `setup.sql` must already be installed. This file does not configure provider secrets or deploy Edge Functions.

Admin → Coupons supports flat/percentage discounts, minimum bag values, optional discount caps, excluded categories, start/expiry times and enable/disable. Customers can view available offers, apply or remove a code in the bag. `quote_coupon` and `place_order_v3` calculate discounts using database prices; the browser cannot set the payment amount. Coupon offers have no per-customer redemption limit.

Checkout location lookup requests browser permission only on button click, then sends coordinates to OpenStreetMap Nominatim to fill the available street, city, state and PIN fields. House/flat numbers and geocoded results must be checked by the customer. There is no background tracking. Keep Nominatim attribution visible and move to a dedicated geocoding service if traffic exceeds its public usage limits.

## When the owner says to publish

1. Run `supabase/commerce-upgrade.sql` once in the Supabase SQL Editor.
2. Add the values listed in `.env.example` to Supabase Edge Function Secrets. Never put secret values in website JavaScript or commit them to Git.
3. Deploy the `commerce` and `contact-message` Edge Functions.
4. In Razorpay, start with Test Mode keys and verify the complete checkout/signature callback flow before switching to Live Mode.
5. In Shiprocket, create a separate API user and set the exact pickup-location name.
6. In Resend, verify the sending domain and use an address on that domain.
7. In MSG91, create and approve the transactional order template; its variables must be `ORDER_NUMBER`, `ORDER_TOTAL`, and `ORDER_STATUS`.
8. Test one Razorpay test payment, one COD order, invoice access, cart sync on two browsers, and contact submission before production deployment.
