/* plan-comm.js — office, retail, restaurant and amenity floor generators. Walls and doors only. */
window.PlanComm = (function () {
  const G = Geom, C = Geom.C;
  const OFF = { depth: 4.5, meeting4: 3.6, meeting10: 6.0, focus: 2.4, pantry: 4.0, storage: 3.0 };
  const LOAD = { office: 9.3, retail: 3.7, dining: 1.2, kitchen: 9.3, fitness: 4.6, multi: 1.2, change: 4.6, stock: 46 };

  function generate(ctx, use) {
    if (use === 'office') return office(ctx);
    if (use === 'retail') return retail(ctx);
    if (use === 'restaurant') return restaurant(ctx);
    if (use === 'amenity') return amenity(ctx);
    return { rooms: [], flags: [`No generator for ${use}.`], metrics: {} };
  }
  const mk = (ctx, kind, name, use, rect, doors, occ, parent = null) => ({ id: ctx.newId(), kind, name, use, rect: G.snapRect(rect), parent, doors, area: G.area(rect), occ });
  const doorOn = (rect, side, w = 0.9, frac = 0.5) => ({ side, at: G.snapQ(side === 'N' || side === 'S' ? rect.x + rect.w * frac : rect.y + rect.d * frac), w });
  const opposite = (s) => ({ N: 'S', S: 'N', E: 'W', W: 'E' })[s];
  /* side of the tile that touches the site edge named by `edge` (frontage / lane); null if it does not touch */
  function touching(rect, site, edge) { const e = 0.3; if (edge === 'S' && rect.y <= e) return 'S'; if (edge === 'N' && rect.y + rect.d >= site.d - e) return 'N'; if (edge === 'W' && rect.x <= e) return 'W'; if (edge === 'E' && rect.x + rect.w >= site.w - e) return 'E'; return null; }

  /* ---------- office ---------- */
  function office(ctx) {
    const { grid, plate, corridors, cores } = ctx, rooms = [], flags = [];
    if (!corridors.length) return { rooms, flags: ['Office floor has no core ring.'], metrics: {} };
    // open floor = plate minus cores minus corridor
    let openArea = 0; for (const r of plate) { grid.fill(r, C.OPEN, -1, C.ROOM); }
    for (let k = 0; k < grid.cells.length; k++) if (grid.cells[k] === C.OPEN) openArea += 0.0625;
    const staff = Math.round(openArea / 14); // design staffing 14 m²/person (occupant load for code uses 9.3)
    const want = [];
    const n4 = Math.max(1, Math.ceil(staff / 30)), n10 = Math.max(1, Math.ceil(staff / 80)), nf = Math.max(1, Math.ceil(staff / 25));
    want.push({ kind: 'pantry', name: 'Pantry', len: OFF.pantry, occ: 4 }, { kind: 'storage', name: 'Storage', len: OFF.storage, occ: 0 });
    for (let i = 0; i < n10; i++) want.push({ kind: 'meeting10', name: 'Meeting 10', len: OFF.meeting10, occ: 10 });
    for (let i = 0; i < n4; i++) want.push({ kind: 'meeting4', name: 'Meeting 4', len: OFF.meeting4, occ: 4 });
    for (let i = 0; i < nf; i++) want.push({ kind: 'focus', name: 'Focus', len: OFF.focus, occ: 1 });
    // place along the outward faces of the ring, in a band of depth OFF.depth, leaving the open floor beyond
    const bnds = PlanRes.bands(plate, corridors, cores).filter((b) => b.depth >= OFF.depth + 3);
    let qi = 0, placedArea = 0;
    for (const row of [0, 1]) for (const b of bnds) {
      if (row === 1 && b.depth < 2 * OFF.depth + 3) continue;
      const horiz = b.side === 'N' || b.side === 'S', len = horiz ? b.rect.w : b.rect.d, off = row * OFF.depth;
      // band rect limited to OFF.depth on the corridor side (row 1 sits behind row 0)
      const base = horiz ? G.R(b.rect.x, b.side === 'S' ? b.rect.y + off : b.rect.y + b.rect.d - OFF.depth - off, b.rect.w, OFF.depth) : G.R(b.side === 'W' ? b.rect.x + off : b.rect.x + b.rect.w - OFF.depth - off, b.rect.y, OFF.depth, b.rect.d);
      let pos = Math.max(0, (horiz ? b.face[0] - b.rect.x : b.face[0] - b.rect.y));
      const end = Math.min(len, horiz ? b.face[1] - b.rect.x : b.face[1] - b.rect.y);
      while (qi < want.length && pos + want[qi].len <= end + 0.01) {
        const w = want[qi], r = horiz ? G.R(base.x + pos, base.y, w.len, OFF.depth) : G.R(base.x, base.y + pos, OFF.depth, w.len);
        if (cores.some((c) => G.overlaps(c, r))) { pos += 0.5; continue; }
        const room = mk(ctx, w.kind, w.name, 'office', r, [doorOn(r, row === 0 ? b.side : opposite(b.side), 0.9)], w.occ); // row 0 opens to the corridor ring, row 1 to the open floor
        rooms.push(room); grid.fill(room.rect, C.ROOM, rooms.length - 1); placedArea += room.area; pos += w.len; qi++;
      }
      if (qi >= want.length) break;
    }
    if (qi < want.length) flags.push(`Office: ${want.length - qi} support rooms did not fit beside the core; the plate is tight around the core.`);
    const open = mk(ctx, 'open', 'Open office', 'office', G.bboxOf(plate), [], Math.round((openArea - placedArea) / LOAD.office));
    open.noWalls = true; rooms.push(open);
    // lease depth advice: distance from core ring to glass
    const bb = G.bboxOf(plate), cb = G.bboxOf(corridors), depths = [cb.x - bb.x, bb.x + bb.w - cb.x - cb.w, cb.y - bb.y, bb.y + bb.d - cb.y - cb.d];
    const maxDepth = Math.max(...depths);
    return { rooms, flags, metrics: { occupants: open.occ + rooms.reduce((a, r) => a + (r.kind === 'open' ? 0 : r.occ), 0), officeStaff: staff, leaseDepth: maxDepth, openArea } };
  }

  /* ---------- retail: CRUs along the street ---------- */
  function retail(ctx) {
    const { grid, site, cores } = ctx, rooms = [], flags = [];
    const std = CODES.layout.plate.retail;
    let cruCount = 0, badFront = 0, shallow = 0, occupants = 0;
    for (const tile of ctx.tiles) {
      const r = tile.rect;
      const front = touching(r, site, site.frontage) || (r.d >= r.w ? 'W' : 'S');
      const back = opposite(front), horiz = front === 'S' || front === 'N';
      const L = horiz ? r.w : r.d, depth = horiz ? r.d : r.w;
      if (!touching(r, site, site.frontage)) flags.push(`${tile.name}: block does not reach the ${site.frontage} street edge; CRUs face its ${front} side.`);
      const n = Math.max(1, Math.ceil(L / std.frontageMax)), w = G.snapQ(L / n);
      if (depth < std.depthMin) shallow++;
      for (let i = 0; i < n; i++) {
        const a = i * w, wi = i === n - 1 ? L - a : w;
        let cr = horiz ? G.R(r.x + a, r.y, wi, depth) : G.R(r.x, r.y + a, depth, wi);
        // carve the core out: keep the piece that touches the street
        for (const c of cores) if (cr && G.overlaps(c, cr)) { const pieces = G.subtract(cr, c).filter((p) => (front === 'S' ? p.y <= r.y + 0.01 : front === 'N' ? p.y + p.d >= r.y + r.d - 0.01 : front === 'W' ? p.x <= r.x + 0.01 : p.x + p.w >= r.x + r.w - 0.01)); cr = pieces.sort((p, q) => G.area(q) - G.area(p))[0] || null; }
        if (!cr || (horiz ? cr.w : cr.d) < 3) continue;
        if ((horiz ? cr.w : cr.d) < std.frontageMin) badFront++;
        const backIsLane = touching(cr, site, site.lane) === back;
        const cru = mk(ctx, 'cru', `CRU ${++cruCount}`, 'retail', cr, [Object.assign(doorOn(cr, front, 1.2), { exit: true }), Object.assign(doorOn(cr, back, 0.9, 0.3), backIsLane ? { exit: true } : {})], Math.round(G.area(cr) * 0.75 / LOAD.retail));
        rooms.push(cru); grid.fill(cru.rect, C.ROOM, rooms.length - 1); occupants += cru.occ;
        // stock room at the back, 25% of depth, beside the rear door
        const sd = G.snapQ(Math.min(6, Math.max(2.5, (horiz ? cr.d : cr.w) * 0.25)));
        const sw = G.snapQ((horiz ? cr.w : cr.d) * 0.6);
        const sr = horiz ? G.R(cr.x + (horiz ? cr.w : cr.d) - sw, back === 'N' ? cr.y + cr.d - sd : cr.y, sw, sd) : G.R(back === 'E' ? cr.x + cr.w - sd : cr.x, cr.y + cr.d - sw, sd, sw);
        const stock = mk(ctx, 'stock', 'Stock', 'retail', sr, [doorOn(sr, front, 0.9)], 0, cru.id); rooms.push(stock);
      }
    }
    if (badFront) flags.push(`${badFront} CRU${badFront > 1 ? 's are' : ' is'} narrower than ${std.frontageMin} m of frontage.`);
    if (shallow) flags.push(`Retail block shallower than ${std.depthMin} m: CRUs will not lease.`);
    return { rooms, flags, metrics: { occupants, crus: cruCount } };
  }

  /* ---------- restaurant: dining + back of house ---------- */
  function restaurant(ctx) {
    const { grid, site } = ctx, rooms = [], flags = [];
    let occupants = 0, bohShare = 0;
    for (const tile of ctx.tiles) {
      const r = tile.rect, front = touching(r, site, site.frontage) || 'S', back = opposite(front), horiz = front === 'S' || front === 'N';
      const depth = horiz ? r.d : r.w, width = horiz ? r.w : r.d;
      const bohD = G.snapQ(Math.max(4.5, depth * 0.35));
      if (depth <= bohD || width <= 7.8) { flags.push(`${tile.name}: restaurant plate is too small for dining and back of house.`); continue; }
      bohShare = bohD / depth;
      const dineRect = horiz ? G.R(r.x, front === 'S' ? r.y : r.y + bohD, r.w, depth - bohD) : G.R(front === 'W' ? r.x : r.x + bohD, r.y, depth - bohD, r.d);
      const bohRect = horiz ? G.R(r.x, front === 'S' ? r.y + r.d - bohD : r.y, r.w, bohD) : G.R(front === 'W' ? r.x + r.w - bohD : r.x, r.y, bohD, r.d);
      const dining = mk(ctx, 'dining', 'Dining', 'restaurant', dineRect, [Object.assign(doorOn(dineRect, front, 1.2, 0.5), { exit: true })], Math.round(G.area(dineRect) / LOAD.dining));
      if (G.area(dineRect) > 200 || dining.occ > 60) dining.doors.push(Object.assign(doorOn(dineRect, front, 0.9, 0.1), { exit: true }));
      rooms.push(dining); grid.fill(dining.rect, C.ROOM, rooms.length - 1);
      // BOH split along width: washrooms (2 × 2.4), kitchen (rest), storage 3.0
      const wcW = 2.4, stW = 3.0, kW = G.snapQ(width - 2 * wcW - stW);
      let pos = 0;
      const place = (kind, name, w, doorSide, occ, extraDoor) => { const rr = horiz ? G.R(bohRect.x + pos, bohRect.y, w, bohD) : G.R(bohRect.x, bohRect.y + pos, bohD, w); const room = mk(ctx, kind, name, 'restaurant', rr, [doorOn(rr, doorSide, 0.9)], occ, dining.id); if (extraDoor) room.doors.push(extraDoor(rr)); rooms.push(room); grid.fill(room.rect, C.ROOM, rooms.length - 1); pos += w; return room; };
      place('wc', 'WC', wcW, front, 2); place('wc', 'WC', wcW, front, 2);
      const laneBack = touching(bohRect, site, site.lane) === back;
      place('kitchen', 'Kitchen', kW, front, Math.round(kW * bohD / LOAD.kitchen), (rr) => Object.assign(doorOn(rr, back, 0.9, 0.5), laneBack ? { exit: true } : {}));
      place('storage', 'Dry / cold store', stW, front, 0);
      occupants = rooms.reduce((a, x) => a + x.occ, 0);
    }
    return { rooms, flags, metrics: { occupants, bohShare } };
  }

  /* ---------- amenity: fitness, multipurpose, change rooms around the core ring ---------- */
  function amenity(ctx) {
    const { grid, plate, corridors } = ctx, rooms = [], flags = [];
    if (!corridors.length) return { rooms, flags: ['Amenity floor has no core ring.'], metrics: {} };
    const bnds = PlanRes.bands(plate, corridors, ctx.cores || []).sort((a, b) => G.area(b.rect) - G.area(a.rect));
    const kinds = ['multi', 'fitness', 'change', 'lounge'];
    let occupants = 0;
    bnds.forEach((b, i) => {
      const kind = G.area(b.rect) < 60 ? 'service' : kinds[Math.min(i, kinds.length - 1)];
      const horiz = b.side === 'N' || b.side === 'S';
      if (kind === 'change') { // split in two along the face
        const half = horiz ? G.snapQ(b.rect.w / 2) : G.snapQ(b.rect.d / 2);
        const r1 = horiz ? G.R(b.rect.x, b.rect.y, half, b.rect.d) : G.R(b.rect.x, b.rect.y, b.rect.w, half), r2 = horiz ? G.R(b.rect.x + half, b.rect.y, b.rect.w - half, b.rect.d) : G.R(b.rect.x, b.rect.y + half, b.rect.w, b.rect.d - half);
        for (const [rr, nm] of [[r1, 'Change room A'], [r2, 'Change room B']]) { const room = mk(ctx, 'change', nm, 'amenity', rr, [doorOn(rr, b.side, 0.9, clampFrac(rr, b, horiz))], Math.round(G.area(rr) / LOAD.change)); rooms.push(room); grid.fill(room.rect, C.ROOM, rooms.length - 1); occupants += room.occ; }
        return; }
      const occ = Math.round(G.area(b.rect) / (kind === 'fitness' ? LOAD.fitness : kind === 'multi' ? LOAD.multi : LOAD.change));
      const doors = [doorOn(b.rect, b.side, 1.0, clampFrac(b.rect, b, horiz))];
      if (G.area(b.rect) > 200 || occ > 60) doors.push(doorOn(b.rect, b.side, 0.9, clampFrac(b.rect, b, horiz, 0.15)));
      const room = mk(ctx, kind, kind === 'multi' ? 'Multipurpose room' : kind === 'fitness' ? 'Fitness' : kind === 'service' ? 'Service' : 'Lounge', 'amenity', b.rect, doors, kind === 'service' ? 0 : occ);
      rooms.push(room); grid.fill(room.rect, C.ROOM, rooms.length - 1); occupants += occ;
    });
    return { rooms, flags, metrics: { occupants } };
  }
  function clampFrac(rect, b, horiz, pref = 0.5) { // door position fraction so the door lands on the corridor face
    const lo = Math.max(horiz ? rect.x : rect.y, b.face[0]) + 0.6, hi = Math.min(horiz ? rect.x + rect.w : rect.y + rect.d, b.face[1]) - 0.6;
    const span = horiz ? rect.w : rect.d, base = horiz ? rect.x : rect.y;
    const at = Math.min(Math.max(base + span * pref, lo), Math.max(lo, hi));
    return (at - base) / span;
  }

  return { generate, LOAD };
})();
