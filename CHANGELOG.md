# Changelog — Downtown Massing Tool

A browser tool for studying tower and podium massing in downtown Vancouver with live code checks.
Built from scratch on 1 Oct 2026 with Codex as reviewer and co-implementer (parking module). No build step, no framework.

## Run locally
```
python tools/serve.py            # serves src/ on http://localhost:8765
```
Open http://localhost:8765/index.html. Hash shortcuts: `#plan`, `#section`, `#3d`, `#L6`, `#P1`, `#L6h` (heat map on).

## What it does
- **Massing**: drag-edit axis-aligned blocks per use (residential, office, retail, restaurant, amenity, parking, core). Each block has its own
  base elevation, floor count and floor-to-floor. Cores are blocks (two full cores plus small stair cores). Ramps are separate objects.
  Undo/redo with Ctrl+Z / Ctrl+Shift+Z (snapshots, committed on pointer-up or field change).
- **Views**: 3D axonometric (drag on the ground plane), Plan (move, resize handles, storey chips, heat map, DXF export), Section
  (slider moves the cut; drag a block vertically to restack; snaps to grade and other blocks).
- **Levels** are clusters of slab elevations across blocks (0.3 m tolerance): L1.. above grade, P1.. below. A core serves a level if it spans it.
- **Plans** regenerate on every edit (debounced 120 ms; the visible storey first). Identical storeys share one cached plan.
  Residential: ring corridor + spurs, two-core links, unit bands cut to the 40/54/80/100 m² mix with bath/laundry/bedrooms/ensuite.
  Office: 1.8 m ring, support rooms by the core, open floor. Retail: CRUs 4.6–12.2 m frontage with street exit and rear door + stock room.
  Restaurant: dining + kitchen/WC/store BOH. Amenity: multipurpose, fitness, change rooms. Parking: `plan-park.js` (Codex) with
  double-loaded rows, connecting aisles, walkways around cores, accessible stalls, bike rooms, loading bays, ramps.
- **Ledger**: zoning (ODP density/height tables, view cones, Higher Buildings, Granville, Schedule J, floor plate, solar), egress
  (travel distance by Dijkstra on a 0.25 m grid, exit separation with the two 3.4.2.3 branches, dead ends from the corridor graph,
  exit widths, second-door rule, high building, single exterior stair, storage garage, by-law dates), Parking By-law 6059
  (caps, accessible, ramp slope and width, headroom, bike, loading, EV), and layout advice. Rows: pass / fail / review / info,
  measured value, limit, clause, why, fix. Clicking a row with a plan opens that storey.

## Phase 3 (same evening): the old tool's UI and 3D view
- **Layout**: left rail with the design steps 1 Site · 2 Restrictions · 3 Massing · 4 Program · 5 Analysis; right rail Checks · Iterate · 6 Report.
  Panels fold to their rail (click the active step again, or `[` / `]`), widths drag at the grip (double-click resets), state persists in `dms.panes.v1`.
  Header carries the site tag and the fail / review / OK tally. Picking a block opens Analysis.
- **3D view** (`scene3d.js`, three.js r128 from cdnjs): perspective orbit camera (drag the ground to orbit, right-drag pans, wheel zooms),
  the downtown context around the site (parcel outlines, street and lane ribbons with names within 140 m, parks with names, every 2009 building
  within 900 m as one merged mesh, the DD boundary, FRONT label, north arrow), height-limit envelope (basic + Board maximum), 22 Sep shadows with
  new-shadow cells on parks and a sun arrow, blocks with floor lines, daylight strips, red halo on failing blocks, selection glow, handles
  (x±, north/south, roof arrow for storeys) with dimension sprites. Plan and Section stay 2D canvases because they carry the generated floor plans.
- **Aids bar** under the stage: Daylight façades, Height limit, Existing buildings, Shadow + hour slider, Floor lines, Dimensions, Fit site, Zoom out, legend.
- **Analysis page**: the selected block's editor, the daylight fan diagram (`daydiag.js`) and the checks that touch the block.

## Phase 30 (2 Oct 2026): street names in the plate style; pushing is the default on a selected face
- Street names follow the reference plate the user sent: bold italic condensed capitals (Barlow Condensed, letter-spaced) in the accent red, lying flat along the street. The site's own streets get a 6 m name just outside the property line, centred on the block face; every other street in the surroundings is named once per block segment (names of the same street at least 80 m apart, nothing on the site itself), so every street in view carries its name.
- Names are drawn twice: solid where nothing of the project stands in front, and as a faint ghost where one of the project's blocks hides them, so a name behind the tower is still legible without drawing over it. The depth clear before the label pass now forces the depth mask on (three.js ignores the clear after a depthWrite:false material), and below-grade blocks never hide a name.
- Dragging on the selected block: a face drag now pushes or pulls that face by default and the roof drag changes the height; the block moves only when the drag runs clearly along the face. Dragging an unselected block still moves it on its floor.

