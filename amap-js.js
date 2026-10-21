import {categoriesFor,normalizeAmap,normalizeNearby,wgsToGcj} from './core.js';
import {SearchError} from './data.js';
let sdkPromise=null,sdkCredentials='';
export function loadAmap(key,code){
  if(!/^[a-f0-9]{32}$/i.test(key)||!/^[a-f0-9]{32}$/i.test(code))return Promise.reject(new SearchError('key','请填写有效的 JavaScript Key 和安全密钥，或使用私人入口'));
  const identity=key+code;
  if(sdkPromise){if(sdkCredentials!==identity)return Promise.reject(new SearchError('key','地图凭证已改变，请刷新页面后使用新凭证'));return sdkPromise;}
  sdkCredentials=identity;
  sdkPromise=new Promise((resolve,reject)=>{
    window._AMapSecurityConfig={securityJsCode:code};
    const script=document.createElement('script');script.charset='utf-8';script.async=true;script.referrerPolicy='no-referrer';
    let done=false;const finish=(error)=>{if(done)return;done=true;clearTimeout(timer);delete window._scoutAmapReady;if(error){script.remove();sdkPromise=null;reject(error);}else resolve(window.AMap);};
    const timer=setTimeout(()=>finish(new SearchError('timeout','高德地图组件加载超时，请检查网络后重试')),18000);
    window._scoutAmapReady=()=>{
      if(!window.AMap?.plugin){finish(new SearchError('sdk','高德地图组件未成功加载'));return;}
      window.AMap.plugin(['AMap.PlaceSearch'],()=>{if(!window.AMap.PlaceSearch)finish(new SearchError('sdk','高德周边搜索插件不可用'));else finish();});
    };
    script.onerror=()=>finish(new SearchError('network','高德地图组件无法连接，请检查网络'));
    script.src=`https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}&callback=_scoutAmapReady`;
    document.head.append(script);
  });
  return sdkPromise;
}
export function searchPage(AMap,category,location,page,{signal,timeout=15000}={}){
  return new Promise((resolve,reject)=>{
    let done=false;
    const finish=(fn,value)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);fn(value);};
    const cancel=()=>finish(reject,new SearchError('cancel','查询已取消'));
    const timer=setTimeout(()=>finish(reject,new SearchError('timeout',`${category.name}检索超时`)),timeout);
    if(signal?.aborted){cancel();return;}signal?.addEventListener('abort',cancel,{once:true});
    const search=new AMap.PlaceSearch({pageSize:25,pageIndex:page,extensions:'base'});
    search.searchNearBy(category.keyword,[location.lng,location.lat],1000,(status,result)=>{
      if(status==='no_data'){finish(resolve,{pois:[],count:0});return;}
      if(status!=='complete'||!Array.isArray(result?.poiList?.pois)){
        const info=String(result?.info||'');
        finish(reject,new SearchError(/KEY|SCODE|REFERER|LIMIT|AUTH|DENIED/i.test(info)?'key':'amap',`高德${category.name}搜索失败${info?`（${info.slice(0,90)}）`:''}。请检查地图授权和配额`));return;
      }
      const pois=result.poiList.pois.map(p=>({...p,location:p.location?`${p.location.lng??p.location.getLng?.()},${p.location.lat??p.location.getLat?.()}`:''}));
      finish(resolve,{pois,count:Number(result.poiList.count)||0});
    });
  });
}
export async function searchAmapJs(origin,settings,key,code,{signal,onProgress=()=>{},onBatch=()=>{},sdkLoader=loadAmap}={}){
  onProgress('正在连接高德地图…');const AMap=await sdkLoader(key,code);
  if(signal?.aborted)throw new SearchError('cancel','查询已取消');
  const center=wgsToGcj(origin),cats=categoriesFor(settings.scope),results=[],notes=[],failures=[];
  // Sequential searches avoid exceeding the QPS of a personal developer account.
  for(let i=0;i<cats.length;i++){
    const cat=cats[i];onProgress(`正在检索高德商家：${i+1} / ${cats.length} 类 · ${cat.name}…`);
    try{
      for(let page=1;page<=8;page++){
        const response=await searchPage(AMap,cat,center,page,{signal});results.push(...normalizeAmap(response.pois,cat));
        onBatch(normalizeNearby(results,origin));
        if(response.pois.length<25||page*25>=response.count)break;
        if(page===8)notes.push(`${cat.name}达到单条件 200 条上限，列表可能不完整。`);
      }
    }catch(e){if(e.code==='cancel'||e.code==='key')throw e;failures.push(`${cat.name}（${e.code==='timeout'?'超时':e.message}）`);}
  }
  if(failures.length===cats.length&&!results.length)throw new SearchError('network','高德所有品类检索均未成功，请重试并检查授权');
  if(failures.length)notes.push(`部分品类未完整检索：${failures.join('、')}。`);
  notes.unshift('高德提供附近门店候选；Wi-Fi、储值共享、经营性质、价格和闲置率待逐店核验。');
  return {stores:normalizeNearby(results,origin),notes,source:'高德地图',partial:failures.length>0};
}
