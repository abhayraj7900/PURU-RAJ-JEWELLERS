# Header market rates

The storefront now loads a narrow scrolling strip between the search/header row and category navigation. Admin → Market rates controls visibility, duration, labels, manual values, notes, and automatic/manual modes. Changes are fetched every 60 seconds while a page is visible. These rates are informational: they never alter product or checkout prices. No fabricated prices are seeded.

## Activation still required

1. Run `supabase/market-rates-upgrade.sql` in the existing project's SQL Editor. Original `setup.sql` is required. Public users can read; only an authenticated database admin can insert/update. This is separate from the previous combined upgrade.
2. Open admin → Market rates, set manual prices and quality notes, and save. Settings use Supabase, not browser storage, including on localhost. Saving affects all clients using this database.
3. To enable automatic quotes, select a provider with website redistribution rights covering INR gold 24K per 10g, silver per kg, and BSE Sensex. No provider subscription or credentials are present yet. BSE offers licensed market data: https://marketdata.bseindia.com/ .
4. Adapt that provider's payload to the normalized contract below, and configure server-only Vercel environment variables `MARKET_RATES_FEED_URL` and optional `MARKET_RATES_FEED_TOKEN` (Bearer authentication). Never put credentials in the dashboard, public JS, or Git. This is an adapter contract, not a claim that arbitrary provider endpoints already follow it.
5. Deploy the Vercel API and storefront together after approval. A plain static localhost server shows unavailable automatic rates because it cannot run `/api/market-rates`; use the project's Vercel development environment to test the API.

The HTTPS feed must return `{ "quotes": { "gold": quote, "silver": quote, "sensex": quote } }`. Each quote has a positive numeric `value`, exact `unit` (`₹ / 10 g`, `₹ / kg`, or `points`), actual provider `asOf` ISO timestamp, public `source` name, and `status` (`live`, `delayed`, or `closed`). Gold must be 24K. Return only licensed data with correct currency/unit conversion; do not substitute USD/oz or futures for these labels. Missing assets are unavailable independently.

The endpoint caches successful responses for 60 seconds. Quotes older than 15 minutes are labelled last available, market-closed quotes retain their status, and quotes older than 24 hours or implausibly in the future are suppressed. Failures show unavailable instead of passing manual values off as live.

Diamond is intentionally manual and indicative: specify natural/lab-grown, cut, colour, clarity and carat basis in the note. There is no one interchangeable retail diamond price (https://www.gia.edu/diamond-quality-factor).

## Checks

`node --test tests/market-rates.test.cjs` checks validation, stale/closed data, manual overrides, failure responses and provider filtering. `node scripts/build.cjs` builds public assets; the root `api/` directory is handled separately by Vercel. SQL activation, real provider connectivity and production deployment have not been performed as part of the local implementation.
