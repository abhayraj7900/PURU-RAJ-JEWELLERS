// Server-only adapter. Never accept a provider URL or credentials from a browser.
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const endpoint = process.env.MARKET_RATES_FEED_URL;
  if (!endpoint) return res.status(503).json({ error: 'Market feed is not configured', quotes: {} });
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid endpoint');
    const response = await fetch(url, { headers: process.env.MARKET_RATES_FEED_TOKEN ? { Authorization: `Bearer ${process.env.MARKET_RATES_FEED_TOKEN}` } : {}, signal: AbortSignal.timeout(8000), redirect: 'error' });
    if (!response.ok) throw new Error('Provider unavailable');
    const body = await response.text(); if (body.length > 64000) throw new Error('Oversized response');
    const data = JSON.parse(body), quotes = {};
    for (const [id, unit] of Object.entries({ gold: '₹ / 10 g', silver: '₹ / kg', sensex: 'points' })) {
      const q = data.quotes?.[id], age = Date.now() - Date.parse(q?.asOf);
      if (!q || typeof q.value !== 'number' || !Number.isFinite(q.value) || q.value <= 0 || q.unit !== unit || !['live', 'delayed', 'closed'].includes(q.status) || typeof q.source !== 'string' || !q.source.trim() || !Number.isFinite(age) || age < -60000 || age > 86400000) continue;
      quotes[id] = { value: q.value, unit, source: q.source.slice(0, 80), asOf: new Date(q.asOf).toISOString(), status: q.status === 'live' && age > 900000 ? 'delayed' : q.status };
    }
    if (!Object.keys(quotes).length) throw new Error('No valid quotes');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
    return res.status(200).json({ quotes });
  } catch { return res.status(503).json({ error: 'Market feed temporarily unavailable', quotes: {} }); }
};
