(function () {
  'use strict';
  const assets = { gold: ['Gold 24K', '₹ / 10 g'], silver: ['Silver', '₹ / kg'], diamond: ['Diamond', '₹ / carat'], sensex: ['Sensex', 'points'] };
  const defaults = () => ({ enabled: true, speed: 40, items: Object.entries(assets).map(([id, [label, unit]]) => ({ id, label, unit, enabled: true, mode: id === 'diamond' ? 'manual' : 'auto', value: null, note: '', updated_at: null })) });
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function normalize(raw) {
    const result = defaults();
    result.enabled = raw?.enabled !== false;
    result.speed = Math.max(20, Math.min(100, Number(raw?.speed) || 40));
    result.items = result.items.map(base => {
      const item = raw?.items?.find?.(x => x?.id === base.id) || {};
      return { ...base, label: String(item.label || base.label).slice(0, 40), enabled: item.enabled !== false,
        mode: base.id !== 'diamond' && (item.mode || base.mode) === 'auto' ? 'auto' : 'manual',
        value: item.value !== null && item.value !== '' && Number.isFinite(Number(item.value)) && Number(item.value) > 0 ? Number(item.value) : null,
        note: String(item.note || '').slice(0, 100), updated_at: Number.isFinite(Date.parse(item.updated_at)) ? item.updated_at : null };
    });
    return result;
  }
  function quote(item, feed, now = Date.now()) {
    if (item.mode !== 'auto') return { value: item.value, status: item.id === 'diamond' ? 'Indicative · store rate' : 'Store rate', time: item.updated_at, source: 'Tripti Jewellers' };
    const q = feed?.quotes?.[item.id];
    const age = now - Date.parse(q?.asOf);
    if (!q || !Number.isFinite(q.value) || q.value <= 0 || q.unit !== item.unit || !q.source || !Number.isFinite(age) || age < -60000 || age > 86400000) return { value: null, status: 'Feed unavailable' };
    return { value: q.value, status: q.status === 'closed' ? 'Market closed · last quote' : age > 900000 ? 'Last available' : q.status === 'live' ? 'Live' : 'Delayed', time: q.asOf, source: q.source };
  }
  async function load() {
    const rows = await window.TriptiSupabase.select('market_ticker', 'select=settings&id=eq.main&limit=1');
    return normalize(rows[0]?.settings || defaults());
  }
  function installStyles() {
    if (document.querySelector('link[data-market-styles]')) return;
    const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'css/market-rates.css'; link.dataset.marketStyles = ''; document.head.append(link);
  }
  async function initialize() {
    const header = document.querySelector('.site-header'); if (!header) return;
    installStyles();
    const strip = document.createElement('section'); strip.className = 'market-ticker'; strip.setAttribute('aria-label', 'Indicative market rates');
    strip.innerHTML = '<span class="market-title">MARKET RATES</span><div class="market-window"><div class="market-track"></div></div><button type="button" aria-label="Pause rate scrolling" aria-pressed="false">Pause</button>';
    const nav = header.querySelector('.category-nav'); nav ? nav.before(strip) : header.append(strip);
    const track = strip.querySelector('.market-track'), button = strip.querySelector('button');
    button.onclick = () => { const paused = strip.classList.toggle('is-paused'); button.textContent = paused ? 'Play' : 'Pause'; button.setAttribute('aria-label', paused ? 'Resume rate scrolling' : 'Pause rate scrolling'); button.setAttribute('aria-pressed', String(paused)); };
    let busy = false, last = '';
    async function refresh() {
      if (busy || document.hidden) return; busy = true;
      try {
        let config; try { config = await load(); } catch { config = defaults(); }
        strip.hidden = !config.enabled; if (!config.enabled) return;
        let feed = null;
        if (config.items.some(x => x.enabled && x.mode === 'auto')) {
          try { const r = await fetch('/api/market-rates', { signal: AbortSignal.timeout(10000) }); if (r.ok) feed = await r.json(); } catch { /* Honest unavailable state below. */ }
        }
        const html = config.items.filter(x => x.enabled).map(item => {
          const q = quote(item, feed);
          const value = q.value == null ? 'Rate unavailable' : `${item.id === 'sensex' ? '' : '₹'}${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(q.value)} ${item.id === 'sensex' ? 'pts' : item.unit.replace('₹ / ', '/ ')}`;
          const time = q.time ? new Date(q.time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' IST' : '';
          return `<span class="market-item"><strong>${esc(item.label)}</strong><b>${esc(value)}</b><small>${esc(q.status)}${time ? ' · ' + esc(time) : ''}${q.source ? ' · ' + esc(q.source) : ''}${item.note ? ' · ' + esc(item.note) : ''}</small></span>`;
        }).join('');
        strip.hidden = !html;
        if (html !== last) { track.innerHTML = `<div class="market-group">${html}</div><div class="market-group" aria-hidden="true">${html}</div>`; last = html; }
        strip.style.setProperty('--market-duration', config.speed + 's');
      } finally { busy = false; }
    }
    await refresh(); setInterval(refresh, 60000); document.addEventListener('visibilitychange', refresh);
  }
  window.TriptiRates = { defaults, normalize, quote, load, esc, installStyles, initialize };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize); else initialize();
})();
