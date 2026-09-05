# Footer, information pages and store locations

The changes are local only. No new table or content has been written to the live project.

## Editing now

Open the local `admin.html`, sign in with your admin account and choose **Footer & locations**.

- Footer details: brand, tagline, phone, WhatsApp, email, opening hours, payment text, copyright, social links and app links.
- Information pages: edit titles and text for all twelve useful-information and policy pages.
- Stores & map pins: add/edit/remove stores, opening hours, city, PIN code, phone and Maps link. Add latitude and longitude for nearest-store sorting.
- Delivery PIN codes: enter exact PIN codes or prefixes, availability, COD eligibility and estimated working days. The most specific matching rule wins.

Local edits are saved only in the browser on the local preview origin. Use **Export details backup** to retain them for publishing or another browser. Only a signed-in admin can access the editor; local browser storage is a preview facility, not production authorization.

Store address, city counts, phone numbers, social URLs and app URLs are intentionally empty until the owner supplies them. No competitor details, unverified locations or unsupported payment logos are used. Footer links navigate to actual pages. Delivery checks describe owner-configured coverage, not a live courier serviceability guarantee.

Current-location detection runs only when the visitor clicks the button. If location permission is declined, city/PIN search still works. Coordinates are used in memory to calculate straight-line store distances; they are not saved to a database. Directions open Google Maps on the visitor's request.

## Later activation, only when requested

1. Export the local details backup.
2. Apply `supabase/site-content-upgrade.sql` to the existing Supabase project. It adds public read/admin-only write access to the `site_content` table.
3. Publish the updated static files, including `stores.html`, `delivery.html`, `information.html`, `js/site-content.js`, `js/content-admin.js`, and `css/site-content.css`.
4. Open the deployed admin, import the exported backup, and confirm it. Public pages then load the saved data from Supabase.
5. Check actual store pins, delivery rules and business-policy wording before publishing them for customers.

The earlier commerce migration remains separate. This update does not activate payments, courier APIs or notifications.
