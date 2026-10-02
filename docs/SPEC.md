# Downtown Vancouver Massing Studio — specification (from the user, 1 Oct 2026)

Goal: a browser tool (single HTML page + JS modules, no build step, publishable as a claude.ai artifact)
to study tower/podium massing for downtown Vancouver while checking code compliance live.
Start from scratch (new code). Researched data (bylaw clauses, zoning districts, parking rules) may be reused from
C:\Users\sinnie\OneDrive\Desktop\stu\docs\*.json.

## Massing
- Drag-edit blocks per use: residential, office, retail, restaurant, amenity, parking, core.
- Each block has its own number of floors and floor-to-floor height.
- Cores are blocks; up to two cores.
- Undo/redo: Ctrl+Z, Ctrl+Shift+Z.
- Views: 3D, Plan, Section. Section cuts through a block with a slider to move the cut.
- Underground parking design: below-grade parking levels, ramps, stall/aisle layout, headroom.

## Rules checks (the ledger)
Zoning / Downtown ODP: height, FSR density, setbacks, view cones; Granville Street Plan; Higher Buildings Policy
(168–213 m); protected public views; Schedule J social-housing note.
Building code (VBBL / BCBC Part 3 egress):
- Travel distance 45 m sprinklered, 40 m Group D, 30 m otherwise.
- Distance between two exits (½ diagonal, min 9 m).
- Exit widths from occupant load (8 mm/person stairs, 6.1 mm/person doors).
- Dead ends ≤ 6 m.
- When a room/suite needs a second egress door.
- High-building rules (3.2.6).
- Single exterior exit stair rule (VBBL 3.2.10.1, enacted 20 Jan 2026).
- Bylaw in-force dates (15 Sep 2025 in force; in-stream to 8 Mar 2027).
Parking By-law 6059: stall counts, ramps, headroom, bike parking, loading.
Layout advice: unit mix, plates too deep, retail frontage, restaurant BOH share.
Each row: pass / fail / review, measured value, code clause, why it matters.

## Auto floor plans (Plan view, pick the storey; regenerate on every massing edit)
Walls + doors only, no furniture.
- Residential: ring corridor around each core with spurs into wings; two cores → rings linked.
  Unit mix studio 40, 1-bed 54, 2-bed 80, 3-bed 100 m², ~35% family units.
  Bedrooms ≥ 9.8 m², bathrooms 1.75 × 2.5 m, ensuites, laundry.
- Office: 1.8 m ring around core, open floor to glass, 4- and 10-person meeting rooms, focus rooms, pantry, storage.
- Retail: CRUs 4.6–12.2 m frontage, ≥ 10.7 m depth, street exit + rear door each.
- Restaurant: dining + kitchen + washrooms (BOH).
- Amenity: fitness, multipurpose, change rooms.
- Parking: stall + aisle layout (above and below grade).
Plan tools: exit travel-distance heat map; DXF export of floor plans.
