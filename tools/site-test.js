/* node tools/site-test.js — demo massing fitted on a real parcel (1189 Howe St) with context rules. */
const path = require('path'); global.window = global; global.performance = require('perf_hooks').performance;
for (const f of ['codes.js', 'geom.js', 'model.js', 'city-data.js', 'site.js', 'sun.js', 'daylight.js', 'plan-res.js', 'plan-comm.js', 'plan-park.js', 'plans.js', 'rules.js']) require(path.join(__dirname, '..', 'src', f));
const addr = process.argv[2] || '1189 HOWE';
const p = Model.demoProject(); const hit = Site.search(addr)[0]; if (!hit) { console.log('no parcel', addr); process.exit(1); }
const s = Site.siteFromParcel(hit.i); const frame = s.frame; delete s.frame; Object.assign(p.site, s); p.site.retailMap2 = 'req'; p.site.adjTowers = 'one';
for (const b of p.blocks) { b.w = Math.min(b.w, p.site.w - b.x); b.d = Math.min(b.d, p.site.d - b.y); if (b.y + b.d > p.site.d) b.y = Math.max(0, p.site.d - b.d); if (b.x + b.w > p.site.w) b.x = Math.max(0, p.site.w - b.w); }
p._parkNeed = Rules.parkingNeed(p); const levels = Model.levels(p); const plans = {}; for (const L of levels) plans[L.key] = Plans.forLevel(p, L);
const ctx = Site.context(Object.assign({}, p.site, { frame })); let t = Date.now(); const rows = Rules.evaluate(p, plans, levels, ctx); console.log(s.addr, 'rows', rows.length, Date.now() - t, 'ms', 'ctx foot', ctx.foot.length, 'parks', ctx.parks.map((x) => x.name).join(', '));
for (const r of rows) if (['plate', 'towersep', 'viewcone', 'retailmap2', 'construction', 'firesep'].includes(r.id) || /daylight|solar/.test(r.id)) console.log(r.verdict.padEnd(6), r.title.padEnd(36), '|', String(r.value).slice(0, 120), '|', String(r.limit).slice(0, 90));
console.log('fails:', rows.filter((r) => r.verdict === 'fail').map((r) => r.title).join(' · '));
