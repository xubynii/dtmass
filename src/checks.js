/* checks.js — the Check workspace: status summary (Issues / Needs review / Passed), topic and block filters, the check list and
   the issue detail. Rows come from Rules.evaluate() unchanged. One presentation rule is added: a pass that depends on a
   restriction still marked "Needs verification" on the Site tab is shown as Needs verification, never as a confirmed pass. */
window.Checks = (function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const STATUS = {
    fail: { label: 'Issue', plural: 'Issues', icon: '✕', kind: 'Automated check', blurb: 'The model breaks a measurable rule.' },
    review: { label: 'Needs review', plural: 'Needs review', icon: '!', kind: 'Professional review', blurb: 'Discretionary or not measurable here: a planner or code consultant must confirm.' },
    verify: { label: 'Needs verification', plural: 'Needs verification', icon: '?', kind: 'Needs more information', blurb: 'The check passes on an assumed restriction that has not been confirmed yet.' },
    pass: { label: 'Passed', plural: 'Passed', icon: '✓', kind: 'Automated check', blurb: 'Meets the rule as the tool measures it, with confirmed inputs.' },
    info: { label: 'Note', plural: 'Notes', icon: 'i', kind: 'Information', blurb: 'Context for the design; nothing to fix.' },
  };
  const GROUPS = { zoning: 'Zoning & Downtown plan', egress: 'Building code (VBBL)', parking: 'Parking By-law', layout: 'Layout advice' };
  const DENSITY_IDS = ['fsr', 'rescap', 'nonresmin', 'officemax', 'dwell'], HEIGHT_IDS = ['height', 'hbp', 'granville'];
  let prev = null, lastRows = null;
  function mark(rows) { if (lastRows) prev = new Map(lastRows.map((r) => [r.id, r.verdict])); lastRows = rows; }
  /* which restriction a passing row still depends on, if that restriction is unconfirmed */
  function pending(r, project) {
    if (r.verdict !== 'pass') return null; const s = project.site, a = s.auto || {};
    if (DENSITY_IDS.includes(r.id) && a.densityArea === 'check') return 'the ODP density area';
    if (HEIGHT_IDS.includes(r.id) && a.heightArea === 'check') return 'the ODP height area';
    if (HEIGHT_IDS.includes(r.id) && s.viewCones && s.viewCones.length && s.viewConeH == null) return 'the view cone height at this site';
    return null;
  }
  function effective(r, project) { const p = pending(r, project); return p ? { key: 'verify', group: 'review', reason: p } : { key: r.verdict, group: r.verdict }; }
  /* rows as the report and saved versions should present them: unconfirmed passes become review items */
  function present(rows, project) { return rows.map((r) => { const p = pending(r, project); return p ? Object.assign({}, r, { verdict: 'review', value: `${r.value} · needs verification of ${p}` }) : r; }); }
  function describe(r, app) {
    const project = app.project(), parts = String(r.title || '').split(' · '), name = parts[0], tail = parts.slice(1).join(' · '), eff = effective(r, project);
    let where = 'Whole project';
    if (r.block) { const b = project.blocks.find((x) => x.id === r.block); where = b ? `Block: ${b.name}` : tail || where; }
    else if (r.park) where = `Park: ${r.park}`;
    else if (r.levels && r.levels.length) where = `Storey${/–|,/.test(tail) ? 's' : ''} ${tail || r.levels.join(', ')}`;
    else if (tail) where = tail;
    const st = STATUS[eff.key] || STATUS.info;
    const next = eff.key === 'verify' ? `Confirm ${eff.reason} on the Site tab. Until then this result rests on an assumption.` : r.fix || (r.verdict === 'fail' ? 'Revise the massing until the current value meets the requirement.' : r.verdict === 'review' ? 'Confirm with the City or a code consultant; the tool cannot settle this item on its own.' : '');
    return { name, where, current: r.value, required: r.limit || '—', next, status: st, key: eff.key, verdict: eff.group, clause: r.clause, why: r.why, group: GROUPS[r.group] || r.group };
  }
  function counts(rows, project) { const n = { fail: 0, review: 0, pass: 0, info: 0, verify: 0 }; for (const r of rows) { const e = effective(r, project); n[e.group] = (n[e.group] || 0) + 1; if (e.key === 'verify') n.verify++; } return n; }

  /* summary + filters + list, rendered into the left panel */
  function renderList(host, rows, state, app, onPick) {
    const project = app.project(), n = counts(rows, project), f = state.checkFilter || (state.checkFilter = { status: 'all', group: 'all', block: null });
    const blk = f.block ? project.blocks.find((b) => b.id === f.block) : null; if (f.block && !blk) f.block = null;
    const card = (k) => `<button class="stcard st-${k} ${f.status === k ? 'on' : ''}" data-st="${k}" aria-pressed="${f.status === k}"><span class="stn">${n[k] || 0}</span><span class="stl"><span class="stico">${STATUS[k].icon}</span>${STATUS[k].plural}</span></button>`;
    const shown = rows.filter((r) => { const e = effective(r, project); return (f.status === 'all' || e.group === f.status) && (f.group === 'all' || r.group === f.group) && (!blk || app.rowTouches(r, blk)); });
    const order = { fail: 0, review: 1, pass: 2, info: 3 }; shown.sort((a, b) => order[effective(a, project).group] - order[effective(b, project).group]);
    let html = `<div class="stcards">${card('fail')}${card('review')}${card('pass')}</div>
      <div class="filterrow"><button class="chip ${f.status === 'all' ? 'on' : ''}" data-st="all">All ${rows.length}</button><button class="chip ${f.status === 'info' ? 'on' : ''}" data-st="info">Notes ${n.info || 0}</button>${blk ? `<button class="chip on" id="clearBlock" title="Show checks for the whole project">${esc(blk.name)} ✕</button>` : ''}<span class="sep"></span><select id="checkGroup" aria-label="Topic"><option value="all">All topics</option>${Object.entries(GROUPS).map(([k, v]) => `<option value="${k}" ${f.group === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <p class="disclaimer">Screening checks of a massing model. A pass does not establish compliance with the Downtown ODP, the Zoning By-law or the VBBL. <b>Needs review</b> items need a professional's judgement${n.verify ? `; ${n.verify} of them pass only on an assumption that still needs verification` : ''}.</p>`;
    if (!shown.length) html += `<div class="empty">No ${f.status === 'all' ? '' : (STATUS[f.status] || STATUS.info).plural.toLowerCase() + ' '}checks${blk ? ' for ' + esc(blk.name) : ''}${f.group !== 'all' ? ' in ' + GROUPS[f.group] : ''}.</div>`;
    let lastV = null;
    for (const r of shown) { const d = describe(r, app);
      if (d.verdict !== lastV && f.status === 'all') { html += `<h4 class="listhead st-${d.verdict}">${STATUS[d.verdict].plural}</h4>`; lastV = d.verdict; }
      const was = prev ? prev.get(r.id) : undefined; const chg = prev && was === undefined ? 'New' : was && was !== r.verdict ? (was === 'fail' ? 'Was an issue' : r.verdict === 'fail' ? 'Now an issue' : 'Changed') : '';
      html += `<button class="crow st-${d.key} ${state.issue === r.id ? 'on' : ''}" data-id="${esc(r.id)}"><span class="cico" aria-label="${d.status.label}">${d.status.icon}</span><span class="cmain"><span class="cname">${esc(d.name)}${chg ? ` <span class="pillsm">${chg}</span>` : ''}</span><span class="cwhere">${esc(d.where)}${d.key === 'verify' ? ' · needs verification' : ''}</span>${d.verdict === 'fail' || d.verdict === 'review' ? `<span class="cval">${esc(d.current)}</span>` : ''}</span></button>`; }
    host.innerHTML = html;
    host.querySelectorAll('[data-st]').forEach((b) => (b.onclick = () => { const k = b.dataset.st; f.status = f.status === k && k !== 'all' ? 'all' : k; renderList(host, rows, state, app, onPick); }));
    host.querySelector('#checkGroup').onchange = (e) => { f.group = e.target.value; renderList(host, rows, state, app, onPick); };
    const cb = host.querySelector('#clearBlock'); if (cb) cb.onclick = () => { f.block = null; renderList(host, rows, state, app, onPick); };
    host.querySelectorAll('.crow').forEach((b) => (b.onclick = () => onPick(b.dataset.id)));
  }

  /* issue detail, rendered into the right panel */
  function renderDetail(host, r, app, actions) {
    const d = describe(r, app), target = actions.target(r);
    host.innerHTML = `<div class="detail st-${d.key}">
      <div class="dstatus"><span class="cico">${d.status.icon}</span>${d.status.label}<span class="dkind">${d.status.kind}</span></div>
      <h3 class="dtitle">${esc(d.name)}</h3>
      <dl class="facts">
        <dt>Where</dt><dd>${esc(d.where)}</dd>
        <dt>Current value</dt><dd class="num">${esc(d.current)}</dd>
        <dt>Requirement</dt><dd>${esc(d.required)}</dd>
        ${d.next ? `<dt>${d.verdict === 'fail' ? 'Suggested next step' : d.key === 'verify' ? 'What is missing' : d.verdict === 'review' ? 'What to do' : 'Note'}</dt><dd>${esc(d.next)}</dd>` : ''}
      </dl>
      <div class="dbtns">${target ? `<button class="primary" id="showInModel">Show in model</button><span class="hint">${esc(target.hint)}</span>` : '<span class="hint">Applies to the whole project; nothing specific to highlight.</span>'}${actions.back ? '<button id="backToDesign">Back to Form</button>' : ''}</div>
      <details class="ref"><summary>Rule reference and why it matters</summary><p><b>${esc(d.group)}</b> · ${window.Cite ? Cite.html(d.clause || '—', { parking: /^Parking/.test(d.group) }) : esc(d.clause || '—')}</p><p class="hint">Underlined references open the by-law or guideline at that section.</p><p>${esc(d.why || 'No note supplied.')}</p><p class="hint">${esc(d.status.blurb)}</p></details>
    </div>`;
    const btn = host.querySelector('#showInModel'); if (btn) btn.onclick = () => actions.show(r);
    const bk = host.querySelector('#backToDesign'); if (bk) bk.onclick = actions.back;
  }
  return { describe, counts, effective, present, pending, renderList, renderDetail, mark, STATUS, GROUPS };
})();