## Phase 29 (2 Oct 2026): no handles; flat street names
- The face dots are gone. On the selected block the hovered face highlights with its arrow; pulling that face along the arrow pushes or pulls it, sliding it sideways moves the block, pulling the roof changes the height. Any other block moves when dragged. The floor level still changes only in the side panel.
- Street names lie flat on the ground, reading along the street: the site's own streets get a large name centred on the block face, 9 m into the street; nearby streets get a smaller muted name, placed where the street is farthest from the site. The names turn with the camera so they never read upside down, and only the project's own blocks can hide them (the labels are drawn in a pass of their own against a depth buffer filled from the blocks alone), so a neighbouring tower never covers a street name while the scheme's tower still does. A nearby street already named on a site edge is not named twice.

## Phase 28 (2 Oct 2026): direct dragging, floors fixed, best typical layout per program
- No move arrows: dragging the body of any block moves it on its own floor (base elevation never changes by dragging, in 3D or in Section); the selected block shows small face handles (four sides and roof) that push or pull that face. Floor level changes only through the side panel: Base elevation, or the new "Starts at" selector (ground, or the top of a named block).
- Plan engine (`plans.js`): for corridor uses (residential, hotel, office) four corridor layouts are generated per level (adaptive ring with spurs, full ring with spurs, adaptive ring, full ring) and scored by leasable share with penalties for travel over the limit, unreachable rooms, dead ends over 6 m, deep or oversize units and corridor area; the best is kept and the plan notes which layout won and why. Retail, restaurant and parking keep their single typical layout.

## Phase 27 (2 Oct 2026): typology and form divided cleanly
- Massing typology is only how the program sits on the site: Slender Tower, Podium + Tower, Split Towers on a Shared Podium, Courtyard Podium + Tower (Stepped and Terraced presets removed, their sculpting lives in Shape the building).
- Shape the building is only sculpting: Tower form tiles (Plain box, Tapered shaft, Twisting tower, Set-back tiers, Shifted stack, Uploaded massing; the Extruded prism tile is gone), the chosen form's parameters, Terraces (the stepping rules), Voids, plan rotation, folded Storey edits and Precedent rules, Shuffle / Reset. The Envelope sliders are removed because sizes belong to the typology and the block panel. Terraces and voids now work on a plain box too (a prism form is created behind the scenes), and choosing Plain box keeps them.

## Phase 26 (2 Oct 2026): setbacks as hard limits; storey ranges in the block list
- `Rules.setbackBox(site, top)` gives the footprint a block may occupy at its height; `clampSetbacks` in app.js applies it to every edit path (drag, push/pull, typed fields), so blocks cannot be moved or stretched past a setback line, and a block that grows past 21.3 m is pulled inside the upper setbacks. The generator places towers inside the above-street-wall box too. In Plan the setback lines show only on the ground floor (L1); in 3D they stay as the governing planes.
- Blocks on the site rows read "L10–L17 · 8F" (or "P1–P3 · 3F") instead of a storey count.

## Phase 25 (2 Oct 2026): Shape the building returns to the left panel
- Left: Development target, Program mix, Massing typology, Shape the building. Right: block properties, Blocks on the site, Parking ramps.

## Phase 24 (2 Oct 2026): Design split across both panels
- Left panel (inputs): Development target, Program mix, Massing typology. Right panel (`#rDesign`, always shown in Design): the selected block's properties on top, then Shape the building, Blocks on the site and Parking ramps as folded sections. The Program stack diagram section is removed (stack.js stays loaded for its helpers: storey labels, mix plan).

## Phase 23 (2 Oct 2026): regeneration never pauses
- The hand-edit pause and its Regenerate / Generate now buttons are gone: any change to the target, mix, typology or a parameter regenerates the massing at once, even after blocks were edited by hand (the note says so; Undo restores the edits). Forms, locks and visibility still carry over by block name.

## Phase 22 (2 Oct 2026): every Design control is live
- Target, floorplate, height, parking levels, floor-to-floor, mix sliders and number fields, typology tiles and parameters all regenerate the massing while they change (`setBrief(fn, live)` → `Gen.regen`), committing one undo step on release. The model is live from the start: the first change replaces the current massing with one generated from the brief (Undo restores it). Only hand-edited blocks pause the link (`markEdited` now also marks a never-generated model). Right-panel number fields (size, storeys, floor-to-floor, position) update the model while typing, clamped to their minimum.

