/* massing.js — the Massing tab, laid out like the old Downtown Tower Check's step 3: choose how to start (from scratch, a general
   typology, a case study, or a Rhino file whose layers become programs), set its parameters, then Confirm. Nothing changes the
   model until Confirm, which replaces the blocks in one undo step. Typologies and case studies come from typo.js; the uploaded
   file is read and sliced by form.js. API: Massing.mount(el, App). */
window.Massing = (function () {
  'use strict';
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v, d = 0) => Number(v).toLocaleString('en-CA', { maximumFractionDigits: d, minimumFractionDigits: d });
  /* the old tool's names and descriptions for the same seven typologies */
  const INFO = {
    point: { name: 'Point tower on a podium', tag: 'the downtown default since the 1990s', desc: 'A slim residential tower on a 3–4 storey podium of retail and townhouses that holds the street wall. The podium gives the street its edge; the tower is pulled in so light and views pass between towers. What the checks tend to catch: the tower plate against the floor-plate bulletin, daylight to the podium homes behind the tower, and separation to a tower next door.' },
    twin: { name: 'Two towers on a shared podium', tag: 'large or corner sites', desc: 'Two slim towers at the ends of one podium, kept apart so windows on the facing walls still get their daylight. The gap matters more than the plates: other Vancouver tower guidelines use 80 ft (24.4 m) between towers. On a narrow site the towers shrink to keep the gap.' },
    slab: { name: 'Slab', tag: 'mid-century downtown, West End', desc: 'One long, thin bar with a double-loaded corridor, every home facing front or back. The long faces see the street and the lane, the short ends see the neighbours. A slab is a big plate, and its shadow reaches further than a point tower’s at the same height.' },
    court: { name: 'Courtyard block', tag: 'mid-rise, perimeter form', desc: 'Bars along the property lines around an open court, 6–10 storeys. Needs a site about 45 m each way for a full ring; smaller sites get a U or a single bar. Daylight to the inner faces is the check to watch: the court has to be wide enough for the 50° fan.' },
    office: { name: 'Office tower on a retail podium', tag: 'the Central Business District type', desc: 'A large-plate office tower, 1,500–2,500 m² with a 4 m floor-to-floor, on a retail base. Office plates are not covered by the residential floor-plate bulletin, so watch the office floor-area cap of the ODP area, retail continuity, and the shadow such a wide tower throws on any park within reach.' },
    wall: { name: 'Street-wall mid-rise', tag: 'height areas 1–3, Granville', desc: 'No tower: retail at grade with five or six storeys straight up on the property line. The work here is density and retail continuity, plus daylight at the rear where the building meets the lane.' },
    step: { name: 'Stepped tower', tag: 'setbacks that shrink the plate as it rises', desc: 'Three stacked plates, each smaller than the one below. The steps buy daylight and sky for the neighbours and keep the top slender; the tower-plate check reports the widest band.' },
  };
  const ICON = {
    scratch: '<rect x="4" y="4" width="16" height="16" rx="1" stroke-dasharray="3 2"/><path d="M12 8v8M8 12h8"/>',
    type: '<rect x="3" y="12" width="5" height="9"/><rect x="9.5" y="4" width="5" height="17"/><rect x="16" y="9" width="5" height="12"/>',
    case: '<path d="M3 21h18M5 21V9h5v12M10 21V4h5l0 17M15 21v-8h4v8"/>',
    upload: '<path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 14v6h14v-6"/>',
  };
  const icon = (k) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;
  const GUESS = [[/core|stair|lift|elev|shaft/i, 'core'], [/park|garage|stall/i, 'parking'], [/office|work|comm(?!un)/i, 'office'], [/restau|f&b|food|dining|cafe/i, 'restaurant'], [/retail|shop|cru|store|mercant/i, 'retail'], [/amenit|gym|lounge|commun/i, 'amenity'], [/resid|home|apart|tower|unit|condo|rental|dwell|podium/i, 'residential']];
  const guessUse = (name) => { for (const [re, u] of GUESS) if (re.test(name || '')) return u; return 'residential'; };
  let app = null, root = null, mode = (() => { try { return localStorage.getItem('dms.massmode') || 'type'; } catch (e) { return 'type'; } })(), typeKey = 'point', caseId = null, vals = null, upload = null, busy = false, rnd = null;
  const project = () => app.project();
  const T = () => Typo.TYPES.find((t) => t.key === typeKey), C = () => Typo.CASES.find((c) => c.id === caseId) || Typo.CASES[0];
  const defaults = (key) => Object.fromEntries(Typo.TYPES.find((t) => t.key === key).params.map((p) => [p.key, p.def]));
  const label = () => (mode === 'scratch' ? 'From scratch' : mode === 'type' ? 'Typology with programming' : mode === 'case' ? 'Existing building' : mode === 'random' ? 'Randomized typical tower' : 'Rhino file');
  function setMode(m) { mode = m; try { localStorage.setItem('dms.massmode', m); } catch (e) { /* */ } render(); }

  /* ---------- the uploaded file: one block per layer ---------- */
  async function readFile(file) {
    busy = true; render();
    try {
      const meshes = await Form.readFile(file), groups = {};
      for (const m of meshes) (groups[m.layerName || 'model'] = groups[m.layerName || 'model'] || []).push(m);
      let zmin = Infinity; for (const m of meshes) for (let i = 2; i < m.v.length; i += 3) zmin = Math.min(zmin, m.v[i]);
      const layers = Object.entries(groups).map(([name, ms]) => { let U = null, err = null; try { U = Form.voxelize(ms); } catch (e) { err = e.message; } return { name, n: ms.length, use: guessUse(name), U, err }; });
      upload = { name: file.name, layers, grade: zmin < -0.5 ? 0 : zmin };
    } catch (e) { upload = { name: file.name, error: e.message || String(e) }; }
    busy = false; render();
  }
  function uploadBlocks() {
    const p = project(), s = p.site, L = upload.layers.filter((l) => l.U && l.use !== 'skip'), out = [];
    // where to put the model: keep its coordinates if they fall on the site box, otherwise centre it on the site
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; const centre = (l) => { const U = l.U; return [U.origin[0] + U.x0 + (U.f0[0] + U.ext.w / 2) * U.cell, U.origin[1] + U.y0 + (U.f0[1] + U.ext.d / 2) * U.cell]; };
    for (const l of L) { const [cx, cy] = centre(l); x0 = Math.min(x0, cx - l.U.ext.w / 2); x1 = Math.max(x1, cx + l.U.ext.w / 2); y0 = Math.min(y0, cy - l.U.ext.d / 2); y1 = Math.max(y1, cy + l.U.ext.d / 2); }
    const onSite = x0 >= -2 && y0 >= -2 && x1 <= s.w + 2 && y1 <= s.d + 2, dx = onSite ? 0 : s.w / 2 - (x0 + x1) / 2, dy = onSite ? 0 : s.d / 2 - (y0 + y1) / 2;
    for (const l of L) { const U = l.U, [cx, cy] = centre(l), w = Model.snap(U.ext.w), d = Model.snap(U.ext.d), z0 = Math.round((U.origin[2] - upload.grade) * 100) / 100, f2f = Model.USE_F2F[l.use] || 3;
      const name = l.name.split('::').pop(), base = { use: l.use, name, x: Model.snap(cx + dx - w / 2), y: Model.snap(cy + dy - d / 2), w, d, z0 };
      if (l.use === 'core') { out.push(Model.block(Object.assign(base, { floors: 1, f2f: Math.max(3, Math.round(U.top * 10) / 10), stairs: 2 }))); continue; }
      const floors = Math.max(1, Math.round(U.top / f2f)), boxy = U.footprint >= 0.96 * U.ext.w * U.ext.d && U.ints.every((iv) => !iv || (iv.length === 2 && iv[0] < 0.6 && iv[1] > U.top - 0.6));
      const b = Model.block(Object.assign(base, { floors, f2f }));
      if (!boxy && l.use !== 'parking') b.form = Object.assign(Form.newForm('upload'), { upload: Object.assign({}, U, { name: `${upload.name} · ${name}` }) });
      out.push(b); }
    return { blocks: out, ramps: [], placed: onSite ? 'kept at its coordinates' : 'centred on the site' };
  }

  /* ---------- randomized typical tower: a podium-and-tower program drawn at random inside the site's rules ----------
     Candidates are built with the typology engine from random parameters, then run through the full rule set (Rules.evaluate via
     App.evaluateProject). The first candidate with no failing check is kept; otherwise the one with the fewest failures. */
  const programOf = (blocks) => blocks.filter((b) => b.use !== 'core').slice().sort((a, b) => a.z0 - b.z0).map((b) => `${b.name}: ${b.floors} × ${b.f2f.toFixed(2)} m ${Model.USE_LABEL[b.use].toLowerCase()}${b.z0 < -0.01 ? ' below grade' : ''}`);
  function randomize() {
    const p = project(), s = p.site, D = (CODES.odp.density[s.densityArea] || {}), dwell = D.dwell !== false, m = app.metrics ? app.metrics() : {}, H = Number.isFinite(m.heightMax) ? m.heightMax : null;
    const R = (a, b) => a + Math.random() * (b - a), Ri = (a, b) => Math.round(R(a, b)), pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const wide = Math.max(s.w, s.d) >= 60; let best = null;
    for (let k = 0; k < 16; k++) {
      const key = dwell ? pick(wide ? ['point', 'point', 'step', 'twin'] : ['point', 'point', 'step']) : pick(['office', 'office', 'wall']);
      let v = defaults(key); Object.assign(v, { park: Ri(1, 3), retailH: +R(4.5, 6).toFixed(1), retailD: Ri(12, Math.min(24, Math.max(12, s.d - 6))), along: +R(-0.4, 0.4).toFixed(2), depthPos: +R(-0.3, 0.5).toFixed(2), aspect: +R(0.8, 1.4).toFixed(2) });
      if (v.pod != null) v.pod = Ri(2, 4); if (v.podUse !== undefined) v.podUse = pick(['office', 'amenity', 'residential']); if (v.plate != null) v.plate = key === 'office' ? Ri(1200, 2000) : Ri(520, 600); if (v.fh != null) v.fh = key === 'office' ? 3.9 : +R(2.9, 3.2).toFixed(2);
      const cnt = ['point', 'twin'].includes(key) ? 'tw' : 'n', minN = key === 'step' ? 3 : 1; if (H) { v = Typo.fitToHeight(key, v, s, H); v[cnt] = Math.max(minN, Math.round(v[cnt] * R(0.8, 1))); }
      let res; try { res = T2(key).build(s, v); } catch (e) { continue; }
      // trim storeys until the floor space ratio fits the ODP area (density is the one hard regulation here)
      if (D.fsr != null) { let guard = 0; while (guard++ < 120) { const mp = window.Form ? Form.expand(Object.assign(Model.clone(p), { blocks: res.blocks, ramps: res.ramps || [] })) : { blocks: res.blocks }; if (Rules.density(mp).fsr <= D.fsr + 1e-9) break; if (v.pod != null && v.pod > 1) v.pod -= 1; else if (v[cnt] > minN) v[cnt] -= 1; else break; try { res = T2(key).build(s, v); } catch (e) { break; } } }
      const cand = Object.assign(Model.clone(p), { blocks: res.blocks, ramps: res.ramps || [], site: Model.clone(s) });
      const ev = app.evaluateProject ? app.evaluateProject(cand) : { fails: 0, rows: [] };
      const c = { key, vals: v, res, fails: ev.fails, failTitles: ev.rows.filter((r) => r.verdict === 'fail').map((r) => r.title) };
      if (!best || c.fails < best.fails) best = c; if (c.fails === 0) break;
    }
    rnd = best; render();
  }
  const T2 = (key) => Typo.TYPES.find((t) => t.key === key);
  /* ---------- render ---------- */
  /* parametric: once a typology is confirmed, the project keeps its parameters and every change regenerates the model live */
  const linked = () => { const q = project().param; return !!(q && q.mode === 'type' && q.key === typeKey); };
  let raf = 0;
  function live(isCommit) { const p = project(), r = T().build(p.site, vals), param = { mode: 'type', key: typeKey, vals: Object.assign({}, vals) }; if (isCommit) { cancelAnimationFrame(raf); raf = 0; app.applyMassing(r, true, param); return; } if (raf) return; raf = requestAnimationFrame(() => { raf = 0; app.applyMassing(T().build(project().site, vals), false, { mode: 'type', key: typeKey, vals: Object.assign({}, vals) }); }); }
  function prow(p) {
    const m = p.label.match(/ \((m²|m)\)$/), lab = esc(p.label.replace(/ \((m²|m)\)$/, '').replace(/ \(−1 to 1\)$/, '')), unit = m ? ` <span class="u">${m[1]}</span>` : '';
    if (p.options || p.key === 'use') { const opts = p.options || [['residential', 'Residential'], ['office', 'Office']]; return `<label class="mrow"><span>${lab}</span><select data-p="${p.key}">${opts.map(([v, l]) => `<option value="${v}" ${vals[p.key] === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`; }
    return `<label class="mrow"><span>${lab}${unit}</span><span class="mctl"><input type="range" data-p="${p.key}" min="${p.min}" max="${p.max}" step="${p.step}" value="${vals[p.key]}" aria-label="${lab}"><input type="number" data-pn="${p.key}" min="${p.min}" max="${p.max}" step="${p.step}" value="${vals[p.key]}" aria-label="${lab}"></span></label>`; }
  function paramGrid(t) { const own = t.params.filter((p) => p.group !== 'base'), base = t.params.filter((p) => p.group === 'base'); return own.map(prow).join('') + (base.length ? `<div class="mgroup">Site and base</div>${base.map(prow).join('')}` : ''); }
  function linkNote() { const q = project().param; if (linked()) return q.edited ? '<div class="mlink warn">Linked, but some blocks were edited by hand. Changing a parameter regenerates them; tower forms and locked blocks carry over by name.</div>' : '<div class="mlink on">Linked: every change below updates the model now. One undo step per change.</div>'; return '<div class="mlink off">Confirm draws this typology. After that its parameters stay linked and update the model as you change them.</div>'; }
  function what() {
    const p = project(), n = p.blocks.length, where = p.site.addr || 'this site', undo = '<kbd>Ctrl</kbd>+<kbd>Z</kbd> brings them back';
    const lead = n ? `Replaces the ${n} block${n === 1 ? '' : 's'} on ${esc(where)}` : `Draws on ${esc(where)}`;
    if (mode === 'scratch') return n ? `Clears the ${n} block${n === 1 ? '' : 's'} on ${esc(where)} · ${undo}` : 'The site is already empty.';
    if (mode === 'type') return linked() ? `This massing follows the parameters above. Confirm regenerates it from scratch · ${undo}` : `${lead} with ${esc((INFO[typeKey] || {}).name || T().name).toLowerCase()}${n ? ' · ' + undo : ''}`;
    if (mode === 'random') return rnd ? `${lead} with the randomized ${esc((INFO[rnd.key] || T2(rnd.key)).name).toLowerCase()} below${n ? ' · ' + undo : ''}` : 'Press Randomize first.';
    if (mode === 'case') return `${lead} with a ${esc(C().name)} proxy${n ? ' · ' + undo : ''}`;
    if (!upload || upload.error || !upload.layers) return 'Choose a .3dm file first.';
    const k = upload.layers.filter((l) => l.U && l.use !== 'skip').length; return `${lead} with ${k} block${k === 1 ? '' : 's'} from ${esc(upload.name)}${n ? ' · ' + undo : ''}`;
  }
  function pane() {
    if (mode === 'scratch') return '<p class="hint">An empty site. Add blocks one at a time under “Add a block”, then shape them.</p>';
    if (mode === 'random') { const site = project().site, D = CODES.odp.density[site.densityArea] || {}, env = app.envelope ? app.envelope() : {};
      let h = `<p class="mdesc">A typical downtown tower program drawn at random: parking below grade, street retail, a podium of office, amenity or homes, a residential (or office) tower and an automatic core. Each draw is built by the typology engine, then run through every check in this tool: ODP density (FSR ${D.fsr != null ? fmt(D.fsr, 2) : '—'}), height (${env.basic ? fmt(env.basic, 1) + ' m basic' : '—'}${env.max ? `, ${fmt(env.max, 1)} m maximum` : ''}), tower floor plate and separation, retail continuity, daylight, guideline setbacks, VBBL egress and construction, and the Parking By-law. Up to sixteen draws are tried, each trimmed to the floor space ratio first; the first with no failing check is kept, otherwise the one with the fewest.</p>
        <button class="wide primary" id="mRnd">${rnd ? 'Randomize again' : 'Randomize a compliant program'}</button>`;
      if (rnd) h += `<h5>${esc((INFO[rnd.key] || T2(rnd.key)).name)} · ${rnd.fails === 0 ? '<span style="color:var(--pass)">passes every check</span>' : `<span class="st-fail">${rnd.fails} check${rnd.fails === 1 ? '' : 's'} still fail: ${esc(rnd.failTitles.slice(0, 3).join(', '))}</span>`}</h5><ul class="mlist">${programOf(rnd.res.blocks).map((x) => `<li>${esc(x)}</li>`).join('')}</ul><p class="hint">Confirm draws it; its typology parameters then stay linked, so the sliders under “Typology with programming” keep editing it.</p>`;
      return h; }
    if (mode === 'type') { const t = T(), I = INFO[typeKey] || { name: t.name, desc: t.blurb };
      return `<label class="mlabel">Typology<select id="mType">${Typo.TYPES.map((x) => `<option value="${x.key}" ${x.key === typeKey ? 'selected' : ''}>${esc((INFO[x.key] || x).name)}</option>`).join('')}</select></label>
        <p class="mdesc">${I.tag ? `<b>${esc(I.tag)}.</b> ` : ''}${esc(I.desc)}</p>${(() => { try { return `<h5>Predefined programming</h5><ul class="mlist">${programOf(t.build(project().site, vals).blocks).map((x) => `<li>${esc(x)}</li>`).join('')}<li>Automatic core sized to the tower</li></ul>`; } catch (e) { return ''; } })()}${linkNote()}${paramGrid(t)}<button class="wide" id="mFit">Fit to the height limit</button>`; }
    if (mode === 'case') { const c = C();
      return `<label class="mlabel">Case study<select id="mCase">${Typo.CASES.map((x) => `<option value="${x.id}" ${x.id === c.id ? 'selected' : ''}>${esc(x.name)} · ${x.height} m · ${x.storeys} storeys</option>`).join('')}</select></label>
        <p class="mdesc"><b>${esc(c.address)}</b> · ${esc(c.architect)}${c.year ? ' · ' + c.year : ''}</p><h5>Stated</h5><ul class="mlist">${c.facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul><h5>Assumed</h5><ul class="mlist">${c.assumed.map((f) => `<li>${esc(f)}</li>`).join('')}</ul><p class="hint">${c.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join(' · ')}</p>`; }
    let h = `<label class="dropzone"><input type="file" id="mFile" accept=".3dm,.obj,.json" hidden>${icon('upload')}<span><b>${upload ? 'Choose another file' : 'Choose a Rhino file'}</b><br><span class="muted">.3dm (also .obj or .json). Each layer becomes a block; closed meshes, extrusions and polysurfaces only.</span></span></label>`;
    if (busy) h += '<p class="hint">Reading the file…</p>';
    else if (upload && upload.error) h += `<p class="hint st-fail">${esc(upload.error)}</p>`;
    else if (upload) { h += `<h5>${esc(upload.name)} · ${upload.layers.length} layer${upload.layers.length === 1 ? '' : 's'}</h5><div class="mlayers">${upload.layers.map((l, i) => `<div class="mlrow"><span class="nm" title="${esc(l.name)}">${esc(l.name.split('::').pop())}</span><span class="mono muted">${l.U ? `${fmt(l.U.top, 1)} m · ${fmt(l.U.footprint)} m²` : 'not a closed volume'}</span><select data-layer="${i}" ${l.U ? '' : 'disabled'}>${Model.USES.map((u) => `<option value="${u}" ${u === l.use ? 'selected' : ''}>${Model.USE_LABEL[u]}</option>`).join('')}<option value="skip" ${l.use === 'skip' ? 'selected' : ''}>Ignore</option></select></div>`).join('')}</div>
        <p class="hint">Programs are guessed from the layer names; change any that are wrong. Layers that are not simple boxes keep their shape as sculpted towers sliced at the program’s floor-to-floor.</p>`; }
    return h;
  }
  let syncedFor = null;
  function render() {
    if (!root) return; const p = project(), n = Typo.TYPES.length, nc = Typo.CASES.length;
    const q = p.param, sig = q ? JSON.stringify(q) : 'none'; if (q && q.mode === 'type' && sig !== syncedFor && Typo.TYPES.some((t) => t.key === q.key)) { mode = 'type'; typeKey = q.key; vals = Object.assign(defaults(q.key), q.vals || {}); } syncedFor = sig; if (!vals) vals = defaults(typeKey);
    const card = (k, title, sub) => `<button class="mstart ${mode === k ? 'on' : ''}" data-mode="${k}" role="radio" aria-checked="${mode === k}">${icon(k)}<span><b>${title}</b><span>${sub}</span></span></button>`;
    root.innerHTML = `<div class="phead"><div><h2><span class="hic" data-icon="design"></span>Massing <span class="psum">${esc(label())}</span></h2><p>How do you want to start? Whatever you choose is drawn on the site from the Site tab when you confirm.</p></div><button class="ghost collapse" data-collapse title="Hide the panel">«</button></div>
      <div class="mbody"><div class="mstarts" role="radiogroup" aria-label="How to start the massing">${card('case', 'Existing building', `${nc} built downtown towers with their stated program`)}${card('type', 'Typology with programming', `${n} tower types with predefined programs, fitted to the site`)}${card('random', 'Randomized typical tower', 'a random program checked against every rule here')}${card('upload', 'Upload a Rhino file', '.3dm · its layers become blocks')}${card('scratch', 'Start from scratch', 'an empty site · add blocks one at a time')}</div>
      <div class="mpane">${pane()}</div></div>
      <div class="mconfirm"><p>${what()}</p><button class="primary" id="mGo" ${mode === 'type' && linked() ? 'title="Regenerate from these parameters"' : ''} ${mode === 'upload' && !(upload && upload.layers && upload.layers.some((l) => l.U && l.use !== 'skip')) ? 'disabled' : ''} ${mode === 'scratch' && !p.blocks.length ? 'disabled' : ''} ${mode === 'random' && !rnd ? 'disabled' : ''}>Confirm</button></div>`;
    if (window.Icons) Icons.apply(root);
    root.querySelectorAll('[data-collapse]').forEach((b) => (b.onclick = () => app.collapseLeft && app.collapseLeft()));
    root.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
    const ty = root.querySelector('#mType'); if (ty) ty.onchange = () => { typeKey = ty.value; vals = defaults(typeKey); render(); };
    const cs = root.querySelector('#mCase'); if (cs) cs.onchange = () => { caseId = cs.value; render(); };
    root.querySelectorAll('[data-p]').forEach((i) => { const k = i.dataset.p, num = root.querySelector(`[data-pn="${k}"]`);
      const set = () => { vals[k] = i.tagName === 'SELECT' ? i.value : Number(i.value); if (num) num.value = vals[k]; };
      i.oninput = () => { set(); if (linked()) live(false); }; i.onchange = () => { set(); if (linked()) live(true); else root.querySelector('.mconfirm p').innerHTML = what(); }; });
    root.querySelectorAll('[data-pn]').forEach((n) => (n.onchange = () => { const k = n.dataset.pn, v = Math.min(Number(n.max), Math.max(Number(n.min), Number(n.value) || 0)); vals[k] = v; n.value = v; const r = root.querySelector(`[data-p="${k}"]`); if (r) r.value = v; if (linked()) live(true); }));
    const fit = root.querySelector('#mFit'); if (fit) fit.onclick = () => { const m = app.metrics ? app.metrics() : {}, H = m.heightMax; if (Number.isFinite(H)) { vals = Typo.fitToHeight(typeKey, vals, p.site, H); if (linked()) live(true); render(); app.toast(`Fitted to the ${fmt(H, 1)} m height limit`); } else app.toast('No numeric height limit is set for this site.'); };
    const fi = root.querySelector('#mFile'); if (fi) fi.onchange = () => { if (fi.files[0]) readFile(fi.files[0]); };
    const rb = root.querySelector('#mRnd'); if (rb) rb.onclick = () => { rb.disabled = true; rb.textContent = 'Drawing and checking…'; setTimeout(randomize, 20); };
    root.querySelectorAll('[data-layer]').forEach((s) => (s.onchange = () => { upload.layers[Number(s.dataset.layer)].use = s.value; root.querySelector('.mconfirm p').innerHTML = what(); }));
    root.querySelector('#mGo').onclick = confirm;
  }
  function confirm() {
    const p = project(); let result, label2;
    try {
      if (mode === 'type') { app.applyMassing(T().build(p.site, vals), true, { mode: 'type', key: typeKey, vals: Object.assign({}, vals) }); app.toast(`${(INFO[typeKey] || T()).name}: its parameters now drive the model`); render(); return; }
      if (mode === 'random') { if (!rnd) return; typeKey = rnd.key; vals = Object.assign({}, rnd.vals); app.applyMassing(rnd.res, true, { mode: 'type', key: rnd.key, vals: Object.assign({}, rnd.vals) }); app.toast(`Randomized ${(INFO[rnd.key] || T2(rnd.key)).name.toLowerCase()} drawn${rnd.fails ? ` · ${rnd.fails} check${rnd.fails === 1 ? '' : 's'} to resolve` : ' · passes every check'}`); if (app.setWorkspace) app.setWorkspace('design'); render(); return; }
      if (mode === 'scratch') { result = { blocks: [], ramps: [] }; label2 = 'Cleared the site'; }
      else if (mode === 'case') { result = C().build(p.site); label2 = C().name; }
      else { const r = uploadBlocks(); result = r; label2 = `${upload.name}: ${r.blocks.length} blocks, ${r.placed}`; }
    } catch (e) { app.toast(e.message || String(e)); return; }
    app.replaceProject(Object.assign(Model.clone(p), { blocks: result.blocks, ramps: result.ramps || [], site: Model.clone(p.site), param: mode === 'case' ? { mode: 'case', id: C().id } : undefined }), label2);
    if (app.setWorkspace) app.setWorkspace('design');
  }
  function mount(el, App) { root = el; app = App; render(); if (App.on) App.on('change', () => { const pe = root.querySelector('.mconfirm p'); if (pe) pe.innerHTML = what(); }); }
  return { mount, render, randomize };
})();
