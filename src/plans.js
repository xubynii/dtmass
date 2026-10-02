/* plans.js — per-level plan pipeline. Collects the blocks at a level, builds corridors and exits, calls the
   use generators (PlanRes, PlanComm, PlanPark), runs Dijkstra for travel distance and measures dead ends.
   Results are cached by an input signature so identical tower floors are generated once. */
window.Plans = (function () {
  const G = Geom, C = Geom.C, CELL = Geom.CELL;
  const CW = { residential: 1.8, hotel: 1.8, office: 1.8, amenity: 1.8, retail: 0, restaurant: 0, parking: 0 };
  const cache = new Map();
  let roomSeq = 0;
  const newId = () => `r${++roomSeq}`;

  function signature(project, L) {
    const parts = L.blocks.map((b) => `${b.id}:${b.name}:${b.use}:${b.x},${b.y},${b.w},${b.d}`).sort();
    const cores = L.cores.map((c) => `${c.id}:${c.name}:${c.x},${c.y},${c.w},${c.d},${c.stairs}`).sort();
    const ramps = L.ramps.map((r) => `${r.x},${r.y},${r.w},${r.len},${r.dir},${r.zTop},${r.zBottom}`);
    return [parts.join('|'), cores.join('|'), ramps.join('|'), L.h.toFixed(2), L.label < 0 ? 'B' : 'A', L.label === -1 ? 'P1' : L.label === 1 ? 'L1' : '', project.site.w, project.site.d, project.site.frontage, project.site.lane, project.site.streetClass, project.site.sprinklered, JSON.stringify(project._parkNeed || null), project.blocks.filter((b) => b.use === 'parking').map((b) => b.floors).join(',')].join('#');
  }

  /* ---------- corridors ---------- */
  /* Ring of width cw around each core, clipped to the plate union; sides whose outer gap to the façade is thin are dropped
     unless needed for connectivity. Spurs run into wings deeper than a unit. Two rings are linked. */
  function corridors(plateRects, cores, cw, opts = {}) {
    const segs = [], unitDepth = opts.unitDepth || 10, inPlate = (r) => G.insideUnion(r, plateRects);
    const bb = G.bboxOf(plateRects);
    const SMALL = 30; // m²: a stair-only core gets no ring, just a link corridor to the main ring
    const rings = cores.map((c) => {
      if (G.area(c) < SMALL && cores.length > 1) return [];
      const sides = { N: G.R(c.x - cw, c.y + c.d, c.w + 2 * cw, cw), S: G.R(c.x - cw, c.y - cw, c.w + 2 * cw, cw), E: G.R(c.x + c.w, c.y - cw, cw, c.d + 2 * cw), W: G.R(c.x - cw, c.y - cw, cw, c.d + 2 * cw) };
      const gap = { N: bb.y + bb.d - (c.y + c.d + cw), S: c.y - cw - bb.y, E: bb.x + bb.w - (c.x + c.w + cw), W: c.x - cw - bb.x };
      const keep = {};
      for (const k of 'NSEW') keep[k] = inPlate(sides[k]) && gap[k] >= (opts.full ? 2.5 : 4.5);
      // connectivity: if two opposite sides are dropped the ring is two pieces; keep the one with the larger gap if it fits
      for (const [a, b] of [['N', 'S'], ['E', 'W']]) if (!keep[a] && !keep[b]) { const k = gap[a] >= gap[b] ? a : b; if (inPlate(sides[k])) keep[k] = true; }
      const out = []; for (const k of 'NSEW') if (keep[k]) out.push(Object.assign(sides[k], { tag: 'ring', side: k, core: c }));
      // trim dropped-side overhangs: if N is dropped, E/W should not extend above the core top by cw... keep simple: fine.
      return out;
    });
    rings.forEach((r) => segs.push(...r));
    // link every other core to the main (largest) ring; a small stair core without a ring is linked at its face
    if (cores.length >= 2) {
      const sorted = cores.slice().sort((p, q2) => G.area(q2) - G.area(p)), a = sorted[0];
      for (const b of sorted.slice(1)) {
        const bRing = !(G.area(b) < SMALL), pad = bRing ? cw : 0;
        const ax = [a.x - cw, a.x + a.w + cw], bx = [b.x - pad, b.x + b.w + pad], ay = [a.y - cw, a.y + a.d + cw], by = [b.y - pad, b.y + b.d + pad];
        const ox = [Math.max(ax[0], bx[0]), Math.min(ax[1], bx[1])], oy = [Math.max(ay[0], by[0]), Math.min(ay[1], by[1])];
        if (ox[1] - ox[0] >= cw) { const x = G.snapQ(Math.min(Math.max((ox[0] + ox[1]) / 2 - cw / 2, bx[0]), bx[1] - cw)), y0 = Math.min(ay[1], by[1]), y1 = Math.max(ay[0], by[0]); if (y1 > y0) segs.push(Object.assign(G.R(x, y0, cw, y1 - y0), { tag: 'link' })); }
        else if (oy[1] - oy[0] >= cw) { const y = G.snapQ(Math.min(Math.max((oy[0] + oy[1]) / 2 - cw / 2, by[0]), by[1] - cw)), x0 = Math.min(ax[1], bx[1]), x1 = Math.max(ax[0], bx[0]); if (x1 > x0) segs.push(Object.assign(G.R(x0, y, x1 - x0, cw), { tag: 'link' })); }
        else { // L link: vertical leg from a's ring at b's x-centre column... keep the leg inside the plate: run along b's centreline
          const xb = G.snapQ(Math.min(Math.max(b.x + b.w / 2 - cw / 2, bx[0]), bx[1] - cw)); // column through b
          const yStart = b.y > a.y ? ay[1] : ay[0]; // leave a's ring top/bottom
          const yEnd = b.y > a.y ? by[0] : by[1];   // reach b's face
          // horizontal leg at a's ring level, from a's ring edge to the column
          const yh = b.y > a.y ? ay[1] - cw : ay[0];
          const xStart = xb + cw / 2 > a.x + a.w / 2 ? ax[1] : ax[0];
          segs.push(Object.assign(G.R(Math.min(xStart, xb + (xStart > xb ? cw : 0)), yh, Math.abs(xStart - xb) + (xStart > xb ? 0 : cw) - (xStart > xb ? cw : 0) + (xStart > xb ? cw : 0), cw), { tag: 'link' }));
          segs.push(Object.assign(G.R(xb, Math.min(yStart, yEnd), cw, Math.abs(yEnd - yStart)), { tag: 'link' }));
        }
      }
    }
    // spurs into wings: from the corridor bbox toward each plate edge
    if (opts.spurs !== false && segs.length) {
      const cb = G.bboxOf(segs);
      const dirs = [{ k: 'E', ext: bb.x + bb.w - (cb.x + cb.w) }, { k: 'W', ext: cb.x - bb.x }, { k: 'N', ext: bb.y + bb.d - (cb.y + cb.d) }, { k: 'S', ext: cb.y - bb.y }];
      for (const d of dirs) {
        if (d.ext <= unitDepth + 3) continue;
        const endDepth = Math.min(10, Math.max(6, d.ext * 0.4)), len = G.snapQ(d.ext - endDepth);
        let r;
        if (d.k === 'E' || d.k === 'W') { const y = G.snapQ(bb.y + bb.d / 2 - cw / 2); r = d.k === 'E' ? G.R(cb.x + cb.w, y, len, cw) : G.R(cb.x - len, y, len, cw);
          // connector from the ring to the spur if the spur does not touch an existing segment
          if (!segs.some((s) => G.overlaps(G.inset(r, -0.01), s))) { const side = segs.filter((s) => s.tag === 'ring').sort((p, q2) => (d.k === 'E' ? (q2.x + q2.w) - (p.x + p.w) : p.x - q2.x))[0]; if (side) { const y0 = Math.min(side.y, y), y1 = Math.max(side.y + side.d, y + cw); const cx = d.k === 'E' ? side.x + side.w - cw : side.x; segs.push(Object.assign(G.R(cx, y0, cw, y1 - y0), { tag: 'link' })); } } }
        else { const x = G.snapQ(bb.x + bb.w / 2 - cw / 2); r = d.k === 'N' ? G.R(x, cb.y + cb.d, cw, len) : G.R(x, cb.y - len, cw, len);
          if (!segs.some((s) => G.overlaps(G.inset(r, -0.01), s))) { const side = segs.filter((s) => s.tag === 'ring').sort((p, q2) => (d.k === 'N' ? (q2.y + q2.d) - (p.y + p.d) : p.y - q2.y))[0]; if (side) { const x0 = Math.min(side.x, x), x1 = Math.max(side.x + side.w, x + cw); const cy = d.k === 'N' ? side.y + side.d - cw : side.y; segs.push(Object.assign(G.R(x0, cy, x1 - x0, cw), { tag: 'link' })); } } }
        if (inPlate(r) && len >= 2) segs.push(Object.assign(r, { tag: 'spur', side: d.k }));
      }
    }
    return segs.filter((s) => s.w > 0.01 && s.d > 0.01);
  }

  /* exit doors: stair doors on core faces that have corridor (or open floor / aisle) outside */
  function exits(grid, cores, passCodes, opts = {}) {
    const out = [], rank = { [C.CORR]: 0, [C.AISLE]: 1, [C.OPEN]: 2, [C.RAMP]: 3 };
    const site = opts.site, ground = opts.ground;
    for (const c of cores) {
      const faces = [
        { side: 'N', x: c.x + c.w / 2, y: c.y + c.d + CELL / 2, at: c.x + c.w / 2 }, { side: 'S', x: c.x + c.w / 2, y: c.y - CELL / 2, at: c.x + c.w / 2 },
        { side: 'E', x: c.x + c.w + CELL / 2, y: c.y + c.d / 2, at: c.y + c.d / 2 }, { side: 'W', x: c.x - CELL / 2, y: c.y + c.d / 2, at: c.y + c.d / 2 }];
      for (const f of faces) { const [i, j] = grid.toCell(f.x, f.y); f.code = grid.inb(i, j) ? grid.cells[grid.idx(i, j)] : -1;
        f.exterior = !!(ground && site && ((f.side === 'S' && c.y <= 0.6) || (f.side === 'N' && c.y + c.d >= site.d - 0.6) || (f.side === 'W' && c.x <= 0.6) || (f.side === 'E' && c.x + c.w >= site.w - 0.6))); }
      const ok = faces.filter((f) => passCodes.includes(f.code) || f.exterior).sort((a, b) => (a.exterior ? -1 : rank[a.code]) - (b.exterior ? -1 : rank[b.code]));
      const n = Math.min(c.stairs || 2, 2);
      // prefer opposite faces for two stairs
      let pick = [];
      if (n === 2) { const pairs = c.w >= c.d ? [['E', 'W'], ['N', 'S']] : [['N', 'S'], ['E', 'W']]; const corr = ok.filter((f) => f.code === C.CORR || f.exterior); for (const p of pairs) { const a = (corr.length >= 2 ? corr : ok).find((f) => f.side === p[0]), b = (corr.length >= 2 ? corr : ok).find((f) => f.side === p[1]); if (a && b) { pick = [a, b]; break; } } if (!pick.length) pick = ok.slice(0, 2); }
      else if (cores.length > 1) { /* a single-stair core puts its door on the face farthest from the other cores, so the two exits are as far apart as the plate allows */ const others = cores.filter((o) => o !== c), far = (f) => Math.min(...others.map((o) => Math.hypot(f.x - (o.x + o.w / 2), f.y - (o.y + o.d / 2)))), corr = ok.filter((f) => f.code === C.CORR || f.exterior); pick = (corr.length ? corr : ok).slice().sort((p, q) => far(q) - far(p)).slice(0, 1); }
      else pick = ok.slice(0, 1);
      if (!pick.length && ok.length === 0) { // no corridor outside: use the face nearest the plate edge anyway, flagged
        pick = faces.slice(0, n); pick.forEach((f) => (f.noAccess = true)); }
      for (const f of pick) { const [i, j] = grid.toCell(f.x, f.y); const inside = grid.inb(i, j) && passCodes.includes(f.code); out.push({ x: f.x, y: f.y, side: f.side, at: f.at, k: inside ? grid.idx(i, j) : -1, core: c, noAccess: !!f.noAccess, exterior: !!f.exterior && !inside, w: 1.1 }); }
    }
    return out;
  }

  /* dead ends from the corridor segment graph: prune leaves that hold no exit */
  function deadEnds(segs, exitPts) {
    const n = segs.length, adj = segs.map(() => new Set());
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (G.overlaps(G.inset(segs[i], -0.02), segs[j])) { adj[i].add(j); adj[j].add(i); }
    const hasExit = segs.map((s) => exitPts.some((e) => (e.x >= s.x - 0.3 && e.x <= s.x + s.w + 0.3 && e.y >= s.y - 0.3 && e.y <= s.y + s.d + 0.3) || (e.core && G.overlaps(G.inset(s, -0.3), e.core))));
    const alive = segs.map(() => true), lenOf = (s) => Math.max(s.w, s.d), ends = [];
    let changed = true;
    while (changed) { changed = false;
      for (let i = 0; i < n; i++) { if (!alive[i] || hasExit[i]) continue; const nb = [...adj[i]].filter((j) => alive[j]);
        if (nb.length <= 1) { let L = lenOf(segs[i]); if (nb.length === 1) { const o = G.inter(G.inset(segs[i], -0.02), segs[nb[0]]); if (o) L -= Math.max(o.w, o.d) - 0.04; L = Math.max(0, L); if (segs[nb[0]].deadAcc) L += segs[nb[0]].deadAcc; }
          // a leaf with units: the dead end runs from the junction to the far end
          ends.push({ seg: segs[i], len: L }); for (const j of nb) segs[j].deadAcc = Math.max(segs[j].deadAcc || 0, L); alive[i] = false; changed = true; } } }
    const max = ends.reduce((m, e) => Math.max(m, e.len), 0);
    return { ends, max };
  }

  /* ---------- the pipeline ---------- */
  /* Candidate corridor layouts for a level; the one with the largest leasable share that still clears travel, reach and
     dead-end limits wins, so each program gets its typical layout: a double-loaded ring with spurs for homes and hotel rooms,
     the tightest ring for offices, no corridor for retail, restaurants and parking. */
  const LAYOUT_NAME = ['ring corridor with spurs', 'full ring with spurs', 'ring corridor', 'full ring'];
  function layoutScore(res) {
    const m = res.metrics, area = Math.max(1, m.area || 1), roomsA = res.rooms.filter((r) => !r.parent && r.kind !== 'open' && r.kind !== 'aisle' && r.kind !== 'stall' && r.kind !== 'ramp' && r.kind !== 'unit' && !['residential', 'hotel', 'office'].includes(r.use)).reduce((a, r) => a + (r.area || G.area(r.rect)), 0), lease = (m.unitArea || 0) + (m.openArea || 0) + roomsA, corr = res.corridors.reduce((a, s) => a + G.area(s), 0), eff = lease / area, why = []; let pen = 0;
    const lim = (CODES.travel && CODES.travel.sprinkleredAny) || 45;
    if (m.maxTravel > lim) { pen += 1; why.push(`travel ${m.maxTravel.toFixed(0)} m over ${lim} m`); }
    if (m.unreachedRooms) { pen += m.unreachedRooms; why.push(`${m.unreachedRooms} room${m.unreachedRooms === 1 ? '' : 's'} unreachable`); }
    if (m.deadEnd > 6) { pen += 0.3; why.push(`dead end ${m.deadEnd.toFixed(1)} m`); }
    const bad = res.flags.filter((f) => /deeper than 13.5|corner suite/.test(f)).length; pen += 0.1 * bad; pen += corr / area * 0.5;
    return { eff, total: eff - pen, why: why.join(', ') };
  }
  function forLevel(project, L) {
    const sig = signature(project, L);
    if (cache.has(sig)) return cache.get(sig);
    if (cache.size > 300) cache.clear();
    const t0 = performance.now();
    const corrUse = L.blocks.some((b) => CW[b.use] > 0) && L.cores.length > 0, variants = corrUse ? [0, 1, 2, 3] : [0];
    let best = null; const scored = [];
    for (const vnt of variants) { let r; try { r = buildLevel(project, L, vnt); } catch (e) { console.error('layout variant', vnt, e); continue; } const sc = layoutScore(r); scored.push({ vnt, sc, r }); if (!best || sc.total > best.sc.total + 1e-9) best = { vnt, sc, r }; }
    const res = best.r; if (corrUse) { res.metrics.layout = LAYOUT_NAME[best.vnt]; res.metrics.layoutEff = best.sc.eff; }
    if (scored.length > 1 && best.sc.eff > 0 && scored.some((q) => q.vnt !== best.vnt && q.sc.total < best.sc.total - 0.01)) { const alt = scored.filter((q) => q.vnt !== best.vnt).sort((a, b) => b.sc.total - a.sc.total)[0]; res.flags.unshift(`Layout: ${LAYOUT_NAME[best.vnt]} (${Math.round(best.sc.eff * 100)}% leasable${best.sc.why ? ', ' + best.sc.why : ''}) chosen over ${LAYOUT_NAME[alt.vnt]} (${Math.round(alt.sc.eff * 100)}%${alt.sc.why ? ', ' + alt.sc.why : ''}).`); }
    res.time = performance.now() - t0; cache.set(sig, res); return res;
  }
  function buildLevel(project, L, variant) {
    const t0 = performance.now();
    roomSeq = 0;
    const tiles = L.blocks.map((b) => ({ rect: Model.rect(b), use: b.use, blockId: b.id, name: b.name }));
    const plateRects = tiles.map((t) => t.rect), bb = G.bboxOf(plateRects);
    const grid = new G.Grid(G.R(bb.x - 0.5, bb.y - 0.5, bb.w + 1, bb.d + 1));
    for (const r of plateRects) grid.fill(r, C.ROOM);
    const plateMask = Uint8Array.from(grid.cells);
    const cores = L.cores.map((c) => Object.assign(Model.rect(c), { stairs: c.stairs, id: c.id, name: c.name })).filter((c) => plateRects.some((p) => G.overlaps(c, p)));
    for (const c of cores) grid.fill(c, C.CORE);
    const res = { key: L.key, z: L.z, h: L.h, label: L.label, name: L.name, grid, tiles, cores, corridors: [], rooms: [], exits: [], flags: [], metrics: { occupants: 0, units: { S: 0, '1B': 0, '2B': 0, '3B': 0 }, unitsTotal: 0, bedrooms: 0, familyShare: 0, stalls: 0 }, time: 0 };
    const ctxBase = { grid, cores, level: L, codes: CODES, newId, site: project.site };

    // 1. corridors for corridor uses (shared across tiles of the same corridor use)
    const corrUses = [...new Set(tiles.filter((t) => CW[t.use] > 0).map((t) => t.use))];
    for (const u of corrUses) {
      const rects = tiles.filter((t) => t.use === u).map((t) => t.rect);
      const coresHere = cores.filter((c) => rects.some((r) => G.overlaps(c, r)));
      if (!coresHere.length) { res.flags.push(`${Model.USE_LABEL[u]} floor has no core: no corridor or exits generated.`); continue; }
      const segs = corridors(rects, coresHere, CW[u], { spurs: (u === 'residential' || u === 'hotel') && variant < 2, unitDepth: 10, full: variant === 1 || variant === 3 });
      for (const s of segs) { s.use = u; grid.fill(s, C.CORR); }
      res.corridors.push(...segs);
    }
    // 2. generators per tile
    const byUse = {};
    for (const t of tiles) (byUse[t.use] = byUse[t.use] || []).push(t);
    const parkNeed = project._parkNeed || { bikeA: 0, bikeB: 0, loadingA: 0, loadingB: 0, accessibleFraction: 0.05 };
    for (const [use, ts] of Object.entries(byUse)) {
      const ctx = Object.assign({}, ctxBase, { tiles: ts, plate: ts.map((t) => t.rect), corridors: res.corridors.filter((s) => s.use === use) });
      let out = null;
      try {
        if (use === 'residential' || use === 'hotel') out = PlanRes.generate(ctx);
        else if (use === 'parking') { const rampsHere = L.ramps.map((r) => ({ rect: rampRect(r), dir: r.dir, zTop: r.zTop, zBottom: r.zBottom, w: r.w, len: r.len }));
          out = window.PlanPark ? PlanPark.generate({ grid, plate: ctx.plate, cores: cores.map((c) => G.R(c.x, c.y, c.w, c.d)), ramps: rampsHere, level: { z: L.z, h: L.h, label: L.label, isTop: L.label === -1 || (L.label === 1) }, codes: CODES.parking, need: Object.assign({ parkingLevels: project.blocks.filter((b) => b.use === 'parking').reduce((a, b) => Math.max(a, b.floors), 1) }, parkNeed), laneSide: project.site.lane, streetClass: project.site.streetClass, spacesServed: parkNeed.stallsTarget || 0 }) : { rooms: [], metrics: { stalls: 0, flags: ['Parking generator not loaded.'] } };
          if (out.metrics) { res.metrics.parking = out.metrics; if (out.metrics.flags) res.flags.push(...out.metrics.flags); } }
        else out = PlanComm.generate(ctx, use);
      } catch (e) { res.flags.push(`${Model.USE_LABEL[use]} generator failed: ${e.message}`); console.error(e); }
      if (out) { res.rooms.push(...(out.rooms || [])); if (out.flags) res.flags.push(...out.flags); if (out.metrics) mergeMetrics(res.metrics, out.metrics); }
    }
    for (let k = 0; k < grid.cells.length; k++) if (!plateMask[k] && grid.cells[k] !== C.CORE) grid.cells[k] = C.VOID; // clip generator leaks
    // 2b. a room with one door whose far corner is more than 25 m from it needs a second egress door (3.3.1.5): add one at the other end of the same side
    for (const rm of res.rooms) { if (rm.parent || rm.use === 'residential' || !rm.doors || rm.doors.length !== 1 || ['stall', 'aisle', 'ramp', 'open'].includes(rm.kind)) continue; if (Math.hypot(rm.rect.w, rm.rect.d) <= 25) continue;
      const d = rm.doors[0], horiz = d.side === 'N' || d.side === 'S', lo = horiz ? rm.rect.x : rm.rect.y, hi = horiz ? rm.rect.x + rm.rect.w : rm.rect.y + rm.rect.d; const at = G.snapQ(Math.abs(d.at - lo) > Math.abs(hi - d.at) ? lo + 0.8 : hi - 0.8); if (Math.abs(at - d.at) > 2) rm.doors.push({ side: d.side, at, w: d.w, exit: d.exit }); }
    // 3. exits and travel
    const passCodes = [C.CORR, C.OPEN, C.AISLE, C.RAMP];
    res.exits = exits(grid, cores, passCodes, { site: project.site, ground: L.label === 1 });
    // at grade, retail / restaurant rooms exit directly to the street: their street doors are exits too
    for (const rm of res.rooms) for (const d of rm.doors || []) if (d.exit) { const p = doorOutside(rm.rect, d); const [i, j] = grid.toCell(p[0], p[1]); res.exits.push({ x: p[0], y: p[1], side: d.side, at: d.at, k: grid.inb(i, j) ? grid.idx(i, j) : -1, room: rm, street: true, w: d.w }); }
    if (res.exits.some((e) => e.noAccess && !e.exterior)) res.flags.push('A core has no corridor or open floor outside its stair doors on this level.');
    const pass = (k) => passCodes.includes(grid.cells[k]);
    const srcs = res.exits.filter((e) => e.k >= 0 && !e.street).map((e) => e.k);
    if (res.exits.some((e) => e.exterior)) res.flags = res.flags.filter((f) => !/no corridor or open floor/.test(f));
    res.travel = srcs.length ? G.dijkstra(grid, srcs, pass) : new Float64Array(grid.W * grid.H).fill(Infinity);
    // travel per top-level room: from the corridor cell outside its door (suite-door measurement, 3.4.2.4.(2)) plus the longest inside path (diagonal)
    let maxT = 0, maxRoom = null, unreached = 0;
    for (const rm of res.rooms) {
      if (rm.parent || !rm.doors || !rm.doors.length || ['aisle', 'ramp', 'stall', 'open'].includes(rm.kind)) continue;
      let best = Infinity;
      for (const d of rm.doors) { if (d.exit) { best = 0; break; } const p = doorOutside(rm.rect, d); const [i, j] = grid.toCell(p[0], p[1]); if (grid.inb(i, j)) best = Math.min(best, res.travel[grid.idx(i, j)]); }
      rm.travel = best; rm.inside = Math.hypot(rm.rect.w, rm.rect.d);
      if (!isFinite(best)) { unreached++; continue; }
      if (best > maxT) { maxT = best; maxRoom = rm; }
    }
    // open floors (office / amenity / parking): farthest traversable cell
    let farCell = -1, farD = 0;
    for (let k = 0; k < grid.cells.length; k++) { const c = grid.cells[k]; if ((c === C.OPEN || c === C.AISLE || c === C.CORR) && isFinite(res.travel[k]) && res.travel[k] > farD) { farD = res.travel[k]; farCell = k; } }
    let openUnreached = 0; for (let k = 0; k < grid.cells.length; k++) { const c = grid.cells[k]; if ((c === C.OPEN || c === C.AISLE) && !isFinite(res.travel[k])) openUnreached++; }
    res.metrics.maxTravel = Math.max(maxT, farD); res.metrics.maxTravelRoom = farD > maxT ? null : maxRoom; res.metrics.farCell = farD >= maxT ? farCell : -1;
    res.metrics.unreachedRooms = unreached; res.metrics.unreachedOpenArea = openUnreached * CELL * CELL;
    // exit separation: largest distance between any two stair exits
    const stairs = res.exits.filter((e) => !e.street);
    let sep = 0; for (let i = 0; i < stairs.length; i++) for (let j = i + 1; j < stairs.length; j++) sep = Math.max(sep, Math.hypot(stairs[i].x - stairs[j].x, stairs[i].y - stairs[j].y));
    res.metrics.exitSeparation = sep; res.metrics.stairExits = stairs.length;
    res.metrics.diagonal = Math.hypot(bb.w, bb.d); res.metrics.hasCorridor = res.corridors.length > 0;
    // dead ends
    const de = deadEnds(res.corridors, stairs); res.metrics.deadEnd = de.max; res.deadEnds = de.ends;
    // area + occupants
    res.metrics.area = Model.unionArea(plateRects) - Model.unionArea(cores.flatMap((c) => plateRects.map((p) => G.inter(c, p)).filter(Boolean)));
    res.walls = G.wallsFor(res.rooms.filter((r) => r.kind !== 'stall' && r.kind !== 'aisle' && r.kind !== 'open'));
    res.time = performance.now() - t0;
    return res;
  }
  function mergeMetrics(m, o) { for (const [k, v] of Object.entries(o)) { if (k === 'flags') continue; if (typeof v === 'number') m[k] = (m[k] || 0) + v; else if (k === 'units' && v) { for (const t of Object.keys(v)) m.units[t] = (m.units[t] || 0) + v[t]; } else if (m[k] === undefined) m[k] = v; } }
  function doorOutside(rect, d) { const e = CELL * 0.75; return d.side === 'N' ? [d.at, rect.y + rect.d + e] : d.side === 'S' ? [d.at, rect.y - e] : d.side === 'E' ? [rect.x + rect.w + e, d.at] : [rect.x - e, d.at]; }
  function rampRect(r) { return r.dir === 'N' || r.dir === 'S' ? G.R(r.x, r.y, r.w, r.len) : G.R(r.x, r.y, r.len, r.w); }

  function clearCache() { cache.clear(); }
  return { forLevel, corridors, exits, deadEnds, clearCache, doorOutside, rampRect, CW };
})();
