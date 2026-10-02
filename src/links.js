/* links.js — clause references become links to the source document. Cite.html(text, ctx) returns escaped HTML in which every
   recognised reference opens the by-law, code section, guideline or bulletin it comes from (new tab). Known locations, read 2 Oct 2026:
   · VBBL Part 3 and Part 10 articles → the online Vancouver Building By-law 2019 at BC Publications, section by section (the 2025 by-law
     is published only as a PDF; Part 3 text matches except where marked Vancouver). · Parking By-law 6059 → bylaws.vancouver.ca section PDFs.
   · Downtown ODP → bylaws.vancouver.ca/ODP/DD.pdf. · Guidelines, bulletins and policies → guidelines.vancouver.ca.
   ctx.parking = true reads bare numbers such as 4.1.1 as Parking By-law sections. */
window.Cite = (function () {
  'use strict';
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const VB = 'https://free.bcpublications.ca/civix/document/id/public/vbbl2019/';
  const SEC = { '3.1': '519280133', '3.2': '59509560', '3.3': '758782467', '3.4': '463712062', '3.5': '681033337', '3.6': '2046477372', '3.7': '2082748897', '3.8': '369101801', '10.1': '689044624', '10.2': '564929486', '10.3': '1870348814', '10.4': '1069567153' };
  const SEC_NAME = { '3.1': 'General', '3.2': 'Building Fire Safety', '3.3': 'Safety within Floor Areas', '3.4': 'Exits', '3.5': 'Vertical Transportation', '3.6': 'Service Facilities', '3.7': 'Health Requirements', '3.8': 'Accessibility', '10.1': 'General', '10.2': 'Energy Efficiency', '10.3': 'Electric Vehicle Charging', '10.4': 'Low Carbon Construction' };
  const PK_NAME = { 3: 'Administration', 4: 'Off-Street Parking Space Regulations', 5: 'Off-Street Loading Space Regulations', 6: 'Off-Street Bicycle Space Regulations' };
  const pkUrl = (n) => `https://bylaws.vancouver.ca/parking/sec${String(n).padStart(2, '0')}.pdf`;
  const ODP = 'https://bylaws.vancouver.ca/ODP/DD.pdf';
  const DOCS = [
    [/Downtown South Guidelines/gi, 'https://guidelines.vancouver.ca/D007.pdf', 'Downtown South Guidelines (excluding Granville Street) · guidelines.vancouver.ca'],
    [/Downtown Design Guidelines/gi, 'https://guidelines.vancouver.ca/Pol&Guide.htm', 'City of Vancouver policies and guidelines library · open “Downtown (except Downtown South) Design Guidelines”'],
    [/Floor-plate bulletin|floor-plate bulletin/g, 'https://guidelines.vancouver.ca/bulletins/bulletin-residential-tower-floor-plates.pdf', 'Residential Tower Floor Plates bulletin · guidelines.vancouver.ca'],
    [/View Protection Guidelines|Public Views Guidelines/gi, 'https://guidelines.vancouver.ca/guidelines-public-views.pdf', 'Public Views Guidelines (replaced the View Protection Guidelines, 10 July 2024)'],
    [/Solar Access Guidelines/gi, 'https://council.vancouver.ca/20250917/documents/pspc9Memo.pdf', 'Solar Access Guidelines for the Downtown Peninsula · Council memo, 17 September 2025'],
    [/Granville Street Plan/gi, 'https://guidelines.vancouver.ca/policy-plan-granville.pdf', 'Granville Street Plan (June 2025)'],
    [/Higher Buildings (?:Policy|norms)/gi, 'https://guidelines.vancouver.ca/H005.pdf', 'Higher Buildings Policy · guidelines.vancouver.ca'],
    [/Green Buildings Policy for Rezonings/gi, 'https://guidelines.vancouver.ca/policy-green-buildings-for-rezonings-2023-July25.pdf', 'Green Buildings Policy for Rezonings (July 2023)'],
    [/High-Density Housing for Families with Children Guidelines/gi, 'https://guidelines.vancouver.ca/Pol&Guide.htm', 'Policies and guidelines library · High-Density Housing for Families with Children Guidelines'],
    [/Schedule J|ODP amendment June 2026/g, 'https://bylaws.vancouver.ca/zoning/zoning-by-law-consolidated.pdf', 'Zoning and Development By-law, consolidated · Schedule J Affordable Housing'],
    [/Design Supplement/g, 'https://bylaws.vancouver.ca/parking/parking.htm', 'Parking By-law index · Parking and Loading Design Supplement'],
    [/Parking By-law(?: 6059)?(?: No\. 6059)?/g, 'https://bylaws.vancouver.ca/parking/parking.htm', 'Parking By-law No. 6059 · bylaws.vancouver.ca'],
    [/VBBL No\. 14275 transition|VBBL 2025 Division B Part 10 \(Energy and Water Efficiency\)|VBBL 2025|Vancouver Building By-law 2025[^;,)]*/g, 'https://vancouver.ca/your-government/vancouver-building-bylaw.aspx', 'Vancouver Building By-law 2025 · City of Vancouver'],
    [/Zoning (?:and Development )?By-law/g, 'https://bylaws.vancouver.ca/zoning/zoning-by-law-consolidated.pdf', 'Zoning and Development By-law No. 3575, consolidated'],
  ];
  const ODP_RE = /(?:Downtown )?ODP(?:\s*§\s*\d[\d.()\-–]*(?:\s*(?:and|,)\s*(?:§\s*\d[\d.()\-–]*|Map \d|Table \d|Figure \d))*)?(?:\s*(?:Map|Table|Figure) \d)?/g;
  // Part 3 / Part 10 articles and tables: 3.4.2.5.(1)(b), Table 3.1.3.1, Table 3.4.3.2.-A, 3.1.17.1
  const ART_RE = /\b(?:Table\s+)?(3|10)\.(\d{1,2})\.(\d{1,2})(?:\.\d{1,2})?(?:\.?\(\d+\))?(?:\([a-z]\),?)*(?:\.?-[A-C])?/g;
  const PK_RE = /(?:§\s*)?\b([3-6])\.(\d{1,2})(?:\.\d{1,2})?(?:\.\d)?\b(?!\s*(?:m|h|%|×))/g;
  const anchor = (text, href, title) => `<a class="cite" href="${esc(href)}" target="_blank" rel="noopener" title="${esc(title)}">${esc(text)}</a>`;
  function html(text, ctx = {}) {
    if (text == null || text === '' || text === '—') return esc(text == null ? '' : text);
    const src = String(text), slots = [], hits = [];
    const take = (re, fn) => { re.lastIndex = 0; let m; while ((m = re.exec(src))) { if (!m[0]) { re.lastIndex++; continue; } const a = m.index, b = a + m[0].length; if (hits.some((h) => a < h.b && b > h.a)) continue; const link = fn(m); if (link) hits.push({ a, b, link }); } };
    for (const [re, url, title] of DOCS) take(re, (m) => anchor(m[0], url, title));
    take(ODP_RE, (m) => anchor(m[0], ODP, 'Downtown Official Development Plan (By-law 4912) · bylaws.vancouver.ca/ODP/DD.pdf'));
    take(ART_RE, (m) => { const key = `${m[1]}.${m[2]}`, id = SEC[key]; if (!id) return null; return anchor(m[0], VB + id, `Vancouver Building By-law online · Division B Section ${key} ${SEC_NAME[key] || ''} (2019 edition at BC Publications; Part 3 text matches 2025 except where marked Vancouver)`); });
    if (ctx.parking || /Parking By-law|Design Supplement/.test(src)) take(PK_RE, (m) => { const n = Number(m[1]); if (!PK_NAME[n]) return null; return anchor(m[0], pkUrl(n), `Parking By-law 6059 · Section ${n} ${PK_NAME[n]} (PDF)`); });
    hits.sort((p, q) => p.a - q.a); let out = '', pos = 0;
    for (const h of hits) { out += esc(src.slice(pos, h.a)) + h.link; pos = h.b; }
    out += esc(src.slice(pos)); void slots; return out;
  }
  return { html, SEC, VB, ODP, pkUrl };
})();
