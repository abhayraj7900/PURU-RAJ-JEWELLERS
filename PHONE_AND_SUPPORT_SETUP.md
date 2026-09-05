# Activation required after publishing

- Run `supabase/phone-auth-upgrade.sql` in the existing Supabase SQL Editor BEFORE using phone signups. This allows null email values for phone-only profiles without inventing email addresses, and preserves existing admin roles. Keep email login enabled for the existing admin.
- In Supabase Authentication → Sign In / Providers → Phone, enable phone authentication and configure a supported SMS provider. Configure production rate limits, bot protection and applicable SMS templates with that provider. Never place provider secrets in browser code or Git. Actual SMS delivery has not been tested or activated here.
- Phone and email accounts are distinct identities; this implementation does not silently merge them. Checkout integrations that require email may still need the customer to supply an email; do not assume phone-only checkout is validated.
- Admin → Footer & locations → WhatsApp must contain the real international-format business number. The support panel opens WhatsApp with customer-provided details; it is not an AI chatbot.
- Product filters read the existing Details lines: `Type:`, `Brand:`, `Gender:`, `Purity:`, `Occasion:`, `Metal:`, `Clarity:`, `Collection:`, `Community:`, `Form:`, `Colour:`, `Width:`. Empty facets are honestly marked unavailable. Best sellers and new arrivals use admin badges, recommendations use Featured; no fabricated sales rankings.
- Product Share uses native sharing where supported, otherwise copies name, price and link. It does not upload private files or generate social-preview imagery.
- Earlier market feed/database, payments, shipping and notification setup remain independently pending as documented in their setup guides.