## Phase 21 (2 Oct 2026): one Design tab, live regeneration
- Generate and Edit are one **Design** tab (tabs: Site · Design · Check · Compare · Report) whose sections all start folded, each with an icon: Development target, Program mix, Massing typology, Program stack, Shape the building, Blocks on the site, Parking ramps. Open/closed state is remembered per section (`state.secOpen`).
- No confirm button: once a massing has been generated (one "Generate from this brief" press, or a typology tile), the model is linked and every change to the target, the mix, the typology or a parameter regenerates it live (sliders update while dragging, one undo step on release; `Gen.regen`, `App.applyGenerated(r, live)` on top of `applyMassing`). Hand edits pause the link with a note and a "Regenerate from parameters" button so edits are never overwritten silently.

## Phase 20 (2 Oct 2026): target and mix move to Generate; other starts removed
- The Development target and Program mix sections now open the Generate tab, above the typology presets; the first tab is Site again. The "Other ways to start" section (existing building, typology with programming, randomized program, Rhino upload) and the massing.js module are no longer loaded; a Rhino massing can still be uploaded under Shape the building. `#ops` is 26 steps.

## Phase 19 (2 Oct 2026): Add a block removed
- The parametric "Add a block" section is gone from the Edit tab at the user's request; blocks come from Generate, the other starts, splitting, duplicating or stacking a copy of an existing block.

