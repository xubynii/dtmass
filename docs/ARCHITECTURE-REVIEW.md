# Architecture review (Codex, 1 Oct 2026) — summary of decisions adopted

Full Codex text is in the session log; the points adopted for the build are:

- One HTML page + classic sibling scripts, Canvas 2D for Plan/Section and an axonometric Canvas massing view. No framework, no build.
- Intent model (blocks, ramps, site, code context) kept separate from derived PlanResults and view state.
- Blocks: id, use, rect footprint (x,y,w,d,rot), startStorey (1.. above grade, -1.. below, never 0), floors, f2f, elevations derived.
  Cores are blocks (max two) with stair/exit data. Floor areas are assembled where elevations coincide.
- Undo/redo = immutable snapshots of the intent model (~100), committed on pointer-up / numeric accept; camera and section slider excluded.
- Plans: 0.25 m raster, typed arrays, per-floor signature cache (identical tower floors computed once), debounced during drag,
  visible floor first. Residential: core ring (clipped) + spurs, two-core link, frontage bays with bounded DP against the unit mix.
  Office/retail/restaurant/amenity templates. Parking: double-loaded 17.7 m rows, ramp station/elevation profile with transitions,
  reserve ramps/cores/bike/loading before stalls, connectivity to the ramp required.
- Rules: {id, group, clause, measure, limit, verdict pass/fail/review, why}; review for unknown/unsourced; distinct 3.4.2.3 branches
  (corridor floor areas: min(½ diag, 9); others: max(½ diag, 9)); Group D sprinklered shown as 45 m with the 40 m interpretation flagged.
- DXF: R12 ASCII (LINE/POLYLINE/TEXT), layers per element; delivered as a .zip because the viewer's download allowlist has no .dxf.
- Ten risks: false legal certainty, ODP boundary ambiguity, split levels, topology errors, raster error, packing quality,
  ramp headroom, stale computation, memory growth, deployment/export mismatch.
