/* brief.js — the design brief: site targets and the program mix that the generator works from and the metrics compare against.
   project.brief = { gfa, heightTarget, plate, parkingLevels, circulation, f2f{use}, mix{use: %}, order[], locks{} }.
   Percentages are shares of gross floor area above grade (circulation and cores inside the blocks included; parking and
   below-grade space excluded and handled as explicit levels). API: Brief.ensure(project), Brief.areas(project, T), Brief.mount(el, App). */
window.Brief = (function () {
  'use strict';
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v, d = 0) => Number(v).toLocaleString('en-CA', { maximumFractionDigits: d, minimumFractionDigits: d });
  const USES = ['residential', 'hotel', 'office', 'retail', 'restaurant', 'amenity'];
  const DEF = () => ({ gfa: 25000, heightTarget: null, plate: 650, parkingLevels: 2, circulation: 'included', f2f: { residential: 3.0, hotel: 3.3, office: 3.9, retail: 5.0, restaurant: 4.5, amenity: 3.6 }, mix: { residential: 60, hotel: 0, office: 20, retail: 8, restaurant: 4, amenity: 8 }, order: ['retail', 'restaurant', 'amenity', 'office', 'hotel', 'residential'], locks: { height: false, gfa: false }, assumptions: ['Program shares are shares of gross floor area above grade, measured to the block faces: circulation, cores and service rooms inside each block are included.', 'Parking is not part of the mix: it is an explicit number of levels below grade, so it is never double-counted against the area budget.', 'Floor-to-floor heights are typical downtown values; change them per use before generating.'] });
  function ensure(project) {
    if (project.brief && project.brief.mix) { const b = project.brief, d = DEF(); for (const k of Object.keys(d)) if (b[k] === undefined) b[k] = d[k]; for (const u of USES) { if (b.mix[u] == null) b.mix[u] = 0; if (b.f2f[u] == null) b.f2f[u] = d.f2f[u]; } return b; }
    const b = DEF(); // derive a first brief from whatever is on the site
    const T = window.Model ? Model.totals(project) : null;
    if (T && T.gfaAbove > 500) { b.gfa = Math.round(T.gfaAbove / 100) * 100; const tot = USES.reduce((a, u) => a + (T.gfa[u] || 0), 0) || 1; for (const u of USES) b.mix[u] = Math.round((T.gfa[u] || 0) / tot * 100); const diff = 100 - USES.reduce((a, u) => a + b.mix[u], 0); const big = USES.slice().sort((p, q) => b.mix[q] - b.mix[p])[0]; b.mix[big] += diff;
      const tw = project.blocks.filter((x) => x.use !== 'core' && x.use !== 'parking' && x.z0 > -0.01).sort((p, q) => Model.blockTop(q) - Model.blockTop(p))[0]; if (tw) b.plate = Math.round(tw.w * tw.d / 10) * 10; const pk = project.blocks.filter((x) => x.use === 'parking' && x.z0 < -0.01); if (pk.length) b.parkingLevels = Math.max(...pk.map((x) => x.floors)); }
    project.brief = b; return b;
  }
  const total = (b) => USES.reduce((a, u) => a + (Number(b.mix[u]) || 0), 0);
  function normalize(b) { const t = total(b); if (!t) return; for (const u of USES) b.mix[u] = Math.round((Number(b.mix[u]) || 0) / t * 1000) / 10; const d = Math.round((100 - total(b)) * 10) / 10; const big = USES.slice().sort((p, q) => b.mix[q] - b.mix[p])[0]; b.mix[big] = Math.round((b.mix[big] + d) * 10) / 10; }
  /* target and actual areas by use (actual = gross floor area above grade of non-parking, non-core blocks) */
  function areas(project, T) {
    const b = ensure(project); T = T || Model.totals(project); const actualTotal = USES.reduce((a, u) => a + (T.gfa[u] || 0), 0) - (T.gfaBelow ? 0 : 0);
    const by = {}; for (const u of USES) { const pct = Number(b.mix[u]) || 0, target = b.gfa * pct / 100, actual = T.gfa[u] || 0; by[u] = { pct, target, actual, actualPct: actualTotal ? actual / actualTotal * 100 : 0, delta: actual - target }; }
    return { gfaTarget: b.gfa, actualTotal, by, total: total(b), ok: Math.abs(total(b) - 100) < 0.05 };
  }
  let app = null, host = null;
  function render() {
    if (!host) return; const p = app.project(), b = ensure(p), env = app.envelope ? app.envelope() : {}, lim = app.limits ? app.limits() : {}, T = Model.totals(p), A = areas(p, T), tot = A.total, ok = A.ok;
    const useCol = (u) => (window.Views ? Views.useCol(u) : '#ccc');
    const num = (k, label, v, step, min, unit, note) => `<label>${label}<span class="unit"><input type="number" data-bk="${k}" step="${step}" min="${min}" value="${v == null ? '' : v}" ${note ? `placeholder="${esc(note)}"` : ''}>${unit ? `<span>${unit}</span>` : ''}</span></label>`;
    const regH = env.max || env.basic || null, hv = app.prov ? app.prov('heightArea') : 'assumption';
    const targetHTML = `<div class="row2">${num('gfa', 'Target gross floor area', b.gfa, 100, 500, 'm²')}${num('plate', 'Preferred tower floorplate', b.plate, 10, 200, 'm²')}</div>
      <div class="row2">${num('heightTarget', 'Design height target', b.heightTarget, 1, 10, 'm', regH ? `limit ${fmt(regH, 1)}` : 'none')}${num('parkingLevels', 'Parking levels below grade', b.parkingLevels, 1, 0, '')}</div>
      <div class="brow2"><span class="prov assumption">Design target</span> your numbers above · <span class="prov ${hv}">${hv === 'verify' ? 'Needs verification' : hv === 'confirmed' || hv === 'derived' ? 'Regulatory limit' : 'Assumed limit'}</span> ${regH ? `ODP height ${fmt(env.basic, 1)} m basic${env.max ? `, Board may allow ${fmt(env.max, 1)} m` : ''}` : 'no numeric height limit set'}${lim.maxTop && lim.maxTop !== regH ? ` · view cone ${fmt(lim.maxTop, 1)} m` : ''}</div>
      <h4 class="subhead">Typical floor-to-floor by use</h4><div class="f2fgrid">${USES.map((u) => `<label><span><i class="sw" style="background:${useCol(u)}"></i>${Model.USE_LABEL[u]}</span><span class="unit"><input type="number" data-bf="${u}" step="0.05" min="2.4" max="8" value="${b.f2f[u]}"><span>m</span></span></label>`).join('')}</div>
      <details class="prec"><summary>Assumptions</summary><ul class="mlist">${b.assumptions.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></details>`;
    const mixHTML = `<div class="mixtot ${ok ? 'ok' : 'bad'}"><b>${fmt(tot, tot % 1 ? 1 : 0)}%</b><span>${ok ? 'adds to 100% · ready to generate' : tot > 100 ? `${fmt(tot - 100, 1)}% over 100%` : `${fmt(100 - tot, 1)}% short of 100%`}</span>${ok ? '' : '<button id="mixNorm" class="small">Normalize to 100%</button>'}</div>
      ${USES.map((u) => { const r = A.by[u]; return `<div class="mixrow"><div class="mixhead"><span><i class="sw" style="background:${useCol(u)}"></i>${Model.USE_LABEL[u]}</span><span class="mono">${fmt(r.target)} m²${r.actual ? ` <span class="muted">· now ${fmt(r.actual)}</span>` : ''}</span></div><div class="mixctl"><input type="range" data-bm="${u}" min="0" max="100" step="1" value="${b.mix[u]}" aria-label="${Model.USE_LABEL[u]} share"><input type="number" data-bmn="${u}" min="0" max="100" step="0.5" value="${b.mix[u]}" aria-label="${Model.USE_LABEL[u]} percent"><span class="u">%</span></div></div>`; }).join('')}
      <p class="hint" style="margin-top:8px">Shares are of gross floor area above grade (${fmt(b.gfa)} m²), including circulation and cores inside the blocks. Parking (${b.parkingLevels} level${b.parkingLevels === 1 ? '' : 's'} below grade) and support space in the garage are outside this budget.</p>`;
    host.target.innerHTML = targetHTML; host.mix.innerHTML = mixHTML;
    const set = (fn, live) => app.setBrief(fn, live);
    const bk = (el, live) => set((B) => { const v = el.value === '' ? null : Number(el.value); if (el.dataset.bk === 'heightTarget') B.heightTarget = v; else if (v != null && Number.isFinite(v) && v >= Number(el.min || 0)) B[el.dataset.bk] = v; }, live);
    host.target.querySelectorAll('[data-bk]').forEach((el) => { el.oninput = () => bk(el, true); el.onchange = () => bk(el, false); });
    host.target.querySelectorAll('[data-bf]').forEach((el) => { const f = (live) => set((B) => { B.f2f[el.dataset.bf] = Math.max(2.4, Number(el.value) || 3); }, live); el.oninput = () => f(true); el.onchange = () => f(false); });
    host.mix.querySelectorAll('[data-bm]').forEach((el) => { const u = el.dataset.bm, n = host.mix.querySelector(`[data-bmn="${u}"]`); el.oninput = () => { if (n) n.value = el.value; liveTotal(); set((B) => { B.mix[u] = Number(el.value); }, true); }; el.onchange = () => set((B) => { B.mix[u] = Number(el.value); }); });
    host.mix.querySelectorAll('[data-bmn]').forEach((el) => { const f = (live) => set((B) => { B.mix[el.dataset.bmn] = Math.max(0, Math.min(100, Number(el.value) || 0)); }, live); el.oninput = () => { const r = host.mix.querySelector(`[data-bm="${el.dataset.bmn}"]`); if (r) r.value = el.value; liveTotal(); f(true); }; el.onchange = () => f(false); });
    const nb = host.mix.querySelector('#mixNorm'); if (nb) nb.onclick = () => set((B) => normalize(B));
    function liveTotal() { const t = total(b), el = host.mix.querySelector('.mixtot'); if (!el) return; el.className = 'mixtot ' + (Math.abs(t - 100) < 0.05 ? 'ok' : 'bad'); el.querySelector('b').textContent = fmt(t, t % 1 ? 1 : 0) + '%'; }
  }
  function mount(els, App) { app = App; host = els; render(); if (App.on) App.on('change', render); }
  return { USES, ensure, areas, normalize, total, mount, render, DEF };
})();
