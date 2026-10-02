/* scene3d.js — the 3D view (three.js r128) and direct modelling.
   Tools:  Select   click a block to select it; drag empty space to orbit, right-drag to pan, scroll to zoom.
           Push/Pull hover a face to highlight it; drag a side face to change width or depth (the opposite face stays put) or drag
                    the roof to change height (base stays put; whole storeys by default). Click a face without dragging, or start
                    typing during a drag, to enter an exact Offset or Final dimension; Enter applies, Esc cancels.
           Move     axis arrows (east–west, north–south) and a horizontal plane handle reposition the block without resizing it.
   Snapping: distance increment, whole storeys for roofs, alignment to nearby block faces / site edges / height limits (dashed guides);
   hold Alt to ignore snapping. "Constrain to limits" keeps blocks inside the site and under a confirmed height limit.
   Every completed operation is one undo step; Esc restores the starting geometry. The camera never moves during an edit.
   Model frame: x east, y north, z up (m). three frame: X = x, Y = z, Z = -y. */
window.Scene3D = (function () {
  let canvas, renderer, scene, camera, persp, ortho, app, aspect = 1, ready = false, dom = {};
  const FOV = 36;
  const target = { x: 30, y: 15, z: 18 }; const VIEW0 = { theta: 0.62, phi: 0.98 }; let sph = { r: 150, theta: VIEW0.theta, phi: VIEW0.phi };
  let staticG, envG, blockG, shadowG, fxG, staticKey = null, blockMeshes = new Map(), pickExtra = [], gizmo = [], hover = null, drag = null, op = null, lastPtr = { x: 0, y: 0 }, annots = [];
  const T3 = (x, y, z) => new THREE.Vector3(x, z, -y);
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const col = (n) => new THREE.Color(css(n) || '#888');
  const useHex = (u) => col(u === 'residential' ? '--res' : '--' + u);
  const useLine = (u) => col(u === 'residential' ? '--res-line' : '--' + u + '-line');
  const tool = () => (app.state && app.state.tool) || 'select';
  const r2 = (v) => Math.round(v * 100) / 100;
  const fmtM = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)} m`;
  const FACE = { 'x+': { n: [1, 0, 0], label: 'East face', dim: 'Width' }, 'x-': { n: [-1, 0, 0], label: 'West face', dim: 'Width' }, 'n+': { n: [0, 1, 0], label: 'North face', dim: 'Depth' }, 's-': { n: [0, -1, 0], label: 'South face', dim: 'Depth' }, top: { n: [0, 0, 1], label: 'Roof', dim: 'Height' } };

  function init(cv, a, opts = {}) {
    if (!window.THREE) return false; canvas = cv; app = a; dom = opts; ray = new THREE.Raycaster(); ndc = new THREE.Vector2();
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true }); renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    scene = new THREE.Scene(); persp = new THREE.PerspectiveCamera(FOV, 1, 0.5, 6000); ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -9000, 9000); camera = app.state.aids.perspective ? persp : ortho;
    scene.add(new THREE.HemisphereLight(0xffffff, 0xe6e4df, 0.95)); const sun = new THREE.DirectionalLight(0xffffff, 0.16); sun.position.set(-70, 120, 50); scene.add(sun);
    staticG = new THREE.Group(); envG = new THREE.Group(); shadowG = new THREE.Group(); blockG = new THREE.Group(); fxG = new THREE.Group(); scene.add(staticG, envG, shadowG, blockG, fxG);
    canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', () => { if (op) cancelOp(); drag = null; });
    canvas.addEventListener('pointerleave', () => { if (!drag && hover) { hover = null; buildFx(); frame(); } });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); sph.r = Math.min(4000, Math.max(12, sph.r * (1 + e.deltaY * 0.0012))); refresh(false); }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault()); canvas.addEventListener('dblclick', () => { if (!op) fitProject(true); });
    window.addEventListener('keydown', onKey, true);
    new ResizeObserver(resize).observe(canvas.parentElement); resize();
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { staticKey = null; refresh(true); });
    new MutationObserver(() => { staticKey = null; refresh(true); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    ready = true; resetView(); return true;
  }
  function resize() { if (!renderer) return; const r = canvas.parentElement.getBoundingClientRect(); const w = Math.max(10, r.width), h = Math.max(10, r.height); renderer.setSize(w, h, false); canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; aspect = w / h; persp.aspect = aspect; persp.updateProjectionMatrix(); frame(); }
  /* orthographic axonometric by default; its frustum follows the orbit distance so zoom, fit and handle sizes behave as before */
  function updateCamera() { camera = app.state.aids.perspective ? persp : ortho; if (camera === ortho) { const hh = sph.r * Math.tan(FOV * Math.PI / 360); ortho.left = -hh * aspect; ortho.right = hh * aspect; ortho.top = hh; ortho.bottom = -hh; ortho.near = -Math.max(600, sph.r * 1.5); ortho.far = sph.r + 2600; ortho.updateProjectionMatrix(); } camera.position.set(target.x + sph.r * Math.sin(sph.phi) * Math.sin(sph.theta), target.y + sph.r * Math.cos(sph.phi), target.z + sph.r * Math.sin(sph.phi) * Math.cos(sph.theta)); camera.up.set(0, 1, 0); camera.lookAt(target.x, target.y, target.z); }
  function frame() { if (!renderer) return; updateCamera(); renderer.render(scene, camera); placeAnnots(); placeReadout(); placeCompass(); }
  /* the on-screen north arrow turns with the camera */
  function placeCompass() { const el = dom.compass; if (!el || app.state.view !== '3d') return; const s = app.project().site, N = s.north || [0, 1], a = T3(s.w / 2, s.d / 2, 0).project(camera), b = T3(s.w / 2 + N[0] * 20, s.d / 2 + N[1] * 20, 0).project(camera); const ang = Math.atan2((b.x - a.x) * aspect, b.y - a.y); const sv = el.firstElementChild; if (sv) sv.style.transform = `rotate(${(ang * 180 / Math.PI).toFixed(1)}deg)`; }
  function projectBox() { const s = app.project().site; let x0 = 0, y0 = 0, x1 = s.w, y1 = s.d, z1 = 0, z0 = 0; for (const b of app.project().blocks) { if (b.hidden) continue; const bb = window.Form && Form.active(b) ? Form.bounds(b, app.project()) : { x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.d }; x0 = Math.min(x0, bb.x0); y0 = Math.min(y0, bb.y0); x1 = Math.max(x1, bb.x1); y1 = Math.max(y1, bb.y1); z1 = Math.max(z1, Model.blockTop(b)); z0 = Math.min(z0, b.z0); } return { x0, y0, x1, y1, z0, z1 }; }
  /* frame the proposal's bounding sphere in the space left between the viewport's toolbars */
  function fitProject(keepAngle = true) { const B = projectBox(), h = Math.max(15, B.z1), w = B.x1 - B.x0, d = B.y1 - B.y0; target.x = (B.x0 + B.x1) / 2; target.y = h * 0.42; target.z = -(B.y0 + B.y1) / 2;
    const radius = 0.5 * Math.hypot(w, d, h), vf = (FOV * Math.PI) / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * aspect); sph.r = Math.max(50, (radius / Math.sin(Math.min(vf, hf) / 2)) * 1.12); if (!app.state.aids.perspective) sph.r *= 1.18; if (!keepAngle) { sph.theta = VIEW0.theta; sph.phi = VIEW0.phi; } frame(); }
  function resetView() { fitProject(false); }
  function fitDistrict() { const cx = app.context(); if (!cx || !cx.dd || !cx.dd.length) { fitProject(true); sph.r *= 4; frame(); return; } const bb = Site.bbox(cx.dd.flat()); target.x = (bb[0] + bb[2]) / 2; target.y = 0; target.z = -(bb[1] + bb[3]) / 2; sph = { r: Math.max(bb[2] - bb[0], bb[3] - bb[1]) * 1.1, theta: VIEW0.theta, phi: 0.9 }; frame(); }

  /* ---------- geometry helpers ---------- */
  function ringMesh(ring, z, mat) { const sh = new THREE.Shape(ring.map((p) => new THREE.Vector2(p[0], p[1]))); const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2); const m = new THREE.Mesh(g, mat); m.position.y = z; return m; }
  function ringLine(ring, z, mat, closed = true) { const pts = ring.map((p) => T3(p[0], p[1], z)); if (closed) pts.push(pts[0].clone()); const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat); if (mat.isLineDashedMaterial) l.computeLineDistances(); return l; }
  function segs(list, mat) { const g = new THREE.BufferGeometry().setFromPoints(list); const l = new THREE.LineSegments(g, mat); if (mat.isLineDashedMaterial) l.computeLineDistances(); return l; }
  function ribbon(ring, z, w, mat, closed = true) { const pos = []; const n = ring.length; for (let i = 0; i < n - (closed ? 0 : 1); i++) { const a = ring[i], b = ring[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.05) continue; const nx = -(b[1] - a[1]) / L * w / 2, ny = (b[0] - a[0]) / L * w / 2; const P = (x, y) => [x, z, -y]; pos.push(...P(a[0] + nx, a[1] + ny), ...P(b[0] + nx, b[1] + ny), ...P(b[0] - nx, b[1] - ny), ...P(a[0] + nx, a[1] + ny), ...P(b[0] - nx, b[1] - ny), ...P(a[0] - nx, a[1] - ny)); } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); return new THREE.Mesh(g, mat); }
  function prismGeom(ring, h) { const sh = new THREE.Shape(ring.map((p) => new THREE.Vector2(p[0], p[1]))); const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false }); g.rotateX(-Math.PI / 2); return g; }
  function mergedPrisms(list, mat, edgeMat) { const pos = [], epos = [];
    for (const f of list) { let g; try { g = prismGeom(f.poly, Math.max(0.5, f.h - (f.z0 || 0))); if (f.z0) g.translate(0, f.z0, 0); } catch (e) { continue; } const a = g.attributes.position.array, idx = g.index; if (idx) { for (let i = 0; i < idx.count; i++) { const k = idx.array[i] * 3; pos.push(a[k], a[k + 1], a[k + 2]); } } else for (let i = 0; i < a.length; i++) pos.push(a[i]); if (edgeMat) { const e = new THREE.EdgesGeometry(g, 20).attributes.position.array; for (let i = 0; i < e.length; i++) epos.push(e[i]); } g.dispose(); }
    const grp = new THREE.Group(); if (!pos.length) return grp; const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); mg.computeVertexNormals(); grp.add(new THREE.Mesh(mg, mat)); if (edgeMat && epos.length) { const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.Float32BufferAttribute(epos, 3)); grp.add(new THREE.LineSegments(eg, edgeMat)); } return grp; }
  function label(text, x, y, z, group = staticG, color) { const c = document.createElement('canvas'); c.width = 512; c.height = 96; const g = c.getContext('2d'); g.font = '500 34px "Inter", sans-serif'; g.fillStyle = color || css('--muted'); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 48); const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false })); const k = 1.3 * Math.max(0.8, sph.r / 160); sp.scale.set(k * 5.33, k, 1); sp.position.copy(T3(x, y, z)); group.add(sp); }
  /* a street name lying flat on the ground, reading along the street; `ang` is the street direction in plan (radians from +x toward +y) */
  function flatLabel(text, x, y, ang, size = 4, group = staticG, color) { const c = document.createElement('canvas'); c.width = 1024; c.height = 160; const g = c.getContext('2d'); g.font = '600 112px "Inter", sans-serif'; g.fillStyle = color || css('--ink2'); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 512, 84);
    let a = ((ang % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); if (a > Math.PI / 2 && a < Math.PI * 1.5) a += Math.PI; // keep the text readable from the south
    const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4; const m = new THREE.Mesh(new THREE.PlaneGeometry(size * 1024 / 160, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); m.rotation.set(-Math.PI / 2, a, 0, 'YXZ'); m.position.copy(T3(x, y, 0.3)); m.renderOrder = 6; group.add(m); }
  const dispose = (grp) => { grp.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); grp.clear(); };

  /* ---------- static layer: ground, streets, parks, surrounding city, site boundary ---------- */
  function buildStatic() {
    const s = app.project().site, cx = app.context(), A = app.state.aids, opacity = A.contextOpacity == null ? 0.6 : A.contextOpacity;
    const key = `${s.parcelIndex}:${s.w}:${s.d}:${opacity}:${A.streetNames}:${A.buildingNames}:${document.documentElement.dataset.theme}:${matchMedia('(prefers-color-scheme: dark)').matches}`;
    if (key === staticKey) return; staticKey = key; dispose(staticG);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), new THREE.MeshLambertMaterial({ color: col('--stage') })); ground.rotation.x = -Math.PI / 2; ground.position.set(s.w / 2, -0.06, -s.d / 2); staticG.add(ground);
    const sitePoly = s.poly || [[0, 0], [s.w, 0], [s.w, s.d], [0, s.d]];
    staticG.add(ringMesh(sitePoly, 0, new THREE.MeshLambertMaterial({ color: col('--site-fill'), side: THREE.DoubleSide })));
    staticG.add(ribbon(sitePoly, 0.06, 0.45, new THREE.MeshBasicMaterial({ color: col('--site-line'), side: THREE.DoubleSide })));
    if (cx && opacity > 0.01) {
      const rpos = []; const strip = (pts, w) => { for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.5) continue; const nx = -(b[1] - a[1]) / L * w / 2, ny = (b[0] - a[0]) / L * w / 2; const P = (x, y) => [x, -0.03, -y]; rpos.push(...P(a[0] + nx, a[1] + ny), ...P(b[0] + nx, b[1] + ny), ...P(b[0] - nx, b[1] - ny), ...P(a[0] + nx, a[1] + ny), ...P(b[0] - nx, b[1] - ny), ...P(a[0] - nx, a[1] - ny)); } };
      const seen = new Set(), mine = new Set((s.edges || []).filter((e) => e.kind === 's' && e.name).map((e) => e.name)); for (const st of cx.streets) { strip(st.pts, 18); const i = Math.max(0, Math.floor(st.pts.length / 2) - 1), a0 = st.pts[i], a1 = st.pts[Math.min(st.pts.length - 1, i + 1)], mid = st.pts[Math.floor(st.pts.length / 2)]; if (A.streetNames && st.name && !seen.has(st.name) && !mine.has(st.name) && Math.hypot(mid[0] - s.w / 2, mid[1] - s.d / 2) < 110) { seen.add(st.name); flatLabel(st.name.replace(/^\d+(-\d+)? /, ''), mid[0], mid[1], Math.atan2(a1[1] - a0[1], a1[0] - a0[0]), 3.2, staticG, css('--muted')); } }
      for (const l of cx.lanes || []) strip(l, 6);
      if (rpos.length) { const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rpos, 3)); rg.computeVertexNormals(); staticG.add(new THREE.Mesh(rg, new THREE.MeshLambertMaterial({ color: col('--street'), side: THREE.DoubleSide }))); }
      const pk = new THREE.MeshLambertMaterial({ color: col('--park'), transparent: true, opacity: 0.6, side: THREE.DoubleSide });
      for (const p of cx.parks) { if (p.poly.length < 3) continue; try { staticG.add(ringMesh(p.poly, -0.01, pk)); } catch (e) { /* skip */ } }
      if (cx.footAll) { const nb = new THREE.MeshLambertMaterial({ color: col('--context'), transparent: opacity < 0.99, opacity, depthWrite: true }), ne = new THREE.LineBasicMaterial({ color: col('--context-edge'), transparent: true, opacity: Math.min(0.75, opacity * 0.7) }); const g = mergedPrisms(cx.footAll, nb, ne); g.name = 'context'; staticG.add(g);
        if (A.buildingNames) { const named = cx.footAll.filter((b) => b.name && b.h >= 20).map((b) => ({ b, c: Site.centroid(b.poly) })).filter((x) => Math.hypot(x.c[0] - s.w / 2, x.c[1] - s.d / 2) < 260).sort((p, q) => q.b.h - p.b.h).slice(0, 20); const seenN = new Set(); for (const x of named) { if (seenN.has(x.b.name)) continue; seenN.add(x.b.name); label(x.b.name, x.c[0], x.c[1], x.b.h + 3); } } }
    }
    if (A.streetNames) { /* the site's own streets: one large name per street edge, centred on the block face and lying in the street */
      const edges = window.Rules && Rules.siteEdges ? Rules.siteEdges(s).filter((e) => e.kind === 'street') : []; if (edges.length) for (const e of edges) { const name = (e.name || (s.streets && s.streets[0]) || 'Street').replace(/^\d+(-\d+)? /, ''); flatLabel(name, (e.a[0] + e.b[0]) / 2 - e.nx * 9, (e.a[1] + e.b[1]) / 2 - e.ny * 9, Math.atan2(e.b[1] - e.a[1], e.b[0] - e.a[0]), 4.5, staticG, css('--fg')); } else flatLabel('Street', s.w / 2, -9, 0, 4.5, staticG, css('--fg')); }
    if (A.entourage) { const fig = new THREE.MeshLambertMaterial({ color: col('--accent-line') }), body = new THREE.CylinderGeometry(0.2, 0.24, 1.35, 8), head = new THREE.SphereGeometry(0.17, 10, 8); let k = 0;
      const edges = s.edges ? s.edges.filter((e) => e.kind !== 'lane') : [{ a: [0, 0], b: [s.w, 0] }];
      for (const e of edges) { const dx = e.b[0] - e.a[0], dy = e.b[1] - e.a[1], L = Math.hypot(dx, dy) || 1, nx = dy / L, ny = -dx / L; for (let t = 4; t < L - 2; t += 9) { k++; const off = 2.2 + ((k * 37) % 10) / 10 * 1.6, x = e.a[0] + dx / L * (t + ((k * 13) % 5)) + nx * off, y = e.a[1] + dy / L * (t + ((k * 13) % 5)) + ny * off; const b1 = new THREE.Mesh(body, fig); b1.position.copy(T3(x, y, 0.68)); const h1 = new THREE.Mesh(head, fig); h1.position.copy(T3(x, y, 1.55)); staticG.add(b1, h1); } } }

  }
  function buildEnvelope() {
    dispose(envG); const s = app.project().site, A = app.state.aids, env = app.envelope ? app.envelope() : null; const sitePoly = s.poly || [[0, 0], [s.w, 0], [s.w, s.d], [0, s.d]]; const ec = col('--envelope');
    if (A.envelope && env && env.basic) { const box = (h, op2, dash) => { envG.add(ringLine(sitePoly, h, new THREE.LineDashedMaterial({ color: ec, dashSize: dash, gapSize: dash * 0.6, transparent: true, opacity: op2 }))); for (const p of sitePoly) { const v = new THREE.Line(new THREE.BufferGeometry().setFromPoints([T3(p[0], p[1], 0), T3(p[0], p[1], h)]), new THREE.LineDashedMaterial({ color: ec, dashSize: dash, gapSize: dash * 0.6, transparent: true, opacity: op2 * 0.5 })); v.computeLineDistances(); envG.add(v); } envG.add(ringMesh(sitePoly, h, new THREE.MeshBasicMaterial({ color: ec, transparent: true, opacity: op2 * 0.05, side: THREE.DoubleSide, depthWrite: false }))); };
      box(env.basic, 0.85, 1.2); if (env.max) box(env.max, 0.35, 2.5); }
    if (A.setbacks !== false && window.Rules && Rules.siteEdges && CODES.odp.guidelineSetbacks) { const set = CODES.odp.guidelineSetbacks[s.setbackSet || 'none']; if (set && set.rules.length) { const top = (env && (env.max || env.basic)) || 40, sc = col('--accent-line'), lineMat = new THREE.LineDashedMaterial({ color: sc, dashSize: 1.5, gapSize: 1, transparent: true, opacity: 0.9 }), faceMat = new THREE.MeshBasicMaterial({ color: sc, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide });
      for (const e of Rules.siteEdges(s)) for (const rule of set.rules) { if (rule.edge !== e.kind || !(rule.d > 0)) continue; const tx = (e.b[0] - e.a[0]) / e.L, ty = (e.b[1] - e.a[1]) / e.L, a = [e.a[0] + e.nx * rule.d + tx * rule.d, e.a[1] + e.ny * rule.d + ty * rule.d], b = [e.b[0] + e.nx * rule.d - tx * rule.d, e.b[1] + e.ny * rule.d - ty * rule.d]; if (e.L - 2 * rule.d < 1) continue;
        const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([T3(a[0], a[1], rule.above + 0.05), T3(b[0], b[1], rule.above + 0.05)]), lineMat); l.computeLineDistances(); envG.add(l);
        const P = (x, y, z) => [x, z, -y], g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([...P(a[0], a[1], rule.above), ...P(b[0], b[1], rule.above), ...P(b[0], b[1], top), ...P(a[0], a[1], rule.above), ...P(b[0], b[1], top), ...P(a[0], a[1], top)], 3)); envG.add(new THREE.Mesh(g, faceMat));
        label(rule.label, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, rule.above + 1.2, envG, css('--accent-ink')); } } }
    if (A.daylight) { const h = (env && (env.max || env.basic)) || 30, mat = new THREE.MeshBasicMaterial({ color: col('--context'), transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }); const edges = s.edges ? s.edges.filter((e) => e.kind === 'x') : [];
      if (!s.edges) { for (const k of 'NSEW') if (k !== s.frontage && k !== s.lane) edges.push(k === 'N' ? { a: [0, s.d], b: [s.w, s.d] } : k === 'S' ? { a: [0, 0], b: [s.w, 0] } : k === 'E' ? { a: [s.w, 0], b: [s.w, s.d] } : { a: [0, 0], b: [0, s.d] }); }
      for (const e of edges) { const P = (x, y, z) => [x, z, -y]; const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([...P(e.a[0], e.a[1], 0), ...P(e.b[0], e.b[1], 0), ...P(e.b[0], e.b[1], h), ...P(e.a[0], e.a[1], 0), ...P(e.b[0], e.b[1], h), ...P(e.a[0], e.a[1], h)], 3)); envG.add(new THREE.Mesh(g, mat)); } }
  }
  function buildShadows() {
    dispose(shadowG); const A = app.state.aids; if (!A.shadow || !window.Sun) return; const pr = app.massProject ? app.massProject() : app.project(), cx = app.context(); const S = Sun.shadows(pr, cx, A.hour); if (!S.sv) return;
    const sm = new THREE.MeshBasicMaterial({ color: 0x3d3a34, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }); for (const r of S.scheme) if (r.length >= 3) shadowG.add(ringMesh(r, 0.02, sm));
    const em = new THREE.MeshBasicMaterial({ color: 0x3d3a34, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide }); for (const r of S.existing) if (r.length >= 3) shadowG.add(ringMesh(r, 0.015, em));
    if (cx) { const pos = []; for (const pk of cx.parks) { const r = Sun.parkShadow(pk, pr, cx, [A.hour]); for (const q of r.cells) { const h = r.cell / 2 - 0.05; const P = (x, y) => [x, 0.05, -y]; pos.push(...P(q[0] - h, q[1] - h), ...P(q[0] + h, q[1] - h), ...P(q[0] + h, q[1] + h), ...P(q[0] - h, q[1] - h), ...P(q[0] + h, q[1] + h), ...P(q[0] - h, q[1] + h)); } }
      if (pos.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); shadowG.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col('--fail'), transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }))); } }
  }

  /* ---------- blocks ---------- */
  function buildBlocks() {
    dispose(blockG); blockMeshes.clear(); pickExtra = []; gizmo = []; annots = [];
    const pr = app.project(), A = app.state.aids, sel = app.selected(), focus = app.focus ? app.focus() : new Set(), dl = A.daylight && app.daylight ? app.daylight() : null;
    const opFail = op && op.warn && op.warn.some((w) => w.level === 'fail');
    for (const b of pr.blocks) { if (b.hidden) continue; if (window.Form && Form.active(b)) { sculpt(b, sel, focus); if (sel && sel.id === b.id) annotate(b); continue; } const h = hOf(b), below = Model.blockTop(b) <= 0.01; const geo = new THREE.BoxGeometry(b.w, h, b.d);
      const mat = new THREE.MeshLambertMaterial({ color: b.use === 'core' ? col('--core') : useHex(b.use), transparent: below, opacity: below ? 0.35 : 1, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      const m = new THREE.Mesh(geo, mat); m.position.set(b.x + b.w / 2, b.z0 + h / 2, -(b.y + b.d / 2)); m.userData.id = b.id; blockG.add(m); blockMeshes.set(b.id, m);
      const isSel = sel && sel.id === b.id, isFocus = focus.has(b.id), isOp = op && op.id === b.id;
      blockG.add(place(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: isFocus && !isSel ? col('--review') : useLine(b.use), transparent: true, opacity: below ? 0.6 : 1 })), m));
      if (isFocus && !isSel) blockG.add(place(new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.6, h + 0.6, b.d + 0.6), new THREE.MeshBasicMaterial({ color: col('--review'), transparent: true, opacity: 0.12, depthWrite: false })), m));
      if (isSel) { const oc = isOp && opFail ? col('--fail') : col('--accent'); const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(b.w + 0.2, h + 0.2, b.d + 0.2)), new THREE.LineBasicMaterial({ color: oc, transparent: true, opacity: 1 })); outline.renderOrder = 9; blockG.add(place(outline, m)); const o2 = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(b.w + 0.45, h + 0.45, b.d + 0.45)), new THREE.LineBasicMaterial({ color: oc, transparent: true, opacity: 0.6 })); o2.renderOrder = 9; blockG.add(place(o2, m)); }
      if (A.floorLines && b.floors > 1 && b.use !== 'core') { const pts = []; for (let i = 1; i < b.floors; i++) { const z = b.z0 + i * b.f2f; pts.push(T3(b.x, b.y, z), T3(b.x + b.w, b.y, z), T3(b.x + b.w, b.y, z), T3(b.x + b.w, b.y + b.d, z), T3(b.x + b.w, b.y + b.d, z), T3(b.x, b.y + b.d, z), T3(b.x, b.y + b.d, z), T3(b.x, b.y, z)); } blockG.add(segs(pts, new THREE.LineBasicMaterial({ color: useLine(b.use), transparent: true, opacity: 0.35 }))); }
      if (dl) { const r = dl.find((x) => x.block === b); if (r) drawDaylight(b, r.bands); }
      if (isSel) annotate(b);
    }
    for (const c of pr.blocks) if (!c.hidden && c.use === 'core' && A.coreLabels && !(sel && sel.id === c.id)) annots.push({ p: T3(c.x + c.w / 2, c.y + c.d / 2, Model.blockTop(c) + 0.3), text: c.name || 'Core', cls: 'core' });
    for (const r of pr.ramps) { const rr = Plans.rampRect(r); const zAt = (x, y) => { const t = r.dir === 'N' ? (y - rr.y) / rr.d : r.dir === 'S' ? 1 - (y - rr.y) / rr.d : r.dir === 'E' ? (x - rr.x) / rr.w : 1 - (x - rr.x) / rr.w; return r.zTop - t * (r.zTop - r.zBottom); }; const pts = [[rr.x, rr.y], [rr.x + rr.w, rr.y], [rr.x + rr.w, rr.y + rr.d], [rr.x, rr.y + rr.d]].map(([x, y]) => T3(x, y, zAt(x, y))); const g = new THREE.BufferGeometry().setFromPoints([pts[0], pts[1], pts[2], pts[0], pts[2], pts[3]]); g.computeVertexNormals(); const isSel = sel && sel.id === r.id; const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: isSel ? col('--accent') : col('--ramp'), transparent: true, opacity: 0.65, side: THREE.DoubleSide })); m.userData.id = r.id; m.userData.ramp = true; blockG.add(m); blockMeshes.set(r.id, m); }
    buildFx();
  }
  const hOf = (b) => (b.use === 'core' ? b.f2f : b.floors * b.f2f);
  /* sculpted tower forms (form.js): true per-storey plates, merged where storeys repeat; picking maps back to the block */
  function sculpt(b, sel, focus) {
    const bx = Form.boxes(b, app.project()) || [], isSel = !!(sel && sel.id === b.id), isFocus = focus.has(b.id), A = app.state.aids;
    const mat = new THREE.MeshLambertMaterial({ color: useHex(b.use), polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const lm = new THREE.LineBasicMaterial({ color: isSel ? col('--accent') : isFocus ? col('--review') : useLine(b.use) }), fl = [];
    for (const q of bx) { const h = q.z1 - q.z0, geo = new THREE.BoxGeometry(q.w, h, q.d), m = new THREE.Mesh(geo, mat); m.position.set(q.x, q.z0 + h / 2, -q.y); m.rotation.y = q.rot; m.userData.id = b.id; m.userData.rot = q.rot; blockG.add(m); pickExtra.push(m);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), lm); e.position.copy(m.position); e.rotation.y = q.rot; blockG.add(e);
      if (A.floorLines && h > b.f2f * 1.5) { const c = Math.cos(q.rot), sn = Math.sin(q.rot), P = (lx, ly, z) => T3(q.x + lx * c - ly * sn, q.y + lx * sn + ly * c, z), hw = q.w / 2, hd = q.d / 2; for (let z = q.z0 + b.f2f; z < q.z1 - 0.01; z += b.f2f) fl.push(P(-hw, -hd, z), P(hw, -hd, z), P(hw, -hd, z), P(hw, hd, z), P(hw, hd, z), P(-hw, hd, z), P(-hw, hd, z), P(-hw, -hd, z)); } }
    if (fl.length) blockG.add(segs(fl, new THREE.LineBasicMaterial({ color: useLine(b.use), transparent: true, opacity: 0.35 })));
    if (isSel && tool() === 'push') { const h = hOf(b), env = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(b.w, h, b.d)), new THREE.LineDashedMaterial({ color: col('--accent-line'), dashSize: 1.2, gapSize: 0.8, transparent: true, opacity: 0.9 })); env.computeLineDistances(); env.position.set(b.x + b.w / 2, b.z0 + h / 2, -(b.y + b.d / 2)); blockG.add(env); }
  }
  const INKC = window.THREE ? new THREE.Color(0x262626) : null;
  /* a fine dimension line with extension lines and end ticks, offset from the measured edge; returns its midpoint */
  function dimLine(a, b, off, hot) {
    const A = a.map((v, i) => v + off[i]), B = b.map((v, i) => v + off[i]), L = Math.hypot(off[0], off[1], off[2]) || 1, u = off.map((v) => v / L), t = 0.6, e = [];
    const P = (q) => T3(q[0], q[1], q[2]); e.push(P(A), P(B), P(a.map((v, i) => v + u[i] * 0.4)), P(A.map((v, i) => v + u[i] * 0.6)), P(b.map((v, i) => v + u[i] * 0.4)), P(B.map((v, i) => v + u[i] * 0.6)));
    const d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], dl = Math.hypot(...d) || 1, k = [(d[0] / dl + u[0]) * t, (d[1] / dl + u[1]) * t, (d[2] / dl + u[2]) * t];
    for (const q of [A, B]) e.push(P(q.map((v, i) => v - k[i])), P(q.map((v, i) => v + k[i])));
    const l = segs(e, new THREE.LineBasicMaterial({ color: hot ? col('--accent') : INKC, depthTest: false, transparent: true, opacity: hot ? 1 : 0.7 })); l.renderOrder = 10; blockG.add(l);
    return T3((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2);
  }
  function place(obj, m) { obj.position.copy(m.position); return obj; }
  /* compact annotations: only what the current operation changes */
  function annotate(b) {
    const h = hOf(b), top = b.z0 + h, A = app.state.aids, k = op && op.id === b.id ? op : null;
    const zb = Math.max(b.z0, 0) + 0.15, off = Math.max(2.5, Math.min(6, Math.max(b.w, b.d) * 0.12));
    if (k && k.kind === 'push' && k.face !== 'top') { const hw = k.face === 'x+' || k.face === 'x-', hd = !hw; const pw = dimLine([b.x, b.y, zb], [b.x + b.w, b.y, zb], [0, -off, 0], hw), pd = dimLine([b.x + b.w, b.y, zb], [b.x + b.w, b.y + b.d, zb], [off, 0, 0], hd); annots.push({ p: pw, text: `${b.w.toFixed(2)} m`, cls: hw ? 'hot' : '' }); annots.push({ p: pd, text: `${b.d.toFixed(2)} m`, cls: hd ? 'hot' : '' }); return; }
    if (k && k.kind === 'push' && k.face === 'top') { const ph = dimLine([b.x + b.w, b.y, b.z0], [b.x + b.w, b.y, top], [off * 0.7, -off * 0.7, 0], true); annots.push({ p: ph, text: b.use === 'core' ? `${h.toFixed(2)} m` : `${b.floors} storeys · ${h.toFixed(1)} m`, cls: 'hot', dx: 14 }); return; }
    if (k && k.kind === 'move') { annots.push({ p: T3(b.x + b.w / 2, b.y + b.d / 2, Math.max(b.z0, 0) + 0.2), text: `Δx ${fmtM(b.x - k.start.x)} · Δy ${fmtM(b.y - k.start.y)}`, cls: 'hot', dy: 26 }); return; }
    if (A.dims && !op) annots.push({ p: T3(b.x + b.w / 2, b.y, Math.max(b.z0, 0) + 0.2), text: `${b.w} × ${b.d} m`, cls: '' });
    if (b.use === 'core' && (A.coreLabels || true)) annots.push({ p: T3(b.x + b.w / 2, b.y + b.d / 2, top + 0.3), text: b.name || 'Core', cls: 'core' });
  }
  function drawDaylight(b, bands) { const pass = col('--pass'), warn = col('--review'), fail = col('--fail'), pos = [], cc = []; const push = (k, ...v) => { for (let i = 0; i < v.length; i += 3) { pos.push(v[i], v[i + 1], v[i + 2]); cc.push(k.r, k.g, k.b); } };
    for (const band of bands) { const z0 = b.z0 + band.f0 * b.f2f + 0.15, z1 = b.z0 + (band.f1 + 1) * b.f2f - 0.15; for (const F of band.faces) { const o = 0.08, g = Math.min(0.25, F.ds * 0.12); for (const s of F.samples) { if (s.interior) continue; const k = s.ok ? pass : s.d >= 3.7 ? warn : fail, a0 = s.a - F.ds / 2 + g, a1 = s.a + F.ds / 2 - g; const P = (x, y, z) => [x, z, -y];
      if (F.ax === 'x') { const y = F.c + F.ny * o; push(k, ...P(a0, y, z0), ...P(a1, y, z0), ...P(a1, y, z1), ...P(a0, y, z0), ...P(a1, y, z1), ...P(a0, y, z1)); } else { const x = F.c + F.nx * o; push(k, ...P(x, a0, z0), ...P(x, a1, z0), ...P(x, a1, z1), ...P(x, a0, z0), ...P(x, a1, z1), ...P(x, a0, z1)); } } } }
    if (!pos.length) return; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3)); blockG.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }))); }

  /* ---------- effects layer: face highlight, start-geometry ghost, alignment guides ---------- */
  function faceQuad(b, key, inset = 0) { const h = hOf(b), z0 = b.z0, z1 = b.z0 + h, e = 0.06; let pts;
    if (key === 'x+') pts = [[b.x + b.w + e, b.y, z0], [b.x + b.w + e, b.y + b.d, z0], [b.x + b.w + e, b.y + b.d, z1], [b.x + b.w + e, b.y, z1]];
    else if (key === 'x-') pts = [[b.x - e, b.y, z0], [b.x - e, b.y + b.d, z0], [b.x - e, b.y + b.d, z1], [b.x - e, b.y, z1]];
    else if (key === 'n+') pts = [[b.x, b.y + b.d + e, z0], [b.x + b.w, b.y + b.d + e, z0], [b.x + b.w, b.y + b.d + e, z1], [b.x, b.y + b.d + e, z1]];
    else if (key === 's-') pts = [[b.x, b.y - e, z0], [b.x + b.w, b.y - e, z0], [b.x + b.w, b.y - e, z1], [b.x, b.y - e, z1]];
    else pts = [[b.x, b.y, z1 + e], [b.x + b.w, b.y, z1 + e], [b.x + b.w, b.y + b.d, z1 + e], [b.x, b.y + b.d, z1 + e]];
    void inset; return pts.map((p) => T3(p[0], p[1], p[2])); }
  function faceCentre(b, key) { const h = hOf(b), zc = b.z0 + h / 2; if (key === 'x+') return [b.x + b.w, b.y + b.d / 2, zc]; if (key === 'x-') return [b.x, b.y + b.d / 2, zc]; if (key === 'n+') return [b.x + b.w / 2, b.y + b.d, zc]; if (key === 's-') return [b.x + b.w / 2, b.y, zc]; return [b.x + b.w / 2, b.y + b.d / 2, b.z0 + h]; }
  function buildFx() {
    dispose(fxG); const pr = app.project(), acc = col('--accent');
    const showFace = (b, key, strong) => { const q = faceQuad(b, key); const g = new THREE.BufferGeometry().setFromPoints([q[0], q[1], q[2], q[0], q[2], q[3]]); const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col('--accent'), transparent: true, opacity: strong ? 0.2 : 0.13, side: THREE.DoubleSide, depthTest: false, depthWrite: false })); m.renderOrder = 8; fxG.add(m);
      const ol = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(q), new THREE.LineBasicMaterial({ color: acc, depthTest: false })); ol.renderOrder = 9; fxG.add(ol);
      const c = faceCentre(b, key), n = FACE[key].n, s = Math.max(1.2, sph.r * 0.018); const dir = T3(n[0], n[1], n[2]).normalize(); const arrow = new THREE.ArrowHelper(dir, T3(c[0] + n[0] * 0.2, c[1] + n[1] * 0.2, c[2] + n[2] * 0.2), s * 2.6, acc.getHex(), s * 1.1, s * 0.7); arrow.traverse((o) => { if (o.material) { o.material.depthTest = false; o.renderOrder = 10; } }); fxG.add(arrow);
      if (key !== 'top') { const back = T3(n[0], n[1], n[2]).normalize().negate(); const a2 = new THREE.ArrowHelper(back, T3(c[0] - n[0] * 0.2, c[1] - n[1] * 0.2, c[2] - n[2] * 0.2), s * 1.2, acc.getHex(), s * 0.6, s * 0.45); a2.traverse((o) => { if (o.material) { o.material.depthTest = false; o.material.transparent = true; o.material.opacity = 0.5; o.renderOrder = 10; } }); fxG.add(a2); } };
    if (op && op.kind === 'push') { const b = pr.blocks.find((x) => x.id === op.id); if (b) showFace(b, op.face, true); }
    else if (hover && hover.face && (tool() === 'push' || (tool() === 'select' && app.selected() && hover.id === app.selected().id && !app.selected().locked))) { const b = pr.blocks.find((x) => x.id === hover.id); if (b) showFace(b, hover.face, false); }
    if (op) { const s0 = op.start, h0 = s0.use === 'core' ? s0.f2f : s0.floors * s0.f2f; const ghost = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(s0.w, h0, s0.d)), new THREE.LineDashedMaterial({ color: col('--muted'), dashSize: 0.8, gapSize: 0.5, depthTest: false, transparent: true, opacity: 0.8 })); ghost.position.set(s0.x + s0.w / 2, s0.z0 + h0 / 2, -(s0.y + s0.d / 2)); ghost.computeLineDistances(); ghost.renderOrder = 7; fxG.add(ghost);
      for (const gd of op.guides || []) { const dm = new THREE.LineDashedMaterial({ color: acc, dashSize: 1, gapSize: 0.7, depthTest: false }); let pts; const s = pr.site;
        if (gd.axis === 'x') pts = [T3(gd.v, -15, 0.1), T3(gd.v, s.d + 15, 0.1), T3(gd.v, gd.y || 0, 0.1), T3(gd.v, gd.y || 0, gd.top || 30)];
        else if (gd.axis === 'y') pts = [T3(-15, gd.v, 0.1), T3(s.w + 15, gd.v, 0.1), T3(gd.x || 0, gd.v, 0.1), T3(gd.x || 0, gd.v, gd.top || 30)];
        else pts = [T3(-10, -10, gd.v), T3(s.w + 10, -10, gd.v), T3(s.w + 10, -10, gd.v), T3(s.w + 10, s.d + 10, gd.v), T3(s.w + 10, s.d + 10, gd.v), T3(-10, s.d + 10, gd.v), T3(-10, s.d + 10, gd.v), T3(-10, -10, gd.v)];
        const l = segs(pts, dm); l.renderOrder = 9; fxG.add(l); } }
  }
  function placeAnnots() {
    const layer = dom.annot; if (!layer) return; const r = canvas.getBoundingClientRect(); const html = [];
    for (const a of annots) { const v = a.p.clone().project(camera); if (v.z > 1 || v.z < -1) continue; const x = (v.x + 1) / 2 * r.width + (a.dx || 0), y = (1 - v.y) / 2 * r.height + (a.dy || 0); if (x < -50 || y < -20 || x > r.width + 50 || y > r.height + 20) continue; html.push(`<span class="annot ${a.cls || ''}" style="left:${x.toFixed(0)}px;top:${y.toFixed(0)}px">${escH(a.text)}</span>`); }
    layer.innerHTML = html.join('');
  }
  const escH = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function placeReadout() { const el = dom.readout; if (!el) return; if (!op) { el.hidden = true; return; } el.hidden = false; const host = canvas.getBoundingClientRect(); const w = el.offsetWidth || 260, h = el.offsetHeight || 120, px = lastPtr.x - host.left, py = lastPtr.y - host.top, G = 24;
    /* try the four corners around the cursor and keep the one that covers the fewest labels and stays inside the view */
    const labels = dom.annot ? [...dom.annot.children].filter((a) => !a.hidden).map((a) => { const r = a.getBoundingClientRect(); return { x: r.left - host.left, y: r.top - host.top, w: r.width, h: r.height }; }) : [];
    const cands = [[px + G, py + G], [px - w - G, py + G], [px + G, py - h - G], [px - w - G, py - h - G]];
    let best = null, bestScore = Infinity;
    for (const [cx, cy] of cands) { const x = Math.min(Math.max(8, cx), host.width - w - 8), y = Math.min(Math.max(8, cy), host.height - h - 8); let sc = Math.abs(x - cx) + Math.abs(y - cy); for (const a of labels) { const ox = Math.max(0, Math.min(x + w, a.x + a.w) - Math.max(x, a.x)), oy = Math.max(0, Math.min(y + h, a.y + a.h) - Math.max(y, a.y)); sc += ox * oy; } if (px >= x - 4 && px <= x + w + 4 && py >= y - 4 && py <= y + h + 4) sc += 1e6; if (sc < bestScore) { bestScore = sc; best = [x, y]; } }
    el.style.left = best[0] + 'px'; el.style.top = best[1] + 'px'; }
  function renderReadout() {
    const el = dom.readout; if (!el || !op) return; const info = op.info || {}, E = op.entry, unit = info.unit || 'm';
    const offTxt = info.unit === 'storeys' ? `${info.offset >= 0 ? '+' : '−'}${Math.abs(info.offset)} storey${Math.abs(info.offset) === 1 ? '' : 's'}` : fmtM(info.offset || 0);
    const finTxt = info.unit === 'storeys' ? `${info.final} storeys` : `${(info.final || 0).toFixed(2)} m`;
    const warn = (op.warn || []).map((w) => `<div class="rw ${w.level}"><span>${w.level === 'fail' ? '✕' : '!'}</span>${escH(w.text)}</div>`).join('');
    el.innerHTML = `<div class="rt">${escH(info.title || '')}</div>
      ${op.kind === 'move' ? `<div class="rv"><span>Δx (east)</span><b>${fmtM(info.dx || 0)}</b></div><div class="rv"><span>Δy (north)</span><b>${fmtM(info.dy || 0)}</b></div>` : `<div class="rv"><span>Offset</span><b>${offTxt}</b></div><div class="rv"><span>${escH(info.dimName || 'Final')}</span><b>${finTxt}</b>${info.extra ? `<em>${escH(info.extra)}</em>` : ''}</div>`}
      ${info.guide ? `<div class="rg">Aligned with ${escH(info.guide)}</div>` : ''}${info.clamped ? '<div class="rg">Held at a limit (Constrain to limits is on)</div>' : ''}${warn}
      ${E.active ? `<div class="entry"><div class="seg2"><button data-mode="offset" class="${E.mode === 'offset' ? 'on' : ''}">Offset</button>${op.axis === 'x' || op.axis === 'y' ? '' : `<button data-mode="final" class="${E.mode === 'final' ? 'on' : ''}">Final ${escH((info.dimName || '').toLowerCase())}</button>`}</div><div class="entrybox"><span class="typed">${escH(E.text) || '<i>type a number</i>'}</span><span class="u">${unit === 'storeys' ? (E.mode === 'offset' ? 'storeys' : 'storeys') : 'm'}</span></div></div><div class="rh">Enter applies · Tab switches Offset/Final · Esc cancels</div>`
        : `<div class="rh">${op.kind === 'move' && op.axis === 'plane' ? 'Esc cancels · Alt ignores snapping' : 'Type a number for an exact value · Esc cancels · Alt ignores snapping'}</div>`}`;
    el.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); E.mode = b.dataset.mode; applyEntry(); }));
    placeReadout();
  }

  /* ---------- the operations ---------- */
  function startOf(b) { return { x: b.x, y: b.y, w: b.w, d: b.d, z0: b.z0, floors: b.floors, f2f: b.f2f, use: b.use }; }
  function axisParam(O, N) { const A = ray.ray.origin, D = ray.ray.direction; const w0 = O.clone().sub(A); const b = N.dot(D), c = D.dot(D), d = N.dot(w0), e = D.dot(w0); const den = c - b * b; if (Math.abs(den) < 1e-5) return null; return (b * e - c * d) / den; }
  function alignCands(axis, id) { const pr = app.project(), out = [], s = pr.site; out.push({ v: 0, label: axis === 'x' ? 'the west site line' : 'the street line' }, { v: axis === 'x' ? s.w : s.d, label: axis === 'x' ? 'the east site line' : 'the rear site line' }); for (const b of pr.blocks) { if (b.id === id || b.hidden) continue; if (axis === 'x') { out.push({ v: b.x, label: `${b.name} (west face)` }, { v: b.x + b.w, label: `${b.name} (east face)` }); } else { out.push({ v: b.y, label: `${b.name} (south face)` }, { v: b.y + b.d, label: `${b.name} (north face)` }); } } return out; }
  function topCands(id) { const pr = app.project(), out = []; for (const b of pr.blocks) { if (b.id === id || b.hidden) continue; out.push({ v: Model.blockTop(b), label: `the top of ${b.name}` }); } const env = app.envelope(); if (env.basic) out.push({ v: env.basic, label: 'the basic height limit' }); if (env.max) out.push({ v: env.max, label: 'the Board maximum height' }); return out; }
  const nearest = (cands, v, tol) => { let best = null, bd = tol; for (const c of cands) { const d = Math.abs(c.v - v); if (d < bd) { bd = d; best = c; } } return best; };
  /* push/pull: raw = signed offset of the face along its outward normal (m) */
  function computePush(raw, free) {
    const s0 = op.start, set = app.state.snap, L = app.limits(), key = op.face, inc = set.inc, tol = Math.max(0.4, sph.r * 0.004), info = { title: `Push/pull · ${FACE[key].label}` }; op.guides = [];
    if (key === 'top') {
      const h0 = s0.use === 'core' ? s0.f2f : s0.floors * s0.f2f, top0 = s0.z0 + h0, maxTop = L.constrain && L.maxTop != null ? L.maxTop : null;
      if (s0.use !== 'core' && set.storeys) { let floors = Math.max(1, Math.round((h0 + raw) / s0.f2f)); if (maxTop != null && s0.z0 + floors * s0.f2f > maxTop + 1e-6) { floors = Math.max(1, Math.floor((maxTop - s0.z0) / s0.f2f + 1e-6)); info.clamped = true; } const top = s0.z0 + floors * s0.f2f; if (!free && set.align) { const g = topCands(op.id).find((c) => Math.abs(c.v - top) < 0.05); if (g) { info.guide = g.label; op.guides.push({ axis: 'z', v: g.v }); } }
        Object.assign(info, { offset: floors - s0.floors, final: floors, unit: 'storeys', dimName: 'Storeys', extra: `${(floors * s0.f2f).toFixed(1)} m tall, top at ${top.toFixed(1)} m` }); op.info = info; return { floors }; }
      let h = h0 + raw; if (!free) h = Math.round(h / inc) * inc; let top = s0.z0 + h; if (!free && set.align) { const g = nearest(topCands(op.id), top, tol); if (g) { top = g.v; h = top - s0.z0; info.guide = g.label; op.guides.push({ axis: 'z', v: g.v }); } }
      const minH = s0.use === 'core' ? 2 : 2.4 * s0.floors; h = Math.max(minH, h); if (maxTop != null && s0.z0 + h > maxTop + 1e-6) { h = Math.max(minH, maxTop - s0.z0); info.clamped = true; }
      h = r2(h); Object.assign(info, { offset: r2(h - h0), final: h, unit: 'm', dimName: 'Height', extra: s0.use === 'core' ? `top at ${(s0.z0 + h).toFixed(1)} m` : `${s0.floors} storeys at ${(h / s0.floors).toFixed(2)} m floor to floor` }); op.info = info;
      return s0.use === 'core' ? { f2f: h } : { f2f: Math.round((h / s0.floors) * 1000) / 1000 };
    }
    const ax = key === 'x+' || key === 'x-' ? 'x' : 'y', plus = key === 'x+' || key === 'n+', dim0 = ax === 'x' ? s0.w : s0.d;
    const fixed = key === 'x+' ? s0.x : key === 'x-' ? s0.x + s0.w : key === 'n+' ? s0.y : s0.y + s0.d, face0 = key === 'x+' ? s0.x + s0.w : key === 'x-' ? s0.x : key === 'n+' ? s0.y + s0.d : s0.y;
    let off = free ? raw : Math.round(raw / inc) * inc, coord = face0 + (plus ? off : -off);
    if (!free && set.align) { const g = nearest(alignCands(ax, op.id), face0 + (plus ? raw : -raw), tol); if (g) { coord = g.v; info.guide = g.label; const h0 = s0.use === 'core' ? s0.f2f : s0.floors * s0.f2f; op.guides.push(ax === 'x' ? { axis: 'x', v: g.v, y: s0.y + s0.d / 2, top: s0.z0 + h0 } : { axis: 'y', v: g.v, x: s0.x + s0.w / 2, top: s0.z0 + h0 }); } }
    if (L.constrain) { const lim = ax === 'x' ? L.w : L.d; const c2 = Math.min(Math.max(coord, 0), lim); if (c2 !== coord) info.clamped = true; coord = c2; }
    const MIN = 1; coord = plus ? Math.max(coord, fixed + MIN) : Math.min(coord, fixed - MIN); coord = r2(coord);
    const dim = r2(Math.abs(coord - fixed)); Object.assign(info, { offset: r2(dim - dim0), final: dim, unit: 'm', dimName: FACE[key].dim, extra: `plate ${(ax === 'x' ? dim * s0.d : s0.w * dim).toFixed(0)} m²` }); op.info = info;
    return key === 'x+' ? { w: dim } : key === 'x-' ? { x: coord, w: dim } : key === 'n+' ? { d: dim } : { y: coord, d: dim };
  }
  function computeMove(dx, dy, free) {
    const s0 = op.start, set = app.state.snap, L = app.limits(), inc = set.inc, tol = Math.max(0.4, sph.r * 0.004), info = { title: op.axis === 'x' ? 'Move · east–west' : op.axis === 'y' ? 'Move · north–south' : 'Move · on the ground plane' }; op.guides = [];
    let x = s0.x + (op.axis === 'y' ? 0 : dx), y = s0.y + (op.axis === 'x' ? 0 : dy);
    if (!free) { if (op.axis !== 'y') x = s0.x + Math.round((x - s0.x) / inc) * inc; if (op.axis !== 'x') y = s0.y + Math.round((y - s0.y) / inc) * inc; }
    const h0 = s0.use === 'core' ? s0.f2f : s0.floors * s0.f2f, guides = [];
    if (!free && set.align) { if (op.axis !== 'y') { const c = alignCands('x', op.id); const g1 = nearest(c, s0.x + (op.axis === 'y' ? 0 : dx), tol), g2 = nearest(c, s0.x + s0.w + dx, tol); const g = g1 && (!g2 || Math.abs(g1.v - (s0.x + dx)) <= Math.abs(g2.v - (s0.x + s0.w + dx))) ? { g: g1, x: g1.v } : g2 ? { g: g2, x: g2.v - s0.w } : null; if (g) { x = g.x; guides.push(g.g.label); op.guides.push({ axis: 'x', v: g.g.v, y: y + s0.d / 2, top: s0.z0 + h0 }); } }
      if (op.axis !== 'x') { const c = alignCands('y', op.id); const g1 = nearest(c, s0.y + dy, tol), g2 = nearest(c, s0.y + s0.d + dy, tol); const g = g1 && (!g2 || Math.abs(g1.v - (s0.y + dy)) <= Math.abs(g2.v - (s0.y + s0.d + dy))) ? { g: g1, y: g1.v } : g2 ? { g: g2, y: g2.v - s0.d } : null; if (g) { y = g.y; guides.push(g.g.label); op.guides.push({ axis: 'y', v: g.g.v, x: x + s0.w / 2, top: s0.z0 + h0 }); } } }
    if (L.constrain) { const x2 = Math.min(Math.max(x, 0), Math.max(0, L.w - s0.w)), y2 = Math.min(Math.max(y, 0), Math.max(0, L.d - s0.d)); if (x2 !== x || y2 !== y) info.clamped = true; x = x2; y = y2; }
    x = r2(x); y = r2(y); Object.assign(info, { dx: r2(x - s0.x), dy: r2(y - s0.y), guide: guides.join(' and ') }); op.info = info; return { x, y };
  }
  function applyPatch(patch) { const b = app.project().blocks.find((x) => x.id === op.id); if (!b) return; const changed = Object.keys(patch).some((k) => b[k] !== patch[k]); op.warn = app.liveWarnings ? app.liveWarnings(Object.assign({}, b, patch)) : []; if (changed) app.edit(op.id, patch, false); else { buildBlocks(); frame(); } renderReadout(); }
  function beginPush(b, key) { op = { kind: 'push', id: b.id, face: key, start: startOf(b), entry: { active: false, text: '', mode: 'offset' }, moved: false, guides: [] }; const c = faceCentre(b, key), n = FACE[key].n; op.O = T3(c[0], c[1], c[2]); op.N = T3(n[0], n[1], n[2]).normalize(); op.t0 = axisParam(op.O, op.N); if (op.t0 == null) op.t0 = 0; op.info = null; computePush(0, true); op.warn = app.liveWarnings ? app.liveWarnings(b) : []; buildFx(); renderReadout(); }
  function beginMove(b, axis) { op = { kind: 'move', id: b.id, axis, start: startOf(b), entry: { active: false, text: '', mode: 'offset' }, moved: false, guides: [] }; const z = Math.max(b.z0, 0) + 0.15; if (axis === 'plane') { const p = planeHit(z); op.p0 = p || { x: b.x, y: b.y }; op.z = z; } else { op.O = T3(b.x + b.w / 2, b.y + b.d / 2, z); op.N = (axis === 'x' ? T3(1, 0, 0) : T3(0, 1, 0)).normalize(); op.t0 = axisParam(op.O, op.N) || 0; } computeMove(0, 0, true); op.warn = []; buildFx(); renderReadout(); }
  function dragOp(e) {
    const free = e.altKey; if (op.entry.active) return;
    if (op.kind === 'push') { const t = axisParam(op.O, op.N); if (t == null) return; const raw = t - op.t0; if (Math.abs(raw) > 0.02) op.moved = true; applyPatch(computePush(raw, free)); return; }
    if (op.axis === 'plane') { const p = planeHit(op.z); if (!p) return; const dx = p.x - op.p0.x, dy = p.y - op.p0.y; if (Math.hypot(dx, dy) > 0.02) op.moved = true; applyPatch(computeMove(dx, dy, free)); }
    else { const t = axisParam(op.O, op.N); if (t == null) return; const raw = t - op.t0; if (Math.abs(raw) > 0.02) op.moved = true; applyPatch(computeMove(op.axis === 'x' ? raw : 0, op.axis === 'y' ? raw : 0, free)); }
  }
  function applyEntry() {
    const E = op.entry, v = parseFloat(E.text); if (!isFinite(v)) { renderReadout(); return; } const s0 = op.start;
    if (op.kind === 'move') { applyPatch(computeMove(op.axis === 'x' ? v : 0, op.axis === 'y' ? v : 0, true)); return; }
    const key = op.face, h0 = s0.use === 'core' ? s0.f2f : s0.floors * s0.f2f; let raw;
    if (key === 'top') { if (s0.use !== 'core' && app.state.snap.storeys) raw = ((E.mode === 'final' ? v : s0.floors + v) - s0.floors) * s0.f2f; else raw = E.mode === 'final' ? v - h0 : v; }
    else { const dim0 = key === 'x+' || key === 'x-' ? s0.w : s0.d; raw = E.mode === 'final' ? v - dim0 : v; }
    applyPatch(computePush(raw, true));
  }
  function commitOp() { if (!op) return; const id = op.id; op = null; drag = null; app.edit(id, {}, true); buildFx(); renderReadout(); frame(); app.tip(null); }
  function cancelOp() { if (!op) return false; const id = op.id, s0 = op.start; op = null; drag = null; const b = app.project().blocks.find((x) => x.id === id); if (b) { const patch = { x: s0.x, y: s0.y, w: s0.w, d: s0.d, z0: s0.z0, floors: s0.floors, f2f: s0.f2f }; app.edit(id, patch, false); app.edit(id, {}, true); } buildBlocks(); renderReadout(); frame(); app.tip('Cancelled: the block is back where it started.'); return true; }
  function onKey(e) {
    if (!op) return; const E = op.entry, k = e.key;
    if (k === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); cancelOp(); return; }
    if (k === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); if (E.active && E.text) applyEntry(); commitOp(); return; }
    if (op.kind === 'move' && op.axis === 'plane') return;
    if (/^[0-9.]$/.test(k) || (k === '-' && !E.text)) { e.preventDefault(); e.stopImmediatePropagation(); E.active = true; E.text += k; applyEntry(); return; }
    if (k === 'Backspace' && E.active) { e.preventDefault(); e.stopImmediatePropagation(); E.text = E.text.slice(0, -1); if (E.text) applyEntry(); else renderReadout(); return; }
    if (k === 'Tab' && E.active && op.kind === 'push') { e.preventDefault(); e.stopImmediatePropagation(); E.mode = E.mode === 'offset' ? 'final' : 'offset'; applyEntry(); return; }
  }

  /* ---------- pointer ---------- */
  let ray, ndc;
  function ptr(e) { const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); lastPtr = { x: e.clientX, y: e.clientY }; }
  function planeHit(z) { const p = new THREE.Vector3(); return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -z), p) ? { x: p.x, y: -p.z, z: p.y } : null; }
  function blockHit() { const hits = ray.intersectObjects([...blockMeshes.values(), ...pickExtra]); if (!hits.length) return null; /* coplanar faces (a core flush with a roof): prefer the selected block, then a non-core block */ const near = hits.filter((x) => x.distance <= hits[0].distance + 0.05), sel = app.selected(), coreOf = (x) => { const b = app.project().blocks.find((q) => q.id === x.object.userData.id); return b && b.use === 'core'; }; const h = near.find((x) => sel && x.object.userData.id === sel.id) || near.find((x) => !coreOf(x)) || hits[0], id = h.object.userData.id; if (h.object.userData.ramp) return { id, ramp: true }; const n = h.face ? h.face.normal.clone() : null; if (n && h.object.userData.rot) n.applyAxisAngle(new THREE.Vector3(0, 1, 0), h.object.userData.rot); let face = null; if (n) { if (n.y > 0.5) face = 'top'; else if (n.y < -0.5) face = null; else if (n.x > 0.5) face = 'x+'; else if (n.x < -0.5) face = 'x-'; else if (n.z < -0.5) face = 'n+'; else if (n.z > 0.5) face = 's-'; } return { id, face }; }
  function onDown(e) {
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* scripted events */ } ptr(e);
    if (op) { if (op.entry.active || !drag) { commitOp(); } return; }
    if (e.button === 2 || e.button === 1) { drag = { mode: 'pan', x: e.clientX, y: e.clientY }; return; }
    const pr = app.project(), sel = app.selected();
    const hit = blockHit();
    if (hit) { const b = pr.blocks.find((x) => x.id === hit.id);
      if (e.shiftKey && sel && sel.id !== hit.id && app.selectPair) { app.selectPair(hit.id); drag = { mode: 'orbit', x: e.clientX, y: e.clientY, picked: true }; return; }
      if (!sel || sel.id !== hit.id) app.select(hit.id);
      if (b && tool() === 'push' && hit.face) { if (b.locked) { app.tip(`${b.name} is locked. Unlock it in its properties to change it.`); drag = { mode: 'orbit', x: e.clientX, y: e.clientY, picked: true }; return; } beginPush(b, hit.face); drag = { mode: 'op' }; return; }
      if (b && tool() === 'move') { if (b.locked) { app.tip(`${b.name} is locked. Unlock it in its properties to move it.`); drag = { mode: 'orbit', x: e.clientX, y: e.clientY, picked: true }; return; } beginMove(b, 'plane'); drag = { mode: 'op' }; return; }
      /* Select: a drag moves the block on its floor. On the already selected block, pulling a face along its own direction (the arrow shown on hover) pushes or pulls that face instead, and pulling the roof changes the height. A plain click only selects. */
      if (b && tool() === 'select') { if (b.locked) { drag = { mode: 'orbit', x: e.clientX, y: e.clientY, picked: true }; return; } const was = !!(sel && sel.id === hit.id); drag = { mode: 'pending', kind: 'move', was, b, face: hit.face, x: e.clientX, y: e.clientY, down: { clientX: e.clientX, clientY: e.clientY } }; return; }
      drag = { mode: 'orbit', x: e.clientX, y: e.clientY, moved: false, picked: true }; return; }
    drag = { mode: 'orbit', x: e.clientX, y: e.clientY, moved: false };
  }
  function onMove(e) {
    ptr(e);
    if (op && drag && drag.mode === 'op') { dragOp(e); return; }
    if (op) { placeReadout(); return; }
    if (drag && drag.mode === 'pending') { if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return; const d = drag; let kind = d.kind;
      if (d.was && d.face) { if (d.face === 'top') kind = 'push'; else { const c = faceCentre(d.b, d.face), n = FACE[d.face].n, p0 = screenOf(c[0], c[1], c[2]), p1 = screenOf(c[0] + n[0] * 5, c[1] + n[1] * 5, c[2] + n[2] * 5); const t = d.face === 'x+' || d.face === 'x-' ? [0, 1, 0] : [1, 0, 0], p2 = screenOf(c[0] + t[0] * 5, c[1] + t[1] * 5, c[2]); const nx = p1.x - p0.x, ny = p1.y - p0.y, nl = Math.hypot(nx, ny) || 1, tx = p2.x - p0.x, ty = p2.y - p0.y, tl = Math.hypot(tx, ty) || 1, mx = e.clientX - d.x, my = e.clientY - d.y, ml = Math.hypot(mx, my) || 1; const dn = Math.abs((nx * mx + ny * my) / (nl * ml)), dt = Math.abs((tx * mx + ty * my) / (tl * ml)); if (dn > dt * 1.15) kind = 'push'; } }
      ptr(d.down); if (kind === 'push') beginPush(d.b, d.face); else beginMove(d.b, 'plane'); drag = { mode: 'op' }; ptr(e); if (op) dragOp(e); return; }
    if (!drag) { // hover feedback
      let h = null;
      if (!h) { const bh = blockHit(); if (bh) h = { id: bh.id, face: bh.face }; }
      const key = h ? `${h.gizmo || ''}${h.id || ''}${h.face || ''}` : '', prev = hover ? `${hover.gizmo || ''}${hover.id || ''}${hover.face || ''}` : '';
      const rs = (f) => (f === 'top' ? 'ns-resize' : f === 'x+' || f === 'x-' ? 'ew-resize' : 'ns-resize'); const selNow = app.selected(); canvas.style.cursor = h ? (tool() === 'push' && h.face ? rs(h.face) : tool() === 'select' && h.face === 'top' && selNow && h.id === selNow.id ? 'ns-resize' : tool() === 'move' || tool() === 'select' ? 'move' : 'pointer') : 'grab';
      if (key !== prev) { hover = h; if (h && h.gizmo) buildBlocks(); else buildFx(); frame(); } return; }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; if (Math.abs(dx) + Math.abs(dy) > 1) drag.moved = true; const k = sph.r / 650;
    if (drag.mode === 'orbit') { sph.theta -= dx * 0.006; sph.phi = Math.min(1.5, Math.max(0.12, sph.phi - dy * 0.006)); } else if (drag.mode === 'pan') { const dir = new THREE.Vector3(); camera.getWorldDirection(dir); const fwd = new THREE.Vector3(dir.x, 0, dir.z).normalize(), right = new THREE.Vector3(-fwd.z, 0, fwd.x); target.x += -right.x * dx * k + fwd.x * dy * k; target.z += -right.z * dx * k + fwd.z * dy * k; }
    canvas.style.cursor = 'grabbing'; frame();
  }
  function onUp() {
    const d = drag; drag = null; canvas.style.cursor = 'default';
    if (d && d.mode === 'pending') { if (d.was && d.face && tool() === 'select') { ptr(d.down); beginPush(d.b, d.face); if (op) { op.entry.active = true; renderReadout(); } } return; }
    if (op) { if (!op.moved && op.kind === 'push') { op.entry.active = true; renderReadout(); app.tip(null); return; } if (op.entry.active) return; commitOp(); return; }
    if (d && d.mode === 'orbit' && !d.moved && !d.picked) app.select(null);
  }

  /* ---------- refresh ---------- */
  function refresh(full = true) { if (!ready) return; if (full) { buildStatic(); buildEnvelope(); buildShadows(); } buildBlocks(); frame(); }
  function invalidateStatic() { staticKey = null; }
  /* client-pixel position of a model point (used by the scripted interaction test) */
  function screenOf(x, y, z) { const v = T3(x, y, z).project(camera), r = canvas.getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; }
  function gizmoScreen(axis) { const m = gizmo.find((g) => g.userData.gizmo === axis); if (!m) return null; const v = m.position.clone().project(camera), r = canvas.getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; }
  return { opInfo: () => (op ? { id: op.id, face: op.face, kind: op.kind } : null), screenOf, gizmoScreen, init, refresh, resize, fitProject, resetView, fitSite: () => fitProject(false), fitDistrict, invalidateStatic, frame, cancelOp, commitOp, busy: () => !!op, available: () => ready };
})();
