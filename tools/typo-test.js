'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
global.window=global;
for(const file of ['geom.js','model.js','codes.js','typo.js'])vm.runInThisContext(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'),{filename:file});
const site=Model.demoProject().site;
function check(name,result,height,storeys){assert(result.blocks.length);for(const block of result.blocks){assert(Model.rectInside(block,{x:0,y:0,w:site.w,d:site.d}),`${name}: ${block.name} outside site`);for(const k of ['x','y','w','d'])assert(Math.abs(block[k]*4-Math.round(block[k]*4))<1e-7,`${name}: ${k} off grid`);}assert(result.blocks.some(b=>b.use==='core'),name+': missing core');assert(result.blocks.some(b=>b.use==='parking'&&b.z0<0&&Model.blockTop(b)<=1e-7),name+': missing below-grade parking');assert(result.ramps.length,name+': missing ramp');const top=Math.max(...result.blocks.map(Model.blockTop));if(height!=null)assert(Math.abs(top-height)<=2,`${name}: ${top} vs ${height}`);if(storeys!=null)assert.equal(Model.totals({site,...result}).storeysAbove,storeys,name+': storeys');console.log(`${name}: OK · ${result.blocks.length} blocks · ${result.ramps.length} ramp · ${top.toFixed(2)} m`);}
for(const type of Typo.TYPES)check(type.key,type.build(site,Object.fromEntries(type.params.map(p=>[p.key,p.def]))));
for(const study of Typo.CASES)check(study.name,study.build(site),study.height,study.storeys);
for(const frontage of ['N','S','E','W'])for(const type of Typo.TYPES){const s={...site,frontage,lane:{N:'S',S:'N',E:'W',W:'E'}[frontage]},r=type.build(s,{});assert(r.blocks.every(b=>Model.rectInside(b,{x:0,y:0,w:s.w,d:s.d})));const fitted=Typo.fitToHeight(type.key,{},s,90);assert(Math.max(...type.build(s,fitted).blocks.map(Model.blockTop))<=90+1e-7);}
console.log('PASS: 7 typologies, 12 case studies, four frontages and height fitting.');
