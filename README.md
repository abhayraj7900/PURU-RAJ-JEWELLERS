# Tripti Jewellers

Tripti Jewellers is a mobile-first ecommerce website for gold, diamond, gemstone, wedding, and everyday jewellery. The storefront uses plain HTML, CSS, and JavaScript, while Supabase provides authentication, database access, storage and server-side commerce functions.

## Features

- Responsive home, shop, product, cart, about, and contact pages
- Jewellery search, category filters, and dynamic product details
- Customer login, private account dashboard, addresses and order history
- Shopping bag saved locally for guests and synced through Supabase for signed-in customers
- Quantity updates, item removal, and automatic order totals
- Razorpay online checkout with server-side order creation and signature verification
- Cash on delivery option and automatic invoice page
- Shiprocket order creation, Resend email and MSG91 SMS integration hooks
- Contact enquiries saved to Supabase and managed in the admin dashboard
- Product, stock, price, order, customer, message and content administration
- Responsive desktop category navigation and mobile jewellery drawer
- SEO and social-sharing information on every page

## Preview the website

Download or clone the project, then open `index.html` in a web browser.

## Project structure

```text
index.html          Home page
shop.html           Product catalogue
product.html        Dynamic product details
cart.html           Cart and secure checkout
login.html          Customer authentication
account.html        Private customer dashboard
admin.html          Private store administration
invoice.html        Secure printable customer invoice
about.html          Brand story
contact.html        Contact, shipping, returns, and FAQs
css/style.css       All website styling
js/products.js      Editable product catalogue
js/main.js          Cart, catalogue, sync and checkout functionality
supabase/            Database migrations and Edge Functions
images/             Campaign, product, and payment images
```

## Important launch settings

Before publishing the final store:

1. Follow `COMMERCE_SETUP.md` to activate the local commerce upgrade.
2. Keep provider secret keys in Supabase Edge Function Secrets—never in browser JavaScript.
3. Test payments, fulfilment, notifications, invoices and two-device cart sync before production use.
4. Update the site URL and email sender after connecting the final domain.

## Technology

- HTML5
- CSS3
- Vanilla JavaScript
- Supabase Auth, Postgres, Storage, Row Level Security and Edge Functions
- Razorpay, Shiprocket, Resend and MSG91 APIs
- Browser `localStorage` for guest continuity
