/* codes.js — curated rule data for Downtown Vancouver massing checks.
   Numbers were transcribed from: VBBL 2025 Vol. 1 (Part 3), Parking By-law 6059 (2024–2026 consolidations
   + Parking Design Supplement), Downtown ODP (June 2026 consolidation), Granville Street Plan (June 2025),
   Higher Buildings Policy review page (2026). Source notes: ..\stu\docs\*.md. Pure data: no DOM, no logic. */
window.CODES = {
  meta: { compiled: '2026-10-01',
    vbbl: 'Vancouver Building By-law 2025 (No. 14275), in force 15 Sep 2025; in-stream permits under the 2019 by-law until 8 Mar 2027',
    bcbc: 'BC Building Code 2024 (Part 3 text matches VBBL except where marked Vancouver)' },

  /* ---------- Occupancy & egress (VBBL Part 3) ---------- */
  /* Table 3.1.3.1 (VBBL 2025 / BCBC 2024): fire-resistance ratings for fire separations between major occupancies, in hours.
     Values read 2 Oct 2026 from the 2024 BCBC table (C–D 1, C–E 2, C–F-3 1, D–E none, D–F-3 none, E–F-3 2; A-2 row 1, 1, 2, 1). */
  fireSep: { table: { 'A-2|C': 1, 'A-2|D': 1, 'A-2|E': 2, 'A-2|F-3': 1, 'C|D': 1, 'C|E': 2, 'C|F-3': 1, 'D|E': 0, 'D|F-3': 0, 'E|F-3': 2 },
    clause: 'VBBL 3.1.3.1 and Table 3.1.3.1', notes: { 'C|E': 'Table note: a Group E occupancy below dwelling units may need the separation of 3.1.3.1.(2).', same: 'Same major occupancy: no separation required by Table 3.1.3.1; suites in Group C still need 1 h (3.3.4.2), and floor assemblies take the construction article rating.', core: 'Exit stairs and shafts are their own fire separations (3.4.4.1, 3.6.3): the rating equals the floor rating, 45 min to 2 h.' } },
  occupancy: {
    residential: { group: 'C',   load: { perBedroom: 2 },     clause: 'Table 3.1.17.1 note (2); 3.1.17.1.(1)(b)' },
    hotel:       { group: 'C',   load: { perBedroom: 2 },     clause: 'Table 3.1.17.1 note (2): sleeping rooms, 2 persons each (hotel floors planned like residential)' },
    office:      { group: 'D',   load: { m2PerPerson: 9.3 },  clause: 'Table 3.1.17.1 offices' },
    retail:      { group: 'E',   load: { m2PerPerson: 3.7 },  clause: 'Table 3.1.17.1 mercantile, basement / ground: 3.70; other floors 5.60', upper: 5.6 },
    restaurant:  { group: 'A-2', load: { m2PerPerson: 1.2 },  clause: 'Table 3.1.17.1 dining / beverage: 1.20 (space with non-fixed seats and tables)' },
    amenity:     { group: 'A-2', load: { m2PerPerson: 4.6 },  clause: 'Table 3.1.17.1 exercise rooms 4.60 (Vancouver); assumption for lounges' },
    parking:     { group: 'F-3', load: { m2PerPerson: 46 },   clause: 'Table 3.1.17.1 storage garages 46.0' },
    core:        { group: null,  load: null },
  },
  travel: {
    sprinkleredAny: 45, groupD: 40, other: 30, openAirGarage: 60,
    clause: '3.4.2.5.(1)(b),(c),(e),(f)',
    measure: 'From any point in the floor area along the path of travel, or from the suite egress door where the suite is fire-separated (3.4.2.4.(2)).',
    why: 'Travel distance limits how long anyone is exposed before reaching a protected exit stair.' },
  exitSeparation: { fraction: 0.5, floorNoCorridor: 9, capWithCorridor: 9, clause: '3.4.2.3.(1)',
    why: 'Two exits close together can both be blocked by the same fire; half the diagonal keeps them apart.' },
  deadEnd: { max: 6, clause: '3.3.1.9.(5)', why: 'A dead-end corridor longer than 6 m can trap people walking away from the exits.' },
  widths: { corridorMin: 1.1, stairMin: 0.9, stairMinTall: 1.1, doorMin: 0.85, mmPerPersonStair: 8.0, mmPerPersonLevel: 6.1,
    clause: '3.3.1.9.(1); 3.4.3.2.(1); Table 3.4.3.2.-A; 3.4.3.2.(7)',
    note: 'Stair width need not be cumulative between storeys; each exit counts for not more than half the required width when two are required.',
    why: 'Exit width sets how fast the storey empties; it is sized to the occupant load it serves.' },
  secondDoor: { // 3.3.1.5 Table 3.3.1.5.-B (one egress door allowed when all three limits hold)
    C: { area: 150, occ: 60, travel: 25 }, D: { area: 300, occ: 60, travel: 25 }, E: { area: 200, occ: 60, travel: 25 },
    'A-2': { area: 200, occ: 60, travel: 25 }, 'F-3': { area: 300, occ: 60, travel: 25 },
    dwelling: { singleEgressTravel: 18, clause: '3.3.4.4.(7) (Vancouver): one means of egress from a dwelling unit in a sprinklered building when travel from the most remote point is 18 m or less' },
    clause: '3.3.1.5.(1), Table 3.3.1.5.-B; dwelling units 3.3.4.4',
    why: 'A room or suite with one door needs that door reachable from everywhere inside within a short distance.' },
  highBuilding: { groupCAbove: 18, otherAbove: 36, clause: '3.2.6.1.(1)',
    items: ['Smoke control / stair pressurization and vents (3.2.6.2)', 'Elevator emergency recall with smoke detectors (3.2.6.4, Vancouver (5)-(8))',
            'Firefighters elevator (3.2.6.5)', 'Voice communication system (3.2.6.7)', 'Central alarm and control facility (3.2.6.8)'],
    why: 'Above 18 m (residential) or 36 m (other), stairs cannot evacuate everyone quickly, so the building must defend in place.' },
  singleExteriorStair: { clause: 'VBBL 3.2.10.1 (enacted 20 Jan 2026)', enacted: '2026-01-20', maxStoreys: 6, maxUnitsPerFloor: 4, maxTravel: 18,
    text: 'One exit stair for small residential buildings: up to 6 storeys, sprinklered (NFPA 13), limited units per floor, travel 18 m or less, no high-building provisions. A tower never qualifies.',
    why: 'Shows whether a low block could use the new single-stair route; towers still need two exits.' },
  storageGarage: { exits: 2, singleExitMaxArea: 300, clearHeight: 2.0, vestibule: '3.3.5.4.(1)', clause: '3.4.2.1; 3.3.5.4; 3.3.7.7 (Vancouver, more than 19 spaces)',
    why: 'Each parking level is its own floor area and needs two exits; garage stairs reaching other occupancies need vestibules.' },
  dates: { inForce: '2025-09-15', inStreamUntil: '2027-03-08', singleStair: '2026-01-20',
    why: 'Applications filed before the in-force date may stay on the 2019 by-law until the in-stream date.' },

  /* ---------- Energy (reported on the data sheet; not modelled) ---------- */
  energy: { clause: 'VBBL 2025 Division B Part 10 (Energy and Water Efficiency); Green Buildings Policy for Rezonings',
    text: 'Part 3 buildings meet Vancouver\u2019s performance limits on total energy use intensity (TEUI), thermal energy demand intensity (TEDI) and greenhouse gas intensity (GHGI) set by building type in Part 10, with airtightness testing and embodied-carbon reporting; a rezoning also follows the Green Buildings Policy for Rezonings (low-emissions path or near-zero / Passive House path). This tool does not model energy: confirm the current limits for the occupancy mix before design development.',
    why: 'Energy limits shape the envelope, glazing ratio and mechanical plant, so they belong on the first page even though they are checked later.' },

  /* ---------- Downtown ODP (By-law 4912, June 2026 consolidation) ---------- */
  odp: {
    density: { // §3(1) FSR by sub-area; resCap = residential may replace commercial up to 3.00 (§3(3)-(4))
      A:{fsr:11.0, dwell:false}, B:{fsr:9.0, dwell:false}, C1:{fsr:7.0, dwell:false},
      C2:{fsr:5.0, dwell:true, resCap:3.0}, C3:{fsr:5.0, dwell:true, resCap:3.0, nonResMin:2.0}, C4:{fsr:5.0, dwell:true, resCap:3.0},
      E:{fsr:null, nonResMax:3.0, dwell:false}, F:{fsr:9.0, dwell:false}, G:{fsr:6.0, dwell:true, officeMax:5.0},
      H:{fsr:6.0, dwell:true, resCap:3.0, nonResMin:2.0}, J:{fsr:3.0, dwell:true, resCap:3.0},
      K1:{fsr:3.5, dwell:false, granville:true}, K2:{fsr:3.5, dwell:true, granville:true}, K3:{fsr:3.5, dwell:true, granville:true},
      L1:{fsr:3.0, dwell:true, officeMax:1.0, social:true}, L2:{fsr:3.0, dwell:true, social:true}, M:{fsr:3.0, dwell:true, social:true},
      N:{fsr:5.0, dwell:true, officeMax:1.0}, O:{fsr:7.0, dwell:true, officeMax:6.0},
      clause: 'ODP §3(1)', why: 'Floor space ratio is a regulation, not a guideline: nothing above it is approvable without rezoning.' },
    height: { // Table 1 (ODP §4): basic height and the increase the Development Permit Board may allow
      '1':{basic:22.9, rentalOrSocial:32.0, max:null}, '2':{basic:21.3, max:137.2}, '3':{basic:null, planes:true, max:27.4, granville:true},
      '4':{basic:45.7, max:137.2}, '5':{basic:91.4, max:137.2}, '6':{basic:91.4, max:null, smallSite:{corner:53.3, interior:61.0, h:21.3, hSocial:36.6}},
      '7':{basic:91.4, max:null}, '8':{basic:137.2, max:null},
      clause: 'ODP §4(1) Table 1; §4(3) Board criteria', why: 'Height is interpretive: the Board may go above the basic figure against site size, shadow, views and public realm.' },
    exclusions: { amenityPct: 0.20, parkingAboveGradeCount: 0.70, clause: 'ODP §3(5)-(7)', note: 'Amenity exclusion modelled as up to 20% of residential floor area; above-grade parking counted at 70% (assumption, document the real exclusion per site).' },
    setbacks: { clause: 'Downtown Design Guidelines §1, 6.2.4', text: 'The design guidelines replaced numeric yards with design review. Retail streets: build to the property line; shopfronts 9.1 m (30 ft) or narrower.',
      towerFloorplate: 605, towerFloorplateAbove40: 745, towerSeparation: 24.4, podiumStreetwall: 21.3, why: 'Downtown has no yard rule, but the guidelines set floor-plate (605 m², 745 m² above 40 storeys) and 24.4 m tower separation.' },
    /* Guideline setbacks drawn on the site to inform placement. Downtown has no zoning yards; these come from the Downtown South
       Guidelines (excluding Granville Street), read 2 Oct 2026 from Council and Development Permit Board reports that quote them.
       Figures are guideline recommendations the Board applies through design review, so encroachments are flagged for review, not failed. */
    guidelineSetbacks: {
      ds: { name: 'Downtown South residential street', source: 'Downtown South Guidelines (excl. Granville) · podium 3.7 m (12 ft) from the property line for a double row of street trees; 12.2 m (40 ft) from interior property lines above 21.3 m (70 ft); 9.1 m (30 ft) rear yard above 10.7 m (35 ft), reducible to 3.0 m (10 ft) for the low-rise portion; together they give 24.4 m (80 ft) between towers',
        rules: [{ edge: 'street', d: 3.7, above: 0, label: '3.7 m front setback' }, { edge: 'side', d: 12.2, above: 21.3, label: '12.2 m from interior lines above 21.3 m' }, { edge: 'lane', d: 3.0, above: 0, label: '3.0 m rear yard' }, { edge: 'lane', d: 9.1, above: 10.7, label: '9.1 m rear yard above 10.7 m' }] },
      retail: { name: 'Downtown retail street (build-to line)', source: 'Downtown Design Guidelines §1, 6.2.4 · retail streets build to the property line with shopfronts 9.1 m (30 ft) or narrower; tower setbacks above the street wall follow the Downtown South figures as a proxy',
        rules: [{ edge: 'street', d: 0, above: 0, label: 'build to the property line', buildTo: true }, { edge: 'street', d: 3.7, above: 21.3, label: '3.7 m tower setback above the 21.3 m street wall' }, { edge: 'side', d: 12.2, above: 21.3, label: '12.2 m from interior lines above 21.3 m' }, { edge: 'lane', d: 9.1, above: 10.7, label: '9.1 m rear yard above 10.7 m' }] },
      none: { name: 'No guideline setbacks', source: 'Design review only', rules: [] },
      clause: 'Downtown South Guidelines; Downtown Design Guidelines', why: 'Downtown setbacks are guidelines, not zoning yards: the Board weighs them in design review, so the lines here inform placement rather than fail it.' },
    viewCones: { count: 24, points: 16, clause: 'ODP §4.4 and Map 4; View Protection Guidelines amended 10 Jul 2024', note: 'The 2024 review removed 14 cones and amended 11. Cone geometry is not modelled; enter the cone height at the site if one applies.', why: 'View cones override Table 1 heights wherever they cross a site.' },
    solar: { adopted: '2025-09-17', window: 'Equinox 22 Sep, 10:00-16:00', text: 'No new shadow on listed parks and school grounds; plazas minimise shadow.' },
    granville: { approved: '2025-06-04', minH: 61, maxH: 122, text: 'Granville Street Plan: rezonings between the bridge and Cordova may reach 61-122 m (200-400 ft), tallest around Robson. Entertainment Core (Smithe-Davie) takes no new homes.', why: 'A rezoning route for K-area and height-area-3 sites, outside the ODP figures.' },
    higherBuildings: { band: [168, 213], text: 'Higher Buildings Policy (1997, reviewed 2011) has taken a limited number of Georgia, Burrard and Granville sites to 168-213 m (550-700 ft) for public benefit and design excellence. Under rewrite: drafts Fall 2026-Winter 2027, Council Spring 2027.', why: 'Heights above the ODP are a rezoning under this policy; its replacement may shift the band.' },
    scheduleJ: { since: '2026-06', text: 'ODP amendment June 2026: developments requiring social housing are subject to Schedule J (Affordable Housing) of the Zoning and Development By-law, replacing the ODP definition. L1, L2 and M areas carry the social-housing expectation.', why: 'Social housing share and tenure now follow Schedule J.' },
  },

  /* ---------- Parking By-law 6059 (Downtown and Broadway Plan Area) ---------- */
  parking: {
    vehicle: { residentialMin: 0, residentialMax: null, nonResMaxPer: 115, clause: '4.1.1, 4.2.5', note: 'No minimums downtown since Nov 2023; non-residential maximum 1 space per 115 m² GFA (visitor and accessible excluded).',
      why: 'Downtown parking is capped, not required; over-providing is a by-law failure.' },
    visitor: { rate: 0.05, min: 1, clause: '4.1.3', text: 'Visitor spaces about 1 per 20 dwelling units (transcribed consolidation; confirm the current table).' },
    accessible: { clause: '4.1.4', table: [[1,10,1],[11,25,2],[26,50,3],[51,100,4],[101,200,6],[201,500,8]], extraPer: 100, why: 'A share of spaces must be accessible, with 2.3 m headroom on the whole route.' },
    stall: { w: 2.5, l: 5.5, wWallOneSide: 2.7, wWallBothSides: 2.9, small: { w: 2.3, l: 4.6, maxShare: 0.25 }, accessible: { w: 4.0, l: 5.5 }, van: { w: 5.0, l: 5.5 }, parallel: { w: 2.5, l: 6.4, aisle: 3.6 },
      clause: '4.5.1, 4.5.2; Design Supplement 2.1-2.4, Figure 1', why: 'Stall and aisle sizes decide how many cars a plate really holds.' },
    aisle: { w90: 6.6, w90WideStalls: 6.1, w60: 4.8, w45: 3.9, clause: '4.5.6; Design Supplement 2.3, Table 2' },
    column: { minFromStallEnd: 1.2, clause: 'Design Supplement 2.4' },
    ramp: { maxSlope: 0.125, maxSlopeFirst6m: 0.10, transitionSlope: 0.075, transitionLen: 4.0, hardship: 0.15,
      width: { localUnder20: 3.6, local20plus: 6.1, arterialUnder10: 3.6, arterial10plus: 6.1, twoWayKeyLock: 6.7 },
      cornerCut: 2.7, clause: 'Design Supplement 1.2-1.4', why: 'Ramp length is set by slope: 3 m of level change at 12.5% needs 24 m plus two 4 m transitions.' },
    headroom: { general: 2.0, accessible: 2.3, loadingA: 2.3, loadingB: 3.8, loadingC: 4.3, bicycle: 1.9, clause: '4.5.1, 4.5.6, 5.5.1', why: 'Clear height under beams and services, not floor-to-floor, is what is checked.' },
    bicycle: {
      residential: { classA: [[0,65,1.5],[65,105,2.5],[105,1e9,3.0]], classB: { base: 2, per: 20 }, clause: '6.2.1.2' },
      office: { classAPer: 170, classB: { threshold: 2000, spaces: 6 }, clause: '6.2.4.1' },
      retail: { classAPer: 340, classBPer: 1000, clause: '6.2.5 (as transcribed)' },
      restaurant: { classAPer: 340, classBPer: 500, clause: '6.2.5 (as transcribed)' },
      lockers: 1.4, why: 'Class A bicycle rooms are required floor area and often drive the P1 layout.' },
    loading: {
      residential: { A: [[0,49,0],[50,299,1]], B: [[0,99,0],[100,299,1],[300,499,2]], extraPer: 200, clause: '5.2.1' },
      office: { A: [[0,999,0],[1000,15000,1],[15001,20000,2],[20001,28000,3]], B: [[0,499,0],[500,5000,1],[5001,10000,2],[10001,28000,3]], extraPerA: 7500, extraPerB: 15000, clause: '5.2.9' },
      retail: { B: [[0,279,0],[280,2000,1],[2001,5000,2],[5001,20000,3]], clause: '5.2.6 (as transcribed)' },
      bay: { A: { w: 3.0, l: 6.0 }, B: { w: 3.0, l: 8.5 }, C: { w: 4.0, l: 15.0 }, clause: '5.5.1' },
      why: 'Loading bays need lane access and 3.8 m headroom; they rarely fit under a tower core.' },
    ev: { residential: 1.0, clause: '4.11.1', text: 'Every residential space provided needs an energized outlet.' },
  },

  /* ---------- Layout standards (research, not by-law) ---------- */
  layout: {
    unitMix: { studio: { area: 40, share: 0.15 }, oneBed: { area: 54, share: 0.35 }, twoBed: { area: 80, share: 0.30 }, threeBed: { area: 100, share: 0.20 }, familyShare: 0.35,
      source: 'City of Vancouver High-Density Housing for Families with Children Guidelines (35% family units in rezonings); unit areas from 2024-26 downtown approvals.' },
    rooms: { bedroomMin: 9.8, bedroomMinDim: 2.8, bath: [1.75, 2.5], ensuite: [1.6, 2.4], laundry: [0.9, 1.4], corridorRes: 1.6, corridorOffice: 1.8 },
    plate: { resMaxDepth: 20, officeLeaseDepth: [6, 12], officeMaxDepth: 24, retail: { frontageMin: 4.6, frontageMax: 12.2, depthMin: 10.7 }, restaurantBOH: [0.30, 0.40], unitDepth: [9, 12] },
    office: { meeting4: [3.0, 3.6], meeting10: [4.5, 6.0], focus: [1.8, 2.4], pantry: [3.0, 4.0], storage: [2.0, 3.0], staffPerRoom4: 25, staffPerRoom10: 60, staffPerFocus: 20 },
    amenity: { fitness: 0.35, multipurpose: 0.40, change: 0.25 },
    why: 'Plates that are too deep leave dark rooms; frontage that is too narrow fails to lease.' },
};
