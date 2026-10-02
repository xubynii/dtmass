/* plan-res.js — residential floor generator. Units are the band between the corridor faces and the façade,
   cut into bays sized to the unit mix (studio 40, 1-bed 54, 2-bed 80, 3-bed 100 m², ~35% family). Rooms inside a suite:
   bath by the entry, laundry, bedrooms at the façade, ensuite for 2-/3-bed. Walls and doors only. */
window.PlanRes = (function () {
  const G = Geom, C = Geom.C;
  const TYPES = [
    { t: 'S', area: 40, beds: 0, share: 0.15, minW: 4.0 },
    { t: '1B', area: 54, beds: 1, share: 0.35, minW: 4.8 },
    { t: '2B', area: 80, beds: 2, share: 0.30, minW: 6.8 },
    { t: '3B', area: 100, beds: 3, share: 0.20, minW: 8.4 },
  ];
  const BED_D = 3.5, BED_MINW = 2.8, BATH = [1.75, 2.5], ENS = [1.6, 2.4], LAU = [0.9, 1.4], ENTRY_D = 2.5, DOOR = 0.9, MAX_UNIT = 140;

  /* faces: outward-facing sides of corridor segments with the band depth to the façade.
     Returns bands {rect, side (door side of the unit, i.e. the side facing the corridor), face:[a,b], faceAt} */
  function bands(plateRects, segs, cores = []) {
    const out = [], union = plateRects;
    const corrRects = segs.concat(cores);
    const isCorr = (x, y) => corrRects.some((s) => x > s.x && x < s.x + s.w && y > s.y && y < s.y + s.d);
    const inPlate = (x, y) => union.some((r) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.d);
    // extent of plate from point (x,y) in direction
    const reach = (x, y, dx, dy) => { let t = 0; while (t < 200 && inPlate(x + dx * (t + 0.125), y + dy * (t + 0.125)) && !isCorr(x + dx * (t + 0.125), y + dy * (t + 0.125))) t += 0.25; return t; };
    for (const s of segs) {
      const faces = [
        { side: 'N', dx: 0, dy: 1, a: s.x, b: s.x + s.w, y0: s.y + s.d }, { side: 'S', dx: 0, dy: -1, a: s.x, b: s.x + s.w, y0: s.y },
        { side: 'E', dx: 1, dy: 0, a: s.y, b: s.y + s.d, x0: s.x + s.w }, { side: 'W', dx: -1, dy: 0, a: s.y, b: s.y + s.d, x0: s.x }];
      for (const f of faces) {
        // split the face where plate depth changes (sample every 0.25 m along the face)
        let runStart = null, runDepth = null;
        const flush = (end) => { if (runStart == null) return; if (runDepth >= 4.5 && end - runStart >= 1.0) {
            const horiz = f.side === 'N' || f.side === 'S';
            // extend N/S bands sideways over the thin end bands (corners go to N/S)
            let a = runStart, b = end;
            if (horiz) { const yC = f.y0 + f.dy * Math.min(runDepth, 3) / 2; const yProbe = f.y0 + f.dy * 0.125; let ea = reach(a - 0.125, yProbe, -1, 0), eb = reach(b + 0.125, yProbe, 1, 0); // extend only through cells that are plate and not corridor, up to 12 m
              a -= Math.min(ea, 12); b += Math.min(eb, 12); void yC; }
            const rect = horiz ? G.R(a, f.side === 'N' ? f.y0 : f.y0 - runDepth, b - a, runDepth) : G.R(f.side === 'E' ? f.x0 : f.x0 - runDepth, a, runDepth, b - a);
            // Clip the band to the plate and obstacles; retain only pieces touching this corridor face.
            let remaining = [G.snapRect(rect)], pieces = [];
            for (const plate of union) { for (const r of remaining) { const part = G.inter(r, plate); if (part) pieces.push(part); } remaining = G.subtractAll(remaining, [plate]); }
            pieces = G.subtractAll(pieces, corrRects);
            for (const r of pieces) { const at = f.side === 'N' ? r.y : f.side === 'S' ? r.y + r.d : f.side === 'E' ? r.x : r.x + r.w; const lo = Math.max(runStart, horiz ? r.x : r.y), hi = Math.min(end, horiz ? r.x + r.w : r.y + r.d);
              if (Math.abs(at - (horiz ? f.y0 : f.x0)) < 0.01 && hi - lo >= 1 && (horiz ? r.d : r.w) >= 4.5) out.push({ rect: r, side: opposite(f.side), face: [lo, hi], depth: horiz ? r.d : r.w, seg: s }); } }
          runStart = null; };
        for (let p = f.a + 0.125; p < f.b; p += 0.25) {
          const x = f.side === 'N' || f.side === 'S' ? p : f.x0 + f.dx * 0.125, y = f.side === 'E' || f.side === 'W' ? p : f.y0 + f.dy * 0.125;
          const d = inPlate(x, y) && !isCorr(x, y) ? Math.min(reach(x, y, f.dx, f.dy), 14) : 0;
          const dq = Math.round(d * 4) / 4;
          if (runStart == null) { if (dq > 0) { runStart = p - 0.125; runDepth = dq; } }
          else if (Math.abs(dq - runDepth) > 0.26 || dq === 0) { flush(p - 0.125); if (dq > 0) { runStart = p - 0.125; runDepth = dq; } }
        }
        flush(f.b);
      }
    }
    // remove overlaps: later bands lose the part already taken (keep rect bands by clipping along the face axis)
    const kept = [];
    for (const bnd of out.sort((p, q) => G.area(q.rect) - G.area(p.rect))) {
      let r = bnd.rect, ok = true;
      for (const k of kept) { const o = G.inter(r, k.rect); if (!o) continue; const horiz = bnd.side === 'S' || bnd.side === 'N';
        // clip along the face axis
        if (horiz) { if (o.x <= r.x + 0.01) { const nx = o.x + o.w; r = G.R(nx, r.y, r.x + r.w - nx, r.d); } else if (o.x + o.w >= r.x + r.w - 0.01) r = G.R(r.x, r.y, o.x - r.x, r.d); else ok = false; }
        else { if (o.y <= r.y + 0.01) { const ny = o.y + o.d; r = G.R(r.x, ny, r.w, r.y + r.d - ny); } else if (o.y + o.d >= r.y + r.d - 0.01) r = G.R(r.x, r.y, r.w, o.y - r.y); else ok = false; }
        if (r.w < 3 || r.d < 3) ok = false; if (!ok) break; }
      if (ok) kept.push(Object.assign({}, bnd, { rect: r }));
    }
    return kept;
  }
  const opposite = (s) => ({ N: 'S', S: 'N', E: 'W', W: 'E' })[s];

  /* choose bay widths along a band to follow the mix */
  function cutBays(len, depth, mix, overL = 0, overR = 0) {
    const bays = [];
    let pos = 0;
    // corner bays: the overhang beyond the corridor face plus just enough face for a door, sized toward a 3-bed
    const corner = (over) => { if (over < 1.5) return 0; return Math.min(len, G.snapQ(Math.max(over + 1.5, Math.min(over + 6, 80 / depth)))); };
    const cL = corner(overL), cR = corner(overR);
    if (cL > 0 && cL < len - 3) { const T = typeFor(cL * depth); bays.push({ t: T.t, w: cL, a: 0 }); mix.count[T.t]++; mix.total++; pos = cL; }
    const endAt = cR > 0 && len - pos - cR > 3 ? len - cR : len;
    while (endAt - pos > 0.5) {
      const rem = endAt - pos;
      // deficit-driven type choice among types that fit
      const cands = TYPES.map((T) => ({ T, w: Math.max(T.minW, T.area / depth) })).filter((c) => c.w <= rem + 0.01 || bays.length === 0);
      if (!cands.length) break;
      let best = null, bestScore = -Infinity;
      for (const c of cands) { const have = mix.count[c.T.t] / Math.max(1, mix.total), score = (c.T.share - have) * 10 - (c.w > rem ? 100 : 0); if (score > bestScore) { bestScore = score; best = c; } }
      let w = Math.min(best.w, rem);
      if (rem - w < 3.6 && rem - w > 0.01) w = rem; // absorb a sliver into this bay
      w = G.snapQ(w);
      if (w < 2) break;
      bays.push({ t: best.T.t, w, a: pos }); mix.count[best.T.t]++; mix.total++;
      pos += w;
    }
    if (endAt < len) { const T = typeFor((len - pos) * depth); bays.push({ t: T.t, w: len - pos, a: pos }); mix.count[T.t]++; mix.total++; }
    return bays;
  }
  const typeFor = (a) => a >= 95 ? TYPES[3] : a >= 70 ? TYPES[2] : a >= 46 ? TYPES[1] : TYPES[0];

  function generate(ctx) {
    const { grid, plate, corridors, newId } = ctx;
    const rooms = [], flags = [], mix = { count: { S: 0, '1B': 0, '2B': 0, '3B': 0 }, total: 0 };
    const segs = corridors.length ? corridors : [];
    if (!segs.length) return { rooms, flags: ['No corridor: residential floor needs a core inside the plate.'], metrics: {} };
    const bnds = bands(plate, segs, ctx.cores || []);
    let bedrooms = 0, occupants = 0, unitArea = 0, oversize = 0, deep = 0;
    for (const bnd of bnds) {
      const horiz = bnd.side === 'N' || bnd.side === 'S';
      const len = horiz ? bnd.rect.w : bnd.rect.d, depth = horiz ? bnd.rect.d : bnd.rect.w;
      if (depth > 13.5) deep++;
      const overL = Math.max(0, bnd.face[0] - (horiz ? bnd.rect.x : bnd.rect.y)), overR = Math.max(0, (horiz ? bnd.rect.x + bnd.rect.w : bnd.rect.y + bnd.rect.d) - bnd.face[1]);
      const bays = cutBays(len, depth, mix, overL, overR);
      for (const bay of bays) {
        const r = horiz ? G.R(bnd.rect.x + bay.a, bnd.rect.y, bay.w, bnd.rect.d) : G.R(bnd.rect.x, bnd.rect.y + bay.a, bnd.rect.w, bay.w);
        const T = TYPES.find((t) => t.t === bay.t);
        // door on the corridor face: clamp into the overlap with the face
        const lo = Math.max(horiz ? r.x : r.y, bnd.face[0]) + 0.6, hi = Math.min(horiz ? r.x + r.w : r.y + r.d, bnd.face[1]) - 0.6;
        if (hi < lo) { // the bay is beyond the corridor face (corner): widen the door reach by merging into the previous unit
          const prev = rooms.filter((u) => u.kind === 'unit' && u._band === bnd).pop();
          if (prev) { const pr = prev.rect; const nr = horiz ? G.R(Math.min(pr.x, r.x), pr.y, Math.max(pr.x + pr.w, r.x + r.w) - Math.min(pr.x, r.x), pr.d) : G.R(pr.x, Math.min(pr.y, r.y), pr.w, Math.max(pr.y + pr.d, r.y + r.d) - Math.min(pr.y, r.y)); prev.rect = nr; prev.area = G.area(nr); continue; }
          continue; }
        const at = G.snapQ(Math.min(Math.max(horiz ? r.x + r.w / 2 : r.y + r.d / 2, lo), hi));
        const unit = { id: newId(), kind: 'unit', use: 'residential', name: T.t === 'S' ? 'Studio' : T.t === '1B' ? '1 bedroom' : T.t === '2B' ? '2 bedroom' : '3 bedroom', rect: r, parent: null, doors: [{ side: bnd.side, at, w: DOOR }], area: G.area(r), unitType: T.t, bedrooms: T.beds, occ: Math.max(2, T.beds * 2), _band: bnd };
        rooms.push(unit);
      }
    }
    // re-type merged / oversize units by area, then furnish rooms
    for (const u of rooms.filter((r) => r.kind === 'unit')) {
      const a = u.area; const T = a >= 95 ? TYPES[3] : a >= 70 ? TYPES[2] : a >= 46 ? TYPES[1] : TYPES[0];
      if (T.t !== u.unitType) { mix.count[u.unitType]--; mix.count[T.t]++; u.unitType = T.t; u.bedrooms = T.beds; u.occ = Math.max(2, T.beds * 2); u.name = T.t === 'S' ? 'Studio' : T.t === '1B' ? '1 bedroom' : T.t === '2B' ? '2 bedroom' : '3 bedroom'; }
      if (a > MAX_UNIT) oversize++;
      bedrooms += u.bedrooms; occupants += u.occ; unitArea += a;
      rooms.push(...furnish(u, newId));
      grid.fill(u.rect, C.ROOM, rooms.indexOf(u), C.ROOM);
      delete u._band;
    }
    mix.count = { S: 0, '1B': 0, '2B': 0, '3B': 0 }; for (const u of rooms) if (u.kind === 'unit') mix.count[u.unitType]++;
    const total = Object.values(mix.count).reduce((a, n) => a + n, 0), fam = total ? (mix.count['2B'] + mix.count['3B']) / total : 0;
    if (oversize) flags.push(`${oversize} corner suite${oversize > 1 ? 's' : ''} over ${MAX_UNIT} m²: move the core or add a second core so the ring reaches the corner.`);
    if (deep) flags.push('A unit band is deeper than 13.5 m: rooms at the back get no daylight. Thin the plate or move the core.');
    return { rooms, flags, metrics: { units: mix.count, unitsTotal: total, bedrooms, occupants, familyShare: fam, unitArea, netEff: unitArea } };
  }

  /* rooms inside a suite: local frame with the door side at v=0 (depth axis v, width axis u) */
  function furnish(u, newId) {
    const r = u.rect, side = u.doors[0].side, horiz = side === 'N' || side === 'S';
    const W = horiz ? r.w : r.d, D = horiz ? r.d : r.w, doorAt = u.doors[0].at - (horiz ? r.x : r.y);
    const out = [];
    // map local (u0, v0, uw, vd) -> world rect; v grows away from the door side
    const toWorld = (u0, v0, uw, vd) => {
      if (side === 'S') return G.R(r.x + u0, r.y + v0, uw, vd);
      if (side === 'N') return G.R(r.x + u0, r.y + r.d - v0 - vd, uw, vd);
      if (side === 'W') return G.R(r.x + v0, r.y + u0, vd, uw);
      return G.R(r.x + r.w - v0 - vd, r.y + u0, vd, uw);
    };
    const localSide = (s) => { // local 'in' = toward living (v+), 'out' = toward door side; convert to world side names
      const map = { S: { vplus: 'N', vminus: 'S', uplus: 'E', uminus: 'W' }, N: { vplus: 'S', vminus: 'N', uplus: 'E', uminus: 'W' }, W: { vplus: 'E', vminus: 'W', uplus: 'N', uminus: 'S' }, E: { vplus: 'W', vminus: 'E', uplus: 'N', uminus: 'S' } };
      return map[side][s]; };
    const add = (kind, name, u0, v0, uw, vd, doorLocal) => {
      const rect = G.snapRect(toWorld(u0, v0, uw, vd)); if (rect.w < 0.5 || rect.d < 0.5) return null;
      const room = { id: newId(), kind, name, use: 'residential', rect, parent: u.id, doors: [], area: G.area(rect), occ: 0 };
      if (doorLocal) { const ws = localSide(doorLocal.s); const at = ws === 'N' || ws === 'S' ? rect.x + rect.w / 2 : rect.y + rect.d / 2; room.doors.push({ side: ws, at: G.snapQ(at), w: 0.8 }); }
      out.push(room); return room; };
    // entry zone: bath beside the door (on the side with more room), laundry next to it
    const bathLeft = doorAt > W / 2; // door right of centre -> bath on the left
    const bathU = bathLeft ? 0 : W - BATH[0];
    add('bath', 'Bath', bathU, 0, BATH[0], BATH[1], { s: 'uplus' === 'uplus' && bathLeft ? 'uplus' : 'uminus' });
    const lauU = bathLeft ? BATH[0] : W - BATH[0] - LAU[0];
    if (W > 5.5) add('laundry', 'Laundry', lauU, 0, LAU[0], LAU[1], { s: 'vplus' });
    // bedrooms at the façade end
    const n = u.bedrooms;
    if (n > 0) {
      let fit = Math.min(n, Math.floor(W / BED_MINW));
      const bw = G.snapQ(W / fit);
      for (let i = 0; i < fit; i++) {
        const u0 = i * bw, uw = i === fit - 1 ? W - u0 : bw;
        const master = i === 0 && n >= 2;
        add('bedroom', master ? 'Bedroom 1' : `Bedroom ${i + 1}`, u0, D - BED_D, uw, BED_D, { s: 'vminus' });
        if (master && D - BED_D - ENTRY_D >= ENS[1] + 1.0) add('ensuite', 'Ensuite', u0, D - BED_D - ENS[1], ENS[0], ENS[1], { s: 'vminus' });
      }
      // extra bedrooms that did not fit at the façade go on the side wall between entry and façade zones
      for (let i = fit; i < n; i++) { const vd = D - BED_D - ENTRY_D - 0.3; if (vd >= BED_MINW) add('bedroom', `Bedroom ${i + 1}`, bathLeft ? W - 3.0 : 0, ENTRY_D + 0.3, 3.0, G.snapQ(vd), { s: bathLeft ? 'uminus' : 'uplus' }); }
    }
    return out;
  }

  return { generate, bands, cutBays, TYPES };
})();
