/* icons.js — one set of simple 24 px line icons, drawn with the current text colour.
   ICON(name) returns an inline SVG string for templates; Icons.apply(root) fills every [data-icon] button once. */
(function () {
  const P = {
    site: '<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
    design: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
    check: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M3.5 6l1.5 1.5L7.5 5M3.5 12l1.5 1.5L7.5 11M3.5 18l1.5 1.5L7.5 17"/>',
    compare: '<rect x="3" y="5" width="7" height="14" rx="1"/><rect x="14" y="5" width="7" height="14" rx="1"/><path d="M10 12h4"/>',
    report: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6M9 8h2"/>',
    save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.6"/><path d="M12 17.2v.1"/>',
    map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    rotate: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="1"/><path d="M16 8V4H4v12h4"/>',
    stack: '<path d="M4 15l8 4 8-4"/><path d="M4 10l8 4 8-4-8-4z"/><path d="M12 2v3"/>',
    more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
    trash: '<path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    target: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    back: '<path d="M10 6l-6 6 6 6"/><path d="M4 12h16"/>',
    route: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h6a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h6"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 20h14"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.6L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.3 4.6L20 16"/><path d="M20 21v-5h-5"/>',
    done: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.1"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="1"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
    split: '<rect x="4" y="5" width="16" height="14" rx="1"/><path d="M12 5v14" stroke-dasharray="2 2"/>',
    upload: '<path d="M12 20V9M7 14l5-5 5 5"/><path d="M5 4h14"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    ramp: '<path d="M3 18h18L8 8H3z"/>',
    typology: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
    eyeoff: '<path d="M3 3l18 18"/><path d="M10.6 6.1A9.6 9.6 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-3 3.6M6.4 7.8A16 16 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 3.6-.7"/>',
    unlock: '<rect x="5" y="11" width="14" height="9" rx="1"/><path d="M8 11V8a4 4 0 0 1 7.6-1.7"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    layers: '<rect x="4" y="15" width="16" height="5"/><rect x="6" y="9.5" width="12" height="5"/><rect x="8" y="4" width="8" height="5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M5 19l1.4-1.4M17.6 6.4L19 5"/>',
  };
  window.ICON = (name, cls = 'i') => (P[name] ? `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${P[name]}</svg>` : '');
  /* buttons named by their label get the matching icon wherever a module renders them */
  const BY_LABEL = [[/^Save version|^Save name|^Save$/, 'save'], [/^Show in model|^Inspect/, 'target'], [/^Back to (Design|Program|Form)/, 'back'], [/^Edit in (Design|Program|Form)|^Rename|^Shape in/, 'edit'],
    [/^Duplicate/, 'copy'], [/^Stack copy/, 'stack'], [/^Rotate/, 'rotate'], [/^More actions/, 'more'], [/^Delete/, 'trash'], [/^Update report/, 'refresh'], [/^Export/, 'download'],
    [/^Exit distances/, 'route'], [/^Change site/, 'map'], [/^Add ramp/, 'ramp'], [/^Done$|^Confirm/, 'done'], [/^Load/, 'upload'], [/^Start from scratch/, 'plus'], [/^Fit to height/, 'upload'],
    [/^View block checks/, 'check'], [/^Split/, 'split'], [/^Lock|^Unlock/, 'lock'], [/^Hide$|^Show$/, 'eye'], [/^Zoom out/, 'map'], [/^Choose/, 'done']];
  const SKIP = '.tools, .seg, .tabs, .brow, .lrow, .pview, .mstart, .pcard, .crow, .stcard, .chip, .lvl, .metric, .toc, .palette, .x, .collapse, .hidefig, #mapResults, .seg2';
  function auto(root) {
    const list = root.matches && root.matches('button') ? [root] : root.querySelectorAll ? root.querySelectorAll('button') : [];
    for (const b of list) { if (b.dataset.iconDone || b.querySelector('svg') || b.closest(SKIP)) continue; const t = b.textContent.trim(); const hit = BY_LABEL.find(([re]) => re.test(t)); if (!hit) continue; b.dataset.iconDone = '1'; b.insertAdjacentHTML('afterbegin', window.ICON(hit[1])); }
  }
  function watch() { auto(document.body); new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) auto(n); }).observe(document.body, { childList: true, subtree: true }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
  window.Icons = {
    names: Object.keys(P), auto,
    apply(root) { (root || document).querySelectorAll('[data-icon]').forEach((el) => { if (el.dataset.iconDone) return; el.insertAdjacentHTML('afterbegin', window.ICON(el.dataset.icon)); el.dataset.iconDone = '1'; }); },
  };
})();
