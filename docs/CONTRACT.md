# Shared contracts (1 Oct 2026)

All scripts are classic `<script>` files that attach one global (`window.Model`, `window.Geom`, `window.CODES`, `window.PlanPark`, ...).
No ES modules, no build, no runtime npm. Metres everywhere; grid cell 0.25 m.

## Geom (src/geom.js)
- `Geom.CELL = 0.25`, `Geom.C = {VOID:0, CORR:1, ROOM:2, CORE:3, SOLID:4, RAMP:5, AISLE:6, STALL:7, OPEN:8}`
- `new Geom.Grid(bbox)` with `bbox = {x,y,w,d}` metres. Fields `W,H,cells(Uint8Array),region(Int32Array)`, methods
  `idx(i,j)`, `inb(i,j)`, `toCell(x,y)`, `toM(i,j)`, `rectCells(rect)`, `fill(rect, code, region=-1, onlyIf=null)`, `count(rect, code)`, `allCode(rect, code)`.
- Rect helpers: `Geom.R(x,y,w,d)`, `inter`, `overlaps`, `inset`, `bboxOf`, `area`, `centre`, `snapRect`, `subtract(a,b)`, `subtractAll(rects, holes)`, `insideUnion(r, rects)`.
- `Geom.dijkstra(grid, sourceCellIndices, pass(k)->bool)` -> `Float32Array` of metres (Infinity unreached). 16 neighbours, no corner cutting.
- `Geom.wallsFor(rooms)` -> `[[x1,y1,x2,y2],...]` from rooms `{rect, doors:[{side:'N'|'S'|'E'|'W', at, w}]}` (`at` = metres along that side, absolute x for N/S, absolute y for E/W).

## Room record (used by every generator, drawn by views, exported to DXF)
```
{ id: string, kind: string, use: string, name: string, rect: {x,y,w,d}, parent: string|null,
  doors: [{side, at, w, exit?: true}], area: number, occ: number (design occupant load), bedrooms?: number, unitType?: 'S'|'1B'|'2B'|'3B' }
```
Top-level rooms (`parent === null`) are suites / CRUs / stalls rows etc.; sub-rooms carry the parent's id. Walls are drawn for every room.
Kinds in use: unit bedroom bath ensuite laundry living | meeting4 meeting10 focus pantry storage open | cru stock | dining kitchen wc | fitness multi change
| stall aisle ramp bike loading electrical mech.

## Parking module contract — `window.PlanPark.generate(ctx)` (src/plan-park.js, Codex)
Input `ctx`:
```
{ grid: Geom.Grid (already sized to the level bbox; cores already filled with C.CORE),
  plate: [{x,y,w,d}]          // parking footprint rects at this level (union may be L-shaped)
  cores: [{x,y,w,d}]          // obstacles, already C.CORE in the grid
  ramps: [{rect:{x,y,w,d}, dir:'N'|'E'|'S'|'W', zTop, zBottom, w, len}]  // straight ramps passing this level; dir = direction of descent (travel downward)
  level: { z, h, label, isTop: bool /* P1 */ }
  codes: CODES.parking
  need: { bikeA: n, bikeB: n, loadingA: n, loadingB: n, accessibleFraction: 0.05 /* fallback */ , stallsTarget: n|null }
  streetClass: 'arterial'|'local', spacesServed: n }
```
Output:
```
{ rooms: [Room...]   // kind 'stall' (one Room per stall, unitType 'std'|'small'|'acc'|'van'), 'aisle' (one per aisle rect), 'ramp', 'bike', 'loading', 'electrical'
  metrics: { stalls, standard, small, accessible, van, aisleArea, rampSlope, rampLenNeeded, rampLenActual, headroom: level.h - 0.45 (slab + services allowance), unreachableStalls, bikeArea, flags: [] }
}
```
The module must also fill the grid: `C.AISLE` for aisles, `C.STALL` for stalls, `C.RAMP` for ramp cells, `C.ROOM` for rooms. Dijkstra later treats AISLE and RAMP cells as traversable.
Rules used: stall 2.5×5.5 (2.7 beside a wall), small 2.3×4.6 ≤ 25%, accessible 4.0×5.5 with 2.3 m headroom, 90° aisle 6.7 m design (6.6 by-law), double-loaded module 17.7 m,
ramp ≤ 12.5% (10% in first 6.1 m from the property line), 4 m transitions at 7.5%, column ≥ 1.2 m from stall end (not modelled), general headroom 2.0 m.
Determinism: same input -> same output. Target < 30 ms for a 60×40 m plate.

## Level / plan pipeline (src/plans.js)
`Plans.forLevel(project, level)` -> PlanResult `{ key, z, grid, tiles:[{rect,use,blockId}], cores, corridors:[rect], rooms, exits:[{x,y,k}], travel: Float32Array, metrics, flags }`, cached by a signature of the inputs.

## Phase 2 (1 Oct 2026, evening): features ported from the old Downtown Tower Check

