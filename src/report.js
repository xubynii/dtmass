/* report.js — the analytical illustrated report. Every figure is drawn as SVG from the live project geometry and every sentence is
   built from the model, the rule rows (Rules.evaluate, unchanged) and the density breakdown (Rules.density). Recommended massing
   moves are re-run through the same engine on a copy of the project before they are called "tested"; everything else is labelled
   an untested suggestion. The report is a snapshot: it records the project signature it was built from and shows itself as
   outdated when the model changes, with an Update report action.
   API: Report.mount(panelEl, App) · Report.show() · Report.build() → full HTML document · Report.save() · Report.status() */
window.Report = (function () {
  'use strict';
  let app = null, panel = null, built = null, pick = { a: '', b: '' };
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '—' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v, d = 1) => (v == null || !isFinite(v) ? '—' : Number(v).toLocaleString('en-CA', { maximumFractionDigits: d, minimumFractionDigits: d }));
  const m2 = (v) => `${fmt(v, 0)} m²`;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + 's'}`;
  const n1 = (v) => Math.round(v * 10) / 10;

  /* ---------- drawing palette (the report is a printed sheet: one light palette) ---------- */
  const USE_HEX = { residential: '#F3D1CC', hotel: '#F6E3C9', office: '#D4E6ED', retail: '#E5DCF0', restaurant: '#F4DDC5', amenity: '#D5E8D9', parking: '#E1E6E9', core: '#E7E2DB' };
  const USE_LINE = { residential: '#D39A92', hotel: '#D9B27A', office: '#86AFC0', retail: '#A693C4', restaurant: '#CF9F6F', amenity: '#86B893', parking: '#9EABB4', core: '#B1A594' };
  const USE_LABEL = { residential: 'Residential', hotel: 'Hotel', office: 'Office', retail: 'Retail', restaurant: 'Restaurant', amenity: 'Amenity', parking: 'Parking', core: 'Core and circulation' };
  const INK = '#262626', RED = '#CF4F58', REDS = '#E78389', MUTED = '#6E6D68', CTX = '#FFFFFF', CTXE = '#A9B9C6', PAPER = '#FFFFFF', GROUND = '#F6F5F0';
  const PAT = { hotel: 1, office: 1, retail: 1, restaurant: 1, amenity: 1, parking: 1, core: 1 };
  function mix(a, b, t) { const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const A = p(a), B = p(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); }
  const DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
    <pattern id="p-office" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M0 2.5h5" stroke="${INK}" stroke-opacity=".14" stroke-width=".5"/></pattern>
    <pattern id="p-retail" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r=".75" fill="${INK}" fill-opacity=".26"/></pattern>
    <pattern id="p-restaurant" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 0l6 6M6 0L0 6" stroke="${INK}" stroke-opacity=".17" stroke-width=".5"/></pattern>
    <pattern id="p-amenity" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 2.5h5" stroke="${INK}" stroke-opacity=".2" stroke-width=".55"/></pattern>
    <pattern id="p-parking" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 .3h6M.3 0v6" stroke="${INK}" stroke-opacity=".2" stroke-width=".5"/></pattern>
    <pattern id="p-core" width="3.2" height="3.2" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><path d="M0 1.6h3.2" stroke="${INK}" stroke-opacity=".32" stroke-width=".55"/></pattern>
    <pattern id="p-red" width="4.5" height="4.5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 2.25h4.5" stroke="${RED}" stroke-opacity=".75" stroke-width=".8"/></pattern>
    <marker id="ar" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1L10 5L0 9z" fill="${RED}"/></marker>
    <marker id="ak" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 1L10 5L0 9z" fill="${INK}"/></marker>
    <marker id="tk" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M2 8L8 2" stroke="${INK}" stroke-width="1.2"/></marker>
  </defs></svg>`;
  const pathOf = (pts, close = true) => 'M' + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L') + (close ? 'Z' : '');
  const line = (a, b, attr) => `<path d="M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}" ${attr}/>`;
  const txt = (x, y, s, attr = '') => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" ${attr}>${esc(s)}</text>`;
  const MONO = `font-family="'IBM Plex Mono',ui-monospace,monospace"`, SANS = `font-family="Inter,system-ui,sans-serif"`;
  const usePaint = (use, d, fill, extra = '') => `<path d="${d}" fill="${fill}" ${extra}/>` + (PAT[use] ? `<path d="${d}" fill="url(#p-${use})"/>` : '');

  /* ---------- axonometric projection: viewer to the south-south-west, looking north-north-east ---------- */
  function proj(az = 30, el = 32) {
    const a = az * Math.PI / 180, e = el * Math.PI / 180, R = [Math.cos(a), -Math.sin(a)], F = [Math.sin(a), Math.cos(a)], ce = Math.cos(e), se = Math.sin(e);
    return { raw: (x, y, z) => [x * R[0] + y * R[1], -(z * ce + (x * F[0] + y * F[1]) * se)], V: [F[0] * ce, F[1] * ce, -se], depth: (x, y) => x * F[0] + y * F[1] };
  }
  function rawBounds(pr, pts) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of pts) { const r = pr.raw(p[0], p[1], p[2]); x0 = Math.min(x0, r[0]); x1 = Math.max(x1, r[0]); y0 = Math.min(y0, r[1]); y1 = Math.max(y1, r[1]); } return { x0, y0, x1, y1 }; }
  function fitTo(pr, rb, box, pad = 16) { const bw = Math.max(1, rb.x1 - rb.x0), bh = Math.max(1, rb.y1 - rb.y0), k = Math.min((box.w - 2 * pad) / bw, (box.h - 2 * pad) / bh); const ox = box.x + (box.w - bw * k) / 2 - rb.x0 * k, oy = box.y + (box.h - bh * k) / 2 - rb.y0 * k; return { k, P: (x, y, z) => { const r = pr.raw(x, y, z); return [ox + r[0] * k, oy + r[1] * k]; } }; }
  function hull(pts) { const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); const lo = [], up = []; for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); } for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); } up.pop(); lo.pop(); return lo.concat(up); }
  const hOf = (b) => (b.use === 'core' ? b.f2f : b.floors * b.f2f);
  function boxesOf(blocks, dzOf, project) { return blocks.filter((b) => !b.hidden).map((b) => { const dz = dzOf ? dzOf(b) : 0; if (window.Form && Form.active(b)) { const pj = project || { blocks }, bb = Form.bounds(b, pj), sub = Form.boxes(b, pj) || []; return { b, use: b.use, x0: bb.x0, x1: bb.x1, y0: bb.y0, y1: bb.y1, z0: b.z0 + dz, z1: b.z0 + hOf(b) + dz, below: false, sub, dz }; } return { b, use: b.use, x0: b.x, x1: b.x + b.w, y0: b.y, y1: b.y + b.d, z0: b.z0 + dz, z1: b.z0 + hOf(b) + dz, below: !b.solid && b.z0 + hOf(b) <= 0.01 }; }); }
  const corners = (q) => [[q.x0, q.y0, q.z0], [q.x1, q.y0, q.z0], [q.x1, q.y1, q.z0], [q.x0, q.y1, q.z0], [q.x0, q.y0, q.z1], [q.x1, q.y0, q.z1], [q.x1, q.y1, q.z1], [q.x0, q.y1, q.z1]];
  /* painter's order for axis-aligned boxes viewed with V = (+, +, −): farther boxes first */
  function order(boxes, pr) {
    const e = 1e-6, farther = (A, B) => { if (A.z1 <= B.z0 + e) return true; if (B.z1 <= A.z0 + e) return false; if (A.x0 >= B.x1 - e) return true; if (B.x0 >= A.x1 - e) return false; if (A.y0 >= B.y1 - e) return true; if (B.y0 >= A.y1 - e) return false; return pr.depth((A.x0 + A.x1) / 2, (A.y0 + A.y1) / 2) - (A.z0 + A.z1) * 0.01 > pr.depth((B.x0 + B.x1) / 2, (B.y0 + B.y1) / 2) - (B.z0 + B.z1) * 0.01; };
    const n = boxes.length, before = boxes.map(() => []), indeg = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { if (farther(boxes[i], boxes[j])) { before[i].push(j); indeg[j]++; } else { before[j].push(i); indeg[i]++; } }
    const out = [], done = new Array(n).fill(false);
    while (out.length < n) { let k = -1; for (let i = 0; i < n; i++) if (!done[i] && indeg[i] === 0) { k = i; break; } if (k < 0) { let best = Infinity; for (let i = 0; i < n; i++) if (!done[i] && indeg[i] < best) { best = indeg[i]; k = i; } } done[k] = true; out.push(boxes[k]); for (const j of before[k]) indeg[j]--; }
    return out;
  }
  /* a sculpted block: each storey plate as a rotated prism, bottom to top */
  function drawSculpt(q, P, pr, o) { const col = USE_HEX[q.use] || '#ddd', ln = USE_LINE[q.use] || CTXE, edge = `stroke="${o.outline || ln}" stroke-width="${o.outline ? 0.9 : 0.6}" stroke-linejoin="round"`; let s = '';
    const subs = q.sub.slice().sort((a, b) => a.z0 - b.z0 || pr.depth(b.x, b.y) - pr.depth(a.x, a.y));
    for (const r of subs) { const c = Math.cos(r.rot), sn = Math.sin(r.rot), hw = r.w / 2, hd = r.d / 2, ring = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, ly]) => [r.x + lx * c - ly * sn, r.y + lx * sn + ly * c]), z0 = r.z0 + q.dz, z1 = r.z1 + q.dz;
      for (let i = 0; i < 4; i++) { const a = ring[i], b = ring[(i + 1) % 4], n = [b[1] - a[1], -(b[0] - a[0])]; if (n[0] * pr.V[0] + n[1] * pr.V[1] >= 0) continue; const shade = Math.abs(n[0]) > Math.abs(n[1]) ? mix(col, ln, 0.16) : col; s += `<path d="${pathOf([P(a[0], a[1], z0), P(b[0], b[1], z0), P(b[0], b[1], z1), P(a[0], a[1], z1)])}" fill="${shade}" ${edge}/>`; }
      s += `<path d="${pathOf(ring.map((p) => P(p[0], p[1], z1)))}" fill="${mix(col, '#ffffff', 0.45)}" ${edge}/>`; }
    return s; }
  function drawBox(q, P, o = {}) {
    if (q.sub) return drawSculpt(q, P, o.pr || proj(), o);
    const col = USE_HEX[q.use] || '#ddd', { x0, x1, y0, y1, z0, z1 } = q;
    if (q.below) { const c = corners(q).map((p) => P(...p)), E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]; return E.map(([a, b]) => line(c[a], c[b], `stroke="${CTXE}" stroke-width=".6" stroke-dasharray="3 2" fill="none"`)).join(''); }
    const top = [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], south = [P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1)], west = [P(x0, y0, z0), P(x0, y1, z0), P(x0, y1, z1), P(x0, y0, z1)], ln = USE_LINE[q.use] || CTXE;
    const edge = `stroke="${ln}" stroke-width=".6" stroke-linejoin="round"`;
    let s = `<path d="${pathOf(west)}" fill="${mix(col, ln, 0.16)}" ${edge}/><path d="${pathOf(south)}" fill="${col}" ${edge}/><path d="${pathOf(top)}" fill="${mix(col, '#ffffff', 0.45)}" ${edge}/>`;
    if (o.floorLines !== false && q.use !== 'core' && q.b.floors > 1) { let fl = ''; for (let i = 1; i < q.b.floors; i++) { const z = z0 + i * q.b.f2f; fl += `M${P(x0, y0, z).map((v) => v.toFixed(1)).join(' ')}L${P(x1, y0, z).map((v) => v.toFixed(1)).join(' ')}M${P(x0, y0, z).map((v) => v.toFixed(1)).join(' ')}L${P(x0, y1, z).map((v) => v.toFixed(1)).join(' ')}`; } s += `<path d="${fl}" stroke="${ln}" stroke-opacity=".4" stroke-width=".4" fill="none"/>`; }
    const sil = hull(corners(q).map((p) => P(...p)));
    s += `<path d="${pathOf(sil)}" fill="none" stroke="${o.outline || ln}" stroke-width="${o.outline ? 1.9 : 1.1}" stroke-linejoin="round"/>`;
    return s;
  }
  function drawPrism(f, P, pr) {
    let ring = f.poly.slice(); if (ring.length > 3 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) ring.pop(); if (ring.length < 3) return '';
    let A = 0; for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; A += a[0] * b[1] - b[0] * a[1]; } if (A < 0) ring.reverse();
    const z0 = f.z0 || 0, z1 = Math.max(z0 + 0.5, f.h || 3); let s = '';
    for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length], n = [b[1] - a[1], -(b[0] - a[0])]; if (n[0] * pr.V[0] + n[1] * pr.V[1] >= 0) continue; s += `<path d="${pathOf([P(a[0], a[1], z0), P(b[0], b[1], z0), P(b[0], b[1], z1), P(a[0], a[1], z1)])}" fill="${mix(CTX, CTXE, 0.07)}" stroke="${CTXE}" stroke-width=".5"/>`; }
    return s + `<path d="${pathOf(ring.map((p) => P(p[0], p[1], z1)))}" fill="${CTX}" stroke="${CTXE}" stroke-width=".45"/>`;
  }
  const sitePoly = (s) => (s.poly && s.poly.length > 2 ? s.poly : [[0, 0], [s.w, 0], [s.w, s.d], [0, s.d]]);
  /* the main axonometric: context (pale), site, hidden below-grade volumes, proposal, overlays */
  function axo(project, o = {}) {
    const pr = o.pr || proj(), s = project.site, box = o.box, boxes = boxesOf(o.noCores ? project.blocks.filter((b) => b.use !== 'core') : project.blocks, o.dzOf, project);
    const pts = boxes.flatMap(corners).concat(sitePoly(s).map((p) => [p[0], p[1], 0])); if (o.extraPts) pts.push(...o.extraPts);
    const fit = o.fit || fitTo(pr, o.rb || rawBounds(pr, pts), box, o.pad == null ? 18 : o.pad), P = fit.P, id = 'c' + Math.random().toString(36).slice(2, 8);
    let g = `<clipPath id="${id}"><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}"/></clipPath><g clip-path="url(#${id})">`;
    g += `<path d="${pathOf(sitePoly(s).map((p) => P(p[0], p[1], 0)))}" fill="${PAPER}" stroke="${REDS}" stroke-width="1" stroke-dasharray="10 3 2 3"/>`;
    if (o.ctx && o.ctx.length) { const cx = s.w / 2, cy = s.d / 2, R = o.ctxR || 80; const near = o.ctx.filter((f) => { if (!f.poly || f.poly.length < 3) return false; const c = f.poly.reduce((a, p) => [a[0] + p[0] / f.poly.length, a[1] + p[1] / f.poly.length], [0, 0]); f._c = c; return Math.hypot(c[0] - cx, c[1] - cy) < R; }).sort((a, b) => pr.depth(b._c[0], b._c[1]) - pr.depth(a._c[0], a._c[1])); for (const f of near) g += drawPrism(f, P, pr); }
    if (o.streets !== false && s.edges) for (const e of s.edges) { if (!e.name || e.kind === 'lane') continue; const m = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2], nx = e.b[1] - e.a[1], ny = -(e.b[0] - e.a[0]), L = Math.hypot(nx, ny) || 1, q = P(m[0] + nx / L * 9, m[1] + ny / L * 9, 0); if (pr.depth(nx, ny) > 0) continue; g += txt(q[0], q[1], e.name.replace(/^\d+(-\d+)? /, '').toUpperCase(), `${MONO} font-size="11.9" fill="${MUTED}" text-anchor="middle" letter-spacing=".08em"`); }
    const below = boxes.filter((q) => q.below), above = order(boxes.filter((q) => !q.below), pr);
    for (const q of below) g += drawBox(q, P);
    for (const q of above) { g += drawBox(q, P, { outline: o.outlineIds && o.outlineIds.has(q.b.id) ? RED : null, floorLines: o.floorLines, pr }); if (o.after) g += o.after(q, P) || ''; }
    if (o.overlay) g += o.overlay(P, fit);
    g += '</g>';
    if (o.north !== false) { const N = s.north || [0, 1], base = [box.x + 26, box.y + box.h - 26], a = pr.raw(0, 0, 0), b = pr.raw(N[0], N[1], 0), dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; g += line(base, [base[0] + dx / L * 18, base[1] + dy / L * 18], `stroke="${INK}" stroke-width=".9" marker-end="url(#ak)"`) + txt(base[0] + dx / L * 28, base[1] + dy / L * 28 + 3, 'N', `${MONO} font-size="12.6" text-anchor="middle" fill="${INK}"`); }
    return { svg: g, P, fit, pr };
  }
  /* numbered markers in the drawing with leaders to a label gutter; labels keep the anchors' vertical order so leaders never cross */
  function callouts(items, gx, y0, y1, labelW = 230) {
    if (!items.length) return '';
    const sorted = items.slice().sort((a, b) => a.p[1] - b.p[1]), gap = 62; let ys = sorted.map((it) => Math.min(Math.max(it.p[1], y0 + 12), y1 - 12));
    for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + gap); const over = ys[ys.length - 1] - (y1 - 12); if (over > 0) { ys = ys.map((y) => y - over); for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] - gap); }
    let s = '';
    sorted.forEach((it, i) => { const y = ys[i], ex = gx - 18; s += `<path d="M${it.p[0].toFixed(1)} ${it.p[1].toFixed(1)}L${ex.toFixed(1)} ${y.toFixed(1)}L${(gx - 4).toFixed(1)} ${y.toFixed(1)}" fill="none" stroke="${RED}" stroke-width=".7"/>`; });
    sorted.forEach((it, i) => { const y = ys[i]; s += `<circle cx="${it.p[0].toFixed(1)}" cy="${it.p[1].toFixed(1)}" r="11" fill="${RED}" stroke="${PAPER}" stroke-width="1.2"/>` + txt(it.p[0], it.p[1] + 4.6, it.n, `${MONO} font-size="13.3" font-weight="600" fill="#fff" text-anchor="middle"`);
      s += `<circle cx="${gx + 11}" cy="${y}" r="10.5" fill="none" stroke="${RED}" stroke-width=".9"/>` + txt(gx + 11, y + 4.6, it.n, `${MONO} font-size="13.3" font-weight="600" fill="${RED}" text-anchor="middle"`);
      const words = String(it.label).split(' '), lines = []; let cur = ''; for (const w of words) { if ((cur + ' ' + w).trim().length > Math.floor(labelW / 8.6)) { lines.push(cur.trim()); cur = w; } else cur += ' ' + w; } if (cur.trim()) lines.push(cur.trim());
      lines.slice(0, 3).forEach((l, k) => { s += txt(gx + 30, y + 5 + (k - (Math.min(lines.length, 3) - 1) / 2) * 18, l, `${SANS} font-size="16.1" fill="${INK}"${k === 0 ? ' font-weight="600"' : ''}`); });
      if (it.sub) s += txt(gx + 30, y + 5 + (Math.min(lines.length, 3) / 2 + 0.55) * 18, it.sub, `${MONO} font-size="13.3" fill="${MUTED}"`); });
    return s;
  }
  function scaleBar(x, y, k, label = 'm') { const steps = [5, 10, 20, 50], len = steps.find((v) => v * k >= 60) || 50; let s = ''; for (let i = 0; i < 2; i++) s += `<rect x="${(x + i * len * k / 2).toFixed(1)}" y="${y}" width="${(len * k / 2).toFixed(1)}" height="3" fill="${i ? PAPER : INK}" stroke="${INK}" stroke-width=".6"/>`; return s + txt(x, y + 14, '0', `${MONO} font-size="11.9" fill="${INK}"`) + txt(x + len * k, y + 14, `${len} ${label}`, `${MONO} font-size="11.9" fill="${INK}" text-anchor="middle"`); }
  const svgWrap = (w, h, body, title) => `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="${esc(title)}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

  /* ---------- analysis ---------- */
  function call(k, fb, ...a) { return app && typeof app[k] === 'function' ? app[k](...a) : fb; }
  function analyse() {
    const p = call('project', null), mp = call('massProject', p), raw = call('rawRows', call('rows', [])), T = Model.totals(mp), dn = Rules.density(mp, T), s = p.site;
    const D = CODES.odp.density[s.densityArea] || {}, env = call('envelope', { basic: null, max: null }), prov = (k) => call('prov', 'assumption', k);
    const eff = (r) => Checks.effective(r, p), byId = (id) => raw.find((r) => r.id === id);
    const massing = p.blocks.filter((b) => !b.hidden && b.use !== 'core' && Model.blockTop(b) > 0.01);
    const towers = massing.filter((b) => Model.blockTop(b) > 18 && (b.use === 'residential' || b.use === 'office')).sort((a, b) => Model.blockTop(b) - Model.blockTop(a));
    const tallest = massing.slice().sort((a, b) => Model.blockTop(b) - Model.blockTop(a))[0] || null, tower = towers[0] || tallest;
    const cap = env.max || env.basic || null, top = T.maxZ, f2f = tower ? tower.f2f : 3;
    const maxFA = D.fsr != null ? D.fsr * dn.siteArea : null, excess = maxFA != null ? dn.fsrFA - maxFA : null, tfl = tower && window.Form && Form.active(tower) ? Form.floors(tower, p) : null, per = tfl && tfl.length ? tfl.reduce((a, f) => a + f.area, 0) / tfl.length : tower ? tower.w * tower.d : T.footprint || 1;
    const levels = call('levels', Model.levels(p)), plans = call('plans', {}), st = window.Iterate ? Iterate.status() : { state: 'never' };
    const below = p.blocks.filter((b) => !b.hidden && b.use !== 'core' && Model.blockTop(b) <= 0.01);
    return { p, mp, raw, T, dn, s, D, env, prov, eff, byId, massing, towers, tower, tallest, cap, top, f2f, maxFA, excess, per, levels, plans, st, below, stalls: (() => { const r = byId('pk-count'); return r ? parseInt(r.value) || 0 : 0; })(), homes: (() => { const r = byId('ly-mix'); return r ? parseInt(r.value) || 0 : 0; })() };
  }
  const useful = (t) => !!t && !/(^|\s)0 m²/.test(t);
  const STATUS = { fail: ['✕', 'Issue'], review: ['!', 'Needs review'], verify: ['?', 'Needs verification'], pass: ['✓', 'Within limit'], info: ['i', 'Note'] };
  const stTag = (k) => `<span class="st st-${k}"><b>${STATUS[k][0]}</b>${STATUS[k][1]}</span>`;
  const anchorSouth = (b, fx, fz) => [b.x + b.w * fx, b.y, b.z0 + hOf(b) * fz];
  const anchorWest = (b, fy, fz) => [b.x, b.y + b.d * fy, b.z0 + hOf(b) * fz];

  function findings(A) {
    const out = [], { p, dn, D, s, tower, top, cap, env, f2f, per, excess, maxFA, prov, byId, eff, raw, levels } = A;
    const remH = cap != null ? cap - top : null, hVerify = prov('heightArea') === 'verify' || (s.viewCones && s.viewCones.length && s.viewConeH == null);
    const dVerify = prov('densityArea') === 'verify';
    if (D.fsr != null) {
      if (excess > 0.5) { const n = Math.ceil(excess / per);
        out.push({ key: 'fsr', status: 'fail', title: 'Density is over the permitted FSR', short: `FSR ${fmt(dn.fsr, 2)} against ${fmt(D.fsr, 2)}`,
          observation: `The scheme counts ${m2(dn.fsrFA)} of floor area toward FSR, against ${m2(maxFA)} allowed on this ${m2(dn.siteArea)} lot.`,
          evidence: `FSR ${fmt(dn.fsr, 2)} against a maximum of ${fmt(D.fsr, 2)} for density area ${s.densityArea} (Downtown ODP §3(1)). The excess is ${m2(excess)}${tower ? `, or about ${plural(n, 'storey')} of the ${m2(per)} ${tower.name.toLowerCase()} plate` : ''}.`,
          implication: `Floor area has to come out before the form is refined.${remH != null && remH > 0 ? ` The ${fmt(remH, 1)} m still available under the height limit cannot be used for more floor area while density is exceeded.` : ''}${dVerify ? ' The density area itself still needs verification on ODP Map 1.' : ''}`,
          anchor: tower ? anchorWest(tower, 0.5, 0.55) : null });
      } else { const room = -excess, nD = Math.floor(room / per), nH = remH != null ? Math.floor(remH / f2f) : null;
        out.push({ key: 'fsr', status: dVerify ? 'verify' : 'pass', title: 'Density is within the permitted FSR', short: `FSR ${fmt(dn.fsr, 2)} of ${fmt(D.fsr, 2)}`,
          observation: `The scheme counts ${m2(dn.fsrFA)} toward FSR, leaving ${m2(room)} of the ${m2(maxFA)} allowed.`,
          evidence: `FSR ${fmt(dn.fsr, 2)} against ${fmt(D.fsr, 2)} (density area ${s.densityArea}, ODP §3(1)). The remainder equals about ${plural(nD, 'storey')} of the ${m2(per)} plate.`,
          implication: nH != null ? `Height allows about ${plural(Math.max(0, nH), 'more storey', 'more storeys')} and density about ${nD}; the lower figure governs any addition.${dVerify ? ' Confirm the density area before relying on this margin.' : ''}` : 'Density leaves room for more floor area if other limits allow it.',
          anchor: tower ? anchorWest(tower, 0.5, 0.55) : null });
      }
    }
    if (tower) { const hr = byId('height'), basic = env.basic, max = env.max;
      if (cap != null && top > cap + 1e-6) { const n = Math.ceil((top - cap) / f2f); out.push({ key: 'height', status: 'fail', title: 'Height exceeds the maximum', short: `${fmt(top, 1)} m against ${fmt(cap, 1)} m`, observation: `${A.tallest.name} reaches ${fmt(top, 1)} m, ${fmt(top - cap, 1)} m above the ${fmt(cap, 1)} m limit.`, evidence: `Basic height ${fmt(basic, 1)} m${max ? `, Board maximum ${fmt(max, 1)} m` : ''} for height area ${s.heightArea} (ODP §4 Table 1). The excess is about ${plural(n, 'storey')} at ${fmt(f2f, 1)} m floor to floor.`, implication: `${hr && hr.fix ? hr.fix : 'Lower the top of the tower.'}${hVerify ? ' The height limit itself still needs verification.' : ''}`, anchor: [A.tallest.x + A.tallest.w * 0.5, A.tallest.y + A.tallest.d * 0.5, top] }); }
      else if (cap != null) { const over = max && top > basic + 1e-6; out.push({ key: 'height', status: hVerify ? 'verify' : over ? 'review' : 'pass', title: over ? 'Height is above the basic limit, within Board discretion' : 'Height is within the limit', short: `${fmt(top, 1)} m of ${fmt(cap, 1)} m`, observation: `The tallest block, ${A.tallest.name}, tops out at ${fmt(top, 1)} m, ${fmt(cap - top, 1)} m below the ${fmt(cap, 1)} m ${max ? 'Board maximum' : 'limit'}.`, evidence: `Basic height ${fmt(basic, 1)} m${max ? `, Board may allow ${fmt(max, 1)} m` : ''} (height area ${s.heightArea}, ODP §4 Table 1). That margin is about ${plural(Math.floor((cap - top) / f2f), 'storey')} at ${fmt(f2f, 1)} m.`, implication: `${excess != null && excess > 0.5 ? 'The spare height is not usable capacity: density is already exceeded, so adding storeys would deepen the FSR failure.' : 'Height leaves room above the current roof.'}${hVerify ? ` ${prov('heightArea') === 'verify' ? 'The height area is guessed from the density area and needs verification on ODP Map 3.' : 'View cones cross the lot and the cone height has not been entered.'}` : ''}`, anchor: [A.tallest.x + A.tallest.w * 0.5, A.tallest.y + A.tallest.d * 0.5, top] }); }
    }
    const pl = byId('plate'); if (pl && tower && (pl.verdict === 'fail' || pl.verdict === 'review')) out.push({ key: 'plate', status: eff(pl).key, title: pl.verdict === 'fail' ? 'Tower plate is larger than the guideline' : 'Tower plate needs review', short: pl.value.split(' largest')[0], observation: `The largest floor plate above 18 m is ${pl.value.split(' largest')[0]} (cores included).`, evidence: `Requirement: ${pl.limit}. Source: ${pl.clause}.`, implication: pl.fix || Checks.describe(pl, app).next, anchor: anchorSouth(tower, 0.72, 0.86) });
    const eg = raw.filter((r) => r.group === 'egress' && r.verdict === 'fail' && r.levels && r.levels.length);
    if (eg.length) { const lv = [...new Set(eg.flatMap((r) => r.levels))], L = levels.find((l) => l.key === lv[0]), b = L && L.blocks.find((x) => !x.hidden) ; out.push({ key: 'egress', status: 'fail', title: `Exit routes fail on ${plural(lv.length, 'storey')}`, short: lv.map((k) => (levels.find((l) => l.key === k) || {}).name || k).join(', '), observation: eg.slice(0, 3).map((r) => `${r.title}: ${r.value}`).join('; ') + (eg.length > 3 ? `; and ${eg.length - 3} more` : '') + '.', evidence: [...[...new Set(eg.map((r) => r.limit).filter((l) => l && l !== '—'))].slice(0, 2).map((l) => `Requirement ${l}`), `Source: ${eg[0].clause}`].join('. ') + '.', implication: `These are plan-level problems. Exits, doors or core position can likely resolve them without changing the overall massing. ${eg[0].fix || ''}`.trim(), anchor: b ? [b.x + b.w * 0.3, b.y, L.z + L.h * 0.5] : null, level: L, row: eg[0] }); }
    const pk = raw.filter((r) => r.group === 'parking' && r.verdict === 'fail');
    if (pk.length) { const b = A.below[0] || null; out.push({ key: 'parking', status: 'fail', title: 'Servicing below grade falls short', short: pk.map((r) => r.title).join(', '), observation: pk.map((r) => `${r.title}: ${r.value}`).join('; ') + '.', evidence: pk.map((r) => `${r.title} requires ${r.limit}`).join('; ') + `. Source: ${pk[0].clause}.`, implication: `Local fix: allocate space on the parking levels. ${[...new Set(pk.map((r) => r.fix).filter(useful))].slice(0, 2).join(' ')}`.trim(), anchor: b ? [b.x + b.w * 0.62, b.y, b.z0 + hOf(b) * 0.5] : null }); }
    const dl = raw.filter((r) => /^daylight-/.test(r.id) && r.verdict === 'fail');
    if (dl.length) { const b = p.blocks.find((x) => x.id === dl[0].block); out.push({ key: 'daylight', status: 'fail', title: 'Daylight to windows is blocked on some faces', short: dl.map((r) => r.value).join(', '), observation: dl.map((r) => `${r.title}: ${r.value}`).join('; ') + '.', evidence: `Requirement ${dl[0].limit}. Source: ${dl[0].clause}.`, implication: dl[0].fix || 'Shift or narrow the facing blocks to clear the view fans.', anchor: b ? anchorSouth(b, 0.35, 0.4) : null }); }
    const other = raw.filter((r) => r.verdict === 'fail' && !['fsr', 'height', 'plate'].includes(r.id) && r.group === 'zoning' && !/^daylight-/.test(r.id));
    for (const r of other) out.push({ key: r.id, status: 'fail', title: r.title, short: r.value, observation: `${r.title}: ${r.value}.`, evidence: `Requirement ${r.limit}. Source: ${r.clause}.`, implication: r.fix || Checks.describe(r, app).next, anchor: tower ? anchorSouth(tower, 0.25, 0.3) : null });
    const rank = { fail: 0, verify: 1, review: 2, pass: 3, info: 4 }, keyRank = { fsr: 0, height: 1, plate: 2 };
    const list = out.sort((a, b) => rank[a.status] - rank[b.status] || (keyRank[a.key] ?? 5) - (keyRank[b.key] ?? 5)).slice(0, 5);
    list.forEach((f, i) => (f.n = i + 1));
    return list;
  }

  /* ---------- recommended moves (tested with the rule engine on a copy when they are massing changes) ---------- */
  function trial(p0) {
    const p2 = window.Form ? Form.expand(p0) : p0, L = Model.levels(p2); p2._parkNeed = Rules.parkingNeed(p2); const plans = {}; for (const l of L) plans[l.key] = Plans.forLevel(p2, l);
    const rows = Rules.evaluate(p2, plans, L, call('context', null)), T = Model.totals(p2), dn = Rules.density(p2, T), mixr = rows.find((r) => r.id === 'ly-mix');
    return { rows, fsr: dn.fsr, fsrFA: dn.fsrFA, height: T.maxZ, storeys: T.storeysAbove, homes: mixr ? parseInt(mixr.value) || 0 : null, fail: rows.filter((r) => r.verdict === 'fail').length };
  }
  function trimCores(p2, oldTop, dz) { for (const c of p2.blocks) if (c.use === 'core' && Math.abs(Model.blockTop(c) - oldTop) < 0.15) c.f2f = Math.max(3, c.f2f - dz); }
  function moves(A) {
    const out = [], { p, tower, excess, per, D, cap, top, byId, raw, levels, eff, homes } = A, base = { fsr: A.dn.fsr, height: top, homes, fail: raw.filter((r) => r.verdict === 'fail').length, rows: raw };
    const diffRows = (r) => { const was = new Map(base.rows.map((x) => [x.id, x.verdict])); return { fixed: r.rows.filter((x) => was.get(x.id) === 'fail' && x.verdict !== 'fail').map((x) => x.title), broke: r.rows.filter((x) => x.verdict === 'fail' && was.get(x.id) !== 'fail').map((x) => x.title) }; };
    const testedText = (r, extra) => { const d = diffRows(r); return { benefit: `Tested in the model: FSR ${fmt(base.fsr, 2)} → ${fmt(r.fsr, 2)}${D.fsr != null ? ` (limit ${fmt(D.fsr, 2)}${r.fsr > D.fsr + 1e-9 ? ', still over' : ', now within'})` : ''}; height ${fmt(base.height, 1)} → ${fmt(r.height, 1)} m; issues ${base.fail} → ${r.fail}.${d.fixed.length ? ` Resolves: ${d.fixed.slice(0, 3).join(', ')}.` : ''}`, tradeoff: `${r.homes != null && base.homes ? `Homes estimate ${base.homes} → ${r.homes}. ` : ''}${d.broke.length ? `New issues: ${d.broke.join(', ')}. ` : ''}${extra || ''}`.trim() || 'No other check changes status.' }; };
    if (tower && excess != null && excess > 0.5) {
      let n = Math.ceil(excess / per); const partial = n > tower.floors - 1; n = Math.min(n, tower.floors - 1);
      if (n > 0) { const p2 = clone(p), t2 = p2.blocks.find((b) => b.id === tower.id), old = Model.blockTop(t2); t2.floors -= n; trimCores(p2, old, n * t2.f2f); const r = trial(p2), tt = testedText(r, partial ? 'Even this does not remove the whole excess; floor area must also come out of the podium.' : '');
        out.push({ kind: 'storeys', title: `Remove ${plural(n, 'storey')} from ${tower.name}`, tested: true, why: `Takes out ${m2(n * per)} of counted floor area, the most direct way to meet the ${fmt(D.fsr, 2)} FSR.`, ...tt, diagram: { type: 'storeys', id: tower.id, n }, scope: 'massing' }); }
      const dw = Math.ceil(excess / (tower.floors * tower.d) * 4) / 4;
      if (tower.w - dw >= Math.max(12, tower.w * 0.45)) { const p3 = clone(p), t3 = p3.blocks.find((b) => b.id === tower.id); t3.x += dw; t3.w -= dw; for (const c of p3.blocks) if (c.use === 'core' && c.x < t3.x) c.x = Math.min(c.x + dw, t3.x + t3.w - c.w); const r = trial(p3);
        out.push({ kind: 'narrow', title: `Narrow ${tower.name} by ${fmt(dw, 2)} m from the west face`, tested: true, why: `Keeps the storey count and silhouette height while cutting about ${m2(dw * tower.d * tower.floors)} of floor area.`, ...testedText(r, `The plate becomes ${fmt(tower.w - dw, 2)} × ${fmt(tower.d, 2)} m; check that the core still fits the narrower plan.`), diagram: { type: 'narrow', id: tower.id, dw }, scope: 'massing' }); }
    } else if (tower && cap != null && top > cap + 1e-6) {
      const n = Math.min(tower.floors - 1, Math.ceil((top - cap) / tower.f2f)); const p2 = clone(p), t2 = p2.blocks.find((b) => b.id === tower.id), old = Model.blockTop(t2); t2.floors -= n; trimCores(p2, old, n * t2.f2f); const r = trial(p2);
      out.push({ kind: 'storeys', title: `Lower ${tower.name} by ${plural(n, 'storey')}`, tested: true, why: `Brings the roof under the ${fmt(cap, 1)} m limit.`, ...testedText(r), diagram: { type: 'storeys', id: tower.id, n }, scope: 'massing' });
    }
    const pl = byId('plate'); if (pl && pl.verdict === 'fail' && tower) { const lim = parseFloat(String(pl.limit).replace(/,/g, '')), cur = parseFloat(String(pl.value).replace(/,/g, '')); if (lim > 0 && cur > lim) { const dw = Math.ceil((cur - lim) / tower.d * 4) / 4; const p4 = clone(p), t4 = p4.blocks.find((b) => b.id === tower.id); t4.x += dw; t4.w -= dw; const r = trial(p4); out.push({ kind: 'narrow', title: `Slim the tower plate by ${fmt(dw, 2)} m`, tested: true, why: `Brings the plate from ${m2(cur)} toward the ${m2(lim)} guideline.`, ...testedText(r), diagram: { type: 'narrow', id: tower.id, dw }, scope: 'massing' }); } }
    const eg = raw.filter((r) => r.group === 'egress' && r.verdict === 'fail' && r.levels && r.levels.length);
    if (eg.length) { const L = levels.find((l) => l.key === eg[0].levels[0]); out.push({ kind: 'local', title: `Rework exits on ${[...new Set(eg.flatMap((r) => r.levels))].map((k) => (levels.find((l) => l.key === k) || {}).name || k).join(', ')}`, tested: false, why: [...new Set(eg.map((r) => r.fix).filter(Boolean))].slice(0, 2).join(' ') || 'Add or relocate exits so every room reaches one within the travel limit.', benefit: `Would clear ${plural(eg.length, 'egress issue')} without changing the massing.`, tradeoff: 'Untested suggestion: a new stair or door takes floor area and needs a revised plan.', diagram: { type: 'plan', level: L, row: eg[0] }, scope: 'local' }); }
    const pk = raw.filter((r) => r.group === 'parking' && r.verdict === 'fail');
    if (pk.length) out.push({ kind: 'local', title: `Provide ${pk.map((r) => r.title.toLowerCase()).join(' and ')} below grade`, tested: false, why: [...new Set(pk.map((r) => r.fix).filter(useful))].slice(0, 2).join(' ') || pk.map((r) => `${r.title}: ${r.limit}`).join('; '), benefit: `Would clear ${plural(pk.length, 'parking issue')}.`, tradeoff: 'Untested suggestion: bike rooms and loading bays displace stalls or need part of another level.', diagram: { type: 'program' }, scope: 'local' });
    const ver = raw.filter((r) => eff(r).key === 'verify'); if (ver.length) { const reasons = [...new Set(ver.map((r) => eff(r).reason))]; out.push({ kind: 'verify', title: `Confirm ${reasons.join(' and ')}`, tested: false, why: 'Set it on the Site tab from the ODP maps or the View Protection Guidelines.', benefit: `Turns ${plural(ver.length, 'provisional pass', 'provisional passes')} (${ver.map((r) => r.title).join(', ')}) into confirmed results.`, tradeoff: 'If the confirmed figure is stricter, these checks may fail.', diagram: null, scope: 'input' }); }
    return out.slice(0, 5);
  }

  /* ---------- figures ---------- */
  function figAxoMain(A, F) {
    const W = 1000, H = 660, gx = 640, ctx = (call('context', null) || {}).footAll || null;
    const ax = axo(A.p, { box: { x: 0, y: 0, w: 610, h: H }, ctx, ctxR: 85, outlineIds: null, noCores: true }); /* cores are inside the masses; they are marked on the roof instead of drawn through the walls */
    const items = F.filter((f) => f.anchor).map((f) => ({ n: f.n, p: ax.P(...f.anchor), label: f.title, sub: f.short }));
    let coresG = ''; for (const c of A.p.blocks.filter((b) => b.use === 'core' && !b.hidden)) { const q = ax.P(c.x + c.w / 2, c.y + c.d / 2, Model.blockTop(c) + 0.1); coresG += `<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="2.6" fill="${INK}"/>` + line(q, [q[0] + 14, q[1] - 16], `stroke="${INK}" stroke-width=".6"`) + txt(q[0] + 17, q[1] - 18, c.name.toUpperCase(), `${MONO} font-size="11" font-weight="600" fill="${INK}"`); }
    return svgWrap(W, H, ax.svg + coresG + callouts(items, gx, 30, H - 30, 320), 'Annotated axonometric of the proposal');
  }
  function figCapacity(A) {
    const { dn, D, cap, env, top, byId, prov, tower } = A, rows = [];
    if (D.fsr != null) rows.push({ k: 'Floor space ratio', v: dn.fsr, lim: D.fsr, unit: '', d: 2, verify: prov('densityArea') === 'verify', note: dn.fsr > D.fsr ? `+${m2(dn.fsrFA - D.fsr * dn.siteArea)} over` : `${m2(D.fsr * dn.siteArea - dn.fsrFA)} remaining` });
    if (cap) rows.push({ k: 'Building height', v: top, lim: cap, lim2: env.max && env.basic < env.max ? env.basic : null, unit: ' m', d: 1, verify: prov('heightArea') === 'verify', note: top > cap ? `+${fmt(top - cap, 1)} m over` : `${fmt(cap - top, 1)} m remaining · ≈${Math.floor((cap - top) / (tower ? tower.f2f : 3))} storeys` });
    const pl = byId('plate'); const lim = pl ? parseFloat(String(pl.limit).replace(/,/g, '')) : NaN, cur = pl ? parseFloat(String(pl.value).replace(/,/g, '')) : NaN; if (pl && lim > 0) rows.push({ k: 'Tower floor plate', v: cur, lim, unit: ' m²', d: 0, verify: false, note: cur > lim ? `+${m2(cur - lim)} over` : `${m2(lim - cur)} below` });
    const W = 1000, rh = 84, H = rows.length * rh + 30, x0 = 230, x1 = 720; let s = '';
    rows.forEach((r, i) => { const y = 24 + i * rh, mx = Math.max(r.v, r.lim) * 1.12, k = (x1 - x0) / mx, bx = x0 + r.v * k, lx = x0 + r.lim * k, over = r.v > r.lim + 1e-9;
      s += txt(0, y + 18, r.k, `${SANS} font-size="18.2" font-weight="600" fill="${INK}"`) + txt(0, y + 38, r.verify ? 'Limit needs verification' : 'Resolved limit', `${SANS} font-size="15.4" fill="${r.verify ? '#8a5a00' : MUTED}"`);
      s += `<rect x="${x0}" y="${y + 8}" width="${x1 - x0}" height="16" fill="${GROUND}" stroke="${CTXE}" stroke-opacity=".6" stroke-width=".5"/>`;
      s += `<rect x="${x0}" y="${y + 8}" width="${Math.min(bx, lx) - x0}" height="16" fill="${USE_HEX.office}" stroke="${USE_LINE.office}" stroke-width=".7"/>`;
      if (over) s += `<rect x="${lx}" y="${y + 8}" width="${bx - lx}" height="16" fill="url(#p-red)" stroke="${RED}" stroke-width=".8"/>`;
      if (r.lim2) { const l2 = x0 + r.lim2 * k; s += line([l2, y + 2], [l2, y + 30], `stroke="${INK}" stroke-width=".8" stroke-dasharray="2 2"`) + txt(l2, y + 50, `basic ${fmt(r.lim2, r.d)}`, `${MONO} font-size="12.6" fill="${MUTED}" text-anchor="middle"`); }
      s += line([lx, y], [lx, y + 32], `stroke="${RED}" stroke-width="1.4"${r.verify ? ' stroke-dasharray="3 2"' : ''}`) + txt(lx, y - 2, `limit ${fmt(r.lim, r.d)}${r.unit}`, `${MONO} font-size="13.3" fill="${RED}" text-anchor="middle"`);
      s += txt(x1 + 18, y + 18, `${fmt(r.v, r.d)}${r.unit}`, `${MONO} font-size="19.6" font-weight="600" fill="${INK}"`) + txt(x1 + 18, y + 38, r.note, `${MONO} font-size="14.7" fill="${over ? RED : MUTED}"`); });
    return rows.length ? svgWrap(W, H, s, 'Proposed values against resolved limits') : '';
  }
  function figStack(A) {
    const { levels, env, cap } = A, Ls = levels.slice().sort((a, b) => a.z - b.z); if (!Ls.length) return '';
    const zMin = Math.min(...Ls.map((l) => l.z)), zMax = Math.max(A.top, cap || 0, Ls[Ls.length - 1].z + Ls[Ls.length - 1].h) + 4, W = 1000, H = 560, y0 = 20, y1 = H - 30, x0 = 70, maxA = Math.max(...Ls.map((l) => l.blocks.filter((b) => !b.hidden && b.use !== 'core').reduce((a, b) => a + b.w * b.d, 0))), kx = 470 / maxA, ky = (y1 - y0) / (zMax - zMin), Y = (z) => y1 - (z - zMin) * ky;
    let s = ''; const step = zMax - zMin > 120 ? 20 : 10;
    for (let z = Math.ceil(zMin / step) * step; z <= zMax; z += step) s += line([x0 - 6, Y(z)], [x0, Y(z)], `stroke="${INK}" stroke-width=".6"`) + txt(x0 - 10, Y(z) + 3, `${z}`, `${MONO} font-size="12.6" fill="${MUTED}" text-anchor="end"`);
    s += line([x0, Y(zMin)], [x0, Y(zMax)], `stroke="${INK}" stroke-width=".6"`) + txt(x0 - 10, y0 - 6, 'm', `${MONO} font-size="12.6" fill="${MUTED}" text-anchor="end"`);
    const groups = [];
    for (const L of Ls) { const per = {}; for (const b of L.blocks) if (!b.hidden && b.use !== 'core') per[b.use] = (per[b.use] || 0) + b.w * b.d; const sig = Object.entries(per).map(([u, a]) => u + Math.round(a)).join('|');
      let x = x0 + 2; const yt = Y(L.z + L.h), yb = Y(L.z); for (const u of Model.USES) if (per[u]) { const w = per[u] * kx; s += usePaint(u, `M${x.toFixed(1)} ${yt.toFixed(1)}h${w.toFixed(1)}V${yb.toFixed(1)}H${x.toFixed(1)}Z`, USE_HEX[u], `stroke="${USE_LINE[u]}" stroke-width=".6"`); x += w; }
      const g = groups[groups.length - 1]; if (g && g.sig === sig) { g.L.push(L); g.area += Object.values(per).reduce((a, v) => a + v, 0); } else groups.push({ sig, L: [L], per, area: Object.values(per).reduce((a, v) => a + v, 0), xEnd: x }); }
    s += line([x0 - 20, Y(0)], [x0 + 500, Y(0)], `stroke="${INK}" stroke-width="1.6"`) + txt(x0 + 6, Y(0) + 16, 'GRADE ±0.0', `${MONO} font-size="12.6" fill="${INK}"`);
    if (env.basic) s += line([x0, Y(env.basic)], [x0 + 500, Y(env.basic)], `stroke="${RED}" stroke-width="1" stroke-dasharray="5 3"`) + txt(x0 + 6, Y(env.basic) - 5, `BASIC HEIGHT ${fmt(env.basic, 1)} m`, `${MONO} font-size="12.6" fill="${RED}"`);
    if (env.max && env.max !== env.basic) s += line([x0, Y(env.max)], [x0 + 500, Y(env.max)], `stroke="${RED}" stroke-width="1" stroke-dasharray="10 3 2 3"`) + txt(x0 + 6, Y(env.max) - 5, `BOARD MAXIMUM ${fmt(env.max, 1)} m`, `${MONO} font-size="12.6" fill="${RED}"`);
    let lastY = -1e9; const lx = 720;
    for (const g of groups.slice().reverse()) { const yt = Y(g.L[g.L.length - 1].z + g.L[g.L.length - 1].h), yb = Y(g.L[0].z), ym = Math.max((yt + yb) / 2, lastY + 40); lastY = ym;
      const nm = g.L.length > 1 ? `${g.L[0].name}–${g.L[g.L.length - 1].name}` : g.L[0].name, uses = Object.keys(g.per).map((u) => USE_LABEL[u]).join(' + ');
      s += `<path d="M${(g.xEnd + 4).toFixed(1)} ${((yt + yb) / 2).toFixed(1)}L${lx - 10} ${ym.toFixed(1)}H${lx - 4}" fill="none" stroke="${INK}" stroke-width=".5"/>`;
      s += txt(lx, ym - 2, `${nm} · ${uses}`, `${SANS} font-size="15.4" font-weight="600" fill="${INK}"`) + txt(lx, ym + 15, g.L.length > 1 ? `${m2(g.area / g.L.length)} × ${g.L.length} = ${m2(g.area)}` : m2(g.area), `${MONO} font-size="13.3" fill="${MUTED}"`); }
    return svgWrap(W, H, s, 'Program stack by storey');
  }
  function figExploded(A) {
    const p = A.p, top = Math.max(1, A.top), gap = Math.max(8, top * 0.22), blocks = p.blocks.filter((b) => !b.hidden && b.use !== 'core');
    const grp = (b) => (Model.blockTop(b) <= 0.01 ? 0 : Model.blockTop(b) <= 18.5 ? 1 : 2), labels = ['Below grade', 'Podium', 'Tower'], dz = (b) => [-gap * 0.8, 0, gap][grp(b)];
    const pe = { site: p.site, ramps: [], blocks: blocks.map((b) => Object.assign({}, b, { solid: true })) }, W = 720, H = 600;
    const align = (P) => { let o = ''; for (const b of blocks) { const g = grp(b); if (g === 0) continue; const lower = g === 2 ? dz(blocks.find((x) => grp(x) === 1) || b) : -gap * 0.8; const from = b.z0 + dz(b), to = b.z0 + (g === 2 ? lower : 0) - (g === 1 ? 0 : 0); const zt = g === 1 ? b.z0 - gap * 0.8 + 0 : b.z0 + lower; for (const [x, y] of [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.d], [b.x + b.w, b.y + b.d]]) o += line(P(x, y, from), P(x, y, g === 1 ? Math.max(zt, -gap * 0.8) : zt), `stroke="${REDS}" stroke-width=".7" stroke-dasharray="4 3"`); void to; } return o; };
    const ax = axo(pe, { box: { x: 0, y: 0, w: 400, h: H }, dzOf: dz, ctx: null, streets: false, overlay: align });
    const items = [];
    for (let g = 0; g <= 2; g++) { const bs = blocks.filter((b) => grp(b) === g); if (!bs.length) continue; const a = bs.reduce((t, b) => t + b.w * b.d * b.floors, 0), uses = [...new Set(bs.map((b) => USE_LABEL[b.use]))].join(', '), hi = bs.slice().sort((x, y) => Model.blockTop(y) - Model.blockTop(x))[0];
      items.push({ n: String.fromCharCode(65 + items.length), p: ax.P(hi.x, hi.y + hi.d * 0.5, hi.z0 + hOf(hi) * 0.5 + dz(hi)), label: `${labels[g]} · ${uses}`, sub: m2(a) }); }
    return svgWrap(W, H, ax.svg + callouts(items, 430, 40, H - 40, 270), 'Explanatory exploded view of the program groups');
  }
  function figElevation(A) {
    const { p, env, top, cap } = A, bl = (A.mp || p).blocks.filter((b) => !b.hidden), s0 = p.site, W = 640, H = 520;
    const zMin = Math.min(0, ...bl.map((b) => b.z0)), zMax = Math.max(top, cap || 0) + 6, x0 = 70, x1 = 470, k = Math.min((x1 - x0) / s0.w, (H - 70) / (zMax - zMin)), X = (x) => x0 + x * k, Y = (z) => H - 40 - (z - zMin) * k;
    let s = `<rect x="${X(-4)}" y="${Y(0)}" width="${(s0.w + 8) * k}" height="${(0 - zMin) * k + 6}" fill="${GROUND}"/>`;
    for (const b of bl.slice().sort((a, c) => c.y - a.y)) { const d = `M${X(b.x).toFixed(1)} ${Y(b.z0 + hOf(b)).toFixed(1)}H${X(b.x + b.w).toFixed(1)}V${Y(b.z0).toFixed(1)}H${X(b.x).toFixed(1)}Z`; s += Model.blockTop(b) <= 0.01 ? `<path d="${d}" fill="none" stroke="${MUTED}" stroke-width=".6" stroke-dasharray="3 2"/>` : usePaint(b.use, d, USE_HEX[b.use], `stroke="${USE_LINE[b.use]}" stroke-width=".9"`); }
    s += line([X(-6), Y(0)], [X(s0.w + 6), Y(0)], `stroke="${INK}" stroke-width="1.6"`) + txt(X(-6), Y(0) - 4, 'GRADE', `${MONO} font-size="12.6" fill="${INK}"`);
    const lim = (z, lab, dash) => line([X(-6), Y(z)], [X(s0.w + 6), Y(z)], `stroke="${RED}" stroke-width="1" stroke-dasharray="${dash}"`) + txt(X(-6), Y(z) - 5, `${lab} ${fmt(z, 1)} m`, `${MONO} font-size="12.6" fill="${RED}"`);
    if (env.basic) s += lim(env.basic, 'BASIC', '5 3'); if (env.max && env.max !== env.basic) s += lim(env.max, 'BOARD MAX', '10 3 2 3');
    if (cap) { const xd = X(s0.w) + 30, over = top > cap; s += line([xd, Y(top)], [xd, Y(cap)], `stroke="${over ? RED : INK}" stroke-width=".8" marker-start="url(#tk)" marker-end="url(#tk)"`) + txt(xd + 6, (Y(top) + Y(cap)) / 2 + 3, `${over ? '+' : ''}${fmt(over ? top - cap : cap - top, 1)} m ${over ? 'over' : 'spare'}`, `${MONO} font-size="14.0" fill="${over ? RED : INK}"`); }
    const xt = X(0) - 34; s += line([xt, Y(0)], [xt, Y(top)], `stroke="${INK}" stroke-width=".7" marker-start="url(#tk)" marker-end="url(#tk)"`) + `<text transform="translate(${xt - 6} ${(Y(0) + Y(top)) / 2}) rotate(-90)" ${MONO} font-size="14.0" fill="${INK}" text-anchor="middle">${fmt(top, 1)} m</text>`;
    s += scaleBar(X(0), H - 24, k) + txt(X(s0.w), H - 14, 'SOUTH ELEVATION · TRUE SCALE', `${MONO} font-size="12.6" fill="${MUTED}" text-anchor="end"`);
    return svgWrap(W, H, s, 'South elevation against the height limits');
  }
  function planSVG(P, box, hl) {
    const R = P.tiles && P.tiles.length ? P.tiles.map((t) => t.rect) : P.rooms.map((r) => r.rect); let x0 = Math.min(...R.map((r) => r.x)), y0 = Math.min(...R.map((r) => r.y)), x1 = Math.max(...R.map((r) => r.x + r.w)), y1 = Math.max(...R.map((r) => r.y + r.d));
    const k = Math.min((box.w - 20) / (x1 - x0), (box.h - 40) / (y1 - y0)), ox = box.x + (box.w - (x1 - x0) * k) / 2, oy = box.y + 10, X = (x) => ox + (x - x0) * k, Y = (y) => oy + (y1 - y) * k, rect = (r) => `M${X(r.x).toFixed(1)} ${Y(r.y + r.d).toFixed(1)}h${(r.w * k).toFixed(1)}v${(r.d * k).toFixed(1)}h${(-r.w * k).toFixed(1)}Z`;
    let s = '';
    for (const r of P.rooms) { if (r.parent) continue; const h = hl && (hl.ids.has(r.id) || r.name === hl.name); s += `<path d="${rect(r.rect)}" fill="${r.kind === 'stall' ? '#fff' : r.kind === 'aisle' ? GROUND : mix(USE_HEX[r.use] || '#eeeeee', '#ffffff', 0.45)}" stroke="${INK}" stroke-opacity=".25" stroke-width=".4"/>` + (h ? `<path d="${rect(r.rect)}" fill="url(#p-red)" stroke="${RED}" stroke-width="1.4"/>` : ''); }
    for (const c of P.cores || []) { s += usePaint('core', rect(c), USE_HEX.core, `stroke="${INK}" stroke-width=".8"`); if (c.name && c.w * k > 34) s += txt(X(c.x + c.w / 2), Y(c.y + c.d / 2) + 3.5, String(c.name).toUpperCase(), `${MONO} font-size="9.5" font-weight="600" fill="${INK}" text-anchor="middle"`); }
    for (const c of P.corridors || []) s += `<path d="${rect(c)}" fill="${mix(GROUND, INK, 0.04)}" stroke="none"/>`;
    s += `<path d="${(P.walls || []).map((w) => `M${X(w[0]).toFixed(1)} ${Y(w[1]).toFixed(1)}L${X(w[2]).toFixed(1)} ${Y(w[3]).toFixed(1)}`).join('')}" stroke="${INK}" stroke-width=".9" fill="none"/>`;
    for (const e of P.exits || []) s += `<rect x="${(X(e.x) - 3).toFixed(1)}" y="${(Y(e.y) - 3).toFixed(1)}" width="6" height="6" fill="${RED}"/>`;
    return { svg: s + scaleBar(ox, box.y + box.h - 20, k), k, frame: { x: ox - 6, y: oy - 6, w: (x1 - x0) * k + 12, h: (y1 - y0) * k + 12 } };
  }
  function figPlanDetail(A, f) {
    const L = f.level, P = L && A.plans[L.key]; if (!P) return '';
    const W = 1000, H = 520, ax = axo(A.p, { box: { x: 0, y: 30, w: 360, h: H - 60 }, ctx: null, streets: false, north: false, pad: 10 });
    const ids = new Set((f.row && f.row.rooms) || []), name = P.metrics && P.metrics.maxTravelRoom ? P.metrics.maxTravelRoom.name : null, pl = planSVG(P, { x: 430, y: 40, w: 560, h: H - 60 }, { ids, name });
    const band = L.blocks.filter((b) => !b.hidden); let bandS = '', c = [0, 0], nC = 0;
    for (const b of band) { const z = L.z + 0.02, q = [ax.P(b.x, b.y, z), ax.P(b.x + b.w, b.y, z), ax.P(b.x + b.w, b.y + b.d, z), ax.P(b.x, b.y + b.d, z)]; bandS += `<path d="${pathOf(q)}" fill="url(#p-red)" stroke="${RED}" stroke-width="1.3"/>`; for (const v of q) { c[0] += v[0]; c[1] += v[1]; nC++; } }
    c = [c[0] / nC, c[1] / nC]; const fr = pl.frame;
    const leader = `<path d="M${c[0].toFixed(1)} ${c[1].toFixed(1)}L${(fr.x - 30).toFixed(1)} ${(fr.y + 20).toFixed(1)}H${fr.x.toFixed(1)}" fill="none" stroke="${RED}" stroke-width=".8"/><circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="2.5" fill="${RED}"/>`;
    const head = txt(fr.x, 26, `DETAIL A · STOREY ${L.name} · z ${fmt(L.z, 1)} m`, `${MONO} font-size="17" fill="${RED}" letter-spacing=".06em"`) + txt(0, 20, 'KEY VIEW', `${MONO} font-size="17" fill="${MUTED}" letter-spacing=".06em"`);
    return svgWrap(W, H, ax.svg + bandS + `<rect x="${fr.x}" y="${fr.y}" width="${fr.w}" height="${fr.h}" fill="none" stroke="${RED}" stroke-width=".8"/>` + pl.svg + leader + head, `Plan detail of storey ${L.name}`);
  }
  /* ---------- cores: where each one stands, what it holds and which masses it runs through ---------- */
  function coreInfo(A) {
    const p = A.p, solid = p.blocks.filter((b) => b.use !== 'core' && b.len == null && !b.hidden), hiTop = Math.max(0, ...solid.map((b) => Model.blockTop(b)));
    return p.blocks.filter((b) => b.use === 'core' && !b.hidden).map((c) => { const cx = c.x + c.w / 2, cy = c.y + c.d / 2, hosts = solid.filter((b) => cx > b.x && cx < b.x + b.w && cy > b.y && cy < b.y + b.d && c.z0 < Model.blockTop(b) - 0.05 && Model.blockTop(c) > b.z0 + 0.05).sort((a, b) => a.z0 - b.z0);
      return { c, cx, cy, top: Model.blockTop(c), hosts, full: c.w * c.d >= 30, reaches: Math.abs(Model.blockTop(c) - hiTop) < 0.3, missed: solid.filter((b) => cx > b.x && cx < b.x + b.w && cy > b.y && cy < b.y + b.d && !(c.z0 < Model.blockTop(b) - 0.05 && Model.blockTop(c) > b.z0 + 0.05)) }; });
  }
  const coreText = (A) => { const ci = coreInfo(A); if (!ci.length) return 'no cores'; return ci.map((q) => `${q.c.name}: ${fmt(q.c.w, 1)} × ${fmt(q.c.d, 1)} m, ${fmt(q.c.x, 1)} m from the west line and ${fmt(q.c.y, 1)} m from the street line, ${plural(q.c.stairs || 0, 'exit stair')} and ${plural(q.c.elevators || 0, 'elevator')}, from ${fmt(q.c.z0, 1)} to ${fmt(q.top, 1)} m through ${q.hosts.map((h) => h.name).join(', ') || 'no mass'}`).join('; '); };
  function figCores(A) {
    const { p, top } = A, ci = coreInfo(A), bl = p.blocks.filter((b) => !b.hidden && b.use !== 'core'), s0 = p.site, W = 1000, H = 470;
    /* left: plan of the footprints with the cores named and dimensioned; right: section looking north with the cores as full-height bars */
    const px0 = 40, pw = 440, kp = Math.min(pw / (s0.w + 8), (H - 110) / (s0.d + 8)), PX = (x) => px0 + (x + 4) * kp, PY = (y) => H - 60 - (y + 4) * kp;
    let pl = `<path d="${pathOf(sitePoly(s0).map((q) => [PX(q[0]), PY(q[1])]))}" fill="${GROUND}" stroke="${INK}" stroke-width=".9" stroke-dasharray="6 2 1 2"/>`;
    for (const b of bl.filter((b) => Model.blockTop(b) > 0.01).sort((a, c) => a.z0 - c.z0)) pl += `<path d="M${PX(b.x).toFixed(1)} ${PY(b.y + b.d).toFixed(1)}h${(b.w * kp).toFixed(1)}v${(b.d * kp).toFixed(1)}h${(-b.w * kp).toFixed(1)}Z" fill="${mix(USE_HEX[b.use], '#ffffff', 0.45)}" fill-opacity=".9" stroke="${USE_LINE[b.use]}" stroke-width=".8"/>`;
    ci.forEach((q, i) => { const c = q.c, x = PX(c.x), y = PY(c.y + c.d), w = c.w * kp, h = c.d * kp; pl += usePaint('core', `M${x.toFixed(1)} ${y.toFixed(1)}h${w.toFixed(1)}v${h.toFixed(1)}h${(-w).toFixed(1)}Z`, USE_HEX.core, `stroke="${INK}" stroke-width="1.1"`);
      pl += txt(x + w / 2, y + h / 2 + 4, c.name.toUpperCase(), `${MONO} font-size="11.5" font-weight="600" fill="${INK}" text-anchor="middle"`);
      /* dimension ties to the west line and to the street line (y = 0) */
      const ty = PY(0) + 14 + i * 14; pl += line([PX(0), ty], [x, ty], `stroke="${RED}" stroke-width=".7" marker-start="url(#tk)" marker-end="url(#tk)"`) + txt((PX(0) + x) / 2, ty - 3, `${fmt(c.x, 1)} m`, `${MONO} font-size="10.5" fill="${RED}" text-anchor="middle"`);
      const tx = PX(s0.w) + 14 + i * 40; pl += line([tx, PY(0)], [tx, PY(c.y)], `stroke="${RED}" stroke-width=".7" marker-start="url(#tk)" marker-end="url(#tk)"`) + `<text transform="translate(${(tx - 4).toFixed(1)} ${((PY(0) + PY(c.y)) / 2).toFixed(1)}) rotate(-90)" ${MONO} font-size="10.5" fill="${RED}" text-anchor="middle">${fmt(c.y, 1)} m</text>`;
      pl += txt(x + w / 2, y - 5, `${fmt(c.w, 1)} × ${fmt(c.d, 1)}`, `${MONO} font-size="10.5" fill="${MUTED}" text-anchor="middle"`); });
    pl += txt(px0, 18, 'PLAN · CORES ON THE FOOTPRINTS', `${MONO} font-size="11.5" fill="${MUTED}" letter-spacing=".05em"`) + scaleBar(PX(0), H - 22, kp);
    const zMin = Math.min(0, ...bl.map((b) => b.z0), ...ci.map((q) => q.c.z0)), zMax = Math.max(top, 10, ...ci.map((q) => q.top)) + 4, x0 = 560, x1 = 960, k = Math.min((x1 - x0) / s0.w, (H - 90) / (zMax - zMin)), X = (x) => x0 + x * k, Y = (z) => H - 50 - (z - zMin) * k;
    let sec = `<rect x="${X(-4)}" y="${Y(0)}" width="${(s0.w + 8) * k}" height="${(0 - zMin) * k + 6}" fill="${GROUND}"/>`;
    for (const b of bl.slice().sort((a, c) => c.y - a.y)) { const d = `M${X(b.x).toFixed(1)} ${Y(b.z0 + hOf(b)).toFixed(1)}H${X(b.x + b.w).toFixed(1)}V${Y(b.z0).toFixed(1)}H${X(b.x).toFixed(1)}Z`; sec += Model.blockTop(b) <= 0.01 ? `<path d="${d}" fill="${GROUND}" stroke="${MUTED}" stroke-width=".6" stroke-dasharray="3 2"/>` : `<path d="${d}" fill="${mix(USE_HEX[b.use], '#ffffff', 0.5)}" stroke="${USE_LINE[b.use]}" stroke-width=".7"/>`; }
    ci.forEach((q) => { const c = q.c, d = `M${X(c.x).toFixed(1)} ${Y(q.top).toFixed(1)}H${X(c.x + c.w).toFixed(1)}V${Y(c.z0).toFixed(1)}H${X(c.x).toFixed(1)}Z`; sec += usePaint('core', d, USE_HEX.core, `stroke="${INK}" stroke-width="1.1"`); sec += `<text transform="translate(${(X(c.x + c.w / 2) + 4).toFixed(1)} ${((Y(q.top) + Y(c.z0)) / 2).toFixed(1)}) rotate(-90)" ${MONO} font-size="11.5" font-weight="600" fill="${INK}" text-anchor="middle">${esc(c.name.toUpperCase())} · ${fmt(c.z0, 1)} to ${fmt(q.top, 1)} m</text>`;
      if (!q.reaches) sec += line([X(c.x) - 6, Y(q.top)], [X(c.x + c.w) + 6, Y(q.top)], `stroke="${RED}" stroke-width="1.4"`); });
    sec += line([X(-6), Y(0)], [X(s0.w + 6), Y(0)], `stroke="${INK}" stroke-width="1.4"`) + txt(X(-6), Y(0) - 4, 'GRADE', `${MONO} font-size="11.5" fill="${INK}"`) + txt(x0, 18, 'SECTION LOOKING NORTH · CORES THROUGH THE MASSES', `${MONO} font-size="11.5" fill="${MUTED}" letter-spacing=".05em"`) + scaleBar(X(0), H - 22, k);
    return svgWrap(W, H, pl + sec + line([520, 30], [520, H - 10], `stroke="${INK}" stroke-opacity=".25" stroke-width=".6"`), 'Cores: position, size and extent');
  }
  /* ---------- fire separations between occupancies: which blocks touch, through what, and the rating Table 3.1.3.1 asks for ---------- */
  function sepPairs(A) {
    const solid = A.p.blocks.filter((b) => !b.hidden && b.use !== 'core' && b.len == null), out = [], T = 0.1;
    for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) { const a = solid[i], b = solid[j], fs = Rules.fireSeparation(a, b); if (fs.rel === 'apart') continue;
      const ix = Math.max(a.x, b.x), ix1 = Math.min(a.x + a.w, b.x + b.w), iy = Math.max(a.y, b.y), iy1 = Math.min(a.y + a.d, b.y + b.d), iz = Math.max(a.z0, b.z0), iz1 = Math.min(Model.blockTop(a), Model.blockTop(b));
      let J = null; if (fs.rel === 'floor') { if (ix1 - ix > 0.2 && iy1 - iy > 0.2) J = { kind: 'floor', z: Math.abs(a.z0 - Model.blockTop(b)) < T ? a.z0 : b.z0, ix, ix1, iy, iy1 }; }
      else { const xs = Math.abs(a.x + a.w - b.x) < T ? b.x : Math.abs(b.x + b.w - a.x) < T ? a.x : null, ys = Math.abs(a.y + a.d - b.y) < T ? b.y : Math.abs(b.y + b.d - a.y) < T ? a.y : null; if (xs != null && iy1 - iy > 0.2 && iz1 - iz > 0.2) J = { kind: 'wallx', x: xs, iy, iy1, iz, iz1 }; else if (ys != null && ix1 - ix > 0.2 && iz1 - iz > 0.2) J = { kind: 'wally', y: ys, ix, ix1, iz, iz1 }; }
      out.push({ a, b, fs, J }); }
    const sel = app && app.selected ? app.selected() : null, pairId = app && app.state ? app.state.pair : null;
    for (const q of out) q.selected = !!(sel && pairId && ((q.a.id === sel.id && q.b.id === pairId) || (q.b.id === sel.id && q.a.id === pairId)));
    return out.sort((p, q) => (q.selected - p.selected) || ((q.fs.hours || 0) - (p.fs.hours || 0)));
  }
  const ratingOf = (fs) => (fs.kind === 'core' ? 'n/a' : fs.hours == null ? 'not in table' : fs.hours === 0 ? 'none required' : `${fs.hours} h`);
  function figFireSep(A, pairs) {
    const { p, top } = A, bl = p.blocks.filter((b) => !b.hidden && b.use !== 'core'), s0 = p.site, W = 1000, H = 460;
    /* left: section looking north (x across, z up); right: plan of the footprints with the shared walls */
    const zMin = Math.min(0, ...bl.map((b) => b.z0)), zMax = Math.max(top, 10) + 4, x0 = 50, x1 = 470, k = Math.min((x1 - x0) / s0.w, (H - 80) / (zMax - zMin)), X = (x) => x0 + x * k, Y = (z) => H - 40 - (z - zMin) * k;
    let s = `<rect x="${X(-4)}" y="${Y(0)}" width="${(s0.w + 8) * k}" height="${(0 - zMin) * k + 6}" fill="${GROUND}"/>`;
    for (const b of bl.slice().sort((a, c) => c.y - a.y)) { const d = `M${X(b.x).toFixed(1)} ${Y(b.z0 + hOf(b)).toFixed(1)}H${X(b.x + b.w).toFixed(1)}V${Y(b.z0).toFixed(1)}H${X(b.x).toFixed(1)}Z`; s += Model.blockTop(b) <= 0.01 ? `<path d="${d}" fill="${GROUND}" stroke="${MUTED}" stroke-width=".6" stroke-dasharray="3 2"/>` : `<path d="${d}" fill="${mix(USE_HEX[b.use], '#ffffff', 0.35)}" stroke="${USE_LINE[b.use]}" stroke-width=".8"/>`; }
    s += line([X(-6), Y(0)], [X(s0.w + 6), Y(0)], `stroke="${INK}" stroke-width="1.4"`);
    const placed = []; const lab = (x, y, t, sel) => { const w = t.length * 7.2 + 8, h = 15; let bx = x - w / 2, by = y - 11; const hits = (o) => bx < o.x + o.w + 2 && o.x < bx + w + 2 && by < o.y + o.h + 2 && o.y < by + h + 2; for (let i = 0; i < 12 && placed.some(hits); i++) by -= h + 3; placed.push({ x: bx, y: by, w, h });
      return `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${w.toFixed(1)}" height="${h}" fill="${sel ? RED : PAPER}" stroke="${RED}" stroke-width=".7"/>` + txt(x, by + 11, t, `${MONO} font-size="11.5" fill="${sel ? PAPER : RED}" text-anchor="middle"`); };
    let n = 0; const marks = [];
    for (const q of pairs) { if (!q.J) continue; n++; const t = q.selected ? `${n} · ${ratingOf(q.fs)}` : `${n}`; marks.push({ n, q });
      if (q.J.kind === 'floor') { s += line([X(q.J.ix), Y(q.J.z)], [X(q.J.ix1), Y(q.J.z)], `stroke="${RED}" stroke-width="${q.selected ? 4 : 2.6}"`) + lab((X(q.J.ix) + X(q.J.ix1)) / 2, Y(q.J.z) - 6, t, q.selected); }
      else if (q.J.kind === 'wallx') { s += line([X(q.J.x), Y(q.J.iz)], [X(q.J.x), Y(q.J.iz1)], `stroke="${RED}" stroke-width="${q.selected ? 4 : 2.6}"`) + lab(X(q.J.x), (Y(q.J.iz) + Y(q.J.iz1)) / 2, t, q.selected); } }
    s += txt(x0, 18, 'SECTION LOOKING NORTH', `${MONO} font-size="12.6" fill="${MUTED}" letter-spacing=".06em"`) + scaleBar(X(0), H - 22, k);
    /* plan */
    const px0 = 540, pw = 440, kp = Math.min(pw / (s0.w + 8), (H - 80) / (s0.d + 8)), PX = (x) => px0 + (x + 4) * kp, PY = (y) => H - 40 - (y + 4) * kp;
    let pl = `<path d="${pathOf(sitePoly(s0).map((q) => [PX(q[0]), PY(q[1])]))}" fill="${GROUND}" stroke="${INK}" stroke-width=".9" stroke-dasharray="6 2 1 2"/>`;
    for (const b of bl.filter((b) => Model.blockTop(b) > 0.01).sort((a, c) => a.z0 - c.z0)) pl += `<path d="M${PX(b.x).toFixed(1)} ${PY(b.y + b.d).toFixed(1)}h${(b.w * kp).toFixed(1)}v${(b.d * kp).toFixed(1)}h${(-b.w * kp).toFixed(1)}Z" fill="${mix(USE_HEX[b.use], '#ffffff', 0.35)}" fill-opacity=".85" stroke="${USE_LINE[b.use]}" stroke-width=".8"/>`;
    placed.length = 0; for (const m of marks) { const q = m.q, t = q.selected ? `${m.n} · ${ratingOf(q.fs)}` : `${m.n}`; if (q.J.kind === 'wallx') pl += line([PX(q.J.x), PY(q.J.iy)], [PX(q.J.x), PY(q.J.iy1)], `stroke="${RED}" stroke-width="${q.selected ? 4 : 2.6}"`) + lab(PX(q.J.x), (PY(q.J.iy) + PY(q.J.iy1)) / 2 + 4, t, q.selected);
      else if (q.J.kind === 'wally') pl += line([PX(q.J.ix), PY(q.J.y)], [PX(q.J.ix1), PY(q.J.y)], `stroke="${RED}" stroke-width="${q.selected ? 4 : 2.6}"`) + lab((PX(q.J.ix) + PX(q.J.ix1)) / 2, PY(q.J.y) - 6, t, q.selected);
      else pl += `<path d="M${PX(q.J.ix).toFixed(1)} ${PY(q.J.iy1).toFixed(1)}h${((q.J.ix1 - q.J.ix) * kp).toFixed(1)}v${((q.J.iy1 - q.J.iy) * kp).toFixed(1)}h${(-(q.J.ix1 - q.J.ix) * kp).toFixed(1)}Z" fill="url(#p-red)" fill-opacity=".5" stroke="${RED}" stroke-width="${q.selected ? 1.6 : .8}" stroke-dasharray="4 2"/>` + lab((PX(q.J.ix) + PX(q.J.ix1)) / 2, (PY(q.J.iy) + PY(q.J.iy1)) / 2 + 4, t, q.selected); }
    pl += txt(px0, 18, 'PLAN · FOOTPRINTS ABOVE GRADE', `${MONO} font-size="12.6" fill="${MUTED}" letter-spacing=".06em"`) + txt(px0 + pw, 18, 'N ↑', `${MONO} font-size="12.6" fill="${MUTED}" text-anchor="end"`) + scaleBar(PX(0), H - 22, kp);
    return svgWrap(W, H, s + pl + line([505, 30], [505, H - 10], `stroke="${INK}" stroke-opacity=".25" stroke-width=".6"`), 'Fire separations between occupancies');
  }
  function figMove(A, m) {
    const d = m.diagram; if (!d) return '';
    if (d.type === 'plan') { const P = d.level && A.plans[d.level.key]; if (!P) return ''; const pl = planSVG(P, { x: 0, y: 0, w: 300, h: 210 }, { ids: new Set((d.row && d.row.rooms) || []), name: P.metrics && P.metrics.maxTravelRoom ? P.metrics.maxTravelRoom.name : null }); return svgWrap(300, 210, pl.svg, 'Plan of the storey with failing exits'); }
    if (d.type === 'program') { const W = 300, H = 170; let s = ''; const bar = (y, parts, lab) => { let x = 10; for (const [u, w, hatch] of parts) { s += usePaint(u, `M${x} ${y}h${w}v26h${-w}Z`, USE_HEX[u], `stroke="${INK}" stroke-width=".6"`) + (hatch ? `<path d="M${x} ${y}h${w}v26h${-w}Z" fill="url(#p-red)" stroke="${RED}" stroke-width="1"/>` : ''); x += w; } s += txt(10, y - 6, lab, `${MONO} font-size="12.6" fill="${MUTED}"`); }; bar(30, [['parking', 230, false], ['core', 50, false]], 'PARKING LEVEL · NOW'); bar(110, [['parking', 170, false], ['amenity', 60, true], ['core', 50, false]], 'SUGGESTED · BIKE + LOADING'); s += line([150, 62], [150, 98], `stroke="${RED}" stroke-width="1" marker-end="url(#ar)"`); return svgWrap(W, H, s, 'Program redistribution diagram (indicative)'); }
    const t = A.p.blocks.find((b) => b.id === d.id); if (!t) return '';
    const solo = { site: A.p.site, blocks: [t], ramps: [] }, box = { x: 0, y: 0, w: 300, h: 230 };
    if (d.type === 'storeys') { const kept = Object.assign({}, t, { floors: t.floors - d.n }), cut = Object.assign({}, t, { z0: t.z0 + (t.floors - d.n) * t.f2f, floors: d.n }), pts = corners(boxesOf([t])[0]);
      const ax = axo({ site: A.p.site, blocks: [kept], ramps: [] }, { box, ctx: null, streets: false, north: false, extraPts: pts, pad: 14, overlay: (P) => { const q = boxesOf([cut])[0], c = corners(q).map((v) => P(...v)), E = [[4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [3, 7], [2, 6]]; const top = [c[4], c[5], c[6], c[7]], south = [c[0], c[1], c[5], c[4]], west = [c[0], c[3], c[7], c[4]]; const a = P(t.x + t.w / 2, t.y + t.d / 2, Model.blockTop(t) + 4), b = P(t.x + t.w / 2, t.y + t.d / 2, Model.blockTop(kept) + 1); return [south, west, top].map((f) => `<path d="${pathOf(f)}" fill="url(#p-red)" stroke="${RED}" stroke-width=".8" stroke-dasharray="3 2"/>`).join('') + line(a, b, `stroke="${RED}" stroke-width="1.4" marker-end="url(#ar)"`) + txt(a[0] + 16, a[1] + 4, `−${d.n} storeys`, `${MONO} font-size="14.0" fill="${RED}"`); } });
      return svgWrap(300, 230, ax.svg, 'Diagram: remove the top storeys'); }
    if (d.type === 'narrow') { const ax = axo(solo, { box, ctx: null, streets: false, north: false, pad: 14, overlay: (P) => { const z0 = t.z0, z1 = t.z0 + hOf(t), face = [P(t.x, t.y, z0), P(t.x, t.y + t.d, z0), P(t.x, t.y + t.d, z1), P(t.x, t.y, z1)], nx = t.x + d.dw, nf = [P(nx, t.y, z0), P(nx, t.y + t.d, z0), P(nx, t.y + t.d, z1), P(nx, t.y, z1)], mz = (z0 + z1) / 2, a = P(t.x - 4, t.y + t.d / 2, mz), b = P(t.x + d.dw + 1, t.y + t.d / 2, mz); return `<path d="${pathOf(face)}" fill="url(#p-red)" stroke="${RED}" stroke-width="1.3"/><path d="${pathOf(nf)}" fill="none" stroke="${RED}" stroke-width=".8" stroke-dasharray="3 2"/>` + line(a, b, `stroke="${RED}" stroke-width="1.4" marker-end="url(#ar)"`) + txt(a[0] - 4, a[1] - 8, `−${fmt(d.dw, 2)} m`, `${MONO} font-size="14.0" fill="${RED}" text-anchor="end"`); } });
      return svgWrap(300, 230, ax.svg, 'Diagram: move the west face inward'); }
    return '';
  }
  function figPair(vA, vB) {
    const pA = { site: vA.site, blocks: vA.blocks, ramps: vA.ramps || [] }, pB = { site: vB.site, blocks: vB.blocks, ramps: vB.ramps || [] }, pr = proj(), W = 1000, H = 440;
    const pts = [pA, pB].flatMap((q) => boxesOf(q.blocks).flatMap(corners).concat(sitePoly(q.site).map((p) => [p[0], p[1], 0]))), rb = rawBounds(pr, pts), bA = { x: 0, y: 30, w: 480, h: H - 40 }, bB = { x: 520, y: 30, w: 480, h: H - 40 }, fit = fitTo(pr, rb, bA, 18), fitB = fitTo(pr, rb, bB, 18);
    const changed = new Set(vB.blocks.filter((b) => { const o = vA.blocks.find((x) => x.id === b.id); return !o || ['x', 'y', 'w', 'd', 'z0', 'floors', 'f2f', 'use'].some((k) => o[k] !== b[k]); }).map((b) => b.id));
    const a = axo(pA, { pr, box: bA, fit, ctx: null, streets: false, noCores: true }), b = axo(pB, { pr, box: bB, fit: fitB, ctx: null, streets: false, outlineIds: changed, noCores: true });
    return svgWrap(W, H, a.svg + b.svg + txt(0, 16, `A · ${vA.name}`, `${MONO} font-size="14.7" fill="${INK}" letter-spacing=".06em"`) + txt(520, 16, `B · ${vB.name}`, `${MONO} font-size="14.7" fill="${INK}" letter-spacing=".06em"`) + line([500, 30], [500, H - 10], `stroke="${INK}" stroke-opacity=".25" stroke-width=".6"`), 'Matched axonometrics of two saved versions');
  }

  /* ---------- text ---------- */
  function synopsis(A, F) {
    const { p, T, dn, D, tower, below, massing } = A, above = T.gfaAbove || 1, share = (u) => Math.round((T.gfa[u] || 0) / above * 100);
    const podium = massing.filter((b) => Model.blockTop(b) <= 18.5), pUses = [...new Set(podium.map((b) => USE_LABEL[b.use].toLowerCase()))], pTop = podium.length ? Math.max(...podium.map((b) => Model.blockTop(b))) : 0;
    const fd = tower && window.Form && Form.active(tower) ? Form.describe(tower).toLowerCase() : '', t = tower ? `A ${tower.floors}-storey ${USE_LABEL[tower.use].toLowerCase()} tower${fd ? ` (${fd})` : ''}, ${fmt(tower.w, 1)} × ${fmt(tower.d, 1)} m at its base, rises to ${fmt(Model.blockTop(tower), 1)} m` : 'The massing has no tower above 18 m';
    const pod = podium.length ? ` from a ${fmt(pTop, 1)} m podium of ${pUses.join(', ').replace(/, ([^,]*)$/, ' and $1')}` : '';
    const bg = below.length ? `, with ${plural(T.storeysBelow, 'level')} of ${[...new Set(below.map((b) => USE_LABEL[b.use].toLowerCase()))].join(' and ')} below grade` : '';
    const mixS = Model.USES.filter((u) => u !== 'core' && u !== 'parking' && T.gfa[u] > 0).sort((a, b) => T.gfa[b] - T.gfa[a]).map((u) => `${USE_LABEL[u].toLowerCase()} ${share(u)}%`).join(', ');
    const inten = D.fsr != null ? `At FSR ${fmt(dn.fsr, 2)} the scheme is ${dn.fsr > D.fsr ? `${fmt(dn.fsr / D.fsr, 1)} times the ${fmt(D.fsr, 2)} permitted` : `within the ${fmt(D.fsr, 2)} permitted`} on a ${m2(dn.siteArea)} lot.` : `The scheme reaches FSR ${fmt(dn.fsr, 2)}; the ODP sets no total figure for this area.`;
    const lead = F[0] ? `The most consequential finding: ${F[0].title.charAt(0).toLowerCase() + F[0].title.slice(1)}. ${F[0].implication}` : 'No check fails on the current inputs.';
    const B = window.Brief && p.brief ? Brief.areas(p, T) : null; const briefS = B ? ` The brief asked for ${m2(B.gfaTarget)}; the proposal carries ${m2(B.actualTotal)} above grade${(() => { const off = Brief.USES.filter((u) => B.by[u] && Math.abs(B.by[u].actualPct - B.by[u].pct) >= 3); return off.length ? `, with ${off.map((u) => `${USE_LABEL[u].toLowerCase()} at ${Math.round(B.by[u].actualPct)}% against ${Math.round(B.by[u].pct)}%`).join(', ')}` : ', within three points of every program share'; })()}.${p.param && p.param.mode === 'gen' && window.Gen && Gen.TYPES[p.param.key] ? ` Typology: ${Gen.TYPES[p.param.key].name}.` : ''}` : '';
    return [`${t}${pod}${bg}.`, `Above grade the floor area divides into ${mixS || 'no programme yet'}.${briefS} ${inten}`, lead];
  }

  /* ---------- document ---------- */
  const CSS = `@page{size:A4 landscape;margin:11mm}
  :root{--ink:#262626;--muted:#6e6d68;--line:#e4e2dc;--red:#CF4F58;--red2:#C2434C;--paper:#fff;--ground:#f4f3ee;color-scheme:light}
  *{box-sizing:border-box}html{background:var(--ground)}body{margin:0;padding:24px 16px;background:var(--ground);color:var(--ink);font:13.5px/1.6 Inter,system-ui,sans-serif}
  .sheet{background:var(--paper);max-width:1123px;margin:0 auto 24px;padding:32px 44px 38px;border:1px solid var(--line);border-radius:6px}
  .runhead{display:flex;flex-wrap:wrap;gap:6px 22px;font:500 10px/1.3 'IBM Plex Mono',ui-monospace,monospace;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;border-bottom:1px solid var(--line);padding-bottom:8px;margin-bottom:24px}.runhead .sp{flex:1}.runhead b{color:var(--ink);font-weight:500}
  .sectno{font:500 10.5px 'IBM Plex Mono',monospace;color:var(--red);letter-spacing:.1em;text-transform:uppercase;margin:0 0 4px}
  h1{font:600 30px/1.12 Inter,system-ui,sans-serif;margin:0 0 6px;letter-spacing:-.01em;text-wrap:balance}h2{font:600 21px/1.2 Inter,system-ui,sans-serif;margin:0 0 14px;text-wrap:balance}h3{font:600 14px/1.3 Inter,system-ui,sans-serif;margin:0 0 6px}
  p{margin:0 0 10px;max-width:68ch}.lede{font-size:15.5px;line-height:1.55}
  .grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:0 30px}.c3{grid-column:span 3}.c4{grid-column:span 4}.c5{grid-column:span 5}.c6{grid-column:span 6}.c7{grid-column:span 7}.c8{grid-column:span 8}.c9{grid-column:span 9}.c12{grid-column:1/-1}
  .sans,figcaption,.meta,table{font-family:Inter,system-ui,sans-serif}.mono,.num{font-family:'IBM Plex Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums}
  figure{margin:0 0 18px;break-inside:avoid}.fig{display:grid;grid-template-columns:minmax(0,1fr) 190px;gap:22px;align-items:start}.fig.stack{grid-template-columns:1fr}
  .fignum{font:500 10.5px 'IBM Plex Mono',monospace;color:var(--red);letter-spacing:.1em;margin-bottom:4px}figcaption{font-size:12px;line-height:1.5;color:var(--muted);border-top:1px solid var(--line);padding-top:7px}figcaption b{color:var(--ink);font-weight:600}
  figure svg{display:block;width:100%;height:auto}.explain{display:inline-block;font:500 10px 'IBM Plex Mono',monospace;color:var(--red);border:1px solid var(--red);padding:1px 6px;letter-spacing:.06em;margin-top:6px}
  .hl{width:100%;border-collapse:collapse;margin:12px 0 0;font-size:12.5px}.hl td{padding:6px 0;border-top:1px solid var(--line);vertical-align:baseline}.hl td:last-child{text-align:right;font-family:'IBM Plex Mono',monospace}.hl tr:first-child td{border-top:1px solid #d9d6cf}
  .finding{display:grid;grid-template-columns:36px minmax(0,1fr);gap:0 14px;padding:14px 0;border-top:1px solid var(--line);break-inside:avoid}.finding:first-of-type{border-top:1px solid #d9d6cf}
  .mk{width:26px;height:26px;border-radius:50%;background:var(--red2);color:#fff;display:grid;place-items:center;font:600 12px 'IBM Plex Mono',monospace}
  .oei{display:grid;grid-template-columns:120px minmax(0,1fr);gap:4px 14px;margin:8px 0 0}.oei dt{font:500 10px 'IBM Plex Mono',monospace;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);padding-top:3px}.oei dd{margin:0}
  .st{font:600 11px Inter,sans-serif;display:inline-flex;gap:5px;align-items:center;white-space:nowrap}.st b{display:inline-grid;place-items:center;width:15px;height:15px;border:1px solid currentColor;border-radius:50%;font-size:9px}.st-fail{color:#a3202a}.st-review,.st-verify{color:#8a5a00}.st-pass{color:#2b6b45}.st-info{color:var(--muted)}
  .cgroup{break-inside:avoid;margin:0 0 18px}.cgroup h3{display:flex;justify-content:space-between;border-bottom:1px solid #d9d6cf;padding-bottom:5px}.cgroup h3 small{font:500 10.5px 'IBM Plex Mono',monospace;color:var(--muted)}
  .crow{padding:8px 0;border-bottom:1px solid var(--line);font-family:Inter,sans-serif;font-size:12.5px;break-inside:avoid}.crow .ch{display:flex;flex-wrap:wrap;gap:2px 10px;align-items:baseline}.crow .w{color:var(--muted);font-size:11.5px}.crow .v{font-size:12px;color:#45443f;margin-top:2px}.crow .arr{color:var(--muted)}
  .move{display:grid;grid-template-columns:34px minmax(0,1fr) 250px;gap:0 18px;padding:16px 0;border-top:1px solid var(--line);break-inside:avoid}.move:first-of-type{border-top:1px solid #d9d6cf}.rank{font:600 20px 'IBM Plex Mono',monospace;color:var(--red)}
  .tag{display:inline-block;font:500 10px 'IBM Plex Mono',monospace;letter-spacing:.06em;text-transform:uppercase;padding:1px 6px;border:1px solid currentColor;margin-left:8px;vertical-align:2px}.tag.t{color:#2b6b45}.tag.u{color:#8a5a00}.tag.s{color:var(--muted)}
  table.data{width:100%;border-collapse:collapse;font-size:11.5px;margin:0 0 18px}table.data th{text-align:left;font:500 9.5px 'IBM Plex Mono',monospace;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);border-bottom:1px solid #d9d6cf;padding:5px 8px 5px 0}table.data td{border-bottom:1px solid var(--line);padding:3px 8px 3px 0;vertical-align:top;line-height:1.35}table.data tr.grp td{font:600 11px Inter,sans-serif;padding-top:12px;border-bottom:1px solid #d9d6cf}table.data td.n{font-family:'IBM Plex Mono',monospace;text-align:right;white-space:nowrap}
  table.ds td:first-child{width:30%;font-weight:600;font-family:Inter,sans-serif}table.ds td{font-size:12px;padding:6px 10px 6px 0;line-height:1.4}table.ds td.src{width:22%;color:var(--muted);font:11px 'IBM Plex Mono',monospace}table.ds .muted{color:var(--muted)}
  .legendrow{display:flex;flex-wrap:wrap;gap:4px 16px;font:11.5px Inter,sans-serif;margin:8px 0 0}.legendrow span{display:inline-flex;gap:6px;align-items:center}.legendrow svg{width:14px;height:10px}
  a.cite{color:var(--red2);text-decoration:underline dotted;text-underline-offset:2px}a.cite:hover{text-decoration-style:solid}
  .note{font:12px Inter,sans-serif;color:var(--muted)}ul.src{font:12px/1.5 Inter,sans-serif;padding-left:18px}
  @media print{html,body{background:#fff;padding:0}body{font-size:11.5px}.sheet{border:0;margin:0;padding:0;max-width:none;break-after:page;zoom:.74}.sheet:last-child{break-after:auto}h2,h3{break-after:avoid}figure svg{max-height:150mm;width:100%}.finding,.move,.crow,tr{break-inside:avoid}}
  @media (max-width:820px){.grid>*{grid-column:1/-1!important}.fig{grid-template-columns:1fr}.move{grid-template-columns:28px minmax(0,1fr)}.move .md{grid-column:2}.sheet{padding:20px 16px}.oei{grid-template-columns:1fr}.crow{grid-template-columns:1fr}}`;
  function legend(uses) { return `<div class="legendrow">${uses.map((u) => `<span><svg viewBox="0 0 14 10"><rect width="14" height="10" fill="${USE_HEX[u]}" stroke="${USE_LINE[u]}" stroke-width="1.2"/>${PAT[u] ? `<rect width="14" height="10" fill="url(#p-${u})"/>` : ''}</svg>${USE_LABEL[u]}</span>`).join('')}<span><svg viewBox="0 0 14 10"><rect width="14" height="10" fill="url(#p-red)" stroke="${RED}"/></svg>Issue location or proposed change</span><span><svg viewBox="0 0 14 10"><path d="M0 5h14" stroke="${CTXE}" stroke-dasharray="3 2"/></svg>Below grade (hidden)</span></div>`; }

  /* ---------- sheet 00: the project data sheet (civic address, code, occupancy, areas, parking, zoning, setbacks, height) ---------- */
  function dataSheet(A) {
    const p = A.p, s = A.s, T = A.T, dn = A.dn, need = A.mp._parkNeed || Rules.parkingNeed(A.mp), ft = (m) => fmt(m * 3.28084, 1) + ' ft';
    const row = (k, v, src) => `<tr><td>${esc(k)}</td><td>${v}</td><td class="src">${window.Cite ? Cite.html(src || '') : esc(src || '')}</td></tr>`;
    const tbl = (rows) => `<table class="data ds"><tbody>${rows.join('')}</tbody></table>`;
    const num = (txt, re, d = 0) => { const m = String(txt || '').match(re); return m ? Number(m[1]) : d; };
    const parcel = s.parcelIndex != null, P = (k) => ({ confirmed: 'City data', derived: 'Derived from City data', assumption: 'Assumption', verify: 'Needs verification' }[A.prov(k)] || '');
    // occupancies present, major occupancy by floor area
    const present = Model.USES.filter((u) => u !== 'core' && T.gfa[u] > 0), groups = [...new Set(present.map((u) => CODES.occupancy[u].group))];
    const major = present.slice().sort((a, b) => T.gfa[b] - T.gfa[a])[0];
    const occText = groups.map((g) => `Group ${g} (${present.filter((u) => CODES.occupancy[u].group === g).map((u) => USE_LABEL[u].toLowerCase()).join(', ')})`).join('; ');
    const cons = A.byId('construction');
    // streets: edges of kind street, or the corner flag on a box site
    const edges = Rules.siteEdges ? Rules.siteEdges(s) : [], streets = s.edges ? edges.filter((e) => e.kind === 'street') : [], nStreets = s.edges ? Math.max(1, streets.length) : (s.corner ? 2 : 1);
    const streetNames = (s.streets || []).map((x) => x.replace(/^\d+(-\d+)? /, ''));
    const siteArea = s.area || s.w * s.d, cover = Math.min(100, T.footprint / siteArea * 100), nonRes = T.gfa.office + T.gfa.retail + T.gfa.restaurant;
    const pk = A.byId('pk-count'), acc = A.byId('pk-acc'), bike = A.byId('pk-bike'), load = A.byId('pk-load'), ev = A.byId('pk-ev');
    const stalls = A.stalls, accProv = acc ? num(acc.value, /(\d+)/) : 0, accReq = acc ? num(acc.limit, /at least (\d+)/) : 0, bikeProv = bike ? num(bike.value, /(\d+)/) : 0, loadProv = load ? num(load.value, /(\d+)/) : 0;
    // setbacks from the guideline set, by edge role
    const set = (CODES.odp.guidelineSetbacks || {})[s.setbackSet || 'none'], sb = (kind) => { if (!set || !set.rules.length) return 'no zoning yard · design review'; const rs = set.rules.filter((q) => q.edge === kind); return rs.length ? rs.map((q) => q.buildTo ? 'build-to line (0 m)' : `${fmt(q.d, 1)} m${q.above > 0 ? ` above ${fmt(q.above, 1)} m` : ''}`).join(' · ') : 'none stated'; };
    const extSide = nStreets > 1 ? sb('street') : 'n/a (not a corner lot)';
    const H = CODES.odp.height[s.heightArea] || {}, D = A.D;
    const zoning = `${esc(s.zone || '—')}${s.dd && s.zone !== 'DD' ? ' · Downtown District (DD)' : s.dd ? ' · Downtown District' : ''} · ODP density area ${esc(s.densityArea || '—')} (FSR ${D.fsr != null ? fmt(D.fsr, 2) : '—'}${D.dwell === false ? ', no new homes' : ''}${D.resCap ? `, residential up to ${fmt(D.resCap, 2)}` : ''}) · height area ${esc(s.heightArea || '—')} (${H.planes ? 'height planes' : H.basic ? fmt(H.basic, 1) + ' m basic' : '—'}${H.max ? `, Board may allow ${fmt(H.max, 1)} m` : ''})${s.viewConeH != null ? ` · view cone cap ${fmt(s.viewConeH, 1)} m` : (s.viewCones || []).length ? ` · view cones ${esc(s.viewCones.join(', '))} cross the lot` : ''} · ground-floor retail (Map 2): ${{ perm: 'permitted', req: 'required, continuous', some: 'some required', proh: 'prohibited' }[s.retailMap2 || 'perm']}`;
    const left = tbl([
      row('Civic address', `${esc(s.addr || 'Custom site box')}${streetNames.length ? `<br><span class="muted">${esc(streetNames.join(' and '))}</span>` : ''}`, parcel ? 'City data' : 'Assumption'),
      row('Applicable building code and part', `${esc(CODES.meta.vbbl)}; Division B <b>Part 3</b> (buildings over 600 m² or 3 storeys)${cons ? `<br><span class="muted">Construction article ${esc(cons.limit)}</span>` : ''}<br><span class="muted">${esc(CODES.meta.bcbc)}</span>`, 'VBBL 2025'),
      row('Energy compliance requirements', `${esc(CODES.energy.clause)}<br><span class="muted">${esc(CODES.energy.text)}</span>`, 'Needs verification'),
      row('Occupancy classification', `${occText || '—'}${major ? `<br><span class="muted">Major occupancy by floor area: Group ${CODES.occupancy[major].group}, ${USE_LABEL[major].toLowerCase()}</span>` : ''}`, 'VBBL 3.1.2, Table 3.1.17.1'),
      row('Number of streets facing the building', `${nStreets}${streetNames.length ? ` · ${esc(streetNames.join(', '))}` : ''}${s.corner ? ' · corner lot' : ''}`, parcel ? 'Derived from City data' : 'Assumption'),
      row('Gross site area', `${m2(siteArea)}`, parcel ? 'City data' : 'Assumption'),
      row('Gross floor area (GFA)', `${m2(T.gfaAbove + T.gfaBelow)} total · ${m2(T.gfaAbove)} above grade · ${m2(T.gfaBelow)} below grade`, 'Model'),
      row('Floor area used for parking calculations', `Non-residential ${m2(nonRes)} (office, retail, restaurant) · ${need.units} homes (estimate from the plans)`, 'Parking By-law 4.2.5; plans'),
      row('Proposed building footprint area', `${m2(T.footprint)}`, 'Model, ground floor'),
      row('Site coverage', `${fmt(cover, 1)}%`, 'Footprint ÷ site area'),
      row('Program brief', (() => { const B = window.Brief && p.brief ? Brief.areas(p, T) : null; if (!B) return '—'; return `${m2(B.gfaTarget)} target · ${m2(B.actualTotal)} drawn above grade<br><span class="muted">${Brief.USES.filter((u) => B.by[u].pct || B.by[u].actual).map((u) => `${USE_LABEL[u]} ${fmt(B.by[u].pct, 0)}% → ${fmt(B.by[u].actualPct, 0)}%`).join(' · ')}</span>`; })(), 'Brief tab (design target)'),
      row('Floor area ratio (FSR)', `${fmt(dn.fsr, 2)} proposed${D.fsr != null ? ` · ${fmt(D.fsr, 2)} permitted` : ''} · ${m2(dn.fsrFA)} counted`, `ODP §3(1) · ${P('densityArea')}`),
    ]);
    const right = tbl([
      row('Vehicle parking required', pk ? esc(pk.limit) : 'no minimum downtown', 'Parking By-law 6059 §4.1.1, 4.2.5'),
      row('Vehicle parking provided', `${stalls} stalls${acc ? ` · ${accProv} accessible (${accReq} required)` : ' · no accessible stalls counted'}`, 'Generated parking plans'),
      row('EV charging required', ev ? `${esc(ev.limit)} (${stalls} stalls)` : stalls ? 'residential stalls: every space energized' : 'no stalls', 'Parking By-law §4.11.1'),
      row('Bicycle parking', `Class A (I) required ${need.bikeA} · provided ${bikeProv}<br>Class B (II) required ${need.bikeB} · racks outside, not modelled`, 'Parking By-law §6.2'),
      row('Loading provisions', `Class A required ${need.loadingA} · Class B required ${need.loadingB} · provided ${loadProv}`, 'Parking By-law §5.2'),
      row('Zoning information', zoning, `${P('densityArea')} · height ${P('heightArea')}`),
      row('Required setbacks', `Front ${sb('street')}<br>Exterior side ${extSide}<br>Interior side ${sb('side')}<br>Rear ${sb('lane')}${set && set.rules.length ? `<br><span class="muted">${esc(set.name)} · guideline figures applied through design review</span>` : ''}`, set && set.rules.length ? 'Downtown South Guidelines; Downtown Design Guidelines' : 'Downtown Design Guidelines'),
      row('Cores and exit stairs', esc(coreText(A)), '3.4.2.1.(1); 3.2.6.5'), row('Building height in storeys', `${T.storeysAbove} above grade${T.storeysBelow ? ` · ${T.storeysBelow} below` : ''}`, 'Model'),
      row('Roof height', `${fmt(T.maxZ, 1)} m · ${ft(T.maxZ)}${A.cap ? `<br><span class="muted">limit ${fmt(A.cap, 1)} m · ${ft(A.cap)}${A.env.max && A.env.basic && A.env.max !== A.env.basic ? ` (basic ${fmt(A.env.basic, 1)} m)` : ''}</span>` : ''}`, `ODP §4 Table 1 · ${P('heightArea')}`),
    ]);
    return `<div class="grid"><div class="c6">${left}</div><div class="c6">${right}</div></div><p class="note">Values come from the massing model and its generated plans; the source column says whether each input is City data, derived, your assumption or still to be verified. Setbacks are guideline figures, not zoning yards.</p>`;
  }
  function build() {
    const A = analyse(), F = findings(A), M = moves(A), p = A.p, now = new Date(), sig = window.Iterate ? Iterate.signature(p) : JSON.stringify(p.blocks);
    const version = A.st.state === 'saved' ? `Version · ${A.st.name}` : A.st.state === 'changed' ? `Working design · changed since ${A.st.name}` : 'Working design · not saved';
    const date = now.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }) + ' · ' + now.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' });
    let fig = 0, sheetN = 0; const nextFig = () => `FIG. ${String(++fig).padStart(2, '0')}`;
    const sheet = (no, title, body, id) => `<section class="sheet" id="${id}"><div class="runhead"><span>Downtown Massing Tool</span><b>${esc(p.name || 'Massing study')}</b><span>${esc(p.site.addr || 'Custom site')}</span><span>${esc(version)}</span><span class="sp"></span><span>${esc(date)}</span><span>Sheet ${String(++sheetN).padStart(2, '0')}</span></div><div class="sectno">${no}</div><h2>${esc(title)}</h2>${body}</section>`;
    const uses = Model.USES.filter((u) => p.blocks.some((b) => b.use === u && !b.hidden));
    const sy = synopsis(A, F), fail = A.raw.filter((r) => A.eff(r).key === 'fail').length, ver = A.raw.filter((r) => A.eff(r).key === 'verify').length;
    const sheets = [];
    sheets.push(sheet('00 · Project data', 'Project data sheet', dataSheet(A), 'datasheet'));
    const f1 = nextFig();
    sheets.push(sheet('01 · Design synopsis', p.name || 'Massing study', `<div class="grid"><div class="c4"><p class="meta mono" style="font-size:11px;color:var(--muted);margin-bottom:14px">${esc(p.site.addr || 'Custom site')} · ${esc(p.site.zone || '')}${p.site.dd ? ' · Downtown District' : ''}</p><p class="lede">${esc(sy[0])}</p><p>${esc(sy[1])}</p><p>${esc(sy[2])}</p>
      <table class="hl"><tr><td>Floor space ratio</td><td>${fmt(A.dn.fsr, 2)}${A.D.fsr != null ? ` / ${fmt(A.D.fsr, 2)}` : ''}</td></tr><tr><td>Height</td><td>${fmt(A.top, 1)} m${A.cap ? ` / ${fmt(A.cap, 1)} m` : ''}</td></tr><tr><td>Floor area above grade</td><td>${m2(A.T.gfaAbove)}</td></tr><tr><td>Counted for FSR</td><td>${m2(A.dn.fsrFA)}</td></tr><tr><td>Homes (estimate)</td><td>${fmt(A.homes, 0)}</td></tr><tr><td>Issues · needing verification</td><td>${fail} · ${ver}</td></tr></table></div>
      <div class="c8"><figure><div class="fignum">${f1}</div>${figAxoMain(A, F)}<figcaption><b>Axonometric from the south-west.</b> Proposal in occupancy colours over pale neighbouring buildings within 85 m. Numbered markers locate the key findings on the next sheet. Dash-dot line: property line. Dashed: below grade.${legend(uses)}</figcaption></figure></div></div>`, 'synopsis'));
    sheets.push(sheet('02 · Key findings', 'What the design achieves and what limits it', F.length ? `<div class="grid"><div class="c12">${F.map((f) => `<div class="finding"><div class="mk">${f.n}</div><div><h3>${esc(f.title)} &nbsp;${stTag(f.status)}</h3><dl class="oei"><dt>Observation</dt><dd>${esc(f.observation)}</dd><dt>Evidence</dt><dd>${esc(f.evidence)}</dd><dt>Design implication</dt><dd>${esc(f.implication)}</dd></dl></div></div>`).join('')}<p class="note" style="margin-top:10px">Markers match ${f1}. Findings are ranked by consequence: issues first, then results that rest on unconfirmed inputs.</p></div></div>` : '<p>No findings: the model has no measurable checks yet.</p>', 'findings'));
    const f2 = nextFig(), f3 = nextFig(), f4 = nextFig(), above = A.T.gfaAbove || 1;
    const shareText = (() => { const big = Model.USES.filter((u) => u !== 'core' && A.T.gfa[u] > 0 && u !== 'parking').sort((a, b) => A.T.gfa[b] - A.T.gfa[a]); if (!big.length) return ''; const top1 = big[0], pct = Math.round(A.T.gfa[top1] / above * 100), ground = A.levels.find((l) => l.label === 1); const gUses = ground ? ground.uses.filter((u) => u !== 'core').map((u) => USE_LABEL[u].toLowerCase()) : []; const cover = A.T.footprint / A.dn.siteArea * 100;
      return `${USE_LABEL[top1]} carries ${pct}% of the floor area above grade, so its rules (residential cap, unit mix, daylight) shape the scheme most. The ground floor, with ${gUses.join(', ').replace(/, ([^,]*)$/, ' and $1') || 'no programme'}, covers ${fmt(cover, 0)}% of the lot${A.tower ? `, while the tower plate covers ${fmt(A.per / A.dn.siteArea * 100, 0)}%` : ''}. ${A.below.length ? `Below grade, ${plural(A.T.storeysBelow, 'parking level')} hold ${plural(A.stalls, 'stall')}.` : ''}`; })();
    sheets.push(sheet('03 · Capacity and program', 'How much the site allows, and where the floor area sits', `<div class="grid"><div class="c8"><figure class="fig stack"><div class="fignum">${f2}</div>${figCapacity(A)}<figcaption><b>Proposed values against resolved limits.</b> Red hatch: amount over the limit. A dashed limit line marks a limit that still needs verification.</figcaption></figure></div>
      <div class="c4"><h3>Total versus counted floor area</h3><p>${m2(A.T.gfaAbove)} of floor area sits above grade, and ${m2(A.dn.fsrFA)} of it counts toward FSR. ${A.dn.amenEx > 0 ? `${m2(A.dn.amenEx)} of amenity is excluded (up to 20% of residential floor area). ` : ''}${A.dn.parkAbove > 0 ? `Above-grade parking of ${m2(A.dn.parkAbove)} counts at 70%. ` : ''}Below-grade floor area of ${m2(A.T.gfaBelow)} is not counted.</p>${A.excess != null ? `<p>${A.excess > 0 ? `Removing ${m2(A.excess)} of counted area would bring the scheme to the ${fmt(A.D.fsr, 2)} limit.` : `${m2(-A.excess)} of counted area remains before the ${fmt(A.D.fsr, 2)} limit.`}</p>` : ''}</div>
      <div class="c7"><figure class="fig stack"><div class="fignum">${f3}</div>${figStack(A)}<figcaption><b>Program stack by storey, drawn to height scale.</b> Bar length is floor area per storey; colours and patterns show the occupancy. Red lines are the height limits.${legend(uses.filter((u) => u !== 'core'))}</figcaption></figure></div>
      <div class="c5"><h3>What the proportions mean</h3><p>${esc(shareText)}</p><figure><div class="fignum">${f4}</div>${figExploded(A)}<figcaption><b>Program groups pulled apart.</b> Cores are omitted. <span class="explain">EXPLANATORY EXPLODED VIEW · THE MODEL IS UNCHANGED</span></figcaption></figure></div></div>`, 'capacity'));
    const MASS = /^(fsr|rescap|nonresmin|officemax|dwell|height|hbp|granville|viewcone|plate|towersep|solar|setback|daylight-)/;
    const rowsBy = (fn) => A.raw.filter(fn).map((r) => ({ r, d: Checks.describe(r, app), k: A.eff(r).key })).sort((a, b) => ({ fail: 0, verify: 1, review: 2 }[a.k] - { fail: 0, verify: 1, review: 2 }[b.k]));
    const gMass = rowsBy((r) => MASS.test(r.id) && ['fail', 'review'].includes(A.eff(r).key)), gLocal = rowsBy((r) => !MASS.test(r.id) && ['fail', 'review'].includes(A.eff(r).key) && r.group !== 'zoning' || (r.id === 'retailmap2' && A.eff(r).key === 'fail')), gVer = rowsBy((r) => A.eff(r).key === 'verify');
    const short = (t, n = 90) => { t = String(t || '—'); return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t; };
    const crow = (x) => `<div class="crow"><div class="ch">${stTag(x.k)}<b>${esc(x.d.name)}</b><span class="w">${esc(x.d.where)}</span></div><div class="v">${esc(short(x.d.current))}${x.d.required && x.d.required !== '—' ? ` <span class="arr">against</span> ${esc(short(x.d.required))}` : ''}</div></div>`;
    const listG = (g, max) => { const top = g.filter((x) => x.k !== 'review'), rv = g.filter((x) => x.k === 'review'), show = top.concat(rv).slice(0, max); return show.map(crow).join('') + (g.length > show.length ? `<p class="note">${g.length - show.length} more to review in Appendix A1.</p>` : ''); };
    const inputs = [['densityArea', 'ODP density area', `area ${A.s.densityArea}${A.prov('densityArea') === 'verify' ? ', to confirm on ODP Map 1' : ''}`], ['heightArea', 'ODP height area', `area ${A.s.heightArea}${A.prov('heightArea') === 'verify' ? ', guessed from the density area' : ''}`], ['viewCone', 'View cone height', A.s.viewConeH != null ? fmt(A.s.viewConeH, 1) + ' m' : (A.s.viewCones || []).length ? `cones ${A.s.viewCones.join(', ')} cross the lot` : 'none']].filter(([k]) => ['verify', 'assumption'].includes(A.prov(k)));
    const egF = F.find((f) => f.key === 'egress'), f5 = nextFig(), f6 = egF ? nextFig() : null;
    sheets.push(sheet('04 · Critical constraints', 'Which limits require a new massing, and which can be solved locally', `<div class="grid"><div class="c4"><div class="cgroup"><h3>Changes the overall massing <small>${gMass.length}</small></h3>${listG(gMass, 5) || '<p class="note">None.</p>'}</div></div><div class="c4"><div class="cgroup"><h3>Likely resolved locally <small>${gLocal.length}</small></h3>${listG(gLocal, 5) || '<p class="note">None.</p>'}</div></div><div class="c4"><div class="cgroup"><h3>Uncertain inputs, not failures <small>${gVer.length + inputs.length}</small></h3>${gVer.map(crow).join('')}${inputs.map(([k, l, v]) => `<div class="crow"><div><span class="st st-${A.prov(k) === 'verify' ? 'verify' : 'info'}"><b>${A.prov(k) === 'verify' ? '?' : 'i'}</b>${A.prov(k) === 'verify' ? 'Needs verification' : 'Assumed'}</span></div><div><b>${esc(l)}</b><div class="v">${esc(v)}</div></div></div>`).join('') || (gVer.length ? '' : '<p class="note">None.</p>')}</div></div>
      <div class="c${egF ? 6 : 12}"><figure class="fig stack"><div class="fignum">${f5}</div>${figElevation(A)}<figcaption><b>South elevation against the height limits, true scale.</b> Relates to markers ${F.filter((f) => f.key === 'height' || f.key === 'fsr').map((f) => f.n).join(' and ') || '—'} in ${f1}. Dashed outlines are below grade.</figcaption></figure></div>
      ${egF ? `<div class="c6"><figure class="fig stack"><div class="fignum">${f6}</div>${figPlanDetail(A, egF)}<figcaption><b>Detail A, enlarged from the key view.</b> Storey ${esc(egF.level.name)}: ${esc(egF.row.title)}, ${esc(egF.row.value)}${egF.row.limit && egF.row.limit !== '—' ? ` against ${esc(egF.row.limit)}` : ''}. Red hatch marks the affected room; red squares are exits. Marker ${egF.n} in ${f1}.</figcaption></figure></div>` : ''}</div>`, 'constraints'));
    const moveFigs = M.map((m) => { const s = figMove(A, m); return s ? { s, id: nextFig() } : null; });
    sheets.push(sheet('05 · Recommended design moves', 'What to change next, in order', M.length ? M.map((m, i) => `<div class="move"><div class="rank">${i + 1}</div><div><h3>${esc(m.title)}<span class="tag ${m.tested ? 't' : m.kind === 'verify' ? 's' : 'u'}">${m.tested ? 'Tested in the model' : m.kind === 'verify' ? 'Information needed' : 'Untested suggestion'}</span></h3><dl class="oei"><dt>Action</dt><dd>${esc(m.why)}</dd><dt>Intended benefit</dt><dd>${esc(m.benefit)}</dd><dt>Trade-offs</dt><dd>${esc(m.tradeoff)}</dd></dl></div><div class="md">${moveFigs[i] ? `<figure><div class="fignum">${moveFigs[i].id}</div>${moveFigs[i].s}<figcaption>${m.tested ? 'Proposed geometry evaluated on a copy of the model; the live model is unchanged.' : 'Indicative diagram of an untested suggestion.'}</figcaption></figure>` : ''}</div></div>`).join('') + '<p class="note">Tested moves were run through the same rule engine on a copy of the project. Untested suggestions have not been evaluated.</p>' : '<p>No changes are needed on the current checks.</p>', 'moves'));
    const vs = window.Iterate ? Iterate.list() : [], vA = vs.find((v) => v.id === pick.a), vB = vs.find((v) => v.id === pick.b), sigOf = (v) => JSON.stringify({ s: v.site, b: v.blocks, r: v.ramps });
    let pair = null; if (vA && vB && vA.id !== vB.id && sigOf(vA) !== sigOf(vB)) pair = [vA, vB]; else if (vs.length >= 2) { for (let i = vs.length - 1; i > 0 && !pair; i--) for (let j = i - 1; j >= 0; j--) if (sigOf(vs[i]) !== sigOf(vs[j])) { pair = [vs[j], vs[i]]; break; } }
    if (pair) { const [a, b] = pair, ma = a.metrics || {}, mb = b.metrics || {}, f7 = nextFig(), lim = A.D.fsr, cap = A.cap;
      const ra = new Map((a.rows || []).map((r) => [r.id, r])), rbm = new Map((b.rows || []).map((r) => [r.id, r])), fixed = (a.rows || []).filter((r) => r.verdict === 'fail' && (!rbm.get(r.id) || rbm.get(r.id).verdict !== 'fail')), broke = (b.rows || []).filter((r) => r.verdict === 'fail' && (!ra.get(r.id) || ra.get(r.id).verdict !== 'fail'));
      const why = []; if (lim != null && ma.fsr != null && mb.fsr != null) why.push(ma.fsr > lim && mb.fsr > lim ? `FSR moved from ${fmt(ma.fsr, 2)} to ${fmt(mb.fsr, 2)} but stays above ${fmt(lim, 2)}, so density still governs.` : ma.fsr > lim && mb.fsr <= lim ? `FSR fell from ${fmt(ma.fsr, 2)} to ${fmt(mb.fsr, 2)}, inside the ${fmt(lim, 2)} limit: density no longer blocks the scheme.` : mb.fsr > lim ? `FSR rose from ${fmt(ma.fsr, 2)} to ${fmt(mb.fsr, 2)}, past the ${fmt(lim, 2)} limit.` : `FSR moved from ${fmt(ma.fsr, 2)} to ${fmt(mb.fsr, 2)}, within the limit both times.`);
      if (cap && ma.height != null && mb.height != null) why.push(`Height ${fmt(ma.height, 1)} → ${fmt(mb.height, 1)} m against ${fmt(cap, 1)} m${mb.height > cap ? ', still over' : ''}.`);
      if (ma.homes != null && mb.homes != null && ma.homes !== mb.homes) why.push(`The homes estimate changes from ${ma.homes} to ${mb.homes}.`);
      const tr = (k, l, d, u = '') => `<tr><td>${l}</td><td class="n">${fmt(ma[k], d)}${u}</td><td class="n">${fmt(mb[k], d)}${u}</td><td class="n">${ma[k] != null && mb[k] != null ? (mb[k] - ma[k] >= 0 ? '+' : '−') + fmt(Math.abs(mb[k] - ma[k]), d) : '—'}</td></tr>`;
      sheets.push(sheet('06 · Iteration assessment', `${a.name} compared with ${b.name}`, `<div class="grid"><div class="c12"><figure><div class="fignum">${f7}</div>${figPair(a, b)}<figcaption><b>Matched axonometrics at the same scale and orientation.</b> Red outline in B: blocks that changed.</figcaption></figure></div><div class="c6"><h3>What changed and why it matters</h3>${why.map((w) => `<p>${esc(w)}</p>`).join('')}<p><b class="sans">Improved:</b> ${fixed.length ? esc(fixed.map((r) => r.title).join(', ')) : 'no issue was resolved'}. <b class="sans">Worsened:</b> ${broke.length ? esc(broke.map((r) => r.title).join(', ')) : 'no new issue'}.</p></div><div class="c6"><table class="data"><thead><tr><th>Metric</th><th>A</th><th>B</th><th>Change</th></tr></thead><tbody>${tr('fsr', 'Floor space ratio', 2)}${tr('height', 'Height', 1, ' m')}${tr('gfaAbove', 'Floor area above grade', 0, ' m²')}${tr('homes', 'Homes (estimate)', 0)}${tr('stalls', 'Parking stalls', 0)}${tr('fail', 'Issues', 0)}</tbody></table></div></div>`, 'iteration')); }
    let extraNo = pair ? 7 : 6;
    { const pairsFS = sepPairs(A), drawn = pairsFS.filter((q) => q.J); if (pairsFS.length) { const f8 = nextFig(), selQ = pairsFS.find((q) => q.selected); let n = 0;
      const rows = pairsFS.map((q) => { const num = q.J ? ++n : '—'; const G = (g) => g || 'none'; return `<tr${q.selected ? ' style="background:#fbeaeb"' : ''}><td class="n">${num}</td><td>${esc(q.a.name)} <span class="mono" style="color:var(--muted)">${G(q.fs.ga)}</span></td><td>${esc(q.b.name)} <span class="mono" style="color:var(--muted)">${G(q.fs.gb)}</span></td><td>${q.fs.rel === 'floor' ? 'floor between them' : 'shared wall'}</td><td class="n"><b>${esc(ratingOf(q.fs))}</b></td><td>${esc(q.fs.note || (q.fs.kind === 'same' ? 'Same major occupancy: no separation required between them by Table 3.1.3.1.' : q.fs.kind === 'table' ? `Table 3.1.3.1, Group ${q.fs.ga} against Group ${q.fs.gb}.` : ''))}${q.selected ? ' <b class="sans">Selected in the model.</b>' : ''}</td></tr>`; }).join('');
      sheets.push(sheet(`${String(extraNo++).padStart(2, '0')} · Fire separations`, 'Fire-resistance ratings between adjoining occupancies', `<div class="grid"><div class="c12"><figure><div class="fignum">${f8}</div>${figFireSep(A, pairsFS)}<figcaption><b>Where blocks of different occupancies touch, and the rating the separation needs.</b> Red lines in the section are floors or walls between occupancies, drawn across the length they share; in the plan the shared walls are red lines and a shared floor is a hatched rectangle. Numbers match the table. ${selQ ? `The pair picked in the model (${esc(selQ.a.name)} / ${esc(selQ.b.name)}) is filled red.` : 'Pick two blocks in the model to highlight one pair here.'} Ratings from VBBL Table 3.1.3.1; where the two blocks are the same major occupancy, none is required between them (suites and exits still have their own ratings).${legend(uses.filter((u) => u !== 'core'))}</figcaption></figure>
        <table class="data"><thead><tr><th>No.</th><th>Block A</th><th>Block B</th><th>Relationship</th><th>Rating required</th><th>Basis</th></tr></thead><tbody>${rows}</tbody></table><p class="note">${drawn.length} of ${pairsFS.length} adjoining pairs are drawn; a pair without a number touches over too small an area to draw. Source: ${window.Cite ? Cite.html('3.1.3.1 Table 3.1.3.1', {}) : 'VBBL 3.1.3.1, Table 3.1.3.1'}.</p></div></div>`, 'firesep')); } }
    { const ci = coreInfo(A); if (ci.length) { const f9 = nextFig(), full = ci.filter((q) => q.full), stairs = ci.reduce((a, q) => a + (q.c.stairs || 0), 0), lifts = ci.reduce((a, q) => a + (q.c.elevators || 0), 0);
      const rows = ci.map((q) => `<tr><td><b>${esc(q.c.name)}</b>${q.full ? '' : ' <span class="mono" style="color:var(--muted)">stair only</span>'}</td><td class="n">${fmt(q.c.w, 1)} × ${fmt(q.c.d, 1)}</td><td class="n">${fmt(q.c.x, 1)}</td><td class="n">${fmt(q.c.y, 1)}</td><td class="n">${q.c.stairs || 0}</td><td class="n">${q.c.elevators || 0}</td><td class="n">${fmt(q.c.z0, 1)} to ${fmt(q.top, 1)}</td><td>${esc(q.hosts.map((h) => h.name).join(', ') || '—')}${q.missed.length ? ` <span style="color:var(--fail)">· does not reach ${esc(q.missed.map((h) => h.name).join(', '))}</span>` : ''}</td><td>${q.reaches ? 'yes' : '<span style="color:var(--fail)">no</span>'}</td></tr>`).join('');
      const summary = `${plural(ci.length, 'core')} (${full.length} full), ${plural(stairs, 'exit stair')} and ${plural(lifts, 'elevator')} in all. ${ci.every((q) => q.reaches) ? 'Every core reaches the roof of the masses it stands in.' : 'A core that stops short is marked red in the section and in the table.'} Positions are measured to the core's south-west corner from the west property line and from the street line.`;
      sheets.push(sheet(`${String(extraNo++).padStart(2, '0')} · Cores and exits`, 'Where the cores stand and what they run through', `<div class="grid"><div class="c12"><figure><div class="fignum">${f9}</div>${figCores(A)}<figcaption><b>Cores on the footprints and through the section.</b> ${esc(summary)}${legend(uses.filter((u) => u !== 'core'))}</figcaption></figure>
        <table class="data"><thead><tr><th>Core</th><th>W × D (m)</th><th>From west line (m)</th><th>From street line (m)</th><th>Exit stairs</th><th>Elevators</th><th>Extent (m)</th><th>Masses it runs through</th><th>Reaches roof</th></tr></thead><tbody>${rows}</tbody></table><p class="note">Two exits per storey: ${window.Cite ? Cite.html('3.4.2.1.(1)', {}) : '3.4.2.1.(1)'}; separation ${window.Cite ? Cite.html('3.4.2.3', {}) : '3.4.2.3'}; firefighters' elevator in a high building ${window.Cite ? Cite.html('3.2.6.5', {}) : '3.2.6.5'}.</p></div></div>`, 'cores')); } }
    const statusRows = Object.keys(Checks.GROUPS).map((g) => { const rs = A.raw.filter((r) => r.group === g); if (!rs.length) return ''; return `<tr class="grp"><td colspan="5">${esc(Checks.GROUPS[g])} · ${rs.length}</td></tr>` + rs.map((r) => `<tr><td>${stTag(A.eff(r).key)}</td><td>${esc(r.title)}</td><td>${esc(r.value)}</td><td>${esc(r.limit || '—')}</td><td>${window.Cite ? Cite.html(r.clause || '', { parking: r.group === 'parking' }) : esc(r.clause || '')}</td></tr>`).join(''); }).join('');
    const dn = A.dn, T = A.T, prov = (k) => ({ confirmed: 'Confirmed (City data)', derived: 'Derived from City data', assumption: 'Assumption', verify: 'Needs verification' }[A.prov(k)] || '');
    const clauses = [...new Set(A.raw.map((r) => r.clause).filter(Boolean))].sort();
    sheets.push(sheet('A · Supporting appendix', 'Checks, calculations, sources and assumptions', `<h3>A1 · All checks</h3><table class="data"><thead><tr><th>Status</th><th>Check</th><th>Current</th><th>Requirement</th><th>Source</th></tr></thead><tbody>${statusRows}</tbody></table>
      <div class="grid"><div class="c6"><h3>A2 · Floor space ratio calculation</h3><table class="data"><tbody><tr><td>Residential</td><td class="n">${m2(dn.resFA)}</td></tr><tr><td>Office</td><td class="n">${m2(T.gfa.office)}</td></tr><tr><td>Retail</td><td class="n">${m2(T.gfa.retail)}</td></tr><tr><td>Restaurant</td><td class="n">${m2(T.gfa.restaurant)}</td></tr><tr><td>Amenity</td><td class="n">${m2(T.gfa.amenity)}</td></tr><tr><td>Less amenity excluded (≤ 20% of residential)</td><td class="n">−${m2(dn.amenEx)}</td></tr><tr><td>Above-grade parking ${m2(dn.parkAbove)} at 70%</td><td class="n">${m2(dn.parkAbove * 0.7)}</td></tr><tr><td><b>Counted floor area</b></td><td class="n"><b>${m2(dn.fsrFA)}</b></td></tr><tr><td>Site area</td><td class="n">${m2(dn.siteArea)}</td></tr><tr><td><b>FSR</b></td><td class="n"><b>${fmt(dn.fsr, 2)}</b></td></tr><tr><td>Permitted (density area ${esc(A.s.densityArea)})</td><td class="n">${A.D.fsr != null ? fmt(A.D.fsr, 2) : '—'}</td></tr></tbody></table>
      <h3>A3 · Site inputs</h3><table class="data"><tbody><tr><td>Lot area</td><td>${m2(A.s.area || dn.siteArea)}</td><td>${A.s.parcelIndex != null ? 'Confirmed (City data)' : 'Assumption'}</td></tr><tr><td>Zoning</td><td>${esc(A.s.zone || '—')}</td><td>${A.s.parcelIndex != null ? 'Confirmed (City data)' : 'Assumption'}</td></tr><tr><td>ODP density area</td><td>${esc(A.s.densityArea)}</td><td>${prov('densityArea')}</td></tr><tr><td>ODP height area</td><td>${esc(A.s.heightArea)}</td><td>${prov('heightArea')}</td></tr><tr><td>View cone height</td><td>${A.s.viewConeH != null ? fmt(A.s.viewConeH, 1) + ' m' : '—'}</td><td>${prov('viewCone')}</td></tr><tr><td>Ground-floor retail (Map 2)</td><td>${esc(A.s.retailMap2 || 'perm')}</td><td>Assumption</td></tr><tr><td>Neighbouring towers</td><td>${esc(A.s.adjTowers || 'none')}</td><td>Assumption</td></tr><tr><td>Tenure · sprinklered</td><td>${esc(A.s.tenure)} · ${A.s.sprinklered ? 'yes' : 'no'}</td><td>Assumption</td></tr><tr><td>Application date</td><td>${esc(A.s.applicationDate)}</td><td>Assumption</td></tr></tbody></table></div>
      <div class="c6"><h3>A4 · Block schedule</h3><table class="data"><thead><tr><th>Block</th><th>Use</th><th>W × D (m)</th><th>Base (m)</th><th>Storeys</th><th>Top (m)</th></tr></thead><tbody>${p.blocks.map((b) => `<tr><td>${esc(b.name)}</td><td>${esc(USE_LABEL[b.use])}</td><td class="n">${fmt(b.w, 2)} × ${fmt(b.d, 2)}</td><td class="n">${fmt(b.z0, 1)}</td><td class="n">${b.use === 'core' ? `${b.stairs || 0} stair · ${b.elevators || 0} lift` : b.floors}</td><td class="n">${fmt(Model.blockTop(b), 1)}</td></tr>`).join('')}</tbody></table>
      <h3>A5 · Sources</h3><p class="note">Underlined references open the by-law, code section, guideline or bulletin they come from. Building code articles open the online Vancouver Building By-law (2019 edition at BC Publications; Part 3 text matches 2025 except where marked Vancouver).</p><ul class="src">${clauses.map((c) => `<li>${window.Cite ? Cite.html(c, { parking: A.raw.some((r) => r.clause === c && r.group === 'parking') }) : esc(c)}</li>`).join('')}<li>${esc((window.CITY && CITY.meta && CITY.meta.source) || 'City of Vancouver Open Data')}</li><li>Surrounding buildings: OpenStreetMap contributors, with City building footprints as fallback.</li></ul>
      <h3>A6 · Assumptions and method</h3><ul class="src"><li>Screening checks of a massing model. A pass does not establish compliance with the Downtown ODP, the Zoning By-law or the VBBL.</li><li>A pass that depends on an unconfirmed restriction is reported as Needs verification, never as a pass.</li><li>Blocks are axis-aligned; plans snap to 0.25 m; stairs are assumed 1.1 m clear; parking headroom is floor-to-floor less 0.45 m.</li><li>Homes and stalls are counted from the generated floor plans.</li><li>Recommended moves marked Tested were evaluated by the same rule engine on a copy of the project; nothing else was simulated.</li><li>The exploded view and move diagrams are explanatory; the axonometrics, elevation and plans are drawn from the model's actual geometry.</li></ul></div></div>`, 'appendix'));
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(p.name || 'Massing study')} · Downtown Massing Tool report</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap"><style>${CSS}</style></head><body>${DEFS}${sheets.join('\n')}</body></html>`;
    return { html, sig, time: now, version, findings: F.length, moves: M.length, sections: [['datasheet', 'Project data'], ['synopsis', 'Design synopsis'], ['findings', 'Key findings'], ['capacity', 'Capacity and program'], ['constraints', 'Critical constraints'], ['moves', 'Recommended design moves']].concat(pair ? [['iteration', 'Iteration assessment']] : []).concat([['appendix', 'Supporting appendix']]) };
  }

  /* ---------- app integration ---------- */
  function status() { if (!built) return { state: 'none' }; const sig = window.Iterate ? Iterate.signature(call('project', null)) : ''; return { state: sig === built.sig ? 'current' : 'outdated', time: built.time, version: built.version }; }
  function update() { try { built = build(); } catch (e) { console.error('report', e); call('toast', null, 'The report could not be built: ' + e.message); return; } const fr = $('reportFrame'); if (fr) fr.srcdoc = built.html; render(); }
  function show() { if (!built) update(); else render(); }
  const tm = (d) => d.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' });
  function render() {
    const st = status(), bar = $('reportBar');
    if (bar) bar.innerHTML = st.state === 'none' ? '<span>No report built yet.</span>' : `<span class="rbstate ${st.state}">${st.state === 'outdated' ? '<b>Outdated</b> · the model changed after this report was built' : '<b>Up to date</b>'}</span><span class="mono muted">${esc(st.version)} · built ${tm(st.time)}</span><span class="grow"></span><button class="${st.state === 'outdated' ? 'primary' : ''}" id="rbUpdate">Update report</button><button id="rbExport">Export HTML</button>`;
    if (bar) { const u = $('rbUpdate'); if (u) u.onclick = update; const x = $('rbExport'); if (x) x.onclick = save; }
    if (!panel) return; const vs = window.Iterate ? Iterate.list() : [], opt = (sel) => '<option value="">Most recent pair</option>' + vs.map((v) => `<option value="${esc(v.id)}" ${v.id === sel ? 'selected' : ''}>${esc(v.name)}</option>`).join('');
    panel.innerHTML = `<h3 class="sechead">Contents</h3><ol class="toc">${(built ? built.sections : []).map(([id, l], i) => `<li><button class="link" data-go="${id}"><span class="mono">${id === 'appendix' ? 'A' : String(i + 1).padStart(2, '0')}</span>${esc(l)}</button></li>`).join('')}</ol>
      <h3 class="sechead">Iteration assessment</h3><p class="hint">${vs.length >= 2 ? 'Choose two saved versions, or leave the most recent different pair.' : 'Save two different versions to add this section.'}</p>${vs.length >= 2 ? `<div class="row2"><label>Version A<select data-v="a">${opt(pick.a)}</select></label><label>Version B<select data-v="b">${opt(pick.b)}</select></label></div>` : ''}
      <div class="btnrow"><button class="primary" id="rpUpdate">Update report</button><button id="rpExport">Export HTML</button></div><p class="hint" style="margin-top:8px">The export is laid out for A4 landscape. To make a PDF, open the exported file in a browser and print it.</p>`;
    panel.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => { const fr = $('reportFrame'); try { const el = fr.contentDocument.getElementById(b.dataset.go); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { /* frame not ready */ } }));
    panel.querySelectorAll('[data-v]').forEach((s) => (s.onchange = () => { pick[s.dataset.v] = s.value; render(); }));
    $('rpUpdate').onclick = update; $('rpExport').onclick = save;
  }
  async function save() { if (!built || status().state === 'outdated') update(); if (!built) return false; const p = call('project', {}), slug = String(p.name || p.site.addr || 'massing').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'massing'; const fn = `${slug}-report-${new Date().toISOString().slice(0, 10)}.html`; try { const ok = await app.save(fn, built.html); return ok; } catch (e) { call('toast', null, 'Report could not be saved: ' + e.message); return false; } }
  function mount(el, App) { panel = el; app = App; render(); if (typeof App.on === 'function') App.on('change', () => { if (built) render(); }); }
  return { mount, show, update, build: () => build().html, save, status, render };
})();
