/* dxf.js — minimal R12 ASCII DXF writer (metres). Pure function, no DOM.
   DXF.write({ layers: { WALLS: [{ pts:[[x,y],...], closed:true }, ...], DOORS: [...], TEXT: [{ text, at:[x,y], h }] } }) -> string
   Layer entries may be polylines ({pts, closed}), lines ({a:[x,y], b:[x,y]}), circles ({c:[x,y], r}) or text ({text, at, h}). */
window.DXF = (function () {
  const COLORS = { WALLS: 7, DOORS: 3, CORE: 1, CORRIDOR: 8, UNITS: 5, ROOMS: 4, STALLS: 2, AISLE: 8, RAMP: 6, TEXT: 7, OUTLINE: 7, GRID: 9 };
  const f = (n) => (Math.round(n * 1000) / 1000).toFixed(3);
  function write(doc) {
    const out = [];
    const put = (...pairs) => { for (let i = 0; i < pairs.length; i += 2) out.push(String(pairs[i]), String(pairs[i + 1])); };
    put(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 9, '$INSUNITS', 70, 6, 0, 'ENDSEC');
    put(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', 70, Object.keys(doc.layers).length);
    for (const name of Object.keys(doc.layers)) put(0, 'LAYER', 2, name, 70, 0, 62, COLORS[name] || 7, 6, 'CONTINUOUS');
    put(0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES');
    for (const [name, items] of Object.entries(doc.layers)) {
      for (const it of items) {
        if (it.pts) {
          put(0, 'POLYLINE', 8, name, 66, 1, 70, it.closed ? 1 : 0);
          for (const p of it.pts) put(0, 'VERTEX', 8, name, 10, f(p[0]), 20, f(p[1]), 30, 0);
          put(0, 'SEQEND', 8, name);
        } else if (it.a) {
          put(0, 'LINE', 8, name, 10, f(it.a[0]), 20, f(it.a[1]), 30, 0, 11, f(it.b[0]), 21, f(it.b[1]), 31, 0);
        } else if (it.c) {
          put(0, 'CIRCLE', 8, name, 10, f(it.c[0]), 20, f(it.c[1]), 30, 0, 40, f(it.r));
        } else if (it.text != null) {
          put(0, 'TEXT', 8, name, 10, f(it.at[0]), 20, f(it.at[1]), 30, 0, 40, f(it.h || 0.3), 1, String(it.text).replace(/[\r\n]+/g, ' '));
        }
      }
    }
    put(0, 'ENDSEC', 0, 'EOF');
    return out.join('\r\n') + '\r\n';
  }
  return { write, COLORS };
})();
