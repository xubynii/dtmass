/* geom.js — 0.25 m raster grid, rectangle helpers, 16-neighbour Dijkstra, wall extraction. Pure, no DOM.
   Cell codes (Uint8): 0 void, 1 corridor, 2 room interior, 3 core, 4 obstacle/wall-solid, 5 ramp, 6 aisle, 7 stall, 8 open plan */
window.Geom = (function () {
  const CELL = 0.25;
  const C = { VOID: 0, CORR: 1, ROOM: 2, CORE: 3, SOLID: 4, RAMP: 5, AISLE: 6, STALL: 7, OPEN: 8 };
  const q = (v) => Math.round(v / CELL);               // metres -> cell index
  const snapQ = (v) => Math.round(v / CELL) * CELL;    // metres -> metres on grid

  class Grid {
    constructor(bbox) { // bbox {x,y,w,d} metres; grid origin at bbox corner
      this.ox = snapQ(bbox.x); this.oy = snapQ(bbox.y);
      this.W = Math.max(1, q(bbox.w)); this.H = Math.max(1, q(bbox.d));
      this.cells = new Uint8Array(this.W * this.H);
      this.region = new Int32Array(this.W * this.H).fill(-1); // room / unit id per cell
    }
    idx(i, j) { return j * this.W + i; }
    inb(i, j) { return i >= 0 && j >= 0 && i < this.W && j < this.H; }
    toCell(x, y) { return [Math.floor((x - this.ox) / CELL + 1e-9), Math.floor((y - this.oy) / CELL + 1e-9)]; } // cell containing a point
    toM(i, j) { return [this.ox + (i + 0.5) * CELL, this.oy + (j + 0.5) * CELL]; }
    rectCells(r) { // metres rect -> cell index bounds [i0,j0,i1,j1) clipped
      const i0 = Math.max(0, q(r.x - this.ox)), j0 = Math.max(0, q(r.y - this.oy));
      const i1 = Math.min(this.W, q(r.x + r.w - this.ox)), j1 = Math.min(this.H, q(r.y + r.d - this.oy));
      return [i0, j0, i1, j1];
    }
    fill(r, code, region = -1, onlyIf = null) {
      const [i0, j0, i1, j1] = this.rectCells(r);
      for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) { const k = j * this.W + i; if (onlyIf == null || this.cells[k] === onlyIf) { this.cells[k] = code; if (region >= 0) this.region[k] = region; } }
    }
    count(r, code) { const [i0, j0, i1, j1] = this.rectCells(r); let n = 0; for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) if (this.cells[j * this.W + i] === code) n++; return n; }
    allCode(r, code) { const [i0, j0, i1, j1] = this.rectCells(r); if (i1 <= i0 || j1 <= j0) return false; for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) if (this.cells[j * this.W + i] !== code) return false; return true; }
  }

  /* ---------- rectangles ---------- */
  const R = (x, y, w, d) => ({ x, y, w, d });
  const inter = (a, b) => { const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y), X = Math.min(a.x + a.w, b.x + b.w), Y = Math.min(a.y + a.d, b.y + b.d); return X > x + 1e-9 && Y > y + 1e-9 ? R(x, y, X - x, Y - y) : null; };
  const overlaps = (a, b) => !!inter(a, b);
  const inset = (r, m) => R(r.x + m, r.y + m, r.w - 2 * m, r.d - 2 * m);
  const bboxOf = (rects) => { const x = Math.min(...rects.map((r) => r.x)), y = Math.min(...rects.map((r) => r.y)); return R(x, y, Math.max(...rects.map((r) => r.x + r.w)) - x, Math.max(...rects.map((r) => r.y + r.d)) - y); };
  const area = (r) => r.w * r.d;
  const centre = (r) => [r.x + r.w / 2, r.y + r.d / 2];
  const snapRect = (r) => R(snapQ(r.x), snapQ(r.y), snapQ(r.w), snapQ(r.d));
  /* subtract b from a -> up to 4 rects */
  function subtract(a, b) {
    const i = inter(a, b); if (!i) return [a];
    const out = [];
    if (i.y > a.y) out.push(R(a.x, a.y, a.w, i.y - a.y));
    if (i.y + i.d < a.y + a.d) out.push(R(a.x, i.y + i.d, a.w, a.y + a.d - i.y - i.d));
    if (i.x > a.x) out.push(R(a.x, i.y, i.x - a.x, i.d));
    if (i.x + i.w < a.x + a.w) out.push(R(i.x + i.w, i.y, a.x + a.w - i.x - i.w, i.d));
    return out.filter((r) => r.w > 1e-6 && r.d > 1e-6);
  }
  function subtractAll(rects, holes) { let cur = rects.slice(); for (const h of holes) cur = cur.flatMap((r) => subtract(r, h)); return cur; }
  /* does rect r lie inside the union of rects? */
  function insideUnion(r, rects) {
    return r.w > 0 && r.d > 0 && subtractAll([r], rects).length === 0;
  }

  /* ---------- Dijkstra, 16 neighbours, Euclidean weights, no corner cutting ---------- */
  const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
    [2, 1, Math.sqrt(5)], [2, -1, Math.sqrt(5)], [-2, 1, Math.sqrt(5)], [-2, -1, Math.sqrt(5)], [1, 2, Math.sqrt(5)], [1, -2, Math.sqrt(5)], [-1, 2, Math.sqrt(5)], [-1, -2, Math.sqrt(5)]];
  class Heap { constructor() { this.a = []; } push(k, d) { const a = this.a; a.push([d, k]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
    pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; } get size() { return this.a.length; } }
  /* pass(k) -> bool: cell traversable. sources: cell indices with distance 0. Returns Float64Array distances (m), Infinity where unreached. */
  function dijkstra(grid, sources, pass) {
    const W = grid.W, H = grid.H, dist = new Float64Array(W * H).fill(Infinity), heap = new Heap();
    for (const s of sources) if (pass(s)) { dist[s] = 0; heap.push(s, 0); }
    while (heap.size) {
      const [d, k] = heap.pop(); if (d > dist[k]) continue;
      const i = k % W, j = (k - i) / W;
      for (const [di, dj, wgt] of NB) {
        const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
        const nk = nj * W + ni; if (!pass(nk)) continue;
        // no corner cutting: intermediate cells must pass
        if (di && dj) { if (Math.abs(di) === 1 && Math.abs(dj) === 1) { if (!pass(k + di) || !pass(k + dj * W)) continue; }
          else { const si = Math.sign(di), sj = Math.sign(dj); if (!pass(k + si) || !pass(k + sj * W) || !pass(k + si + sj * W) || !pass(nk - si) || !pass(nk - sj * W)) continue; } }
        const nd = d + wgt * CELL; if (nd < dist[nk]) { dist[nk] = nd; heap.push(nk, nd); }
      }
    }
    return dist;
  }

  /* ---------- walls from room rectangles ---------- */
  /* rooms: [{rect, doors:[{side:'N'|'S'|'E'|'W', at: m along side (centre), w}]}] -> wall segments [[x1,y1,x2,y2]] with door gaps removed */
  function wallsFor(rooms) {
    const segs = [];
    for (const rm of rooms) {
      const r = rm.rect, sides = { S: [r.x, r.y, r.x + r.w, r.y], N: [r.x, r.y + r.d, r.x + r.w, r.y + r.d], W: [r.x, r.y, r.x, r.y + r.d], E: [r.x + r.w, r.y, r.x + r.w, r.y + r.d] };
      for (const [side, s] of Object.entries(sides)) {
        const horiz = side === 'N' || side === 'S';
        const gaps = (rm.doors || []).filter((d) => d.side === side).map((d) => [d.at - d.w / 2, d.at + d.w / 2]).sort((a, b) => a[0] - b[0]);
        let a = horiz ? s[0] : s[1]; const end = horiz ? s[2] : s[3];
        for (const g of gaps) { if (g[0] > a) segs.push(horiz ? [a, s[1], g[0], s[1]] : [s[0], a, s[0], g[0]]); a = Math.max(a, g[1]); }
        if (end > a) segs.push(horiz ? [a, s[1], end, s[1]] : [s[0], a, s[0], end]);
      }
    }
    return dedupe(segs);
  }
  function dedupe(segs) { const seen = new Set(), out = []; for (const s of segs) { const k = s.map((v) => Math.round(v * 100)).join(','); const k2 = [s[2], s[3], s[0], s[1]].map((v) => Math.round(v * 100)).join(','); if (seen.has(k) || seen.has(k2)) continue; seen.add(k); out.push(s); } return out; }

  return { CELL, C, Grid, q, snapQ, R, inter, overlaps, inset, bboxOf, area, centre, snapRect, subtract, subtractAll, insideUnion, dijkstra, wallsFor };
})();
