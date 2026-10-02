/* map.js — 2D canvas map of Downtown and the West End from the City open data (window.CITY): parcels tinted by zoning family,
   streets, lanes, parks, DD boundary. Hover for address · zone · ODP area, click to pick a parcel, drag to pan, wheel to zoom. */
window.SiteMap = (function () {
  let cv, ctx, W = 0, H = 0, dpr = 1, cam = { s: 0.35, cx: 0, cy: 0 }, picked = -1, hover = -1, onPick = null, tip = null, showZones = true;
  const D = () => window.CITY;
  const famCol = (z) => !z ? '#eef0f1' : /^DD$/.test(z) ? '#d4e6ed' : /^CD-1/.test(z) ? '#e5dcf0' : /^RM/.test(z) ? '#f3d1cc' : /^C-5|^C-6/.test(z) ? '#f6efd4' : /^HA/.test(z) ? '#f4ddc5' : /^FCCDD|^BCPED|^CWD|^DEOD/.test(z) ? '#d5e8d9' : '#e7e9ea';
  const centroid = (r) => { let x = 0, y = 0; for (const p of r) { x += p[0]; y += p[1]; } return [x / r.length, y / r.length]; };
  let zoneOf = null; // parcel index -> zone code (lazy)
  function zonesIndex() { if (zoneOf) return zoneOf; const P = D().parcels; zoneOf = new Array(P.length); for (let i = 0; i < P.length; i++) zoneOf[i] = Site.zoneAt(centroid(P[i].p)); return zoneOf; }
  const toS = (p) => [cam.cx + p[0] * cam.s, cam.cy - p[1] * cam.s];
  const toM = (sx, sy) => [(sx - cam.cx) / cam.s, -(sy - cam.cy) / cam.s];

  function mount(canvas, opts) {
    cv = canvas; ctx = cv.getContext('2d'); onPick = opts.onPick; tip = opts.tooltip;
    new ResizeObserver(resize).observe(cv.parentElement); resize();
    let drag = null;
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); const r = cv.getBoundingClientRect(); drag = { sx: e.clientX - r.left, sy: e.clientY - r.top, cx: cam.cx, cy: cam.cy, moved: false }; });
    cv.addEventListener('pointermove', (e) => { const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
      if (drag) { const dx = sx - drag.sx, dy = sy - drag.sy; if (Math.hypot(dx, dy) > 3) drag.moved = true; if (drag.moved) { cam.cx = drag.cx + dx; cam.cy = drag.cy + dy; draw(); } return; }
      const i = Site.parcelAt(toM(sx, sy)); if (i !== hover) { hover = i; draw(); }
      if (tip) { if (i >= 0) { const P = D().parcels[i]; const c = centroid(P.p); tip.hidden = false; tip.style.left = sx + 12 + 'px'; tip.style.top = sy + 12 + 'px'; tip.textContent = `${P.a || 'parcel'} · ${zonesIndex()[i] || '—'}${P.sub || Site.subareaAt(c) ? ' · ODP ' + (P.sub || Site.subareaAt(c)) : ''}`; } else tip.hidden = true; } });
    cv.addEventListener('pointerup', (e) => { if (!drag) return; const d = drag; drag = null; if (d.moved) return; const r = cv.getBoundingClientRect(); const i = Site.parcelAt(toM(e.clientX - r.left, e.clientY - r.top)); if (i >= 0 && onPick) onPick(i); });
    cv.addEventListener('pointerleave', () => { hover = -1; if (tip) tip.hidden = true; draw(); });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top; const f = Math.exp(-e.deltaY * 0.0015); cam.cx = sx + (cam.cx - sx) * f; cam.cy = sy + (cam.cy - sy) * f; cam.s = Math.min(8, Math.max(0.05, cam.s * f)); draw(); }, { passive: false });
    cv.addEventListener('dblclick', () => fitAll());
    fitAll();
  }
  function resize() { const r = cv.parentElement.getBoundingClientRect(); dpr = window.devicePixelRatio || 1; W = Math.max(50, r.width); H = Math.max(50, r.height >= 120 ? r.height : Math.min(r.width * 0.75, 320)); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px'; draw(); }
  function fitAll() { if (!D()) return; const ring = D().dd.flat(); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of ring) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); } const s = Math.min(W / (x1 - x0 + 200), H / (y1 - y0 + 200)); cam = { s, cx: W / 2 - (x0 + x1) / 2 * s, cy: H / 2 + (y0 + y1) / 2 * s }; draw(); }
  function focus(i, scale = 1.2) { const P = D().parcels[i]; if (!P) return; const c = centroid(P.p); cam.s = scale; cam.cx = W / 2 - c[0] * cam.s; cam.cy = H / 2 + c[1] * cam.s; picked = i; draw(); }
  function setPicked(i) { picked = i; draw(); }
  function poly(ring, fill, stroke, lw = 0.5) { ctx.beginPath(); ring.forEach((p, k) => { const [x, y] = toS(p); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); } }
  function draw() {
    if (!ctx || !D()) return; const d = D(), cs = getComputedStyle(document.documentElement), ink = cs.getPropertyValue('--ink').trim() || '#222', panel = cs.getPropertyValue('--panel2').trim() || '#eee', accent = cs.getPropertyValue('--accent').trim() || '#1f5f7a', dark = matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.dataset.theme !== 'light' || document.documentElement.dataset.theme === 'dark';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = panel; ctx.fillRect(0, 0, W, H);
    const vis = (ring) => ring.some((p) => { const [x, y] = toS(p); return x > -50 && x < W + 50 && y > -50 && y < H + 50; });
    const zi = zonesIndex();
    for (const p of d.parks) if (vis(p.p)) poly(p.p, dark ? 'rgba(80,140,100,0.45)' : 'rgba(150,200,160,0.4)', null);
    for (let i = 0; i < d.parcels.length; i++) { const P = d.parcels[i]; if (!vis(P.p)) continue; const col = famCol(zi[i]); poly(P.p, dark ? shade(col, 0.45) : col, i === picked ? accent : i === hover ? ink : 'rgba(110,130,150,0.35)', i === picked ? 2.5 : i === hover ? 1.5 : 0.5); }
    if (picked >= 0 && d.parcels[picked]) { ctx.save(); ctx.globalAlpha = 0.3; poly(d.parcels[picked].p, accent, null, 0); ctx.restore(); poly(d.parcels[picked].p, null, accent, 3); }
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.9)'; ctx.lineWidth = Math.max(1, 14 * cam.s); for (const s of d.streets) { if (!vis(s.p)) continue; ctx.beginPath(); s.p.forEach((p, k) => { const [x, y] = toS(p); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); }
    for (const ring of d.dd) { ctx.setLineDash([6, 4]); poly(ring, null, dark ? '#8b9aa8' : '#7f93a5', 1.3); ctx.setLineDash([]); }
    if (showZones && cam.s > 1.1) { ctx.font = '10px Inter, sans-serif'; ctx.fillStyle = ink; ctx.textAlign = 'center'; const seen = new Set(); for (let i = 0; i < d.parcels.length; i++) { const P = d.parcels[i]; if (!vis(P.p) || !P.a) continue; const [x, y] = toS(centroid(P.p)); const key = `${Math.round(x / 70)},${Math.round(y / 24)}`; if (seen.has(key)) continue; seen.add(key); ctx.fillText(cam.s > 1.6 ? P.a : (zi[i] || ''), x, y + 3); } }
    if (cam.s > 0.5) { ctx.font = '500 10px Inter, sans-serif'; ctx.fillStyle = dark ? '#cfcdc7' : '#4a4a46'; for (const n of d.notable) { const f = d.foot[n.f[0]]; if (!f || !vis(f.p)) continue; const [x, y] = toS(centroid(f.p)); ctx.fillText(n.n, x, y - 6); } }
    ctx.font = '600 10px Inter, sans-serif'; ctx.fillStyle = ink; ctx.textAlign = 'left'; ctx.fillText('N ↑', 8, 14);
  }
  function shade(hex, k) { const n = hex.replace('#', ''); const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16); return `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`; }
  return { mount, focus, setPicked, fitAll, draw, toggleZones: () => { showZones = !showZones; draw(); } };
})();
