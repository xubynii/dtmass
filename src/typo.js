/* Parametric starts. Coordinates are local metres; no current-project mutation. */
window.Typo = (function () {
  'use strict';
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const param = (key,label,def,min,max,step=1) => ({key,label,def,min,max,step});
  const pod = param('pod','Office podium storeys above retail',3,0,8), tw = param('tw','Tower storeys',25,1,80), plate = param('plate','Tower plate (m²)',650,300,2500,10), fh = param('fh','Tower floor-to-floor (m)',3,2.6,5,.1);
  const specs = [
    ['point','Point tower','A compact residential tower over an office podium.',[pod,tw,plate,fh]],
    ['twin','Twin towers','Two towers on a shared podium; plates shrink to preserve the gap.',[pod,{...tw,def:22},{...plate,def:600},param('sep','Tower gap (m)',24.4,0,60,.1),fh]],
    ['slab','Slab','A double-loaded bar; zero length uses the full site width.',[param('n','Upper storeys',20,1,60),param('dep','Bar depth (m)',18,12,30,.25),param('len','Length (0 = full width)',0,0,200,.25),fh]],
    ['court','Courtyard','A ring on sites at least 45 m each way; a U or bar on smaller sites.',[param('n','Upper storeys',8,1,20),param('dep','Bar depth (m)',16,10,24,.25),fh]],
    ['office','Office tower','Large office plates over retail and one office podium floor.',[param('n','Tower storeys',25,1,60),{...plate,def:1800,min:600,max:3500,step:50},{...fh,def:4}]],
    ['wall','Street wall','Retail and full-site upper floors.',[param('n','Upper storeys',5,1,60),{key:'use',label:'Upper use',def:'residential',min:0,max:0,step:0},fh]],
    ['step','Stepped tower','Three stacked plates: 1.4×, 1× and 0.6×.',[{...pod,def:2},param('n','Tower storeys',30,3,80),{...plate,def:700},fh]]
  ];
  /* parameters every typology shares; their defaults reproduce the original fixed values */
  const COMMON = [param('park','Parking levels below grade',2,0,6), param('retailH','Retail storey height (m)',5,3.5,7,.1), param('retailD','Retail depth from the street (m)',18,6,40,.5),
    param('along','Tower position along the frontage (−1 to 1)',0,-1,1,.05), param('depthPos','Tower position, street (−1) to lane (1)',0,-1,1,.05), param('aspect','Plate proportion, frontage ÷ depth',1,.4,2.5,.05)];
  const TOWER_KEYS = ['point','twin','office','step','slab'];
  for (const sp of specs) { const extra = COMMON.filter(c => TOWER_KEYS.includes(sp[0]) || ['park','retailH','retailD'].includes(c.key)).map(c => ({...c, def: c.key === 'park' && sp[0] === 'office' ? 4 : c.def, group: 'base'})); if (['point','twin','step'].includes(sp[0])) extra.push({key:'podUse',label:'Podium program',def:'office',min:0,max:0,step:0,group:'base',options:[['office','Office'],['residential','Residential'],['amenity','Amenity'],['retail','Retail']]}); sp[3] = sp[3].concat(extra); }
  const defaults = key => Object.fromEntries(TYPES.find(t=>t.key===key).params.map(p=>[p.key,p.def]));
  function build(key,site,input) {
    const p = {...defaults(key),...input}, W = Math.floor((site.w-1)*4)/4, D = Math.floor((site.d-1)*4)/4;
    if (!(W>0 && D>0)) throw new Error('Site must exceed 1 m in each direction.');
    const snap = v=>Math.round(v*4)/4, down = v=>Math.floor(v*4)/4;
    const rect = (x,y,w,d) => { w=Math.max(.25,Math.min(W,down(w))); d=Math.max(.25,Math.min(D,down(d))); return {x:Math.max(.5,Math.min(.5+W-w,snap(x))),y:Math.max(.5,Math.min(.5+D-d,snap(y))),w,d}; };
    const whole=rect(.5,.5,W,D), centred=(w,d)=>rect(.5+(W-w)/2,.5+(D-d)/2,w,d);
    const front0=site.frontage || 'S', alongX='NS'.includes(front0), streetMin=front0==='S'||front0==='W';
    /* a plate of the given area and proportion, placed along the frontage and in depth by the shared parameters */
    const place=(w,d)=>{ const a=p.along||0, t=p.depthPos||0, fx=alongX?a:(streetMin?t:-t), fy=alongX?(streetMin?t:-t):a; return rect(.5+(W-w)/2*(1+fx),.5+(D-d)/2*(1+fy),w,d); };
    const footprint=(area,maxW=W)=>{ const k=alongX?(p.aspect||1):1/(p.aspect||1); let w=Math.min(maxW,W,Math.sqrt(area*k)); let d=Math.min(D,area/w); if(d>=D-1e-6) w=Math.min(W,area/D); return place(w,d); };
    const blocks=[], ramps=[], add=(use,name,r,z0,floors,f2f)=>{ const b=Model.block({...r,use,name,z0,floors:Math.max(1,Math.floor(floors)),f2f}); blocks.push(b); return b; };
    const nPark=Math.max(0,Math.round(p.park??(key==='office'?4:2))), base=-3.2*nPark;
    if(nPark) add('parking','Parking P1–P'+nPark,whole,base,nPark,3.2);
    let retail={...whole}; const front=site.frontage || 'S';
    const rD=Math.max(4,p.retailD??18), rH=p.retailH??5;
    if ('NS'.includes(front)) {retail.d=Math.min(rD,D); if(front==='N') retail.y=.5+D-retail.d;}
    else {retail.w=Math.min(rD,W); if(front==='E') retail.x=.5+W-retail.w;}
    add('retail','Street retail',retail,0,1,rH);
    let z=rH, coreRect, top;
    const podiumN=key==='office'?1:['point','twin','step'].includes(key)?Math.max(0,Math.floor(p.pod)):0;
    const pu=p.podUse||'office'; if(podiumN) {add(pu,(Model.USE_LABEL[pu]||'Office')+' podium',whole,z,podiumN,Model.USE_F2F[pu]||3.9); z+=podiumN*(Model.USE_F2F[pu]||3.9);}
    const upper=(r,n,name,use='residential',at=z)=>add(use,name,r,at,n,p.fh);
    if(key==='point'||key==='office') {coreRect=footprint(p.plate,key==='point'?32:W); upper(coreRect,key==='point'?p.tw:p.n,'Tower',key==='office'?'office':'residential');}
    if(key==='twin') {const gap=Math.min(Math.max(0,p.sep),Math.max(0,W-14)), w=Math.min(32,Math.sqrt(p.plate),(W-gap)/2), d=Math.min(D,p.plate/w); coreRect=rect(.5,.5+(D-d)/2,w,d); upper(coreRect,p.tw,'West tower'); upper(rect(.5+W-w,coreRect.y,w,d),p.tw,'East tower');}
    if(key==='slab') {coreRect=place(p.len>0?Math.min(W,p.len):W,Math.min(D,p.dep)); upper(coreRect,p.n,'Slab');}
    if(key==='wall') {coreRect=whole; upper(whole,p.n,'Upper floors',p.use==='office'?'office':'residential');}
    if(key==='court') {
      const b=down(Math.min(p.dep,W/3,D/3)); coreRect=rect(.5,.5,W,b); upper(coreRect,p.n,'South bar');
      if(site.d>=45) {upper(rect(.5,.5+D-b,W,b),p.n,'North bar'); upper(rect(.5,.5+b,b,D-2*b),p.n,'West bar'); if(site.w>=45) upper(rect(.5+W-b,.5+b,b,D-2*b),p.n,'East bar');}
    }
    if(key==='step') {const n=Math.max(3,Math.floor(p.n)), counts=[Math.floor(n/3),Math.floor(n/3),n-2*Math.floor(n/3)]; [1.4,1,.6].forEach((factor,i)=>{const r=footprint(p.plate*factor,32); const b=upper(r,counts[i],['Lower tower','Middle tower','Upper tower'][i],'residential',z); z=Model.blockTop(b); coreRect=r;});}
    top=Math.max(...blocks.filter(b=>b.use!=='parking').map(Model.blockTop));
    const cw=Math.min(7,coreRect.w), cd=Math.min(12,coreRect.d);
    add('core','Auto core',rect(coreRect.x+(coreRect.w-cw)/2,coreRect.y+(coreRect.d-cd)/2,cw,cd),base,1,top-base);
    if(!nPark) return {blocks,ramps};
    const lane=['N','S','E','W'].includes(site.lane)?site.lane:({S:'N',N:'S',E:'W',W:'E'}[front]);
    const vertical='NS'.includes(lane), width=Math.min(6.1,vertical?W:D), len=Math.min(-base/.125+8,vertical?D:W);
    ramps.push(Model.ramp({x:lane==='E'?.5+W-len:lane==='N'?.5+W-width:.5,y:lane==='N'?.5+D-len:lane==='E'?.5+D-width:.5,w:width,len,dir:{N:'S',S:'N',E:'W',W:'E'}[lane],zTop:0,zBottom:base}));
    return {blocks,ramps};
  }
  const TYPES=specs.map(([key,name,blurb,params])=>({key,name,blurb,params,build:(site,p)=>build(key,site,p)}));
  function fitToHeight(key,params,site,maxH) {
    const p={...defaults(key),...params}, count=['point','twin'].includes(key)?'tw':'n', min=key==='step'?3:1;
    if(!Number.isFinite(maxH)) return p;
    p[count]=min;
    if(Math.max(...build(key,site,p).blocks.filter(b=>b.use!=='core').map(Model.blockTop))>maxH) return p;
    while(p[count]<200) {const trial={...p,[count]:p[count]+1}; if(Math.max(...build(key,site,trial).blocks.map(Model.blockTop))>maxH+1e-8) break; p[count]++;}
    return p;
  }
  const caseData = [
    ['shangrila','Living Shangri-La',2009,200.9,62,'1128 W Georgia St','point','James K. M. Cheng Architects',770,'Hotel floors 1–15; 307 homes above.','2-storey podium; 20 × 38 m plate (770 m², 2009 LiDAR); 3.4 m hotel and 3.05 m residential floors.','Living_Shangri-La'],
    ['paradox','Paradox Hotel',2016,187.8,60,'1151 W Georgia St','point','Arthur Erickson / MCM Partnership',672,'147 hotel rooms; 217 homes; 45° twist.','2-storey base; 24 × 28 m plate; 15 hotel floors at 3.4 m, 43 residential at 2.95 m; twist omitted.','Paradox_Hotel_Vancouver'],
    ['jameson','Jameson House',2011,121,37,'838 W Hastings St','point','Foster + Partners',720,'37 storeys; 8 office and 26 residential; retained Art Deco façades.','Height not published in sources read: approximately 121 m; full-lot office plate; residential 30 × 24 m.',''],
    ['mnp','MNP Tower',2014,143,35,'1021 W Hastings St','office','Kohn Pedersen Fox',700,'35 storeys and 5 below grade; office.','700 m² (20 × 35 m); 4.1 m floors; no retail base in original; centred rather than west end.','MNP_Tower_(Vancouver)'],
    ['harbour','Harbour Centre',1977,139.6,28,'555 W Hastings St','office','WZMH Architects',1230,'139.6 m roof; 177.1 m with lookout; 28 office floors.','4-storey podium at 5.5 m; 35 × 35 m plate (1230 m², 2009 LiDAR); 4.2 m office floors.','Harbour_Centre'],
    ['bentall5','Bentall 5',2007,140,35,'550 Burrard St','office','Musson Cattell Mackey (unverified)',2026,'35 storeys; phases 2002 and 2007; office.','45 × 45 m plate (2026 m², 2009 LiDAR); 6 m lobby, 3.95 m floors; architect unverified.','Bentall_5'],
    ['parkplace','Park Place',1984,140,35,'666 Burrard St','office','Musson Cattell Mackey (unverified)',1567,'35 storeys; office and retail.','40 × 39 m plate (1567 m², 2009 LiDAR); 10 m setback; 4 m floors; architect unverified.','Park_Place_(Vancouver)'],
    ['8x','8X on the Park',2021,107,35,'1111 Richards St','point','GBL Architects (unverified)',600,'35 storeys; 191 homes.','Height not published in sources read: approximately 107 m; 3-storey podium plus 32 × 3 m; 600 m² plate; architect unverified.',''],
    ['vhouse','Vancouver House',2020,150.3,49,'1480 Howe St','step','BIG',600,'Homes and retail; outside DD (CD-1).','2-storey base; 14 × 30, 20 × 30, 26 × 30 m plates over 15 + 16 + 16 floors at 3 m; shrinking step proxy reverses the actual expanding form.','Vancouver_House'],
    ['wallcentre','One Wall Centre',2001,149.8,48,'938 Nelson St','point','Perkins and Will',861,'149.8 m roof; hotel floors 1–27; homes 31–48; outside DD.','24 × 36 m ellipse proxy (861 m², 2009 LiDAR); 27 × 3.1 m + 21 × 3.15 m.','One_Wall_Centre'],
    ['electra','Electra',1957,89,21,'989 Nelson St','slab','Thompson Berwick Pratt',1478,'BC Electric Building; converted 1995; outside DD.','20 × 74 m slab (1478 m², 2009 LiDAR); 4.2 m floors; 2-storey street wing 14 m deep.',''],
    ['butterfly','The Butterfly',2026,169.5,57,'969 Burrard St','point','Revery Architecture',780,'44,407 m² homes; 4,273 m² social housing; church 7,432 m²; outside DD.','3-storey church podium at 6 m; 26 × 30 m plate; 54 × 2.8 m; 6-storey social housing bar. Year is not stated in the supplied typologies document.','']
  ];
  const extraSources={jameson:[['Bosa Properties','https://bosaproperties.com/residential-portfolio/jameson-house']], '8x':[['Project site','https://www.8xonthepark.com/'],['REW','https://www.rew.ca/buildings/9727/8x-on-the-park-vancouver-bc']],electra:[['Historic Places','https://www.historicplaces.ca/en/rep-reg/place-lieu.aspx?id=8779'],['REW','https://www.rew.ca/buildings/8192/electra-vancouver-bc']],butterfly:[['Westbank','https://westbankcorp.com/body-of-work/the-butterfly'],['Canadian Architect','https://www.canadianarchitect.com/revery-unveils-design-of-the-butterfly/']]};
  const CASES=caseData.map(([id,name,year,height,storeys,address,type,architect,area,fact,assumption,wiki])=>({id,name,year:id==='butterfly'?null:year,height,storeys,address,type,architect,
    facts:[...(id==='jameson'||id==='8x'?[]:[`Height ${height} m.`]),`${storeys} storeys${id==='harbour'?' (office floors in source)':''}.`,fact],assumed:[assumption,'Axis-aligned typology proxy on the chosen site; mandatory retail, parking and core; above-grade floor-to-floor normalized to height / storeys. Hotel floors represented as residential. Sources read 29 Sep 2026.'],
    sources:(extraSources[id]||[['Wikipedia',`https://en.wikipedia.org/wiki/${wiki}`]]).map(([title,url])=>({title,url})),
    build(site) {const p={...defaults(type),plate:area,pod:0,tw:storeys-1,n:type==='office'?storeys-2:storeys-1,dep:20,len:74}; const result=build(type,site,p), f=height/storeys;
      result.blocks.forEach(b=>{if(b.use==='parking'||b.use==='core')return; b.z0=b.z0===0?0:b.z0===5?f:type==='office'?2*f:(b.z0-5)/p.fh*f+f; b.f2f=f;});
      result.blocks.filter(b=>b.use==='core').forEach(b=>b.f2f=height-b.z0); return result;
    }
  }));
  function mount(el,App) {
    let selection='point', mode='type', values=defaults(selection);
    const project=()=>typeof App.project==='function'?App.project():null;
    function render() {const t=TYPES.find(t=>t.key===selection), c=CASES.find(c=>c.id===selection);
      el.innerHTML=`<h2>Ways to start</h2><button data-scratch>Start from scratch</button><h2>Typologies</h2>${TYPES.map(x=>`<button data-type="${x.key}" class="${mode==='type'&&selection===x.key?'on':''}">${esc(x.name)}</button>`).join(' ')}${mode==='type'?`<div class="block"><b>${esc(t.name)}</b><p>${esc(t.blurb)}</p>${t.params.map(p=>p.key==='use'?`<label>Upper use<select data-param="use"><option value="residential">Residential</option><option value="office" ${values.use==='office'?'selected':''}>Office</option></select></label>`:`<label>${esc(p.label)} <output>${values[p.key]}</output><input data-param="${p.key}" type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${values[p.key]}"></label>`).join('')}<button data-fit>Fit to height limit</button></div>`:''}<h2>Case studies</h2>${CASES.map(x=>`<details class="block" ${mode==='case'&&selection===x.id?'open':''}><summary>${esc(x.name)} · ${x.height} m · ${x.storeys} storeys</summary><p>${esc(x.address)} · ${esc(x.architect)}${x.year?' · '+x.year:''}</p><b>Stated</b><ul>${x.facts.map(f=>`<li>${esc(f)}</li>`).join('')}</ul><b>Assumed</b><ul>${x.assumed.map(f=>`<li>${esc(f)}</li>`).join('')}</ul>${x.sources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join(' · ')}<p><button data-case="${x.id}">Choose ${esc(x.name)}</button></p></details>`).join('')}<div class="block" style="background:var(--panel2)"><p>Replaces ${project()?.blocks.length||0} blocks on this site · Ctrl+Z brings them back</p><button class="primary" data-confirm ${!project()||typeof App.replaceProject!=='function'?'disabled':''}>Confirm ${mode==='scratch'?'empty site':esc(mode==='case'?c.name:t.name)}</button></div>`;
      el.querySelector('[data-scratch]').onclick=()=>{mode='scratch';render();};
      el.querySelectorAll('[data-type]').forEach(b=>b.onclick=()=>{selection=b.dataset.type;mode='type';values=defaults(selection);render();});
      el.querySelectorAll('[data-case]').forEach(b=>b.onclick=()=>{selection=b.dataset.case;mode='case';render();});
      el.querySelectorAll('[data-param]').forEach(i=>i.oninput=()=>{values[i.dataset.param]=i.tagName==='SELECT'?i.value:Number(i.value);if(i.previousElementSibling)i.previousElementSibling.textContent=i.value;});
      const fit=el.querySelector('[data-fit]'); if(fit) fit.onclick=()=>{const m=typeof App.metrics==='function'?App.metrics():{}, H=m.heightMax; if(Number.isFinite(H)){values=fitToHeight(selection,values,project().site,H);render();}else if(typeof App.toast==='function')App.toast('No numeric height limit available.');};
      el.querySelector('[data-confirm]').onclick=()=>{const p=project();if(!p||typeof App.replaceProject!=='function')return;const result=mode==='scratch'?{blocks:[],ramps:[]}:mode==='case'?c.build(p.site):t.build(p.site,values);App.replaceProject({...Model.clone(p),...result,site:Model.clone(p.site)},mode==='scratch'?'Empty site':mode==='case'?c.name:t.name);};
    }
    render();if(typeof App.on==='function')App.on('change',render);
  }
  return {TYPES,CASES,fitToHeight,mount};
})();
