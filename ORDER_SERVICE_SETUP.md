# Tracking and cancellation activation

Run `supabase/order-service-upgrade.sql` in the existing project's Supabase SQL Editor. This migration requires the original setup.sql, not the optional commerce upgrade. It has not been applied remotely by this code change.

Customers see the actual current order status and admin-entered courier/AWB/HTTPS link. No fabricated shipment events or timestamps are generated. Tracking details load on page refresh. Automatic courier polling/webhooks are not part of this change.

Authenticated customers can request cancellation only of their own pending/confirmed/processing orders, with a required reason. Requests are server-validated, one per order, and serialize against the order row. Customers have no direct write privileges on the service table. RLS limits reads to the owner and admins.

Admin → Tracking & cancellations displays requests, reasons, courier fields and approval/rejection controls. Approving marks the order cancelled in the same transaction. Shipped/delivered/cancelled orders cannot be approved here. Decision notes are customer-visible. Refund processing, cancelling a real courier booking and restocking are explicit manual operations, not falsely marked complete. Existing Orders status editing remains available; use the request review controls to record the reason/decision for customer requests.

Test migration and authenticated ownership/role restrictions in Supabase before treating cancellation as active. Public-site fallback disables submission and explains activation is pending if the table is absent.
