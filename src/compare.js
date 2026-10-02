/* compare.js — saved design versions and the A/B comparison (the Compare workspace). Exposes window.Iterate for the report:
   list(), save(name), compareHTML(A, B), status(), signature(project). Versions are stored per site in localStorage
   'dms.variants.v1' (same key and shape as before), with the last saved/loaded version per site in 'dms.lastsave.v1'. */
window.Iterate = (function () {
  'use strict';
  let app = null, root = null, store = {}, last = {}, loaded = false, a = '', b = '', renaming = null, confirmDel = null;
  const esc = (v) => String(v == null ? '—' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const call = (k, fb, ...args) => (app && typeof app[k] === 'function' ? app[k](...args) : fb);
  const siteKey = () => (call('project', {}).site || {}).addr || 'custom';
  function read() { if (loaded) return; loaded = true; try { const s = JSON.parse(localStorage.getItem('dms.variants.v1') || '{}'); if (s && typeof s === 'object' && !Array.isArray(s)) store = s; } catch (e) { /* no storage */ } try { const l = JSON.parse(localStorage.getItem('dms.lastsave.v1') || '{}'); if (l && typeof l === 'object') last = l; } catch (e) { /* no storage */ } }
  function persist() { try { localStorage.setItem('dms.variants.v1', JSON.stringify(store)); localStorage.setItem('dms.lastsave.v1', JSON.stringify(last)); } catch (e) { call('toast', null, 'Browser storage is unavailable: versions last only for this session.'); } }
  function signature(p) { if (!p) return ''; return JSON.stringify({ s: p.site, b: p.blocks, r: p.ramps }); }
  function list() { read(); return clone(Array.isArray(store[siteKey()]) ? store[siteKey()] : []); }
  function status() { read(); const l = last[siteKey()]; const p = call('project', null); if (!l) return { state: 'never' }; return { state: l.sig === signature(p) ? 'saved' : 'changed', name: l.name, time: l.time }; }
  function save(name) {
    const p = call('project', null); if (!p) return null; read(); const key = siteKey(); if (!Array.isArray(store[key])) store[key] = [];
    const v = { id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7), name: String(name || '').trim() || `Version ${store[key].length + 1}`, time: new Date().toISOString(), site: clone(p.site), blocks: clone(p.blocks), ramps: clone(p.ramps), brief: clone(p.brief || null), param: clone(p.param || null), metrics: clone(call('metrics', {})), rows: clone(call('rows', [])) };
    try { const png = call('snapshot', null, '3d', 440, 300); v.thumbnail = typeof png === 'string' && png.startsWith('data:image/png') ? png : null; } catch (e) { v.thumbnail = null; }
    store[key].push(v); last[key] = { name: v.name, time: v.time, sig: signature(p) }; persist(); if (!a) a = v.id; else if (!b || b === a) b = v.id; render(); return clone(v);
  }
  function load(v) { const p = call('project', {}); const np = { ...clone(p), site: clone(v.site), blocks: clone(v.blocks), ramps: clone(v.ramps), brief: v.brief ? clone(v.brief) : p.brief, param: v.param ? clone(v.param) : undefined }; call('replaceProject', null, np, `Loaded ${v.name}`); last[siteKey()] = { name: v.name, time: v.time, sig: signature(np) }; persist(); render(); }
  const nextName = () => `Version ${list().length + 1}`;
  const when = (iso) => { try { const d = new Date(iso); return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); } catch (e) { return iso; } };

  /* ---------- comparison ---------- */
  const METRICS = [['fsr', 'Floor space ratio (FSR)', '', -1, 2], ['gfaAbove', 'Floor area above grade', 'm²', 0, 0], ['height', 'Height', 'm', 0, 1], ['storeys', 'Storeys above grade', '', 0, 0], ['plate', 'Largest tower plate', 'm²', -1, 0], ['homes', 'Homes (estimate)', '', 1, 0], ['stalls', 'Parking stalls', '', 0, 0], ['fail', 'Issues', '', -1, 0], ['review', 'Needs review', '', -1, 0], ['pass', 'Passed', '', 1, 0]];
  const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? Number(v.toFixed(d)).toLocaleString() : '—');
  const titleOf = (r) => String(r.title || '').split(' · ')[0], whereOf = (r) => String(r.title || '').split(' · ').slice(1).join(' · ');
  function diff(A, B) {
    const changed = [], same = [];
    for (const [k, label, unit, dir, d] of METRICS) { const x = A.metrics ? A.metrics[k] : null, y = B.metrics ? B.metrics[k] : null; const dx = typeof x === 'number' && typeof y === 'number' ? y - x : null; const row = { k, label, unit, dir, d, x, y, dx }; if (dx != null && Math.abs(dx) > Math.pow(10, -d) / 2) changed.push(row); else same.push(row); }
    const L = new Map((A.rows || []).map((r) => [r.id, r])), R = new Map((B.rows || []).map((r) => [r.id, r]));
    const resolved = [], added = [], still = [], gone = [];
    new Set([...L.keys(), ...R.keys()]).forEach((id) => { const x = L.get(id), y = R.get(id); const xf = x && x.verdict === 'fail', yf = y && y.verdict === 'fail';
      if (xf && !yf) (y ? resolved : gone).push([x, y]); else if (!xf && yf) added.push([x, y]); else if (xf && yf) still.push([x, y]); });
    return { changed, same, resolved, added, still, gone };
  }
  function compareHTML(A, B) {
    if (!A || !B) return '<p>Choose two saved versions.</p>'; if (A.id === B.id) return '<p>Choose two different versions.</p>';
    const D = diff(A, B);
    const metricRow = (m) => { const better = m.dx == null || !m.dir ? '' : m.dx * m.dir > 0 ? 'better' : 'worse'; return `<tr><th scope="row">${esc(m.label)}</th><td class="num">${num(m.x, m.d)}${m.unit ? ' ' + m.unit : ''}</td><td class="num">${num(m.y, m.d)}${m.unit ? ' ' + m.unit : ''}</td><td class="num ${better}">${m.dx == null ? '—' : (m.dx > 0 ? '+' : '') + num(m.dx, m.d)}${better ? ` <span class="sr">${better}</span>` : ''}</td></tr>`; };
    const checkRows = (rows) => rows.map(([x, y]) => `<li><b>${esc(titleOf(y || x))}</b>${whereOf(y || x) ? ` · ${esc(whereOf(y || x))}` : ''}<div class="cmpv">${x ? esc(x.value) : 'Not checked'} → ${y ? esc(y.value) : 'No longer applies'}</div></li>`).join('');
    let h = `<div class="cmp"><h4>${esc(A.name)} → ${esc(B.name)}</h4>`;
    if (window.Stack && window.Gen) { const site = B.site || A.site; h += `<div class="cmpstacks"><figure>${Gen.axon(A.blocks, A.site || site, 150, 110)}${Stack.svg(A.blocks, A.site || site, 150, 120, null)}<figcaption>A · ${esc(A.name)}</figcaption></figure><figure>${Gen.axon(B.blocks, site, 150, 110)}${Stack.svg(B.blocks, site, 150, 120, null)}<figcaption>B · ${esc(B.name)}</figcaption></figure></div>`;
      const TA = Model.totals({ blocks: A.blocks, ramps: A.ramps || [] }), TB = Model.totals({ blocks: B.blocks, ramps: B.ramps || [] }), uses = Model.USES.filter((u) => u !== 'core' && u !== 'parking' && ((TA.gfa[u] || 0) > 0 || (TB.gfa[u] || 0) > 0)), sa = uses.reduce((x, u) => x + (TA.gfa[u] || 0), 0) || 1, sb = uses.reduce((x, u) => x + (TB.gfa[u] || 0), 0) || 1, tgt = (B.brief && B.brief.mix) || (A.brief && A.brief.mix) || null;
      if (uses.length) h += `<table class="cmptable"><thead><tr><th>Program share</th><th>A</th><th>B</th>${tgt ? '<th>Brief</th>' : ''}</tr></thead><tbody>${uses.map((u) => `<tr><th scope="row">${esc(Model.USE_LABEL[u])}</th><td class="num">${Math.round((TA.gfa[u] || 0) / sa * 100)}%</td><td class="num">${Math.round((TB.gfa[u] || 0) / sb * 100)}%</td>${tgt ? `<td class="num">${tgt[u] == null ? '—' : Math.round(tgt[u]) + '%'}</td>` : ''}</tr>`).join('')}</tbody></table>`;
      const why = []; const dh = (B.metrics && B.metrics.height) - (A.metrics && A.metrics.height), dp = (B.metrics && B.metrics.plate) - (A.metrics && A.metrics.plate), df = (B.metrics && B.metrics.fsr) - (A.metrics && A.metrics.fsr);
      if (Number.isFinite(dh) && Math.abs(dh) > 0.5) why.push(`Height ${dh > 0 ? 'rises' : 'falls'} by ${num(Math.abs(dh), 1)} m${Number.isFinite(dp) && Math.abs(dp) > 20 ? `, with the largest tower plate ${dp > 0 ? 'up' : 'down'} ${num(Math.abs(dp), 0)} m²: a ${dp * dh < 0 ? 'wider plate buys height' : 'bigger plate and more height together mean more floor area'}` : ''}.`);
      if (Number.isFinite(df) && Math.abs(df) > 0.02) why.push(`Density moves from FSR ${num(A.metrics.fsr, 2)} to ${num(B.metrics.fsr, 2)}.`);
      if (A.param && B.param && (A.param.key !== B.param.key)) why.push(`The typology changed from ${window.Gen && Gen.TYPES[A.param.key] ? Gen.TYPES[A.param.key].name : A.param.key} to ${window.Gen && Gen.TYPES[B.param.key] ? Gen.TYPES[B.param.key].name : B.param.key}.`);
      if (why.length) h += `<p class="hint">${esc(why.join(' '))}</p>`; }
    h += D.changed.length ? `<table class="cmptable"><thead><tr><th>Changed metric</th><th>${esc(A.name)}</th><th>${esc(B.name)}</th><th>Change</th></tr></thead><tbody>${D.changed.map(metricRow).join('')}</tbody></table>` : '<p>No metric changed between these versions.</p>';
    h += `<h5 class="st-pass">✓ Resolved issues (${D.resolved.length + D.gone.length})</h5>${D.resolved.length + D.gone.length ? `<ul class="cmplist">${checkRows([...D.resolved, ...D.gone])}</ul>` : '<p class="muted">None.</p>'}`;
    h += `<h5 class="st-fail">✕ New issues (${D.added.length})</h5>${D.added.length ? `<ul class="cmplist">${checkRows(D.added)}</ul>` : '<p class="muted">None.</p>'}`;
    h += `<details><summary>Still open in both (${D.still.length})</summary>${D.still.length ? `<ul class="cmplist">${checkRows(D.still)}</ul>` : '<p class="muted">None.</p>'}</details>`;
    if (D.same.length) h += `<details><summary>Unchanged metrics (${D.same.length})</summary><table class="cmptable"><tbody>${D.same.map(metricRow).join('')}</tbody></table></details>`;
    return h + '</div>';
  }

  /* ---------- the workspace ---------- */
  function render() {
    if (!root) return; const vs = list(), st = status();
    if (!vs.some((v) => v.id === a)) a = vs[0] ? vs[0].id : ''; if (!vs.some((v) => v.id === b) || b === a) b = (vs.find((v) => v.id !== a) || {}).id || '';
    const card = (v) => { const isLast = st.name === v.name && st.state === 'saved'; return `<article class="vcard${isLast ? ' current' : ''}" data-id="${esc(v.id)}">${v.thumbnail ? `<img src="${esc(v.thumbnail)}" alt="">` : '<div class="nothumb">No preview</div>'}<div class="vbody">${renaming === v.id ? `<input class="vrename" value="${esc(v.name)}" aria-label="Version name"><div class="vbtns"><button class="primary" data-act="rename-ok">Save name</button><button data-act="rename-cancel">Cancel</button></div>` : `<div class="vname">${esc(v.name)}${isLast ? ' <span class="pillsm">matches current</span>' : ''}</div><div class="vmeta">${esc(when(v.time))}</div><div class="vmeta">FSR ${num(v.metrics && v.metrics.fsr, 2)} · ${num(v.metrics && v.metrics.height, 1)} m · ${num(v.metrics && v.metrics.storeys, 0)} storeys</div><div class="vmeta"><span class="st-fail">✕ ${num(v.metrics && v.metrics.fail, 0)} issues</span> · <span class="st-review">! ${num(v.metrics && v.metrics.review, 0)} to review</span></div>${confirmDel === v.id ? `<div class="vbtns"><span>Delete this version?</span><button class="danger" data-act="del-ok">Delete</button><button data-act="del-cancel">Keep</button></div>` : `<div class="vbtns"><button data-act="load">Load</button><button data-act="rename">Rename</button><button data-act="delete">Delete</button></div>`}`}</div></article>`; };
    const opts = (sel) => vs.map((v) => `<option value="${esc(v.id)}" ${v.id === sel ? 'selected' : ''}>${esc(v.name)}</option>`).join('');
    root.innerHTML = `<section class="sec"><h3 class="sechead">Save this design</h3><p class="hint">${st.state === 'never' ? 'Nothing saved for this site yet.' : st.state === 'saved' ? `The current design is saved as <b>${esc(st.name)}</b>.` : `Changed since <b>${esc(st.name)}</b>.`}</p><div class="inline"><input id="verName" placeholder="${esc(nextName())}" aria-label="Version name"><button class="primary" id="verSave">Save version</button></div></section>
      <section class="sec"><h3 class="sechead">Compare two versions</h3>${vs.length < 2 ? `<p class="hint">${vs.length ? 'One version is saved. Change the design, then save a second version to compare them.' : 'Save two versions of the design to compare them.'}</p><button id="saveAnother">${vs.length ? 'Save another version' : 'Save this version'}</button>` : `<div class="row2"><label>Version A<select id="cmpA">${opts(a)}</select></label><label>Version B<select id="cmpB">${opts(b)}</select></label></div>${compareHTML(vs.find((v) => v.id === a), vs.find((v) => v.id === b))}`}</section>
      <section class="sec"><h3 class="sechead">Saved versions (${vs.length})</h3>${vs.length ? `<div class="vlist">${vs.slice().reverse().map(card).join('')}</div>` : '<p class="hint">Saved versions appear here with a preview.</p>'}</section>`;
    const nameEl = root.querySelector('#verName'); root.querySelector('#verSave').onclick = () => { const v = save(nameEl.value); if (v) call('toast', null, `Saved ${v.name}`); };
    nameEl.onkeydown = (e) => { if (e.key === 'Enter') root.querySelector('#verSave').click(); };
    const another = root.querySelector('#saveAnother'); if (another) another.onclick = () => { nameEl.focus(); nameEl.scrollIntoView({ block: 'nearest' }); };
    const sa = root.querySelector('#cmpA'), sb = root.querySelector('#cmpB'); if (sa) sa.onchange = () => { a = sa.value; if (b === a) b = (vs.find((v) => v.id !== a) || {}).id || ''; render(); }; if (sb) sb.onchange = () => { b = sb.value; if (b === a) a = (vs.find((v) => v.id !== b) || {}).id || ''; render(); };
    root.querySelectorAll('.vcard').forEach((el) => { const id = el.dataset.id, v = vs.find((x) => x.id === id); el.querySelectorAll('[data-act]').forEach((btn) => (btn.onclick = () => { const k = btn.dataset.act, arr = store[siteKey()] || [];
      if (k === 'load') load(v); else if (k === 'rename') { renaming = id; render(); const i = root.querySelector('.vrename'); if (i) { i.focus(); i.select(); } } else if (k === 'rename-cancel') { renaming = null; render(); }
      else if (k === 'rename-ok') { const i = el.querySelector('.vrename'); const nm = i && i.value.trim(); if (nm) { const t = arr.find((x) => x.id === id); if (t) { if (last[siteKey()] && last[siteKey()].name === t.name) last[siteKey()].name = nm; t.name = nm; } persist(); } renaming = null; render(); }
      else if (k === 'delete') { confirmDel = id; render(); } else if (k === 'del-cancel') { confirmDel = null; render(); } else if (k === 'del-ok') { store[siteKey()] = arr.filter((x) => x.id !== id); confirmDel = null; persist(); render(); } }));
      const ri = el.querySelector('.vrename'); if (ri) ri.onkeydown = (e) => { if (e.key === 'Enter') el.querySelector('[data-act="rename-ok"]').click(); if (e.key === 'Escape') el.querySelector('[data-act="rename-cancel"]').click(); }; });
    if (typeof app.onVersions === 'function') app.onVersions();
  }
  function mount(el, App) { app = App; root = el; read(); render(); if (typeof App.on === 'function') App.on('change', () => { if (!renaming) render(); }); }
  return { mount, list, save, status, signature, compareHTML, render };
})();
