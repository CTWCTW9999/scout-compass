import {DEFAULTS,CHECKS,categoriesFor,verification,mapUrl,radarPoint,demoStores,normalizeNearby,validPoint} from './core.js';
import {SearchError,searchOsm,searchAmap,getFreshLocation} from './data.js';
import {searchAmapJs} from './amap-js.js';
import {unlockPrivateConfig} from './private-config.js';
const $=id=>document.getElementById(id);
function readLocal(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
function writeLocal(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
const stored=readLocal('scout-settings-v1',{});
let settings={...DEFAULTS,...stored};
if(!['osm','amap','amapjs'].includes(settings.source))settings.source='osm';
if(!['priority','expanded'].includes(settings.scope))settings.scope='priority';
if(!Number.isFinite(settings.rechargeMin)||settings.rechargeMin<1)settings.rechargeMin=500;
if(!Number.isFinite(settings.idleMin)||settings.idleMin<1||settings.idleMin>100)settings.idleMin=50;
let records=readLocal('scout-records-v1',{});
if(!records||typeof records!=='object'||Array.isArray(records))records={};
let stores=[],origin=null,filter='all',isDemo=false,hasResults=false,run=null,selectedStore=null,demoRecords={};
let publishedRecords={},publishedStores=[],publishedError=false;
const publishedReady=fetch('./stores.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{
  if(!Array.isArray(data.stores))throw Error();
  for(const item of data.stores){if(item.store?.id&&validPoint(item.store.point)){publishedStores.push(item.store);publishedRecords[item.store.id]=item.record;}}
}).catch(()=>{publishedError=true;});
function node(tag,className,text){const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;}
function status(text,type=''){ $('status-text').textContent=text;$('status-box').className=`status-box ${type}`; }
function setBusy(busy){$('search-button').disabled=busy;$('demo-button').disabled=busy;$('cancel-button').hidden=!busy;$('search-button').textContent=busy?'正在查询…':'⌖ 查询附近';}
function showSettings(show){$('settings').hidden=!show;$('settings-toggle').setAttribute('aria-expanded',String(show));}
function sourceFields(){ $('amap-settings').hidden=$('source').value!=='amap';$('amapjs-settings').hidden=$('source').value!=='amapjs'; }
function updateSettingsUi(){
  $('source').value=settings.source;$('scope').value=settings.scope;$('recharge-min').value=settings.rechargeMin;$('idle-min').value=settings.idleMin;sourceFields();
  $('source-label').textContent=`${settings.source==='osm'?'开放地图':'高德地图'} · ${settings.scope==='priority'?'优先 5 类':'扩展 23 类'}`;
}
function verificationFor(s){return verification(isDemo?demoRecords[s.id]:records[s.id]||publishedRecords[s.id],settings);}
function clearResults(){
  stores=[];origin=null;hasResults=false;isDemo=false;$('demo-banner').hidden=true;$('result-notice').hidden=true;$('location-line').hidden=true;$('result-time').textContent='';
  $('radar-markers').replaceChildren();$('radar').setAttribute('aria-label','相对位置罗盘，等待定位；不是道路地图');$('radar-caption').textContent='中心为查询位置 · 北朝上';
  render();
}
function renderRadar(){
  const g=$('radar-markers');g.replaceChildren();if(!origin)return;
  const svg='http://www.w3.org/2000/svg';
  stores.slice(0,30).forEach((s,i)=>{
    const p=radarPoint(origin,s.point),link=document.createElementNS(svg,'a');link.setAttribute('href',`#store-${i}`);link.setAttribute('aria-label',`${i+1}：${s.name}，${Math.round(s.distance)}米`);
    const circle=document.createElementNS(svg,'circle');for(const [k,v] of Object.entries({cx:p.x,cy:p.y,r:8,class:'radar-point'}))circle.setAttribute(k,v);
    const label=document.createElementNS(svg,'text');for(const [k,v] of Object.entries({x:p.x,y:p.y+3,'text-anchor':'middle',class:'radar-point-label'}))label.setAttribute(k,v);label.textContent=i+1;
    link.append(circle,label);g.append(link);
  });
  $('radar').setAttribute('aria-label',`${isDemo?'演示':'查询'}位置附近 ${stores.length} 家候选的相对方位；展示最近 30 家；北朝上，不是道路地图`);
  $('radar-caption').textContent=`${isDemo?'模拟位置':'查询位置'}为中心 · 最近 ${Math.min(stores.length,30)} 家`;
}
function actionLink(label,url,className=''){const a=node('a',className,label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
function storeCard(s,index){
  const v=verificationFor(s),article=node('article','store-card');article.id=`store-${index}`;
  article.append(node('div','store-number',String(index+1).padStart(2,'0')));
  const body=node('div','card-body'),top=node('div','store-top');top.append(node('h3','',s.name),node('span',`badge ${v.state}`,v.state==='verified'?'已核验符合':v.state==='excluded'?'已核验排除':'待核验候选'));body.append(top);
  body.append(node('p','store-type',`${s.categoryName} · ${s.source==='amap'?'高德地图':s.source==='osm'?'OpenStreetMap':s.demo?'演示数据':'核验库'}`),node('p','address',s.address||'地址待补充'));
  const chips=node('div','checks');for(const c of CHECKS){const value=v.checks[c.id];chips.append(node('span',`check-chip ${value==='yes'?'pass':value==='no'?'fail':''}`,`${value==='yes'?'✓':value==='no'?'×':'?'} ${c.short}`));}body.append(chips);
  body.append(node('p','card-note',v.reason));
  if(v.state==='verified'){
    const r=isDemo?demoRecords[s.id]:records[s.id]||publishedRecords[s.id];body.append(node('p','card-note',`常规消费 ¥${r.price} · 主推实付充值 ¥${r.recharge} · ≥${r.idleDays}天未核销余额 ${r.idlePercent}%`));
  }
  for(const note of s.notes||[])body.append(node('p','card-note',note));
  const actions=node('div','actions');
  if(!s.demo){
    const map=mapUrl(s),nav=mapUrl(s,true);if(map)actions.append(actionLink('地图定位 ↗',map,'map-link'));if(nav)actions.append(actionLink('步行导航',nav));
    const tel=(s.tel||'').split(';')[0].trim();if(/^[+\d\s()-]{5,25}$/.test(tel)) {const a=node('a','', '致电门店');a.href=`tel:${tel.replace(/[\s()-]/g,'')}`;actions.append(a);}
  }else{const demoAction=node('button','','演示 · 定位不可用');demoAction.disabled=true;actions.append(demoAction);}
  const verify=node('button','',s.demo?'体验核验记录':'记录核验');verify.type='button';verify.addEventListener('click',()=>openVerify(s));actions.append(verify);body.append(actions);
  article.append(body,node('div','distance',`${Math.round(s.distance)} 米`));const small=node('small','',' · 直线');article.lastChild.append(small);return article;
}
function render(){
  const list=$('store-list');list.replaceChildren();
  if(!hasResults){
    ['verified-count','candidate-count','excluded-count'].forEach(id=>$(id).textContent='—');
    const empty=node('div','empty-state');empty.append(node('span','empty-icon','⌖'),node('h3','','你的探索，从这里开始'),node('p','','先定位，再寻找附近的店。地图提供线索，逐店核验决定是否符合。'));list.append(empty);return;
  }
  const counts={verified:0,candidate:0,excluded:0};stores.forEach(s=>counts[verificationFor(s).state]++);
  for(const [k,n] of Object.entries(counts))$(`${k}-count`).textContent=n;
  const selected=stores.map((s,i)=>({s,i})).filter(({s})=>filter==='all'||verificationFor(s).state===filter);
  if(selected.length)for(const {s,i} of selected)list.append(storeCard(s,i));
  else{const empty=node('div','empty-state result-empty');const title=stores.length===0?'本次数据源未返回门店':filter==='verified'?'还没有已核验符合的门店':'当前筛选下没有门店';empty.append(node('h3','',title),node('p','',stores.length===0?'这不代表身边没有店。可在数据设置中换用高德，或稍后重试。':filter==='verified'?'候选需要逐店确认全部条件。可在门店卡片中记录核验。':'试试查看全部候选。'));list.append(empty);}
  $('result-caption').textContent=`按直线距离排序 · ${stores.length} 家${isDemo?'虚构示例':'范围内记录'}`;
}
$('settings-toggle').addEventListener('click',()=>showSettings($('settings').hidden));$('settings-close').addEventListener('click',()=>showSettings(false));$('source').addEventListener('change',sourceFields);
$('settings-save').addEventListener('click',()=>{
  const rechargeMin=Number($('recharge-min').value),idleMin=Number($('idle-min').value);
  if(!Number.isFinite(rechargeMin)||rechargeMin<1||!Number.isFinite(idleMin)||idleMin<1||idleMin>100){$('settings-status').textContent='请填写有效的充值门槛和 1–100% 的闲置门槛。';return;}
  if(run)run.abort();settings={source:$('source').value,scope:$('scope').value,rechargeMin,idleMin};
  const saved=writeLocal('scout-settings-v1',settings);$('settings-status').textContent=saved?'设置已应用。来源或范围改变后，请重新查询。':'设置已应用到当前页面；浏览器限制了本地保存。';
  updateSettingsUi();if(hasResults)render();
});
document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{
  filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});render();
}));
$('search-form').addEventListener('submit',async e=>{
  e.preventDefault();if(run)return;
  await privateReady;
  if(run)return;
  const key=$('amap-key').value.trim(),jsKey=$('amapjs-key').value.trim(),jsCode=$('amapjs-code').value.trim();
  if(settings.source==='amapjs'&&(!/^[a-fA-F0-9]{32}$/.test(jsKey)||!/^[a-fA-F0-9]{32}$/.test(jsCode))){showSettings(true);status('请使用私人入口，或填写 JavaScript Key 和安全密钥。','error');return;}
  if(settings.source==='amap'&&!/^[a-fA-F0-9]{32}$/.test(key)){showSettings(true);status('请先在数据设置中填入高德 Web 服务 Key，或选择开放地图。','error');$('amap-key').focus();return;}
  if(!window.isSecureContext){status('定位需要 HTTPS。请使用已发布的 HTTPS 固定链接打开页面。','error');return;}
  clearResults();const controller=new AbortController();run=controller;const snapshot={...settings};setBusy(true);status('正在获取新的当前位置，请保持页面在前台…','busy');
  try{
    const position=await getFreshLocation({signal:controller.signal});origin=position;
    const time=new Date(position.timestamp).toLocaleTimeString('zh-CN',{hour12:false});
    $('location-line').hidden=false;$('location-line').textContent=`定位于 ${time} · 误差约 ±${Math.round(position.accuracy)} 米 · ${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`;
    renderRadar();
    const update=text=>status(text,'busy');
    const options={signal:controller.signal,onProgress:update,onBatch:batch=>{
      if(controller.signal.aborted)return;stores=batch;hasResults=true;
      $('result-notice').hidden=false;$('result-notice').textContent='正在补充各品类与后续分页，当前列表尚不完整。已返回的门店可先查看定位，核验记录保留在本设备。';
      $('result-time').textContent=`${time} · 检索中`;render();renderRadar();
    }};
    const result=await (snapshot.source==='amapjs'?searchAmapJs(position,snapshot,jsKey,jsCode,options):snapshot.source==='amap'?searchAmap(position,snapshot,key,options):searchOsm(position,snapshot,options));
    await publishedReady;if(controller.signal.aborted)throw new SearchError('cancel','查询已取消');
    const availableCategories=new Set(categoriesFor(snapshot.scope).map(c=>c.id));
    stores=normalizeNearby([...result.stores,...publishedStores.filter(s=>availableCategories.has(s.category))],position);
    hasResults=true;isDemo=false;$('demo-banner').hidden=true;
    const notes=[...result.notes,position.accuracy>100?'定位误差较大；位于 1 公里边缘的门店需参考地图确认。':'',publishedError?'公共核验库未成功加载；当前只使用本设备核验记录。':'',`距离以 ${time} 的查询位置为中心；移动后请重新查询。`].filter(Boolean);
    $('result-notice').textContent=notes.join(' ');$('result-notice').hidden=false;
    $('result-time').textContent=`${time} · ${result.source}`;
    status(result.partial?'查询完成，部分品类未成功检索。请查看结果说明。':`查询完成：检索到 ${stores.length} 家范围内记录。`);
    render();renderRadar();
  }catch(err){
    if(err.code==='cancel'){clearResults();status('本次查询已取消。');}
    else{status(err.message||'查询失败，请重试。','error');$('result-notice').hidden=false;$('result-notice').textContent=hasResults?'本次查询中断，仅展示中断前已返回的门店，列表不完整。请重试或调整数据来源。':'本次查询未完成，无法判断附近门店数量。可以重试或调整数据来源。';}
  }finally{if(run===controller){run=null;setBusy(false);}}
});
$('cancel-button').addEventListener('click',()=>run?.abort());
$('demo-button').addEventListener('click',()=>{
  if(run)return;const demo=demoStores();origin=demo.origin;stores=demo.stores;hasResults=true;isDemo=true;demoRecords={};
  $('demo-banner').hidden=false;$('result-notice').hidden=true;$('location-line').hidden=false;$('location-line').textContent='演示位置：公开地标附近的模拟坐标；不是你的当前位置。';$('result-time').textContent='演示 · 非真实查询';status('正在展示虚构示例。点击“查询附近”才会获取你的位置。');render();renderRadar();
});
$('demo-exit').addEventListener('click',()=>{clearResults();status('已退出演示，可以查询真实位置。');});
for(const c of CHECKS){const row=node('div','verify-check'),label=node('label','',c.label);label.htmlFor=`check-${c.id}`;const select=node('select');select.id=label.htmlFor;for(const [value,text] of [['unknown','待核验'],['yes','已确认符合'],['no','已确认不符']]){const option=node('option','',text);option.value=value;select.append(option);}row.append(label,select);$('verify-fields').append(row);}
function localDate(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function openVerify(s){
  selectedStore=s;const r=isDemo?demoRecords[s.id]:records[s.id]||publishedRecords[s.id];
  $('verify-shop-name').textContent=s.name;$('verify-title').textContent=s.demo?'演示核验 · 不会保存':'记录到店核验';$('verify-status').textContent='';
  for(const c of CHECKS)$(`check-${c.id}`).value=r?.checks?.[c.id]||'unknown';
  for(const [id,key] of [['normal-price','price'],['recharge-price','recharge'],['idle-days','idleDays'],['idle-percent','idlePercent']])$(id).value=r?.[key]??'';
  $('checked-date').value=r?.checkedAt||localDate();$('evidence-source').value=r?.evidence||'';$('verify-dialog').showModal();
}
$('verify-close').addEventListener('click',()=>$('verify-dialog').close());
$('verify-form').addEventListener('submit',e=>{
  e.preventDefault();if(!selectedStore)return;
  const num=id=>$(id).value.trim()===''?null:Number($(id).value);
  const record={checks:Object.fromEntries(CHECKS.map(c=>[c.id,$(`check-${c.id}`).value])),price:num('normal-price'),recharge:num('recharge-price'),idleDays:num('idle-days'),idlePercent:num('idle-percent'),checkedAt:$('checked-date').value,evidence:$('evidence-source').value.trim()};
  if(Date.parse(`${record.checkedAt}T00:00:00`)>Date.now()){$('verify-status').textContent='核验日期不能在未来。';return;}
  if(selectedStore.demo)demoRecords[selectedStore.id]=record;
  else{
    const updated={...records,[selectedStore.id]:record};if(!writeLocal('scout-records-v1',updated)){$('verify-status').textContent='本地保存失败，记录尚未保存。请检查浏览器是否允许网站存储。';return;}records=updated;
  }
  $('verify-dialog').close();render();status(selectedStore.demo?'演示核验已应用，不会保存在设备中。':'核验记录已保存在本设备，筛选状态已更新。');
});
updateSettingsUi();render();
const token=new URLSearchParams(location.hash.slice(1)).get('setup');
const privateReady=token?unlockPrivateConfig(token).then(config=>{
  $('amapjs-key').value=config.key;$('amapjs-code').value=config.code;settings.source='amapjs';updateSettingsUi();
  $('private-config-status').textContent='私人地图配置已载入。此链接可启用你的地图凭证，请仅自行收藏。';status('高德地图已配置。允许定位后，即可查询附近。');
}).catch(()=>{status('私人地图配置未能解锁，请检查链接是否完整，或在数据设置中手动配置。','error');showSettings(true);$('source').value='amapjs';sourceFields();}):Promise.resolve();
