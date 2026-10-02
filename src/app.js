/* app.js — the workspace controller: state, history (snapshot undo/redo), Site / Design / Check / Compare / Report, the modelling
   toolbar and its snapping options, Layers and Help, the contextual right panel, live metrics and warnings while editing, save
   status, and the App API used by the typology, compare and report modules. Calculations live in model / plans / rules. */
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (v, d = 1) => (v == null || !isFinite(v) ? '—' : Number(v).toLocaleString('en-CA', { maximumFractionDigits: d, minimumFractionDigits: d }));
  const fmt0 = (v) => fmt(v, 0);
  const DEFAULT_AIDS = { perspective: false, entourage: false, contextOpacity: 1, context: true, streetNames: true, buildingNames: false, envelope: true, setbacks: true, daylight: false, shadow: false, hour: 12, floorLines: true, dims: true, coreLabels: false };
  const DEFAULT_SNAP = { inc: 0.25, storeys: true, align: true, constrain: false };
  const UI_KEY = 'dms.ui.v4';
  const stored = (() => { try { const v = JSON.parse(localStorage.getItem(UI_KEY)); if (v) return v; const old = JSON.parse(localStorage.getItem('dms.ui.v3')) || {}; delete old.aids; return old; } catch (e) { return {}; } })();
  const state = { workspace: stored.workspace || 'design', view: '3d', tool: 'select', levelKey: null, heat: false, selected: null, issue: null, checkFilter: { status: 'all', group: 'all', block: null }, secAxis: 'x', secPos: 0, highlight: [], focusIds: [],
    aids: Object.assign({}, DEFAULT_AIDS, stored.aids || {}), snap: Object.assign({}, DEFAULT_SNAP, stored.snap || {}), lw: stored.lw || null, rw: stored.rw || null, lcollapsed: !!stored.lcollapsed, highlightPark: null, progView: stored.progView || 'occ', editMode: stored.editMode || 'free', secOpen: stored.secOpen || {} };
  const saveUi = () => { try { localStorage.setItem(UI_KEY, JSON.stringify({ workspace: state.workspace, aids: state.aids, snap: state.snap, lw: state.lw, rw: state.rw, lcollapsed: state.lcollapsed, progView: state.progView, editMode: state.editMode, secOpen: state.secOpen })); } catch (e) { /* no storage */ } };
  function exampleProject() { try { if (window.Site && Site.available()) { const hit = Site.search('1189 HOWE')[0]; if (hit) { const ns = Site.siteFromParcel(hit.i); delete ns.frame; const p = Model.demoProject(ns); p.name = 'Howe & Davie tower study'; return p; } } } catch (e) { console.warn('example site', e); } const p = Model.demoProject(); p.name = 'Tower study'; return p; }
  let project = exampleProject();
  let levels = [], plans = {}, rows = [], ctxData = null, ctxKey = null, daylightCache = null, has3d = false, tipText = null;
  const history = { past: [], future: [], max: 100 };
  const listeners = { change: [] };

  /* ---------- history ---------- */
  function commit() { history.past.push(Model.clone(project)); if (history.past.length > history.max) history.past.shift(); history.future = []; }
  function undo() { if (has3d && Scene3D.busy()) Scene3D.cancelOp(); Views.cancelDrag(); if (!history.past.length) return; history.future.push(Model.clone(project)); project = history.past.pop(); baseline = Model.clone(project); afterModelChange(true); toast('Undone'); }
  function redo() { Views.cancelDrag(); if (!history.future.length) return; history.past.push(Model.clone(project)); project = history.future.pop(); baseline = Model.clone(project); afterModelChange(true); toast('Redone'); }
  let baseline = Model.clone(project);

  /* ---------- derived data ---------- */
  /* the project as the checks see it: sculpted tower forms replaced by exact rectangle slices (form.js) */
  let mpKey = null, mpOf = null, mpVal = null;
  function massProject() { if (!window.Form) return project; const key = JSON.stringify(project.blocks); if (key === mpKey && mpOf === project && mpVal) return mpVal; mpKey = key; mpOf = project; mpVal = Form.expand(project); return mpVal; }
  function context() { const s = project.site; const key = s.parcelIndex != null ? `${s.parcelIndex}:${s.w}:${s.d}` : null; if (key !== ctxKey) { ctxKey = key; ctxData = key != null && window.Site && Site.available() ? Site.context(s) : null; if (has3d) Scene3D.invalidateStatic(); } return ctxData; }
  /* evaluate a candidate project without touching the live one (used by the randomized start) */
  function evaluateProject(p) { try { const mp = window.Form ? Form.expand(p) : p, lv = Model.levels(mp); mp._parkNeed = Rules.parkingNeed(mp); const pl = {}; for (const L of lv) pl[L.key] = Plans.forLevel(mp, L); const rws = Rules.evaluate(mp, pl, lv, context()); return { rows: rws, fails: rws.filter((r) => r.verdict === 'fail').length }; } catch (e) { console.warn('evaluateProject', e); return { rows: [], fails: 99 }; } }
  function selectPair(id) { const sel = selected(); if (!sel || !id || id === sel.id) return; state.pair = id; renderRight(); drawStage(false); }
  function computeAll() {
    if (window.Brief) Brief.ensure(project);
    if (project.site.setbackSet == null) project.site.setbackSet = project.site.dd || project.site.parcelIndex != null ? 'ds' : 'none';
    const mp = massProject(); levels = Model.levels(mp); project._parkNeed = mp._parkNeed = Rules.parkingNeed(mp);
    plans = {}; for (const L of levels) plans[L.key] = Plans.forLevel(mp, L);
    rows = Rules.evaluate(mp, plans, levels, context()); Checks.mark(rows); daylightCache = null;
    if (!levels.find((l) => l.key === state.levelKey)) state.levelKey = (levels.find((l) => l.label === 1) || levels[0] || {}).key || null;
    if (state.issue && !rows.find((r) => r.id === state.issue)) state.issue = null;
    listeners.change.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
  }
  function computeVisible() { const mp = massProject(); levels = Model.levels(mp); const L = currentLevel(); if (L && state.view === 'plan') plans[L.key] = Plans.forLevel(mp, L); daylightCache = null; }
  const currentLevel = () => levels.find((l) => l.key === state.levelKey) || null;
  const planFor = (L) => plans[L.key] || null;
  const selected = () => project.blocks.find((b) => b.id === state.selected) || project.ramps.find((r) => r.id === state.selected) || null;
  const selBlock = () => { const s = selected(); return s && s.len == null ? s : null; };
  function travelLimit(L) { const isD = L.uses.includes('office'); return project.site.sprinklered ? CODES.travel.sprinkleredAny : isD ? CODES.travel.groupD : CODES.travel.other; }
  function sectionBlock() { const sel = selBlock(); if (sel && sel.use !== 'core') return sel; return project.blocks.filter((b) => b.use !== 'core').sort((a, b) => Model.blockTop(b) - Model.blockTop(a))[0] || null; }
  function snapZ(z, obj) { const cands = [0]; for (const b of project.blocks) if (b.id !== obj.id) cands.push(Model.blockTop(b), b.z0); let best = Math.round(z * 10) / 10; for (const c of cands) if (Math.abs(c - z) < 0.4) best = c; return best; }
  function envelope() { const s = project.site, H = CODES.odp.height[s.heightArea] || {}; let basic = H.basic, max = H.max; if (s.heightArea === '1' && (s.tenure === 'rental' || s.tenure === 'social')) basic = H.rentalOrSocial; if (s.viewConeH != null) { max = max ? Math.min(max, s.viewConeH) : s.viewConeH; basic = basic ? Math.min(basic, s.viewConeH) : s.viewConeH; } return { basic: basic || null, max: max && basic && max > basic ? max : null }; }
  function daylight() { if (daylightCache) return daylightCache; const env = envelope(); daylightCache = window.Daylight ? Daylight.evaluate(massProject(), env.max || env.basic || 91.4) : []; return daylightCache; }
  const focus = () => new Set(state.focusIds || []);
  /* provenance of each site input: confirmed (City data), derived (computed from City data), assumption (your input), verify */
  function prov(key) {
    const s = project.site, a = s.auto || {}, parcel = s.parcelIndex != null;
    if (key === 'densityArea') return a.densityArea === 'check' ? 'verify' : a.densityArea === 'auto' ? 'derived' : 'assumption';
    if (key === 'heightArea') return a.heightArea === 'check' ? 'verify' : a.heightArea === 'auto' ? 'derived' : 'assumption';
    if (key === 'viewCone') return s.viewConeH != null ? 'assumption' : parcel && s.viewCones && s.viewCones.length ? 'verify' : parcel ? 'confirmed' : 'assumption';
    return parcel ? 'confirmed' : 'assumption';
  }
  const PROV_LABEL = { confirmed: 'Confirmed', derived: 'Derived', assumption: 'Your assumption', verify: 'Needs verification' };
  const provTag = (k) => `<span class="prov ${k}">${PROV_LABEL[k]}</span>`;
  /* limits that "Constrain to limits" may use: the site box always; height only when the height area is not awaiting verification */
  function limits() { const s = project.site, env = envelope(), hOk = prov('heightArea') !== 'verify'; let maxTop = hOk ? env.max || env.basic : null; if (s.viewConeH != null) maxTop = maxTop != null ? Math.min(maxTop, s.viewConeH) : s.viewConeH; return { constrain: !!state.snap.constrain, w: s.w, d: s.d, maxTop: maxTop || null }; }
  /* live warnings for one block while it is being edited (cheap: geometry, height, density) */
  function liveWarnings(b) {
    const out = [], s = project.site, env = envelope(), top = Model.blockTop(b);
    const bb = window.Form && Form.active(b) ? Form.bounds(b, project) : { x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.d }, over = Math.max(0 - bb.x0, bb.x1 - s.w, 0 - bb.y0, bb.y1 - s.d); if (over > 0.01) out.push({ level: 'fail', text: `Extends ${fmt(over, 2)} m beyond the site` });
    const hv = prov('heightArea') === 'verify' ? ' (height area needs verification)' : '';
    if (b.use !== 'parking' && env.basic) { const cap = env.max || env.basic; if (top > cap + 1e-6) out.push({ level: 'fail', text: `Top at ${fmt(top, 1)} m is above the ${fmt(cap, 1)} m maximum${hv}` }); else if (env.max && top > env.basic + 1e-6) out.push({ level: 'review', text: `Above the ${fmt(env.basic, 1)} m basic height; Board discretion up to ${fmt(env.max, 1)} m${hv}` }); }
    const tmp0 = Object.assign({}, project, { blocks: project.blocks.map((x) => (x.id === b.id ? b : x)) }), tmp = window.Form ? Form.expand(tmp0) : tmp0, dn = Rules.density(tmp), D = CODES.odp.density[s.densityArea] || {};
    if (D.fsr != null && dn.fsr > D.fsr + 1e-9) out.push({ level: 'fail', text: `FSR ${fmt(dn.fsr, 2)} exceeds the ${fmt(D.fsr, 2)} maximum${prov('densityArea') === 'verify' ? ' (density area needs verification)' : ''}` });
    if (Rules.setbackIssues) for (const q of Rules.setbackIssues(tmp0, s).filter((q) => q.block.id === b.id).slice(0, 2)) out.push({ level: 'review', text: `Crosses the ${q.rule.label} line by ${fmt(q.by, 1)} m on the ${q.edge.side} side (guideline)` });
    return out;
  }
  function metrics() {
    const mpj = massProject(), T = Model.totals(mpj), dn = Rules.density(mpj, T), h = rows.find((r) => r.id === 'height'), pl = rows.find((r) => r.id === 'plate'), fsrRow = rows.find((r) => r.id === 'fsr');
    const D = CODES.odp.density[project.site.densityArea] || {}, env = envelope(); const homes = rows.find((r) => r.id === 'ly-mix'); const stalls = rows.find((r) => r.id === 'pk-count');
    const pres = (r) => (r ? Checks.effective(r, project).key : null);
    return { brief: window.Brief ? Brief.areas(project, T) : null, footprint: T.footprint, fsr: dn.fsr, fsrFA: dn.fsrFA, siteArea: dn.siteArea, fsrMax: D.fsr, height: T.maxZ, heightMax: env.max || env.basic, heightBasic: env.basic, heightBoard: env.max, storeys: T.storeysAbove, storeysBelow: T.storeysBelow, plate: pl ? parseFloat(pl.value) : 0, homes: homes ? parseInt(homes.value) : Math.round(T.gfa.residential * 0.82 / 68), stalls: stalls ? parseInt(stalls.value) : 0,
      fail: rows.filter((r) => r.verdict === 'fail').length, review: rows.filter((r) => Checks.effective(r, project).group === 'review').length, pass: rows.filter((r) => Checks.effective(r, project).group === 'pass').length, gfa: T.gfa, gfaAbove: T.gfaAbove, gfaBelow: T.gfaBelow,
      verdicts: { fsr: D.fsr != null ? (dn.fsr > D.fsr + 1e-9 ? 'fail' : pres(fsrRow) === 'verify' ? 'verify' : 'pass') : null, height: pres(h), plate: pl && pl.verdict } };
  }

  /* ---------- edits ---------- */
  /* cores and stairs belong to the tallest block that contains their centre; when that block moves, resizes or grows, they follow,
     so the generated floor plans always find their exit stairs inside the massing */
  function coreHost(c, blocks) { const cx = c.x + c.w / 2, cy = c.y + c.d / 2; let best = null; for (const b of blocks) { if (b.use === 'core' || b.use === 'parking' || b.hidden) continue; if (cx > b.x && cx < b.x + b.w && cy > b.y && cy < b.y + b.d && c.z0 <= b.z0 + 0.1 && Model.blockTop(c) > b.z0 + 0.1 && (!best || Model.blockTop(b) > Model.blockTop(best))) best = b; } return best; }
  function applyWithCores(b, patch) {
    if (b.use === 'core' || b.len != null) { Object.assign(b, patch); return; }
    const before = { x: b.x, y: b.y, w: b.w, d: b.d, top: Model.blockTop(b) }, linked = project.blocks.filter((c) => c.use === 'core' && !c.locked && coreHost(c, project.blocks) === b);
    Object.assign(b, patch); if (!linked.length) return;
    const top = Model.blockTop(b);
    const cl = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));
    for (const c of linked) { /* a move carries the core along; a resize leaves it in place, nudged back inside if the block shrank past it */
      c.x = Math.round((Math.abs(b.w - before.w) < 1e-9 ? c.x + b.x - before.x : cl(c.x, b.x, b.x + b.w - c.w)) * 100) / 100; c.y = Math.round((Math.abs(b.d - before.d) < 1e-9 ? c.y + b.y - before.y : cl(c.y, b.y, b.y + b.d - c.d)) * 100) / 100;
      const ctop = Model.blockTop(c); if (ctop >= before.top - 0.15) c.f2f = Math.max(3, Math.round((top + (ctop - before.top) - c.z0) * 100) / 100); }
  }
  const markEdited = () => { if (!project.param) project.param = { mode: 'manual', edited: true }; else if (!project.param.edited) project.param.edited = true; };
  /* guideline setbacks are hard limits in the model: a block's footprint is kept inside the box its height allows */
  function clampSetbacks(b, patch) { if (!b || b.len != null || b.use === 'core' || b.use === 'parking' || !Rules.setbackBox) return patch; const m = Object.assign({}, b, patch), top = m.z0 + m.floors * m.f2f; if (top <= 0.1) return patch; const box = Rules.setbackBox(project.site, top), aw = box.x1 - box.x0, ad = box.y1 - box.y0; if (aw < 3 || ad < 3) return patch;
    const w = Math.min(m.w, aw), d = Math.min(m.d, ad), x = Math.min(Math.max(m.x, box.x0), box.x1 - w), y = Math.min(Math.max(m.y, box.y0), box.y1 - d), out = Object.assign({}, patch); if (Math.abs(w - m.w) > 1e-9) out.w = Model.snap(w); if (Math.abs(d - m.d) > 1e-9) out.d = Model.snap(d); if (Math.abs(x - m.x) > 1e-9) out.x = Model.snap(x); if (Math.abs(y - m.y) > 1e-9) out.y = Model.snap(y); return out; }
  function edit(id, patch, isCommit) {
    const obj = project.blocks.find((b) => b.id === id) || project.ramps.find((r) => r.id === id); if (!obj) return; if (!isCommit) patch = clampSetbacks(obj, patch);
    if (obj.locked && !isCommit && Object.keys(patch).some((k) => ['x', 'y', 'w', 'd', 'z0', 'len', 'floors', 'f2f'].includes(k))) { toast(`${obj.name || 'Ramp'} is locked`); return; }
    if (isCommit) { if (JSON.stringify(baseline) !== JSON.stringify(project)) { history.past.push(baseline); if (history.past.length > history.max) history.past.shift(); history.future = []; } baseline = Model.clone(project); afterModelChange(true); return; }
    applyWithCores(obj, patch); markEdited(); afterModelChange(false);
  }
  function setField(obj, key, value, isNumber = true) { commit(); if (['x', 'y', 'w', 'd', 'z0', 'floors', 'f2f'].includes(key) && obj.use) applyWithCores(obj, clampSetbacks(obj, { [key]: isNumber ? Number(value) : value })); else obj[key] = isNumber ? Number(value) : value; if (obj.use) markEdited(); baseline = Model.clone(project); afterModelChange(true); }
  function mutate(fn, msg) { commit(); const b0 = JSON.stringify(project.blocks); fn(); if (JSON.stringify(project.blocks) !== b0) markEdited(); baseline = Model.clone(project); afterModelChange(true); if (msg) toast(msg); }
  /* parametric massing (massing.js): regenerate the blocks from the saved parameters; blocks keep their id, form, lock and visibility by name */
  function applyMassing(result, isCommit, param) {
    const byName = new Map(project.blocks.map((b) => [b.name, b]));
    const blocks = result.blocks.map((b) => { const o = byName.get(b.name); if (!o) return b; if (o.locked) return o; b.id = o.id; if (o.form) b.form = Model.clone(o.form); b.hidden = o.hidden; return b; });
    project.blocks = blocks; project.ramps = result.ramps || []; project.param = param ? Object.assign({}, param, { edited: false }) : undefined; Model.syncIds(project);
    if (state.selected && !project.blocks.some((b) => b.id === state.selected) && !project.ramps.some((r) => r.id === state.selected)) state.selected = null;
    if (!isCommit) { afterModelChange(false); renderDesign(); return; }
    if (JSON.stringify(baseline) !== JSON.stringify(project)) { history.past.push(baseline); if (history.past.length > history.max) history.past.shift(); history.future = []; }
    baseline = Model.clone(project); afterModelChange(true);
  }
  /* live: geometry and the cheap figures update on every drag step; plans and the full ledger run when the edit is released */
  function afterModelChange(full) {
    if (full) { computeAll(); baseline = Model.clone(project); renderAll(); return; }
    computeVisible(); drawStage(false); renderMetrics(); syncProps();
  }
  function drawStage(full = true) { if (state.view === '3d' && has3d) Scene3D.refresh(full); else Views.draw(); }
  function renderAll() { renderTop(); renderSite(); renderDesign(); renderCheck(); renderReportSummary(); renderMetrics(); renderRight(); renderViewChrome(); drawStage(true); }
  function replaceProject(p, label) { const probs = Model.problems(p); commit(); const name = project.name; project = Model.clone(p); if (!project.name) project.name = name; Model.syncIds(project); baseline = Model.clone(project); Plans.clearCache(); state.selected = null; state.issue = null; state.focusIds = []; Views.refit(); afterModelChange(true); if (has3d) Scene3D.resetView(); if (label) toast(label + (probs.length ? ` · ${probs.length} model issue${probs.length > 1 ? 's' : ''}` : '')); }

  /* ---------- top bar ---------- */
  function renderTop() {
    if (document.activeElement !== $('projName')) $('projName').value = project.name || 'Untitled massing';
    $('projName').title = project.site.addr || 'Custom site box';
    document.querySelectorAll('#tabs button').forEach((b) => { const on = b.dataset.ws === state.workspace; b.classList.toggle('on', on); b.setAttribute('aria-current', on ? 'page' : 'false'); });
    const nf = rows.filter((r) => r.verdict === 'fail').length, tc = $('tabCount'); tc.hidden = !nf; tc.textContent = nf;
    const st = window.Iterate ? Iterate.status() : { state: 'never' }, ss = $('saveStatus');
    ss.className = 'savestatus ' + st.state; ss.querySelector('span').textContent = st.state === 'saved' ? `Saved · ${st.name}` : st.state === 'changed' ? `Unsaved changes since ${st.name}` : 'Not saved yet';
    $('btnUndo').disabled = !history.past.length; $('btnRedo').disabled = !history.future.length;
  }
  function setWorkspace(ws) {
    if (has3d && Scene3D.busy()) Scene3D.commitOp();
    state.workspace = ws; saveUi();
    document.querySelectorAll('#leftPanel .ws').forEach((el) => (el.hidden = el.dataset.ws !== ws));
    $('leftPanel').scrollTop = 0; renderTop();
    if (ws === 'check') renderCheck(); if (ws === 'report') renderReportSummary(); if (ws === 'design') { if (window.Brief) Brief.render(); if (window.Gen) Gen.render(); }
    const rep = ws === 'report'; $('viewport').hidden = rep; $('reportDoc').hidden = !rep; $('metrics').hidden = rep; if (rep) { $('planBar').hidden = true; $('secBar').hidden = true; if (window.Report) Report.show(); } else requestAnimationFrame(relayout);
    if (ws !== 'check' && state.issue) { state.issue = null; state.focusIds = []; drawStage(false); }
    renderRight(); if (!rep) renderViewChrome();
  }

  /* ---------- panels: collapse + resize ---------- */
  function applyPanels() { const m = $('main'); if (state.lw) m.style.setProperty('--lw', state.lw + 'px'); else m.style.removeProperty('--lw'); if (state.rw) m.style.setProperty('--rw', state.rw + 'px'); else m.style.removeProperty('--rw'); m.classList.toggle('lcollapsed', !!state.lcollapsed); requestAnimationFrame(relayout); }
  function relayout() { if (has3d) Scene3D.resize(); Views.draw(); }
  function bindGrips() {
    const drag = (grip, side) => { grip.addEventListener('pointerdown', (e) => { e.preventDefault(); try { grip.setPointerCapture(e.pointerId); } catch (err) { /* */ } grip.classList.add('on'); document.body.classList.add('resizing'); const mr = $('main').getBoundingClientRect();
      const move = (ev) => { if (side === 'l') state.lw = Math.round(Math.max(260, Math.min(560, ev.clientX - mr.left))); else state.rw = Math.round(Math.max(280, Math.min(520, mr.right - ev.clientX))); applyPanels(); };
      const up = () => { grip.classList.remove('on'); document.body.classList.remove('resizing'); grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up); saveUi(); };
      grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up); }); grip.addEventListener('dblclick', () => { if (side === 'l') state.lw = null; else state.rw = null; applyPanels(); saveUi(); }); };
    drag($('lGrip'), 'l'); drag($('rGrip'), 'r');
    document.querySelectorAll('[data-collapse]').forEach((b) => (b.onclick = () => { state.lcollapsed = true; applyPanels(); saveUi(); }));
    $('lExpand').onclick = () => { state.lcollapsed = false; applyPanels(); saveUi(); };
  }

  /* ---------- popovers ---------- */
  let openPop = null;
  function togglePop(id, btn) { const el = $(id); const willOpen = el.hidden; closePops(); if (willOpen) { el.hidden = false; openPop = { el, btn }; if (btn) btn.setAttribute('aria-expanded', 'true'); if (id === 'popLayers') renderLayers(); if (id === 'popSnap') renderSnap(); if (id === 'popSave') prepSave(); if (id === 'popAdd') renderAddMenu(); } }
  function closePops() { if (openPop) { openPop.el.hidden = true; if (openPop.btn) openPop.btn.setAttribute('aria-expanded', 'false'); openPop = null; } }
  function prepSave() { const st = window.Iterate ? Iterate.status() : { state: 'never' }; const n = window.Iterate ? Iterate.list().length : 0; $('saveHint').innerHTML = st.state === 'never' ? 'Keep a snapshot of this design to return to or compare.' : st.state === 'saved' ? `This design is saved as <b>${esc(st.name)}</b>. Saving again makes a copy.` : `Changed since <b>${esc(st.name)}</b>.`; $('saveName').value = ''; $('saveName').placeholder = `Version ${n + 1}`; setTimeout(() => $('saveName').focus(), 0); }
  function doSave() { if (!window.Iterate) return; if (has3d && Scene3D.busy()) Scene3D.commitOp(); const v = Iterate.save($('saveName').value); closePops(); if (v) toast(`Saved ${v.name}`); renderTop(); }

  /* ---------- metrics strip (live) ---------- */
  function renderMetrics() {
    const m = metrics(), sb = selBlock();
    const flag = (k, t) => (k === 'fail' ? `<span class="flag fail">✕ ${t.fail}</span>` : k === 'verify' ? '<span class="flag review">? verify</span>' : k === 'review' ? `<span class="flag review">! ${t.review}</span>` : k === 'pass' ? `<span class="flag pass">✓ ${t.pass}</span>` : '');
    const tile = (id, k, v, title, f, click) => `<button class="metric ${click ? 'clickable' : ''}" ${click ? `data-metric="${id}"` : 'tabindex="-1"'} title="${esc(title)}"><span class="v">${v}</span><span class="k">${k}${f || ''}${click ? ICON('info') : ''}</span></button>`;
    $('metrics').innerHTML =
      tile('fsr', 'FSR', `${fmt(m.fsr, 2)}${m.fsrMax != null ? `<small>of ${fmt(m.fsrMax, 2)}</small>` : ''}`, 'Floor space ratio. Click for the calculation, limit and source.', flag(m.verdicts.fsr, { fail: 'over', review: '', pass: 'within' }), true) +
      tile('area', 'Floor area · counted for FSR', `${fmt0(m.gfaAbove)}<small>m² · ${fmt0(m.fsrFA)} m²</small>`, 'Total gross floor area above grade, then the floor area counted toward FSR (amenity and above-grade parking exclusions applied).') +
      tile('height', 'Building height', `${fmt(m.height, 1)}<small>m${m.heightBasic ? ` of ${fmt(m.heightBasic, 1)}` : ''}</small>`, 'Height of the tallest block above grade. Click for the limits and source.', flag(m.verdicts.height, { fail: 'over', review: 'Board', pass: 'within' }), true) +
      (sb ? tile('blk', 'Selected block height', `${fmt(sb.use === 'core' ? sb.f2f : sb.floors * sb.f2f, 1)}<small>m · ${esc(sb.name)}</small>`, 'Height of the selected block from its base to its roof.') : '') +
      (m.brief ? tile('brief', 'Floor area · target', `${fmt0(m.brief.actualTotal)}<small>of ${fmt0(m.brief.gfaTarget)} m²</small>`, 'Gross floor area above grade against the brief, and each program share against its target. Click for the breakdown.', (() => { const off = Brief.USES.filter((u) => m.brief.by[u] && Math.abs(m.brief.by[u].actualPct - m.brief.by[u].pct) >= 3).length; return off ? `<span class="flag review">! ${off} share${off === 1 ? '' : 's'} off</span>` : '<span class="flag pass">✓ mix</span>'; })(), true) : '') +
      tile('storeys', 'Storeys', `${m.storeys}<small>above · ${m.storeysBelow} below</small>`, 'Storeys above and below grade, from the slab levels of all blocks.') +
      tile('homes', 'Homes (estimate)', `${fmt0(m.homes)}`, 'Estimated homes from the generated residential plans; updates when an edit is released.') +
      tile('stalls', 'Parking stalls', `${fmt0(m.stalls)}`, 'Stalls in the generated parking plans; updates when an edit is released.') +
      tile('cover', 'Footprint · site coverage', `${fmt0(m.footprint)}<small>m² · ${fmt(Math.min(100, m.footprint / m.siteArea * 100), 0)}%</small>`, 'Ground-floor footprint and its share of the lot.');
    $('metrics').querySelectorAll('[data-metric]').forEach((b) => (b.onclick = () => openMetric(b.dataset.metric, b)));
  }
  function openMetric(k, btn) {
    const pop = $('popMetric'), m = metrics(), s = project.site, D = CODES.odp.density[s.densityArea] || {}, sb = selBlock();
    if (!pop.hidden && pop.dataset.k === k) { closePops(); return; } closePops(); pop.dataset.k = k;
    if (k === 'brief' && m.brief) { const B = m.brief; pop.innerHTML = `<h4>Target versus actual</h4><dl><dt>Target GFA</dt><dd><b>${fmt0(B.gfaTarget)} m²</b> above grade (the brief)</dd><dt>Actual</dt><dd><b>${fmt0(B.actualTotal)} m²</b> above grade, parking and cores excluded</dd><dt>Counted for FSR</dt><dd>${fmt0(m.fsrFA)} m² after exclusions</dd></dl><table class="gtbl" style="width:100%;margin-top:8px"><thead><tr><th>Use</th><th class="n">Target</th><th class="n">Actual</th></tr></thead><tbody>${Brief.USES.filter((u) => B.by[u].pct || B.by[u].actual).map((u) => { const r = B.by[u], off = Math.abs(r.actualPct - r.pct) >= 3; return `<tr><td><i class="sw" style="background:${Views.useCol(u)}"></i> ${Model.USE_LABEL[u]}</td><td class="n">${fmt(r.pct, 0)}% · ${fmt0(r.target)}</td><td class="n ${off ? 'st-review' : ''}">${fmt(r.actualPct, 0)}% · ${fmt0(r.actual)}</td></tr>`; }).join('')}</tbody></table><p class="hint" style="margin:8px 0 0">Shares are of gross floor area above grade measured to the block faces. Blocks that carry each share highlight in the model when you select them; checks that need missing information are marked Not assessed in the Check tab.</p>`; }
    else if (k === 'fsr') pop.innerHTML = `<h4>Floor space ratio</h4><dl><dt>Current</dt><dd><b>${fmt(m.fsr, 2)}</b></dd><dt>Calculation</dt><dd>${fmt0(m.fsrFA)} m² counted ÷ ${fmt0(m.siteArea)} m² site area</dd><dt>Counted area</dt><dd>All floors above grade, less amenity up to 20% of residential, plus above-grade parking at 70%</dd><dt>Limit</dt><dd>${D.fsr != null ? fmt(D.fsr, 2) + ' maximum' : 'No figure in the ODP for this area'}${D.resCap ? `; residential up to ${fmt(D.resCap, 2)}` : ''}</dd><dt>Source</dt><dd>Downtown ODP §3(1), density area ${esc(s.densityArea || '—')} · ${provTag(prov('densityArea'))}</dd></dl>`;
    else pop.innerHTML = `<h4>Height</h4><dl><dt>Building height</dt><dd><b>${fmt(m.height, 1)} m</b> (tallest block)</dd>${sb ? `<dt>Selected block</dt><dd>${fmt(sb.use === 'core' ? sb.f2f : sb.floors * sb.f2f, 1)} m tall, top at ${fmt(Model.blockTop(sb), 1)} m</dd>` : ''}<dt>Basic height</dt><dd>${m.heightBasic ? fmt(m.heightBasic, 1) + ' m' : '—'}</dd><dt>Board may allow</dt><dd>${m.heightBoard ? fmt(m.heightBoard, 1) + ' m' : 'no increase listed'}</dd>${s.viewConeH != null ? `<dt>View cone</dt><dd>${fmt(s.viewConeH, 1)} m at this site (your input)</dd>` : ''}<dt>Source</dt><dd>Downtown ODP §4 Table 1, height area ${esc(s.heightArea || '—')} · ${provTag(prov('heightArea'))}${s.viewCones && s.viewCones.length && s.viewConeH == null ? `<br>View cones ${esc(s.viewCones.join(', '))} cross the lot: ${provTag('verify')}` : ''}</dd></dl>`;
    pop.hidden = false; const r = btn.getBoundingClientRect(), op = pop.offsetParent || document.body, cr = op.getBoundingClientRect(); pop.style.right = 'auto'; pop.style.left = Math.max(8, Math.min(r.left - cr.left, cr.width - pop.offsetWidth - 8)) + 'px'; pop.style.top = (r.bottom - cr.top + 4) + 'px'; openPop = { el: pop, btn };
  }

  /* ---------- viewport chrome ---------- */
  const HINT = {
    select: { '3d': 'Drag a block to move it · drag a face of the selected block to resize it, or click the face to type a size · drag empty space to orbit', plan: 'Drag a block to move it · drag a handle of the selected block to resize it · drag empty space to pan', section: 'Drag a block to restack it · drag empty space to pan' },
    push: { '3d': '<b>Push/Pull</b> · Hover a face, then drag it. The opposite face stays fixed. Click a face to type an exact value.', plan: '<b>Push/Pull</b> · Drag an edge or corner handle of the selected block.', section: '<b>Push/Pull</b> works in 3D and Plan. Section shows heights.' },
    move: { '3d': '<b>Move</b> · Drag an arrow to slide along one axis, or the square to move freely. Size does not change.', plan: '<b>Move</b> · Drag a block across the site.', section: '<b>Move</b> · Drag a block up or down to restack it.' },
  };
  function renderViewChrome() {
    placeCompass2d();
    document.querySelectorAll('.vtc .seg button').forEach((b) => b.classList.toggle('on', b.dataset.view === state.view));
    const sel = selected();
    renderHint();
    const uses = Model.USES.filter((u) => project.blocks.some((b) => b.use === u && !b.hidden)), A = state.aids;
    $('legend').innerHTML = uses.map((u) => `<span><i class="sw" style="background:${Views.useCol(u)};box-shadow:inset 0 0 0 1px var(--${u === 'residential' ? 'res' : u}-line)"></i>${Model.USE_LABEL[u]}</span>`).join('') + '<span><i class="ln"></i>Site</span>' + (A.envelope && envelope().basic && state.view !== 'plan' ? '<span><i class="ln env"></i>Height limit</span>' : '') + (A.shadow ? '<span><i class="sw" style="background:#3d3a34;opacity:.35"></i>Shadow</span>' : '') + (A.daylight ? '<span><i class="sw" style="background:var(--pass)"></i>Window clear</span><span><i class="sw" style="background:var(--fail)"></i>Blocked</span>' : '') + (selBlock() ? '<span><i class="ln sel"></i>Selected</span>' : '');
    const note = $('vnote'), noCtx = !context(); const heat = state.view === 'plan' && state.heat; note.hidden = !noCtx && !heat;
    note.innerHTML = noCtx ? 'Custom site box: there are no surrounding buildings. Choose a parcel on the Site tab to load the neighbourhood.' : heat ? `Exit distance: green is under half the ${travelLimit(currentLevel() || { uses: [] })} m limit, red is at the limit.` : '';
    renderPlanBar(); renderSecBar();
  }
  /* small line drawings for Push/Pull and Move: a block, the highlighted face and the direction of travel */
  const HINT_SVG = {
    push: '<svg class="hintfig" viewBox="0 0 96 64" aria-hidden="true"><path d="M14 22l26-10 26 10v28l-26 10-26-10z" fill="var(--panel)" stroke="var(--ink)" stroke-width="1"/><path d="M14 22l26 10 26-10M40 32v28" fill="none" stroke="var(--ink)" stroke-width=".8"/><path d="M40 32l26-10v28l-26 10z" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="1.4"/><path d="M58 41h28" stroke="var(--accent)" stroke-width="1.6" marker-end="url(#hintAr)"/><defs><marker id="hintAr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 1L10 5L0 9z" fill="var(--accent)"/></marker></defs></svg>',
    move: '<svg class="hintfig" viewBox="0 0 96 64" aria-hidden="true"><path d="M22 26l22-8 22 8v22l-22 8-22-8z" fill="var(--panel)" stroke="var(--ink)" stroke-width="1"/><path d="M22 26l22 8 22-8M44 34v22" fill="none" stroke="var(--ink)" stroke-width=".8"/><path d="M44 45l38 -12" stroke="var(--accent)" stroke-width="1.6" marker-end="url(#hintAr2)"/><path d="M44 45l-30 -12" stroke="var(--ink)" stroke-width="1.2" marker-end="url(#hintAr3)"/><rect x="40" y="41" width="8" height="8" fill="var(--accent)" opacity=".5"/><defs><marker id="hintAr2" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 1L10 5L0 9z" fill="var(--accent)"/></marker><marker id="hintAr3" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 1L10 5L0 9z" fill="var(--ink)"/></marker></defs></svg>',
  };
  let hintSeen = (() => { try { return JSON.parse(localStorage.getItem('dms.hintseen.v1')) || {}; } catch (e) { return {}; } })();
  function renderHint() { $('toolHint').innerHTML = tipText ? esc(tipText) : HINT[state.tool][state.view]; }
  function renderSnap() { const sn = state.snap, el = $('popSnap');
    el.innerHTML = `<h4>Snapping</h4><div class="snapgrid"><label style="flex-direction:row;align-items:center;gap:10px">Step <select id="optInc" style="width:auto">${[0.1, 0.25, 0.5, 1, 2].map((v) => `<option value="${v}" ${sn.inc === v ? 'selected' : ''}>${v} m</option>`).join('')}</select></label>
      <label class="toggle"><input type="checkbox" id="optStoreys" ${sn.storeys ? 'checked' : ''}><span>Roof in whole storeys<small>Off: the roof moves freely and changes floor-to-floor</small></span></label>
      <label class="toggle"><input type="checkbox" id="optAlign" ${sn.align ? 'checked' : ''}><span>Align to faces<small>Snaps to nearby block faces and site lines</small></span></label>
      <label class="toggle"><input type="checkbox" id="optCon" ${sn.constrain ? 'checked' : ''}><span>Constrain to limits<small>Keeps blocks inside the site and under a confirmed height limit</small></span></label>
      <p class="hint" style="margin:0">Hold Alt while dragging to ignore snapping.</p></div>`;
    const bind = (id, k, conv) => { const e = $(id); if (e) e.onchange = () => { sn[k] = conv(e); saveUi(); }; };
    bind('optInc', 'inc', (e) => Number(e.value)); bind('optStoreys', 'storeys', (e) => e.checked); bind('optAlign', 'align', (e) => e.checked); bind('optCon', 'constrain', (e) => e.checked); }
  function placeCompass2d() { const c = $('compass'); if (!c) return; c.hidden = state.view === 'section'; if (state.view !== 'plan') return; const N = project.site.north || [0, 1]; c.firstElementChild.style.transform = `rotate(${(Math.atan2(N[0], N[1]) * 180 / Math.PI).toFixed(1)}deg)`; }
  function renderPlanBar() {
    const bar = $('planBar'); bar.hidden = state.view !== 'plan'; if (bar.hidden) return;
    const below = levels.filter((l) => l.label < 0), above = levels.filter((l) => l.label > 0), L = currentLevel(), P = L && planFor(L), pm = P ? P.metrics : {};
    const chip = (x) => `<button class="lvl ${x.key === state.levelKey ? 'on' : ''}" data-k="${x.key}" title="${esc(x.uses.map((u) => Model.USE_LABEL[u]).join(' + '))} · ${x.z.toFixed(1)} m">${x.name}</button>`;
    const show = []; let prev = null; above.forEach((x, i) => { const same = prev && plans[prev.key] === plans[x.key]; if (!same || i === above.length - 1 || x.key === state.levelKey || x.label % 5 === 0) show.push(x); else if (show[show.length - 1] !== '…') show.push('…'); prev = x; });
    bar.innerHTML = `<span class="lbl">Storey</span>${below.slice().reverse().map(chip).join('')}${show.map((x) => (x === '…' ? '<span class="muted">…</span>' : chip(x))).join('')}<span class="grow"></span>${L ? `<span class="muted" style="font-size:13px;white-space:nowrap" title="${L.name} · ${fmt0(pm.area)} m²${pm.unitsTotal ? ` · ${pm.unitsTotal} homes` : ''}${pm.stalls ? ` · ${pm.stalls} stalls` : ''}${pm.maxTravel ? ` · longest exit distance ${fmt(pm.maxTravel, 1)} m` : ''}">${fmt0(pm.area)} m²${pm.maxTravel ? ` · exit ${fmt(pm.maxTravel, 1)} m` : ''}</span>` : ''}<button id="btnHeat" class="${state.heat ? 'primary' : ''}" aria-pressed="${state.heat}">Exit distances</button><button id="btnDxf">Export DXF</button>`;
    bar.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => showLevel(b.dataset.k)));
    $('btnHeat').onclick = () => { state.heat = !state.heat; renderViewChrome(); Views.draw(); }; $('btnDxf').onclick = exportDxf;
  }
  function renderSecBar() {
    const bar = $('secBar'); bar.hidden = state.view !== 'section'; if (bar.hidden) return;
    const s = project.site, sb = sectionBlock(), max = state.secAxis === 'x' ? s.d : s.w;
    bar.innerHTML = `<span class="lbl">Section</span><label>Direction <select id="secAxis"><option value="x" ${state.secAxis === 'x' ? 'selected' : ''}>East–west cut</option><option value="y" ${state.secAxis === 'y' ? 'selected' : ''}>North–south cut</option></select></label><label>Cut position <input type="range" id="secPos" min="0" max="${max}" step="0.5" value="${state.secPos}"><span class="num" id="secPosV">${state.secPos.toFixed(1)} m</span></label><span class="grow"></span><span class="muted" style="font-size:13px">${sb ? 'Through ' + esc(sb.name) : ''}</span>`;
    $('secAxis').onchange = (e) => { state.secAxis = e.target.value; const b = sectionBlock(); state.secPos = b ? (state.secAxis === 'x' ? b.y + b.d / 2 : b.x + b.w / 2) : (state.secAxis === 'x' ? s.d : s.w) / 2; renderSecBar(); Views.draw(); };
    $('secPos').oninput = (e) => { state.secPos = Number(e.target.value); $('secPosV').textContent = state.secPos.toFixed(1) + ' m'; Views.draw(); };
  }
  function tip(t) { tipText = t || null; renderHint(); }
  function setTool(t) { if (has3d && Scene3D.busy()) Scene3D.commitOp(); state.tool = t; tipText = null; renderViewChrome(); drawStage(false); }
  function setView(v) { if (has3d && Scene3D.busy()) Scene3D.commitOp(); state.view = v; $('c3d').hidden = !(v === '3d' && has3d); $('stage').hidden = v === '3d' && has3d; $('annots').hidden = v !== '3d'; if (v === 'section' && !state.secPos) { const b = sectionBlock(); state.secPos = b ? b.y + b.d / 2 : project.site.d / 2; } if (v === 'plan') computeVisible(); renderViewChrome(); requestAnimationFrame(() => { if (v === '3d' && has3d) { Scene3D.resize(); Scene3D.refresh(true); } else { Views.draw(); } }); }
  function showLevel(key) { state.levelKey = key; state.highlight = []; if (state.view !== 'plan') setView('plan'); else { renderViewChrome(); Views.draw(); } }

  /* ---------- Layers ---------- */
  function renderLayers() {
    const A = state.aids, el = $('popLayers'), sun = window.Sun ? Sun.position(A.hour) : null, ctxOk = !!context();
    const tg = (k, label, sub, dis) => `<label class="toggle"><input type="checkbox" data-aid="${k}" ${A[k] ? 'checked' : ''} ${dis ? 'disabled' : ''}><span>${label}${sub ? `<small>${sub}</small>` : ''}</span></label>`;
    el.innerHTML = `<h4>Layers</h4><h5>Surrounding buildings</h5>${ctxOk ? `<label style="flex-direction:row;align-items:center;gap:10px">Opacity <input type="range" id="ctxOp" min="0" max="1" step="0.05" value="${A.contextOpacity}" style="flex:1"><span class="num" id="ctxOpV" style="width:38px;text-align:right">${Math.round(A.contextOpacity * 100)}%</span></label>` : '<p class="hint" style="margin:0">Choose a parcel on the Site tab to load the surrounding buildings.</p>'}
      ${tg('streetNames', 'Street names')}${tg('buildingNames', 'Building names', 'Named buildings within 260 m', !ctxOk)}
      <h5>Rules</h5>${tg('envelope', 'Height limit envelope', 'ODP basic height and the Board maximum')}${tg('setbacks', 'Guideline setback lines', 'Chosen under Restrictions on the Site tab')}${tg('daylight', 'Daylight on façades', 'Window fans, ODP §5')}${tg('shadow', 'Shadows', 'Fall equinox, Solar Access Guidelines')}
      ${A.shadow ? `<div class="sub">22 September · <span class="num" id="sunV">${hourLabel(A.hour)}</span><br><input type="range" id="sunHour" min="10" max="16" step="0.5" value="${A.hour}" aria-label="Time of day" style="width:100%"><br>${sun ? `Sun ${sun.altDeg.toFixed(0)}° high, from ${sun.azDeg.toFixed(0)}°` : ''}. New shadow on protected parks shows in red.</div>` : ''}
      <h5>View</h5>${tg('perspective', 'Perspective view', 'Off: orthographic axonometric')}${tg('entourage', 'Scale figures', 'Illustrative only; ignored by every calculation')}<h5>Model</h5>${tg('floorLines', 'Floor lines', 'Quiet storey divisions on the blocks')}${tg('dims', 'Footprint size on the selected block')}${tg('coreLabels', 'Core and stair labels', 'Otherwise shown only when a core is selected')}`;
    el.querySelectorAll('[data-aid]').forEach((i) => (i.onchange = () => { A[i.dataset.aid] = i.checked; saveUi(); if (i.dataset.aid === 'shadow') renderLayers(); if (i.dataset.aid === 'setbacks' && has3d) Scene3D.invalidateStatic(); syncOverlays(); renderViewChrome(); drawStage(true); }));
    const op = $('ctxOp'); if (op) { op.oninput = () => { A.contextOpacity = Number(op.value); A.context = A.contextOpacity > 0.01; $('ctxOpV').textContent = Math.round(A.contextOpacity * 100) + '%'; drawStage(true); }; op.onchange = saveUi; }
    const sh = $('sunHour'); if (sh) sh.oninput = (e) => { A.hour = Number(e.target.value); $('sunV').textContent = hourLabel(A.hour); drawStage(true); };
  }
  function syncOverlays() { document.querySelectorAll('[data-overlay]').forEach((i) => { i.checked = !!state.aids[i.dataset.overlay]; }); }
  const hourLabel = (h) => { const hh = Math.floor(h), mm = h % 1 ? '30' : '00'; return `${hh > 12 ? hh - 12 : hh}:${mm} ${hh >= 12 ? 'p.m.' : 'a.m.'}`; };

  /* ---------- Site ---------- */
  function renderSite() {
    const s = project.site, parcel = s.parcelIndex != null;
    $('locAddr').textContent = parcel ? s.addr : 'Custom site box'; $('locSub').textContent = parcel ? `${s.zone || 'Zone —'}${s.dd ? ' · Downtown District' : ''}` : `${s.w} × ${s.d} m · no parcel chosen`;
    drawPreview();
    const fr = (s.streets || []).map((x) => x.replace(/^\d+(-\d+)? /, ''));
    $('siteFacts').innerHTML = `<dt>Lot area</dt><dd>${fmt0(s.area || s.w * s.d)} m² ${provTag(parcel ? 'confirmed' : 'assumption')}</dd><dt>Zoning</dt><dd>${esc(s.zone || '—')}${s.dd ? ', Downtown District' : ''} ${provTag(parcel ? 'confirmed' : 'assumption')}</dd><dt>Frontage</dt><dd>${fmt(s.frontageLen || s.w, 1)} m${fr.length ? ` on ${esc(fr.join(' and '))}` : ''}${s.corner ? ' · corner lot' : ''} ${provTag(parcel ? 'derived' : 'assumption')}</dd><dt>View cones</dt><dd>${parcel ? (s.viewCones && s.viewCones.length ? esc(s.viewCones.join(', ')) + ' cross the lot' : 'none cross the lot') : 'not checked'} ${provTag(parcel ? 'confirmed' : 'assumption')}</dd>`;
    renderRestrictions();
    $('siteTenure').value = s.tenure; $('siteDate').value = s.applicationDate; $('siteSprink').checked = !!s.sprinklered; $('siteStreet').value = s.streetClass; $('siteW').value = s.w; $('siteD').value = s.d; $('siteFront').value = s.frontage; $('siteLane').value = s.lane; $('siteFrontLen').value = s.frontageLen || (s.frontage === 'S' || s.frontage === 'N' ? s.w : s.d); $('siteCorner').checked = !!s.corner;
  }
  function renderRestrictions() {
    const s = project.site, D = CODES.odp.density[s.densityArea] || {}, env = envelope();
    const dens = Object.keys(CODES.odp.density).filter((k) => !['clause', 'why'].includes(k)), hts = Object.keys(CODES.odp.height).filter((k) => /^\d$/.test(k));
    const row = (label, control, pk, src) => `<div class="rrow"><div class="rlabel"><span>${label}</span>${provTag(pk)}</div>${control}<div class="rsrc">${window.Cite ? Cite.html(src) : src}</div></div>`;
    const pv = { d: prov('densityArea'), h: prov('heightArea'), v: prov('viewCone') };
    $('restrictions').innerHTML =
      row('ODP density area', `<select id="siteDensity">${dens.map((k) => { const d = CODES.odp.density[k]; return `<option value="${k}" ${k === s.densityArea ? 'selected' : ''}>${k} · FSR ${d.fsr == null ? '—' : fmt(d.fsr, 2)}${d.dwell ? '' : ' · no new homes'}</option>`; }).join('')}</select>`, pv.d, pv.d === 'verify' ? 'The City sub-area map shows area C here, which the ODP splits into C1–C4 on Map 1. Pick the right one.' : pv.d === 'derived' ? `From the City's downtown sub-area map. FSR ${D.fsr != null ? fmt(D.fsr, 2) + ' max' : '—'}${D.resCap ? `, residential up to ${fmt(D.resCap, 2)}` : ''} (ODP §3(1)).` : `Chosen by you. FSR ${D.fsr != null ? fmt(D.fsr, 2) + ' max' : '—'} (ODP §3(1)).`) +
      row('ODP height area', `<select id="siteHeight">${hts.map((k) => { const h = CODES.odp.height[k]; return `<option value="${k}" ${k === s.heightArea ? 'selected' : ''}>${k} · ${h.planes ? 'height planes' : fmt(h.basic, 1) + ' m'}${h.max ? ', up to ' + fmt(h.max, 1) + ' m' : ''}</option>`; }).join('')}</select>`, pv.h, pv.h === 'verify' ? 'Guessed from the density area. Confirm the height area on ODP Map 3, then choose it here.' : `${env.basic ? fmt(env.basic, 1) + ' m basic' : '—'}${env.max ? `, Board may allow ${fmt(env.max, 1)} m` : ''} (ODP §4 Table 1).`) +
      row('View cone limit', `<span class="unit"><input type="number" id="siteCone" step="0.1" placeholder="none" value="${s.viewConeH == null ? '' : s.viewConeH}"><span>m</span></span>`, pv.v, pv.v === 'verify' ? `Cones ${esc((s.viewCones || []).join(', '))} cross this lot. Read the cone height from the View Protection Guidelines and enter it.` : s.viewConeH != null ? 'Entered by you; it caps the height checks.' : project.site.parcelIndex != null ? 'No protected view cone crosses this lot (City view cone layer).' : 'Enter a height if a view cone crosses your site.') +
      row('Ground-floor retail (Map 2)', `<select id="siteRetail"><option value="perm">Permitted</option><option value="req">Required, continuous</option><option value="some">Some required (25%)</option><option value="proh">Prohibited</option></select>`, 'assumption', 'Not read from ODP Map 2 for this lot. Check the street on Map 2 and set it.') +
      row('Guideline setbacks', `<select id="siteSetback">${Object.entries(CODES.odp.guidelineSetbacks).filter(([k]) => !['clause', 'why'].includes(k)).map(([k, g]) => `<option value="${k}" ${k === (s.setbackSet || 'none') ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select>`, 'assumption', esc(((CODES.odp.guidelineSetbacks[s.setbackSet || 'none'] || {}).source || '')) + ' Lines show in the model; blocks inside them are flagged for review.') +
      row('Neighbouring towers', `<select id="siteAdj"><option value="none">None</option><option value="one">One side</option><option value="both">Both sides</option></select>`, 'assumption', 'Sets the tower floor-plate limit (floor-plate bulletin). Check the neighbouring lots.');
    $('siteRetail').value = s.retailMap2 || 'perm'; $('siteAdj').value = s.adjTowers || 'none';
    const nv = [pv.d, pv.h, pv.v].filter((x) => x === 'verify').length; $('restrCount').innerHTML = nv ? `<span class="prov verify">${nv} need${nv === 1 ? 's' : ''} verification</span>` : '';
    const onSel = (id, k, conf) => { $(id).onchange = (e) => mutate(() => { project.site[k] = e.target.value; if (conf) project.site.auto = Object.assign({}, project.site.auto, { [k]: 'edited' }); }); };
    onSel('siteDensity', 'densityArea', true); onSel('siteHeight', 'heightArea', true); onSel('siteRetail', 'retailMap2'); onSel('siteAdj', 'adjTowers'); $('siteSetback').onchange = (e) => mutate(() => { project.site.setbackSet = e.target.value; if (has3d) Scene3D.invalidateStatic(); });
    $('siteCone').onchange = (e) => mutate(() => { project.site.viewConeH = e.target.value === '' ? null : Number(e.target.value); });
  }
  /* small map preview: the chosen parcel and its neighbours */
  function drawPreview() {
    const cv = $('mapPreview'), r = cv.parentElement.getBoundingClientRect(); const W = Math.max(100, r.width), H = 150, dpr = window.devicePixelRatio || 1; cv.width = W * dpr; cv.height = H * dpr; const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cs = getComputedStyle(document.documentElement), c = (n) => cs.getPropertyValue(n).trim(); g.fillStyle = c('--panel2'); g.fillRect(0, 0, W, H);
    const s = project.site; if (s.parcelIndex == null || !window.CITY) { g.strokeStyle = c('--site-line'); g.lineWidth = 2; const k = Math.min((W - 40) / s.w, (H - 40) / s.d); g.strokeRect(W / 2 - s.w * k / 2, H / 2 - s.d * k / 2, s.w * k, s.d * k); g.fillStyle = c('--muted'); g.font = '12px Inter, sans-serif'; g.textAlign = 'center'; g.fillText('Click to find a parcel', W / 2, H - 10); return; }
    const P = CITY.parcels, me = P[s.parcelIndex].p, cx = me.reduce((a, q) => a + q[0], 0) / me.length, cy = me.reduce((a, q) => a + q[1], 0) / me.length, sc = Math.min(W, H) / 220;
    const toS = (q) => [W / 2 + (q[0] - cx) * sc, H / 2 - (q[1] - cy) * sc];
    g.strokeStyle = c('--street'); g.lineWidth = 12 * sc; g.lineCap = 'round'; for (const st of CITY.streets) { if (Math.hypot(st.p[0][0] - cx, st.p[0][1] - cy) > 300) continue; g.beginPath(); st.p.forEach((q, i) => { const [x, y] = toS(q); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); }
    const poly = (ring, fill, stroke, lw) => { g.beginPath(); ring.forEach((q, i) => { const [x, y] = toS(q); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); } };
    for (const p of P) { const q = p.p[0]; if (Math.abs(q[0] - cx) > 160 || Math.abs(q[1] - cy) > 120) continue; poly(p.p, c('--panel'), c('--line'), 1); }
    poly(me, c('--accent-soft'), c('--accent'), 2);
  }
  let mapMounted = false;
  function openMap() {
    const dlg = $('mapDlg'); if (!window.Site || !Site.available()) { toast('City data is not loaded, so the map is unavailable.'); return; }
    dlg.showModal(); if (!mapMounted && window.SiteMap) { mapMounted = true; SiteMap.mount($('mapCanvas'), { onPick: (i) => { pickParcel(i); $('mapSel').textContent = `Selected: ${CITY.parcels[i].a || 'parcel'}`; }, tooltip: $('mapTip') }); }
    requestAnimationFrame(() => { if (project.site.parcelIndex != null) { SiteMap.focus(project.site.parcelIndex, 0.9); SiteMap.setPicked(project.site.parcelIndex); } else SiteMap.fitAll(); });
    $('mapSel').textContent = project.site.addr ? `Current site: ${project.site.addr}` : 'No parcel chosen yet';
    renderMapLegend(); setTimeout(() => $('mapSearch').focus(), 50);
  }
  function renderMapLegend() { const on = $('mapLegendToggle').checked; $('mapLegend').hidden = !on; $('mapLegend').innerHTML = [['#d4e6ed', 'Downtown District (DD)'], ['#e5dcf0', 'CD-1 comprehensive'], ['#f3d1cc', 'RM residential'], ['#f6efd4', 'C-5 / C-6 commercial'], ['#f4ddc5', 'HA historic area'], ['#d5e8d9', 'Waterfront / other ODPs'], ['#e7e9ea', 'Other zones']].map(([c, t]) => `<span><i class="sw" style="background:${c}"></i>${t}</span>`).join('') + '<span><i class="sw" style="background:var(--accent-soft);box-shadow:inset 0 0 0 2px var(--accent)"></i>Selected parcel</span>'; }
  function pickParcel(i) {
    if (!window.Site) return; const ns = Site.siteFromParcel(i); delete ns.frame;
    mutate(() => { const old = project.site;
      project.site = Object.assign({}, old, ns, { tenure: old.tenure, sprinklered: old.sprinklered, applicationDate: old.applicationDate, streetClass: old.streetClass, viewConeH: null, retailMap2: old.retailMap2 || 'perm', adjTowers: old.adjTowers || 'none', socialShare: old.socialShare || 0 });
      if (!project.site.densityArea) project.site.densityArea = old.densityArea; if (!project.site.heightArea) project.site.heightArea = old.heightArea;
      for (const b of project.blocks) { b.w = Math.min(b.w, project.site.w); b.d = Math.min(b.d, project.site.d); b.x = Math.min(Math.max(0, b.x), project.site.w - b.w); b.y = Math.min(Math.max(0, b.y), project.site.d - b.d); }
      for (const r of project.ramps) { const rr = Plans.rampRect(r); r.x = Math.min(Math.max(0, r.x), Math.max(0, project.site.w - rr.w)); r.y = Math.min(Math.max(0, r.y), Math.max(0, project.site.d - rr.d)); }
      ctxKey = null; Plans.clearCache(); Views.refit(); if (has3d) Scene3D.invalidateStatic(); if (window.SiteMap) SiteMap.setPicked(i); }, `${ns.addr}: ${ns.zone || 'zone unknown'}`);
    if (has3d) Scene3D.resetView();
  }
  function bindSite() {
    const num = [['siteW', 'w'], ['siteD', 'd'], ['siteFrontLen', 'frontageLen']], str = [['siteFront', 'frontage'], ['siteLane', 'lane'], ['siteTenure', 'tenure'], ['siteStreet', 'streetClass'], ['siteDate', 'applicationDate']];
    for (const [id, k] of num) $(id).addEventListener('change', (e) => { const v = e.target.value === '' ? null : Number(e.target.value); mutate(() => { project.site[k] = v; if (k === 'w' || k === 'd') { Views.refit(); if (project.site.parcelIndex != null) { delete project.site.poly; delete project.site.edges; } if (has3d) Scene3D.invalidateStatic(); } }); });
    for (const [id, k] of str) $(id).addEventListener('change', (e) => mutate(() => { project.site[k] = e.target.value; if ((k === 'frontage' || k === 'lane') && has3d) Scene3D.invalidateStatic(); }));
    $('siteCorner').addEventListener('change', (e) => mutate(() => { project.site.corner = e.target.checked; }));
    $('siteSprink').addEventListener('change', (e) => mutate(() => { project.site.sprinklered = e.target.checked; Plans.clearCache(); }));
    $('mapPreviewBtn').onclick = openMap; $('btnChangeSite').onclick = openMap; $('mapDone').onclick = () => $('mapDlg').close(); $('mapClose').onclick = () => $('mapDlg').close();
    $('mapLegendToggle').onchange = renderMapLegend; $('mapLabels').onchange = () => SiteMap.toggleZones(); $('mapFit').onclick = () => SiteMap.fitAll();
    const res = $('mapResults'), inp = $('mapSearch'); const go = (i) => { res.hidden = true; SiteMap.focus(i); pickParcel(i); $('mapSel').textContent = `Selected: ${CITY.parcels[i].a || 'parcel'}`; };
    inp.addEventListener('input', () => { const hits = Site.search(inp.value); res.hidden = !hits.length || !inp.value.trim(); res.innerHTML = hits.map((h) => `<button data-i="${h.i}">${esc(h.a)}</button>`).join(''); res.querySelectorAll('button').forEach((b) => (b.onclick = () => go(Number(b.dataset.i)))); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const hits = Site.search(inp.value); if (hits.length) go(hits[0].i); } });
  }

  /* ---------- Design ---------- */
  const hOf = (b) => (b.use === 'core' ? b.f2f : b.floors * b.f2f);
  const blockMeta = (b) => b.use === 'core' ? `Core · ${b.stairs || 2} stair${(b.stairs || 2) > 1 ? 's' : ''}` : `${Model.USE_LABEL[b.use]} · ${b.floors} storey${b.floors > 1 ? 's' : ''}${b.z0 < -0.01 ? ' below grade' : ''}${window.Form && Form.active(b) ? ' · ' + Form.describe(b) : ''}`;
  /* ---------- Form tab: the sculpted-form editor (below) plus the collapsed block list (Occupancy or Stack) and the add-a-program cards ---------- */
  const PALETTE = [['retail', 'Retail', 'Group E'], ['restaurant', 'Restaurant', 'Group A-2'], ['office', 'Office', 'Group D'], ['residential', 'Residential', 'Group C'], ['amenity', 'Amenity', 'Group C'], ['parking-above', 'Parking', 'Group F-3 · above grade'], ['parking', 'Parking', 'Group F-3 · below grade'], ['core', 'Core', 'Stair · stairs, lifts, shafts']];
  const OCC = [['Group C · Residential', 'homes and the amenity that serves them', ['residential', 'amenity']], ['Group D · Business and personal services', 'offices', ['office']], ['Group E · Mercantile', 'shops', ['retail']], ['Group A-2 · Assembly', 'restaurants', ['restaurant']], ['Group F-3 · Storage garage', 'parking, above or below grade', ['parking']], ['Cores', 'stairs, lifts and shafts · not an occupancy', ['core']]];
  const lineVar = (u) => `var(--${u === 'residential' ? 'res' : u}-line)`;
  const blockArea = (b) => { if (b.use === 'core') return 0; const fl = window.Form && Form.active(b) ? Form.floors(b, project) : null; return fl ? fl.reduce((a, f) => a + f.area, 0) : b.w * b.d * b.floors; };
  const storeysOf = (b) => (b.use === 'core' ? levels.filter((L) => L.cores.includes(b)).length : b.floors);
  /* "L10–L17 · 8F" for a block that spans several storeys; P-levels below grade; a storey count for cores */
  function rangeLabel(b) { if (b.use === 'core') return `${storeysOf(b)}F`; const mine = levels.filter((L) => L.blocks.includes(b)); if (!mine.length) return `${b.floors}F`; const labs = mine.map((L) => L.label); if (b.z0 < -0.01) { const lo = Math.max(...labs), hi = Math.min(...labs); return lo === hi ? `P${-lo}` : `P${-lo}–P${-hi} · ${b.floors}F`; } const lo = Math.min(...labs), hi = Math.max(...labs); return lo === hi ? `L${lo}` : `L${lo}–L${hi} · ${b.floors}F`; }
  function failIds() { const out = new Set(); for (const r of rows) { if (r.verdict !== 'fail') continue; for (const b of project.blocks) if (!out.has(b.id) && rowTouches(r, b)) out.add(b.id); } return out; }
  function renderDesign() {
    const n = project.blocks.length; $('blocksAside').textContent = n ? `${n} block${n === 1 ? '' : 's'}` : 'none';
    document.querySelectorAll('[data-pview]').forEach((b) => { b.classList.toggle('on', b.dataset.pview === state.progView); b.setAttribute('aria-pressed', String(b.dataset.pview === state.progView)); b.onclick = () => { state.progView = b.dataset.pview; saveUi(); renderDesign(); }; });
    $('clearAll').disabled = !n; $('clearAll').onclick = () => mutate(() => { project.blocks = []; project.ramps = []; state.selected = null; }, 'Removed every block. Undo brings them back.');
    const flagged = failIds(), stack = project.blocks.slice().sort((a, b) => Model.blockTop(b) - Model.blockTop(a) || b.z0 - a.z0);
    const row = (b, drag) => `<div class="lrow ${b.id === state.selected ? 'on' : ''} ${b.hidden ? 'hiddenb' : ''}" data-id="${b.id}" ${drag ? 'draggable="true"' : ''} tabindex="0" role="button" aria-pressed="${b.id === state.selected}" title="${esc(blockMeta(b))} · ${fmt(b.w, 2)} × ${fmt(b.d, 2)} m">
        ${drag ? '<span class="dgrip" aria-hidden="true">⋮⋮</span>' : '<span class="nogrip"></span>'}<i class="sw" style="background:${Views.useCol(b.use)};box-shadow:inset 0 0 0 1px ${lineVar(b.use)}"></i><span class="nm">${esc(b.name)}</span><span class="fl" title="Storeys this block occupies">${rangeLabel(b)}</span>${flagged.has(b.id) ? '<span class="flag" title="Fails a check" aria-label="Fails a check"></span>' : '<span class="noflag"></span>'}
        <button class="ic ${b.hidden ? 'on' : ''}" data-act="hide" title="${b.hidden ? 'Show' : 'Hide'} (H)" aria-label="${b.hidden ? 'Show' : 'Hide'} ${esc(b.name)}">${ICON(b.hidden ? 'eyeoff' : 'eye')}</button><button class="ic ${b.locked ? 'on' : ''}" data-act="lock" title="${b.locked ? 'Unlock' : 'Lock'} (L)" aria-label="${b.locked ? 'Unlock' : 'Lock'} ${esc(b.name)}">${ICON(b.locked ? 'lock' : 'unlock')}</button><button class="ic" data-act="edit" title="Edit its size, storeys and form" aria-label="Edit ${esc(b.name)}">${ICON('chev')}</button></div>`;
    if (!n) $('blockList').innerHTML = '<div class="empty">No blocks yet. Add a program above, or pick a starting massing on the Massing tab.</div>';
    else if (state.progView === 'stack') $('blockList').innerHTML = '<p class="hint">Top of the list is the top of the stack. Drag a row to reorder: each block then sits on whatever is below it.</p>' + stack.map((b) => row(b, true)).join('');
    else $('blockList').innerHTML = OCC.map(([lab, sub, uses]) => { const list = stack.filter((b) => uses.includes(b.use)); if (!list.length) return ''; const core = uses[0] === 'core', gfa = list.filter((b) => !b.hidden).reduce((a, b) => a + blockArea(b), 0), progs = [...new Set(list.map((b) => Model.USE_LABEL[b.use]))].join(', ');
      return `<div class="occ"><div class="occh"><b>${lab}</b><span class="mono">${core ? `${list.length} ${list.length === 1 ? 'core' : 'cores'}` : fmt0(gfa) + ' m²'}</span></div><div class="occs">${core ? sub : progs}</div>${list.map((b) => row(b, false)).join('')}</div>`; }).join('');
    $('blockList').querySelectorAll('.lrow').forEach((r) => { const b = project.blocks.find((x) => x.id === r.dataset.id); if (!b) return;
      r.onclick = (e) => { if (e.target.closest('.ic')) return; select(b.id); };
      r.onkeydown = (e) => { if (e.target === r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(b.id); } };
      r.querySelector('[data-act="hide"]').onclick = () => blockAction('hide', b.id); r.querySelector('[data-act="lock"]').onclick = () => blockAction('lock', b.id);
      r.querySelector('[data-act="edit"]').onclick = () => { select(b.id); const nm = $('rName'); if (nm) nm.focus(); };
      if (r.draggable) { r.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', b.id); e.dataTransfer.effectAllowed = 'move'; r.classList.add('dragging'); });
        r.addEventListener('dragend', () => r.classList.remove('dragging'));
        r.addEventListener('dragover', (e) => { e.preventDefault(); const rc = r.getBoundingClientRect(), top = e.clientY < rc.top + rc.height / 2; r.classList.toggle('dropTop', top); r.classList.toggle('dropBot', !top); });
        r.addEventListener('dragleave', () => r.classList.remove('dropTop', 'dropBot'));
        r.addEventListener('drop', (e) => { e.preventDefault(); r.classList.remove('dropTop', 'dropBot'); const id = e.dataTransfer.getData('text/plain'), from = project.blocks.find((x) => x.id === id); if (!from || from === b) return; const rc = r.getBoundingClientRect(), top = e.clientY < rc.top + rc.height / 2; const order = stack.filter((x) => x !== from); order.splice(order.indexOf(b) + (top ? 0 : 1), 0, from); restack(order, from); }); } });
    $('rampCount').textContent = project.ramps.length || '';
    $('rampList').innerHTML = project.ramps.length ? project.ramps.map((r, i) => `<button class="brow ${r.id === state.selected ? 'on' : ''}" data-id="${r.id}"><i class="sw" style="background:${Views.useCol('ramp')}"></i><span><span class="bn">Ramp ${i + 1}</span><span class="bm">Descends ${r.dir} · ${r.w} × ${r.len} m · ${(((r.zTop - r.zBottom) / r.len) * 100).toFixed(1)}%</span></span><span class="bs">${fmt(r.zBottom, 1)} m</span></button>`).join('') : '<div class="empty">No ramp. Underground parking needs one.</div>';
    $('rampList').querySelectorAll('.brow').forEach((el) => (el.onclick = () => select(el.dataset.id)));
    if (window.Form) renderFormTab();
  }
  /* list order (top first) becomes the stacking order: each block above grade settles on the highest block below it that it overlaps.
     Cores and below-grade blocks keep their elevation. */
  /* settle blocks bottom-up: each above-grade block sits on the highest block below it that it overlaps, plus its own open gap */
  function settle(order) { const done = []; for (const b of order) { if (b.use === 'core' || b.z0 < -0.01) { done.push(b); continue; } let z = 0; for (const o of done) if (o.use !== 'core' && !o.hidden && o.z0 >= -0.01 && Model.rectsOverlap(b, o)) z = Math.max(z, Model.blockTop(o)); b.z0 = Math.round((z + (b.gapBelow || 0)) * 100) / 100; done.push(b); } return done; }
  const byZ = () => project.blocks.slice().sort((p, q) => p.z0 - q.z0 || Model.blockTop(p) - Model.blockTop(q));
  function restack(order, moved) { mutate(() => { project.blocks = settle(order.slice().reverse()); }, moved ? `Moved ${moved.name} in the stack${moved.use === 'core' || moved.z0 < -0.01 ? '; cores and below-grade blocks keep their elevation' : ''}` : 'Restacked'); }
  /* ---------- program-stack operations (Edit tab) ---------- */
  function splitBlock(id, k) { const b = project.blocks.find((x) => x.id === id); if (!b || b.use === 'core' || !(k >= 1) || k >= b.floors) return; const nUp = b.floors - k, msg = `Split ${b.name} at storey ${k + 1}: ${k} storey${k === 1 ? '' : 's'} below, ${nUp} above`;
    mutate(() => { const c = Model.block(Object.assign({}, b, { id: undefined, name: b.name + ' upper', z0: Math.round((b.z0 + k * b.f2f) * 100) / 100, floors: nUp, gapBelow: 0, form: b.form ? Form.clone(b.form) : undefined, locked: false })); b.floors = k; project.blocks.splice(project.blocks.indexOf(b) + 1, 0, c); state.selected = c.id; }, msg); }
  function mergeBlocks(lowId, highId) { const a0 = project.blocks.find((x) => x.id === lowId), b0 = project.blocks.find((x) => x.id === highId); if (!a0 || !b0 || a0 === b0) return; const msg = `Merged ${b0.name} into ${a0.name}`;
    mutate(() => { const H = a0.floors * a0.f2f + b0.floors * b0.f2f; a0.floors = Math.max(1, Math.round(H / a0.f2f)); project.blocks = settle(byZ().filter((x) => x !== b0)); state.selected = a0.id; }, msg); }
  function reorderStack(movingId, targetId, above) { const mv = project.blocks.find((x) => x.id === movingId), tg = project.blocks.find((x) => x.id === targetId); if (!mv || !tg || mv === tg) return; if (mv.locked) { toast(`${mv.name} is locked`); return; }
    mutate(() => { const order = byZ().filter((x) => x !== mv); const i = order.indexOf(tg); order.splice(above ? i + 1 : i, 0, mv); if (!Model.rectsOverlap(mv, tg)) { mv.x = Model.snap(tg.x + (tg.w - Math.min(mv.w, tg.w)) / 2); mv.y = Model.snap(tg.y + (tg.d - Math.min(mv.d, tg.d)) / 2); mv.w = Math.min(mv.w, tg.w); mv.d = Math.min(mv.d, tg.d); } project.blocks = settle(order); }, `Moved ${mv.name} ${above ? 'above' : 'below'} ${tg.name}; elevations recalculated from each block's floor-to-floor`); }
  function placeAt(id, z) { const b = project.blocks.find((x) => x.id === id); if (!b) return; mutate(() => { const sup = project.blocks.filter((o) => o !== b && o.use !== 'core' && !o.hidden && o.z0 >= -0.01 && Model.rectsOverlap(b, o) && Model.blockTop(o) <= z + 0.05).reduce((m, o) => Math.max(m, Model.blockTop(o)), 0); b.gapBelow = Math.max(0, Math.round((z - sup) * 100) / 100); project.blocks = settle(byZ()); }, `${b.name} starts at ${fmt(z, 1)} m`); }
  function setGap(id, g) { const b = project.blocks.find((x) => x.id === id); if (!b) return; mutate(() => { b.gapBelow = Math.max(0, g || 0); project.blocks = settle(byZ()); }, g ? `Open level of ${fmt(g, 1)} m under ${b.name}` : `Closed the open level under ${b.name}`); }
  function transferBlock(id, targetTopId) { const mv = project.blocks.find((x) => x.id === id), tg = project.blocks.find((x) => x.id === targetTopId); if (!mv || !tg) return; const msg = `Moved ${mv.name} onto ${tg.name}`;
    mutate(() => { mv.w = Math.min(mv.w, tg.w); mv.d = Math.min(mv.d, tg.d); mv.x = Model.snap(tg.x + (tg.w - mv.w) / 2); mv.y = Model.snap(tg.y + (tg.d - mv.d) / 2); mv.gapBelow = 0; const order = byZ().filter((x) => x !== mv); order.push(mv); project.blocks = settle(order); }, msg); }
  function applyMixPlan(plan) { mutate(() => { for (const q of plan) { const b = project.blocks.find((x) => x.id === q.b.id); if (b && !b.locked) b.floors = Math.max(1, b.floors + q.dF); } project.blocks = settle(byZ()); }, 'Adjusted storeys on unlocked blocks to return to the program mix'); }
  function setBrief(fn, live) { if (window.Brief) Brief.ensure(project); fn(project.brief); if (genLinked() && window.Gen) { Gen.regen(!live); if (!live) return; } if (live) { renderMetrics(); return; } if (window.Brief) Brief.render(); if (window.Gen) Gen.render(); if (window.Stack) Stack.render(); renderMetrics(); const ma = $('mixAside'); if (ma && window.Brief) { const A = Brief.areas(project); ma.innerHTML = A.ok ? '100%' : `<span class="prov verify">${fmt(A.total, 1)}%</span>`; } }
  /* the generator's result becomes the model: live (while a slider moves) or committed (one undo step); blocks keep ids, locks and forms by name */
  function applyGenerated(r, live) { const param = { mode: 'gen', key: r.key, P: r.P, seed: r.seed }; applyMassing(r, !live, param); if (!live) { if (state.workspace !== 'design') setWorkspace('design'); toast(`${r.label}: ${fmt(r.height, 1)} m, ${r.storeys} storeys${r.conflicts.length ? ` · ${r.conflicts.length} conflict${r.conflicts.length === 1 ? '' : 's'} to resolve` : ''}`); } }
  const genLinked = () => true; // always live: a change to the brief, the typology or a parameter regenerates the massing at once (hand edits are replaced; Undo restores them)
  function programAreas() { return window.Brief ? Brief.areas(project, Model.totals(massProject())) : null; }
  function addBlock(use, above) {
    const L = currentLevel(), T = Model.totals(project); const z0 = use === 'parking' && above ? 0 : use === 'parking' ? Math.min(-3.2, T.minZ) : (L && state.view === 'plan' ? L.z : use === 'core' ? Math.min(0, T.minZ) : T.maxZ);
    const b = Model.block({ use, x: Model.snap(project.site.w * 0.25), y: Model.snap(project.site.d * 0.25), w: use === 'core' ? 12 : Math.min(20, project.site.w), d: use === 'core' ? 8 : Math.min(16, project.site.d), z0, floors: use === 'core' ? 1 : use === 'parking' ? 1 : 4, f2f: use === 'core' ? Math.max(10, T.maxZ - Math.min(0, T.minZ)) : null });
    mutate(() => { project.blocks.push(b); state.selected = b.id; state.issue = null; }, `Added ${b.name}`); closePops(); if (state.workspace !== 'design') setWorkspace('design');
  }
  function renderAddMenu() { $('popAdd').innerHTML = Model.USES.map((u) => `<button data-use="${u}"><i class="sw" style="background:${Views.useCol(u)}"></i>${Model.USE_LABEL[u]}</button>`).join('') + `<button data-ramp="1"><i class="sw" style="background:${Views.useCol('ramp')}"></i>Parking ramp</button>`; $('popAdd').querySelectorAll('[data-use]').forEach((b) => (b.onclick = () => addBlock(b.dataset.use))); $('popAdd').querySelector('[data-ramp]').onclick = () => { addRamp(); closePops(); }; }
  function addRamp() { const r = Model.ramp({ x: Model.snap(Math.max(0, project.site.w - 8)), y: 0, w: 6.1, len: Math.min(30, project.site.d), dir: 'N', zTop: 0, zBottom: Math.min(-3.2, Model.totals(project).minZ) }); mutate(() => { project.ramps.push(r); state.selected = r.id; }, 'Added a ramp'); }
  function deleteSelected() { const sel = selected(); if (!sel) return; const nm = sel.name || 'Ramp'; mutate(() => { project.blocks = project.blocks.filter((b) => b !== sel); project.ramps = project.ramps.filter((r) => r !== sel); state.selected = null; }, `Deleted ${nm}. Undo brings it back.`); }
  function rotateSelected() { const sel = selected(); if (!sel) return; if (sel.locked) { toast(`${sel.name} is locked`); return; } const s = project.site;
    mutate(() => { if (sel.len != null) { const order = ['N', 'E', 'S', 'W']; sel.dir = order[(order.indexOf(sel.dir) + 1) % 4]; const rr = Plans.rampRect(sel); sel.x = Math.min(Math.max(0, sel.x), Math.max(0, s.w - rr.w)); sel.y = Math.min(Math.max(0, sel.y), Math.max(0, s.d - rr.d)); return; }
      const cx = sel.x + sel.w / 2, cy = sel.y + sel.d / 2, w = sel.d, d = sel.w; sel.w = w; sel.d = d; sel.x = Model.snap(cx - w / 2); sel.y = Model.snap(cy - d / 2); }, `Rotated ${sel.name || 'ramp'} 90°`); }
  function blockAction(act, id) {
    const b = project.blocks.find((x) => x.id === id); if (!b) return; const s = project.site;
    const msg = { dup: 'Duplicated', stack: 'Stacked a copy on top', splitLR: 'Split side to side', splitFB: 'Split front to back', splitUD: b.floors >= 2 ? 'Split by storeys' : 'One storey cannot be split', lock: b.locked ? 'Unlocked' : 'Locked', hide: b.hidden ? 'Shown' : 'Hidden' }[act];
    mutate(() => {
      if (act === 'dup') { const c = Model.block(Object.assign({}, b, { id: undefined, name: b.name + ' copy', x: Math.min(b.x + b.w + 1, Math.max(0, s.w - b.w)) })); project.blocks.push(c); state.selected = c.id; }
      else if (act === 'stack') { const c = Model.block(Object.assign({}, b, { id: undefined, name: b.name + ' upper', z0: Model.blockTop(b) })); project.blocks.push(c); state.selected = c.id; }
      else if (act === 'splitLR') { const w1 = Model.snap(b.w / 2); const c = Model.block(Object.assign({}, b, { id: undefined, name: b.name + ' east', x: b.x + w1, w: b.w - w1 })); b.w = w1; b.name += ' west'; project.blocks.push(c); }
      else if (act === 'splitFB') { const d1 = Model.snap(b.d / 2); const c = Model.block(Object.assign({}, b, { id: undefined, name: b.name + ' rear', y: b.y + d1, d: b.d - d1 })); b.d = d1; b.name += ' front'; project.blocks.push(c); }
      else if (act === 'splitUD') { if (b.floors >= 2) { const f1 = Math.floor(b.floors / 2); const c = Model.block(Object.assign({}, b, { id: undefined, name: b.name + ' upper', z0: b.z0 + f1 * b.f2f, floors: b.floors - f1 })); b.floors = f1; b.name += ' lower'; project.blocks.push(c); } }
      else if (act === 'lock') b.locked = !b.locked; else if (act === 'hide') b.hidden = !b.hidden;
    }, msg);
  }

  /* ---------- Check ---------- */
  function rowTouches(r, b) { if (r.block === b.id || (r.block && String(r.block).startsWith(b.id + '~'))) return true; if (r.levels && r.levels.some((k) => { const L = levels.find((l) => l.key === k); return L && (L.blocks.some((x) => x === b || x.src === b.id) || L.cores.includes(b)); })) return true; const t = target(r); return !!(t && t.blocks && t.blocks.includes(b.id) && t.blocks.length <= 3); }
  function renderCheck() {
    if (state.workspace !== 'check') return;
    Checks.renderList($('checkList'), rows, state, api, pickIssue);
    const res = project.blocks.filter((b) => b.use === 'residential' && !b.hidden), dl = res.length ? daylight() : [];
    $('dayPanel').innerHTML = res.length ? `<p class="hint">Every window position needs a clear view fan over 24 m (ODP §5). Inspect a residential block to see its fans.</p>${res.map((b) => { const r = dl.find((x) => x.block === b), pct = r ? Math.round(r.worst * 100) : null; const st = pct == null ? '' : pct === 100 ? '<span class="st-pass" style="color:var(--pass)">✓ all clear</span>' : `<span class="${pct >= 80 ? 'st-review' : 'st-fail'}">${pct >= 80 ? '!' : '✕'} ${pct}% clear</span>`; return `<div class="dayrow"><span>${esc(b.name)} · ${st}</span><button data-day="${b.id}">Inspect</button></div>`; }).join('')}` : '<div class="empty">Select a residential block to inspect daylight. There are none yet; add one on the Program tab.</div>';
    $('dayPanel').querySelectorAll('[data-day]').forEach((b) => (b.onclick = () => { state.aids.daylight = true; saveUi(); syncOverlays(); select(b.dataset.day); drawStage(true); }));
    syncOverlays();
  }
  function pickIssue(id) { state.issue = id; state.focusIds = []; renderCheck(); renderRight(); drawStage(false); }
  function target(r) {
    const mass = project.blocks.filter((b) => b.use !== 'core' && !b.hidden && Model.blockTop(b) > 0.01), ids = (list) => [...new Set(list.map((b) => b.src || b.id))];
    const tallest = () => { const t = Math.max(0, ...mass.map((b) => Model.blockTop(b))); return mass.filter((b) => Model.blockTop(b) >= t - 0.1); };
    const towers = () => mass.filter((b) => Model.blockTop(b) > 18 && (b.use === 'residential' || b.use === 'office'));
    const byUse = (...u) => project.blocks.filter((b) => u.includes(b.use) && !b.hidden);
    const parkLevel = () => levels.filter((l) => l.uses.includes('parking')).sort((a, b) => b.z - a.z)[0];
    if (r.plan) { const L = levels.find((l) => l.key === (r.levels || [])[0]); return { view: 'plan', level: L ? L.key : null, rooms: r.rooms || [], heat: /travel/i.test(r.title), blocks: L ? ids(L.blocks) : [], hint: `Opens the plan of storey ${L ? L.name : ''}${/travel/i.test(r.title) ? ' with the exit distance map' : ''}.` }; }
    if (r.block) return { view: '3d', blocks: [r.block], layers: /^daylight/.test(r.id) ? { daylight: true } : null, hint: 'Highlights the block in the 3D view.' };
    if (r.park) return { view: '3d', blocks: ids(tallest()), layers: { shadow: true }, hint: 'Turns on shadows. New shadow on the park shows in red; set the time under Layers.' };
    const id = r.id;
    if (['height', 'hbp', 'granville', 'viewcone', 'highbldg', 'singlestair', 'construction', 'schedj'].includes(id)) return { view: '3d', blocks: ids(tallest()), layers: { envelope: true }, hint: 'Highlights the tallest block against the height limit envelope.' };
    if (['plate', 'towersep'].includes(id)) return { view: '3d', blocks: ids(towers()), hint: 'Highlights the tower portions above 18 m.' };
    if (['rescap', 'dwell', 'ly-mix', 'ly-depth', 'ly-corner'].includes(id)) return { view: '3d', blocks: ids(byUse('residential')), hint: 'Highlights the residential blocks.' };
    if (['officemax', 'ly-office'].includes(id)) return { view: '3d', blocks: ids(byUse('office')), hint: 'Highlights the office blocks.' };
    if (['retailmap2', 'ly-retail'].includes(id)) return { view: '3d', blocks: ids(byUse('retail', 'restaurant')), hint: 'Highlights the ground-floor retail and restaurant blocks.' };
    if (id === 'ly-boh') return { view: '3d', blocks: ids(byUse('restaurant')), hint: 'Highlights the restaurant blocks.' };
    if (['fsr', 'nonresmin', 'firesep'].includes(id)) return { view: '3d', blocks: ids(mass), hint: 'Highlights every block that counts toward floor area.' };
    if (/^pk-|^ly-park/.test(id)) { const L = parkLevel(); return L ? { view: 'plan', level: L.key, blocks: ids(L.blocks), hint: `Opens the parking plan at ${L.name}.` } : null; }
    return null;
  }
  function showInModel(r) {
    const t = target(r); if (!t) return; state.focusIds = t.blocks || [];
    if (t.layers) { Object.assign(state.aids, t.layers); saveUi(); syncOverlays(); }
    if (t.view === 'plan') { if (t.level) state.levelKey = t.level; state.highlight = t.rooms || []; state.heat = !!t.heat; setView('plan'); }
    else { if (state.view !== '3d') setView('3d'); else drawStage(true); }
    toast(t.hint);
  }

  /* ---------- tower form (the massing engine of the Supertall Massing Lab, form.js) ---------- */
  /* typology tiles drawn like the Supertall Massing Lab's (26 × 38 silhouettes) */
  const TYPO_ICON = { none: '<rect x="7" y="2" width="12" height="34"/>', prism: '<polygon points="7,2 19,2 19,36 7,36"/><path d="M7 13h12M7 24h12" style="fill:none"/>', taper: '<polygon points="4,36 22,36 17,2 9,2"/>', twist: '<polygon points="6,36 20,36 18,2 8,2"/><path d="M8,2 C15,12 6,22 12,36" style="fill:none"/>', tiered: '<polygon points="3,36 23,36 23,24 20,24 20,14 17,14 17,5 11,5 11,14 8,14 8,24 3,24"/>', stacked: '<rect x="4" y="27" width="14" height="9"/><rect x="9" y="18" width="14" height="9"/><rect x="4" y="9" width="14" height="9"/><rect x="9" y="1" width="14" height="8"/>', upload: '<polygon points="6,36 20,36 20,14 13,14 13,4 6,14"/><path d="M13,4 L20,14" style="fill:none"/>' };
  const FORM_SHORT = { none: 'Plain box', taper: 'Tapered shaft', twist: 'Twisting tower', tiered: 'Set-back tiers', stacked: 'Shifted stack', upload: 'Uploaded massing' };
  const ROT_DEF = { label: 'Plan rotation', min: -45, max: 45, step: 1, fmt: (v) => v + '°' };
  /* envelope sliders edit the block itself (storeys, floor-to-floor, base plate); width and depth keep the block centred */
  const ENV = { floors: { label: 'Storeys', min: 1, max: 80, step: 1, fmt: (v) => v + (v === 1 ? ' storey' : ' storeys') }, f2f: { label: 'Floor-to-floor', min: 2.4, max: 6, step: 0.05, fmt: (v) => v.toFixed(2) + ' m' }, w: { label: 'Base width (east–west)', min: 6, max: 120, step: 0.25, fmt: (v) => v.toFixed(2) + ' m' }, d: { label: 'Base depth (north–south)', min: 6, max: 120, step: 0.25, fmt: (v) => v.toFixed(2) + ' m' } };
  function rangeRow(path, def, val) {
    if (def.options) return `<label class="ctl-sel">${def.label}<select data-f="${path}">${def.options.map(([v, l]) => `<option value="${v}" ${String(v) === String(val) ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
    return `<div class="ctl"><div class="ctl-head"><label>${def.label}</label><output>${esc(def.fmt(Number(val)))}</output></div><input type="range" data-f="${path}" min="${def.min}" max="${def.max}" step="${def.step}" value="${val}" aria-label="${esc(def.label)}"></div>`;
  }
  function formDef(F, path) { const [a, b, c] = path.split('.'); if (a === 'env') return ENV[b]; if (a === 'p') return Form.P[b]; if (a === 'rot') return ROT_DEF; if (a === 'step') return Form.STEPS[F.step.mode].params[b]; if (a === 'v') return Form.VOIDS[F.voids[Number(b)].type].params[c]; if (a === 'e') return Form.EDIT[b]; return null; }
  function setPath(F, path, v) { const [a, b, c] = path.split('.'); if (a === 'p') F.p[b] = v; else if (a === 'rot') F.rot = v; else if (a === 'step') F.step[b] = v; else if (a === 'v') F.voids[Number(b)][c] = v; }
  /* the block the Form tab shapes: the selected block if it can carry a form, otherwise the tallest tower */
  const canForm = (b) => !!(b && b.use && b.use !== 'core' && b.use !== 'parking' && b.len == null);
  const formGroup = () => project.blocks.filter((b) => canForm(b) && !b.hidden && b.z0 > -0.01);
  const formSpan = (g) => { const z0 = Math.min(...g.map((b) => b.z0)), H = Math.max(...g.map((b) => Model.blockTop(b))) - z0; return { z0, H }; };
  function formTarget() { const sel = selected(); if (state.formAll === undefined) state.formAll = !canForm(sel) && formGroup().length > 1; if (state.formAll) { const g = formGroup(); if (g.length) return g.slice().sort((a, b) => Model.blockTop(b) - Model.blockTop(a))[0]; }
    if (canForm(sel)) return sel; const c = project.blocks.filter((b) => canForm(b) && !b.hidden); if (!c.length) return null; return c.slice().sort((a, b) => Model.blockTop(b) - Model.blockTop(a) || b.floors - a.floors)[0]; }
  function renderFormTab() {
    const b = formTarget(), cands = project.blocks.filter(canForm), all = !!state.formAll, g = formGroup();
    const sa = $('shapeAside'); if (sa) sa.textContent = all ? `whole building · ${g.length} blocks` : b ? b.name : '';
    $('formTarget').innerHTML = cands.length > 1 ? `<div class="fchips" role="radiogroup" aria-label="Block to shape"><button class="fchip ${all ? 'on' : ''}" data-fsel="*" role="radio" aria-checked="${all}" title="One form for every above-grade block, from the ground to the top">${ICON('design')}Whole building</button>${cands.map((x) => `<button class="fchip ${!all && b && x.id === b.id ? 'on' : ''}" data-fsel="${x.id}" role="radio" aria-checked="${!all && !!(b && x.id === b.id)}" title="${esc(blockMeta(x))}"><i class="sw" style="background:${Views.useCol(x.use)}"></i>${esc(x.name)}<span class="fl">${x.floors}F</span></button>`).join('')}</div>` : '';
    $('formTarget').querySelectorAll('[data-fsel]').forEach((el) => (el.onclick = () => { if (el.dataset.fsel === '*') { state.formAll = true; select(null); } else { state.formAll = false; select(el.dataset.fsel); } }));
    if (!b) { $('formBody').innerHTML = '<div class="empty">No block to shape yet. Pick a starting massing on the Massing tab, or add a program under “Blocks on the site” below.</div>'; $('progCount').textContent = ''; return; }
    $('progCount').textContent = `${all ? 'Whole building' : b.name} · ${Form.active(b) ? Form.describe(b) : 'plain box'}`;
    $('formBody').innerHTML = formTab(b); wireForm(b);
  }
  function formTab(b) {
    const F = b.form || null, type = F ? F.type : 'none', act = Form.active(b), fls = act ? Form.floors(b, project) : null, s = project.site;
    const F0 = F || Form.newForm('prism'), tileType = !F || F.type === 'prism' ? 'none' : F.type;
    let h = `<div id="formBox"><h4 class="subhead">Tower form</h4><div class="typos" role="group" aria-label="Tower form">${Object.keys(FORM_SHORT).map((k) => `<button type="button" class="typo ${k === 'upload' && !(F && F.upload) ? 'dim' : ''}" data-ftype="${k}" aria-pressed="${k === tileType}" title="${esc(k === 'none' ? 'Straight extrusion of the block footprint' : Form.TYPES[k].blurb)}"><svg viewBox="0 0 26 38" aria-hidden="true">${TYPO_ICON[k]}</svg><span>${FORM_SHORT[k]}</span></button>`).join('')}</div>`;
    h += `<p class="hint">${esc(tileType === 'none' ? 'A straight extrusion. Pick a form to taper, twist, tier or stack it; terraces and voids below work on any form.' : Form.TYPES[type].blurb)}</p>`;
    if (type === 'upload' && F && F.upload) h += `<p class="hint">${esc(F.upload.name || 'Model')}: sliced every ${b.f2f} m; the block's width and depth scale it.</p>`;
    h += `<label class="uploadbtn"><span>${ICON('upload')}${type === 'upload' ? 'Replace the model' : 'Upload a massing'} (.3dm, .obj, .json)</span><input type="file" id="formFile" accept=".3dm,.obj,.json" hidden></label>`;
    if (state.formAll) { const g = formGroup(), sp = formSpan(g); h += `<p class="hint">Applied to the whole building (${fmt(sp.H, 1)} m, ${g.length} blocks: ${esc(g.map((x) => x.name).join(', '))}), so a taper, twist or terrace continues through podium and tower. Sizes and positions are set by the typology and in the block panel.</p>`; }
    { const F = F0;
      if (tileType !== 'none' && Form.TYPES[type].params.length) { h += `<h4 class="subhead">${esc(Form.TYPES[type].name)}</h4>`; for (const k of Form.TYPES[type].params) h += rangeRow('p.' + k, Form.P[k], F.p[k]); }
      h += `<h4 class="subhead">Terraces</h4>`;
      const st = F.step || { mode: 'none' };
      h += `<select data-fstep aria-label="Terrace rule">${Object.entries(Form.STEPS).map(([k, v]) => `<option value="${k}" ${k === st.mode ? 'selected' : ''}>${v.name}</option>`).join('')}</select>`;
      if (st.mode !== 'none') { h += `<p class="hint" style="margin-top:8px">${esc(Form.STEPS[st.mode].blurb)}</p>`; for (const [k, d] of Object.entries(Form.STEPS[st.mode].params)) h += rangeRow('step.' + k, d, st[k]); }
      h += '<h4 class="subhead">Voids</h4>';
      (F.voids || []).forEach((v, i) => { const on = state.formVoid === i; h += `<div class="vrow ${on ? 'on' : ''}"><button class="link" data-vsel="${i}" aria-expanded="${on}">${esc(Form.VOIDS[v.type].name)}</button><button class="ghost x" data-vdel="${i}" title="Remove this void" aria-label="Remove ${esc(Form.VOIDS[v.type].name)}">${ICON('close')}</button></div>`;
        if (on) h += `<div class="vparams"><p class="hint">${esc(Form.VOIDS[v.type].blurb)}</p>${Object.entries(Form.VOIDS[v.type].params).map(([k, d]) => rangeRow('v.' + i + '.' + k, d, v[k])).join('')}</div>`; });
      h += rangeRow('rot', ROT_DEF, F.rot || 0);
      h += `<label class="ctl-sel">Add a void<select data-vadd><option value="">Choose a rule…</option>${Object.entries(Form.VOIDS).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('')}</select></label>`;
      const ne = Object.keys(F.edits || {}).length, ed = state.formEdit || (state.formEdit = { from: 1, to: Math.min(3, b.floors), sx: 1, sy: 1, dx: 0, dy: 0, rot: 0 });
      if (!state.formAll) h += `<details class="prec"><summary>Storey edits${ne ? ` <span class="muted">· ${ne} edited</span>` : ''}</summary><div class="row2" style="margin-top:8px"><label>From storey<input type="number" min="1" max="${b.floors}" data-fe="from" value="${Math.min(ed.from, b.floors)}"></label><label>To storey<input type="number" min="1" max="${b.floors}" data-fe="to" value="${Math.min(ed.to, b.floors)}"></label></div>`;
      if (!state.formAll) for (const [k, d] of Object.entries(Form.EDIT)) h += rangeRow('e.' + k, d, ed[k]);
      if (!state.formAll) h += `<div class="btnrow"><button id="feApply">Apply to storeys</button><button id="feClear" ${ne ? '' : 'disabled'}>Clear all edits</button></div></details>`;
      h += `<details class="prec"><summary>Precedent rules</summary>${Form.PRECEDENTS.map((pz, i) => `<button class="precb" data-prec="${i}"><b>${esc(pz.name)}</b><span class="muted">${esc(pz.city)}</span><span>${esc(pz.mech)}</span></button>`).join('')}</details>`;
      if (fls && fls.length) { const a = fls.reduce((s2, f) => s2 + f.area, 0); h += `<div class="calc" style="margin-top:12px"><span>Plates ${fmt0(a)} m²</span><span>envelope ${fmt0(b.w * b.d * b.floors)} m²</span></div>`; if (fls.some((f) => f.rotated)) h += '<p class="hint" style="margin-top:6px">Rotated plates are checked as equal-area rectangular plates.</p>'; }
    }
    h += `<div class="btnrow" style="margin-top:16px"><button class="primary" id="fShuffle" ${type === 'upload' ? 'disabled' : ''} title="A random typology with random parameters; voids and storey edits are kept">Shuffle form</button><button id="fReset" ${F ? '' : 'disabled'}>Reset to a plain box</button></div></div>`;
    return h;
  }
  function shuffleForm(b) {
    const types = ['prism', 'taper', 'twist', 'tiered', 'stacked'], k = types[Math.floor(Math.random() * types.length)], F = Form.newForm(k);
    for (const pk of Form.TYPES[k].params) { const d = Form.P[pk], steps = Math.round((d.max - d.min) / d.step); F.p[pk] = Math.round((d.min + Math.floor(Math.random() * (steps + 1)) * d.step) * 1000) / 1000; }
    if (b.form) { F.voids = b.form.voids || []; F.edits = b.form.edits || {}; F.upload = b.form.upload; }
    if (Math.random() < 0.5) { const sm = Object.keys(Form.STEPS).filter((m) => m !== 'none'), m = sm[Math.floor(Math.random() * sm.length)]; F.step = Object.assign({ mode: m }, Form.clone(Form.STEPS[m].defaults)); }
    mutate(() => { if (state.formAll) spread(F); else b.form = F; }, `Shuffled ${state.formAll ? 'the whole building' : b.name}: ${Form.TYPES[k].name.toLowerCase()}${F.step.mode !== 'none' ? ' with ' + Form.STEPS[F.step.mode].name.toLowerCase() : ''}`);
  }
  function spread(F) { // whole-building mode: the same form on every above-grade block, spanning the full height
    const g = formGroup(), sp = formSpan(g); for (const o of g) { const G = Form.clone(F); G.span = sp; G.edits = (o.form && o.form.edits) || {}; G.upload = o.form && o.form.upload; o.form = G; } }
  function setForm(b, fn, live) { const F = Form.clone(b.form || Form.newForm('prism')); fn(F);
    if (state.formAll) { if (live) { spread(F); markEdited(); afterModelChange(false); } else mutate(() => spread(F)); return; }
    delete F.span; if (live) edit(b.id, { form: F }, false); else mutate(() => { b.form = F; }); }
  async function uploadForm(b, file) {
    try { toast(`Reading ${file.name}…`); const meshes = await Form.readFile(file), U = Form.voxelize(meshes); U.name = file.name;
      const cx = b.x + b.w / 2, cy = b.y + b.d / 2;
      mutate(() => { const old = b.form; b.form = Object.assign(Form.newForm('upload'), { upload: U, voids: old ? old.voids || [] : [], step: { mode: 'none' } }); b.w = Model.snap(U.ext.w); b.d = Model.snap(U.ext.d); b.floors = Math.max(1, Math.round(U.top / b.f2f)); b.x = Model.snap(cx - b.w / 2); b.y = Model.snap(cy - b.d / 2); },
        `${file.name}: ${fmt(U.top, 1)} m tall, ${fmt0(U.footprint)} m² footprint, sliced into ${Math.max(1, Math.round(U.top / b.f2f))} storeys`);
    } catch (e) { toast(e.message || String(e)); }
  }
  function wireForm(b) {
    const box = $('formBox'); if (!box) return;
    const file = $('formFile'); if (file) file.onchange = () => { if (file.files[0]) uploadForm(b, file.files[0]); };
    box.querySelectorAll('[data-ftype]').forEach((el) => (el.onclick = () => { const k = el.dataset.ftype; state.formOpen = true;
      if (k === 'none') { mutate(() => { const toBox = (o) => { if (!o.form) return; const keep = (o.form.voids && o.form.voids.length) || (o.form.step && o.form.step.mode !== 'none') || (o.form.edits && Object.keys(o.form.edits).length); if (keep) { const F = Form.newForm('prism'); F.voids = o.form.voids || []; F.step = o.form.step || { mode: 'none' }; F.edits = o.form.edits || {}; F.rot = o.form.rot || 0; F.span = o.form.span; o.form = F; } else delete o.form; }; if (state.formAll) formGroup().forEach(toBox); else toBox(b); }, state.formAll ? 'Straight extrusion again; terraces and voids kept' : 'Straight extrusion again; terraces and voids kept'); return; }
      if (k === 'upload' && !(b.form && b.form.upload)) { $('formFile').click(); return; }
      mutate(() => { const old = b.form, F = Form.newForm(k); if (old) { F.voids = old.voids || []; F.step = old.step || { mode: 'none' }; F.edits = old.edits || {}; F.rot = old.rot || 0; F.upload = old.upload; } if (state.formAll) spread(F); else b.form = F; }); }));
    box.querySelectorAll('input[type=range][data-f]').forEach((el) => { const path = el.dataset.f, def = formDef(b.form, path), out = el.parentElement.querySelector('output');
      el.oninput = () => { const v = Number(el.value); out.textContent = def.fmt(v); if (path.startsWith('e.')) { state.formEdit[path.slice(2)] = v; return; }
        if (path.startsWith('env.')) { const k = path.slice(4), patch = { [k]: v }; if (k === 'w') patch.x = Model.snap(b.x + b.w / 2 - v / 2); if (k === 'd') patch.y = Model.snap(b.y + b.d / 2 - v / 2); edit(b.id, patch, false); return; }
        setForm(b, (F) => setPath(F, path, v), true); };
      el.onchange = () => { if (!path.startsWith('e.')) edit(b.id, {}, true); }; });
    const sh = $('fShuffle'); if (sh) sh.onclick = () => shuffleForm(b);
    const rs = $('fReset'); if (rs) rs.onclick = () => mutate(() => { if (state.formAll) for (const o of formGroup()) delete o.form; else delete b.form; }, state.formAll ? 'Every block is a plain box again' : `${b.name} is a plain box again`);
    box.querySelectorAll('select[data-f]').forEach((el) => (el.onchange = () => { const v = /^-?[\d.]+$/.test(el.value) ? Number(el.value) : el.value; setForm(b, (F) => setPath(F, el.dataset.f, v), false); }));
    const sf = box.querySelector('[data-fstep]'); if (sf) sf.onchange = () => setForm(b, (F) => { F.step = Object.assign({ mode: sf.value }, Form.STEPS[sf.value].defaults || {}); }, false);
    const va = box.querySelector('[data-vadd]'); if (va) va.onchange = () => { if (!va.value) return; const k = va.value; setForm(b, (F) => { F.voids.push(Object.assign({ type: k }, Form.clone(Form.VOIDS[k].defaults))); state.formVoid = F.voids.length - 1; }, false); };
    box.querySelectorAll('[data-vsel]').forEach((el) => (el.onclick = () => { const i = Number(el.dataset.vsel); state.formVoid = state.formVoid === i ? -1 : i; renderRight(); }));
    box.querySelectorAll('[data-vdel]').forEach((el) => (el.onclick = () => { const i = Number(el.dataset.vdel); setForm(b, (F) => { F.voids.splice(i, 1); }, false); state.formVoid = -1; }));
    box.querySelectorAll('[data-fe]').forEach((el) => (el.onchange = () => { state.formEdit[el.dataset.fe] = Math.max(1, Math.min(b.floors, Math.round(Number(el.value) || 1))); }));
    const ap = $('feApply'); if (ap) ap.onclick = () => { const ed = state.formEdit, a = Math.min(ed.from, ed.to), z = Math.max(ed.from, ed.to); setForm(b, (F) => { F.edits = F.edits || {}; for (let n = a; n <= z; n++) { const o = {}; for (const [k, d] of Object.entries(Form.EDIT)) if (Math.abs(ed[k] - d.neutral) > 1e-9) o[k] = ed[k]; if (Object.keys(o).length) F.edits[n - 1] = o; else delete F.edits[n - 1]; } }, false); toast(`Edited storeys ${a}–${z} of ${b.name}`); };
    const cl = $('feClear'); if (cl) cl.onclick = () => setForm(b, (F) => { F.edits = {}; }, false);
    box.querySelectorAll('[data-prec]').forEach((el) => (el.onclick = () => { const pz = Form.PRECEDENTS[Number(el.dataset.prec)]; setForm(b, (F) => {
      if (pz.apply === 'void') { F.voids.push(Object.assign({ type: pz.type }, Form.clone(pz.preset))); state.formVoid = F.voids.length - 1; }
      else if (pz.apply === 'step') F.step = Object.assign({ mode: pz.mode }, Form.clone(pz.preset));
      else if (pz.apply === 'type') { F.type = pz.type; F.p = Object.assign({}, Form.newForm(pz.type).p, pz.preset); } }, false); toast(`Applied the ${pz.name} rule to ${b.name}`); }));
  }

  /* ---------- right panel ---------- */
  function showRight(on) { const was = !$('rightPanel').hidden; $('rightPanel').hidden = !on; $('rGrip').hidden = !on; $('main').classList.toggle('withright', on); if (was !== on) requestAnimationFrame(relayout); }
  const uf = (label, key, obj, unit, step = 0.25, min = null, ro = false, val = null) => `<label>${label}<span class="unit"><input type="number" ${ro ? 'readonly tabindex="-1"' : `data-key="${key}"`} step="${step}" ${min != null ? `min="${min}"` : ''} value="${val != null ? val : obj[key]}" ${!ro && obj.locked && ['x', 'y', 'w', 'd', 'z0', 'len', 'floors', 'f2f'].includes(key) ? 'disabled' : ''}>${unit ? `<span>${unit}</span>` : ''}</span></label>`;
  /* fire-resistance rating required between the selected block and the paired one (Table 3.1.3.1) */
  function pairHTML(b) {
    const o = project.blocks.find((x) => x.id === state.pair); if (!o) return '<p class="hint" style="margin:6px 0 0">Pick a second block to see the fire-resistance rating the separation between them needs.</p>';
    const fs = Rules.fireSeparation(b, o), G = (g) => g || 'no occupancy', rel = fs.rel === 'floor' ? 'they are stacked, so the floor between them is the separation' : fs.rel === 'wall' ? 'they share a wall' : 'they do not touch, so no separation is needed between them yet';
    const rating = fs.kind === 'core' ? 'n/a' : fs.hours == null ? 'not in the table' : fs.hours === 0 ? 'none required' : `${fs.hours} h`;
    return `<div class="pairbox"><div class="pairrow"><span>${esc(b.name)} <span class="muted">Group ${G(fs.ga)}</span></span><b class="frr ${fs.hours ? 'need' : ''}">${rating}</b><span style="text-align:right">${esc(o.name)} <span class="muted">Group ${G(fs.gb)}</span></span></div>
      <p class="hint" style="margin:6px 0 0">${fs.kind === 'core' ? esc(fs.note) : fs.kind === 'same' ? esc(fs.note) : `Table 3.1.3.1, ${fs.key.replace('|', ' to ')}: ${rating}${fs.hours ? ' fire-resistance rating for the fire separation' : ''}. ${rel}.${fs.note ? ' ' + esc(fs.note) : ''}`}</p><p class="hint" style="margin:4px 0 0">${window.Cite ? Cite.html(CODES.fireSep.clause) : esc(CODES.fireSep.clause)} · sprinklered ${project.site.sprinklered ? 'yes' : 'no'}</p></div>`;
  }
  function headFor(b) { return `<i class="sw" style="background:${Views.useCol(b.use)}"></i><input class="rname" id="rName" value="${esc(b.name)}" aria-label="Block name"><button class="ghost x" id="rClose" title="Close (Esc)" aria-label="Close">✕</button><span></span><select class="ruse" id="rUse" aria-label="Program">${Model.USES.map((u) => `<option value="${u}" ${u === b.use ? 'selected' : ''}>${Model.USE_LABEL[u]}</option>`).join('')}</select>`; }
  function blockChecks(b) { const rel = rows.filter((x) => rowTouches(x, b)); const n = { fail: 0, review: 0, pass: 0 }; for (const x of rel) { const g = Checks.effective(x, project).group; if (n[g] != null) n[g]++; } return { rel, n }; }
  function renderRight() {
    const ws = state.workspace, r = state.issue ? rows.find((x) => x.id === state.issue) : null, sel = selected();
    const rd = $('rDesign'); if (rd) rd.hidden = ws !== 'design';
    if (ws === 'compare' || ws === 'report') { showRight(false); return; }
    if (ws === 'check' && r) { showRight(true); $('rHead').innerHTML = '<h3>Check result</h3><button class="ghost x" id="rClose" title="Close (Esc)" aria-label="Close">✕</button>'; Checks.renderDetail($('rBody'), r, api, { target, show: showInModel, back: () => setWorkspace('design') }); wireHead(null); return; }
    if (!sel) { if (ws === 'design') { showRight(true); $('rHead').innerHTML = '<h3>Blocks</h3>'; $('rBody').innerHTML = '<p class="hint" style="margin:0">Select a block in the model or in the list below to edit it. Shift-click a second block for the fire separation between them.</p>'; return; } showRight(false); return; }
    showRight(true);
    if (sel.len != null) { // ramp
      const r2 = sel, drop = r2.zTop - r2.zBottom; $('rHead').innerHTML = `<i class="sw" style="background:${Views.useCol('ramp')}"></i><h3 style="grid-column:2">Parking ramp</h3><button class="ghost x" id="rClose" aria-label="Close">✕</button>`;
      $('rBody').innerHTML = `<fieldset class="fs"><legend>Size</legend><div class="row2">${uf('Width', 'w', r2, 'm', 0.1, 3)}${uf('Length', 'len', r2, 'm', 0.5, 4)}</div><div class="row2">${uf('Top', 'zTop', r2, 'm', 0.1)}${uf('Bottom', 'zBottom', r2, 'm', 0.1)}</div><div class="calc"><span>${(drop / r2.len * 100).toFixed(1)}% overall</span><span>about ${(drop / Math.max(1, Math.round(drop / 3.2)) / 0.125 + 8).toFixed(1)} m needed per level</span></div></fieldset>
        <fieldset class="fs"><legend>Position and rotation</legend><div class="row2">${uf('From west line', 'x', r2, 'm')}${uf('From street line', 'y', r2, 'm')}</div><label>Descends towards<select data-key="dir">${['N', 'E', 'S', 'W'].map((d) => `<option value="${d}" ${d === r2.dir ? 'selected' : ''}>${{ N: 'North', E: 'East', S: 'South', W: 'West' }[d]}</option>`).join('')}</select></label></fieldset>
        <div style="border-top:1px solid var(--line2);padding-top:12px"><button class="danger" id="pDel">Delete ramp</button></div>`;
      wireHead(null); wireProps(sel); return; }
    const b = sel, h = hOf(b), isCore = b.use === 'core';
    $('rHead').innerHTML = headFor(b); wireHead(b);
    if (ws === 'site') { $('rBody').innerHTML = `<p class="hint">${esc(blockMeta(b))} · ${fmt(h, 1)} m tall · ${fmt(b.w, 2)} × ${fmt(b.d, 2)} m</p><button class="primary" id="pEdit">Edit in Form</button>`; $('pEdit').onclick = () => setWorkspace('design'); return; }
    const { rel, n } = blockChecks(b);
    if (ws === 'check') {
      $('rBody').innerHTML = `<div class="chkline" style="margin-bottom:10px"><span class="st-fail">✕ ${n.fail} issue${n.fail === 1 ? '' : 's'}</span><span class="st-review">! ${n.review} to review</span><span style="color:var(--pass)">✓ ${n.pass} passed</span></div>
        <div style="margin-bottom:14px">${rel.length ? rel.sort((p, q) => ({ fail: 0, review: 1, pass: 2, info: 3 }[Checks.effective(p, project).group] - { fail: 0, review: 1, pass: 2, info: 3 }[Checks.effective(q, project).group])).slice(0, 14).map((x) => { const d = Checks.describe(x, api); return `<button class="crow st-${d.key}" data-issue="${esc(x.id)}"><span class="cico">${d.status.icon}</span><span class="cmain"><span class="cname">${esc(d.name)}</span><span class="cwhere">${esc(d.status.label)} · ${esc(d.current)}</span></span></button>`; }).join('') : '<p class="hint">No check refers to this block.</p>'}</div>
        ${b.use === 'residential' ? `<fieldset class="fs"><legend>Daylight to windows (ODP §5)</legend><canvas id="dayDiag" style="width:100%;display:block;border:1px solid var(--line);border-radius:7px"></canvas></fieldset>` : ''}<button id="pEdit">Edit in Form</button>`;
      $('rBody').querySelectorAll('[data-issue]').forEach((el) => (el.onclick = () => pickIssue(el.dataset.issue))); $('pEdit').onclick = () => setWorkspace('design');
      if (b.use === 'residential' && window.DayDiag) { const cv = $('dayDiag'); requestAnimationFrame(() => DayDiag.render(cv, project, daylight().find((x) => x.block === b) || null)); }
      return; }
    // Design: essential fields first
    $('rBody').innerHTML = `<fieldset class="fs"><legend>Size</legend>
        <div class="row2">${uf('Width (east–west)', 'w', b, 'm', 0.25, 1)}${uf('Depth (north–south)', 'd', b, 'm', 0.25, 1)}</div>
        ${isCore ? `<div class="row2">${uf('Height', 'f2f', b, 'm', 0.1, 3)}${uf('Stairs', 'stairs', b, '', 1, 1)}</div>` : `<div class="row2">${uf('Storeys', 'floors', b, '', 1, 1)}${uf('Floor to floor', 'f2f', b, 'm', 0.05, 2.4)}</div>`}
        <div class="row2">${uf('Base elevation', 'z0', b, 'm', 0.1)}${uf('Block height', 'h', b, 'm', 0.1, null, true, fmt(h, 2))}</div>
        <div class="calc" id="pCalc"></div></fieldset>
      ${!isCore && window.Stack ? (() => { const rg = Stack.storeys(b, levels), area = b.w * b.d, tot = (window.Form && Form.active(b) ? (Form.floors(b, project) || []).reduce((s2, f) => s2 + f.area, 0) : area * b.floors), PA = programAreas(), share = PA && PA.actualTotal ? tot / PA.actualTotal * 100 : 0, tgt = PA && PA.by[b.use] ? PA.by[b.use].pct : null; return `<fieldset class="fs"><legend>In the stack</legend><dl class="facts2"><dt>Storeys</dt><dd>${rg.from ? `L${rg.from}–L${rg.to || rg.from}` : b.z0 < 0 ? 'below grade' : '—'} · ${b.floors}</dd><dt>Elevations</dt><dd>${fmt(b.z0, 1)} to ${fmt(Model.blockTop(b), 1)} m</dd><dt>Floorplate</dt><dd>${fmt0(area)} m² · ${fmt0(tot)} m² in all</dd><dt>Share of program</dt><dd>${fmt(share, 1)}%${tgt != null ? ` <span class="muted">· ${Model.USE_LABEL[b.use]} target ${fmt(tgt, 0)}%</span>` : ''}</dd></dl></fieldset>`; })() : ''}
      <fieldset class="fs"><legend>Position and rotation</legend><div class="row2">${uf('From west line', 'x', b, 'm')}${uf('From street line', 'y', b, 'm')}</div><button id="pRot">Rotate 90°</button></fieldset>
      ${b.use !== 'core' && b.use !== 'parking' && window.Form ? `<fieldset class="fs"><legend>Form</legend><div class="chkline"><span>${esc(Form.active(b) ? Form.describe(b) : 'plain box')}</span><button class="link" id="pForm">Shape in the Form tab</button></div></fieldset>` : ''}
      <div class="btnrow" style="margin-bottom:16px"><button data-act="dup">Duplicate</button><button data-act="stack">Stack copy</button><div class="popwrap"><button id="pMore" aria-haspopup="true" aria-expanded="false">More actions ▾</button><div class="pop menulist" id="popMore" hidden style="width:210px;left:0;right:auto">${isCore ? '' : '<button data-act="splitLR">Split side to side</button><button data-act="splitFB">Split front to back</button><button data-act="splitUD">Split by storeys</button>'}<button data-act="lock">${b.locked ? 'Unlock' : 'Lock'}</button><button data-act="hide">${b.hidden ? 'Show' : 'Hide'}</button></div></div></div>
      <fieldset class="fs"><legend>Fire separation to another block</legend><label>Compare with<select id="pairSel"><option value="">Choose a block, or shift-click one in the model</option>${project.blocks.filter((o) => o.id !== b.id && o.len == null).map((o) => `<option value="${o.id}" ${state.pair === o.id ? 'selected' : ''}>${esc(o.name)} · ${Model.USE_LABEL[o.use]}</option>`).join('')}</select></label><div id="pairOut">${pairHTML(b)}</div></fieldset>
      <fieldset class="fs"><legend>Checks on this block</legend><div class="chkline"><span class="st-fail">✕ ${n.fail}</span><span class="st-review">! ${n.review}</span><span style="color:var(--pass)">✓ ${n.pass}</span><button class="link" id="pChecks">View block checks</button></div></fieldset>
      <div style="border-top:1px solid var(--line2);padding-top:12px"><button class="danger" id="pDel">Delete block</button> <span class="hint" style="margin-left:6px">Undo restores it.</span></div>`;
    wireProps(b); syncProps(); const pf = $('pForm'); if (pf) pf.onclick = () => { if (state.workspace !== 'design') setWorkspace('design'); else renderFormTab(); };
    $('pChecks').onclick = () => { state.checkFilter = { status: 'all', group: 'all', block: b.id }; setWorkspace('check'); };
    const ps = $('pairSel'); if (ps) ps.onchange = () => { state.pair = ps.value || null; $('pairOut').innerHTML = pairHTML(b); drawStage(false); };
    $('pMore').onclick = () => togglePop('popMore', $('pMore'));
  }
  function wireHead(b) {
    const cl = $('rClose'); if (cl) cl.onclick = () => { if (state.issue && state.workspace === 'check') { state.issue = null; state.focusIds = []; renderCheck(); renderRight(); drawStage(false); } else select(null); };
    if (!b) return; $('rName').onchange = (e) => setField(b, 'name', e.target.value, false); $('rName').onkeydown = (e) => { if (e.key === 'Enter') e.target.blur(); };
    $('rUse').onchange = (e) => mutate(() => { b.use = e.target.value; b.f2f = Model.USE_F2F[b.use] || b.f2f; if (!b.name || Object.values(Model.USE_LABEL).includes(b.name)) b.name = Model.USE_LABEL[b.use]; });
  }
  function wireProps(obj) {
    const host = $('rBody');
    host.querySelectorAll('[data-key]').forEach((el) => el.addEventListener('change', () => { const k = el.dataset.key; if (k === 'dir') setField(obj, k, el.value, false); else if (el.value !== '') setField(obj, k, el.value); }));
    host.querySelectorAll('input[type=number][data-key]').forEach((el) => el.addEventListener('input', () => { const k = el.dataset.key; if (el.value === '' || !['x', 'y', 'w', 'd', 'z0', 'floors', 'f2f', 'len', 'zTop', 'zBottom'].includes(k)) return; let v = Number(el.value); if (!Number.isFinite(v)) return; const mn = el.min !== '' ? Number(el.min) : null; if (mn != null && v < mn) return; edit(obj.id, { [k]: v }, false); }));
    host.querySelectorAll('[data-act]').forEach((el) => (el.onclick = () => { closePops(); blockAction(el.dataset.act, obj.id); }));
    const rot = $('pRot'); if (rot) rot.onclick = rotateSelected; const del = $('pDel'); if (del) del.onclick = deleteSelected;
  }
  /* keep the properties fields in step with a drag without rebuilding the panel */
  function syncProps() {
    const b = selBlock(); if (!b || $('rightPanel').hidden) return; const host = $('rBody');
    host.querySelectorAll('[data-key]').forEach((el) => { if (document.activeElement === el) return; const v = b[el.dataset.key]; if (v != null && el.type === 'number') el.value = Math.round(v * 1000) / 1000; });
    const ro = host.querySelector('input[readonly]'); if (ro) ro.value = fmt(hOf(b), 2);
    const c = $('pCalc'); if (c) c.innerHTML = `<span>Floor plate ${fmt0(b.w * b.d)} m²</span><span>${b.use === 'core' ? `top at ${fmt(Model.blockTop(b), 1)} m` : `${fmt0(b.w * b.d * b.floors)} m² in ${b.floors} storeys`}</span>`;
  }
  function select(id) {
    if (has3d && Scene3D.busy()) return; if (id && String(id).includes('~')) id = String(id).split('~')[0];
    state.selected = id; state.pair = null; if (id && state.workspace !== 'check') state.issue = null; if (id && state.workspace === 'check') state.issue = null; tipText = null;
    const sel = selected(); if (sel && state.view === 'section' && sel.len == null) state.secPos = state.secAxis === 'x' ? sel.y + sel.d / 2 : sel.x + sel.w / 2;
    document.querySelectorAll('.brow, .lrow').forEach((el) => { const on = el.dataset.id === id; el.classList.toggle('on', on); el.setAttribute('aria-pressed', String(on)); });
    if (id && state.workspace === 'design') { const el = document.querySelector(`.lrow[data-id="${id}"], .brow[data-id="${id}"]`); if (el) el.scrollIntoView({ block: 'nearest' }); }
    if (state.workspace === 'check') renderCheck();
    if (window.Stack && state.workspace === 'design') Stack.render();
    renderRight(); renderMetrics(); renderViewChrome(); drawStage(false);
  }

  /* ---------- Report summary ---------- */
  function renderReportSummary() {
    if (state.workspace !== 'report') return; const m = metrics(), n = Checks.counts(rows, project);
    $('reportSummary').innerHTML = `<h3 class="sechead">Results</h3><dl class="facts2"><dt>Issues</dt><dd><span class="st-fail">✕ ${n.fail}</span></dd><dt>Needs review</dt><dd><span class="st-review">! ${n.review}</span>${n.verify ? ` <span class="muted">(${n.verify} need verification)</span>` : ''}</dd><dt>Passed</dt><dd><span style="color:var(--pass)">✓ ${n.pass}</span></dd><dt>FSR</dt><dd>${fmt(m.fsr, 2)}${m.fsrMax != null ? ` of ${fmt(m.fsrMax, 2)}` : ''}</dd><dt>Height</dt><dd>${fmt(m.height, 1)} m</dd><dt>Floor area</dt><dd>${fmt0(m.gfaAbove)} m² (${fmt0(m.fsrFA)} m² counted)</dd></dl><p class="hint" style="margin:10px 0 0">The export uses the same results. Unconfirmed restrictions are listed as needing verification, not as passes.</p>`;
  }

  /* ---------- export ---------- */
  async function save(filename, data) {
    try { const dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null; if (dl) { await dl.save({ filename, data }); toast(`Saved ${filename}`); return true; } } catch (e) { if (e && e.code === 'declined') { toast('Download cancelled'); return false; } console.warn(e); }
    if (!window.claude) { const blob = data instanceof Blob ? data : new Blob([data], { type: /\.zip$/.test(filename) ? 'application/zip' : /\.html$/.test(filename) ? 'text/html' : 'application/octet-stream' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); toast(`Saved ${filename}`); return true; }
    toast('Downloads are not available in this view.'); return false;
  }
  async function exportDxf() {
    const L = currentLevel(), P = L && planFor(L); if (!P) { toast('Pick a storey in Plan view first.'); return; }
    const layers = { SITE: [], OUTLINE: [], CORE: [], CORRIDOR: [], WALLS: [], DOORS: [], STALLS: [], AISLE: [], RAMP: [], TEXT: [] };
    const rectPts = (r) => ({ pts: [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.d], [r.x, r.y + r.d]], closed: true });
    layers.SITE.push(project.site.poly ? { pts: project.site.poly, closed: true } : rectPts({ x: 0, y: 0, w: project.site.w, d: project.site.d }));
    for (const t of P.tiles) layers.OUTLINE.push(rectPts(t.rect)); for (const c of P.cores) layers.CORE.push(rectPts(c)); for (const s of P.corridors) layers.CORRIDOR.push(rectPts(s)); for (const w of P.walls) layers.WALLS.push({ a: [w[0], w[1]], b: [w[2], w[3]] });
    for (const r of P.rooms) { if (r.kind === 'stall') layers.STALLS.push(rectPts(r.rect)); else if (r.kind === 'aisle') layers.AISLE.push(rectPts(r.rect)); else if (r.kind === 'ramp') layers.RAMP.push(rectPts(r.rect));
      if (!r.parent && r.kind !== 'stall' && r.kind !== 'aisle' && r.area > 8) layers.TEXT.push({ text: `${r.name} ${Math.round(r.area)} m2`, at: [r.rect.x + 0.4, r.rect.y + r.rect.d / 2], h: 0.35 });
      for (const d of r.doors || []) { const horiz = d.side === 'N' || d.side === 'S'; const y = d.side === 'N' ? r.rect.y + r.rect.d : r.rect.y, x = d.side === 'E' ? r.rect.x + r.rect.w : r.rect.x; const hh = horiz ? [[d.at - d.w / 2, y], [d.at + d.w / 2, y]] : [[x, d.at - d.w / 2], [x, d.at + d.w / 2]]; const sw = d.side === 'S' ? [0, d.w] : d.side === 'N' ? [0, -d.w] : d.side === 'W' ? [d.w, 0] : [-d.w, 0]; layers.DOORS.push({ a: hh[0], b: [hh[0][0] + sw[0], hh[0][1] + sw[1]] }); const arc = []; for (let k = 0; k <= 8; k++) { const t = (k / 8) * Math.PI / 2; const base = Math.atan2(sw[1], sw[0]); const dir = horiz ? (d.side === 'S' ? -1 : 1) : (d.side === 'W' ? -1 : 1); const ang = base + dir * t * (horiz ? 1 : -1); arc.push([hh[0][0] + d.w * Math.cos(ang), hh[0][1] + d.w * Math.sin(ang)]); } layers.DOORS.push({ pts: arc, closed: false }); } }
    layers.TEXT.push({ text: `${L.name} ${L.uses.join('+')} z=${L.z.toFixed(2)} m  ${project.site.addr || 'custom site'}  Downtown Massing Tool ${new Date().toISOString().slice(0, 10)}  units: metres`, at: [P.tiles[0].rect.x, P.tiles[0].rect.y - 2], h: 0.5 });
    await save(`massing-plan-${L.name}.zip`, Zip.make([{ name: `${L.name}-plan.dxf`, text: DXF.write({ layers }) }]));
  }
  function snapshot(view, w, h) { const want = view || state.view; const old = state.view; const switching = want !== old; if (switching) { state.view = want; $('c3d').hidden = !(want === '3d' && has3d); $('stage').hidden = want === '3d' && has3d; } const cv = want === '3d' && has3d ? $('c3d') : $('stage'); if (want === '3d' && has3d) { Scene3D.resize(); Scene3D.refresh(true); } else { Views.refit(); Views.draw(); } const url = cv.toDataURL('image/png'); if (switching) { state.view = old; $('c3d').hidden = !(old === '3d' && has3d); $('stage').hidden = old === '3d' && has3d; if (old === '3d' && has3d) { Scene3D.resize(); Scene3D.frame(); } else { Views.draw(); } } return shrink(url, w, h); }
  function shrink(url, w, h) { if (!w || !h) return url; try { const img = new Image(); img.src = url; if (!img.complete || !img.naturalWidth) return url; const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); const k = Math.min(w / img.naturalWidth, h / img.naturalHeight); g.drawImage(img, (w - img.naturalWidth * k) / 2, (h - img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k); return c.toDataURL('image/png'); } catch (e) { return url; } }

  /* ---------- keyboard ---------- */
  let toastT = null; function toast(msg) { if (!msg) return; const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }
  function keys(e) { if (e.defaultPrevented) return; const tgt = e.target.tagName; const inInput = (tgt === 'INPUT' && !/^(range|checkbox|radio|button)$/.test(e.target.type)) || tgt === 'SELECT' || tgt === 'TEXTAREA';
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) { if (inInput) return; e.preventDefault(); if (e.key.toLowerCase() === 'y' || e.shiftKey) redo(); else undo(); return; }
    if (e.key === 'Escape') { if (openPop) { closePops(); return; } if (inInput) { e.target.blur(); return; } Views.cancelDrag(); if (state.issue) { state.issue = null; state.focusIds = []; renderCheck(); renderRight(); drawStage(false); return; } select(null); return; }
    if (inInput || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'o') { rotateSelected(); return; }
    const sel = selected(); if (!sel) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); return; }
    if (k === 'l' && sel.use) { blockAction('lock', sel.id); return; } if (k === 'h' && sel.use) { blockAction('hide', sel.id); return; }
    const step = state.snap.inc * (e.shiftKey ? 10 : 1); const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key]; if (!mv) return; e.preventDefault(); if (sel.locked) return; const rr = sel.len != null ? Plans.rampRect(sel) : sel; const L = limits();
    mutate(() => { applyWithCores(sel, { x: Math.round((sel.x + mv[0]) * 100) / 100, y: Math.round((sel.y + mv[1]) * 100) / 100 }); if (L.constrain) { sel.x = Math.min(Math.max(0, sel.x), Math.max(0, project.site.w - rr.w)); sel.y = Math.min(Math.max(0, sel.y), Math.max(0, project.site.d - rr.d)); } }); }

  /* ---------- scripted interaction test (#ops): drives real pointer and key events through the 3D view ---------- */
  async function opsTest() {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms)), cv = $('c3d'), out = [];
    const ev = (type, p, extra = {}) => cv.dispatchEvent(new PointerEvent(type, Object.assign({ clientX: p.x, clientY: p.y, bubbles: true, pointerId: 1, button: 0, buttons: type === 'pointerup' ? 0 : 1 }, extra)));
    const drag = async (a, b, steps = 8) => { ev('pointermove', a, { buttons: 0 }); await wait(20); ev('pointerdown', a); for (let i = 1; i <= steps; i++) { ev('pointermove', { x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps }); await wait(10); } ev('pointerup', b); await wait(60); };
    const key = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    const T = () => project.blocks.find((b) => b.name === 'Tower'), H = () => history.past.length;
    const ok = (name, cond, info) => out.push(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' · ' + info : ''}`);
    setWorkspace('site'); setWorkspace('design'); ok('switch Site → Design', state.workspace === 'design');
    select(T().id); setTool('push'); await wait(50); Scene3D.fitProject(true); await wait(50);
    let t = T(), f0 = t.floors, h0 = H(); let top = Scene3D.screenOf(t.x + t.w * 0.42, t.y + t.d * 0.46, Model.blockTop(t)); await drag(top, { x: top.x, y: top.y - 90 });
    ok('pull roof up adds storeys', T().floors > f0 && T().z0 === t.z0, `${f0} → ${T().floors} storeys, base ${T().z0}`); ok('one undo step for the drag', H() === h0 + 1);
    t = T(); const x0 = t.x, w0 = t.w; h0 = H(); let east = Scene3D.screenOf(t.x + t.w, t.y + t.d / 2, t.z0 + 10); const east2 = Scene3D.screenOf(t.x + t.w + 6, t.y + t.d / 2, t.z0 + 10); await drag(east, east2);
    ok('pull east face, west face fixed', T().w > w0 && Math.abs(T().x - x0) < 1e-9, `width ${w0} → ${T().w}, x ${x0} → ${T().x}`);
    t = T(); const w1 = t.w; east = Scene3D.screenOf(t.x + t.w, t.y + t.d / 2, t.z0 + 10); ev('pointermove', east, { buttons: 0 }); await wait(20); ev('pointerdown', east); ev('pointerup', east); await wait(30); key('Tab'); key('4'); key('0'); key('Enter'); await wait(80);
    ok('exact final dimension by typing', Math.abs(T().w - 40) < 1e-6 && Math.abs(T().x - x0) < 1e-9, `width ${w1} → ${T().w} (typed final 40)`);
    t = T(); const w2 = t.w; east = Scene3D.screenOf(t.x + t.w, t.y + t.d / 2, t.z0 + 10); ev('pointermove', east, { buttons: 0 }); await wait(20); ev('pointerdown', east); ev('pointerup', east); await wait(30); key('-'); key('2'); key('.'); key('5'); key('Enter'); await wait(80);
    ok('exact offset by typing', Math.abs(T().w - (w2 - 2.5)) < 1e-6, `width ${w2} → ${T().w} (typed offset −2.5)`);
    t = T(); const bx = t.x, by = t.y, bw = t.w, bd = t.d, core0 = project.blocks.find((b) => b.name === 'Core'), cx0 = core0.x; setTool('move'); await wait(60); const ga = Scene3D.gizmoScreen('x'); h0 = H();
    if (ga) { const gb = { x: ga.x + 70, y: ga.y }; await drag(ga, gb); }
    ok('move along an axis without resizing', T().w === bw && T().d === bd && T().x !== bx && Math.abs(T().y - by) < 1e-9, `x ${bx} → ${T().x}, size ${T().w} × ${T().d}`); ok('one undo step for the move', H() === h0 + 1); ok('the core moves with its tower', Math.abs((project.blocks.find((b) => b.name === 'Core').x - cx0) - (T().x - bx)) < 0.02, `core x ${cx0} → ${project.blocks.find((b) => b.name === 'Core').x}`);
    t = T(); const before = JSON.stringify({ x: t.x, y: t.y, w: t.w, d: t.d, floors: t.floors }); setTool('push'); await wait(50); h0 = H(); top = Scene3D.screenOf(t.x + t.w / 2, t.y + t.d / 2, Model.blockTop(t)); ev('pointermove', top, { buttons: 0 }); await wait(20); ev('pointerdown', top); for (let i = 1; i <= 6; i++) { ev('pointermove', { x: top.x, y: top.y - i * 15 }); await wait(10); } key('Escape'); ev('pointerup', { x: top.x, y: top.y - 90 }); await wait(60);
    t = T(); ok('Esc cancels and restores', JSON.stringify({ x: t.x, y: t.y, w: t.w, d: t.d, floors: t.floors }) === before && H() === h0);
    const wb = T().w; undo(); await wait(60); ok('undo reverts the last edit', T().x !== undefined && T().w === wb && H() === h0 - 1, `x now ${T().x}`);
    setWorkspace('check'); const f = rows.find((r) => r.verdict === 'fail' && target(r)); if (f) { pickIssue(f.id); showInModel(f); } await wait(60); const cam = has3d ? JSON.stringify(Scene3D.screenOf(0, 0, 0)) + ` ${cv.clientWidth}×${cv.clientHeight}` : ''; setWorkspace('design'); setView('3d'); await wait(80);
    const cam2 = has3d ? JSON.stringify(Scene3D.screenOf(0, 0, 0)) + ` ${cv.clientWidth}×${cv.clientHeight}` : ''; ok('inspect an issue, back to Design, view kept', !!f && state.workspace === 'design' && cam2 === cam, (f ? f.title : 'no issue') + (cam2 === cam ? '' : ` · ${cam} vs ${cam2}`));
    setTool('select'); await wait(50); select(T().id); await wait(40); t = T(); const w5 = t.w, x5 = t.x; h0 = H(); let sf = Scene3D.screenOf(t.x + t.w, t.y + t.d / 2, t.z0 + 10), sf2 = Scene3D.screenOf(t.x + t.w + 4, t.y + t.d / 2, t.z0 + 10); await drag(sf, sf2);
    ok('Select tool: drag a face of the selected block to push/pull', T().w > w5 && Math.abs(T().x - x5) < 1e-9 && H() === h0 + 1, `width ${w5} → ${T().w}`);
    select(null); await wait(40); t = T(); const w6 = t.w, x6 = t.x, y6 = t.y; sf = Scene3D.screenOf(t.x + t.w * 0.4, t.y, t.z0 + 12); await drag(sf, { x: sf.x + 60, y: sf.y });
    ok('Select tool: drag another block to move it', T().w === w6 && (T().x !== x6 || T().y !== y6) && state.selected === t.id, `x ${x6} → ${T().x}, y ${y6} → ${T().y}`);
    undo(); await wait(40); undo(); await wait(60);
    setWorkspace('design'); state.progView = 'stack'; $('blocksSec').open = true; renderDesign(); await wait(40); { const am = project.blocks.find((b) => b.name === 'Amenity'), z00 = am.z0, rowsEl = [...document.querySelectorAll('#blockList .lrow')], src = rowsEl.find((r) => r.dataset.id === am.id), dst = rowsEl[0], dt = new DataTransfer(), rc = dst.getBoundingClientRect(); h0 = H();
      src.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true })); dst.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, clientY: rc.top + 2 })); dst.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, clientY: rc.top + 2 })); await wait(60);
      const am2 = project.blocks.find((b) => b.name === 'Amenity'); ok('Program Stack: drag a row to the top restacks it', am2.z0 > z00 && H() === h0 + 1, `Amenity base ${z00} → ${am2.z0} m`); undo(); await wait(40); state.progView = 'occ'; }
    { setWorkspace('design'); state.formAll = true; select(null); await wait(40); const chip = document.querySelector('[data-fsel="*"]'); if (chip) chip.click(); await wait(40); const tb = document.querySelector('#formBox [data-ftype="taper"]'); if (tb) tb.click(); await wait(80); const g = project.blocks.filter((b) => b.use !== 'core' && b.use !== 'parking' && b.z0 > -0.01 && !b.hidden); ok('Whole building: a taper spans every above-grade block', g.length > 1 && g.every((b) => b.form && b.form.type === 'taper' && b.form.span && b.form.span.H > 0), `${g.length} blocks, span ${g[0] && g[0].form && g[0].form.span ? g[0].form.span.H.toFixed(1) : '—'} m`); undo(); await wait(40); state.formAll = false; }
    { const r = rows.find((x) => x.id === 'setback'); ok('Guideline setbacks row in the checks', !!r && r.verdict !== 'info', r ? `${r.verdict}: ${String(r.value).slice(0, 90)}` : 'no row'); }
    { const t = T(), other = project.blocks.find((b) => b.use === 'retail') || project.blocks.find((b) => b !== t && b.use !== 'core'); select(t.id); selectPair(other.id); await wait(30); const txt = ($('pairOut') || {}).textContent || ''; const fs = Rules.fireSeparation(t, other); ok('Fire separation between two blocks', !!$('pairOut') && txt.length > 20, `${t.name} (${fs.ga}) / ${other.name} (${fs.gb}): ${fs.hours} h, ${fs.rel}`); select(null); }
    { setWorkspace('site'); setBrief((B) => { B.gfa = 24000; B.mix = { residential: 55, hotel: 10, office: 15, retail: 8, restaurant: 4, amenity: 8 }; B.plate = 620; B.parkingLevels = 2; B.heightTarget = null; }); const A = Brief.areas(project); ok('Brief: program mix defined and adds to 100%', A.ok && A.gfaTarget === 24000, `${A.total}% · ${A.gfaTarget} m² · ${Object.entries(A.by).filter(([, r]) => r.pct).map(([u, r]) => `${u} ${fmt0(r.target)}`).join(', ')}`);
      setWorkspace('design'); await wait(30); const r = Gen.run(0, true); await wait(150); ok('Generate: a podium-and-tower proposal from the brief', project.blocks.filter((b) => b.use !== 'core').length >= 5 && !!project.param && project.param.mode === 'gen', `${r.label}: ${r.height.toFixed(1)} m, ${r.storeys} storeys, FSR ${r.fsr.toFixed(2)}, ${r.conflicts.length} conflict(s), generated ${fmt0(r.genTotal)} of ${fmt0(r.reqTotal)} m²`);
      const before = window.Iterate ? Iterate.save('Generated option') : null;
      setWorkspace('design'); await wait(30); const resB = project.blocks.filter((b) => b.use === 'residential' && b.z0 > 0).sort((p2, q2) => q2.floors - p2.floors)[0]; const f0 = resB.floors, half = Math.floor(f0 / 2); splitBlock(resB.id, half); await wait(40); const upper = project.blocks.find((b) => b.name === resB.name + ' upper'); ok('Edit: split a program block at a chosen storey', !!upper && resB.floors === half && upper.floors === f0 - half && Math.abs(upper.z0 - Model.blockTop(resB)) < 0.01, `${resB.name}: ${f0} storeys → ${resB.floors} + ${upper ? upper.floors : '—'}`);
      const hotel = project.blocks.find((b) => b.use === 'hotel' && b.z0 > 0); if (hotel && upper) { const hz = hotel.z0; reorderStack(upper.id, hotel.id, false); await wait(40); ok('Edit: move the segment below the hotel in the stack', upper.z0 < hotel.z0 && Math.abs(Model.blockTop(upper) - hotel.z0) < 0.05, `${upper.name} ${upper.z0.toFixed(1)}–${Model.blockTop(upper).toFixed(1)} m; hotel base ${hz.toFixed(1)} → ${hotel.z0.toFixed(1)} m`); }
      if (upper) { const w0 = upper.w; edit(upper.id, { w: Model.snap(w0 - 4), x: Model.snap(upper.x + 2) }, false); edit(upper.id, {}, true); await wait(40); ok('Edit: adjust the footprint of the moved segment', Math.abs(upper.w - (w0 - 4)) < 0.01, `width ${w0} → ${upper.w} m`); }
      const after = window.Iterate ? Iterate.save('Reorganized stack') : null; const vs = Iterate.list(); const vA = vs.find((x) => x.id === before.id), vB = vs.find((x) => x.id === after.id); const cmp = Iterate.compareHTML ? Iterate.compareHTML(vA, vB) : '';
      ok('Compare: both options saved with their brief, differences and stacks shown', !!vA && !!vB && !!vB.brief && /Program share/.test(cmp) && /stacksvg/.test(cmp), `${vs.length} versions · comparison ${cmp.length} chars`);
      state.editMode = 'mix'; Stack.render(); await wait(20); const plan = Stack.mixPlan(project); ok('Maintain program mix: a preview of storey changes is offered, nothing applied', Array.isArray(plan.plan), `${plan.plan.length} suggested change(s)`); state.editMode = 'free'; }
    const v = window.Iterate ? Iterate.save('Pushed and pulled') : null; ok('save the edited design as a version', !!v && Iterate.status().state === 'saved', v ? v.name : '');
    document.body.dataset.opstest = out.join(' | '); console.log('OPS ' + out.join(' | '));
  }

  const api = { project: () => project, massProject, state, selectPair, evaluateProject, currentLevel, planFor, selected, select, edit, travelLimit, sectionBlock, snapZ, context, daylight, envelope, focus, tip, limits, liveWarnings, rowTouches, rows: () => rows };
  function boot(saved) {
    if (saved && saved.project) { project = saved.project; Model.syncIds(project); const st = saved.state || {}; for (const k of ['workspace', 'view', 'tool', 'levelKey', 'heat', 'selected', 'secAxis', 'secPos']) if (st[k] !== undefined) state[k] = st[k]; if (st.aids) state.aids = Object.assign({}, DEFAULT_AIDS, st.aids); if (st.snap) state.snap = Object.assign({}, DEFAULT_SNAP, st.snap); }
    if (state.aids.contextOpacity == null) state.aids.contextOpacity = DEFAULT_AIDS.contextOpacity;
    if (!project.name) project.name = project.site.addr ? `${project.site.addr} study` : 'Tower study';
    state.workspace = 'site'; // the tool always opens on Site; a hash can still open another tab
    state.tool = 'select';
    let h = (location.hash || '').replace('#', ''); if (['program', 'form', 'edit', 'brief', 'massing', 'generate'].includes(h)) h = 'design'; if (h === 'stack') { h = 'design'; state.progView = 'stack'; }
    if (['plan', 'section', '3d'].includes(h)) state.view = h; else if (/^(L\d+|P\d+)h?$/.test(h)) { state.view = 'plan'; const hh = h.replace(/h$/, ''); state.heat = h.endsWith('h'); state.levelKey = hh[0] === 'P' ? 'L-' + hh.slice(1) : hh; } else if (['site', 'design', 'check', 'compare', 'report'].includes(h)) state.workspace = h; else if (h === 'report-compare') state.workspace = 'design'; else if (h === 'select' || h === 'push' || h === 'move') { state.workspace = 'design'; state.selected = (project.blocks.find((b) => b.use === 'residential') || {}).id || null; if (h !== 'select') state.tool = h; } else if (h === 'issue' || h === 'showissue') state.workspace = 'check';
    if (window.Icons) Icons.apply(document);
    if (/^form-/.test(h) && window.Form) { const t = project.blocks.find((b) => b.use === 'residential'); const [, kind, extra] = h.split('-'); if (t) { t.form = Form.newForm(kind === 'voids' ? 'prism' : kind); if (kind === 'voids' || extra === 'voids') t.form.voids = [Object.assign({ type: 'gardens' }, Form.VOIDS.gardens.defaults), Object.assign({ type: 'f2f' }, Form.VOIDS.f2f.defaults)]; if (extra === 'spiral') t.form.step = Object.assign({ mode: 'spiral' }, Form.STEPS.spiral.defaults); state.workspace = extra === 'report' ? 'report' : 'design'; state.selected = t.id; state.formOpen = true; state.formVoid = 0; } }
    bindSite(); bindGrips(); applyPanels();
    Views.init($('stage'), api);
    try { has3d = !!(window.Scene3D && Scene3D.init($('c3d'), api, { annot: $('annots'), readout: $('readout'), compass: $('compass') })); } catch (e) { console.error('3D failed', e); has3d = false; }
    if (!has3d) { $('c3d').hidden = true; $('stage').hidden = false; if (state.view === '3d') state.view = 'plan'; }
    document.querySelectorAll('#tabs button').forEach((b) => (b.onclick = () => setWorkspace(b.dataset.ws)));
    document.querySelectorAll('.vtc .seg button').forEach((b) => (b.onclick = () => setView(b.dataset.view)));
    document.querySelectorAll('[data-overlay]').forEach((i) => (i.onchange = () => { state.aids[i.dataset.overlay] = i.checked; saveUi(); renderViewChrome(); drawStage(true); }));
    $('btnSnap').onclick = () => togglePop('popSnap', $('btnSnap'));
    $('btnFit').onclick = () => { if (state.view === '3d' && has3d) Scene3D.fitProject(true); else { Views.refit(); Views.draw(); } };
    $('btnResetView').onclick = () => { if (state.view === '3d' && has3d) Scene3D.resetView(); else { Views.refit(); Views.draw(); } };
    $('btnLayers').onclick = () => togglePop('popLayers', $('btnLayers')); $('btnHelp').onclick = () => togglePop('popHelp', $('btnHelp')); $('btnSave').onclick = () => togglePop('popSave', $('btnSave'));
    $('saveGo').onclick = doSave; $('saveName').onkeydown = (e) => { if (e.key === 'Enter') doSave(); };
    document.addEventListener('pointerdown', (e) => { if (openPop && !openPop.el.contains(e.target) && !(openPop.btn && openPop.btn.contains(e.target))) closePops(); });
    $('btnUndo').onclick = undo; $('btnRedo').onclick = redo; $('btnAddRamp').onclick = addRamp;
    $('projName').addEventListener('change', (e) => { const v = e.target.value.trim(); if (v && v !== project.name) { commit(); project.name = v; baseline = Model.clone(project); renderTop(); } });
    $('projName').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
    window.addEventListener('keydown', keys);
    new ResizeObserver(() => drawPreview()).observe($('mapPreviewBtn'));
    computeAll(); if (!state.secPos) { const b = sectionBlock(); state.secPos = b ? b.y + b.d / 2 : project.site.d / 2; }
    baseline = Model.clone(project);
    document.querySelectorAll('details.sec[data-key]').forEach((d) => { const k = d.dataset.key; if (k in state.secOpen) d.open = !!state.secOpen[k]; d.addEventListener('toggle', () => { state.secOpen[k] = d.open; saveUi(); }); });
    if (window.Brief) { try { Brief.mount({ target: $('briefTarget'), mix: $('briefMix') }, window.App); } catch (e) { console.error('Brief', e); } }
    for (const [mod, id] of [['Gen', 'genBody'], ['Iterate', 'compareBody'], ['Report', 'reportBody']]) { if (window[mod] && typeof window[mod].mount === 'function') { try { window[mod].mount($(id), window.App); } catch (e) { console.error(mod, e); $(id).innerHTML = `<div class="empty">${mod} failed to load: ${esc(e.message)}</div>`; } } else $(id).innerHTML = '<div class="empty">This module is not loaded.</div>'; }
    setWorkspace(state.workspace); setView(state.view); renderAll(); if (has3d) Scene3D.resetView();
    if (h === 'issue' || h === 'showissue') { const f = rows.find((r) => r.verdict === 'fail' && (h === 'issue' || target(r))); if (f) { pickIssue(f.id); if (h === 'showissue') showInModel(f); } }
    if (h === 'layers') togglePop('popLayers', $('btnLayers')); if (h === 'help') togglePop('popHelp', $('btnHelp')); if (h === 'map') openMap(); if (h === 'fsr') openMetric('fsr', document.querySelector('[data-metric="fsr"]'));
    if (h === 'report-compare' && window.Iterate) { Iterate.save('Base scheme'); const t = project.blocks.find((b) => b.use === 'residential'); if (t) mutate(() => { t.floors = 14; }); Iterate.save('Fourteen storeys'); setWorkspace('report'); }
    if (h === 'report-outdated') { setWorkspace('report'); const t = project.blocks.find((b) => b.use === 'residential'); if (t) mutate(() => { t.floors += 1; }); }
    if (h === 'demo-compare' && window.Iterate) { Iterate.save('Base scheme'); const t = project.blocks.find((b) => b.use === 'residential'); if (t) mutate(() => { t.floors = 16; }); Iterate.save('Shorter tower'); setWorkspace('compare'); }
    if (h === 'gendemo') setTimeout(() => { setBrief((B) => { B.gfa = 24000; B.mix = { residential: 55, hotel: 10, office: 15, retail: 8, restaurant: 4, amenity: 8 }; B.plate = 620; }); Gen.run(0, true); const t = project.blocks.find((b) => b.use === 'hotel'); if (t) select(t.id); }, 200);
    if (h === 'ops') setTimeout(() => opsTest().catch((e) => { document.body.dataset.opstest = 'ERROR ' + e.message; console.error('OPS ERROR', e.message, e.stack); }), 300);
    if (h === 'pushdemo') setTimeout(() => { const t = project.blocks.find((b) => b.name === 'Tower'); if (!t) return; select(t.id); setTool('push'); const p = Scene3D.screenOf(t.x + t.w, t.y + t.d / 2, t.z0 + 12); const cv = $('c3d'); const ev = (type, q, extra = {}) => cv.dispatchEvent(new PointerEvent(type, Object.assign({ clientX: q.x, clientY: q.y, bubbles: true, pointerId: 1, button: 0, buttons: 1 }, extra))); ev('pointermove', p, { buttons: 0 }); ev('pointerdown', p); for (let i = 1; i <= 6; i++) ev('pointermove', { x: p.x + i * 12, y: p.y + i * 2 }); }, 300);
    document.body.dataset.selftest = JSON.stringify({ levels: levels.length, rows: rows.length, fail: rows.filter((r) => r.verdict === 'fail').length, city: !!(window.Site && Site.available()), three: has3d, workspace: state.workspace });
    if (window.claude && window.claude.hot && window.claude.hot.snapshot) window.claude.hot.snapshot(() => ({ project, state }));
  }
  window.App = { evaluateProject, envelope, limits, selectPair, selected, setBrief, genLinked, applyGenerated, splitBlock, mergeBlocks, reorderStack, placeAt, setGap, transferBlock, applyMixPlan, programAreas, saveUi, prov, edit, state, project: () => project, replaceProject, rows: () => Checks.present(rows, project), levels: () => levels, plans: () => plans, totals: () => Model.totals(massProject()), metrics, snapshot, toast, setView, showLevel, setWorkspace, select, on: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); }, save, pickParcel, context, daylight, envelope, prov, applyMassing, collapseLeft: () => { state.lcollapsed = true; applyPanels(); saveUi(); }, rawRows: () => rows, massProject, onVersions: () => { renderTop(); if (window.Report && state.workspace === 'report') Report.render(); } };
  if (window.claude && window.claude.hot && window.claude.hot.ready) window.claude.hot.ready(boot); else boot((window.claude && window.claude.hot && window.claude.hot.data) || null);
})();
