/* views.js — Canvas rendering and pointer editing for the 3D (axonometric), Plan and Section views.
   The app passes a context object with the project, level table, plan lookup and edit callbacks. No rule logic here. */
window.Views = (function () {
  const G = Geom, C = Geom.C;
  const COL = {};
  function readTokens() { const cs = getComputedStyle(document.documentElement); for (const k of ['res', 'hotel', 'hotel-line', 'office', 'retail', 'restaurant', 'amenity', 'parking', 'core', 'ramp', 'ink', 'ink2', 'muted', 'line', 'grid', 'accent', 'pass', 'fail', 'review', 'paper', 'stage', 'panel', 'street', 'park', 'context', 'context-edge', 'amenity-line', 'site-line']) COL[k.replace(/-/g, '_')] = cs.getPropertyValue('--' + k).trim() || '#888'; }
  const useCol = (u) => COL[u === 'residential' ? 'res' : u] || COL.ink;
  function alpha(hex, a) { const m = hex.replace('#', ''); const n = m.length === 3 ? m.split('').map((c) => c + c).join('') : m; const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16); return `rgba(${r},${g},${b},${a})`; }

  const vis = (b) => !b.hidden;
  let canvas, ctx, app, W = 0, H = 0, dpr = 1;
  const cam = { plan: { s: 8, cx: 0, cy: 0, mx: 0, my: 0 }, axon: { s: 5, cx: 0, cy: 0 }, sec: { s: 6, cx: 0, cy: 0 } };
  let drag = null, hover = null, fitted = { plan: false, axon: false, sec: false };

  function init(cv, a) { canvas = cv; app = a; ctx = canvas.getContext('2d'); readTokens();
    new ResizeObserver(resize).observe(canvas.parentElement); resize();
    canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', cancelDrag);
    canvas.addEventListener('wheel', onWheel, { passive: false }); canvas.addEventListener('dblclick', onDbl);
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readTokens(); draw(); });
    new MutationObserver(() => { readTokens(); draw(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); }
  function resize() { const r = canvas.parentElement.getBoundingClientRect(); dpr = window.devicePixelRatio || 1; W = Math.max(50, r.width); H = Math.max(50, r.height); canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); canvas.style.width = W + 'px'; canvas.style.height = H + 'px'; draw(); }

  /* ---------- projections ---------- */
  const site = () => app.project().site;
  function fitPlan() { const s = site(), m = app.context && app.context() ? 50 : 10; const sc = Math.min((W - 80) / (s.w + m), (H - 80) / (s.d + m)); cam.plan = { s: sc, cx: W / 2, cy: H / 2, mx: s.w / 2, my: s.d / 2 }; fitted.plan = true; }
  const P2 = (x, y) => [cam.plan.cx + (x - cam.plan.mx) * cam.plan.s, cam.plan.cy - (y - cam.plan.my) * cam.plan.s];
  const P2inv = (sx, sy) => [(sx - cam.plan.cx) / cam.plan.s + cam.plan.mx, -(sy - cam.plan.cy) / cam.plan.s + cam.plan.my];
  function fitAxon() { const s = site(), T = Model.totals(app.project()); const span = (s.w + s.d) * 0.5 + (T.maxZ - Math.min(0, T.minZ)) + 10; const sc = Math.min((W - 60) / ((s.w + s.d) * 0.866 + 10), (H - 60) / span); cam.axon = { s: sc, cx: W / 2 - (s.w - s.d) * 0.866 * sc / 2, cy: H / 2 + ((s.w + s.d) * 0.25 + (T.maxZ + Math.min(0, T.minZ)) / 2) * sc }; fitted.axon = true; }
  const P3 = (x, y, z) => [cam.axon.cx + (x - y) * 0.866 * cam.axon.s, cam.axon.cy - (x + y) * 0.5 * cam.axon.s - z * cam.axon.s];
  function groundDelta(dsx, dsy) { const A = dsx / (0.866 * cam.axon.s), B = -dsy / (0.5 * cam.axon.s); return [(A + B) / 2, (B - A) / 2]; }
  function fitSec() { const s = site(), T = Model.totals(app.project()); const span = Math.max(s.w, s.d) + (app.context && app.context() ? 70 : 10), zspan = T.maxZ - Math.min(0, T.minZ) + 10; const sc = Math.min((W - 80) / span, (H - 80) / zspan); cam.sec = { s: sc, cx: W / 2 - (Math.max(s.w, s.d) / 2) * sc, cy: H / 2 + ((T.maxZ + Math.min(0, T.minZ)) / 2) * sc }; fitted.sec = true; }
  const PS = (u, z) => [cam.sec.cx + u * cam.sec.s, cam.sec.cy - z * cam.sec.s];

  /* ---------- drawing ---------- */
  function draw() {
    if (!ctx) return; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = COL.stage; ctx.fillRect(0, 0, W, H);
    const v = app.state.view;
    if (v === 'plan') drawPlan(); else if (v === 'section') drawSection(); else drawAxon();
  }
  function text(t, x, y, opts = {}) { ctx.font = `${opts.weight || 400} ${opts.size || 11}px ${opts.mono ? "'IBM Plex Mono', ui-monospace, monospace" : 'Inter, system-ui, sans-serif'}`; ctx.fillStyle = opts.color || COL.ink; ctx.textAlign = opts.align || 'left'; ctx.textBaseline = opts.base || 'alphabetic'; ctx.fillText(t, x, y); }

  /* ----- plan ----- */
  function drawPlan() {
    if (!fitted.plan) fitPlan();
    const s = site(), L = app.currentLevel(), P = L ? app.planFor(L) : null, sc = cam.plan.s;
    // grid 5 m
    ctx.strokeStyle = COL.grid; ctx.lineWidth = 1;
    for (let x = 0; x <= s.w; x += 5) { const [a, b] = P2(x, 0), [c, d] = P2(x, s.d); ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke(); }
    for (let y = 0; y <= s.d; y += 5) { const [a, b] = P2(0, y), [c, d] = P2(s.w, y); ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke(); }
    // site
    const [sx0, sy0] = P2(0, s.d), [sx1, sy1] = P2(s.w, 0);
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]); ctx.strokeRect(sx0, sy0, sx1 - sx0, sy1 - sy0); ctx.setLineDash([]);
    const lab = (side, t) => { const m = side === 'S' ? P2(s.w / 2, -1.2) : side === 'N' ? P2(s.w / 2, s.d + 2.2) : side === 'W' ? P2(-1.2, s.d / 2) : P2(s.w + 1.2, s.d / 2); text(t, m[0], m[1] + (side === 'S' ? 10 : 0), { color: COL.muted, size: 11, align: side === 'W' ? 'right' : side === 'E' ? 'left' : 'center' }); };
    lab(s.frontage, 'STREET'); if (s.lane !== s.frontage) lab(s.lane, 'LANE');
    drawContextPlan(s);
    if (!L) { text('No level here. Add a block.', W / 2, H / 2, { align: 'center', color: COL.muted, size: 13 }); return; }
    // ghost of blocks on other levels
    for (const b of app.project().blocks) if (b.use !== 'core' && vis(b) && !L.blocks.includes(b)) { const [x, y] = P2(b.x, b.y + b.d); ctx.strokeStyle = alpha(COL.ink, 0.3); ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.strokeRect(x, y, b.w * sc, b.d * sc); ctx.setLineDash([]); }
    // blocks at this level
    for (const b of L.blocks) { if (!vis(b)) continue; const [x, y] = P2(b.x, b.y + b.d); ctx.fillStyle = alpha(useCol(b.use), 0.45); ctx.fillRect(x, y, b.w * sc, b.d * sc); ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.2; ctx.strokeRect(x, y, b.w * sc, b.d * sc); }
    if (P) {
      // heat map
      if (app.state.heat && P.travel) { const g = P.grid, lim = app.travelLimit(L); for (let j = 0; j < g.H; j++) for (let i = 0; i < g.W; i++) { const k = g.idx(i, j), c = g.cells[k]; if (c !== C.CORR && c !== C.OPEN && c !== C.AISLE && c !== C.RAMP) continue; const d = P.travel[k]; const [px, py] = P2(g.ox + i * G.CELL, g.oy + (j + 1) * G.CELL); ctx.fillStyle = isFinite(d) ? heatCol(d / lim) : alpha(COL.fail, 0.7); ctx.fillRect(px, py, G.CELL * sc + 0.5, G.CELL * sc + 0.5); } }
      else { // corridors, aisles, ramps
        for (const seg of P.corridors) { const [x, y] = P2(seg.x, seg.y + seg.d); ctx.fillStyle = alpha(COL.ink, 0.07); ctx.fillRect(x, y, seg.w * sc, seg.d * sc); }
        for (const r of P.rooms) if (r.kind === 'aisle' || r.kind === 'ramp') { const [x, y] = P2(r.rect.x, r.rect.y + r.rect.d); ctx.fillStyle = r.kind === 'ramp' ? alpha(COL.ramp, 0.25) : alpha(COL.ink, 0.06); ctx.fillRect(x, y, r.rect.w * sc, r.rect.d * sc); if (r.kind === 'ramp') { ctx.strokeStyle = COL.ramp; ctx.lineWidth = 1; ctx.strokeRect(x, y, r.rect.w * sc, r.rect.d * sc); } } }
      // cores
      for (const c of P.cores) { const [x, y] = P2(c.x, c.y + c.d); ctx.fillStyle = alpha(COL.core, 0.18); ctx.fillRect(x, y, c.w * sc, c.d * sc); ctx.save(); ctx.beginPath(); ctx.rect(x, y, c.w * sc, c.d * sc); ctx.clip(); ctx.strokeStyle = alpha(COL.core, 0.5); ctx.lineWidth = 1; for (let k = -c.d * sc; k < c.w * sc; k += 8) { ctx.beginPath(); ctx.moveTo(x + k, y + c.d * sc); ctx.lineTo(x + k + c.d * sc, y); ctx.stroke(); } ctx.restore(); ctx.strokeStyle = COL.core; ctx.lineWidth = 2; ctx.strokeRect(x, y, c.w * sc, c.d * sc); if (c.w * sc > 40) text(c.name || 'Core', x + c.w * sc / 2, y + c.d * sc / 2 + 4, { align: 'center', size: 11, weight: 500, color: COL.core }); }
      // stalls
      for (const r of P.rooms) if (r.kind === 'stall') { const [x, y] = P2(r.rect.x, r.rect.y + r.rect.d); ctx.strokeStyle = r.unitType === 'acc' ? COL.accent : alpha(COL.ink, 0.45); ctx.lineWidth = r.unitType === 'acc' ? 1.5 : 0.75; ctx.strokeRect(x, y, r.rect.w * sc, r.rect.d * sc); }
      // highlighted rooms
      const hl = app.state.highlight || [];
      for (const r of P.rooms) if (hl.includes(r.id)) { const [x, y] = P2(r.rect.x, r.rect.y + r.rect.d); ctx.fillStyle = alpha(COL.fail, 0.25); ctx.fillRect(x, y, r.rect.w * sc, r.rect.d * sc); }
      // walls
      ctx.strokeStyle = alpha(COL.ink, 0.72); ctx.lineWidth = Math.max(0.8, Math.min(1.8, sc * 0.12)); ctx.lineCap = 'butt'; ctx.beginPath();
      for (const w of P.walls || []) { const a = P2(w[0], w[1]), b = P2(w[2], w[3]); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      ctx.stroke();
      // doors: leaf + swing
      ctx.lineWidth = 1; for (const r of P.rooms) { if (r.kind === 'stall' || r.kind === 'aisle' || r.kind === 'open') continue; for (const d of r.doors || []) drawDoor(r.rect, d, sc, r.parent ? alpha(COL.ink, 0.45) : d.exit ? COL.fail : alpha(COL.ink, 0.6)); }
      // exits
      for (const e of P.exits) { if (e.street) continue; const [x, y] = P2(e.x, e.y); ctx.fillStyle = COL.fail; ctx.fillRect(x - 4, y - 4, 8, 8); if (sc > 6) text('EXIT', x, y - 6, { align: 'center', size: 9, weight: 600, color: COL.fail, mono: true }); }
      // farthest point
      if (P.metrics.farCell >= 0 && app.state.heat) { const g = P.grid, i = P.metrics.farCell % g.W, j = (P.metrics.farCell - i) / g.W; const [mx, my] = g.toM(i, j); const [x, y] = P2(mx, my); ctx.strokeStyle = COL.fail; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.stroke(); text(`${P.metrics.maxTravel.toFixed(1)} m`, x + 10, y + 4, { size: 11, mono: true, color: COL.fail, weight: 500 }); }
      // labels
      if (sc > 5) for (const r of P.rooms) { if (r.parent || r.kind === 'stall' || r.kind === 'aisle' || r.kind === 'open' || r.area < 12) continue; const [x, y] = P2(r.rect.x + r.rect.w / 2, r.rect.y + r.rect.d / 2); if (r.rect.w * sc < 36) continue; text(r.name, x, y - 1, { align: 'center', size: Math.min(12, Math.max(9, sc * 1.1)), weight: 500, color: alpha(COL.ink, 0.85) }); text(`${Math.round(r.area)} m²`, x, y + 11, { align: 'center', size: 9, mono: true, color: COL.muted }); }
      if (sc > 9) for (const r of P.rooms) { if (!r.parent || r.area < 4) continue; const [x, y] = P2(r.rect.x + r.rect.w / 2, r.rect.y + r.rect.d / 2); if (Math.min(r.rect.w, r.rect.d) * sc < 22) continue; text(r.name, x, y + 3, { align: 'center', size: 8.5, color: alpha(COL.ink, 0.6) }); }
    }
    if (app.state.aids.shadow) drawShadowsPlan(s);
    if (app.state.aids.daylight) drawDaylightPlan(L);
    // ramps on this level (editable)
    for (const r of L.ramps) { const rr = Plans.rampRect(r); const [x, y] = P2(rr.x, rr.y + rr.d); ctx.strokeStyle = COL.ramp; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.strokeRect(x, y, rr.w * sc, rr.d * sc); ctx.setLineDash([]); text(`ramp ${r.dir} ↓`, x + 4, y + 12, { size: 10, color: COL.ramp, weight: 500 }); }
    // selection handles
    const sel = app.selected(); if (sel && (L.blocks.includes(sel) || L.cores.includes(sel) || L.ramps.includes(sel))) { if (app.state.tool === 'push' || app.state.tool === 'select') drawHandles(selRect(sel), sc); else { const r = selRect(sel); const [x0, y0] = P2(r.x, r.y + r.d); ctx.strokeStyle = COL.accent; ctx.lineWidth = 2.5; ctx.strokeRect(x0, y0, r.w * sc, r.d * sc); } }
    // dimensions for the selected block
    if (sel && sel.w != null) { const r = selRect(sel); const [x0, y0] = P2(r.x, r.y), [x1, y1] = P2(r.x + r.w, r.y + r.d); text(`${r.w} m`, (x0 + x1) / 2, y0 + 14, { align: 'center', mono: true, size: 10, color: COL.accent }); ctx.save(); ctx.translate(x0 - 8, (y0 + y1) / 2); ctx.rotate(-Math.PI / 2); text(`${r.d} m`, 0, 0, { align: 'center', mono: true, size: 10, color: COL.accent }); ctx.restore(); }
  }
  function drawContextPlan(s) {
    const A = app.state.aids, cx = app.context ? app.context() : null;
    if (cx && A.context !== false) { const sc = cam.plan.s, path = (pts, close) => { ctx.beginPath(); pts.forEach((q, i) => { const [x, y] = P2(q[0], q[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); if (close) ctx.closePath(); };
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = COL.street; ctx.lineWidth = Math.max(4, 18 * sc); for (const st of cx.streets) { path(st.pts); ctx.stroke(); }
      ctx.lineWidth = Math.max(2, 6 * sc); for (const l of cx.lanes || []) { path(l); ctx.stroke(); }
      ctx.strokeStyle = alpha(COL.context_edge || COL.muted, 0.35); ctx.lineWidth = 0.6; for (const pc of cx.parcels || []) { path(pc, true); ctx.stroke(); }
      for (const pk of cx.parks) { path(pk.poly, true); ctx.fillStyle = COL.park; ctx.fill(); ctx.strokeStyle = alpha(COL.amenity_line || COL.amenity, 0.9); ctx.lineWidth = 0.8; ctx.stroke(); const c = pk.poly.reduce((a, q) => [a[0] + q[0] / pk.poly.length, a[1] + q[1] / pk.poly.length], [0, 0]); const [x, y] = P2(c[0], c[1]); text(pk.name, x, y, { align: 'center', size: 10, color: COL.ink2 || COL.ink, weight: 500 }); }
      for (const f of cx.foot) { path(f.poly, true); ctx.fillStyle = COL.paper; ctx.fill(); ctx.strokeStyle = COL.context_edge || COL.muted; ctx.lineWidth = f.h > 18 ? 1 : 0.7; ctx.stroke();
        if (sc > 2.2 && f.h > 6) { const c = f.poly.reduce((a, q) => [a[0] + q[0] / f.poly.length, a[1] + q[1] / f.poly.length], [0, 0]); const [x, y] = P2(c[0], c[1]); text(`${f.h.toFixed(0)} m`, x, y + 3, { align: 'center', size: 9, mono: true, color: COL.muted }); } }
      if (A.streetNames !== false) for (const st of cx.streets) { if (sc < 1.6 || !st.name) continue; const mid = st.pts[Math.floor(st.pts.length / 2)], a = st.pts[Math.max(0, Math.floor(st.pts.length / 2) - 1)], b = st.pts[Math.min(st.pts.length - 1, Math.floor(st.pts.length / 2) + 1)]; const [x, y] = P2(mid[0], mid[1]); let ang = Math.atan2(-(b[1] - a[1]), b[0] - a[0]); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI; ctx.save(); ctx.translate(x, y); ctx.rotate(ang); text(st.name.replace(/^\d+(-\d+)? /, ''), 0, 3, { align: 'center', size: 9, color: COL.muted, mono: true }); ctx.restore(); }
      ctx.lineCap = 'butt'; }
    if (s.poly) { ctx.beginPath(); s.poly.forEach((q, i) => { const [x, y] = P2(q[0], q[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.strokeStyle = COL.ink; ctx.lineWidth = 2; ctx.stroke(); }
    if (s.edges) for (const e of s.edges) { if (e.kind !== 'x') continue; const a = P2(e.a[0], e.a[1]), b = P2(e.b[0], e.b[1]); ctx.strokeStyle = alpha(COL.ink, 0.8); ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    // guideline setback lines (dashed, coral); labelled with the rule they come from
    const Lc = app.currentLevel ? app.currentLevel() : null; if (app.state.aids.setbacks !== false && (!Lc || Lc.label === 1) && window.Rules && Rules.siteEdges && CODES.odp.guidelineSetbacks) { const set = CODES.odp.guidelineSetbacks[s.setbackSet || 'none']; if (set && set.rules.length) for (const e of Rules.siteEdges(s)) for (const rule of set.rules) { if (rule.edge !== e.kind || !(rule.d > 0) || e.L - 2 * rule.d < 1) continue; const tx = (e.b[0] - e.a[0]) / e.L, ty = (e.b[1] - e.a[1]) / e.L; const a = P2(e.a[0] + e.nx * rule.d + tx * rule.d, e.a[1] + e.ny * rule.d + ty * rule.d), b = P2(e.b[0] + e.nx * rule.d - tx * rule.d, e.b[1] + e.ny * rule.d - ty * rule.d);
      ctx.strokeStyle = alpha(COL.accent_line || COL.accent, rule.above > 0 ? 0.7 : 1); ctx.lineWidth = rule.above > 0 ? 1 : 1.4; ctx.setLineDash(rule.above > 0 ? [3, 3] : [6, 3]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]);
      if (cam.plan.s > 2.5) { let ang = Math.atan2(b[1] - a[1], b[0] - a[0]); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI; ctx.save(); ctx.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); ctx.rotate(ang); text(rule.label, 0, -3, { align: 'center', size: 9, color: COL.accent_ink || COL.accent }); ctx.restore(); } } }
  }
  function drawShadowsPlan(s) {
    if (!window.Sun) return; const cx = app.context ? app.context() : null; const S = Sun.shadows(app.project(), cx, app.state.aids.hour); if (!S.sv) return;
    const poly = (ring, fill) => { ctx.beginPath(); ring.forEach((q, i) => { const [x, y] = P2(q[0], q[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
    for (const r of S.existing) poly(r, 'rgba(60,60,80,0.12)');
    for (const r of S.scheme) poly(r, 'rgba(60,60,80,0.28)');
    if (cx) for (const pk of cx.parks) { const r = Sun.parkShadow(pk, app.project(), cx, [app.state.aids.hour]); const sc = cam.plan.s; ctx.fillStyle = alpha(COL.fail, 0.55); for (const c of r.cells) { const [x, y] = P2(c[0] - r.cell / 2, c[1] + r.cell / 2); ctx.fillRect(x, y, r.cell * sc, r.cell * sc); } }
    const sun = S.sun; const [ox, oy] = P2(-4, -4); const dx = -S.sv[0], dy = -S.sv[1], L = 28 / Math.hypot(dx, dy); ctx.strokeStyle = COL.review; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + dx * L, oy - dy * L); ctx.stroke(); text('sun', ox + dx * (L + 10), oy - dy * (L + 10) + 4, { align: 'center', size: 10, color: COL.review, weight: 600 });
  }
  function drawDaylightPlan(L) {
    const res = app.daylight ? app.daylight() : []; const sc = cam.plan.s;
    for (const r of res) { const b = r.block; if (!L.blocks.includes(b)) continue; const i = Math.round((L.z - b.z0) / b.f2f); const band = r.bands.find((bd) => i >= bd.f0 && i <= bd.f1) || r.bands[0]; if (!band) continue;
      for (const f of band.faces) { if (f.interior) continue; for (const smp of f.samples) { if (smp.interior) continue; const horiz = f.ax === 'x'; const a = horiz ? P2(smp.a - f.ds / 2 + 0.1, f.c) : P2(f.c, smp.a - f.ds / 2 + 0.1), e = horiz ? P2(smp.a + f.ds / 2 - 0.1, f.c) : P2(f.c, smp.a + f.ds / 2 - 0.1); const off = horiz ? [0, f.ny * -1 * 4] : [f.nx * 4, 0]; ctx.strokeStyle = smp.ok ? COL.pass : smp.d >= 3.7 ? COL.review : COL.fail; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(a[0] + off[0], a[1] + off[1]); ctx.lineTo(e[0] + off[0], e[1] + off[1]); ctx.stroke(); }
        if (sc > 4 && f.frac < 0.999) { const mid = f.ax === 'x' ? P2((f.a0 + f.a1) / 2, f.c + f.ny * 2) : P2(f.c + f.nx * 2, (f.a0 + f.a1) / 2); text(`${Math.round(f.frac * 100)}% · ${f.worst != null ? f.worst.toFixed(1) + ' m' : ''}`, mid[0], mid[1] + 4, { align: 'center', size: 9, mono: true, color: COL.fail, weight: 600 }); } } }
  }
  function heatCol(f) { const t = Math.max(0, Math.min(1.3, f)); const h = (1 - Math.min(1, t)) * 120; return `hsla(${h}, 70%, ${t > 1 ? 40 : 55}%, ${t > 1 ? 0.85 : 0.6})`; }
  function drawDoor(rect, d, sc, color) {
    const horiz = d.side === 'N' || d.side === 'S'; const y = d.side === 'N' ? rect.y + rect.d : d.side === 'S' ? rect.y : null, x = d.side === 'E' ? rect.x + rect.w : d.side === 'W' ? rect.x : null;
    let a, b; if (horiz) { a = P2(d.at - d.w / 2, y); b = P2(d.at + d.w / 2, y); } else { a = P2(x, d.at - d.w / 2); b = P2(x, d.at + d.w / 2); }
    // gap already in walls; draw the leaf swinging into the room
    ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.beginPath();
    const r = d.w * sc; let ang0, ang1, hx, hy;
    if (d.side === 'S') { [hx, hy] = a; ang0 = -Math.PI / 2; ang1 = 0; } else if (d.side === 'N') { [hx, hy] = a; ang0 = 0; ang1 = Math.PI / 2; } else if (d.side === 'W') { [hx, hy] = b; ang0 = 0; ang1 = Math.PI / 2; } else { [hx, hy] = b; ang0 = Math.PI / 2; ang1 = Math.PI; }
    if (sc > 4) { ctx.arc(hx, hy, r, ang0, ang1); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(hx, hy); const ex = hx + r * Math.cos(d.side === 'S' ? -Math.PI / 2 : d.side === 'N' ? Math.PI / 2 : d.side === 'W' ? 0 : Math.PI), ey = hy + r * Math.sin(d.side === 'S' ? -Math.PI / 2 : d.side === 'N' ? Math.PI / 2 : d.side === 'W' ? 0 : Math.PI); ctx.lineTo(ex, ey); ctx.stroke();
  }
  const selRect = (sel) => sel.len != null ? Plans.rampRect(sel) : G.R(sel.x, sel.y, sel.w, sel.d);
  function drawHandles(r, sc) { const [x0, y0] = P2(r.x, r.y + r.d); const w = r.w * sc, h = r.d * sc; ctx.strokeStyle = COL.accent; ctx.lineWidth = 1.5; ctx.strokeRect(x0, y0, w, h); ctx.fillStyle = COL.panel; for (const [fx, fy] of handlePts()) { ctx.beginPath(); ctx.rect(x0 + fx * w - 4, y0 + fy * h - 4, 8, 8); ctx.fill(); ctx.stroke(); } }
  const handlePts = () => [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5]];

  /* ----- axon ----- */
  function drawAxon() {
    if (!fitted.axon) fitAxon();
    const s = site(), pr = app.massProject ? app.massProject() : app.project(), sel = app.selected();
    const blocks = pr.blocks.filter(vis).sort((a, b) => (b.x + b.y + b.w + b.d) - (a.x + a.y + a.w + a.d) || a.z0 - b.z0);
    const A = app.state.aids, cx = app.context ? app.context() : null;
    // below grade first (translucent), then ground, then above
    const below = blocks.filter((b) => b.z0 < -0.01), above = blocks.filter((b) => b.z0 >= -0.01);
    const T = Model.totals(pr);
    // excavation box
    if (below.length) { const zmin = T.minZ; polyFill([P3(0, 0, zmin), P3(s.w, 0, zmin), P3(s.w, s.d, zmin), P3(0, s.d, zmin)], alpha(COL.ink, 0.04), alpha(COL.ink, 0.25)); }
    for (const b of below) drawBox(b, 0.35, b === sel);
    for (const r of pr.ramps) drawRamp3(r, r === sel);
    // ground plane, context, shadows, parks
    polyFill([P3(0, 0, 0), P3(s.w, 0, 0), P3(s.w, s.d, 0), P3(0, s.d, 0)], alpha(COL.ink, 0.05), COL.ink, 1.5, [6, 4]);
    if (s.poly) polyFill(s.poly.map((q) => P3(q[0], q[1], 0)), null, COL.accent, 2);
    const lab = P3(s.w / 2, -3, 0); text('STREET ' + s.frontage, lab[0], lab[1] + 12, { align: 'center', color: COL.muted, size: 11 });
    if (cx && A.context) for (const pk of cx.parks) polyFill(pk.poly.map((q) => P3(q[0], q[1], 0)), alpha(COL.amenity, 0.25), null);
    let shadowData = null;
    if (A.shadow && window.Sun) { shadowData = Sun.shadows(pr, cx, A.hour); if (shadowData.sv) { for (const r of shadowData.existing) polyFill(r.map((q) => P3(q[0], q[1], 0)), 'rgba(60,60,80,0.12)', null); for (const r of shadowData.scheme) polyFill(r.map((q) => P3(q[0], q[1], 0)), 'rgba(60,60,80,0.3)', null);
      if (cx) for (const pk of cx.parks) { const r = Sun.parkShadow(pk, pr, cx, [A.hour]); for (const c of r.cells) polyFill([P3(c[0] - r.cell / 2, c[1] - r.cell / 2, 0), P3(c[0] + r.cell / 2, c[1] - r.cell / 2, 0), P3(c[0] + r.cell / 2, c[1] + r.cell / 2, 0), P3(c[0] - r.cell / 2, c[1] + r.cell / 2, 0)], alpha(COL.fail, 0.6), null); } } }
    // envelope: basic height and the Board maximum
    if (A.envelope && app.envelope) { const env = app.envelope(); for (const [z, col, lw, labelTxt] of [[env.max, alpha(COL.accent, 0.35), 1, 'Board may allow'], [env.basic, alpha(COL.accent, 0.8), 1.25, 'basic height']]) { if (!z) continue; const ring = s.poly || [[0, 0], [s.w, 0], [s.w, s.d], [0, s.d]]; polyFill(ring.map((q) => P3(q[0], q[1], z)), null, col, lw, [5, 4]); for (const q of ring) { const a = P3(q[0], q[1], 0), b = P3(q[0], q[1], z); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]); } const lp = P3(s.w, 0, z); text(`${labelTxt} ${z.toFixed(1)} m`, lp[0] + 8, lp[1] + 4, { size: 10, color: col, mono: true }); } }
    // neighbours: merge with the scheme blocks and paint far to near
    const items = above.map((b) => ({ kind: 'block', b, key: b.x + b.y + b.w + b.d }));
    if (cx && A.context) for (const f of cx.foot) { const c = f.poly.reduce((a, q) => [a[0] + q[0] / f.poly.length, a[1] + q[1] / f.poly.length], [0, 0]); if (c[0] < -70 || c[1] < -70 || c[0] > s.w + 70 || c[1] > s.d + 70) continue; items.push({ kind: 'ctx', f, key: c[0] + c[1] + 10 }); }
    items.sort((p, q) => q.key - p.key || (p.kind === 'ctx' ? -1 : 1));
    const dl = A.daylight && app.daylight ? app.daylight() : null;
    for (const it of items) { if (it.kind === 'block') { drawBox(it.b, 1, it.b === sel); if (dl) drawDaylightAxon(it.b, dl); } else drawCtxPrism(it.f); }
    // height mark
    const top = P3(0, s.d, T.maxZ); text(`${T.maxZ.toFixed(1)} m`, top[0] - 8, top[1], { align: 'right', mono: true, size: 11, color: COL.accent, weight: 500 });
    const g = P3(0, s.d, 0); ctx.strokeStyle = COL.accent; ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(top[0] - 4, top[1]); ctx.lineTo(g[0] - 4, g[1]); ctx.stroke(); ctx.setLineDash([]);
  }
  function polyFill(pts, fill, stroke, lw = 1, dash = null) { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; if (dash) ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]); } }
  function boxFaces(b) { const z1 = Model.blockTop(b), x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.d;
    return { top: [P3(x0, y0, z1), P3(x1, y0, z1), P3(x1, y1, z1), P3(x0, y1, z1)], south: [P3(x0, y0, b.z0), P3(x1, y0, b.z0), P3(x1, y0, z1), P3(x0, y0, z1)], west: [P3(x0, y0, b.z0), P3(x0, y1, b.z0), P3(x0, y1, z1), P3(x0, y0, z1)] }; }
  function drawBox(b, op, isSel) { const col = useCol(b.use), f = boxFaces(b); const line = isSel ? COL.accent : alpha(COL.ink, 0.55 * op);
    polyFill(f.west, alpha(col, 0.55 * op), line, isSel ? 2 : 1); polyFill(f.south, alpha(col, 0.75 * op), line, isSel ? 2 : 1); polyFill(f.top, alpha(col, 0.95 * op), line, isSel ? 2 : 1);
    // floor lines on the south face
    if (app.state.aids.floorLines && b.floors > 1 && b.use !== 'core') { ctx.strokeStyle = alpha(COL.ink, 0.18 * op); ctx.lineWidth = 0.75; for (let i = 1; i < b.floors; i++) { const z = b.z0 + i * b.f2f; const a = P3(b.x, b.y, z), c = P3(b.x + b.w, b.y, z); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); ctx.stroke(); } }
    const c = f.top[0], d = f.top[2]; if (app.state.aids.dims && b.use !== 'core' && Math.abs(d[0] - c[0]) > 50) text(`${b.name} · ${b.floors}×${b.f2f} m`, (c[0] + d[0]) / 2, (c[1] + d[1]) / 2 + 4, { align: 'center', size: 10, weight: 500, color: alpha(COL.ink, 0.85 * op) }); }
  function drawCtxPrism(f) { const n = f.poly.length; const col = alpha(COL.ink, 0.05), line = alpha(COL.ink, 0.18); const z0 = f.z0 || 0;
    for (let i = 0; i < n; i++) { const a = f.poly[i], b = f.poly[(i + 1) % n]; polyFill([P3(a[0], a[1], z0), P3(b[0], b[1], z0), P3(b[0], b[1], f.h), P3(a[0], a[1], f.h)], col, null); }
    polyFill(f.poly.map((q) => P3(q[0], q[1], f.h)), alpha(COL.ink, 0.1), line, 0.75); }
  function drawDaylightAxon(b, dl) { const r = dl.find((x) => x.block === b); if (!r) return;
    for (const band of r.bands) { const z = b.z0 + ((band.f0 + band.f1) / 2 + 0.5) * b.f2f; for (const f of band.faces) { if (f.interior || (f.k !== 'S' && f.k !== 'W')) continue; for (const smp of f.samples) { if (smp.interior) continue; const a0 = smp.a - f.ds / 2 + 0.15, a1 = smp.a + f.ds / 2 - 0.15; const pa = f.ax === 'x' ? P3(a0, f.c, z) : P3(f.c, a0, z), pb = f.ax === 'x' ? P3(a1, f.c, z) : P3(f.c, a1, z); ctx.strokeStyle = smp.ok ? COL.pass : smp.d >= 3.7 ? COL.review : COL.fail; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke(); } } } }
  function drawRamp3(r, isSel) { const rr = Plans.rampRect(r); const pts = [[rr.x, rr.y], [rr.x + rr.w, rr.y], [rr.x + rr.w, rr.y + rr.d], [rr.x, rr.y + rr.d]].map(([x, y]) => { const t = r.dir === 'N' ? (y - rr.y) / rr.d : r.dir === 'S' ? 1 - (y - rr.y) / rr.d : r.dir === 'E' ? (x - rr.x) / rr.w : 1 - (x - rr.x) / rr.w; return P3(x, y, r.zTop - t * (r.zTop - r.zBottom)); }); polyFill(pts, alpha(COL.ramp, 0.45), isSel ? COL.accent : COL.ramp, isSel ? 2 : 1); }

  /* ----- section ----- */
  /* surrounding buildings: those the cut passes through are drawn as cut profiles; those beyond it, in the viewing direction
     (north for an east–west cut, west for a north–south cut), as pale elevations behind, nearest last */
  function drawContextSection(axis, pos, len) {
    const A = app.state.aids, cx = app.context ? app.context() : null; if (!cx || A.context === false || !cx.footAll) return;
    const uOf = (q) => (axis === 'x' ? q[0] : q[1]), vOf = (q) => (axis === 'x' ? q[1] : q[0]), beyond = (v) => (axis === 'x' ? v > pos : v < pos), near = 90, cuts = [], behind = [];
    for (const f of cx.footAll) { const P = f.poly; if (!P || P.length < 3) continue; let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9; for (const q of P) { u0 = Math.min(u0, uOf(q)); u1 = Math.max(u1, uOf(q)); v0 = Math.min(v0, vOf(q)); v1 = Math.max(v1, vOf(q)); }
      if (u1 < -60 || u0 > len + 60) continue; const z0 = f.z0 || 0, z1 = f.h || 3;
      if (v0 <= pos && v1 >= pos) { const xs = []; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], va = vOf(a), vb = vOf(b); if ((va <= pos && vb > pos) || (vb <= pos && va > pos)) xs.push(uOf(a) + (pos - va) / (vb - va) * (uOf(b) - uOf(a))); } xs.sort((p, q) => p - q); for (let i = 0; i + 1 < xs.length; i += 2) cuts.push({ u0: xs[i], u1: xs[i + 1], z0, z1, h: f.h }); }
      else if (beyond((v0 + v1) / 2)) { const dist = axis === 'x' ? v0 - pos : pos - v1; if (dist < near) behind.push({ u0, u1, z0, z1, dist }); } }
    behind.sort((p, q) => q.dist - p.dist);
    for (const b of behind) { const [x0, y0] = PS(b.u0, b.z1), [x1, y1] = PS(b.u1, b.z0); ctx.fillStyle = COL.paper; ctx.fillRect(x0, y0, x1 - x0, y1 - y0); ctx.strokeStyle = alpha(COL.context_edge, 0.55 + 0.4 * (1 - b.dist / near)); ctx.lineWidth = 0.7; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0); }
    for (const c of cuts) { const [x0, y0] = PS(c.u0, c.z1), [x1, y1] = PS(c.u1, c.z0); ctx.fillStyle = alpha(COL.context_edge, 0.28); ctx.fillRect(x0, y0, x1 - x0, y1 - y0); ctx.strokeStyle = COL.context_edge; ctx.lineWidth = 1.4; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0); if (x1 - x0 > 26) text(`${c.h.toFixed(0)} m`, (x0 + x1) / 2, y0 - 4, { align: 'center', size: 9, mono: true, color: COL.muted }); }
    // streets crossed by the cut: a pale band on the ground line
    for (const st of cx.streets || []) for (let i = 0; i + 1 < st.pts.length; i++) { const a = st.pts[i], b = st.pts[i + 1], va = vOf(a), vb = vOf(b); if (!((va <= pos && vb > pos) || (vb <= pos && va > pos))) continue; const u = uOf(a) + (pos - va) / (vb - va) * (uOf(b) - uOf(a)); if (u < -60 || u > len + 60) continue; const [xa, ya] = PS(u - 9, 0), [xb] = PS(u + 9, 0); ctx.fillStyle = COL.street; ctx.fillRect(xa, ya - 3, xb - xa, 6); if (st.name && xb - xa > 30) text(st.name.replace(/^\d+(-\d+)? /, ''), (xa + xb) / 2, ya + 16, { align: 'center', size: 9, mono: true, color: COL.muted }); }
  }
  function secSetup() { const sel = app.sectionBlock(); const axis = app.state.secAxis; return { sel, axis, pos: app.state.secPos }; }
  function drawSection() {
    if (!fitted.sec) fitSec();
    const s = site(), pr = app.massProject ? app.massProject() : app.project(), { sel, axis, pos } = secSetup(), sc = cam.sec.s;
    const horizLen = axis === 'x' ? s.w : s.d; // horizontal axis of the drawing
    // ground, grid of levels
    const [gx0, gy] = PS(0, 0), [gx1] = PS(horizLen, 0);
    const ext = (app.context && app.context() ? 60 : 4) * sc + 36; ctx.fillStyle = alpha(COL.ink, 0.04); const T = Model.totals(pr); const [, yb] = PS(0, Math.min(0, T.minZ) - 2); ctx.fillRect(gx0 - ext, gy, gx1 - gx0 + 2 * ext, yb - gy);
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(gx0 - ext, gy); ctx.lineTo(gx1 + ext, gy); ctx.stroke();
    text('grade 0.0', gx1 + 44, gy + 4, { size: 10, mono: true, color: COL.muted });
    text(`Section through ${sel ? sel.name : 'the site'} at ${axis === 'x' ? 'y' : 'x'} = ${pos.toFixed(1)} m, looking ${axis === 'x' ? 'north' : 'west'}`, 16, H - 16, { size: 12, weight: 500 });
    drawContextSection(axis, pos, horizLen);
    // blocks crossing the cut
    const cut = (b) => axis === 'x' ? pos >= b.y && pos <= b.y + b.d : pos >= b.x && pos <= b.x + b.w;
    const blocks = pr.blocks.filter(cut).filter(vis).sort((a, b) => (a.use === 'core') - (b.use === 'core') || a.z0 - b.z0);
    for (const b of blocks) {
      const u0 = axis === 'x' ? b.x : b.y, len = axis === 'x' ? b.w : b.d, top = Model.blockTop(b);
      const [x0, y0] = PS(u0, top), [x1, y1] = PS(u0 + len, b.z0);
      const col = useCol(b.use); ctx.fillStyle = Model.blockTop(b) <= 0.01 ? alpha(col, 0.85) : col; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.strokeStyle = b === app.selected() ? COL.accent : col; ctx.lineWidth = b === app.selected() ? 2.5 : 1.5; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      if (b.use !== 'core') { ctx.strokeStyle = alpha(COL.ink, 0.35); ctx.lineWidth = 0.75; for (let i = 1; i < b.floors; i++) { const [, yy] = PS(0, b.z0 + i * b.f2f); ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.stroke(); } }
      if (x1 - x0 > 60) text(b.use === 'core' ? 'core' : `${b.name}  ${b.floors} × ${b.f2f} m`, (x0 + x1) / 2, Math.min(y1 - 6, y0 + 14), { align: 'center', size: 10, weight: 500, color: alpha(COL.ink, 0.9) });
      // elevation labels at the right
      text(`${top.toFixed(1)}`, x1 + 6, y0 + 4, { size: 9, mono: true, color: COL.muted }); text(`${b.z0.toFixed(1)}`, x1 + 6, y1 + 4, { size: 9, mono: true, color: COL.muted });
    }
    // ramps crossing the cut
    for (const r of pr.ramps) { const rr = Plans.rampRect(r); const hit = axis === 'x' ? pos >= rr.y && pos <= rr.y + rr.d : pos >= rr.x && pos <= rr.x + rr.w; if (!hit) continue;
      const along = axis === 'x' ? (r.dir === 'E' || r.dir === 'W') : (r.dir === 'N' || r.dir === 'S');
      if (along) { const u0 = axis === 'x' ? rr.x : rr.y, len = axis === 'x' ? rr.w : rr.d; const down = r.dir === 'E' || r.dir === 'N'; const a = PS(u0, down ? r.zTop : r.zBottom), b = PS(u0 + len, down ? r.zBottom : r.zTop); ctx.strokeStyle = COL.ramp; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); text(`ramp ${(((r.zTop - r.zBottom) / r.len) * 100).toFixed(1)}% overall`, (a[0] + b[0]) / 2, Math.min(a[1], b[1]) - 6, { align: 'center', size: 10, color: COL.ramp }); }
      else { const u0 = axis === 'x' ? rr.x : rr.y, len = axis === 'x' ? rr.w : rr.d; const t = axis === 'x' ? (pos - rr.y) / rr.d : (pos - rr.x) / rr.w; const frac = r.dir === 'N' || r.dir === 'E' ? t : 1 - t; const z = r.zTop - frac * (r.zTop - r.zBottom); const a = PS(u0, z), b = PS(u0 + len, z); ctx.strokeStyle = COL.ramp; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); } }
    // cut line mark in a mini plan (top right)
    const mw = 110, mh = mw * s.d / s.w, mx = 16, my = H - mh - 34; ctx.strokeStyle = COL.line; ctx.lineWidth = 1; ctx.fillStyle = COL.panel; ctx.fillRect(mx, my, mw, mh); ctx.strokeRect(mx, my, mw, mh);
    for (const b of pr.blocks) { ctx.fillStyle = alpha(useCol(b.use), 0.4); ctx.fillRect(mx + b.x / s.w * mw, my + (1 - (b.y + b.d) / s.d) * mh, b.w / s.w * mw, b.d / s.d * mh); }
    ctx.strokeStyle = COL.fail; ctx.lineWidth = 1.5; ctx.beginPath(); if (axis === 'x') { const yy = my + (1 - pos / s.d) * mh; ctx.moveTo(mx, yy); ctx.lineTo(mx + mw, yy); } else { const xx = mx + pos / s.w * mw; ctx.moveTo(xx, my); ctx.lineTo(xx, my + mh); } ctx.stroke();
  }

  /* ---------- hit testing & pointer editing ---------- */
  function ptIn(p, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (((yi > p[1]) !== (yj > p[1])) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c; } return c; }
  function hitPlan(sx, sy) {
    const L = app.currentLevel(); if (!L) return null; const sc = cam.plan.s, sel = app.selected();
    if ((app.state.tool === 'push' || app.state.tool === 'select') && sel && (L.blocks.includes(sel) || L.cores.includes(sel) || L.ramps.includes(sel))) { const r = selRect(sel); const [x0, y0] = P2(r.x, r.y + r.d); const w = r.w * sc, h = r.d * sc; const pts = handlePts(); for (let i = 0; i < pts.length; i++) { const hx = x0 + pts[i][0] * w, hy = y0 + pts[i][1] * h; if (Math.abs(sx - hx) <= 6 && Math.abs(sy - hy) <= 6) return { obj: sel, mode: 'resize', handle: i }; } }
    const [mx, my] = P2inv(sx, sy);
    const cand = [...L.ramps, ...L.cores.filter(vis), ...L.blocks.filter(vis).sort((a, b) => Model.area(a) - Model.area(b))];
    for (const o of cand) { const r = selRect(o); if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.d) return { obj: o, mode: 'move' }; }
    return null;
  }
  function hitAxon(sx, sy) { const pr = app.massProject ? app.massProject() : app.project(); const blocks = pr.blocks.filter(vis).sort((a, b) => (a.x + a.y + a.w + a.d) - (b.x + b.y + b.w + b.d) || b.z0 - a.z0); // nearest first
    for (const b of blocks) { const f = boxFaces(b); if (ptIn([sx, sy], f.top) || ptIn([sx, sy], f.south) || ptIn([sx, sy], f.west)) return { obj: b, mode: 'move' }; } return null; }
  function hitSec(sx, sy) { const { axis, pos } = secSetup(), pr = app.massProject ? app.massProject() : app.project(); const cut = (b) => axis === 'x' ? pos >= b.y && pos <= b.y + b.d : pos >= b.x && pos <= b.x + b.w;
    const blocks = pr.blocks.filter(cut).filter(vis).sort((a, b) => Model.area(a) - Model.area(b));
    for (const b of blocks) { const u0 = axis === 'x' ? b.x : b.y, len = axis === 'x' ? b.w : b.d; const [x0, y0] = PS(u0, Model.blockTop(b)), [x1, y1] = PS(u0 + len, b.z0); if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) return { obj: b, mode: 'movez' }; } return null; }
  const pt = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  function onDown(e) { if (e.button !== 0) return; const [sx, sy] = pt(e); const v = app.state.view; const hit = v === 'plan' ? hitPlan(sx, sy) : v === 'section' ? hitSec(sx, sy) : hitAxon(sx, sy);
    canvas.setPointerCapture(e.pointerId);
    if (!hit) { app.select(null); drag = { mode: 'pan', sx, sy, cam: JSON.parse(JSON.stringify(cam)) }; return; }
    if (hit.obj.src) { const src = app.project().blocks.find((b) => b.id === hit.obj.src); if (src) hit.obj = src; }
    app.select(hit.obj.id);
    /* Select both moves and resizes; Push/Pull only resizes; Move only moves */
    const t = app.state.tool || 'select'; if ((hit.mode === 'resize' && t === 'move') || ((hit.mode === 'move' || hit.mode === 'movez') && t === 'push')) { drag = { mode: 'pan', sx, sy, cam: JSON.parse(JSON.stringify(cam)) }; return; }
    if (hit.obj.locked) { drag = null; app.tip && app.tip(`${hit.obj.name || 'This item'} is locked. Unlock it in its properties to change it.`); return; }
    drag = { mode: hit.mode, handle: hit.handle, obj: hit.obj, orig: JSON.parse(JSON.stringify(hit.obj)), sx, sy, moved: false }; }
  function onMove(e) { const [sx, sy] = pt(e);
    if (!drag) { const v = app.state.view; const hit = v === 'plan' ? hitPlan(sx, sy) : v === 'section' ? hitSec(sx, sy) : hitAxon(sx, sy); const tt = app.state.tool || 'select'; canvas.style.cursor = hit ? (hit.obj.locked ? 'not-allowed' : tt === 'push' && hit.mode !== 'resize' ? 'pointer' : tt === 'move' && hit.mode === 'resize' ? 'move' : hit.mode === 'resize' ? ['nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize'][hit.handle] : 'move') : 'default'; return; }
    const dsx = sx - drag.sx, dsy = sy - drag.sy; if (Math.hypot(dsx, dsy) > 2) drag.moved = true;
    if (drag.mode === 'pan') { const v = app.state.view; const c = v === 'plan' ? cam.plan : v === 'section' ? cam.sec : cam.axon, o = v === 'plan' ? drag.cam.plan : v === 'section' ? drag.cam.sec : drag.cam.axon; c.cx = o.cx + dsx; c.cy = o.cy + dsy; draw(); return; }
    if (!drag.moved) return;
    const o = drag.orig, patch = {}, snap = (v) => Math.round(v * 4) / 4;
    if (app.state.view === 'plan') { const dx = dsx / cam.plan.s, dy = -dsy / cam.plan.s;
      if (drag.mode === 'move') { patch.x = snap(o.x + dx); patch.y = snap(o.y + dy); }
      else { const r = selRect(o); const [fx, fy] = handlePts()[drag.handle]; let x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.d; // handle fy=0 is the north (top) edge on screen
        if (fx === 0) x0 = snap(r.x + dx); if (fx === 1) x1 = snap(r.x + r.w + dx); if (fy === 0) y1 = snap(r.y + r.d + dy); if (fy === 1) y0 = snap(r.y + dy);
        if (x1 - x0 < 2) { if (fx === 0) x0 = x1 - 2; else x1 = x0 + 2; } if (y1 - y0 < 2) { if (fy === 1) y0 = y1 - 2; else y1 = y0 + 2; }
        if (o.len != null) { patch.x = x0; patch.y = y0; if (o.dir === 'N' || o.dir === 'S') { patch.w = x1 - x0; patch.len = y1 - y0; } else { patch.len = x1 - x0; patch.w = y1 - y0; } }
        else { patch.x = x0; patch.y = y0; patch.w = x1 - x0; patch.d = y1 - y0; } } }
    else if (app.state.view === 'section') { const { axis } = secSetup(); const du = dsx / cam.sec.s; if (axis === 'x') patch.x = snap(o.x + du); else patch.y = snap(o.y + du); /* the floor level changes only through the side panel */ }
    else { const [dx, dy] = groundDelta(dsx, dsy); patch.x = snap(o.x + dx); patch.y = snap(o.y + dy); }
    // keep inside the site
    const s = site(); const r = Object.assign({}, selRect(Object.assign({}, o, patch)));
    if (patch.x != null) patch.x = Math.min(Math.max(0, patch.x), Math.max(0, s.w - r.w)); if (patch.y != null) patch.y = Math.min(Math.max(0, patch.y), Math.max(0, s.d - r.d));
    app.edit(drag.obj.id, patch, false); }
  function onUp(e) { if (!drag) return; const d = drag; drag = null; if (d.mode === 'pan') return; if (d.moved) app.edit(d.obj.id, {}, true); }
  function cancelDrag() { if (!drag || drag.mode === 'pan') { drag = null; return; } const d = drag; drag = null; app.edit(d.obj.id, d.orig, false); app.edit(d.obj.id, {}, true); }
  function onWheel(e) { e.preventDefault(); const [sx, sy] = pt(e); const f = Math.exp(-e.deltaY * 0.0012); const v = app.state.view; const c = v === 'plan' ? cam.plan : v === 'section' ? cam.sec : cam.axon; c.cx = sx + (c.cx - sx) * f; c.cy = sy + (c.cy - sy) * f; c.s *= f; draw(); }
  function onDbl() { fitted = { plan: false, axon: false, sec: false }; draw(); }
  function refit() { fitted = { plan: false, axon: false, sec: false }; }

  return { init, draw, refit, cancelDrag, useCol, COL, readTokens };
})();
