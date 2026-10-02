/* ledger.js — renders rule rows into the right panel, with change chips against the previous evaluation. */
window.Ledger = (function () {
  const GROUPS = { zoning: 'Zoning · ODP', egress: 'Building code', parking: 'Parking By-law', layout: 'Layout advice' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let open = new Set(), prev = null;
  function render(rows, state, onFilter, onRow) {
    const sum = document.getElementById('summary'), fl = document.getElementById('filters'), host = document.getElementById('rows');
    const n = { pass: 0, fail: 0, review: 0, info: 0 }; for (const r of rows) n[r.verdict] = (n[r.verdict] || 0) + 1;
    sum.innerHTML = `<span class="count fail">${n.fail} fail</span><span class="count review">${n.review} review</span><span class="count pass">${n.pass} pass</span><span class="count">${rows.length} checks</span>`;
    fl.innerHTML = ['all', ...Object.keys(GROUPS)].map((g) => `<button data-g="${g}" class="${state.filter === g ? 'on' : ''}">${g === 'all' ? 'All' : GROUPS[g]}</button>`).join('') + `<button data-g="problems" class="${state.filter === 'problems' ? 'on' : ''}">Problems only</button>`;
    fl.querySelectorAll('button').forEach((b) => (b.onclick = () => onFilter(b.dataset.g)));
    const shown = rows.filter((r) => state.filter === 'all' || r.group === state.filter || (state.filter === 'problems' && (r.verdict === 'fail' || r.verdict === 'review')));
    host.innerHTML = '';
    let lastGroup = null;
    for (const r of shown) {
      if (r.group !== lastGroup) { const h = document.createElement('h2'); h.textContent = GROUPS[r.group] || r.group; h.style.margin = '10px 4px 6px'; host.appendChild(h); lastGroup = r.group; }
      const was = prev ? prev.get(r.id) : undefined;
      const chip = prev && was === undefined ? 'new' : was && was !== r.verdict ? (was === 'fail' ? 'was failing' : r.verdict === 'fail' ? 'was ' + was : 'changed') : '';
      const el = document.createElement('div'); el.className = `rule ${r.plan || r.block || r.park ? 'click' : ''} ${open.has(r.id) ? 'open' : ''}`; el.dataset.id = r.id;
      el.innerHTML = `<div class="top"><span class="v ${r.verdict}">${r.verdict}</span><span class="t">${esc(r.title)}</span>${chip ? `<span class="chg">${chip}</span>` : ''}</div>
        <div class="val">${esc(r.value)}</div>${r.limit ? `<div class="lim">${esc(r.limit)}</div>` : ''}
        <div class="why">${esc(r.why)}</div>${r.fix ? `<div class="fix">→ ${esc(r.fix)}</div>` : ''}
        <div class="clause">${esc(r.clause)}${r.plan ? ' · click to see the plan' : r.block ? ' · click to select the block' : ''}</div>`;
      el.onclick = (e) => { if (open.has(r.id)) open.delete(r.id); else open.add(r.id); el.classList.toggle('open'); if ((r.plan || r.block || r.park) && !e.target.closest('.why')) onRow(r); };
      host.appendChild(el);
    }
    if (!shown.length) host.innerHTML = '<div class="rule"><div class="lim">Nothing to show for this filter.</div></div>';
  }
  /* remember verdicts so the next render can show what changed */
  function mark(rows) { prev = new Map(rows.map((r) => [r.id, r.verdict])); }
  return { render, mark, GROUPS };
})();
