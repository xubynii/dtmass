/* Node harness: node tools/plan-test.js [levelName] [--map] — runs the plan pipeline on the demo project. */
const fs = require('fs'), path = require('path');
global.window = global; global.performance = require('perf_hooks').performance;
const src = path.join(__dirname, '..', 'src');
for (const f of ['codes.js', 'geom.js', 'model.js', 'plan-res.js', 'plan-comm.js', 'plan-park.js', 'plans.js', 'rules.js']) {
  const p = path.join(src, f); if (fs.existsSync(p)) { try { require(p); } catch (e) { console.error('load', f, e.message); } }
}
const args = process.argv.slice(2), wantMap = args.includes('--map'), pick = args.find((a) => !a.startsWith('--'));
const project = Model.demoProject();
if (window.Rules && Rules.parkingNeed) project._parkNeed = Rules.parkingNeed(project);
const levels = Model.levels(project);
console.log('levels:', levels.map((L) => `${L.name}@${L.z.toFixed(1)}[${L.uses.join('+')}${L.cores.length ? ' core×' + L.cores.length : ''}]`).join('  '));
const seen = new Set();
for (const L of levels) {
  const key = L.uses.join('+') + L.cores.length + (L.label < 0 ? 'B' : 'A');
  if (seen.has(key) && !pick) continue; seen.add(key);
  if (pick && L.name !== pick) continue;
  const t0 = performance.now(); const P = Plans.forLevel(project, L); const dt = performance.now() - t0;
  const m = P.metrics;
  console.log(`\n== ${L.name} (${L.uses.join('+')}) ${dt.toFixed(1)} ms  rooms ${P.rooms.length} corridors ${P.corridors.length} exits ${P.exits.length}`);
  console.log(`   travel max ${m.maxTravel?.toFixed(1)} m  sep ${m.exitSeparation?.toFixed(1)} m (½ diag ${(m.diagonal / 2).toFixed(1)})  deadEnd ${m.deadEnd?.toFixed(1)} m  occ ${m.occupants}  unreached rooms ${m.unreachedRooms} open ${m.unreachedOpenArea?.toFixed(0)} m²`);
  if (m.unitsTotal) console.log(`   units ${m.unitsTotal} S/1B/2B/3B ${m.units.S}/${m.units['1B']}/${m.units['2B']}/${m.units['3B']} family ${(m.familyShare * 100).toFixed(0)}% beds ${m.bedrooms}`);
  if (m.stalls) console.log(`   stalls ${m.stalls}`, JSON.stringify(m.parking));
  if (P.flags.length) console.log('   flags:', P.flags.join(' | '));
  const units = P.rooms.filter((r) => r.kind === 'unit');
  if (units.length) { const big = units.filter((u) => u.area > 140); console.log(`   unit areas ${Math.min(...units.map((u) => u.area)).toFixed(0)}–${Math.max(...units.map((u) => u.area)).toFixed(0)} m², >140: ${big.length}, travel ${Math.max(...units.map((u) => u.travel)).toFixed(1)}`); }
  if (wantMap || pick) {
    const g = P.grid, ch = ' .#C■R=o□'; let s = '';
    for (let j = g.H - 1; j >= 0; j -= 2) { let line = ''; for (let i = 0; i < g.W; i += 2) line += ch[g.cells[g.idx(i, j)]] || '?'; s += line + '\n'; }
    console.log(s);
  }
  if (window.Rules) { const rows = Rules.evaluate(project, { [L.key]: P }, levels); const bad = rows.filter((r) => r.verdict !== 'pass'); console.log(`   rules: ${rows.length} rows, ${rows.filter((r) => r.verdict === 'pass').length} pass, ${rows.filter((r) => r.verdict === 'fail').length} fail, ${rows.filter((r) => r.verdict === 'review').length} review`); for (const r of bad.slice(0, 40)) console.log(`     ${r.verdict.padEnd(6)} ${r.group.padEnd(8)} ${r.title}: ${r.value}`); }
}
