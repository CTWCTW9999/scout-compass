import {categoriesFor, normalizeOsm,normalizeAmap,normalizeNearby,wgsToGcj} from './core.js';
export class SearchError extends Error {constructor(code,message){super(message);this.code=code;}}
export async function requestJson(url,{body,signal,timeout=18000,fetcher=fetch}={}){
  const controller=new AbortController();
  const abort=()=>controller.abort();if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const response=await fetcher(url,{method:body?'POST':'GET',body,signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer',...(body?{headers:{'Content-Type':'application/x-www-form-urlencoded'}}:{})});
    if(!response.ok)throw new SearchError('http',`地图服务返回 HTTP ${response.status}`);
    let json;try{json=await response.json();}catch{throw new SearchError('format','地图服务未返回有效数据');}
    return json;
  }catch(e){
    if(signal?.aborted)throw new SearchError('cancel','查询已取消');
    if(e.name==='AbortError')throw new SearchError('timeout','地图服务响应超时');
    if(e instanceof SearchError)throw e;
    throw new SearchError('network','无法连接地图服务，请检查网络或更换数据来源');
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export function overpassQuery(origin,scope){
  const queries=categoriesFor(scope).filter(c=>c.osm).map(c=>`nwr(around:1000,${origin.lat.toFixed(6)},${origin.lng.toFixed(6)})${c.osm};`).join('');
  return `[out:json][timeout:12];(${queries});out center tags;`;
}
export async function searchOsm(origin,settings,{signal,onProgress=()=>{},fetcher=fetch}={}){
  const endpoints=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'];
  let last;
  for(let i=0;i<endpoints.length;i++){
    onProgress(i===0?'正在检索开放地图商家…':'开放地图主服务不可用，尝试备用服务…');
    try{
      const json=await requestJson(endpoints[i],{body:new URLSearchParams({data:overpassQuery(origin,settings.scope)}),signal,fetcher});
      if(json.remark)throw new SearchError('upstream','开放地图查询未完整执行，请重试');
      if(!Array.isArray(json.elements))throw new SearchError('format','开放地图缺少商家列表');
      return {stores:normalizeNearby(normalizeOsm(json.elements,settings.scope),origin),notes:['开放地图国内覆盖有限，结果仅为已收录的品类候选。没有搜到不代表附近没有门店。',...(settings.scope==='expanded'?['23 类中仅检索有对应开放地图标签的品类；完整关键词搜索需高德。']:[])],source:'OpenStreetMap / Overpass'};
    }catch(e){if(e.code==='cancel')throw e;last=e;}
  }
  throw new SearchError(last?.code||'network',`开放地图检索失败：${last?.message||'服务不可用'}。请稍后重试，或在“数据设置”接入高德 Web 服务 Key。`);
}
export async function searchAmap(origin,settings,key,{signal,onProgress=()=>{},fetcher=fetch}={}){
  if(!/^[a-fA-F0-9]{32}$/.test(key))throw new SearchError('key','请在数据设置中填写有效的高德 Web 服务 Key（32 位），再查询');
  const location=wgsToGcj(origin),cats=categoriesFor(settings.scope),results=[],notes=[],failures=[];
  let cursor=0,completed=0;
  const work=async()=>{
    while(cursor<cats.length){
      const category=cats[cursor++];let collected=[],count=0;
      try{
        for(let page=1;page<=8;page++){
          if(signal?.aborted)throw new SearchError('cancel','查询已取消');
          const params=new URLSearchParams({key,location:`${location.lng.toFixed(6)},${location.lat.toFixed(6)}`,keywords:category.keyword,radius:'1000',offset:'25',page:String(page),extensions:'base'});
          const json=await requestJson(`https://restapi.amap.com/v3/place/around?${params}`,{signal,fetcher,timeout:15000});
          if(String(json.status)!=='1'){
            const code=String(json.infocode||'');
            throw new SearchError(['10001','10003','10004','10005','10006','10007','10008','10009','10010','10012','10013','10016','10020','10021','10044'].includes(code)?'key':'amap',`高德检索未成功（错误码 ${code||'未知'}），请检查 Key 类型、授权、配额和访问限制`);
          }
          if(!Array.isArray(json.pois))throw new SearchError('format','高德未返回有效商家列表');
          count=Number(json.count)||0;collected.push(...normalizeAmap(json.pois,category));
          if(json.pois.length<25||page*25>=count)break;
          if(page===8)notes.push(`${category.name}超过单条件 200 条接口上限，未全部收录。`);
        }
        results.push(...collected);
      }catch(e){
        if(e.code==='cancel')throw e;
        failures.push({category:category.name,error:e});
        // Keep valid earlier pages, but explicitly label this category incomplete.
        results.push(...collected);
        if(e.code==='key')throw e;
      }
      completed++;onProgress(`正在检索高德商家：${completed} / ${cats.length} 类…`);
    }
  };
  const settled=await Promise.allSettled([work(),work()]);
  const fatal=settled.find(x=>x.status==='rejected');if(fatal)throw fatal.reason;
  if(failures.length===cats.length && results.length===0)throw new SearchError('network','所有品类检索均失败，请检查网络或高德访问权限');
  if(failures.length)notes.push(`以下品类检索不完整：${failures.map(f=>f.category).join('、')}。`);
  notes.unshift('高德关键词结果是门店候选；营业状态、独立经营和其他条件仍需逐店核验。');
  return {stores:normalizeNearby(results,origin),notes,source:'高德地图',partial:failures.length>0};
}
export function getFreshLocation({signal,geolocation=navigator.geolocation}={}){
  if(!geolocation)return Promise.reject(new SearchError('location','当前浏览器不支持定位，请在 iPhone Safari 打开此链接'));
  return new Promise((resolve,reject)=>{
    let finished=false;
    const done=(fn,value)=>{if(finished)return;finished=true;signal?.removeEventListener('abort',cancel);fn(value);};
    const cancel=()=>done(reject,new SearchError('cancel','查询已取消'));
    if(signal?.aborted){cancel();return;}
    signal?.addEventListener('abort',cancel,{once:true});
    geolocation.getCurrentPosition(p=>{
      const {latitude:lat,longitude:lng,accuracy}=p.coords;
      if(!Number.isFinite(lat)||!Number.isFinite(lng)||!Number.isFinite(accuracy)||accuracy<0||Math.abs(lat)>90||Math.abs(lng)>180){done(reject,new SearchError('location','定位返回无效数据，请重试'));return;}
      if(!Number.isFinite(p.timestamp)||Date.now()-p.timestamp>30000){done(reject,new SearchError('stale','定位数据已超过 30 秒，请重试以获取当前位置'));return;}
      if(accuracy>300){done(reject,new SearchError('accuracy',`当前位置误差约 ${Math.round(accuracy)} 米，无法可靠筛选 1 公里。请在设置中允许精确位置，或到室外重试`));return;}
      done(resolve,{lat,lng,accuracy,timestamp:p.timestamp});
    },e=>done(reject,new SearchError('location',e.code===1?'未获定位权限。请在 iPhone 设置 → App → Safari → 位置中允许定位，并允许此网站访问位置；随后重试':e.code===3?'定位超时。请保持页面在前台，到信号较好的位置重试':'暂时无法取得位置，请检查定位服务与网络后重试')),{enableHighAccuracy:true,maximumAge:0,timeout:18000});
  });
}
