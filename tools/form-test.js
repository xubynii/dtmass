/* node tools/form-test.js — runs each sculpted form through expand → levels → plans → rules on the demo project. */
const fs = require('fs'), path = require('path');
global.window = global; global.performance = require('perf_hooks').performance;
const src = path.join(__dirname, '..', 'src');
for (const f of ['codes.js', 'geom.js', 'model.js', 'plan-res.js', 'plan-comm.js', 'plan-park.js', 'plans.js', 'rules.js', 'form.js']) require(path.join(src, f));
const base = Model.demoProject();
const tower = base.blocks.find((b) => b.name === 'Tower');
const cases = [
  ['none', null],
  ['taper', Object.assign(Form.newForm('taper'), {})],
  ['twist', Form.newForm('twist')],
  ['tiered', Form.newForm('tiered')],
  ['stacked', Form.newForm('stacked')],
  ['prism+gardens', Object.assign(Form.newForm('prism'), { voids: [Object.assign({ type: 'gardens' }, Form.VOIDS.gardens.defaults)] })],
  ['prism+f2f', Object.assign(Form.newForm('prism'), { voids: [Object.assign({ type: 'f2f' }, Form.VOIDS.f2f.defaults)] })],
  ['prism+wells', Object.assign(Form.newForm('prism'), { voids: [Object.assign({ type: 'wells' }, Form.VOIDS.wells.defaults)] })],
  ['taper+spiral', Object.assign(Form.newForm('taper'), { step: Object.assign({ mode: 'spiral' }, Form.STEPS.spiral.defaults) })],
  ['prism+wave', Object.assign(Form.newForm('prism'), { step: Object.assign({ mode: 'wave' }, Form.STEPS.wave.defaults) })],
  ['prism+edits', Object.assign(Form.newForm('prism'), { edits: { 10: { sx: 1.2 }, 11: { sx: 1.2 }, 15: { dx: 3, rot: 0 } } })],
];
for (const [name, form] of cases) {
  const p = JSON.parse(JSON.stringify(base)); const t = p.blocks.find((b) => b.name === 'Tower'); if (form) t.form = form;
  const t0 = performance.now(); const mp = Form.expand(p); const L = Model.levels(mp); mp._parkNeed = Rules.parkingNeed(mp);
  const plans = {}; for (const l of L) plans[l.key] = Plans.forLevel(mp, l); const rows = Rules.evaluate(mp, plans, L, null); const dn = Rules.density(mp);
  const fls = Form.floors(t, p) || []; const area = fls.reduce((a, f) => a + f.area, 0);
  console.log(`${name.padEnd(15)} slices ${String(mp.blocks.length - p.blocks.length + 1).padStart(4)} levels ${L.length} FSR ${dn.fsr.toFixed(2)} towerArea ${Math.round(area || tower.w * tower.d * tower.floors)} fails ${rows.filter((r) => r.verdict === 'fail').length} approx ${mp.blocks.some((b) => b.approx)} ${(performance.now() - t0).toFixed(0)} ms`);
}
