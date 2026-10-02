const path = require('path'), assert = require('assert'), {performance} = require('perf_hooks');
global.window = global;
for (const file of ['geom.js','codes.js','plan-park.js']) require(path.join(__dirname,'../src',file));
function run(label,plate,ramps,top) {
  const cores=label==='a'?[{x:30.5,y:26,w:14,d:8},{x:3,y:51,w:3,d:6}]:[{x:20,y:14,w:12,d:10}];
  const make=()=>{
    const grid=new Geom.Grid(Geom.bboxOf(plate));cores.forEach(c=>grid.fill(c,Geom.C.CORE));
    return {grid,plate,cores,ramps,level:{z:-3.2,h:3.2,label:-1,isTop:top},codes:CODES.parking,
      need:label==='a'?{bikeA:911,bikeB:29,loadingA:3,loadingB:5,accessibleFraction:0.05,parkingLevels:3}:{bikeA:120,bikeB:6,loadingA:1,loadingB:1,accessibleFraction:0.05}};
  };
  const ctx=make(), start=performance.now(), result=PlanPark.generate(ctx), ms=performance.now()-start;
  console.log(label,JSON.stringify(result.metrics), 'time',ms.toFixed(2),'ms');
  assert.strictEqual(JSON.stringify(result),JSON.stringify(PlanPark.generate(make())),'deterministic');
  for(const r of result.rooms){
    assert(r.id && r.use==='parking' && r.parent===null);assert(Array.isArray(r.doors));
    if(r.kind==='stall') {
      assert.strictEqual(r.doors.length,0);assert.strictEqual(r.occ,0);
      assert(Geom.subtractAll([r.rect],plate).reduce((s,p)=>s+Geom.area(p),0)<1e-7);
      assert(!cores.some(c=>Geom.overlaps(r.rect,c)));
      const [i,j]=ctx.grid.toCell(...Geom.centre(r.rect));
      assert.strictEqual(ctx.grid.region[ctx.grid.idx(i,j)],result.rooms.indexOf(r));
    }
    if(['bike','loading','electrical'].includes(r.kind))assert.strictEqual(r.doors.length,1);
  }
  if(label==='a'){
    assert(result.metrics.stalls>=60);assert.strictEqual(result.metrics.unreachableStalls,0);assert(ms<30,'generation must take <30 ms');
    console.log('stalls',result.metrics.stalls,'flags',JSON.stringify(result.metrics.flags));
    for (const [n,c] of cores.entries()) for (const [side,x,y] of [
      ['N',c.x+c.w/2,c.y+c.d+Geom.CELL/2],['S',c.x+c.w/2,c.y-Geom.CELL/2],
      ['E',c.x+c.w+Geom.CELL/2,c.y+c.d/2],['W',c.x-Geom.CELL/2,c.y+c.d/2]]) {
      const inPlate=plate.some(p=>x>=p.x && x<p.x+p.w && y>=p.y && y<p.y+p.d);
      const [i,j]=ctx.grid.toCell(x,y),code=ctx.grid.inb(i,j)?ctx.grid.cells[ctx.grid.idx(i,j)]:Geom.C.VOID;
      console.log('core',n+1,'face',side,inPlate?(code===Geom.C.AISLE?'AISLE PASS':'FAIL '+code):'outside plate');
      if(inPlate)assert.strictEqual(code,Geom.C.AISLE);
    }
    const sources=[];
    for(const c of cores)for(const [x,y] of [[c.x+c.w+Geom.CELL/2,c.y+c.d/2],[c.x-Geom.CELL/2,c.y+c.d/2]]) {
      const [i,j]=ctx.grid.toCell(x,y);if(ctx.grid.inb(i,j))sources.push(ctx.grid.idx(i,j));
    }
    const travel=Geom.dijkstra(ctx.grid,sources,k=>[Geom.C.AISLE,Geom.C.RAMP].includes(ctx.grid.cells[k]));
    let unreachable=0;
    for(const r of result.rooms.filter(r=>r.kind==='stall')) {
      const [x,y,X,Y]=ctx.grid.rectCells(r.rect);let reachable=false;
      for(let i=x;i<X;i++)for(const j of [y-1,Y])if(ctx.grid.inb(i,j)&&Number.isFinite(travel[ctx.grid.idx(i,j)]))reachable=true;
      for(let j=y;j<Y;j++)for(const i of [x-1,X])if(ctx.grid.inb(i,j)&&Number.isFinite(travel[ctx.grid.idx(i,j)]))reachable=true;
      if(!reachable)unreachable++;
    }
    console.log('Dijkstra unreachable stalls',unreachable);assert.strictEqual(unreachable,0);
    assert.strictEqual(result.rooms.filter(r=>r.name==='Walkway').length,cores.length);
    assert.strictEqual(result.rooms.filter(r=>r.kind==='loading').length,8);
    assert(Math.abs(result.metrics.bikeArea-839.8)<1e-6);
    for(const r of result.rooms.filter(r=>['bike','loading','electrical'].includes(r.kind)))
      assert(!cores.some(c=>Geom.overlaps(r.rect,Geom.inset(c,-1.5))));

  }
  return result;
}
const ramp={rect:{x:50,y:0,w:6.1,d:34},dir:'N',len:34,w:6.1,zTop:0,zBottom:-3.2};
run('a',[{x:0,y:0,w:75,d:60}],[{...ramp,rect:{x:65,y:0,w:6.1,d:34}}],true);
run('b',[{x:0,y:0,w:60,d:20},{x:0,y:20,w:30,d:20}],[ramp],true);
run('c',[{x:0,y:0,w:30,d:30}],[],false);
