/* daylight.js — Downtown ODP §5 "daylight to windows": from a window position on every exterior face of a residential
   block, a fan of rays over 179° must find one clear 50° fan, or two fans adding to 70°, over 24 m. Obstacles are other
   blocks that rise past the storey, plus the adjoining-site property lines (the largest building permitted next door,
   taken as standing on the line as tall as this site's own height cap). */
window.Daylight = (function () {
  const HAD_D = 24.0, HAD_ONE = 50, HAD_TWO = 70, SILL = 0.1;
  const RAYS = []; for (let a = -89; a <= 89; a++) RAYS.push(a * Math.PI / 180);
  const rectRing = (b) => [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.d], [b.x, b.y + b.d]];
  function obstaclesAt(project, z, self, nbCap) {
    const obs = [];
    for (const o of project.blocks) { if (o === self || o.use === 'core' || o.hidden) continue; if (o.z0 <= z + 1e-6 && Model.blockTop(o) > z + 1e-6) { const r = rectRing(o); for (let i = 0; i < 4; i++) obs.push({ a: r[i], b: r[(i + 1) % 4], name: o.name, id: o.id }); } }
    const s = project.site;
    if (z < nbCap && s.edges) for (const e of s.edges) if (e.kind === 'x') obs.push({ a: e.a, b: e.b, name: 'the adjoining site', id: 'nb', nb: true });
    if (z < nbCap && !s.edges) { // rectangular site without parcel data: assume the lane side is open and the two flanks adjoin other sites
      const W = s.w, Dp = s.d; const sides = { N: [[0, Dp], [W, Dp]], S: [[0, 0], [W, 0]], E: [[W, 0], [W, Dp]], W: [[0, 0], [0, Dp]] };
      for (const k of 'NSEW') if (k !== s.frontage && k !== s.lane) obs.push({ a: sides[k][0], b: sides[k][1], name: 'the adjoining site', id: 'nb' + k, nb: true }); }
    return obs;
  }
  function raySeg(px, py, dx, dy, s) { const ex = s.b[0] - s.a[0], ey = s.b[1] - s.a[1], den = dx * ey - dy * ex; if (Math.abs(den) < 1e-12) return Infinity; const t = ((s.a[0] - px) * ey - (s.a[1] - py) * ex) / den, u = ((s.a[0] - px) * dy - (s.a[1] - py) * dx) / den; return t >= 0 && u >= 0 && u <= 1 ? t : Infinity; }
  function windowDists(px, py, nx, ny, obs, hits) { const tx = -ny, ty = nx, out = new Float64Array(RAYS.length); for (let k = 0; k < RAYS.length; k++) { const c = Math.cos(RAYS[k]), sn = Math.sin(RAYS[k]), dx = nx * c + tx * sn, dy = ny * c + ty * sn; let best = Infinity, who = null; for (const o of obs) { const t = raySeg(px, py, dx, dy, o); if (t < best) { best = t; who = o; } } out[k] = best; if (hits && who && best < HAD_D) hits.add(who.name); } return out; }
  function fanAt(d, Dm) { const runs = []; let st = -1; for (let k = 0; k <= d.length; k++) { const clear = k < d.length && d[k] >= Dm - 1e-9; if (clear && st < 0) st = k; if (!clear && st >= 0) { runs.push({ k0: st, k1: k - 1, span: k - 1 - st }); st = -1; } } runs.sort((a, b) => b.span - a.span); const one = runs[0] ? runs[0].span : 0, two = one + (runs[1] ? runs[1].span : 0); return { ok: one >= HAD_ONE || two >= HAD_TWO, one, two, runs: runs.slice(0, 2) }; }
  function dStar(d) { if (fanAt(d, HAD_D).ok) return HAD_D; const cand = [...new Set(Array.from(d).filter((v) => v < HAD_D))].sort((a, b) => a - b); let lo = 0, hi = cand.length - 1, best = 0; while (lo <= hi) { const m = (lo + hi) >> 1; if (fanAt(d, cand[m]).ok) { best = cand[m]; lo = m + 1; } else hi = m - 1; } return best; }
  const faceDefs = (b) => [
    { k: 'S', label: 'Street side', nx: 0, ny: -1, ax: 'x', c: b.y, a0: b.x, a1: b.x + b.w }, { k: 'E', label: 'East', nx: 1, ny: 0, ax: 'y', c: b.x + b.w, a0: b.y, a1: b.y + b.d },
    { k: 'N', label: 'North', nx: 0, ny: 1, ax: 'x', c: b.y + b.d, a0: b.x, a1: b.x + b.w }, { k: 'W', label: 'West', nx: -1, ny: 0, ax: 'y', c: b.x, a0: b.y, a1: b.y + b.d }];
  /* bands of storeys that share the same obstacle set; each band has four faces with window samples */
  function forBlock(project, b, nbCap) {
    const bands = []; let prevKey = null;
    for (let i = 0; i < b.floors; i++) { const z = b.z0 + i * b.f2f + SILL, obs = obstaclesAt(project, z, b, nbCap), key = obs.map((o) => o.id).join(','); if (key === prevKey) { bands[bands.length - 1].f1 = i; continue; } prevKey = key; bands.push({ f0: i, f1: i, z, obs }); }
    for (const band of bands) {
      const inside = (px, py) => project.blocks.some((o) => o !== b && o.use !== 'core' && !o.hidden && o.z0 <= band.z + 1e-6 && Model.blockTop(o) > band.z + 1e-6 && px > o.x && px < o.x + o.w && py > o.y && py < o.y + o.d);
      band.faces = faceDefs(b).map((f) => { const len = f.a1 - f.a0, n = Math.max(2, Math.round(len / 2)), ds = len / n, samples = [], blockers = new Set();
        for (let j = 0; j < n; j++) { const a = f.a0 + (j + 0.5) * ds, px = f.ax === 'x' ? a : f.c + f.nx * 0.05, py = f.ax === 'x' ? f.c + f.ny * 0.05 : a;
          if (inside(px, py)) { samples.push({ a, px, py, interior: true, ok: false, d: 0 }); continue; }
          const hits = new Set(), d = windowDists(px, py, f.nx, f.ny, band.obs, hits), at = fanAt(d, HAD_D); if (!at.ok) hits.forEach((h) => blockers.add(h));
          samples.push({ a, px, py, ok: at.ok, one: at.one, two: at.two, runs: at.runs, d: at.ok ? HAD_D : dStar(d) }); }
        const ext = samples.filter((s) => !s.interior); if (!ext.length) return Object.assign({}, f, { samples, ds, blockers, interior: true, frac: 1, best: HAD_D });
        return Object.assign({}, f, { samples, ds, blockers, frac: ext.filter((s) => s.ok).length / ext.length, best: Math.max(...ext.map((s) => s.d)), worst: Math.min(...ext.map((s) => s.d)) }); });
    }
    return bands;
  }
  /* summary for the ledger: per residential block, worst face fraction and blockers */
  function evaluate(project, nbCap) {
    const out = [];
    for (const b of project.blocks) { if (b.use !== 'residential' || b.hidden) continue; const bands = forBlock(project, b, nbCap); let worst = 1, worstFace = null, worstBand = null; const blockers = new Set();
      for (const band of bands) for (const f of band.faces) { if (f.interior) continue; if (f.frac < worst) { worst = f.frac; worstFace = f; worstBand = band; } f.blockers.forEach((x) => blockers.add(x)); }
      out.push({ block: b, bands, worst, worstFace, worstBand, blockers: [...blockers] }); }
    return out;
  }
  return { forBlock, evaluate, HAD_D, HAD_ONE, HAD_TWO };
})();
