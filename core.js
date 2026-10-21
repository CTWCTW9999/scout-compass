export const RADIUS = 1000;
export const DEFAULTS = Object.freeze({source:'osm', scope:'priority', rechargeMin:500, idleMin:50});
export const CATEGORIES = [
  {id:'hair',name:'理发店',keyword:'理发',osm:'[shop=hairdresser]',priority:true},
  {id:'billiards',name:'台球厅',keyword:'台球',osm:'[sport=billiards]',priority:true},
  {id:'carwash',name:'洗车店',keyword:'洗车',osm:'[amenity=car_wash]',priority:true},
  {id:'laundry',name:'洗衣店',keyword:'洗衣',osm:'[shop~"^(laundry|dry_cleaning)$"]',priority:true},
  {id:'shoeclean',name:'洗鞋店',keyword:'洗鞋',osm:'[shop=shoe_cleaning]',priority:true},
  {id:'nails',name:'基础美甲',keyword:'美甲',osm:'[shop=beauty][beauty=nails]'},
  {id:'pedicure',name:'社区修脚',keyword:'修脚'},
  {id:'footbath',name:'社区足浴',keyword:'足浴'},
  {id:'massage',name:'非医疗推拿',keyword:'推拿',osm:'[shop=massage]'},
  {id:'ear',name:'采耳',keyword:'采耳'},
  {id:'moxibustion',name:'艾灸养生',keyword:'艾灸'},
  {id:'sauna',name:'汗蒸馆',keyword:'汗蒸',osm:'[leisure=sauna]'},
  {id:'petgroom',name:'宠物洗护',keyword:'宠物洗护',osm:'[shop=pet_grooming]'},
  {id:'tea',name:'茶馆',keyword:'茶馆',osm:'[amenity=cafe][cuisine=tea]'},
  {id:'mahjong',name:'棋牌馆',keyword:'棋牌'},
  {id:'vr',name:'主机游戏 / VR',keyword:'VR体验'},
  {id:'arcade',name:'游艺厅',keyword:'电玩城',osm:'[leisure=amusement_arcade]'},
  {id:'claw',name:'抓娃娃店',keyword:'抓娃娃'},
  {id:'playground',name:'儿童乐园',keyword:'儿童乐园',osm:'[leisure=playground][indoor=yes]'},
  {id:'cafe',name:'独立咖啡候选',keyword:'咖啡',osm:'[amenity=cafe]'},
  {id:'dessert',name:'茶饮甜品',keyword:'甜品',osm:'[shop=pastry]'},
  {id:'bakery',name:'烘焙面包',keyword:'面包',osm:'[shop=bakery]'},
  {id:'bath',name:'社区洗浴',keyword:'澡堂',osm:'[amenity=public_bath]'}
];
export const CHECKS = [
  {id:'wifi',short:'免费联网',label:'未消费也能进入并免费使用客用 Wi-Fi'},
  {id:'prepaid',short:'金额储值',label:'主推实付金额充值，低价项目可扣此余额'},
  {id:'idle',short:'闲置余额',label:'匿名汇总证实付费余额闲置达到工作门槛'},
  {id:'sharing',short:'授权共享',label:'本人授权后朋友可用，无需每次本人确认'},
  {id:'independent',short:'独立单店',label:'老板经营的独立单店，非直营或加盟'},
  {id:'lowprice',short:'消费 <50',label:'正常可单买的完整一次消费低于 50 元'}
];
export function categoriesFor(scope) {return CATEGORIES.filter(c => scope==='expanded' || c.priority);}
export function validPoint(p) {return p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat)<=90 && Math.abs(p.lng)<=180;}
export function haversine(a,b) {
  if(!validPoint(a)||!validPoint(b)) return Infinity;
  const rad = x=>x*Math.PI/180, dl=rad(b.lat-a.lat), dn=rad(b.lng-a.lng);
  const x=Math.sin(dl/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dn/2)**2;
  return 6371008.8*2*Math.atan2(Math.sqrt(Math.min(1,x)),Math.sqrt(Math.max(0,1-x)));
}
function outsideChina(p){return p.lng<72.004||p.lng>137.8347||p.lat<0.8293||p.lat>55.8271;}
function transformLat(x,y){let r=-100+2*x+3*y+.2*y*y+.1*x*y+.2*Math.sqrt(Math.abs(x));r+=(20*Math.sin(6*x*Math.PI)+20*Math.sin(2*x*Math.PI))*2/3;r+=(20*Math.sin(y*Math.PI)+40*Math.sin(y/3*Math.PI))*2/3;r+=(160*Math.sin(y/12*Math.PI)+320*Math.sin(y*Math.PI/30))*2/3;return r;}
function transformLng(x,y){let r=300+x+2*y+.1*x*x+.1*x*y+.1*Math.sqrt(Math.abs(x));r+=(20*Math.sin(6*x*Math.PI)+20*Math.sin(2*x*Math.PI))*2/3;r+=(20*Math.sin(x*Math.PI)+40*Math.sin(x/3*Math.PI))*2/3;r+=(150*Math.sin(x/12*Math.PI)+300*Math.sin(x/30*Math.PI))*2/3;return r;}
export function wgsToGcj(p){
  if(!validPoint(p)) throw new Error('无效坐标');
  if(outsideChina(p))return {...p};
  const a=6378245,ee=.00669342162296594323,rad=p.lat*Math.PI/180;
  let dl=transformLat(p.lng-105,p.lat-35),dn=transformLng(p.lng-105,p.lat-35);
  const magic=1-ee*Math.sin(rad)**2,sqrt=Math.sqrt(magic);
  dl=dl*180/((a*(1-ee))/(magic*sqrt)*Math.PI);dn=dn*180/(a/sqrt*Math.cos(rad)*Math.PI);
  return {lat:p.lat+dl,lng:p.lng+dn};
}
export function gcjToWgs(p){
  if(!validPoint(p))throw new Error('无效坐标');
  if(outsideChina(p))return {...p};
  let guess={...p};for(let i=0;i<8;i++){const t=wgsToGcj(guess);guess={lat:guess.lat-(t.lat-p.lat),lng:guess.lng-(t.lng-p.lng)};}return guess;
}
export function normalizeNearby(stores, origin) {
  const ids=new Set(),out=[];
  for(const s of stores){
    if(!s.id||ids.has(s.id)||!validPoint(s.point))continue;
    ids.add(s.id);const distance=haversine(origin,s.point);if(distance>RADIUS)continue;
    // OSM may describe one shop as both a node and a building; only exact name/category matches are merged.
    if(s.source==='osm' && out.some(x=>x.source==='osm'&&x.name===s.name&&x.category===s.category&&haversine(x.point,s.point)<30))continue;
    out.push({...s,distance});
  }
  return out.sort((a,b)=>a.distance-b.distance||a.name.localeCompare(b.name,'zh-CN'));
}
export function osmCategory(tags,scope='priority') {
  const candidates=categoriesFor(scope);
  const id = tags.shop==='hairdresser'?'hair':tags.sport==='billiards'?'billiards':tags.amenity==='car_wash'?'carwash':['laundry','dry_cleaning'].includes(tags.shop)?'laundry':tags.shop==='shoe_cleaning'?'shoeclean':tags.shop==='beauty'&&tags.beauty==='nails'?'nails':tags.shop==='massage'?'massage':tags.leisure==='sauna'?'sauna':tags.shop==='pet_grooming'?'petgroom':tags.amenity==='cafe'?(tags.cuisine==='tea'?'tea':'cafe'):tags.leisure==='amusement_arcade'?'arcade':tags.leisure==='playground'&&tags.indoor==='yes'?'playground':tags.shop==='pastry'?'dessert':tags.shop==='bakery'?'bakery':tags.amenity==='public_bath'?'bath':null;
  return candidates.find(c=>c.id===id)||null;
}
export function normalizeOsm(elements,scope) {
  return elements.flatMap(e=>{
    const t=e.tags||{},cat=osmCategory(t,scope);if(!cat)return [];
    const p={lat:e.lat??e.center?.lat,lng:e.lon??e.center?.lon};if(!validPoint(p))return [];
    const address=t['addr:full']||[t['addr:city'],t['addr:street'],t['addr:housenumber']].filter(Boolean).join(' ');
    return [{id:`osm:${e.type}:${e.id}`,name:t['name:zh']||t.name||`未命名${cat.name}`,category:cat.id,categoryName:cat.name,point:p,mapPoint:wgsToGcj(p),source:'osm',address:address||'开放地图未提供详细地址',tel:t['contact:phone']||t.phone||'',notes:[t.internet_access==='wlan'?'地图标注 Wi-Fi；是否对未消费者开放仍需核验。':'',t.brand||t.operator?`地图标注经营方：${t.brand||t.operator}；是否连锁待核验。`:''].filter(Boolean)}];
  });
}
export function normalizeAmap(pois,category) {
  return pois.flatMap(p=>{
    const raw=typeof p.location==='string'?p.location.split(',').map(Number):[];
    const mapPoint={lng:raw[0],lat:raw[1]};if(!p.id||!validPoint(mapPoint))return [];
    const address=[p.pname,p.cityname,p.adname,typeof p.address==='string'?p.address:''].filter(x=>typeof x==='string'&&x).join(' ');
    return [{id:`amap:${p.id}`,poiId:p.id,name:p.name||'未命名门店',point:gcjToWgs(mapPoint),mapPoint,source:'amap',category:category.id,categoryName:category.name,address:address||'高德未提供详细地址',tel:typeof p.tel==='string'?p.tel:'',notes:[]}];
  });
}
const finiteNumber = x=>typeof x==='number'&&Number.isFinite(x);
export function verification(record,settings=DEFAULTS,now=Date.now()){
  const raw=Object.fromEntries(CHECKS.map(c=>[c.id,record?.checks?.[c.id]||'unknown']));
  if(!record)return {state:'candidate',checks:raw,reason:'五条条件均待逐店核验'};
  const date=Date.parse(`${record.checkedAt}T00:00:00`),age=now-date;
  if(!Number.isFinite(date)||age<0||age>90*86400000||typeof record.evidence!=='string'||!record.evidence.trim())return {state:'candidate',checks:Object.fromEntries(CHECKS.map(c=>[c.id,'unknown'])),reason:'核验缺少有效日期 / 证据，或已超过 90 天'};
  const checks={...raw};
  if(checks.prepaid==='yes') checks.prepaid=!finiteNumber(record.recharge)?'unknown':record.recharge>=settings.rechargeMin?'yes':'no';
  if(checks.lowprice==='yes') checks.lowprice=!finiteNumber(record.price)?'unknown':record.price>0&&record.price<50?'yes':'no';
  if(checks.idle==='yes') checks.idle=!(finiteNumber(record.idleDays)&&finiteNumber(record.idlePercent))?'unknown':record.idleDays>=90&&record.idlePercent>=settings.idleMin&&record.idlePercent<=100?'yes':'no';
  const state=Object.values(checks).includes('no')?'excluded':Object.values(checks).every(x=>x==='yes')?'verified':'candidate';
  return {state,checks,reason:state==='verified'?`本设备核验记录 · ${record.checkedAt}`:state==='excluded'?'至少一项条件不符合当前筛选口径':'仍有条件待核验'};
}
export function mapUrl(store,navigation=false){
  if(store.demo||!validPoint(store.mapPoint))return null;
  const p=store.mapPoint,position=`${p.lng.toFixed(6)},${p.lat.toFixed(6)}`;
  return navigation?`https://uri.amap.com/navigation?to=${position},${encodeURIComponent(store.name)}&mode=walk&src=scout-compass`:`https://uri.amap.com/marker?position=${position}&name=${encodeURIComponent(store.name)}&coordinate=gaode&src=scout-compass`;
}
export function radarPoint(origin,point){
  const north=(point.lat-origin.lat)*Math.PI/180*6371008.8;
  let dl=point.lng-origin.lng;if(dl>180)dl-=360;if(dl< -180)dl+=360;
  const east=dl*Math.PI/180*6371008.8*Math.cos(origin.lat*Math.PI/180);
  return {x:160+east/RADIUS*133,y:160-north/RADIUS*133};
}
export function demoStores(){
  const origin={lat:30.2741,lng:120.1551};
  const shops=[['演示 · 街角理发','hair',.001,.0005],['演示 · 青石洗衣','laundry',-.002,.0017],['演示 · 一间台球','billiards',.0026,-.003],['演示 · 邻里洗车','carwash',-.0038,-.0025],['演示 · 白鞋清洗','shoeclean',.0041,.0046]];
  return {origin,stores:normalizeNearby(shops.map(([name,category,lat,lng],i)=>({id:`demo:${i}`,name,category,categoryName:CATEGORIES.find(c=>c.id===category).name,point:{lat:origin.lat+lat,lng:origin.lng+lng},source:'demo',address:'虚构地址 · 非真实门店',tel:'',notes:['演示候选，全部条件尚未核验。'],demo:true})),origin)};
}