## Phase 18 (2 Oct 2026): parametric tower massing exploration — Brief → Generate → Edit → Check → Compare → Report
- **Brief tab** (`brief.js`, `project.brief`): site location; development target (target GFA, preferred tower floorplate, design height target shown against the regulatory limit with its provenance, parking levels below grade, floor-to-floor per use, assumptions); program mix for residential, hotel, office, retail, restaurant and amenity with linked sliders and number inputs, the total shown prominently, Normalize to 100%, target area beside each share. Shares are of gross floor area above grade including circulation and cores inside the blocks; parking is an explicit level count outside the budget. `hotel` is a new use (Group C, planned like residential, pale apricot).
- **Generate tab** (`gen.js`): six illustrated presets with axonometric previews — Slender Tower, Podium + Tower, Stepped Tower, Terraced Tower, Split Towers on a Shared Podium, Courtyard Podium + Tower — each revealing its parameters (podium storeys, tiers and plate ratio, terrace interval and step, tower gap and share, bar depth and corner, position and proportion). Generate Massing lays out whole-storey program blocks inside the guideline setbacks with retail at grade, podium uses next and tower uses on top, cores per tower and parking below grade; shows requested vs generated area and share per use with the reasons for differences (whole storeys, podium caps, terrace losses, site clipping); names conflicts (height over the target or limit, FSR over the area, plate over the bulletin) with specific adjustments and never changes the targets. Variations draws three alternatives from the same brief; Save as an option stores the result as a version. The former start cards (existing building, typology with programming, randomized program, Rhino file) sit under "Other ways to start".
- **Edit tab** (`stack.js` + app.js): a vertical program-stack diagram at true elevation (E–W or N–S) synchronized with the 3D selection; drag a segment above or below a neighbour to reorder (elevations recalculated from each block's floor-to-floor; `settle()`), split at a chosen storey, merge compatible neighbours, open level below (`gapBelow`), start at a storey numerically, move a block to another tower. Free edit / Maintain program mix modes: in mix mode a preview lists storey changes on unlocked blocks that return the shares to the brief, applied only on request. The right panel shows storeys, elevations, floorplate, total area and share of program for the selected block. Shape the building, Add a block and Blocks on the site remain, folded.
- **Live feedback**: metrics bar adds Floor area · target (with a per-use target vs actual popover) and Footprint · site coverage. **Compare** shows matched axonometrics and stack diagrams, program shares A/B/brief and a sentence on how typology or arrangement moved height, plate and density; versions carry the brief and generation parameters. **Report** synopsis states the brief against the proposal; the data sheet gains a Program brief row.
- `#ops` grows to 31 steps including the end-to-end run: define a mix, generate Podium + Tower, split the residential block, move the upper segment below the hotel, narrow its footprint, save and compare both options, preview a mix correction.

## Phase 17 (2 Oct 2026): clause references are links
- `src/links.js` (`Cite.html(text, ctx)`) turns every recognised reference into a link that opens the source in a new tab: VBBL Part 3 and Part 10 articles and tables → the online Vancouver Building By-law at BC Publications, section by section (2019 edition; the 2025 by-law is PDF only); Parking By-law sections 3–6 → bylaws.vancouver.ca section PDFs; ODP §/Map/Table → DD.pdf; Downtown South Guidelines (D007), floor-plate bulletin, Public Views Guidelines, Solar Access memo, Granville Street Plan, Higher Buildings Policy (H005), Green Buildings Policy for Rezonings, Zoning By-law (Schedule J), and the policies library for the Downtown Design Guidelines. Applied in the check detail panel, the Site tab restriction sources, the fire-separation box, the report data sheet, Appendix A1 and A5.

## Phase 16 (2 Oct 2026): project data sheet as the report's first page
- Sheet 00 "Project data sheet" (`dataSheet()` in report.js): civic address and streets, applicable code and Part (VBBL 2025 Part 3 plus the governing construction article), energy compliance requirements (`CODES.energy`: VBBL Part 10 TEUI/TEDI/GHGI and the Green Buildings Policy for Rezonings, marked needs verification), occupancy classification by group with the major occupancy, streets facing the building, gross site area, GFA above and below grade, floor area used for parking (non-residential GFA and homes), footprint, site coverage, FSR proposed/permitted/counted, vehicle parking required and provided with accessible stalls, EV charging, Class A/B bicycle parking, loading, zoning (zone, ODP density and height areas, view cones, Map 2 retail), required setbacks by front / exterior side / interior side / rear from the chosen guideline set, storeys above and below, roof height in metres and feet against the limit. Each row names its source or provenance.

## Phase 15 (2 Oct 2026): Form tab as Start → Edit; whole-building forms; guideline setbacks; fire separation between two blocks
- **1 · Start** heads the Form tab: Existing building (12 built towers with their stated program), Typology with programming (the seven types, each listing the program it draws before Confirm), **Randomized typical tower** (parking below grade, street retail, podium, tower, core drawn at random, built by the typology engine and run through every check in the tool via `App.evaluateProject`; up to ten draws, the first with no failing check is kept and the result is reported), Upload a Rhino file, Start from scratch.
- **2 · Shape the building**: a new "Whole building" chip (default when several blocks exist) applies one form from the ground to the roof across every above-grade block (`form.span`), so a taper, twist or stepped terraces run through podium and tower instead of one block only. Block chips still shape a single block with its envelope sliders.
- **Guideline setbacks**: `CODES.odp.guidelineSetbacks` holds the Downtown South residential-street set (3.7 m front, 12.2 m from interior lines above 21.3 m, 3.0 m rear rising to 9.1 m above 10.7 m) and a retail-street build-to set; chosen under Restrictions on the Site tab (default Downtown South for DD parcels). Dashed coral lines with labels show in 3D and Plan (Layers toggle), the Check tab gets a "Guideline setbacks" row, and blocks inside a line are flagged for review while being edited. Sources: Downtown South Guidelines as quoted in Council and Development Permit Board reports; Downtown Design Guidelines §1/6.2.4.
- **Fire separation between two blocks**: shift-click a second block in 3D, or pick it under "Fire separation to another block" in the right panel, to read the Table 3.1.3.1 rating (C–D 1 h, C–E 2 h, C–F-3 1 h, E–F-3 2 h, D–E and D–F-3 none; A-2 1/1/2/1), whether the pair is stacked, side by side or apart, and the clause. `Rules.fireSeparation` and `Rules.setbackIssues` are shared with the checks (the earlier E–F-3 value of none was corrected to 2 h).

## Phase 14 (2 Oct 2026): always open on Site; Massing folded into Form; parametric block builder
- The tool opens on the Site tab every time, with only Site location expanded (Site information, Restrictions and Assumptions folded).
- The Massing tab is gone. Its four starts (from scratch, general typology, case study, Rhino file) live at the bottom of the Form tab under "Start over from a typology, case study or Rhino file".
- Form tab order: Shape a block → Add a block → Blocks on the site → Parking ramps → Start over. "Add a block" is parametric: program, where it sits (ground, below grade, or on top of a named block), storeys, floor-to-floor, width, depth, position along the frontage and from street to lane, with a live preview line, then Add block. The new block is selected so it can be shaped at once.

## Phase 13 (2 Oct 2026): the Program tab becomes Form
- **Form tab** (was Program; internal id stays `design`, hashes `#form`, `#program`). Laid out like the Supertall Massing Lab's Form tab: chips to pick the block being shaped (default: the tallest tower), typology tiles with the Lab's silhouettes (Plain box, Extruded prism, Tapered shaft, Twisting tower, Set-back tiers, Shifted stack, Uploaded massing), Envelope sliders (storeys, floor-to-floor, base width and depth; width and depth keep the block centred), the typology's own parameters and plan rotation, Stepped massing (rule + parameters), Voids, then Storey edits and Precedent rules folded away, and Shuffle form / Reset to a plain box. Every slider edits the model live with one undo step per change.
- The add-a-program cards and the Layers list (Occupancy / Stack, drag to restack) moved under a collapsed "Blocks on the site" section at the bottom of the Form tab; Parking ramps stay below it. The right panel shows the block's form in one line with "Shape in the Form tab" instead of the full form editor.
- `#ops` still passes its 19 steps.

## Phase 12 (2 Oct 2026): parametric massing, linked cores, screen compass, no tool bar
- **No tool bar.** Select does everything: drag a block to move it, drag a face of the selected block to resize it, click a face to type a size, and drag an arrow to slide it. The internal push and move tools remain for scripted tests only. A short status line replaces the hint box. Step size, storey snap, face alignment and limit constraints moved to the new Snap button next to Layers.
- **Compass.** A north arrow fixed in the bottom-left of the viewport turns with the 3D camera and follows site north in Plan. It is hidden in Section. The arrows drawn into the 3D model and the plan were removed.
- **Linked cores.** Each core belongs to the tallest block that contains its centre. Moving that block carries the core along. Resizing it leaves the core in place, nudged back inside if the block shrinks past it. Raising or lowering the roof extends a core that reached the old roof. The floor plans therefore always find their exit stairs inside the massing.
- **Parametric massing.** Confirming a typology stores its parameters in the project (`project.param`). From then on, every slider or number regenerates the model live, with one undo step per change. Blocks keep their id, tower form, lock and visibility by name, and a note warns when blocks were edited by hand. New shared parameters cover parking levels below grade, retail storey height and depth, podium program, tower position along the frontage and in depth, and plate proportion. Their defaults reproduce the earlier fixed values.
- `#ops` now has 19 steps, including core-follows-tower and a live parametric slider.

## Phase 11 (2 Oct 2026): Massing and Program tabs in the old Tower Check layout
- The tabs are now Site · Massing · Program · Check · Compare · Report. Program replaces Design and keeps its internal id `design`. The hashes `#massing`, `#program` and `#stack` open those tabs.
- **Massing** (`massing.js`) has four start cards: Start from scratch, General typology (7 types, with the old tool's names and descriptions), Case study (12 towers, with stated and assumed facts and sources) and Upload a Rhino file. In the upload, each layer becomes a block. Programs are guessed from layer names and can be changed per layer. Boxy layers become plain blocks, and other shapes keep their form as sliced uploads. Typology parameters sit in a two-column grid with "Fit to the height limit". A fixed Confirm bar explains what will be replaced and swaps the blocks in one undo step.
- **Program** has "Add a program" cards with their occupancy groups. Parking comes in an above-grade and a below-grade version. The Layers list has an Occupancy view (grouped by VBBL group, with floor area) and a Stack view (top of the list is the top of the stack). Dragging a row in the Stack view re-settles every above-grade block on the highest block it overlaps; cores and below-grade blocks keep their elevation. Each row shows storeys, a red dot when the block fails a check, and hide, lock and edit buttons. "Clear all" removes everything in one undo step.
- `#ops` now has 16 steps, including a Stack drag and confirming a typology.

## Phase 10 (2 Oct 2026): edit without switching tools; context in Plan and Section
- **Select edits directly in 3D.** Drag any block to move it on the ground. On the selected block, drag a face to push or pull it (opposite face fixed, storey snap, typed values with a click in the Push/Pull tool), or drag its arrows to slide it on one axis. A plain click only selects; a drag under 5 px counts as a click. Push/Pull and Move remain as single-purpose tools.
- **Select in Plan and Section.** In Plan, drag a block to move it or a handle of the selected block to resize it. In Section, drag a block to restack it. Sculpted towers move as their envelope.
- **Plan context.** Street surfaces, lanes, lot lines, parks and neighbouring buildings with their heights. The default frame adds 25 m around the site.
- **Section context.** Buildings the cut passes through are drawn as grey-blue cut profiles with heights. Buildings beyond the cut, within 90 m in the viewing direction, are drawn as pale elevations. Streets crossed by the cut show on the ground line. Blocks are drawn opaque, with cores on top.
- **Scripted test.** `#ops` now has 14 steps, including push/pull and move in the Select tool.

## Phase 9 (2 Oct 2026): tower forms from the Supertall Massing Lab
- `src/form.js` ports the massing engine of the Supertall Massing Lab (`Documents\SupertallMassingLab`). Only the massing came across. Its program engine, water, energy and impact studies were left out.
- **Tower form panel.** Design > block properties > Tower form. Any non-core, non-parking block can be a plain box, prism, tapered shaft, twisting tower, set-back tiers, shifted stack, or an uploaded .3dm/.obj/.json massing, which is sliced at the block's floor-to-floor height. The panel also has a plan rotation slider and the four terrace rules: spiral, undulating wave, staggered slabs and regular setbacks. It has the seven void rules too: face-to-face (the SolidVoidTower portal / Bezier spine / bulge definition), spiralling sky gardens, open-air oasis, pixel ribbon, crown opening, zone atria and spiralling lightwells. Storey edits apply scale, shift and rotate to a storey range. Precedent rules apply a preset with one click.
- **The block stays the envelope.** Width, depth, storeys and floor-to-floor set the base plate and height, so push/pull, move, snapping, typed values and undo work as before. Voids never cut through a core block.
- **Checks use the exact plates.** `Form.expand()` replaces each sculpted block with axis-aligned rectangle slices from the 1 m plate masks. Levels, plans, egress, FSR, parking and the report all run on those slices. Rotated plates are sliced as one equal-area plate per storey and the panel says so. Daylight results for slices of one block merge into one check, and tower separation ignores pairs that are slices of the same block.
- **3D and report.** Both draw the true per-storey plates, rotation included. Upload uses `rhino3dm.min.js` + `rhino3dm.wasm` (npm rhino3dm 8.17), loaded only when a .3dm is opened.
- **Test.** `node tools/form-test.js` runs every form through the full pipeline. The hashes `#form-twist`, `#form-voids`, `#form-taper-spiral` and `#form-twist-report` open the example tower with a form.

## Phase 8 (2 Oct 2026): pastel axonometric style
- Replaces the Phase 7 monochrome look. Near-white ground #FCFCF8, coral accent #CF4F58 (primary buttons use #C2434C for text contrast), soft coral #E78389 for drawing outlines, blush #FBE8E6 for selected backgrounds. Failed checks use a deeper crimson #A3202A with an icon and a word.
- Occupancy fills: residential #F3D1CC, office #D4E6ED, retail #E5DCF0, restaurant #F4DDC5, amenity #D5E8D9, parking #E1E6E9, core #E7E2DB, each with a darker matching outline (`--res-line` and so on). One sans (Inter) plus IBM Plex Mono for dimensions.
- 3D opens in an orthographic axonometric; Layers > Perspective view switches back. Context is white with grey-blue outlines and opaque by default. Blocks have pastel fills with matching outlines, selection has a coral outline, and the hovered push/pull face gets a faint coral tint. Lighting is ambient. Coplanar faces, such as a core flush with a roof, pick the selected block first.
- Layers > Scale figures adds illustrative people along the street edges. They take no part in any calculation.
- The site map, plan view and report use the same palette. The exploded program view has dashed coral alignment lines.

## Phase 7 (2 Oct 2026): technical-manual style and the illustrated report
- **Style.** Architectural red (#B6403A) for active tools, the selected tab, callouts and primary actions. Pastel occupancy colours (residential #EBC4AD, office #B8CCDF, retail #CDBFE0, restaurant #E5B9C5, amenity #B9D7C8, parking #CDD2D8, core #C8C2BA). Inter for controls, Source Serif 4 for report prose, IBM Plex Mono for dimensions and figure numbers. Near-square corners, fine rules, numbered panel sections, no shadows.
- **3D.** Flatter lighting, solid pastel fills, crisp charcoal edges, quieter floor lines, pale context. Selection is a red double outline. Push/Pull draws fine dimension lines with extension lines and ticks. Push/Pull and Move show a small line drawing of the gesture until hidden.
- **Report** (`report.js`, rewritten). The Report tab shows the document in place of the viewport. All figures are SVG drawn from the model: an annotated axonometric with numbered callouts, capacity bars against resolved limits, a program stack to height scale, an explanatory exploded view (labelled as such), a true-scale south elevation, and a plan detail linked to a key view by a leader. Sections: synopsis, key findings (observation, evidence, implication), capacity and program, critical constraints (massing, local, uncertain inputs), ranked design moves, iteration assessment (only with two different saved versions, matched views), and an appendix.
- **Tested moves.** Massing moves are re-run through the same rule engine on a copy of the project and labelled "Tested in the model". All other moves are "Untested suggestion" or "Information needed".
- **Outdated state.** The report stores the project signature it was built from. After any edit the bar reads "Outdated" and Update report turns red. Export HTML writes a file laid out for A4 landscape; print it from a browser for a PDF.
- **Test.** `tools/report-shot.ps1 -Out <folder> [-Hash report|report-compare|report-outdated]` builds the report headless, extracts the document, and writes a tall screenshot and a PDF with its page count.

## Phase 6 (2 Oct 2026): push/pull modelling and an architectural style
- **Style.** Warm paper ground (#F5F4F0), white panels, charcoal text, one muted blue accent (#526D82), Inter at 14 px. Red, amber and green are used only for check results, always with an icon or words.
- **Navigation.** Plain underlined tabs. Switching tabs keeps the camera, the selection and unsaved work. The top bar holds the project name, save status, Undo/Redo, Save version and Help.
- **Site.** A collapsible location card with a map preview that opens the parcel map. The map has an optional zoning legend and fills the selected parcel. Every site value carries a label: Confirmed (City data), Derived, Your assumption, or Needs verification with its source.
- **Viewport.** Tools sit top-left (Select, Push/Pull, Move, Rotate, Add block), views top-centre, and Fit, Reset and Layers top-right. They collapse to icons when the viewport is narrow. Layers has a context opacity slider. The legend lists only visible uses and active overlays.
- **Push/Pull** (`scene3d.js`). Hovering highlights a face and shows its direction. A side face moves with the opposite face fixed. The roof adds whole storeys by default, or changes floor-to-floor when "Roof in whole storeys" is off. Each drag shows a dashed start outline, alignment guides and a readout with the offset, the final dimension and live warnings. Typing a number sets an exact value: Tab switches Offset and Final, Enter confirms, Esc cancels. Options cover step size, storey snap, face alignment and "Constrain to limits". Constrain uses the site box and only height limits that are not awaiting verification. Alt turns snapping off. Each drag is one undo step.
- **Move.** Axis arrows and a plane square. Orbit and pan are off during any geometry drag, and context buildings never take clicks.
- **Live figures.** FSR (`Rules.density`, same formula as the ledger), floor area, height and selected-block height update during a drag. Plans and the full ledger run on release. The FSR and Height tiles open their calculation, limit and source.
- **Right panel per workspace.** Site shows a short card with "Edit in Design". Design shows size first, then position and rotation, Duplicate and Stack copy, More actions, the block's check counts with "View block checks", and Delete set apart. Check shows the issue detail or the block's checks and its daylight diagram.
- **Honest checks.** A pass that rests on an unconfirmed restriction is shown as "Needs verification", in the app, the report and saved versions. Regulatory values and calculations are unchanged.
- **Scripted test.** `#ops` drives real pointer and key events: roof pull, side pull with the opposite face fixed, typed final and offset values, axis move without resizing, Esc cancel, one undo step per drag, undo, inspect an issue and return with the camera kept, and save a version. Results appear as `data-opstest` and are printed by `tools/headless.ps1 -Hash ops`.

## Phase 5 (2 Oct 2026): workspace redesign
- One workflow in the top bar: **1 Site → 2 Design → 3 Check → 4 Compare → 5 Report**; one workspace at a time in the left panel
  (Site: parcel map, restrictions, site box · Design: add-block palette, program list, ramps, typologies · Check: Issues / Needs review /
  Passed summary that filters the list, daylight inspection · Compare: save versions, A/B with changed metrics and resolved / new issues ·
  Report). The top bar carries the project name (editable), address, save status, Undo / Redo, Save version and Help.
- Viewport: labelled toolbar **Select · Move · Resize · Rotate · Add block · Delete** with one hint for the active tool (V / M / R / O keys),
  **3D / Plan / Section**, **Fit project**, **Reset view**, and a **Layers** menu (surrounding city Hidden / Faint / Full, street and building
  names, height envelope, daylight, shadows with the time slider only when on, floor lines, dimensions, core labels). Legend uses the same
  program colours as the list. Plan storey chips, exit distance map and DXF export sit in a bar under the plan; section controls under the section.
- Right panel appears only for a selection: block properties with units (name, use, footprint, storeys, floor-to-floor, base elevation,
  position, actions, daylight fan diagram, checks on this block) or a check result (what, where, current value, requirement, next step,
  **Show in model**, rule reference). Screening-check disclaimer in Check.
- New modules: `checks.js` (summary, list, detail), `compare.js` (window.Iterate, versions + comparison; replaces iterate.js).
  `ledger.js` and `iterate.js` are no longer loaded. Calculations (model, plans, rules, parking, daylight, sun) are unchanged.
- Test hashes: `#select`, `#issue`, `#showissue`, `#layers`, `#help`, `#demo-compare` (saves two versions; writes to browser storage).

## Phase 4: OpenStreetMap surroundings
- `tools/fetch-osm.py` pulls buildings and building parts for the downtown peninsula from the Overpass API and writes `src/osm-data.js`
  (window.OSM, 1.35 MB, ODbL attribution in the page footer). Heights: `height` > `building:levels` × 3.2 (+ roof levels) > est_height; the rest
  are filled from the City's 2009 footprint under the centroid (else 10 m). Parts carry `min_height`, so podium-plus-tower buildings read in 3D.
- `Site.context()` merges OSM with the City data: OSM building outlines whose parts exist are replaced by the parts; City footprints with no
  OSM building over them are kept. Named buildings within 260 m get labels in the 3D view. Rerun the fetch with `python tools/fetch-osm.py --refresh`.

## Phase 2 (same day): features carried over from the old Downtown Tower Check
- **Site map** (`map.js`, `site.js`, `city-data.js` = City of Vancouver open data, 2.6 MB): search or click a parcel; the lot line, street/lane
  edges, zoning, ODP sub-area (height area is a guess to confirm), view cones, 2009 neighbours and parks load into the site frame (front street = south).
- **Aids** (3D/Plan): Neighbours, Height limit envelope (basic + Board maximum), Shadow with a 22 Sep sun-hour slider (new shadow on parks in red),
  Floor lines, Dimensions, Daylight (ODP §5 window fans as green/amber/red strips).
- **New ledger rows**: daylight to windows per residential block, shadow per listed park, view cones crossing the parcel, tower plate by frontage and
  neighbouring towers (floor-plate bulletin), tower separation to neighbours, Map 2 retail continuity, lightest construction article, fire separations
  between occupancies (Table 3.1.3.1). Change chips (was failing / was OK / new) against the previous evaluation.
- **Start** (`typo.js`, Codex): 7 typologies with sliders + Fit to height limit, 12 case studies with facts and sources, confirm bar.
- **Iterate** (`iterate.js`, Codex): save designs with thumbnails and metrics, load, A/B compare (fixed / newly failing / still failing).
- **Report** (`report.js`, Codex): self-contained HTML export with assessment, summary table, findings, views, plans, schedule, iterations, comparison.
- Block tools: duplicate, stack copy, split left/right, front/back, storeys; lock (L) and hide (H). `[` and `]` fold the side panels.
- Metrics strip (FSR, height, storeys, plate, homes, stalls) and a use bar above the ledger.

## Files
- `src/index.html` shell and styles · `src/app.js` state, history, panels, export · `src/views.js` canvas views and pointer editing
- `src/model.js` intent model + level table · `src/plans.js` pipeline (corridors, exits, Dijkstra, dead ends, cache)
- `src/plan-res.js` residential · `src/plan-comm.js` office/retail/restaurant/amenity · `src/plan-park.js` parking (Codex)
- `src/rules.js` ledger rules · `src/codes.js` curated by-law data (sources in ../stu/docs) · `src/geom.js` grid, rect ops, Dijkstra, walls
- `src/site.js` parcel frame + context · `src/map.js` site map · `src/sun.js` NOAA sun, shadows · `src/daylight.js` ODP §5 fans
- `src/typo.js` typologies and case studies (Codex) · `src/iterate.js` iterations (Codex) · `src/report.js` HTML report (Codex)
- `src/dxf.js` R12 writer · `src/zip.js` stored zip (the viewer only allows .zip, not .dxf) · `src/ledger.js` rows
- `docs/SPEC.md` brief · `docs/ARCHITECTURE-REVIEW.md` Codex review (adopted decisions) · `docs/CONTRACT.md` shared contracts

## Tests
```
node tools/plan-test.js [L3|P1] [--map]   # pipeline + ledger on the demo project (Node 24 at %LOCALAPPDATA%\Programs\nodejs)
node tools/park-test.js                   # parking generator cases (Codex)
node tools/typo-test.js                   # typologies + case studies (Codex)
node tools/site-test.js [address]         # demo massing on a real parcel with context rules
powershell -File tools/headless.ps1 [-Hash P1h] [-Shot out.png]   # headless Edge boot: console errors + data-selftest, or a screenshot
```

## Assumptions worth knowing
- Blocks are axis-aligned rectangles; plan geometry snaps to 0.25 m. Stairs are assumed 1.1 m clear.
- Parking headroom = floor-to-floor − 0.45 m structure/services. Travel in garages runs along aisles and walkways.
- ODP sub-area and height area are picked by hand (the City's map boundaries are not parcel-accurate).
- Policy items (view cones, Higher Buildings, Granville, Schedule J, solar) stay `review` until site-specific figures are entered.
