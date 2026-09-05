(function () {
  'use strict';
  async function initialize() {
    const rates = window.TriptiRates, api = window.TriptiSupabase; rates.installStyles();
    const button = document.createElement('button'); button.type = 'button'; button.dataset.adminPanel = 'rates'; button.textContent = '↔ Market rates'; document.querySelector('.admin-sidebar nav').append(button);
    const panel = document.createElement('section'); panel.id = 'admin-panel-rates'; panel.className = 'admin-panel'; panel.hidden = true;
    panel.innerHTML = '<h2>Market rate banner</h2><p>Manual rates are labelled Store rate. Automatic rates need a configured market-data feed. This banner does not change product or checkout prices.</p><p>Gold: 24K per 10 g · Silver: per kg · Diamond: indicative per carat · Sensex: index points. Add diamond quality and natural/lab-grown details in its note.</p><p role="status" class="form-status"></p><form class="admin-form"><label><input type="checkbox" name="enabled"> Show banner</label><label>Scroll duration (seconds)<input name="speed" type="number" min="20" max="100" required></label><div id="market-editors"></div><button class="button button-gold" type="submit">Save rates</button></form>';
    document.querySelector('#admin-main').append(panel);
    const form = panel.querySelector('form'), status = panel.querySelector('[role="status"]'); let current = rates.defaults();
    function render() {
      form.elements.enabled.checked = current.enabled; form.elements.speed.value = current.speed;
      panel.querySelector('#market-editors').innerHTML = current.items.map(x => `<fieldset class="market-editor-card"><legend>${rates.esc(x.label)}</legend><label><input type="checkbox" name="${x.id}-enabled" ${x.enabled ? 'checked' : ''}> Visible</label><label>Display name<input name="${x.id}-label" maxlength="40" value="${rates.esc(x.label)}" required></label><label>Mode<select name="${x.id}-mode"><option value="manual">Manual store rate</option>${x.id !== 'diamond' ? '<option value="auto">Automatic feed</option>' : ''}</select></label><label>Manual price (${rates.esc(x.unit)})<input name="${x.id}-value" type="number" min="0.01" step="0.01" value="${x.value ?? ''}"></label><label>Note / quality specification<input name="${x.id}-note" maxlength="100" value="${rates.esc(x.note)}"></label></fieldset>`).join('');
      current.items.forEach(x => { const mode = form.elements[x.id + '-mode'], value = form.elements[x.id + '-value']; mode.value = x.mode; const sync = () => { value.disabled = mode.value === 'auto'; }; mode.onchange = sync; sync(); });
    }
    try { current = await rates.load(); } catch { status.textContent = 'Database activation needed: run supabase/market-rates-upgrade.sql before saving.'; }
    render();
    form.onsubmit = async e => {
      e.preventDefault(); const submit = form.querySelector('[type="submit"]'); submit.disabled = true;
      try {
        const next = rates.normalize({ enabled: form.elements.enabled.checked, speed: form.elements.speed.value, items: current.items.map(x => ({ ...x, enabled: form.elements[x.id + '-enabled'].checked, mode: form.elements[x.id + '-mode'].value, label: form.elements[x.id + '-label'].value, value: form.elements[x.id + '-value'].value, note: form.elements[x.id + '-note'].value, updated_at: new Date().toISOString() })) });
        for (const item of next.items) if (item.enabled && item.mode === 'manual' && item.value == null) throw new Error('Enter a positive price for ' + item.label + ', or hide it.');
        await api.insert('market_ticker', { id: 'main', settings: next }, { upsert: true, onConflict: 'id' });
        current = next; status.textContent = 'Saved. Website visitors receive changes within 60 seconds. Automatic mode still requires the market feed.';
      } catch (error) { status.textContent = error.status === 404 ? 'Run the market-rates database migration first.' : error.message; }
      finally { submit.disabled = false; }
    };
  }
  window.TriptiRatesAdmin = { initialize };
})();
