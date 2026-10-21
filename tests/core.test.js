import test from 'node:test';
import assert from 'node:assert/strict';
import {haversine,normalizeNearby,wgsToGcj,gcjToWgs,verification,CHECKS,DEFAULTS,normalizeOsm,mapUrl,demoStores} from '../core.js';
const now=Date.parse('2026-10-21T12:00:00+08:00');
const good=()=>({checks:Object.fromEntries(CHECKS.map(c=>[c.id,'yes'])),price:30,recharge:1000,idleDays:180,idlePercent:70,checkedAt:'2026-10-20',evidence:'店主规则、Wi-Fi实测、现行价目表及匿名汇总均已核验'});
test('1 km boundary and invalid coordinates are excluded, duplicate POI removed',()=>{
  const origin={lat:0,lng:0};const degree=1000/6371008.8*180/Math.PI;
  const list=normalizeNearby([{id:'in',name:'a',point:{lat:degree*.999,lng:0}},{id:'out',name:'b',point:{lat:degree*1.001,lng:0}},{id:'bad',point:{lat:91,lng:0}},{id:'in',name:'a',point:{lat:degree*.5,lng:0}}],origin);
  assert.deepEqual(list.map(x=>x.id),['in']);assert.ok(Math.abs(list[0].distance-999)<.001);
});
test('GCJ conversion round trip prevents map/search offset',()=>{
  const wgs={lat:30.2741,lng:120.1551};const gcj=wgsToGcj(wgs);
  assert.ok(haversine(wgs,gcj)>300);assert.ok(haversine(wgs,gcjToWgs(gcj))<.01);
  assert.deepEqual(wgsToGcj({lat:51,lng:0}),{lat:51,lng:0});
});
test('missing/unknown/stale/future evidence does not pass',()=>{
  assert.equal(verification(null,DEFAULTS,now).state,'candidate');
  const r=good();r.checks.sharing='unknown';assert.equal(verification(r,DEFAULTS,now).state,'candidate');
  for(const x of [{...good(),checkedAt:'2026-06-01'},{...good(),evidence:''},{...good(),checkedAt:'2026-11-01'}])assert.equal(verification(x,DEFAULTS,now).state,'candidate');
});
test('full evidence passes; 50 yuan, next-confirmation sharing, insufficient recharge/idle fail',()=>{
  assert.equal(verification(good(),DEFAULTS,now).state,'verified');
  for(const patch of [{price:50},{recharge:499},{idleDays:89},{idlePercent:49},{checks:{...good().checks,sharing:'no'}}])assert.equal(verification({...good(),...patch},DEFAULTS,now).state,'excluded');
  assert.equal(verification({...good(),idlePercent:null},DEFAULTS,now).state,'candidate');
  assert.equal(verification(good(),{...DEFAULTS,rechargeMin:1500},now).state,'excluded');
});
test('OSM Wi-Fi is only a clue and never produces verified evidence',()=>{
  const [s]=normalizeOsm([{type:'node',id:123,lat:30,lon:120,tags:{shop:'hairdresser',name:'店','internet_access':'wlan'}}],'priority');
  assert.match(s.notes[0],/待|仍需/);assert.equal(verification(s.record).state,'candidate');
  assert.equal(normalizeOsm([{type:'node',id:2,lat:30,lon:120,tags:{shop:'supermarket'}}],'priority').length,0);
});
test('demo navigation cannot look real, map URLs encode arbitrary names',()=>{
  for(const s of demoStores().stores)assert.equal(mapUrl(s),null);
  const url=mapUrl({mapPoint:{lat:30,lng:120},name:'店&x=<script>'});assert.match(url,/coordinate=gaode/);assert.ok(!url.includes('<script>'));assert.ok(url.includes('%26'));
});
