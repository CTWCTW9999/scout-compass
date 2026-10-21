import test from 'node:test';
import assert from 'node:assert/strict';
import {searchOsm,searchAmap,getFreshLocation,requestJson} from '../data.js';
import {searchAmapJs,searchPage} from '../amap-js.js';
import {DEFAULTS} from '../core.js';
const origin={lat:30.2741,lng:120.1551},key='a'.repeat(32);
const response=data=>({ok:true,json:async()=>data});
test('upstream errors are never converted to successful empty results',async()=>{
  await assert.rejects(searchOsm(origin,DEFAULTS,{fetcher:async()=>{throw Error('offline');}}),/开放地图检索失败/);
  await assert.rejects(searchOsm(origin,DEFAULTS,{fetcher:async()=>response({remark:'timeout',elements:[]})}),/未完整/);
  const result=await searchOsm(origin,DEFAULTS,{fetcher:async()=>response({elements:[]})});assert.deepEqual(result.stores,[]);
});
test('wrong-platform REST key stops search; does not report zero stores',async()=>{
  await assert.rejects(searchAmap(origin,DEFAULTS,key,{fetcher:async()=>response({status:'0',infocode:'10009'})}),/10009/);
});
test('REST scan paginates, deduplicates across categories, flags one failed category',async()=>{
  const pages=[];
  const result=await searchAmap(origin,DEFAULTS,key,{fetcher:async url=>{
    const p=new URL(url).searchParams;pages.push([p.get('keywords'),p.get('page')]);
    if(p.get('keywords')==='洗鞋')throw Error('network');
    const pois=Array.from({length:p.get('page')==='1'?25:1},(_,i)=>({id:String(i),name:'测试',location:'120.1600,30.2720'}));
    return response({status:'1',count:'26',pois});
  }});
  assert.ok(pages.some(x=>x[1]==='2'));assert.equal(result.partial,true);assert.ok(result.notes.some(x=>x.includes('洗鞋')));
  assert.equal(new Set(result.stores.map(x=>x.id)).size,result.stores.length);
});
test('fresh GPS requested with maximumAge=0; denied or inaccurate locations stop',async()=>{
  let observed;
  const geolocation={getCurrentPosition(ok,fail,options){observed=options;ok({coords:{latitude:30,longitude:120,accuracy:20},timestamp:Date.now()});}};
  const point=await getFreshLocation({geolocation});assert.equal(observed.maximumAge,0);assert.equal(point.accuracy,20);
  await assert.rejects(getFreshLocation({geolocation:{getCurrentPosition(ok){ok({coords:{latitude:30,longitude:120,accuracy:900},timestamp:Date.now()});}}}),/误差/);
  await assert.rejects(getFreshLocation({geolocation:{getCurrentPosition(ok,fail){fail({code:1});}}}),/权限/);
  await assert.rejects(getFreshLocation({geolocation:{getCurrentPosition(ok){ok({coords:{latitude:30,longitude:120,accuracy:20},timestamp:Date.now()-90000});}}}),/超过 30 秒/);
});
test('cancelled GPS ignores a late success response',async()=>{
  const controller=new AbortController();let late;
  const promise=getFreshLocation({signal:controller.signal,geolocation:{getCurrentPosition(ok){late=ok;}}});controller.abort();
  await assert.rejects(promise,/取消/);late({coords:{latitude:30,longitude:120,accuracy:20},timestamp:Date.now()});
});
test('request timeout and HTTP error preserve failure state',async()=>{
  await assert.rejects(requestJson('https://example.com',{fetcher:async()=>({ok:false,status:429})}),/429/);
});
test('JS API searches 1 km, reads LngLat POIs, and no_data is a valid empty result',async()=>{
  let radius;
  class PlaceSearch {searchNearBy(word,point,r,cb){radius=r;cb('complete',{poiList:{count:1,pois:[{id:'same',name:'测试店',location:{lng:120.1600,lat:30.2720},address:'测试地址'}]}});}}
  const result=await searchAmapJs(origin,DEFAULTS,key,key,{sdkLoader:async()=>({PlaceSearch})});assert.equal(radius,1000);assert.equal(result.stores.length,1);
  class EmptySearch{searchNearBy(word,point,r,cb){cb('no_data',{});}}
  assert.equal((await searchPage({PlaceSearch:EmptySearch},{keyword:'理发'},origin,1)).count,0);
});
