/* stack.js — the vertical program-stack diagram for the Edit tab. Every above-grade block is a segment drawn at true
   elevation; its horizontal extent follows the block's position along the site, so a podium under two towers reads as a
   podium under two towers. Click selects (and highlights the block in 3D); drag a segment above or below another block it
   overlaps to reorder the stack (elevations are recalculated from each block's own floor-to-floor); the toolbar splits a
   block at a chosen storey, merges compatible neighbours, moves a block to another tower, inserts an open level, and sets
   a start storey numerically. API: Stack.mount(el, App), Stack.svg(blocks, site, w, h, selectedId). */
window.Stack = (function () {
  'use strict';
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v, d = 0) => Number(v).toLocaleString('en-CA', { maximumFractionDigits: d, minimumFractionDigits: d });
  const HEX = { residential: '#F3D1CC', hotel: '#F6E3C9', office: '#D4E6ED', retail: '#E5DCF0', restaurant: '#F4DDC5', amenity: '#D5E8D9', parking: '#E1E6E9', core: '#E7E2DB' }, LINE = { residential: '#D39A92', hotel: '#D9B27A', office: '#86AFC0', retail: '#A693C4', restaurant: '#CF9F6F', amenity: '#86B893', parking: '#9EABB4', core: '#B1A594' };
  let app = null, root = null, axis = 'x', drag = null;
  const above = (p) => p.blocks.filter((b) => !b.hidden && b.use !== 'core' && Model.blockTop(b) > 0.01);
  /* storey labels for a block from the level table */
  function storeys(b, levels) { const L = (levels || []).filter((l) => l.label > 0); const lo = L.find((l) => Math.abs(l.z - b.z0) < 0.35), hiZ = Model.blockTop(b) - b.f2f, hi = L.slice().reverse().find((l) => l.z <= hiZ + 0.35); return { from: lo ? lo.label : null, to: hi ? hi.label : null }; }
  function svg(blocks, site, w, h, selId, opts = {}) {
    const bl = blocks.filter((b) => !b.hidden && b.use !== 'core' && Model.blockTop(b) > 0.01), park = blocks.filter((b) => !b.hidden && b.use === 'parking' && b.z0 < -0.01);
    const ax = opts.axis || axis, L0 = ax === 'x' ? 0 : 0, L1 = ax === 'x' ? site.w : site.d, zMin = Math.min(0, ...park.map((b) => b.z0)), zMax = Math.max(10, ...bl.map((b) => Model.blockTop(b)));
    const padL = 34, padR = 8, padT = 10, padB = 16, kx = (w - padL - padR) / Math.max(1, L1 - L0), kz = (h - padT - padB) / Math.max(1, zMax - zMin);
    const X = (v) => padL + (v - L0) * kx, Y = (z) => padT + (zMax - z) * kz;
    let s = `<svg class="stacksvg" viewBox="0 0 ${w} ${h}" width="100%" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Program stack">`;
    s += `<line x1="${X(L0)}" y1="${Y(0)}" x2="${X(L1)}" y2="${Y(0)}" stroke="#262626" stroke-width="1.2"/>`;
    for (let z = 0; z <= zMax; z += 10) s += `<line x1="${padL - 3}" y1="${Y(z)}" x2="${X(L1)}" y2="${Y(z)}" stroke="#efeee9" stroke-width="0.8"/><text x="${padL - 6}" y="${Y(z) + 3}" font-size="8" text-anchor="end" fill="#6e6d68" font-family="IBM Plex Mono, monospace">${z}</text>`;
    const seg = (b, isSel, ghost) => { const a0 = ax === 'x' ? b.x : b.y, a1 = a0 + (ax === 'x' ? b.w : b.d), z0 = b.z0, z1 = Model.blockTop(b); const x = X(a0), y = Y(z1), ww = Math.max(2, X(a1) - x), hh = Math.max(2, Y(z0) - y);
      const lbl = `${b.name}`, sub = `${b.floors}F · ${fmt(b.w * b.d)} m²`; return `<g class="seg ${isSel ? 'on' : ''}" data-id="${esc(b.id)}" style="cursor:pointer"><rect x="${x}" y="${y}" width="${ww}" height="${hh}" fill="${HEX[b.use] || '#eee'}" stroke="${isSel ? '#CF4F58' : LINE[b.use] || '#999'}" stroke-width="${isSel ? 1.6 : 0.8}" ${ghost ? 'stroke-dasharray="3 2" fill-opacity=".5"' : 'fill-opacity=".9"'}/>${hh > 11 && ww > 40 ? `<text x="${x + 4}" y="${y + Math.min(hh / 2 + 3, 11)}" font-size="8.5" fill="#262626" font-family="Inter, sans-serif" font-weight="600">${esc(lbl.length > ww / 5 ? lbl.slice(0, Math.max(3, Math.floor(ww / 5))) + '…' : lbl)}</text>${hh > 22 ? `<text x="${x + 4}" y="${y + Math.min(hh / 2 + 3, 11) + 9}" font-size="7.5" fill="#6e6d68" font-family="IBM Plex Mono, monospace">${esc(sub)}</text>` : ''}` : ''}</g>`; };
    for (const b of park) s += seg(b, false, true);
    for (const b of bl.slice().sort((p, q) => p.z0 - q.z0 || (q.w * q.d) - (p.w * p.d))) { if (b.gapBelow > 0) { const a0 = ax === 'x' ? b.x : b.y, a1 = a0 + (ax === 'x' ? b.w : b.d); s += `<rect x="${X(a0)}" y="${Y(b.z0)}" width="${Math.max(2, X(a1) - X(a0))}" height="${Math.max(1, Y(b.z0 - b.gapBelow) - Y(b.z0))}" fill="none" stroke="#CF4F58" stroke-dasharray="2 2" stroke-width="0.8"/><text x="${X(a0) + 4}" y="${Y(b.z0 - b.gapBelow / 2) + 3}" font-size="7.5" fill="#A8343D" font-family="Inter, sans-serif">open ${fmt(b.gapBelow, 1)} m</text>`; } s += seg(b, b.id === selId, false); }
    return s + '</svg>';
  }
  /* blocks that overlap b in plan (its vertical chain), bottom to top */
  function chain(p, b) { return above(p).filter((o) => Model.rectsOverlap(o, b)).sort((x, y) => x.z0 - y.z0); }
  function towersOf(p) { // connected groups of overlapping above-grade blocks; a tower stem = blocks above 18 m
    const bl = above(p), groups = []; for (const b of bl) { let g = groups.find((G) => G.some((o) => Model.rectsOverlap(o, b))); if (!g) { g = []; groups.push(g); } g.push(b); }
    // merge groups that got linked later
    let merged = true; while (merged) { merged = false; for (let i = 0; i < groups.length && !merged; i++) for (let j = i + 1; j < groups.length && !merged; j++) if (groups[i].some((a) => groups[j].some((b) => Model.rectsOverlap(a, b)))) { groups[i].push(...groups[j]); groups.splice(j, 1); merged = true; } }
    return groups.map((g, i) => ({ id: i, blocks: g.sort((x, y) => x.z0 - y.z0), top: Math.max(...g.map((b) => Model.blockTop(b))), stems: g.filter((b) => Model.blockTop(b) > 18 && b.z0 >= 0) }));
  }
  function render() {
    if (!root) return; const p = app.project(), sel = app.selected(), b = sel && sel.use && sel.use !== 'core' && sel.len == null ? sel : null, levels = app.levels ? app.levels() : Model.levels(p), st = app.state;
    const mode = st.editMode || 'free';
    let h = `<div class="stackhead"><span class="pview" role="group" aria-label="Edit mode"><button data-emode="free" class="${mode === 'free' ? 'on' : ''}" title="Geometry changes update the actual areas and percentages; the brief stays visible for comparison">Free edit</button><button data-emode="mix" class="${mode === 'mix' ? 'on' : ''}" title="After an edit, preview changes to unlocked blocks that bring the proposal back toward the target percentages">Maintain program mix</button></span><span class="pview" role="group" aria-label="Section axis"><button data-ax="x" class="${axis === 'x' ? 'on' : ''}" title="West to east">E–W</button><button data-ax="y" class="${axis === 'y' ? 'on' : ''}" title="South to north">N–S</button></span></div>`;
    h += `<div id="mixPreview"></div>`;
    h += svg(p.blocks, p.site, 320, 230, b ? b.id : null);
    const bl = above(p);
    if (!bl.length) h += '<div class="empty">No blocks above grade. Generate a massing or add a block.</div>';
    else if (!b) h += '<p class="hint">Click a segment to select its block; drag it above or below a neighbour to reorder the stack.</p>';
    else { const rng = storeys(b, levels), ch = chain(p, b), idx = ch.indexOf(b), belowB = idx > 0 ? ch[idx - 1] : null, aboveB = idx < ch.length - 1 ? ch[idx + 1] : null, towers = towersOf(p), mine = towers.find((t) => t.blocks.includes(b)), others = towers.filter((t) => t !== mine);
      const canMerge = (o) => o && o.use === b.use && !o.locked && Math.abs(o.x - b.x) < 0.3 && Math.abs(o.y - b.y) < 0.3 && Math.abs(o.w - b.w) < 0.3 && Math.abs(o.d - b.d) < 0.3 && (Math.abs(Model.blockTop(o) - b.z0) < 0.1 || Math.abs(Model.blockTop(b) - o.z0) < 0.1);
      const Ls = levels.filter((l) => l.label > 0);
      h += `<div class="stacktools"><div class="sthead"><i class="sw" style="background:${HEX[b.use] || '#eee'}"></i><b>${esc(b.name)}</b><span class="mono">${rng.from ? `L${rng.from}–L${rng.to || rng.from}` : ''} · ${b.floors}F · ${fmt(b.z0, 1)}–${fmt(Model.blockTop(b), 1)} m</span></div>
        <div class="row2"><label>Split at storey<span class="inline"><input type="number" id="stSplit" min="2" max="${b.floors}" value="${Math.max(2, Math.ceil(b.floors / 2))}" ${b.floors < 2 ? 'disabled' : ''}><button id="stSplitGo" ${b.floors < 2 ? 'disabled' : ''} title="The block becomes two: storeys below this one, and this storey upward">Split</button></span></label>
        <label>Start at storey<select id="stStart">${Ls.map((l) => `<option value="${l.key}" ${rng.from === l.label ? 'selected' : ''}>L${l.label} · ${fmt(l.z, 1)} m</option>`).join('')}<option value="ground" ${b.z0 < 0.05 ? 'selected' : ''}>ground</option></select></label></div>
        <div class="btnrow"><button id="stMergeDown" ${canMerge(belowB) ? '' : 'disabled'} title="${belowB ? (canMerge(belowB) ? `Merge with ${belowB.name} below` : `${belowB.name} differs in use or footprint`) : 'Nothing below'}">Merge down</button><button id="stMergeUp" ${canMerge(aboveB) ? '' : 'disabled'} title="${aboveB ? (canMerge(aboveB) ? `Merge with ${aboveB.name} above` : `${aboveB.name} differs in use or footprint`) : 'Nothing above'}">Merge up</button><button id="stGap" title="Leave an open level (one storey of air) under this block">${b.gapBelow > 0 ? 'Close the open level' : 'Open level below'}</button>${others.length ? `<select id="stTransfer" aria-label="Move to another tower"><option value="">Move to tower…</option>${others.map((t) => `<option value="${t.id}">Tower ${t.id + 1} · ${t.stems[0] ? esc(t.stems[0].name) : esc(t.blocks[t.blocks.length - 1].name)} · ${fmt(t.top, 1)} m</option>`).join('')}</select>` : ''}</div>
        <p class="hint" style="margin:6px 0 0">Reordering changes where a block sits in the stack; its footprint stays. Moving geometry is done in the model or with the footprint fields in the right panel.</p></div>`; }
    root.innerHTML = h; wire(p, b, levels);
    renderMixPreview();
  }
  function wire(p, b, levels) {
    root.querySelectorAll('[data-emode]').forEach((el) => (el.onclick = () => { app.state.editMode = el.dataset.emode; app.saveUi && app.saveUi(); render(); }));
    root.querySelectorAll('[data-ax]').forEach((el) => (el.onclick = () => { axis = el.dataset.ax; render(); }));
    const svgEl = root.querySelector('svg.stacksvg'); if (!svgEl) return;
    svgEl.querySelectorAll('g.seg').forEach((g) => {
      g.addEventListener('pointerdown', (e) => { drag = { id: g.dataset.id, x: e.clientX, y: e.clientY, moved: false }; try { g.setPointerCapture(e.pointerId); } catch (err) { /* */ } });
      g.addEventListener('pointermove', (e) => { if (!drag || drag.id !== g.dataset.id) return; if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) { drag.moved = true; g.style.opacity = '.55'; } });
      g.addEventListener('pointerup', (e) => { if (!drag || drag.id !== g.dataset.id) return; const d = drag; drag = null; g.style.opacity = '';
        if (!d.moved) { app.select(d.id); return; }
        g.style.pointerEvents = 'none'; const el = document.elementFromPoint(e.clientX, e.clientY); g.style.pointerEvents = ''; const tg = el && el.closest ? el.closest('g.seg') : null; if (!tg || tg.dataset.id === d.id) return;
        const target = p.blocks.find((x) => x.id === tg.dataset.id), moving = p.blocks.find((x) => x.id === d.id); if (!target || !moving) return;
        const rect = tg.getBoundingClientRect(), upper = e.clientY < rect.top + rect.height / 2; app.reorderStack(moving.id, target.id, upper); });
    });
    if (!b) return;
    const sp = root.querySelector('#stSplitGo'); if (sp) sp.onclick = () => { const k = Number(root.querySelector('#stSplit').value); app.splitBlock(b.id, k); };
    const ss = root.querySelector('#stStart'); if (ss) ss.onchange = () => { const v = ss.value; const z = v === 'ground' ? 0 : ((levels.find((l) => l.key === v) || {}).z); if (z != null) app.placeAt(b.id, z); };
    const md = root.querySelector('#stMergeDown'); if (md) md.onclick = () => { const ch = chain(p, b), i = ch.indexOf(b); if (i > 0) app.mergeBlocks(ch[i - 1].id, b.id); };
    const mu = root.querySelector('#stMergeUp'); if (mu) mu.onclick = () => { const ch = chain(p, b), i = ch.indexOf(b); if (i < ch.length - 1) app.mergeBlocks(b.id, ch[i + 1].id); };
    const gp = root.querySelector('#stGap'); if (gp) gp.onclick = () => app.setGap(b.id, b.gapBelow > 0 ? 0 : b.f2f);
    const tr = root.querySelector('#stTransfer'); if (tr) tr.onchange = () => { if (tr.value === '') return; const t = towersOf(p).find((x) => String(x.id) === tr.value); if (t) app.transferBlock(b.id, t.blocks[t.blocks.length - 1].id); };
  }
  /* Maintain program mix: propose storey changes on unlocked blocks that move the actual shares back toward the brief */
  function mixPlan(p) {
    const A = Brief.areas(p), plan = []; if (!A.ok) return { plan, note: 'The brief does not add to 100%.' };
    for (const u of Brief.USES) { const r = A.by[u]; if (!r.pct && !r.actual) continue; const cands = above(p).filter((b) => b.use === u && !b.locked).sort((x, y) => y.w * y.d * y.floors - x.w * x.d * x.floors); if (!cands.length) { if (r.target > 300) plan.push({ use: u, text: `${Model.USE_LABEL[u]}: ${fmt(r.target)} m² requested but no unlocked block carries it`, apply: null }); continue; }
      const b = cands[0], per = b.w * b.d, dF = Math.round(-r.delta / per); if (!dF || b.floors + dF < 1) continue; plan.push({ use: u, b, dF, text: `${b.name}: ${dF > 0 ? 'add' : 'remove'} ${Math.abs(dF)} storey${Math.abs(dF) === 1 ? '' : 's'} (${dF > 0 ? '+' : ''}${fmt(dF * per)} m²) to bring ${Model.USE_LABEL[u].toLowerCase()} from ${fmt(r.actualPct, 0)}% toward ${fmt(r.pct, 0)}%` }); }
    return { plan, note: '' };
  }
  function renderMixPreview() { const host = root && root.querySelector('#mixPreview'); if (!host) return; const p = app.project(); if ((app.state.editMode || 'free') !== 'mix') { host.innerHTML = ''; return; }
    const { plan, note } = mixPlan(p); if (!plan.length) { host.innerHTML = `<div class="mlink on">${note || 'The proposal matches the program mix within one storey per use.'}</div>`; return; }
    host.innerHTML = `<div class="mixprev"><b>To return to the target mix</b><ul class="mlist">${plan.map((q) => `<li>${esc(q.text)}</li>`).join('')}</ul><div class="btnrow"><button class="primary" id="mixApply" ${plan.some((q) => q.b) ? '' : 'disabled'}>Apply the preview</button><button id="mixKeep">Keep my edit</button></div><p class="hint" style="margin:6px 0 0">Nothing changes until you apply. Locked blocks are never touched.</p></div>`;
    const ap = host.querySelector('#mixApply'); if (ap) ap.onclick = () => app.applyMixPlan(plan.filter((q) => q.b));
    const kp = host.querySelector('#mixKeep'); if (kp) kp.onclick = () => { app.state.editMode = 'free'; render(); };
  }
  function mount(el, App) { root = el; app = App; render(); if (App.on) App.on('change', render); }
  return { mount, render, svg, chain, towersOf, storeys, mixPlan };
})();
