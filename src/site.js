/* site.js — City of Vancouver open data (window.CITY from city-data.js): pick a parcel, build the site frame, auto-fill
   zoning / ODP areas, and collect context (neighbouring buildings, parks, view cones) in local site coordinates.
   Data frame: metres east (X) and north (Y) from the origin in CITY.meta. Local frame: x along the front street edge,
   y inward (north-ish), origin at the SW corner of the site bounding box; right-handed, never mirrored. */
window.Site = (function () {
  const D = () => window.CITY;
  const CTX_R = 260, PARK_R = 320;
  /* ---------- polygon helpers ---------- */
  const pip = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c; } return c; };
  const ringArea = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
  const centroid = (r) => { let x = 0, y = 0; for (const p of r) { x += p[0]; y += p[1]; } return [x / r.length, y / r.length]; };
  const bbox = (pts) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); } return [x0, y0, x1, y1]; };
  const segDist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy; const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
  const polysIntersect = (A, B) => A.some((p) => pip(p, B)) || B.some((p) => pip(p, A));
  const hull = (pts) => { const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (P.length < 3) return P; const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); const lo = [], up = []; for (const p of P) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); } for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); } up.pop(); lo.pop(); return lo.concat(up); };

  /* ---------- parcel search ---------- */
  function parcelAt(pt) { const P = D().parcels; for (let i = 0; i < P.length; i++) if (pip(pt, P[i].p)) return i; return -1; }
  function search(q) { const s = q.trim().toUpperCase(); if (!s) return []; const P = D().parcels, out = []; for (let i = 0; i < P.length && out.length < 12; i++) if (P[i].a && P[i].a.toUpperCase().includes(s)) out.push({ i, a: P[i].a }); for (const n of D().notable) if (n.n.toUpperCase().includes(s) && out.length < 12) { const f = D().foot[n.f[0]]; const c = f ? centroid(f.p) : null; const i = c ? parcelAt(c) : -1; if (i >= 0) out.push({ i, a: `${n.n} · ${P[i].a}` }); } return out; }

  /* ---------- the frame ---------- */
  function edgeKinds(ring) { // street if a centreline is within 22 m of the edge midpoint, lane within 9 m, else adjoining site
    const d = D(), out = [];
    for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; let best = null, bd = 22;
      for (const s of d.streets) for (let k = 0; k < s.p.length - 1; k++) { const dd = segDist(m, s.p[k], s.p[k + 1]); if (dd < bd) { bd = dd; best = s; } }
      if (best) { out.push({ i, kind: 's', name: best.n || '' }); continue; }
      let lane = false; for (const l of d.lanes) { for (let k = 0; k < l.length - 1 && !lane; k++) if (segDist(m, l[k], l[k + 1]) < 9) lane = true; if (lane) break; }
      out.push({ i, kind: lane ? 'l' : 'x', name: '' }); }
    return out;
  }
  function frame(ring, frontIdx) {
    const P0 = ring[frontIdx], P1 = ring[(frontIdx + 1) % ring.length];
    let dir = [P1[0] - P0[0], P1[1] - P0[1]]; const L = Math.hypot(dir[0], dir[1]); dir = [dir[0] / L, dir[1] / L];
    let nrm = [-dir[1], dir[0]]; // +90° CCW: right-handed frame
    const c = centroid(ring); if ((c[0] - P0[0]) * nrm[0] + (c[1] - P0[1]) * nrm[1] < 0) { dir = [-dir[0], -dir[1]]; nrm = [-nrm[0], -nrm[1]]; }
    const f = { P0, dir, nrm, off: [0, 0] };
    const loc = ring.map((q) => toLocal(q, f)); const bb = bbox(loc); f.off = [bb[0], bb[1]];
    return f;
  }
  const toLocal = (q, f) => [(q[0] - f.P0[0]) * f.dir[0] + (q[1] - f.P0[1]) * f.dir[1] - f.off[0], (q[0] - f.P0[0]) * f.nrm[0] + (q[1] - f.P0[1]) * f.nrm[1] - f.off[1]];
  const fromLocal = (p, f) => { const x = p[0] + f.off[0], y = p[1] + f.off[1]; return [f.P0[0] + x * f.dir[0] + y * f.nrm[0], f.P0[1] + x * f.dir[1] + y * f.nrm[1]]; };

  /* ---------- zoning / ODP auto-fill ---------- */
  const HEIGHT_GUESS = { A: '8', B: '8', C1: '5', C2: '5', C3: '5', C4: '5', E: '1', F: '8', G: '5', H: '5', J: '6', K1: '3', K2: '3', K3: '3', L1: '6', L2: '6', M: '6', N: '7', O: '7' };
  function zoneAt(pt) { for (const z of D().zones) if (pip(pt, z.p)) return z.z; return null; }
  function subareaAt(pt) { for (const s of D().subareas) if (pip(pt, s.p)) return s.n; return null; }
  function inDD(pt) { return D().dd.some((ring) => pip(pt, ring)); }

  /* ---------- build a project site from a parcel ---------- */
  function siteFromParcel(idx, frontIdx) {
    const rec = D().parcels[idx]; const ring = rec.p.slice(); if (ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) ring.pop();
    const kinds = edgeKinds(ring), elen = (i) => Math.hypot(ring[(i + 1) % ring.length][0] - ring[i][0], ring[(i + 1) % ring.length][1] - ring[i][1]);
    const streets = kinds.filter((e) => e.kind === 's');
    let fe = frontIdx; if (fe == null) fe = streets.length ? streets.reduce((b, e) => (elen(e.i) > elen(b.i) ? e : b)).i : 0;
    const f = frame(ring, fe), loc = ring.map((q) => toLocal(q, f)), bb = bbox(loc), c = centroid(ring);
    const edges = ring.map((p, i) => { const k = kinds[i]; return { kind: k.kind, name: k.name, a: loc[i].map((v) => Math.round(v * 100) / 100), b: loc[(i + 1) % loc.length].map((v) => Math.round(v * 100) / 100), front: i === fe }; });
    // lane side: the edge kind 'l' farthest from the front, mapped to N/S/E/W by its outward normal in local coords
    const sideOf = (e) => { const mx = (e.a[0] + e.b[0]) / 2, my = (e.a[1] + e.b[1]) / 2; const cx = bb[2] - bb[0], cy = bb[3] - bb[1]; const dx = mx - cx / 2, dy = my - cy / 2; return Math.abs(dx) / cx > Math.abs(dy) / cy ? (dx > 0 ? 'E' : 'W') : (dy > 0 ? 'N' : 'S'); };
    const lanes = edges.filter((e) => e.kind === 'l'), lane = lanes.length ? sideOf(lanes.reduce((b, e) => (Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]) > Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]) ? e : b))) : 'N';
    const sub = rec.sub || subareaAt(c), dd = rec.dd != null ? !!rec.dd : inDD(c);
    const densityArea = sub ? (sub === 'C' ? 'C2' : sub) : null;
    const cones = (rec.vc && rec.vc.length ? rec.vc : D().cones.filter((v) => polysIntersect(ring, v.p)).map((v) => v.n)) || [];
    const corner = streets.length >= 2;
    return { addr: rec.a, parcelIndex: idx, poly: loc.map((v) => v.map((n) => Math.round(n * 100) / 100)), edges, north: [f.dir[1], f.nrm[1]].map((v) => Math.round(v * 1000) / 1000), frame: f,
      w: Math.round((bb[2] - bb[0]) * 4) / 4, d: Math.round((bb[3] - bb[1]) * 4) / 4, area: Math.abs(ringArea(loc)), frontage: 'S', lane: lane === 'S' ? 'N' : lane, corner,
      frontageLen: Math.round(elen(fe) * 10) / 10, streets: [...new Set(streets.map((e) => e.name))], zone: zoneAt(c), dd, densityArea, heightArea: densityArea ? HEIGHT_GUESS[densityArea] || '5' : null,
      viewCones: cones, auto: { densityArea: sub ? (sub === 'C' ? 'check' : 'auto') : 'none', heightArea: 'check', zone: 'auto' } };
  }

  /* ---------- context in local coordinates ---------- */
  /* Buildings around the site: OpenStreetMap footprints and building parts (window.OSM, current, with height / levels tags),
     falling back to the City's 2009 footprints for heights that OSM lacks and for buildings OSM does not have. Data frame. */
  function buildingsNear(c, R) {
    const d = D(), o = window.OSM, out = [];
    const within = (q) => Math.hypot(q[0] - c[0], q[1] - c[1]) <= R;
    if (o && o.b) {
      const near = o.b.filter((b) => within(b.p[0]));
      const parts = near.filter((b) => b.part), wholes = near.filter((b) => !b.part), pcs = parts.map((p) => centroid(p.p));
      for (const b of wholes) { if (pcs.some((pc) => pip(pc, b.p))) continue; out.push({ h: b.h, z0: 0, poly: b.p, name: b.n, src: 'osm', lv: b.lv }); }
      for (const b of parts) out.push({ h: b.h, z0: b.z0 || 0, poly: b.p, name: b.n, src: 'osm-part', lv: b.lv });
      for (const b of out) if (!b.h) { const cb = centroid(b.poly); const cf = d.foot.find((f) => pip(cb, f.p)); b.h = cf ? cf.h : 10; b.est = true; if (b.h <= b.z0) b.h = b.z0 + 3.2; }
      for (const cf of d.foot) { const cb = centroid(cf.p); if (!within(cb)) continue; if (near.some((b) => pip(cb, b.p))) continue; out.push({ h: cf.h, z0: 0, poly: cf.p, src: 'city' }); }
    } else for (const cf of d.foot) { if (within(centroid(cf.p))) out.push({ h: cf.h, z0: 0, poly: cf.p, src: 'city' }); }
    return out;
  }
  function context(site) {
    const f = site.frame || (site.parcelIndex != null ? frameFromSite(site) : null); if (!f) return { foot: [], parks: [], streets: [], cones: [] };
    const d = D(), c = fromLocal([site.w / 2, site.d / 2], f), self = site.parcelIndex != null ? d.parcels[site.parcelIndex].p : null;
    const all = buildingsNear(c, 900).filter((b) => !(self && pip(centroid(b.poly), self)));
    const toL = (b) => Object.assign({}, b, { poly: b.poly.map((q) => toLocal(q, f)) });
    const footAll = all.map(toL);
    const foot = all.filter((b) => Math.hypot(centroid(b.poly)[0] - c[0], centroid(b.poly)[1] - c[1]) <= CTX_R).map(toL);
    const parks = [], streets = [];
    for (const p of d.parks) { const cp = centroid(p.p); if (Math.hypot(cp[0] - c[0], cp[1] - c[1]) > PARK_R) continue; parks.push({ name: p.n, cls: p.c, poly: p.p.map((q) => toLocal(q, f)) }); }
    for (const s of d.streets) { const m = s.p[0]; if (Math.hypot(m[0] - c[0], m[1] - c[1]) > CTX_R) continue; streets.push({ name: s.n, pts: s.p.map((q) => toLocal(q, f)) }); }
    const cones = d.cones.filter((v) => site.viewCones && site.viewCones.includes(v.n)).map((v) => ({ name: v.n, desc: v.d, url: v.u, poly: v.p.map((q) => toLocal(q, f)) }));
    const parcels = [], lanes = [];
    for (const p of d.parcels) { const cp = p.p[0]; if (Math.hypot(cp[0] - c[0], cp[1] - c[1]) > 420) continue; parcels.push(p.p.map((q) => toLocal(q, f))); }
    for (const l of d.lanes) { const m = l[0]; if (Math.hypot(m[0] - c[0], m[1] - c[1]) > 420) continue; lanes.push(l.map((q) => toLocal(q, f))); }
    const dd = d.dd.map((ring) => ring.map((q) => toLocal(q, f)));
    const source = window.OSM ? `OpenStreetMap (${window.OSM.meta.fetched}) with City 2009 fallback` : 'City of Vancouver 2009 footprints';
    return { foot, parks, streets, cones, parcels, lanes, footAll, dd, source };
  }
  function frameFromSite(site) { const rec = D().parcels[site.parcelIndex]; if (!rec) return null; const ring = rec.p.slice(); if (ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) ring.pop(); const fe = site.edges ? site.edges.findIndex((e) => e.front) : 0; return frame(ring, Math.max(0, fe)); }

  return { parcelAt, search, siteFromParcel, context, frameFromSite, toLocal, fromLocal, pip, hull, bbox, centroid, ringArea, zoneAt, subareaAt, CTX_R, available: () => !!window.CITY };
})();