### Left panel tabs (index.html)
`#leftTabs` buttons switch `<section class="pane" data-pane="site|massing|start|iterate|report">`. Sections `#pane-start`, `#pane-iterate`, `#pane-report` are
mounted by Codex modules: `Typo.mount(sectionEl, App)`, `Iterate.mount(sectionEl, App)`, `Report.mount(sectionEl, App)`. Each `mount` renders its own DOM into the
section and may call `App` methods. `App.on('change', fn)` fires after every committed model change (fn receives nothing; read `App.project()`, `App.rows()`).

### App API (window.App, implemented in app.js)
```
App.project()                 -> current project (read-only use; do not mutate)
App.replaceProject(p, label)  -> validates, pushes history, recomputes, redraws, toasts `label`
App.state                     -> {view, levelKey, heat, selected, ...}
App.rows()                    -> ledger rows [{id, group, title, value, limit, verdict, clause, why, fix, levels, plan}]
App.levels() / App.plans()    -> level table / plans by level key
App.totals()                  -> Model.totals(project): {gfa:{use:m²}, gfaAbove, gfaBelow, maxZ, minZ, storeysAbove, storeysBelow, footprint}
App.metrics()                 -> {fsr, fsrMax, height, heightMax, storeys, plate, homes, stalls, fail, review, pass}
App.snapshot(view?, w?, h?)   -> PNG dataURL of the stage canvas (optionally rendering a given view first; restores the current view)
App.toast(msg)
App.setView(v) / App.showLevel(key)
App.on(event, fn)             -> 'change'
App.save(filename, data)      -> async; downloads capability when available (html/zip/png/json/csv/txt), else <a download>; returns true/false
```
### Project schema additions (model.js)
`site` gains optional `addr`, `poly` ([[x,y],...] local metres, inside the w×d box), `edges` ([{kind:'s'|'l'|'x', name, a:[x,y], b:[x,y]}]), `north` ([nx,ny] unit vector of true north in local coords),
`parcelIndex` (into CITY.parcels), `retailMap2` ('req'|'some'|'proh'|'perm'), `adjTowers` ('none'|'one'|'both'), `frontageLen` (m).
Blocks gain optional `locked` (bool) and `hidden` (bool). Both are respected by the views (hidden blocks are not drawn but still count).

### Typology module (src/typo.js, Codex) — `window.Typo`
`Typo.TYPES`: [{key, name, blurb, params:[{key,label,def,min,max,step}], build(site, params) -> {blocks:[Model.block(...)], ramps:[Model.ramp(...)]}}] for
point, twin, slab, court, office, wall, step (parameters as in the old tool: podium storeys, tower storeys, plate m², gap, depth, length, bar depth, upper use…).
Every build adds: 5 m retail at grade on the street side, below-grade parking P1–P2 (office: P1–P4) covering the site, one auto core sized 6–8 × 10–14 m centred in the
tower, a ramp (6.1 m wide, descending from grade) at the lane side, and a 0.5 m inset from the site box. `Typo.fitToHeight(key, params, site, maxH)` adjusts tower storeys.
`Typo.CASES`: 12 case studies [{id, name, year, height, storeys, address, type, architect, facts:[...], assumed:[...], sources:[{title,url}], build(site)}]
(Living Shangri-La, Paradox Hotel, Jameson House, MNP Tower, Harbour Centre, Bentall 5, Park Place, 8X on the Park, Vancouver House, One Wall Centre, Electra, The Butterfly)
using the parametric types scaled to the stated height/storeys. `Typo.mount(el, App)` renders the "ways to start" UI: Start from scratch · typology cards with sliders and
"Fit to height limit" · case-study cards (facts, Stated vs Assumed, source links) · a confirm bar ("Replaces N blocks on this site · Ctrl+Z brings them back") that calls
`App.replaceProject(...)` keeping the current `site`.

### Iterations (src/iterate.js, Codex) — `window.Iterate`
Save the current design under a name: blocks, ramps, site, metrics (App.metrics()), rows, and a 220 px thumbnail (App.snapshot('3d', 440, 300)). localStorage key
`dms.variants.v1`, keyed by `site.addr || 'custom'`; wrap storage access in try/catch and work without it. Cards: thumbnail, name, time, metric chips (FSR, height, storeys,
homes, fail/review/pass), Load / Compare / Rename / Delete; a dashed "Current design" card. Compare = A/B table: metric deltas coloured better/worse; rows grouped
"Fixed in B / Newly failing / Still failing / No longer applies". `Iterate.list()` returns the saved variants for the report.

### Report (src/report.js, Codex) — `window.Report`
`Report.mount(el, App)`: section checkboxes (persist in localStorage `dms.report.v1`): Assessment & summary table · Findings & recommendations · Check-by-check notes ·
Views (3D, plan, section PNG via App.snapshot) · Floor plans & exits (per distinct plan: plan PNG + travel/exits/dead-end figures) · Block schedule · Saved iterations ·
Comparison. `Report.build(opts) -> html string` (self-contained, inline CSS, both themes via prefers-color-scheme), `Report.save()` uses `App.save('massing-report-<slug>-<date>.html', html)`.
Assessment paragraph: lead sentence, verdict, key numbers, "First moves" (top three fixes from failing rows' `fix` text).
