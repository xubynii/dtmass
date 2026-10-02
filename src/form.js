/* form.js — sculpted tower forms, ported from the Supertall Massing Lab's massing engine (typologies, terrace rules, void rules,
   storey edits, precedents, uploaded massing). Only the massing is imported: no program engine, water, energy or impact studies.
   A block may carry b.form. The block's w × d is the base plate, floors × f2f the height, and its centre the tower centre.
   Form.floors(b, project) returns the true per-floor plates (rotated rectangles with 1 m void masks). Form.expand(project)
   returns a copy of the project in which every sculpted block is replaced by axis-aligned rectangle slices, which is what the
   levels, plans, checks, FSR and report use. Rotated plates (twist or plan rotation) are sliced as one equal-area plate per
   storey and flagged approx. Units are metres; x east, y north, z up. */
window.Form = (function () {
  'use strict';
  const pct = (v) => Math.round(v * 100) + '%';
  /* ---------- definitions (from the Supertall lab, ranges adapted to downtown blocks) ---------- */
  const TYPES = {
    prism: { name: 'Extruded prism', params: [], blurb: 'One plate top to bottom. Use it to add terraces, voids or storey edits to a plain block.' },
    taper: { name: 'Tapered shaft', params: ['taper', 'profile'], blurb: 'The plate shrinks with height toward the top plate scale.' },
    twist: { name: 'Twisting tower', params: ['twist', 'twistTaper'], blurb: 'Each plate rotates about the centre as the tower rises.' },
    tiered: { name: 'Set-back tiers', params: ['tiers', 'setback', 'align'], blurb: 'Stepped volumes on a broad base; each tier steps in.' },
    stacked: { name: 'Shifted stack', params: ['blocks', 'shift', 'blockTaper'], blurb: 'Blocks slide off one another; the shifts leave terraces.' },
    upload: { name: 'Uploaded massing', params: [], blurb: 'Your own model (.3dm, .obj or .json), sliced into storeys at this block’s floor-to-floor height.' },
  };
  const P = {
    taper: { label: 'Top plate scale', min: 0.3, max: 0.98, step: 0.01, fmt: pct, def: 0.6 },
    profile: { label: 'Taper profile', min: 0.5, max: 2.5, step: 0.05, fmt: (v) => (Math.abs(v - 1) < 0.03 ? 'linear' : v < 1 ? 'concave ' + v.toFixed(2) : 'convex ' + v.toFixed(2)), def: 1.2 },
    twist: { label: 'Total twist', min: 0, max: 180, step: 5, fmt: (v) => v + '°', def: 60 },
    twistTaper: { label: 'Top plate scale', min: 0.6, max: 1, step: 0.01, fmt: pct, def: 0.9 },
    tiers: { label: 'Tiers', min: 2, max: 6, step: 1, fmt: (v) => v, def: 3 },
    setback: { label: 'Setback per tier', min: 0.05, max: 0.3, step: 0.01, fmt: pct, def: 0.15 },
    align: { label: 'Setback alignment', min: 0, max: 1, step: 0.05, fmt: (v) => (v < 0.03 ? 'centred' : v > 0.97 ? 'flush to one corner' : pct(v) + ' toward corner'), def: 0.5 },
    blocks: { label: 'Blocks', min: 2, max: 6, step: 1, fmt: (v) => v, def: 3 },
    shift: { label: 'Block shift', min: 0, max: 0.5, step: 0.01, fmt: (v) => pct(v) + ' of plate', def: 0.15 },
    blockTaper: { label: 'Block shrink toward top', min: 0, max: 0.35, step: 0.01, fmt: pct, def: 0.1 },
  };
  const FACE_OPTS = [['S', 'South (−y)'], ['N', 'North (+y)'], ['E', 'East (+x)'], ['W', 'West (−x)']];
  const FACES = { S: { n: [0, -1], along: [1, 0] }, N: { n: [0, 1], along: [-1, 0] }, E: { n: [1, 0], along: [0, 1] }, W: { n: [-1, 0], along: [0, -1] } };
  const lv = (v) => Math.round(v * 100) + '% up';
  const VOIDS = {
    f2f: { name: 'Face-to-face void', blurb: 'A portal on one face, a portal on another, a Bezier spine between them with rectangular sections swept along it. Bulge swells the middle or pinches it.',
      params: { faceA: { label: 'Portal A face', options: FACE_OPTS }, zA: { label: 'Portal A height', min: 0.02, max: 0.98, step: 0.005, fmt: lv }, uA: { label: 'Portal A offset along face', min: -0.8, max: 0.8, step: 0.05, fmt: (v) => v.toFixed(2) }, wA: { label: 'Portal A width', min: 3, max: 40, step: 1, fmt: (v) => v + ' m' }, hA: { label: 'Portal A height', min: 3, max: 30, step: 1, fmt: (v) => v + ' m' },
        faceB: { label: 'Portal B face', options: FACE_OPTS }, zB: { label: 'Portal B height', min: 0.02, max: 0.98, step: 0.005, fmt: lv }, uB: { label: 'Portal B offset along face', min: -0.8, max: 0.8, step: 0.05, fmt: (v) => v.toFixed(2) }, wB: { label: 'Portal B width', min: 3, max: 40, step: 1, fmt: (v) => v + ' m' }, hB: { label: 'Portal B height', min: 3, max: 30, step: 1, fmt: (v) => v + ' m' },
        bulge: { label: 'Bulge', min: -0.5, max: 0.6, step: 0.05, fmt: (v) => (v > 0.02 ? 'swell +' + v.toFixed(2) : v < -0.02 ? 'pinch ' + v.toFixed(2) : 'straight') }, pull: { label: 'Pull (perpendicular run)', min: 2, max: 24, step: 1, fmt: (v) => v + ' m' } },
      defaults: { faceA: 'S', zA: 0.3, uA: -0.2, wA: 12, hA: 9, faceB: 'E', zB: 0.42, uB: 0.25, wB: 10, hB: 8, bulge: 0.25, pull: 8 } },
    gardens: { name: 'Spiralling sky gardens', blurb: 'A multi-storey garden bitten from one face, the next one higher on the next face, spiralling around the plan.',
      params: { from: { label: 'From', min: 0, max: 1, step: 0.01, fmt: lv }, to: { label: 'To', min: 0, max: 1, step: 0.01, fmt: lv }, span: { label: 'Garden height', min: 1, max: 6, step: 1, fmt: (v) => v + ' storeys' }, every: { label: 'New garden every', min: 2, max: 16, step: 1, fmt: (v) => v + ' storeys' }, depth: { label: 'Bite depth', min: 3, max: 20, step: 0.5, fmt: (v) => v + ' m' }, width: { label: 'Bite width', min: 0.3, max: 1, step: 0.05, fmt: pct }, sides: { label: 'Faces in rotation', options: [[4, 'four faces'], [3, 'three faces'], [2, 'east and west']] } },
      defaults: { from: 0.1, to: 0.95, span: 2, every: 4, depth: 6, width: 0.6, sides: 4 } },
    oasis: { name: 'Open-air oasis', blurb: 'Several storeys opened to the air around the core, with only structure passing through. Repeat it for stacked sky terraces.',
      params: { at: { label: 'Starts at', min: 0.05, max: 0.9, step: 0.01, fmt: lv }, floors: { label: 'Height', min: 1, max: 6, step: 1, fmt: (v) => v + ' storeys' }, open: { label: 'Plate opened', min: 0.4, max: 1, step: 0.05, fmt: pct }, every: { label: 'Repeat every', min: 0, max: 30, step: 1, fmt: (v) => (v ? v + ' storeys' : 'no repeat') } },
      defaults: { at: 0.4, floors: 2, open: 0.85, every: 0 } },
    ribbon: { name: 'Pixel ribbon', blurb: 'A ribbon of removed pixels winds around the shaft, making oversized terraces.',
      params: { from: { label: 'From', min: 0, max: 1, step: 0.01, fmt: lv }, to: { label: 'To', min: 0, max: 1, step: 0.01, fmt: lv }, turns: { label: 'Turns', min: 0.25, max: 3, step: 0.25, fmt: (v) => v + ' ×' }, size: { label: 'Pixel size', min: 3, max: 18, step: 1, fmt: (v) => v + ' m' }, wobble: { label: 'Wobble', min: 0, max: 1, step: 0.05, fmt: pct } },
      defaults: { from: 0.1, to: 0.98, turns: 1, size: 7, wobble: 0.5 } },
    crown: { name: 'Crown opening', blurb: 'A through-opening that widens toward the top, leaving two legs.',
      params: { from: { label: 'Opens from', min: 0.5, max: 0.95, step: 0.01, fmt: lv }, width: { label: 'Width at top', min: 0.2, max: 0.8, step: 0.05, fmt: pct }, axis: { label: 'Opening runs along', options: [['y', 'y (through N–S)'], ['x', 'x (through E–W)']] } },
      defaults: { from: 0.8, width: 0.45, axis: 'y' } },
    atria: { name: 'Zone atria', blurb: 'The tower is stacked in zones, each with a perimeter garden at its base.',
      params: { from: { label: 'From', min: 0, max: 1, step: 0.01, fmt: lv }, to: { label: 'To', min: 0, max: 1, step: 0.01, fmt: lv }, every: { label: 'Zone height', min: 4, max: 20, step: 1, fmt: (v) => v + ' storeys' }, span: { label: 'Garden height', min: 1, max: 4, step: 1, fmt: (v) => v + ' storeys' }, margin: { label: 'Perimeter depth', min: 2, max: 10, step: 0.5, fmt: (v) => v + ' m' } },
      defaults: { from: 0.1, to: 0.95, every: 8, span: 1, margin: 3 } },
    wells: { name: 'Spiralling lightwells', blurb: 'Perimeter wells, each storey rotated a few degrees from the one below, so the wells spiral up the shaft.',
      params: { from: { label: 'From', min: 0, max: 1, step: 0.01, fmt: lv }, to: { label: 'To', min: 0, max: 1, step: 0.01, fmt: lv }, count: { label: 'Wells', min: 2, max: 8, step: 1, fmt: (v) => v }, size: { label: 'Well size', min: 2, max: 8, step: 0.5, fmt: (v) => v + ' m' }, spin: { label: 'Rotation per storey', min: 0, max: 12, step: 0.5, fmt: (v) => v + '°' }, inset: { label: 'Ring radius', min: 0.5, max: 0.95, step: 0.05, fmt: pct } },
      defaults: { from: 0.05, to: 0.97, count: 4, size: 3, spin: 5, inset: 0.8 } },
  };
  const STEPS = {
    none: { name: 'None', params: {} },
    spiral: { name: 'Cascading spiral terraces', blurb: 'One terrace per storey, stepping around the plan so the volume tapers as it climbs.',
      params: { from: { label: 'From', min: 0, max: 0.9, step: 0.01, fmt: lv }, to: { label: 'To', min: 0.1, max: 1, step: 0.01, fmt: lv }, step: { label: 'Step per side per turn', min: 0.5, max: 4, step: 0.1, fmt: (v) => v.toFixed(1) + ' m' }, perTurn: { label: 'Storeys per turn', min: 4, max: 32, step: 1, fmt: (v) => v } },
      defaults: { from: 0.1, to: 1, step: 1.5, perTurn: 12 } },
    wave: { name: 'Undulating terraces', blurb: 'The slab edge on every face swells and recedes storey by storey.',
      params: { from: { label: 'From', min: 0, max: 0.9, step: 0.01, fmt: lv }, to: { label: 'To', min: 0.1, max: 1, step: 0.01, fmt: lv }, amp: { label: 'Terrace depth', min: 1, max: 6, step: 0.25, fmt: (v) => v.toFixed(2) + ' m' }, period: { label: 'Vertical period', min: 4, max: 20, step: 1, fmt: (v) => v + ' storeys' }, waves: { label: 'Waves per face', min: 1, max: 4, step: 1, fmt: (v) => v } },
      defaults: { from: 0.05, to: 1, amp: 2.5, period: 9, waves: 2 } },
    pixel: { name: 'Staggered slabs', blurb: 'Slabs slide off axis a little each, making cantilevered terraces.',
      params: { from: { label: 'From', min: 0, max: 0.9, step: 0.01, fmt: lv }, to: { label: 'To', min: 0.1, max: 1, step: 0.01, fmt: lv }, jitter: { label: 'Max offset', min: 0.5, max: 6, step: 0.5, fmt: (v) => v + ' m' }, seed: { label: 'Seed', min: 1, max: 20, step: 1, fmt: (v) => v } },
      defaults: { from: 0.6, to: 1, jitter: 2, seed: 7 } },
    ziggurat: { name: 'Regular setbacks', blurb: 'Every few storeys the plate steps in by a fixed amount on the chosen faces.',
      params: { from: { label: 'From', min: 0, max: 0.9, step: 0.01, fmt: lv }, to: { label: 'To', min: 0.1, max: 1, step: 0.01, fmt: lv }, step: { label: 'Step', min: 0.5, max: 3, step: 0.1, fmt: (v) => v.toFixed(1) + ' m' }, every: { label: 'Every', min: 1, max: 8, step: 1, fmt: (v) => v + ' storeys' }, sides: { label: 'Faces', options: [['all', 'all faces'], ['x', 'east and west'], ['y', 'north and south'], ['one', 'east only']] } },
      defaults: { from: 0.3, to: 1, step: 1, every: 3, sides: 'all' } },
  };
  const EDIT = { sx: { label: 'Width scale', min: 0.4, max: 1.6, step: 0.01, neutral: 1, fmt: pct }, sy: { label: 'Depth scale', min: 0.4, max: 1.6, step: 0.01, neutral: 1, fmt: pct }, dx: { label: 'Shift east', min: -20, max: 20, step: 0.5, neutral: 0, fmt: (v) => (v > 0 ? '+' : '') + v + ' m' }, dy: { label: 'Shift north', min: -20, max: 20, step: 0.5, neutral: 0, fmt: (v) => (v > 0 ? '+' : '') + v + ' m' }, rot: { label: 'Rotate plate', min: -90, max: 90, step: 1, neutral: 0, fmt: (v) => (v > 0 ? '+' : '') + v + '°' } };
  /* precedent rules (massing mechanism only) */
  const PRECEDENTS = [
    { name: 'Commerzbank Tower', city: 'Frankfurt · Foster + Partners', mech: 'Multi-storey sky gardens spiral up the plan, one face at a time.', apply: 'void', type: 'gardens', preset: { from: 0.1, to: 0.95, span: 3, every: 4, depth: 7, width: 1, sides: 3 } },
    { name: 'CapitaSpring', city: 'Singapore · BIG + Carlo Ratti', mech: 'A four-storey open-air garden partway up the tower.', apply: 'void', type: 'oasis', preset: { at: 0.33, floors: 4, open: 0.85, every: 0 } },
    { name: 'Oasia Hotel Downtown', city: 'Singapore · WOHA', mech: 'Open-sided sky terraces repeated up the tower.', apply: 'void', type: 'oasis', preset: { at: 0.15, floors: 3, open: 0.9, every: 8 } },
    { name: 'Shanghai Tower', city: 'Shanghai · Gensler', mech: 'Stacked zones, each with a perimeter garden at its base.', apply: 'void', type: 'atria', preset: { from: 0.05, to: 0.95, every: 8, span: 1, margin: 3 } },
    { name: 'MahaNakhon', city: 'Bangkok · Büro Ole Scheeren', mech: 'A ribbon of removed pixels winds around the shaft.', apply: 'void', type: 'ribbon', preset: { from: 0.05, to: 0.98, turns: 1.5, size: 7, wobble: 0.6 } },
    { name: 'Kingdom Centre', city: 'Riyadh · Ellerbe Becket + Omrania', mech: 'A widening opening through the crown leaves two legs.', apply: 'void', type: 'crown', preset: { from: 0.7, width: 0.55, axis: 'y' } },
    { name: '30 St Mary Axe', city: 'London · Foster + Partners', mech: 'Perimeter lightwells that rotate a few degrees per storey.', apply: 'void', type: 'wells', preset: { from: 0.03, to: 0.97, count: 6, size: 3, spin: 5, inset: 0.8 } },
    { name: 'The Spiral', city: 'New York · BIG', mech: 'A terrace on every level, stepping around the tower as it tapers.', apply: 'step', mode: 'spiral', preset: { from: 0.1, to: 1, step: 1.5, perTurn: 12 } },
    { name: 'Aqua', city: 'Chicago · Studio Gang', mech: 'Slab edges that swell and recede floor by floor.', apply: 'step', mode: 'wave', preset: { from: 0.05, to: 1, amp: 2.5, period: 9, waves: 2 } },
    { name: '56 Leonard', city: 'New York · Herzog & de Meuron', mech: 'Staggered slabs slide off axis near the top.', apply: 'step', mode: 'pixel', preset: { from: 0.7, to: 1, jitter: 2.5, seed: 7 } },
    { name: 'Absolute World', city: 'Mississauga · MAD', mech: 'Each floor turns a little about the core.', apply: 'type', type: 'twist', preset: { twist: 90, twistTaper: 0.95 } },
  ];
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const defaultsFor = (defs) => { const o = {}; for (const k in defs) o[k] = defs[k].def; return o; };
  function newForm(type) { const f = { type, p: {}, rot: 0, step: { mode: 'none' }, voids: [], edits: {} }; for (const k of (TYPES[type] || TYPES.prism).params) f.p[k] = P[k].def; return f; }
  const active = (b) => !!(b && b.form && b.form.type && b.use !== 'core' && b.use !== 'parking' && (b.form.type !== 'prism' || (b.form.voids && b.form.voids.length) || (b.form.step && b.form.step.mode !== 'none') || (b.form.edits && Object.keys(b.form.edits).length) || Math.abs(b.form.rot || 0) > 0.01));
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const inRange = (fl, p) => fl.t >= (p.from || 0) && fl.t <= (p.to === undefined ? 1 : p.to);
  const toLocal = (fl, x, y) => { const c = Math.cos(fl.rot), s = Math.sin(fl.rot), dx = x - fl.cx, dy = y - fl.cy; return { x: dx * c + dy * s, y: -dx * s + dy * c }; };
  const toWorld = (fl, lx, ly) => { const c = Math.cos(fl.rot), s = Math.sin(fl.rot); return { x: fl.cx + lx * c - ly * s, y: fl.cy + lx * s + ly * c }; };
  const rotV = (rot, v) => { const c = Math.cos(rot), s = Math.sin(rot); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c]; };

  /* ---------- plates ---------- */
  function plates(b) {
    const F = b.form, W = b.w, D = b.d, f = b.f2f, N = b.floors, H = N * f, bx = b.x + W / 2, by = b.y + D / 2, R0 = (F.rot || 0) * Math.PI / 180, p = F.p || {}, st = F.step || { mode: 'none' }, out = [];
    let tierB = []; if (F.type === 'tiered') { const ws = []; let sum = 0; for (let k = 0; k < p.tiers; k++) { const w = 1 - 0.12 * k; ws.push(w); sum += w; } let acc = 0; for (const w of ws) { acc += w / sum; tierB.push(acc); } }
    const U = F.type === 'upload' ? F.upload : null; let stepI0 = null;
    for (let i = 0; i < N; i++) {
      const z = i * f, t = F.span && F.span.H > 0 ? Math.min(1, Math.max(0, (b.z0 + z + f / 2 - F.span.z0) / F.span.H)) : (z + f / 2) / H, o = (F.edits && F.edits[i]) || {}; let cx = 0, cy = 0, w = W, d = D, rot = 0, mask = null;
      if (U) { const zm = z + f / 2; let bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9; const cells = [];
        for (let iy = 0; iy < U.ny; iy++) for (let ix = 0; ix < U.nx; ix++) { const iv = U.ints[iy * U.nx + ix]; if (!iv) continue; let inside = false; for (let q = 0; q < iv.length; q += 2) if (zm >= iv[q] && zm <= iv[q + 1]) { inside = true; break; } if (inside) { cells.push(ix, iy); bx0 = Math.min(bx0, ix); bx1 = Math.max(bx1, ix); by0 = Math.min(by0, iy); by1 = Math.max(by1, iy); } }
        if (!cells.length) continue;
        const ksx = W / (U.ext.w * U.cell), ksy = D / (U.ext.d * U.cell), nx = bx1 - bx0 + 1, ny = by1 - by0 + 1; w = nx * U.cell; d = ny * U.cell; cx = ((bx0 - U.f0[0]) * U.cell + w / 2 - U.ext.w * U.cell / 2) * ksx; cy = ((by0 - U.f0[1]) * U.cell + d / 2 - U.ext.d * U.cell / 2) * ksy;
        mask = { nx, ny, x0: -w / 2, y0: -d / 2, cs: U.cell, cells: new Uint8Array(nx * ny) }; for (let k = 0; k < cells.length; k += 2) mask.cells[(cells[k + 1] - by0) * nx + (cells[k] - bx0)] = 1; w *= ksx; d *= ksy; mask.x0 *= ksx; mask.y0 *= ksy; mask.csx = U.cell * ksx; mask.csy = U.cell * ksy; }
      else if (F.type === 'taper') { const s = 1 - (1 - p.taper) * Math.pow(t, p.profile); w = W * s; d = D * s; }
      else if (F.type === 'twist') { const s = 1 - (1 - p.twistTaper) * t; w = W * s; d = D * s; rot = p.twist * Math.PI / 180 * t; }
      else if (F.type === 'tiered') { let k = 0; while (k < tierB.length - 1 && t > tierB[k]) k++; const s = Math.pow(1 - p.setback, k); w = W * s; d = D * s; cx = p.align * (W - w) / 2; cy = p.align * (D - d) / 2; }
      else if (F.type === 'stacked') { const k = Math.min(p.blocks - 1, Math.floor(t * p.blocks)); const s = 1 - p.blockTaper * (k / Math.max(1, p.blocks - 1)); w = W * s; d = D * s; if (k > 0) { const dir = [[1, 0], [0, 1], [-1, 0], [0, -1]][(k - 1) % 4]; cx = dir[0] * p.shift * W; cy = dir[1] * p.shift * D; } }
      if (!U && st.mode !== 'none' && inRange({ t }, st)) { if (stepI0 === null) stepI0 = i; const k = i - stepI0;
        if (st.mode === 'spiral') { const q = k / st.perTurn, off = [0, 0, 0, 0]; for (let s = 0; s < 4; s++) { const u = q - s / 4; if (u > 0) { const fu = Math.floor(u); off[s] = st.step * (fu + Math.min(1, (u - fu) * 4)); } } w -= off[0] + off[2]; cx += (off[2] - off[0]) / 2; d -= off[1] + off[3]; cy += (off[3] - off[1]) / 2; }
        else if (st.mode === 'pixel') { const r = mulberry(st.seed * 1000 + i); cx += (r() * 2 - 1) * st.jitter; cy += (r() * 2 - 1) * st.jitter; w *= 1 + (r() * 2 - 1) * 0.08; d *= 1 + (r() * 2 - 1) * 0.08; }
        else if (st.mode === 'ziggurat') { const ins = Math.floor(k / st.every) * st.step; if (st.sides === 'all') { w -= 2 * ins; d -= 2 * ins; } else if (st.sides === 'x') w -= 2 * ins; else if (st.sides === 'y') d -= 2 * ins; else { w -= ins; cx -= ins / 2; } } }
      if (!U) { if (o.sx) w *= o.sx; if (o.sy) d *= o.sy; } if (o.dx) cx += o.dx; if (o.dy) cy += o.dy; if (o.rot) rot += o.rot * Math.PI / 180;
      w = Math.max(3, w); d = Math.max(3, d);
      const c = Math.cos(R0), s = Math.sin(R0);
      out.push({ i, z: b.z0 + z, h: f, t, cx: bx + cx * c - cy * s, cy: by + cx * s + cy * c, rot: rot + R0, w, d, mask });
    }
    return { floors: out, H };
  }
  /* ---------- 1 m masks and void rules ---------- */
  function newMask(fl) { const nx = Math.max(1, Math.ceil(fl.w)), ny = Math.max(1, Math.ceil(fl.d)); fl.mask = { nx, ny, x0: -fl.w / 2, y0: -fl.d / 2, cells: new Uint8Array(nx * ny).fill(1) }; }
  const csx = (m) => m.csx || 1, csy = (m) => m.csy || 1;
  function cellsIn(fl, x0, x1, y0, y1, fn) { const m = fl.mask, sx = csx(m), sy = csy(m);
    const ix0 = Math.max(0, Math.floor((x0 - m.x0) / sx)), ix1 = Math.min(m.nx - 1, Math.ceil((x1 - m.x0) / sx)), iy0 = Math.max(0, Math.floor((y0 - m.y0) / sy)), iy1 = Math.min(m.ny - 1, Math.ceil((y1 - m.y0) / sy));
    for (let iy = iy0; iy <= iy1; iy++) { const ly = m.y0 + (iy + 0.5) * sy; if (ly < y0 || ly > y1) continue; for (let ix = ix0; ix <= ix1; ix++) { const lx = m.x0 + (ix + 0.5) * sx; if (lx < x0 || lx > x1) continue; fn(iy * m.nx + ix, lx, ly); } } }
  const cutRect = (fl, x0, x1, y0, y1) => cellsIn(fl, x0, x1, y0, y1, (k) => { fl.mask.cells[k] = 0; });
  const cutFn = (fl, x0, x1, y0, y1, test) => cellsIn(fl, x0, x1, y0, y1, (k, lx, ly) => { if (test(lx, ly)) fl.mask.cells[k] = 0; });
  const floorAt = (floors, z) => { for (const fl of floors) if (z < fl.z - floors[0].z + fl.h) return fl; return floors[floors.length - 1]; };
  function facePoint(fl, face, u) { const F = FACES[face]; const half = face === 'S' || face === 'N' ? fl.w / 2 : fl.d / 2; const dist = face === 'S' || face === 'N' ? fl.d / 2 : fl.w / 2; return { x: F.n[0] * dist + F.along[0] * u * half, y: F.n[1] * dist + F.along[1] * u * half }; }
  function f2fFrame(v, floors, H) {
    const z0 = floors[0].z, fa = floorAt(floors, v.zA * H), fb = floorAt(floors, v.zB * H), A = facePoint(fa, v.faceA, v.uA), B = facePoint(fb, v.faceB, v.uB), pa = toWorld(fa, A.x, A.y), pb = toWorld(fb, B.x, B.y), na = rotV(fa.rot, FACES[v.faceA].n), nb = rotV(fb.rot, FACES[v.faceB].n);
    const p0 = [pa.x, pa.y, z0 + v.zA * H], p3 = [pb.x, pb.y, z0 + v.zB * H], p1 = [p0[0] - na[0] * v.pull, p0[1] - na[1] * v.pull, p0[2]], p2 = [p3[0] - nb[0] * v.pull, p3[1] - nb[1] * v.pull, p3[2]];
    const bz = (t) => { const mt = 1 - t, a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t; return [0, 1, 2].map((k) => a * p0[k] + b * p1[k] + c * p2[k] + d * p3[k]); };
    const tg = (t) => { const mt = 1 - t, a = 3 * mt * mt, b = 6 * mt * t, c = 3 * t * t; const v3 = [0, 1, 2].map((k) => a * (p1[k] - p0[k]) + b * (p2[k] - p1[k]) + c * (p3[k] - p2[k])); const L = Math.hypot(...v3) || 1; return v3.map((x) => x / L); };
    return { bz, tg };
  }
  const GEN = {
    f2f(v, floors, H) { const { bz, tg } = f2fFrame(v, floors, H), N = 40, boxes = []; let zmin = 1e9, zmax = -1e9;
      for (let k = 0; k <= N; k++) { const t = -0.04 + 1.08 * k / N, tc = Math.min(1, Math.max(0, t)), P0 = bz(t), T = tg(t), s = 1 + v.bulge * Math.sin(Math.PI * tc), w = (v.wA * (1 - tc) + v.wB * tc) * s, h = (v.hA * (1 - tc) + v.hB * tc) * s;
        let X = [-T[1], T[0], 0]; const L = Math.hypot(X[0], X[1]); X = L < 1e-6 ? [1, 0, 0] : [X[0] / L, X[1] / L, 0]; const Y = [T[1] * X[2] - T[2] * X[1], T[2] * X[0] - T[0] * X[2], T[0] * X[1] - T[1] * X[0]];
        const Pn = bz(t + 1.08 / N), ds = Math.hypot(Pn[0] - P0[0], Pn[1] - P0[1], Pn[2] - P0[2]); boxes.push({ P: P0, T, X, Y, w, h, ds }); zmin = Math.min(zmin, P0[2] - h); zmax = Math.max(zmax, P0[2] + h); }
      for (const fl of floors) { if (fl.z + fl.h < zmin || fl.z > zmax) continue; const zm = fl.z + fl.h / 2, tol = fl.h * 0.3, c = Math.cos(fl.rot), s = Math.sin(fl.rot);
        for (const b of boxes) { if (Math.abs(b.P[2] - zm) > b.h / 2 + b.w / 2 + tol) continue; const Pl = toLocal(fl, b.P[0], b.P[1]), rl = (q) => [q[0] * c + q[1] * s, -q[0] * s + q[1] * c, q[2]], T = rl(b.T), X = rl(b.X), Y = rl(b.Y), R = (b.w + b.h + b.ds) / 2 + 1, ht = b.ds * 0.6 + 0.35;
          cutFn(fl, Pl.x - R, Pl.x + R, Pl.y - R, Pl.y + R, (lx, ly) => { const q = [lx - Pl.x, ly - Pl.y, zm - b.P[2]], ax = q[0] * X[0] + q[1] * X[1] + q[2] * X[2], ay = q[0] * Y[0] + q[1] * Y[1] + q[2] * Y[2], at = q[0] * T[0] + q[1] * T[1] + q[2] * T[2]; return Math.abs(ax) <= b.w / 2 && Math.abs(ay) <= b.h / 2 + tol && Math.abs(at) <= ht; }); } } },
    gardens(v, floors) { const SIDES = { 4: ['E', 'N', 'W', 'S'], 3: ['E', 'N', 'W'], 2: ['E', 'W'] }[v.sides] || ['E', 'N', 'W', 'S']; let i0 = null;
      for (const fl of floors) { if (!inRange(fl, v)) continue; if (i0 === null) i0 = fl.i; const k = fl.i - i0; if (k % v.every >= v.span) continue; const side = SIDES[Math.floor(k / v.every) % SIDES.length], w = fl.w, d = fl.d, dep = v.depth, hw = v.width * w / 2, hd = v.width * d / 2;
        if (side === 'E') cutRect(fl, w / 2 - dep, w, -hd, hd); else if (side === 'W') cutRect(fl, -w, -w / 2 + dep, -hd, hd); else if (side === 'N') cutRect(fl, -hw, hw, d / 2 - dep, d); else cutRect(fl, -hw, hw, -d, -d / 2 + dep); } },
    oasis(v, floors) { const n = floors.length, starts = [], s0 = Math.round(v.at * n); if (v.every > 0) { for (let s = s0; s < n - 1; s += v.every) starts.push(s); } else starts.push(s0); for (const s of starts) for (let i = s; i < Math.min(n - 1, s + v.floors); i++) { const fl = floors[i]; cutRect(fl, -fl.w * v.open / 2, fl.w * v.open / 2, -fl.d * v.open / 2, fl.d * v.open / 2); } },
    ribbon(v, floors) { for (const fl of floors) { if (!inRange(fl, v)) continue; const u = (fl.t - v.from) / Math.max(0.01, v.to - v.from), th = 2 * Math.PI * v.turns * u, size = v.size * (1 + v.wobble * 0.5 * Math.sin(3 * th + 1)), m = Math.max(Math.abs(Math.cos(th)), Math.abs(Math.sin(th))), px = Math.cos(th) / m * fl.w / 2, py = Math.sin(th) / m * fl.d / 2; cutRect(fl, px - size / 2, px + size / 2, py - size / 2, py + size / 2); } },
    crown(v, floors) { for (const fl of floors) { if (fl.t < v.from) continue; const u = (fl.t - v.from) / Math.max(0.01, 1 - v.from), wv = fl.w * v.width * Math.sqrt(u); if (v.axis === 'y') cutRect(fl, -wv / 2, wv / 2, -fl.d, fl.d); else { const dv = fl.d * v.width * Math.sqrt(u); cutRect(fl, -fl.w, fl.w, -dv / 2, dv / 2); } } },
    atria(v, floors) { let i0 = null; for (const fl of floors) { if (!inRange(fl, v)) continue; if (i0 === null) i0 = fl.i; if ((fl.i - i0) % v.every >= v.span) continue; const m = v.margin, w = fl.w, d = fl.d; cutRect(fl, w / 2 - m, w, -d, d); cutRect(fl, -w, -w / 2 + m, -d, d); cutRect(fl, -w, w, d / 2 - m, d); cutRect(fl, -w, w, -d, -d / 2 + m); } },
    wells(v, floors) { for (const fl of floors) { if (!inRange(fl, v)) continue; for (let j = 0; j < v.count; j++) { const a = 2 * Math.PI * j / v.count + v.spin * fl.i * Math.PI / 180, px = Math.cos(a) * v.inset * fl.w / 2, py = Math.sin(a) * v.inset * fl.d / 2; cutRect(fl, px - v.size / 2, px + v.size / 2, py - v.size / 2, py + v.size / 2); } } },
  };
  /* cores never lose floor area to a void; then solid area and the rectangle decomposition */
  function finish(fl, cores) {
    const m = fl.mask, sx = csx(m), sy = csy(m);
    for (const c of cores) { if (c.z0 > fl.z + 0.1 || Model.blockTop(c) < fl.z + fl.h - 0.1) continue; const R = Math.hypot(fl.w, fl.d); cellsIn(fl, -R, R, -R, R, (k, lx, ly) => { const p = toWorld(fl, lx, ly); if (p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.d && Math.abs(lx) <= fl.w / 2 && Math.abs(ly) <= fl.d / 2) m.cells[k] = 1; }); }
    let solid = 0, total = 0; for (let iy = 0; iy < m.ny; iy++) { if (m.y0 + (iy + 0.5) * sy > fl.d / 2) continue; for (let ix = 0; ix < m.nx; ix++) { if (m.x0 + (ix + 0.5) * sx > fl.w / 2) continue; total++; if (m.cells[iy * m.nx + ix]) solid++; } }
    fl.voidFrac = total ? 1 - solid / total : 0; fl.area = fl.w * fl.d * (total ? solid / total : 1);
    const rects = []; let open = {};
    for (let iy = 0; iy < m.ny; iy++) { const next = {}; let ix = 0; while (ix < m.nx) { if (!m.cells[iy * m.nx + ix] || m.x0 + (ix + 0.5) * sx > fl.w / 2 || m.y0 + (iy + 0.5) * sy > fl.d / 2) { ix++; continue; } let e = ix; while (e + 1 < m.nx && m.cells[iy * m.nx + e + 1] && m.x0 + (e + 1.5) * sx <= fl.w / 2) e++; const key = ix + ':' + e, r = open[key]; if (r) { r.iy1 = iy; next[key] = r; } else { const nr = { ix0: ix, ix1: e, iy0: iy, iy1: iy }; rects.push(nr); next[key] = nr; } ix = e + 1; } open = next; }
    fl.rects = rects.map((r) => { const x0 = m.x0 + r.ix0 * sx, x1 = Math.min(fl.w / 2, m.x0 + (r.ix1 + 1) * sx), y0 = m.y0 + r.iy0 * sy, y1 = Math.min(fl.d / 2, m.y0 + (r.iy1 + 1) * sy); return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, d: y1 - y0 }; });
    fl.rotated = Math.abs(Math.sin(fl.rot)) > 1e-3 && Math.abs(Math.cos(fl.rot)) > 1e-3;
    delete fl.mask;
  }
  const cache = new Map();
  function sig(b, cores) { return JSON.stringify([b.x, b.y, b.w, b.d, b.z0, b.floors, b.f2f, b.form, cores.map((c) => [c.x, c.y, c.w, c.d, c.z0, c.f2f])]); }
  function floors(b, project) {
    if (!active(b)) return null;
    const cores = ((project && project.blocks) || []).filter((c) => c.use === 'core' && !c.hidden), key = sig(b, cores), hit = cache.get(key); if (hit) return hit;
    const { floors: fls, H } = plates(b); if (!fls.length) return [];
    for (const fl of fls) if (!fl.mask) newMask(fl);
    const st = b.form.step || {};
    if (st.mode === 'wave' && b.form.type !== 'upload') for (const fl of fls) { if (!inRange(fl, st)) continue; const w = fl.w, d = fl.d, ph = 2 * Math.PI * fl.i / st.period, A = st.amp, k = 2 * Math.PI * st.waves, ins = (s, len, p) => A * (0.5 + 0.5 * Math.sin(k * (s / len) + ph + p)); cutFn(fl, -w, w, -d, d, (lx, ly) => lx > w / 2 - ins(ly, d, 0) || lx < -w / 2 + ins(ly, d, Math.PI / 2) || ly > d / 2 - ins(lx, w, Math.PI) || ly < -d / 2 + ins(lx, w, 1.5 * Math.PI)); }
    for (const v of b.form.voids || []) { const g = GEN[v.type]; if (g) try { g(v, fls, H); } catch (e) { console.warn('void', v.type, e); } }
    for (const fl of fls) finish(fl, cores);
    if (cache.size > 200) cache.clear(); cache.set(key, fls); return fls;
  }
  /* world rectangles for one storey (rotated plates become one equal-area plate) */
  function worldRects(fl) {
    if (!fl.rotated) { const flip = Math.abs(Math.sin(fl.rot)) > 0.5, c = Math.round(Math.cos(fl.rot)), s = Math.round(Math.sin(fl.rot));
      return fl.rects.map((r) => { const wx = flip ? r.d : r.w, wy = flip ? r.w : r.d, px = fl.cx + r.x * c - r.y * s, py = fl.cy + r.x * s + r.y * c; return { x: px - wx / 2, y: py - wy / 2, w: wx, d: wy }; }); }
    const k = Math.sqrt(Math.max(0, fl.area) / (fl.w * fl.d)), w = fl.w * k, d = fl.d * k; return [{ x: fl.cx - w / 2, y: fl.cy - d / 2, w, d, approx: true }];
  }
  const r2 = (v) => Math.round(v * 100) / 100;
  function slices(b, project) {
    const fls = floors(b, project); if (!fls) return [b]; const out = []; let prevKey = null, group = null;
    const flush = () => { if (!group) return; group.rects.forEach((r, j) => out.push(Object.assign({}, b, { id: `${b.id}~${group.i0}.${j}`, src: b.id, name: b.name, x: r2(r.x), y: r2(r.y), w: r2(r.w), d: r2(r.d), z0: group.z0, floors: group.n, form: undefined, approx: !!r.approx }))); group = null; };
    for (const fl of fls) { const rs = worldRects(fl).filter((r) => r.w > 0.4 && r.d > 0.4), key = rs.map((r) => [r2(r.x), r2(r.y), r2(r.w), r2(r.d)].join(',')).join('|');
      if (group && key === prevKey && Math.abs(group.z0 + group.n * b.f2f - fl.z) < 1e-6) group.n++; else { flush(); group = { i0: fl.i, z0: fl.z, n: 1, rects: rs }; prevKey = key; } }
    flush(); return out;
  }
  function expand(project) { if (!project.blocks.some(active)) return project; return Object.assign({}, project, { blocks: project.blocks.flatMap((b) => (active(b) ? slices(b, project) : [b])) }); }
  function bounds(b, project) { const fls = floors(b, project); if (!fls) return { x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.d }; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const fl of fls) for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const p = toWorld(fl, sx * fl.w / 2, sy * fl.d / 2); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); } return { x0, y0, x1, y1 }; }
  /* render boxes: consecutive identical storeys merged */
  function boxes(b, project) { const fls = floors(b, project); if (!fls) return null; const out = [], open = new Map();
    for (const fl of fls) { const next = new Map(); for (const r of fl.rects) { const p = toWorld(fl, r.x, r.y), k = [p.x.toFixed(2), p.y.toFixed(2), r.w.toFixed(2), r.d.toFixed(2), fl.rot.toFixed(4)].join(','), prev = open.get(k);
        if (prev && Math.abs(prev.z1 - fl.z) < 1e-6) { prev.z1 = fl.z + fl.h; next.set(k, prev); } else { const q = { x: p.x, y: p.y, w: r.w, d: r.d, rot: fl.rot, z0: fl.z, z1: fl.z + fl.h }; out.push(q); next.set(k, q); } }
      open.clear(); for (const [k, v] of next) open.set(k, v); }
    return out; }
  function describe(b) { if (!active(b)) return ''; const F = b.form, parts = [F.type === 'prism' ? 'Prism' : TYPES[F.type].name]; if (F.step && F.step.mode !== 'none') parts.push(STEPS[F.step.mode].name.toLowerCase()); if (F.voids && F.voids.length) parts.push(F.voids.length + ' void' + (F.voids.length > 1 ? 's' : '')); if (F.edits && Object.keys(F.edits).length) parts.push(Object.keys(F.edits).length + ' edited storeys'); return parts.join(' · '); }

  /* ---------- uploaded massing: parsers and the column voxeliser (from the Supertall lab) ---------- */
  function parseOBJ(text) { const V = [], F = []; for (const ln of text.split(/\r?\n/)) { const s = ln.trim(); if (!s || s[0] === '#') continue; const p = s.split(/\s+/); if (p[0] === 'v') V.push(parseFloat(p[1]), parseFloat(p[2]), parseFloat(p[3])); else if (p[0] === 'f') { const idx = p.slice(1).map((t) => { let i = parseInt(t.split('/')[0], 10); if (i < 0) i = V.length / 3 + i + 1; return i - 1; }); for (let k = 1; k < idx.length - 1; k++) F.push(idx[0], idx[k], idx[k + 1]); } } return [{ v: V, f: F, layerName: 'model' }]; }
  function parseJSON(text) { const j = JSON.parse(text), arr = Array.isArray(j) ? j : j.meshes || []; return arr.filter((m) => m.v && m.f).map((m) => ({ v: (Array.isArray(m.v[0]) ? m.v.flat() : m.v).map(Number), f: (Array.isArray(m.f[0]) ? m.f.flat() : m.f).map(Number), layerName: m.layer || 'model' })); }
  let rhinoReady = null;
  function rhino() { if (rhinoReady) return rhinoReady; rhinoReady = new Promise((res) => { const go = () => { try { window.rhino3dm({ locateFile: (p) => p }).then(res).catch(() => res(null)); } catch (e) { res(null); } }; if (typeof window.rhino3dm === 'function') return go(); const s = document.createElement('script'); s.src = 'rhino3dm.min.js'; s.onload = go; s.onerror = () => res(null); document.head.appendChild(s); }); return rhinoReady; }
  async function parse3DM(buf) {
    const r = await rhino(); if (!r) throw new Error('rhino3dm could not load in this viewer; export the model as .obj instead.');
    const file = r.File3dm.fromByteArray(new Uint8Array(buf)); if (!file) throw new Error('Not a readable .3dm file.');
    let scale = 1; try { const u = file.settings().modelUnitSystem; const map = { 2: 0.001, 3: 0.01, 4: 1, 5: 1000, 8: 0.0254, 9: 0.3048 }; if (u in map) scale = map[u]; } catch (e) { /* metres */ }
    const out = [], objs = file.objects(), layers = file.layers();
    const push = (mesh, layer) => { if (!mesh) return; const V = [], F = [], vs = mesh.vertices(), fs = mesh.faces(); for (let i = 0; i < vs.count; i++) { const p = vs.get(i); V.push(p[0] * scale, p[1] * scale, p[2] * scale); } for (let i = 0; i < fs.count; i++) { const f = fs.get(i); F.push(f[0], f[1], f[2]); if (f[2] !== f[3]) F.push(f[0], f[2], f[3]); } if (F.length) out.push({ v: V, f: F, layerName: layer }); };
    for (let i = 0; i < objs.count; i++) { const o = objs.get(i), g = o.geometry(); if (!g) continue; let layer = 'model'; try { layer = layers.get(o.attributes().layerIndex).name; } catch (e) { /* default */ }
      try { if (g instanceof r.Mesh) push(g, layer); else if (g instanceof r.Extrusion) push(g.getMesh(r.MeshType.Any), layer); else if (g instanceof r.Brep) { const fc = g.faces(); for (let k = 0; k < fc.count; k++) push(fc.get(k).getMesh(r.MeshType.Any), layer); } } catch (e) { console.warn('skip object', e); } }
    if (!out.length) throw new Error('The .3dm holds no meshes, extrusions or polysurfaces with render meshes. View it once in Shaded mode in Rhino, then save again.');
    return out;
  }
  /* columns of 1 m cells: z intervals inside the closed volume */
  function voxelize(meshes) {
    let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9, minz = 1e9, maxz = -1e9;
    for (const m of meshes) for (let i = 0; i < m.v.length; i += 3) { minx = Math.min(minx, m.v[i]); maxx = Math.max(maxx, m.v[i]); miny = Math.min(miny, m.v[i + 1]); maxy = Math.max(maxy, m.v[i + 1]); minz = Math.min(minz, m.v[i + 2]); maxz = Math.max(maxz, m.v[i + 2]); }
    const cell = 1, cx = (minx + maxx) / 2, cy = (miny + maxy) / 2, nx = Math.ceil(maxx - minx) + 2, ny = Math.ceil(maxy - miny) + 2, x0 = -nx / 2, y0 = -ny / 2, cols = Array.from({ length: nx * ny }, () => []);
    for (const m of meshes) for (let i = 0; i < m.f.length; i += 3) { const a = m.f[i] * 3, b = m.f[i + 1] * 3, c = m.f[i + 2] * 3, ax = m.v[a] - cx, ay = m.v[a + 1] - cy, az = m.v[a + 2] - minz, bx = m.v[b] - cx, by = m.v[b + 1] - cy, bz = m.v[b + 2] - minz, qx = m.v[c] - cx, qy = m.v[c + 1] - cy, qz = m.v[c + 2] - minz;
      const det = (bx - ax) * (qy - ay) - (qx - ax) * (by - ay); if (Math.abs(det) < 1e-7) continue;
      const ix0 = Math.max(0, Math.floor(Math.min(ax, bx, qx) - x0)), ix1 = Math.min(nx - 1, Math.floor(Math.max(ax, bx, qx) - x0)), iy0 = Math.max(0, Math.floor(Math.min(ay, by, qy) - y0)), iy1 = Math.min(ny - 1, Math.floor(Math.max(ay, by, qy) - y0));
      for (let iy = iy0; iy <= iy1; iy++) { const py = y0 + iy + 0.5; for (let ix = ix0; ix <= ix1; ix++) { const px = x0 + ix + 0.5, l1 = ((bx - px) * (qy - py) - (qx - px) * (by - py)) / det, l2 = ((qx - px) * (ay - py) - (ax - px) * (qy - py)) / det, l3 = 1 - l1 - l2; if (l1 >= -1e-6 && l2 >= -1e-6 && l3 >= -1e-6) cols[iy * nx + ix].push(l1 * az + l2 * bz + l3 * qz); } } }
    const ints = new Array(nx * ny); let any = 0, fx0 = 1e9, fx1 = -1e9, fy0 = 1e9, fy1 = -1e9;
    for (let k = 0; k < nx * ny; k++) { const zs = cols[k].sort((p, q) => p - q), iv = []; for (let i = 0; i + 1 < zs.length; i += 2) if (zs[i + 1] - zs[i] > 0.5) iv.push(Math.round(zs[i] * 100) / 100, Math.round(zs[i + 1] * 100) / 100); if (zs.length === 1) iv.push(0, zs[0]); ints[k] = iv.length ? iv : 0; if (iv.length) { any++; const ix = k % nx, iy = Math.floor(k / nx); fx0 = Math.min(fx0, ix); fx1 = Math.max(fx1, ix); fy0 = Math.min(fy0, iy); fy1 = Math.max(fy1, iy); } }
    if (!any) throw new Error('The model has no closed volumes to slice. Make sure the massing is a closed mesh or polysurface.');
    return { nx, ny, x0: x0 + 0, y0: y0 + 0, cell, ints, top: maxz - minz, footprint: any, origin: [cx, cy, minz], ext: { w: (fx1 - fx0 + 1), d: (fy1 - fy0 + 1) }, f0: [fx0, fy0] };
  }
  async function readFile(file) { const name = file.name.toLowerCase(); if (name.endsWith('.3dm')) return parse3DM(await file.arrayBuffer()); const text = await file.text(); if (name.endsWith('.obj')) return parseOBJ(text); if (name.endsWith('.json')) return parseJSON(text); throw new Error('Use a .3dm, .obj or .json file.'); }

  return { TYPES, P, VOIDS, STEPS, EDIT, PRECEDENTS, newForm, active, floors, slices, expand, bounds, boxes, describe, toWorld, voxelize, readFile, defaultsFor, clone };
})();
