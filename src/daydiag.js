/* daydiag.js — the daylight diagram on the Analysis page: a small plan of the selected residential block at its worst storey
   band with the site, the obstacle blocks, the adjoining-site edges, the 24 m arc and the clear fan from the middle window of
   each face (green clear, amber limited, red blocked). */
window.DayDiag = (function () {
  const RAYS = []; for (let a = -89; a <= 89; a++) RAYS.push(a * Math.PI / 180);
  function render(canvas, project, result) {
    const ctx = canvas.getContext('2d'); const W = canvas.clientWidth || 300, H = 240; const dpr = window.devicePixelRatio || 1; canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.height = H + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cs = getComputedStyle(document.documentElement), colour = document.createElement('canvas').getContext('2d');
    const c = (n) => { colour.fillStyle = '#888'; colour.fillStyle = cs.getPropertyValue(n).trim(); return colour.fillStyle; };
    ctx.fillStyle = c('--panel2'); ctx.fillRect(0, 0, W, H);
    if (!result) { ctx.fillStyle = c('--muted'); ctx.font = '12px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Select a residential block to see its window fans.', W / 2, H / 2); return; }
    const b = result.block, s = project.site, band = result.worstBand || result.bands[0]; if (!band) return;
    const pad = 28, sc = Math.min((W - 2 * pad) / (b.w + 56), (H - 2 * pad) / (b.d + 56)); const cx = W / 2 - (b.x + b.w / 2) * sc, cy = H / 2 + (b.y + b.d / 2) * sc; const P = (x, y) => [cx + x * sc, cy - y * sc];
    // site box / polygon
    ctx.strokeStyle = c('--ink'); ctx.setLineDash([4, 3]); ctx.lineWidth = 1; ctx.beginPath(); const poly = s.poly || [[0, 0], [s.w, 0], [s.w, s.d], [0, s.d]]; poly.forEach((q, i) => { const [x, y] = P(q[0], q[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
    // obstacles at this band
    for (const o of band.obs) { const a = P(o.a[0], o.a[1]), e = P(o.b[0], o.b[1]); ctx.strokeStyle = o.nb ? c('--ink') : c('--muted'); ctx.lineWidth = o.nb ? 4 : 1.5; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(e[0], e[1]); ctx.stroke(); }
    // the block
    const [bx, by] = P(b.x, b.y + b.d); ctx.fillStyle = 'rgba(201,138,98,0.35)'; ctx.fillRect(bx, by, b.w * sc, b.d * sc); ctx.strokeStyle = c('--res'); ctx.lineWidth = 2; ctx.strokeRect(bx, by, b.w * sc, b.d * sc);
    // fans from the middle window of each face
    for (const F of band.faces) { if (F.interior) continue; const sm = F.samples[Math.floor(F.samples.length / 2)]; if (!sm || sm.interior) continue; const [px, py] = P(sm.px, sm.py); const colr = sm.ok ? c('--pass') : sm.d >= 3.7 ? c('--review') : c('--fail');
      ctx.strokeStyle = colr; ctx.setLineDash([3, 3]); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(px, py, 24 * sc, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      const tx = -F.ny, ty = F.nx; const dir = (ang) => [F.nx * Math.cos(ang) + tx * Math.sin(ang), F.ny * Math.cos(ang) + ty * Math.sin(ang)];
      for (const run of sm.runs || []) { if (run.span < 1) continue; ctx.fillStyle = colr; ctx.save(); ctx.globalAlpha = 0.22; ctx.beginPath(); ctx.moveTo(px, py); for (let k = run.k0; k <= run.k1; k++) { const [dx, dy] = dir(RAYS[k]); const [qx, qy] = P(sm.px + dx * sm.d, sm.py + dy * sm.d); ctx.lineTo(qx, qy); } ctx.closePath(); ctx.fill(); ctx.restore(); ctx.strokeStyle = colr; ctx.stroke(); }
      const [mx, my] = dir(0); const lp = P(sm.px + mx * 8, sm.py + my * 8); ctx.fillStyle = colr; ctx.font = '600 11px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(sm.ok ? `${F.label} ${sm.one}°` : `${F.label} ${sm.one}°/${sm.two}° · ${sm.d.toFixed(1)} m`, lp[0], lp[1] + 4); }
    ctx.fillStyle = c('--muted'); ctx.font = '10px Inter, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(`storeys ${band.f0 + 1}–${band.f1 + 1} · front street ↓ · 24 m arc dashed`, 8, H - 8);
  }
  return { render };
})();
