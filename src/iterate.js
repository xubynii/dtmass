window.Iterate = (function () {
  'use strict';
  let app=null, root=null, storage={}, loaded=false, a=null, b='current';
  const esc=v=>String(v==null?'—':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clone=v=>JSON.parse(JSON.stringify(v));
  const call=(key,fallback,...args)=>app&&typeof app[key]==='function'?app[key](...args):fallback;
  const siteKey=()=>call('project',{}).site?.addr||'custom';
  function read(){if(loaded)return;loaded=true;try{const s=JSON.parse(localStorage.getItem('dms.variants.v1')||'{}');if(s&&typeof s==='object'&&!Array.isArray(s))storage=s;}catch(e){}}
  function persist(){try{localStorage.setItem('dms.variants.v1',JSON.stringify(storage));}catch(e){call('toast',null,'Storage unavailable; iterations remain available this session.');}}
  function list(){read();return clone(Array.isArray(storage[siteKey()])?storage[siteKey()]:[]);}
  function current(){const p=call('project',null);return p?{id:'current',name:'Current design',site:clone(p.site),blocks:clone(p.blocks),ramps:clone(p.ramps),metrics:clone(call('metrics',{})),rows:clone(call('rows',[]))}:null;}
  function save(name){const v=current();if(!v)return null;v.id=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);v.name=String(name||'Untitled iteration').trim()||'Untitled iteration';v.time=new Date().toISOString();try{const png=call('snapshot',null,'3d',440,300);v.thumbnail=typeof png==='string'&&png.startsWith('data:image/png')?png:null;}catch(e){v.thumbnail=null;} read();const key=siteKey();if(!Array.isArray(storage[key]))storage[key]=[];storage[key].push(v);persist();render();return clone(v);}
  const metricDefs=[['fsr','FSR',0],['height','Height (m)',0],['storeys','Storeys',0],['plate','Plate (m²)',0],['homes','Homes',1],['stalls','Stalls',0],['fail','Fail',-1],['review','Review',-1],['pass','Pass',1]];
  const fmt=v=>typeof v==='number'&&Number.isFinite(v)?Number(v.toFixed(2)).toString():v==null?'—':String(v);
  function compareHTML(A,B){if(!A||!B)return '<p>Choose two designs to compare.</p>';
    let html=`<h3>${esc(A.name)} → ${esc(B.name)}</h3><table style="width:100%"><thead><tr><th>Metric</th><th>A</th><th>B</th><th>Δ B−A</th></tr></thead><tbody>${metricDefs.map(([key,label,direction])=>{const x=A.metrics?.[key],y=B.metrics?.[key],delta=typeof x==='number'&&typeof y==='number'?y-x:null,color=delta&&direction?(delta*direction>0?'var(--pass)':'var(--fail)'):'inherit';return `<tr><td>${label}</td><td>${esc(fmt(x))}</td><td>${esc(fmt(y))}</td><td style="color:${color}">${delta==null?'—':(delta>0?'+':'')+fmt(delta)}</td></tr>`;}).join('')}</tbody></table>`;
    const left=new Map((A.rows||[]).map(r=>[r.id,r])),right=new Map((B.rows||[]).map(r=>[r.id,r]));
    const groups={'Fixed in B':[],'Newly failing':[],'Still failing':[],'No longer applies':[]};
    new Set([...left.keys(),...right.keys()]).forEach(id=>{const x=left.get(id),y=right.get(id);let group=!y?'No longer applies':y.verdict==='fail'?(x?.verdict==='fail'?'Still failing':'Newly failing'):x?.verdict==='fail'?'Fixed in B':null;if(group)groups[group].push([x,y]);});
    for(const [label,rows] of Object.entries(groups))html+=`<h4>${label} (${rows.length})</h4>${rows.length?`<table style="width:100%"><thead><tr><th>Check</th><th>A</th><th>B</th></tr></thead><tbody>${rows.map(([x,y])=>`<tr><td>${esc((y||x).title)}</td><td>${x?esc(x.verdict)+' · '+esc(x.value):'Not applicable'}</td><td>${y?esc(y.verdict)+' · '+esc(y.value):'Not applicable'}</td></tr>`).join('')}</tbody></table>`:'<p>None.</p>'}`;
    return html;
  }
  function side(id){return id==='current'?current():list().find(v=>v.id===id);}
  function render(){if(!root)return;const variants=list(),cur=current();if(!variants.some(v=>v.id===a))a=variants[0]?.id||'current';if(b!=='current'&&!variants.some(v=>v.id===b))b='current';const options=variants.concat(cur?[cur]:[]).map(v=>`<option value="${esc(v.id)}">${esc(v.name)}</option>`).join('');
    const chips=v=>metricDefs.filter(([k])=>['fsr','height','storeys','homes','fail','review','pass'].includes(k)).map(([k,label])=>`<span style="color:${['fail','review','pass'].includes(k)?'var(--'+k+')':'inherit'}">${label}: ${esc(fmt(v.metrics?.[k]))}</span>`).join(' · ');
    root.innerHTML=`<h2>Save an iteration</h2><label>Name<input data-name placeholder="Design name"></label><button data-save ${cur?'':'disabled'}>Save current design</button>${variants.map(v=>`<article class="block">${v.thumbnail?`<img src="${esc(v.thumbnail)}" alt="${esc(v.name)} 3D thumbnail" style="width:220px;max-width:100%">`:''}<h3>${esc(v.name)}</h3><p>${esc(v.time)}</p><p>${chips(v)}</p>${['Load','Compare','Rename','Delete'].map(action=>`<button data-action="${action}" data-id="${esc(v.id)}">${action}</button>`).join(' ')}</article>`).join('')}${cur?`<article class="block" style="border-style:dashed"><b>Current design</b><p>${chips(cur)}</p></article>`:''}<h2>A/B comparison</h2><div class="row"><label>A<select data-a>${options}</select></label><label>B<select data-b>${options}</select></label></div><div style="overflow:auto">${compareHTML(side(a),side(b))}</div>`;
    root.querySelector('[data-save]').onclick=()=>save(root.querySelector('[data-name]').value);
    ['a','b'].forEach(key=>{const select=root.querySelector('[data-'+key+']');select.value=key==='a'?a:b;select.onchange=()=>{if(key==='a')a=select.value;else b=select.value;render();};});
    root.querySelectorAll('[data-action]').forEach(btn=>btn.onclick=()=>{const id=btn.dataset.id,v=variants.find(v=>v.id===id);if(!v)return;
      if(btn.dataset.action==='Load'){const p=call('project',{});call('replaceProject',null,{...clone(p),site:clone(v.site),blocks:clone(v.blocks),ramps:clone(v.ramps)},'Loaded '+v.name);}
      if(btn.dataset.action==='Compare'){a=id;b='current';render();}
      if(btn.dataset.action==='Rename'){const name=window.prompt('Iteration name',v.name);if(name&&name.trim()){storage[siteKey()].find(v=>v.id===id).name=name.trim();persist();render();}}
      if(btn.dataset.action==='Delete'){storage[siteKey()]=storage[siteKey()].filter(v=>v.id!==id);persist();render();}
    });
  }
  function mount(el,App){app=App;root=el;render();if(typeof App.on==='function')App.on('change',render);}
  return {mount,list,save,current,compareHTML};
})();
