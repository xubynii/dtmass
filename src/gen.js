/* gen.js — the massing generator. From the site, the brief (target GFA, program mix, floor-to-floor heights, preferred
   floorplate, height target) and a typology preset with its parameters, it lays out program blocks as whole storeys:
   ground uses first, podium uses next, tower uses on top, every block a continuous run of floors of one use. It reports
   requested against generated areas, explains rounding and geometric losses, and names conflicts with specific adjustments
   instead of changing the user's targets. API: Gen.TYPES, Gen.generate(project, key, P, seed), Gen.axon(blocks, site, w, h), Gen.mount(el, App). */
window.Gen = (function () {
  'use strict';
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v, d = 0) => Number(v).toLocaleString('en-CA', { maximumFractionDigits: d, minimumFractionDigits: d });
  const snap = (v) => Math.round(v * 4) / 4, clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const param = (key, label, def, min, max, step = 1, fmtf) => ({ key, label, def, min, max, step, fmt: fmtf || ((v) => String(v)) });
  const pct = (v) => Math.round(v * 100) + '%';
  const COMMON = [param('along', 'Tower position along the frontage', 0, -1, 1, 0.05, (v) => (Math.abs(v) < 0.03 ? 'centred' : (v < 0 ? Math.round(-v * 100) + '% to one end' : Math.round(v * 100) + '% to the other'))), param('depth', 'Tower position, street to lane', 0.3, -1, 1, 0.05, (v) => (Math.abs(v) < 0.03 ? 'middle' : v < 0 ? Math.round(-v * 100) + '% to the street' : Math.round(v * 100) + '% to the lane')), param('aspect', 'Tower proportion, frontage ÷ depth', 1.2, 0.5, 2.5, 0.05, (v) => v.toFixed(2))];
  const TYPES = {
    slender: { name: 'Slender Tower', blurb: 'One tower straight from the ground, retail in its base. Smallest footprint, tallest result. Tapers, twists, tiers and terraces are added under Shape the building.', params: COMMON },
    podium: { name: 'Podium + Tower', blurb: 'A street-wall podium of retail, amenity and office with the tower set back on top. The downtown default.', params: [param('podiumStoreys', 'Podium storeys', 3, 1, 8)].concat(COMMON) },
    split: { name: 'Split Towers on a Shared Podium', blurb: 'Two slimmer towers at the ends of one podium, kept 24.4 m apart so both keep daylight and views.', params: [param('podiumStoreys', 'Podium storeys', 3, 1, 8), param('gap', 'Gap between towers', 24.4, 15, 60, 0.1, (v) => v.toFixed(1) + ' m'), param('share', 'Area in the first tower', 50, 20, 80, 5, (v) => v + '%'), param('depth', 'Towers, street to lane', 0.3, -1, 1, 0.05, (v) => (Math.abs(v) < 0.03 ? 'middle' : v < 0 ? 'toward the street' : 'toward the lane')), param('aspect', 'Tower proportion, frontage ÷ depth', 1.0, 0.5, 2.5, 0.05, (v) => v.toFixed(2))] },
    court: { name: 'Courtyard Podium + Tower', blurb: 'A podium of bars around an open court, with the tower on one corner of the ring.', params: [param('podiumStoreys', 'Podium storeys', 4, 2, 8), param('barDepth', 'Bar depth', 16, 10, 24, 0.5, (v) => v.toFixed(1) + ' m'), { key: 'corner', label: 'Tower corner', def: 'street-left', options: [['street-left', 'Street side, left'], ['street-right', 'Street side, right'], ['lane-left', 'Lane side, left'], ['lane-right', 'Lane side, right']] }, param('aspect', 'Tower proportion, frontage ÷ depth', 1.1, 0.5, 2.5, 0.05, (v) => v.toFixed(2))] },
  };
  const defaults = (key) => Object.fromEntries(TYPES[key].params.map((q) => [q.key, q.def]));
  const PODIUM_USES = ['amenity', 'office'], GROUND_USES = ['retail', 'restaurant'];

  /* ---------- geometry of the site: podium footprint inside the guideline setbacks ---------- */
  function frame(site) {
    const W = site.w, D = site.d, front = site.frontage || 'S', lane = site.lane || (front === 'S' ? 'N' : front === 'N' ? 'S' : front === 'E' ? 'W' : 'E');
    const set = (window.CODES && CODES.odp.guidelineSetbacks || {})[site.setbackSet || 'none'], sb = (kind) => { if (!set) return 0; const r = set.rules.filter((q) => q.edge === kind && q.above === 0 && q.d > 0); return r.length ? Math.max(...r.map((q) => q.d)) : 0; };
    const ins = { N: 0, S: 0, E: 0, W: 0 }; ins[front] = sb('street'); ins[lane] = sb('lane');
    const x0 = ins.W, x1 = W - ins.E, y0 = ins.S, y1 = D - ins.N;
    return { W, D, front, lane, alongX: 'NS'.includes(front), streetMin: front === 'S' || front === 'W', podium: { x: snap(x0), y: snap(y0), w: snap(Math.max(8, x1 - x0)), d: snap(Math.max(8, y1 - y0)) }, setbackName: set ? set.name : 'none' };
  }
  /* a tower rectangle of `area` inside `box`, with proportion `aspect` (frontage ÷ depth) and position params */
  function towerRect(F, box, area, aspect, along, depth) {
    const k = F.alongX ? aspect : 1 / aspect; let w = Math.sqrt(area * k), d = area / w;
    if (w > box.w) { w = box.w; d = Math.min(box.d, area / w); } if (d > box.d) { d = box.d; w = Math.min(box.w, area / d); }
    w = snap(Math.max(6, w)); d = snap(Math.max(6, d));
    const fx = F.alongX ? along : (F.streetMin ? depth : -depth), fy = F.alongX ? (F.streetMin ? depth : -depth) : along;
    return { x: snap(clamp(box.x + (box.w - w) / 2 * (1 + fx), box.x, box.x + box.w - w)), y: snap(clamp(box.y + (box.d - d) / 2 * (1 + fy), box.y, box.y + box.d - d)), w, d };
  }
  const areaOf = (r) => r.w * r.d;

  /* ---------- the generator ---------- */
  function generate(project, key, P, seed = 0) {
    const site = project.site, brief = window.Brief ? Brief.ensure(project) : project.brief, T = TYPES[key] || TYPES.podium, p = Object.assign(defaults(key), P || {});
    const F = frame(site), notes = [], conflicts = [], uses = Brief.USES.filter((u) => (brief.mix[u] || 0) > 0);
    const target = {}; for (const u of uses) target[u] = brief.gfa * brief.mix[u] / 100;
    const f2f = (u) => brief.f2f[u] || Model.USE_F2F[u] || 3;
    // variation: nudge the brief-independent choices so each seed is a different, plausible answer to the same brief
    const rnd = seededRandom(seed), vary = seed > 0;
    const plateArea = brief.plate * (vary ? 0.9 + rnd() * 0.25 : 1), along = clamp((p.along || 0) + (vary ? (rnd() - 0.5) * 0.6 : 0), -1, 1), depth = clamp((p.depth == null ? 0.3 : p.depth) + (vary ? (rnd() - 0.5) * 0.5 : 0), -1, 1), aspect = clamp((p.aspect || 1.2) * (vary ? 0.85 + rnd() * 0.3 : 1), 0.5, 2.5);
    const podStoreys = key === 'slender' ? 0 : Math.max(0, Math.round((p.podiumStoreys == null ? 3 : p.podiumStoreys) + (vary ? Math.round((rnd() - 0.5) * 2) : 0)));
    const segs = []; // bottom → top: { use, rect, floors, f2f, tier }
    const blocks = [], ramps = [];
    const order = brief.order.filter((u) => uses.includes(u)).concat(uses.filter((u) => !brief.order.includes(u)));
    const groundUses = order.filter((u) => GROUND_USES.includes(u)), podiumUses = podStoreys > 0 ? order.filter((u) => PODIUM_USES.includes(u)) : [], towerUses = order.filter((u) => !groundUses.includes(u) && !podiumUses.includes(u));
    if (vary && towerUses.length > 1 && rnd() < 0.5) towerUses.reverse(); // e.g. hotel above homes in one variation
    // footprints
    let podiumRect = F.podium, court = null; const sbAll = window.Rules && Rules.setbackBox ? Rules.setbackBox(site, 1e9) : null; const inter = (r, bx) => { if (!bx) return r; const x0 = Math.max(r.x, bx.x0), y0 = Math.max(r.y, bx.y0), x1 = Math.min(r.x + r.w, bx.x1), y1 = Math.min(r.y + r.d, bx.y1); return x1 - x0 >= 8 && y1 - y0 >= 8 ? { x: snap(x0), y: snap(y0), w: snap(x1 - x0), d: snap(y1 - y0) } : r; }; const towerBox = inter(F.podium, sbAll); if (sbAll && (towerBox.w < F.podium.w - 0.5 || towerBox.d < F.podium.d - 0.5)) notes.push(`Tower plates are kept inside the setback lines that apply above the street wall (${fmt(towerBox.w, 1)} × ${fmt(towerBox.d, 1)} m available); the podium uses the full ${fmt(F.podium.w, 1)} × ${fmt(F.podium.d, 1)} m.`);
    if (key === 'court') { const bd = p.barDepth, ok = F.podium.w >= 2 * bd + 10 && F.podium.d >= 2 * bd + 10; if (!ok) { notes.push(`The site is too small for a full courtyard ring with ${fmt(bd, 1)} m bars; the podium is a solid block instead.`); } else court = { x: snap(F.podium.x + bd), y: snap(F.podium.y + bd), w: snap(F.podium.w - 2 * bd), d: snap(F.podium.d - 2 * bd) }; }
    const podiumArea = court ? areaOf(F.podium) - areaOf(court) : areaOf(podiumRect);
    let towers = [];
    if (key === 'split') { const n = 2, gap = Math.max(24.4, p.gap || 24.4), share = (p.share || 50) / 100; const alongLen = F.alongX ? podiumRect.w : podiumRect.d; const each = Math.min(plateArea, Math.max(300, (alongLen - gap) / 2 * (F.alongX ? podiumRect.d : podiumRect.w) * 0.8));
      if ((alongLen - gap) / 2 < 12) conflicts.push({ title: 'Two towers do not fit', text: `The ${fmt(alongLen, 1)} m frontage cannot hold two towers ${fmt(gap, 1)} m apart; choose Podium + Tower or widen the site.`, fix: 'Use one tower, or reduce the gap only if the design review accepts it.' });
      const tA = towerRect(F, towerBox, each, aspect, -1, depth), tB = towerRect(F, towerBox, each, aspect, 1, depth);
      if (each < plateArea - 1) notes.push(`Each tower plate is ${fmt(each)} m² so that two towers fit ${fmt(gap, 1)} m apart; the preferred plate was ${fmt(plateArea)} m².`);
      towers = [{ rect: tA, share }, { rect: tB, share: 1 - share }]; void n; }
    else if (key === 'court' && court) { const c = p.corner || 'street-left', bd = p.barDepth, w = snap(Math.min(towerBox.w, Math.sqrt(plateArea * aspect))), d = snap(Math.min(towerBox.d, plateArea / w)); const streetSide = c.startsWith('street') ? (F.streetMin ? 'min' : 'max') : (F.streetMin ? 'max' : 'min'), left = c.endsWith('left');
      const tb = towerBox; const yPos = F.alongX ? (streetSide === 'min' ? tb.y : tb.y + tb.d - d) : (left ? tb.y : tb.y + tb.d - d), xPos = F.alongX ? (left ? tb.x : tb.x + tb.w - w) : (streetSide === 'min' ? tb.x : tb.x + tb.w - w);
      towers = [{ rect: { x: snap(xPos), y: snap(yPos), w, d }, share: 1 }]; if (w > 2 * bd + 2 || d > 2 * bd + 2) notes.push('The tower plate is wider than the podium bar, so part of it sits over the court.'); }
    else { towers = [{ rect: towerRect(F, towerBox, key === 'slender' ? Math.max(plateArea, 1) : plateArea, aspect, along, depth), share: 1 }]; }
    // ground storeys: retail along the street, restaurant at the lane side, both one storey on the podium footprint (or the tower footprint for a slender tower)
    const base = key === 'slender' ? towers[0].rect : podiumRect; let z = 0;
    for (const u of groundUses) { const A = target[u]; let rect = Object.assign({}, base), floors = 1; if (court) rect = Object.assign({}, F.podium);
      const perFloor = court ? podiumArea : areaOf(rect); floors = Math.max(1, Math.round(A / perFloor)); if (floors > 2) { floors = 2; notes.push(`${Model.USE_LABEL[u]} wants ${fmt(A)} m² but the ground footprint holds ${fmt(perFloor)} m² a storey; two storeys are drawn and the rest is left out (add it to the podium or raise the share).`); }
      if (A < perFloor * 0.5 && !court) { // shrink the depth toward the street (retail) or the lane (restaurant)
        const dep = clamp(A / (F.alongX ? rect.w : rect.d), 8, F.alongX ? rect.d : rect.w); if (F.alongX) { rect.d = snap(dep); if ((u === 'retail') === F.streetMin) rect.y = base.y; else rect.y = snap(base.y + base.d - rect.d); } else { rect.w = snap(dep); if ((u === 'retail') === F.streetMin) rect.x = base.x; else rect.x = snap(base.x + base.w - rect.w); } }
      segs.push({ use: u, rect, floors, f2f: f2f(u), ring: !!court }); z += floors * f2f(u); }
    // podium storeys: amenity and office on the podium footprint, up to the chosen podium storeys
    let podLeft = Math.max(0, podStoreys - segs.reduce((a, s) => a + s.floors, 0)); const overflow = {};
    for (const u of podiumUses) { if (podLeft <= 0) { overflow[u] = target[u]; continue; } const per = court ? podiumArea : areaOf(podiumRect); let n = Math.max(1, Math.round(target[u] / per)); if (n > podLeft) { overflow[u] = target[u] - podLeft * per; n = podLeft; notes.push(`${Model.USE_LABEL[u]} needs ${fmt(target[u])} m²; ${n} podium storey${n === 1 ? '' : 's'} hold ${fmt(n * per)} m² and the remaining ${fmt(overflow[u])} m² go into the tower.`); } podLeft -= n; segs.push({ use: u, rect: court ? Object.assign({}, F.podium) : Object.assign({}, podiumRect), floors: n, f2f: f2f(u), ring: !!court }); }
    if (podLeft > 0 && podStoreys > 0 && podiumUses.length) notes.push(`The podium needs only ${podStoreys - podLeft} storey${podStoreys - podLeft === 1 ? '' : 's'} for its program; ${podLeft} requested podium storey${podLeft === 1 ? ' is' : 's are'} not drawn rather than padded with tower uses.`);
    // tower storeys per use, split across towers by share, and across tiers for the stepped type
    const towerSegs = [];
    for (const u of Object.keys(overflow).filter((u) => !towerUses.includes(u)).concat(towerUses)) { /* podium overflow (office, amenity) sits at the base of the tower, under hotel and homes */ const A = (overflow[u] != null ? overflow[u] : target[u]); for (const tw of towers) { const a = A * tw.share, per = areaOf(tw.rect); const n = Math.max(1, Math.round(a / per)); towerSegs.push({ use: u, tower: tw, floors: n, f2f: f2f(u), want: a }); } }
    // stepped: tiers shrink the plate; regroup storeys by tier
    const outTower = [];
    for (const tw of towers) { const mine = towerSegs.filter((s) => s.tower === tw); if (!mine.length) continue;
      if (key === 'stepped') { const tiers = Math.max(2, Math.round(p.tiers || 3)), ratio = p.step || 0.78, nTot = mine.reduce((a, s) => a + s.floors, 0); const scales = []; for (let k = 0; k < tiers; k++) scales.push(Math.pow(ratio, k)); const mean = scales.reduce((a, b) => a + b, 0) / tiers; const per = Math.ceil(nTot / tiers); let i = 0;
        const seq = []; for (const s of mine) for (let k = 0; k < s.floors; k++) seq.push(s); // one entry per storey
        for (let k = 0; k < tiers; k++) { const part = seq.slice(k * per, (k + 1) * per); if (!part.length) break; const sc = scales[k] / mean; const r = { w: snap(Math.max(6, tw.rect.w * Math.sqrt(sc))), d: snap(Math.max(6, tw.rect.d * Math.sqrt(sc))) }; r.x = snap(tw.rect.x + (tw.rect.w - r.w) / 2); r.y = snap(tw.rect.y + (tw.rect.d - r.d) / 2);
          let run = null; for (const s of part) { if (run && run.use === s.use) run.floors++; else { run = { use: s.use, rect: r, floors: 1, f2f: s.f2f, tier: k }; outTower.push(run); } } }
        notes.push(`Stepped tiers keep the same storey count but change plate area tier by tier (${scales.map((s) => pct(s / mean)).join(', ')} of the mean plate), so each use's area moves with the tier it lands in.`); }
      else for (const s of mine) outTower.push({ use: s.use, rect: tw.rect, floors: s.floors, f2f: s.f2f }); }
    segs.push(...outTower);
    // blocks from segments, each a continuous run of floors
    let zc = 0; const names = {}; const nm = (u) => { names[u] = (names[u] || 0) + 1; return names[u] > 1 ? `${Model.USE_LABEL[u]} ${names[u]}` : Model.USE_LABEL[u]; };
    const towerZ0 = new Map();
    for (const s of segs) { const inTower = towers.some((tw) => tw.rect === s.rect) || s.tier != null; if (inTower) { const tw = towers.find((t) => t.rect === s.rect) || towers[0]; if (!towerZ0.has(tw)) towerZ0.set(tw, zc); }
      if (s.ring) { const b = F.podium, c = court, bars = [{ x: b.x, y: b.y, w: b.w, d: c.y - b.y }, { x: b.x, y: c.y + c.d, w: b.w, d: b.y + b.d - c.y - c.d }, { x: b.x, y: c.y, w: c.x - b.x, d: c.d }, { x: c.x + c.w, y: c.y, w: b.x + b.w - c.x - c.w, d: c.d }]; const base2 = nm(s.use); bars.forEach((r, i) => blocks.push(Model.block({ use: s.use, name: `${base2} ${['south', 'north', 'west', 'east'][i]} bar`, x: snap(r.x), y: snap(r.y), w: snap(r.w), d: snap(r.d), z0: Math.round(zc * 100) / 100, floors: s.floors, f2f: s.f2f }))); }
      else blocks.push(Model.block({ use: s.use, name: nm(s.use), x: s.rect.x, y: s.rect.y, w: s.rect.w, d: s.rect.d, z0: Math.round(zc * 100) / 100, floors: s.floors, f2f: s.f2f }));
      zc += s.floors * s.f2f; }
    // split towers stack independently: re-settle so each tower's blocks sit on the podium, not on each other
    if (towers.length > 1) { const up = blocks.filter((b) => b.z0 >= 0).sort((a, b) => a.z0 - b.z0), done = []; for (const b of up) { let zz = 0; for (const o of done) if (Model.rectsOverlap(b, o)) zz = Math.max(zz, Model.blockTop(o)); b.z0 = Math.round(zz * 100) / 100; done.push(b); } }
    // terraces: step the tower blocks in every few storeys (form rule shared across the tower)
    if (key === 'terraced' && window.Form) { const tb = blocks.filter((b) => towers.some((tw) => tw.rect.x === b.x && tw.rect.y === b.y && tw.rect.w === b.w && tw.rect.d === b.d)); if (tb.length) { const z0 = Math.min(...tb.map((b) => b.z0)), H = Math.max(...tb.map((b) => Model.blockTop(b))) - z0; for (const b of tb) { b.form = Object.assign(Form.newForm('prism'), { step: { mode: 'ziggurat', from: 0, to: 1, step: p.stepM || 1, every: p.interval || 3, sides: 'all' }, span: { z0, H } }); } notes.push(`Terraces step the tower in ${fmt(p.stepM || 1, 1)} m every ${p.interval || 3} storeys on every face, so upper plates are smaller than the base plate and the generated area falls short of the request accordingly.`); } }
    // parking below grade on the whole site, with a ramp off the lane; one core per tower
    const nPark = Math.max(0, Math.round(brief.parkingLevels || 0)), base0 = -3.2 * nPark;
    if (nPark) { blocks.push(Model.block({ use: 'parking', name: `Parking P1–P${nPark}`, x: 0.5, y: 0.5, w: snap(F.W - 1), d: snap(F.D - 1), z0: base0, floors: nPark, f2f: 3.2 }));
      const lane = F.lane, vertical = 'NS'.includes(lane), width = Math.min(6.1, vertical ? F.W : F.D), len = Math.min(-base0 / 0.125 + 8, vertical ? F.D : F.W); ramps.push(Model.ramp({ x: lane === 'E' ? 0.5 + F.W - 1 - len : lane === 'N' ? 0.5 + F.W - 1 - width : 0.5, y: lane === 'N' ? 0.5 + F.D - 1 - len : lane === 'E' ? 0.5 + F.D - 1 - width : 0.5, w: width, len, dir: { N: 'S', S: 'N', E: 'W', W: 'E' }[lane], zTop: 0, zBottom: base0 })); }
    const topAll = Math.max(...blocks.filter((b) => b.use !== 'parking').map((b) => Model.blockTop(b)));
    towers.forEach((tw, i) => { const mine = blocks.filter((b) => b.use !== 'parking' && Model.rectsOverlap(b, tw.rect)); const top = Math.max(...mine.map((b) => Model.blockTop(b))), storeys = mine.reduce((a, b) => a + b.floors, 0); blocks.push(...Model.twoCores(tw.rect, base0, top, storeys, towers.length > 1 ? `Core ${i + 1}` : 'Core')); });
    // requested vs generated
    const tmp = Object.assign(Model.clone(project), { blocks, ramps }), mp = window.Form ? Form.expand(tmp) : tmp, Tt = Model.totals(mp), gen = {}; for (const u of uses) gen[u] = Tt.gfa[u] || 0;
    const genTotal = uses.reduce((a, u) => a + gen[u], 0), reqTotal = uses.reduce((a, u) => a + target[u], 0);
    const rows = uses.map((u) => ({ use: u, target: target[u], pct: brief.mix[u], gen: gen[u], genPct: genTotal ? gen[u] / genTotal * 100 : 0 }));
    for (const r of rows) { const d = r.gen - r.target; if (Math.abs(d) > Math.max(60, r.target * 0.08)) { const seg = segs.filter((s) => s.use === r.use); const per = seg.length ? areaOf(seg[0].rect) : 0; notes.push(`${Model.USE_LABEL[r.use]}: ${fmt(r.gen)} m² generated against ${fmt(r.target)} m² requested (${d > 0 ? '+' : ''}${fmt(d)} m²)${per ? `, because storeys are whole: ${fmt(per)} m² a storey, so the share rounds to ${seg.reduce((a, s) => a + s.floors, 0)} storey${seg.reduce((a, s) => a + s.floors, 0) === 1 ? '' : 's'}` : ''}.`); } }
    // conflicts: height, FSR, plate
    const env = window.App && App.envelope ? App.envelope() : {}, cap = brief.heightTarget || env.max || env.basic || null, capKind = brief.heightTarget ? 'design height target' : env.max ? 'Board maximum' : env.basic ? 'ODP basic height' : null;
    if (cap && topAll > cap + 0.05) { const over = topAll - cap, twArea = towers.reduce((a, tw) => a + areaOf(tw.rect), 0), towerFloors = outTower.reduce((a, s) => a + s.floors, 0), meanF2f = outTower.reduce((a, s) => a + s.floors * s.f2f, 0) / Math.max(1, towerFloors), spare = Math.max(1, Math.floor((cap - (towerZ0.size ? Math.min(...towerZ0.values()) : 0)) / meanF2f)); const plateNeeded = Math.ceil(outTower.reduce((a, s) => a + s.floors * areaOf(s.rect), 0) / spare / 10) * 10;
      conflicts.push({ title: `Height ${fmt(topAll, 1)} m exceeds the ${capKind} of ${fmt(cap, 1)} m by ${fmt(over, 1)} m`, text: `The ${fmt(brief.gfa)} m² brief on a ${fmt(twArea)} m² tower plate needs ${towerFloors} tower storeys.`, fix: `Either raise the preferred floorplate to about ${fmt(plateNeeded)} m² (${spare} storeys would then fit), reduce the target area by about ${fmt(over / meanF2f * twArea)} m², ${towers.length < 2 ? 'or split into two towers on the podium' : 'or widen the towers'}. The targets were not changed.` }); }
    const D = (window.CODES && CODES.odp.density[site.densityArea]) || {}, siteArea = site.area || F.W * F.D, fsr = Rules.density(mp).fsr; if (D.fsr != null && fsr > D.fsr + 1e-6) conflicts.push({ title: `FSR ${fmt(fsr, 2)} exceeds the ${fmt(D.fsr, 2)} permitted in density area ${site.densityArea}`, text: `${fmt(brief.gfa)} m² on a ${fmt(siteArea)} m² lot is FSR ${fmt(brief.gfa / siteArea, 2)} before exclusions.`, fix: `A compliant brief is about ${fmt(Math.floor(D.fsr * siteArea / 100) * 100)} m² of counted floor area, or the surplus needs a rezoning.` });
    const plateLim = window.CODES ? CODES.odp.setbacks.towerFloorplate : 605; for (const tw of towers) if (areaOf(tw.rect) > plateLim * 1.1) notes.push(`A ${fmt(areaOf(tw.rect))} m² tower plate is above the ${plateLim} m² the floor-plate bulletin allows on most downtown sites; the tower floor-plate check will flag it.`);
    return { key, P: p, seed, blocks, ramps, rows, reqTotal, genTotal, notes, conflicts, height: topAll, storeys: blocks.filter((b) => b.use !== 'core' && b.use !== 'parking').reduce((a, b) => a + b.floors, 0), fsr, towers: towers.length, podiumStoreys: podStoreys, frame: F, label: `${T.name}${seed ? ` · variation ${seed}` : ''}` };
  }
  function seededRandom(seed) { let a = (seed * 9301 + 49297) % 233280 || 1; return () => { a = (a * 9301 + 49297) % 233280; return a / 233280; }; }

  /* ---------- small axonometric preview (cabinet projection), shared by the presets, variations and compare ---------- */
  const HEX = { residential: '#F3D1CC', hotel: '#F6E3C9', office: '#D4E6ED', retail: '#E5DCF0', restaurant: '#F4DDC5', amenity: '#D5E8D9', parking: '#E1E6E9', core: '#E7E2DB' }, LINE = { residential: '#D39A92', hotel: '#D9B27A', office: '#86AFC0', retail: '#A693C4', restaurant: '#CF9F6F', amenity: '#86B893', parking: '#9EABB4', core: '#B1A594' };
  function axon(blocks, site, w = 180, h = 140, opts = {}) {
    const kx = 0.5, ky = 0.28, P = (x, y, z) => [x + y * kx, -z + y * ky]; const pts = []; const W = site.w, D = site.d;
    for (const [x, y] of [[0, 0], [W, 0], [W, D], [0, D]]) pts.push(P(x, y, 0)); for (const b of blocks) { if (b.hidden) continue; const top = Model.blockTop(b); for (const [x, y] of [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.d], [b.x, b.y + b.d]]) { pts.push(P(x, y, Math.max(0, b.z0))); pts.push(P(x, y, top)); } }
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), k = Math.min((w - 12) / Math.max(1, x1 - x0), (h - 12) / Math.max(1, y1 - y0)), ox = 6 + ((w - 12) - (x1 - x0) * k) / 2, oy = 6 + ((h - 12) - (y1 - y0) * k) / 2;
    const S = (q) => `${(ox + (q[0] - x0) * k).toFixed(1)},${(oy + (q[1] - y0) * k).toFixed(1)}`;
    let s = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><polygon points="${[[0, 0], [W, 0], [W, D], [0, D]].map((q) => S(P(q[0], q[1], 0))).join(' ')}" fill="#fff" stroke="#E78389" stroke-width="1" stroke-dasharray="3 2"/>`;
    const vis = blocks.filter((b) => !b.hidden && b.use !== 'core' && Model.blockTop(b) > 0.01).slice().sort((a, b) => (b.y + b.d) - (a.y + a.d) || a.x - b.x || a.z0 - b.z0);
    for (const b of vis) { const z0 = Math.max(0, b.z0), z1 = Model.blockTop(b), f = HEX[b.use] || '#eee', l = LINE[b.use] || '#999', hi = opts.highlight && opts.highlight.has(b.id);
      const top = [[b.x, b.y, z1], [b.x + b.w, b.y, z1], [b.x + b.w, b.y + b.d, z1], [b.x, b.y + b.d, z1]], front = [[b.x, b.y, z0], [b.x + b.w, b.y, z0], [b.x + b.w, b.y, z1], [b.x, b.y, z1]], side = [[b.x + b.w, b.y, z0], [b.x + b.w, b.y + b.d, z0], [b.x + b.w, b.y + b.d, z1], [b.x + b.w, b.y, z1]];
      for (const [face, shade] of [[side, 0.86], [front, 1], [top, 1.06]]) s += `<polygon points="${face.map((q) => S(P(q[0], q[1], q[2]))).join(' ')}" fill="${mixc(f, shade)}" stroke="${hi ? '#CF4F58' : l}" stroke-width="${hi ? 1.4 : 0.7}" stroke-linejoin="round"/>`; }
    return s + '</svg>';
  }
  function mixc(hex, k) { const n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(k >= 1 ? v + (255 - v) * (k - 1) : v * k)))); return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join(''); }
  /* preset previews: a canonical 60 × 40 site */
  function presetPreview(key) { const site = { w: 60, d: 40, frontage: 'S', lane: 'N', setbackSet: 'none' }, p = { site, brief: Object.assign(Brief.DEF(), { gfa: 22000, plate: 600, parkingLevels: 0, mix: { residential: 60, hotel: 0, office: 20, retail: 10, restaurant: 0, amenity: 10 } }), blocks: [], ramps: [] }; try { const r = generate(p, key, {}, 0); return axon(r.blocks, site, 150, 112); } catch (e) { return ''; } }

  /* ---------- the Generate tab ---------- */
  let app = null, root = null, typeKey = 'podium', P = null, last = null, variants = [], lastKey = null, raf = 0;
  function render() {
    if (!root) return; const p = app.project(), brief = Brief.ensure(p), A = Brief.areas(p); const T = TYPES[typeKey]; if (!P || lastKey !== typeKey) { P = defaults(typeKey); lastKey = typeKey; }
    const card = (k) => `<button class="gtype ${k === typeKey ? 'on' : ''}" data-gtype="${k}" aria-pressed="${k === typeKey}" title="${esc(TYPES[k].blurb)}">${presetPreview(k)}<span>${TYPES[k].name}</span></button>`;
    const ctl = (q) => q.options ? `<label class="ctl-sel">${q.label}<select data-gp="${q.key}">${q.options.map(([v, l]) => `<option value="${v}" ${String(P[q.key]) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : `<div class="ctl"><div class="ctl-head"><label>${q.label}</label><output>${esc(q.fmt(Number(P[q.key])))}</output></div><input type="range" data-gp="${q.key}" min="${q.min}" max="${q.max}" step="${q.step}" value="${P[q.key]}" aria-label="${esc(q.label)}"></div>`;
    const ready = A.ok && brief.gfa > 0, linked = !!(p.param && p.param.mode === 'gen'), edited = !!(p.param && p.param.edited); if (linked && p.param.key && TYPES[p.param.key] && lastKey !== p.param.key && !last) { typeKey = p.param.key; P = Object.assign(defaults(typeKey), p.param.P || {}); lastKey = typeKey; }
    const note = !ready ? `<div class="linknote warn">${A.ok ? 'Enter a target floor area above.' : `The program mix adds to ${fmt(A.total, 1)}%: make it 100% (Normalize) and the massing follows.`}</div>` : `<div class="linknote ${edited ? 'warn' : 'on'}">Live: the massing follows the target, the mix, the typology and these parameters as you change them. One undo step per change.${edited ? ' Blocks were edited by hand; the next change regenerates them (Undo restores the edits).' : ''}</div>`;
    let h = `${note}<div class="gtypes">${Object.keys(TYPES).map(card).join('')}</div><p class="hint">${esc(T.blurb)}</p><details class="prec" open><summary>Parameters · ${esc(T.name)}</summary>${T.params.map(ctl).join('')}</details>
      <div class="btnrow" style="margin-top:12px"><button id="genVar" ${ready ? '' : 'disabled'} title="Three variations of the same brief">Variations</button>${last ? '<button id="genSave">Save as an option</button>' : ''}</div>`;
    if (last) { const r = last; h += `<h4 class="subhead">Generated · ${esc(r.label)}</h4><div class="genstat"><span><b>${fmt(r.height, 1)} m</b> tall</span><span><b>${r.storeys}</b> storeys</span><span><b>${fmt(r.fsr, 2)}</b> FSR</span><span><b>${fmt(r.genTotal)}</b> m² of ${fmt(r.reqTotal)}</span></div>
      ${r.conflicts.map((c) => `<div class="conflict"><b>${esc(c.title)}</b><div>${esc(c.text)}</div><div class="fix">${esc(c.fix)}</div></div>`).join('')}
      <table class="data gtbl"><thead><tr><th>Use</th><th class="n">Requested</th><th class="n">Generated</th><th class="n">Δ</th></tr></thead><tbody>${r.rows.map((x) => `<tr><td><i class="sw" style="background:${Views.useCol(x.use)}"></i> ${Model.USE_LABEL[x.use]}</td><td class="n">${fmt(x.target)} m² · ${fmt(x.pct, x.pct % 1 ? 1 : 0)}%</td><td class="n">${fmt(x.gen)} m² · ${fmt(x.genPct, 0)}%</td><td class="n ${Math.abs(x.gen - x.target) > Math.max(60, x.target * 0.08) ? 'st-review' : ''}">${x.gen - x.target >= 0 ? '+' : '−'}${fmt(Math.abs(x.gen - x.target))}</td></tr>`).join('')}</tbody></table>
      ${r.notes.length ? `<details class="prec" open><summary>Why the numbers differ</summary><ul class="mlist">${r.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></details>` : ''}
      `; }
    if (variants.length) h += `<h4 class="subhead">Variations of the same brief</h4><div class="gvars">${variants.map((v, i) => `<button class="gvar" data-gvar="${i}" title="Use this variation">${axon(v.blocks, p.site, 150, 110)}<span><b>${esc(v.label)}</b><br>${fmt(v.height, 1)} m · ${v.storeys} storeys · FSR ${fmt(v.fsr, 2)}${v.conflicts.length ? ` · <span class="st-fail">${v.conflicts.length} conflict${v.conflicts.length === 1 ? '' : 's'}</span>` : ''}</span></button>`).join('')}</div>`;
    root.innerHTML = h;
    const live = () => ready && app.genLinked && app.genLinked();
    root.querySelectorAll('[data-gtype]').forEach((b) => (b.onclick = () => { typeKey = b.dataset.gtype; P = defaults(typeKey); lastKey = typeKey; if (live()) regen(true); else render(); }));
    root.querySelectorAll('input[data-gp]').forEach((el) => { const q = T.params.find((x) => x.key === el.dataset.gp), out = el.parentElement.querySelector('output'); el.oninput = () => { P[q.key] = Number(el.value); out.textContent = q.fmt(Number(el.value)); if (live()) regen(false); }; el.onchange = () => { if (live()) regen(true); }; });
    root.querySelectorAll('select[data-gp]').forEach((el) => (el.onchange = () => { P[el.dataset.gp] = el.value; if (live()) regen(true); }));
    const ga = document.getElementById('genAside'); if (ga) ga.textContent = `${linked && TYPES[p.param.key] ? TYPES[p.param.key].name : T.name}${edited ? ' · edited by hand' : ' · live'}`;
    const gv = root.querySelector('#genVar'); if (gv) gv.onclick = () => { variants = [1, 2, 3].map((s) => generate(app.project(), typeKey, P, s)); render(); };
    root.querySelectorAll('[data-gvar]').forEach((b) => (b.onclick = () => { const v = variants[Number(b.dataset.gvar)]; apply(v); }));
    const sv = root.querySelector('#genSave'); if (sv) sv.onclick = () => { const v = window.Iterate ? Iterate.save(last.label) : null; if (v) app.toast(`Saved ${v.name}`); };
  }
  /* regenerate from the current brief and parameters: live while a slider moves (no undo step), committed on release */
  function regen(commit) { if (!commit) { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; const r = generate(app.project(), typeKey, P, 0); last = r; app.applyGenerated(r, true); }); return; } cancelAnimationFrame(raf); raf = 0; const r = generate(app.project(), typeKey, P, 0); last = r; app.applyGenerated(r, false); render(); }
  function run(seed, doApply) { const r = generate(app.project(), typeKey, P, seed); last = r; if (doApply) apply(r); else render(); return r; }
  function apply(r) { last = r; app.applyGenerated(r, false); render(); }
  function mount(el, App) { root = el; app = App; render(); if (App.on) App.on('change', () => { if (root && !root.matches(':hover')) render(); }); }
  return { TYPES, defaults, generate, axon, mount, render, run, regen, state: () => ({ typeKey, P, last }) };
})();
