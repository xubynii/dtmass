/* model.js — the intent model (what the user edits) and the level table derived from it.
   Everything is metric. Site origin (0,0) is the south-west corner of the site; +x east, +y north.
   Blocks are axis-aligned rectangles with their own base elevation z0, floor count and floor-to-floor.
   Levels are clusters of slab elevations across all blocks: labels 1.. above grade, -1.. below, never 0. */
window.Model = (function () {
  const USES = ['residential', 'hotel', 'office', 'retail', 'restaurant', 'amenity', 'parking', 'core'];
  const USE_LABEL = { residential: 'Residential', hotel: 'Hotel', office: 'Office', retail: 'Retail', restaurant: 'Restaurant', amenity: 'Amenity', parking: 'Parking', core: 'Core' };
  const USE_F2F = { residential: 3.0, hotel: 3.3, office: 3.9, retail: 5.0, restaurant: 4.5, amenity: 3.6, parking: 3.2, core: 3.0 };
  const LEVEL_TOL = 0.3;
  let nextId = 1;
  const uid = (p) => `${p}${nextId++}`;

  function block(props) {
    const b = Object.assign({ id: uid('b'), use: 'residential', name: '', x: 0, y: 0, w: 20, d: 20, z0: 0, floors: 1, f2f: null, stairs: 2, elevators: 2 }, props);
    if (b.f2f == null) b.f2f = USE_F2F[b.use] || 3.0;
    if (!b.name) b.name = USE_LABEL[b.use];
    return b;
  }
  function ramp(props) {
    return Object.assign({ id: uid('r'), x: 0, y: 0, w: 6.1, len: 30, dir: 'N', zTop: 0, zBottom: -3.2 }, props);
  }

  /* Default demo project: a 75 × 60 m downtown site (sub-area G, height area 8): retail + restaurant + amenity at grade,
     one office podium floor, a 32 × 23 m residential tower, three underground parking levels, one ramp, two cores. */
  /* Default demo project, laid out for any site box (W × D): retail and a restaurant along the street, amenity behind,
     one office podium floor, a residential tower, three underground parking levels, a main core, two stair cores, one ramp.
     Pass a site (e.g. from Site.siteFromParcel) to fit a real lot; without one a 75 × 60 m box in sub-area G is used. */
  function demoProject(siteIn) {
    nextId = 1;
    const site = Object.assign({ w: 75, d: 60, frontage: 'S', lane: 'N', corner: false, streetClass: 'arterial', densityArea: 'G', heightArea: '8',
      tenure: 'market', viewConeH: null, sprinklered: true, applicationDate: '2026-10-01', socialShare: 0 }, siteIn || {});
    const W = site.w, D = site.d, q = (v) => Math.round(v * 4) / 4;
    const frontD = q(Math.min(18, D * 0.42)), retailW = q(W * 0.6);
    const tw = q(Math.min(32, W * 0.5)), td = q(Math.min(23, D * 0.62)), tx = q((W - tw) / 2), ty = q(Math.max(frontD * 0.3, (D - td) / 2));
    const cw = q(Math.min(14, tw * 0.44)), cd = q(Math.min(8, td * 0.35)), cx = q(tx + (tw - cw) / 2), cy = q(ty + (td - cd) / 2);
    const floors = Math.max(8, Math.round(Math.min(22, (CODES.odp.height[site.heightArea] || {}).basic ? ((CODES.odp.height[site.heightArea].basic || 60) - 9) / 3 : 22)));
    const blocks = [
      block({ use: 'retail', name: 'Retail podium', x: 0, y: 0, w: retailW, d: frontD, z0: 0, floors: 1, f2f: 5.0 }),
      block({ use: 'restaurant', name: 'Restaurant', x: retailW, y: 0, w: q(W - retailW), d: frontD, z0: 0, floors: 1, f2f: 5.0 }),
      block({ use: 'amenity', name: 'Amenity', x: 0, y: frontD, w: W, d: q(D - frontD), z0: 0, floors: 1, f2f: 5.0 }),
      block({ use: 'office', name: 'Office podium', x: 0, y: 0, w: W, d: D, z0: 5.0, floors: 1, f2f: 3.9 }),
      block({ use: 'residential', name: 'Tower', x: tx, y: ty, w: tw, d: td, z0: 8.9, floors, f2f: 3.0 }),
      block({ use: 'parking', name: 'Underground parking', x: 0, y: 0, w: W, d: D, z0: -9.6, floors: 3, f2f: 3.2 }),
      block({ use: 'core', name: 'Core', x: cx, y: cy, w: cw, d: cd, z0: -9.6, floors: 1, f2f: q(8.9 + floors * 3.0 + 9.6), stairs: 2, elevators: 4 }),
      block({ use: 'core', name: 'Stair NW', x: 0, y: q(D - 9), w: 3, d: 6, z0: -9.6, floors: 1, f2f: 18.5, stairs: 1, elevators: 0 }),
      block({ use: 'core', name: 'Stair SE', x: q(Math.max(retailW + 2, W - 14)), y: 0, w: 6, d: 3, z0: -9.6, floors: 1, f2f: 18.5, stairs: 1, elevators: 0 }),
    ];
    const ramps = [ramp({ x: q(W - 10), y: 0, w: 6.1, len: q(Math.min(34, D - 2)), dir: 'N', zTop: 0, zBottom: -9.6 })];
    return { schema: 1, site, blocks, ramps };
  }

  const blockTop = (b) => b.z0 + b.floors * b.f2f;
  const rect = (b) => ({ x: b.x, y: b.y, w: b.w, d: b.d });
  const area = (b) => b.w * b.d;
  const slabs = (b) => { const out = []; for (let i = 0; i < b.floors; i++) out.push(b.z0 + i * b.f2f); return out; };
  const rectsOverlap = (a, b) => a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.d - 1e-9 && b.y < a.y + a.d - 1e-9;
  const rectInside = (a, b) => a.x >= b.x - 1e-9 && a.y >= b.y - 1e-9 && a.x + a.w <= b.x + b.w + 1e-9 && a.y + a.d <= b.y + b.d + 1e-9;

  /* Level table: cluster slab elevations from all non-core blocks (cores span, they do not create levels). */
  function levels(project) {
    const zs = [];
    for (const b of project.blocks) if (b.use !== 'core') for (const z of slabs(b)) zs.push({ z, b });
    zs.sort((a, b) => a.z - b.z);
    const out = [];
    for (const s of zs) {
      const last = out[out.length - 1];
      if (last && Math.abs(last.z - s.z) <= LEVEL_TOL) { last.blocks.push(s.b); last.z = (last.z * (last.blocks.length - 1) + s.z) / last.blocks.length; }
      else out.push({ z: s.z, blocks: [s.b] });
    }
    let up = 0, down = 0;
    for (const L of out) if (L.z >= -LEVEL_TOL) { L.label = ++up; } // above or at grade
    for (let i = out.length - 1; i >= 0; i--) if (out[i].z < -LEVEL_TOL) { out[i].label = -(++down); }
    // basements numbered from the top down: P1 is the first below grade
    const below = out.filter((L) => L.label < 0).reverse(); below.forEach((L, i) => (L.label = -(i + 1)));
    for (const L of out) {
      L.key = `L${L.label}`;
      L.name = L.label > 0 ? `L${L.label}` : `P${-L.label}`;
      L.cores = project.blocks.filter((b) => b.use === 'core' && b.z0 <= L.z + LEVEL_TOL && blockTop(b) >= L.z + 2.0);
      // top of this level's slab-to-slab: the smallest f2f among its blocks
      L.h = Math.min(...L.blocks.map((b) => b.f2f));
      L.uses = [...new Set(L.blocks.map((b) => b.use))];
      L.ramps = project.ramps.filter((r) => r.zBottom <= L.z + LEVEL_TOL && r.zTop >= L.z + L.h - LEVEL_TOL && L.uses.includes('parking'));
    }
    return out;
  }

  /* Building totals used by zoning and parking rules. */
  function totals(project) {
    const t = { gfa: {}, gfaAbove: 0, gfaBelow: 0, maxZ: 0, minZ: 0, storeysAbove: 0, footprint: 0 };
    for (const u of USES) t.gfa[u] = 0;
    const L = levels(project);
    for (const b of project.blocks) {
      if (b.use === 'core') continue;
      for (const z of slabs(b)) { const a = area(b); t.gfa[b.use] += a; if (z >= -LEVEL_TOL) t.gfaAbove += a; else t.gfaBelow += a; }
      t.maxZ = Math.max(t.maxZ, blockTop(b)); t.minZ = Math.min(t.minZ, b.z0);
    }
    t.storeysAbove = L.filter((l) => l.label > 0).length;
    t.storeysBelow = L.filter((l) => l.label < 0).length;
    const ground = L.find((l) => l.label === 1);
    t.footprint = ground ? unionArea(ground.blocks.map(rect)) : 0;
    t.levels = L;
    return t;
  }
  function unionArea(rects) { // exact union of axis-aligned rects by coordinate compression
    if (!rects.length) return 0;
    const xs = [...new Set(rects.flatMap((r) => [r.x, r.x + r.w]))].sort((a, b) => a - b);
    const ys = [...new Set(rects.flatMap((r) => [r.y, r.y + r.d]))].sort((a, b) => a - b);
    let A = 0;
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2;
      if (rects.some((r) => cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.d)) A += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
    }
    return A;
  }

  /* Validation: blocks inside the site, positive sizes, at most two cores. Returns a list of strings. */
  function problems(project) {
    const out = [];
    const siteR = { x: 0, y: 0, w: project.site.w, d: project.site.d };
    const cores = project.blocks.filter((b) => b.use === 'core');
    if (cores.filter((c) => c.w * c.d >= 30).length > 2) out.push('More than two full cores: extra cores should be small stair cores (under 30 m²).');
    for (const b of project.blocks) {
      if (b.w < 2 || b.d < 2) out.push(`${b.name}: footprint under 2 m.`);
      if (!rectInside(rect(b), siteR)) out.push(`${b.name}: extends beyond the site.`);
    }
    return out;
  }

  const clone = (p) => JSON.parse(JSON.stringify(p));
  /* after restoring a saved project, move the id counter past every existing id */
  function syncIds(project) { let m = 0; for (const o of [...project.blocks, ...project.ramps]) { const n = parseInt(String(o.id).replace(/^\D+/, ''), 10); if (n > m) m = n; } nextId = Math.max(nextId, m + 1); }
  function snap(v, s = 0.25) { return Math.round(v / s) * s; }

  return { USES, USE_LABEL, USE_F2F, LEVEL_TOL, block, ramp, demoProject, levels, totals, unionArea, problems, clone, syncIds, snap, blockTop, rect, area, slabs, rectsOverlap, rectInside };
})();
