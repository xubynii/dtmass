/* sun.js — NOAA solar position for Vancouver on the fall equinox (Solar Access Guidelines: 22 Sep, 10:00–16:00 PDT),
   shadow vectors in the site's local frame, prism shadows and new-shadow-on-park measurement. */
window.Sun = (function () {
  const LAT = 49.283 * Math.PI / 180, LON = -123.118, DOY = 265, TZ = -7; // PDT
  function position(hourLocal, doy = DOY) {
    const g = 2 * Math.PI / 365 * (doy - 1 + (hourLocal - 12) / 24);
    const eot = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    const tst = hourLocal * 60 + eot + 4 * LON - 60 * TZ, ha = (tst / 4 - 180) * Math.PI / 180;
    const cosZ = Math.sin(LAT) * Math.sin(decl) + Math.cos(LAT) * Math.cos(decl) * Math.cos(ha);
    const zen = Math.acos(Math.max(-1, Math.min(1, cosZ))), alt = Math.PI / 2 - zen;
    let az = Math.acos(Math.max(-1, Math.min(1, (Math.sin(LAT) * cosZ - Math.sin(decl)) / (Math.cos(LAT) * Math.sin(zen)))));
    az = ha > 0 ? Math.PI + az : Math.PI - az; // clockwise from north
    return { alt, az, altDeg: alt * 180 / Math.PI, azDeg: az * 180 / Math.PI };
  }
  /* horizontal shadow displacement per metre of height, in local coords given the local north vector */
  function shadowVec(sun, north) {
    if (sun.alt <= 0.01) return null;
    const k = 1 / Math.tan(sun.alt), e = -Math.sin(sun.az), n = -Math.cos(sun.az); // shadow points away from the sun
    const N = north || [0, 1], E = [N[1], -N[0]]; // east = north rotated clockwise in a right-handed x-east y-north frame
    return [(e * E[0] + n * N[0]) * k, (e * E[1] + n * N[1]) * k];
  }
  function prismShadow(ring, z0, z1, sv) { const pts = []; for (const p of ring) { pts.push([p[0] + sv[0] * Math.max(0, z0), p[1] + sv[1] * Math.max(0, z0)]); pts.push([p[0] + sv[0] * z1, p[1] + sv[1] * z1]); } return Site.hull(pts); }
  const rectRing = (r) => [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.d], [r.x, r.y + r.d]];
  /* shadows of the scheme blocks and the context buildings at one hour */
  function shadows(project, ctx, hour) {
    const sun = position(hour); const sv = shadowVec(sun, project.site.north); if (!sv) return { sun, scheme: [], existing: [] };
    const scheme = project.blocks.filter((b) => b.use !== 'core' && Model.blockTop(b) > 0.05 && !b.hidden).map((b) => prismShadow(rectRing(b), b.z0, Model.blockTop(b), sv));
    const existing = (ctx && ctx.foot ? ctx.foot : []).filter((f) => f.h > 0.5).map((f) => prismShadow(f.poly, f.z0 || 0, f.h, sv));
    return { sun, sv, scheme, existing };
  }
  /* new shadow on a park: cells shaded by the scheme and not already by existing buildings, summed over the hours */
  function parkShadow(park, project, ctx, hours = [10, 11, 12, 13, 14, 15, 16], cell = 1.5) {
    const bb = Site.bbox(park.poly); let total = 0; const newly = new Set(), cells = [];
    const pts = []; for (let x = bb[0] + cell / 2; x < bb[2]; x += cell) for (let y = bb[1] + cell / 2; y < bb[3]; y += cell) if (Site.pip([x, y], park.poly)) pts.push([x, y]);
    total = pts.length;
    for (const h of hours) { const S = shadows(project, ctx, h); if (!S.sv) continue;
      pts.forEach((p, i) => { if (newly.has(i)) return; if (!S.scheme.some((s) => Site.pip(p, s))) return; if (S.existing.some((s) => Site.pip(p, s))) return; newly.add(i); cells.push(p); }); }
    return { totalArea: total * cell * cell, newArea: newly.size * cell * cell, cells, cell };
  }
  const SPACES = [['300 Helmcken', 'plaza'], ['Alexandra Park', 'strict'], ['Andy Livingstone', 'strict'], ['Art Phillips', 'plaza'], ['Barclay Heritage', 'strict'], ['Bill Curtis', 'plaza'], ['Blood Alley', 'plaza'], ['Bute-Robson', 'plaza'], ['Cardero Park', 'strict'], ['Cathedral Square', 'plaza'], ['Chinatown Memorial', 'plaza'], ['Coal Harbour Park', 'strict'], ['Coopers', 'strict'], ['CRAB Park', 'strict'], ['Creekside', 'strict'], ['David Lam', 'strict'], ['Devonian', 'strict'], ['Dilawri Square North', 'plaza'], ['Dilawri Square South', 'strict4'], ['Skateboard', 'plaza'], ['Sun Yat-Sen', 'sys'], ['Elsie Roy', 'strict'], ['Emery Barnes', 'strict'], ['English Bay', 'strict'], ['George Wainborn', 'strict'], ['Harbour Green', 'strict'], ['Helmcken Park', 'plaza'], ['Jack Poole', 'strict4'], ['Jervis', 'strict'], ['Jim Deva', 'plaza'], ['King George', 'strict'], ['Lord Roberts', 'strict'], ['Lot 19', 'plaza'], ['Marina Square', 'strict'], ['May & Lorne Brown', 'strict'], ['May and Lorne Brown', 'strict'], ['Morton Park', 'strict'], ['Nelson Park', 'strict'], ['Pigeon Park', 'plaza'], ['Pioneer Place', 'plaza'], ['Portal Park', 'plaza'], ['Robson Square', 'strict4'], ['Roundhouse', 'strict'], ['Sunset Beach', 'strict'], ['Art Gallery', 'plaza'], ['Queen Elizabeth Theatre', 'plaza'], ['Rainbow Park', 'strict'], ['Thornton', 'strict'], ['Victory Square', 'plaza'], ['Wendy Poole', 'strict'], ['Yaletown Park', 'plaza'], ['Minipark', 'plaza']];
  function spaceClass(name) { const n = String(name || '').toLowerCase(); for (const [k, c] of SPACES) if (n.includes(k.toLowerCase())) return c; return null; }
  return { position, shadowVec, prismShadow, shadows, parkShadow, spaceClass, rectRing, HOURS: [10, 11, 12, 13, 14, 15, 16] };
})();
