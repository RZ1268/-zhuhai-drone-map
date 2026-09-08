const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let map, matchingMap, acceptedMap, meMarker;
let current = {lat:22.2769, lng:113.5678};
let currentAddress = "当前位置";
let selected = {name:"经济型", price:198};
let target = null;
let nearbyCount = 23;
let timerHandle = null;
let matchTimer = null;
let seconds = 0;
let searchTimer = null;

const tileUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

function toast(text){
  const t=$("#toast");
  t.textContent=text;
  t.classList.remove("hidden");
  clearTimeout(t._to);
  t._to=setTimeout(()=>t.classList.add("hidden"),1800);
}

function makeIcon(type="fighter", size=32){
  const isMe=type==="me";
  return L.divIcon({
    className:"",
    html:isMe
      ? `<div style="width:${size}px;height:${size}px;border-radius:50%;background:#2e87ff;border:4px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.28)"></div>`
      : `<div style="width:${size}px;height:${size}px;border-radius:50%;background:#fff;border:2px solid #ff7b19;display:grid;place-items:center;font-size:${Math.round(size*.5)}px;box-shadow:0 3px 10px rgba(0,0,0,.25)">🥊</div>`,
    iconSize:[size,size],iconAnchor:[size/2,size/2]
  });
}

function addBaseMap(el, center, zoom=15){
  const m=L.map(el,{zoomControl:false,attributionControl:false}).setView([center.lat,center.lng],zoom);
  L.tileLayer(tileUrl,{maxZoom:19}).addTo(m);
  return m;
}

function init(){
  map=addBaseMap("map",current,15);
  meMarker=L.marker([current.lat,current.lng],{icon:makeIcon("me",20)}).addTo(map);
  scatterFighters(map,current,8);
  bindUI();
  locateMe();
}
window.addEventListener("load",init);

function scatterFighters(m,c,count=8){
  if(m._fakeFighters) m._fakeFighters.forEach(x=>m.removeLayer(x));
  m._fakeFighters=[];
  for(let i=0;i<count;i++){
    const a=Math.random()*Math.PI*2;
    const d=.0038+Math.random()*.012;
    const p=[c.lat+Math.sin(a)*d,c.lng+Math.cos(a)*d];
    m._fakeFighters.push(L.marker(p,{icon:makeIcon("fighter",31),interactive:false}).addTo(m));
  }
  nearbyCount=18+Math.floor(Math.random()*22);
  $("#nearCount").textContent=nearbyCount;
  $("#nearEta").textContent=2+Math.floor(Math.random()*4);
  $("#mCount").textContent=nearbyCount;
}

function locateMe(){
  if(!navigator.geolocation){
    $("#currentAddress").textContent="无法读取定位，已显示默认地图";
    return;
  }
  $("#currentAddress").textContent="正在获取你的位置…";
  navigator.geolocation.getCurrentPosition(async pos=>{
    current={lat:pos.coords.latitude,lng:pos.coords.longitude};
    map.setView([current.lat,current.lng],16,{animate:true});
    if(meMarker) map.removeLayer(meMarker);
    meMarker=L.marker([current.lat,current.lng],{icon:makeIcon("me",20)}).addTo(map);
    scatterFighters(map,current,8);
    $("#currentAddress").textContent="已获取当前位置";
    try{
      const u=`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${current.lat}&longitude=${current.lng}&localityLanguage=zh`;
      const r=await fetch(u);
      const j=await r.json();
      currentAddress=[j.locality,j.principalSubdivision,j.countryName].filter(Boolean).join(" · ") || "当前位置";
      $("#currentAddress").textContent=currentAddress;
    }catch(e){}
  },()=>{
    $("#currentAddress").textContent="定位未授权 · 显示默认地图";
  },{enableHighAccuracy:true,timeout:9000,maximumAge:20000});
}

function bindUI(){
  $("#locateBtn").onclick=locateMe;
  $("#profileBtn").onclick=()=>$("#aboutModal").classList.remove("hidden");
  $("#aboutLink").onclick=()=>$("#aboutModal").classList.remove("hidden");
  $("#closeAbout").onclick=()=>$("#aboutModal").classList.add("hidden");
  $("#aboutModal").onclick=e=>{if(e.target.id==="aboutModal")$("#aboutModal").classList.add("hidden")};

  $$(".service").forEach(el=>el.onclick=()=>selectService(el));
  $("#callBtn").onclick=callFighter;
  $("#cancelMatch").onclick=()=>{clearInterval(matchTimer);showScreen("homeScreen");setTimeout(()=>map.invalidateSize(),50)};
  $("#backAccepted").onclick=()=>showScreen("homeScreen");
  $("#fakeCall").onclick=()=>toast("正在呼叫李师傅…");
  $("#messageBtn").onclick=()=>toast("已发送：师傅你快点，对面开始上头了");
  $("#arrivedBtn").onclick=startProgress;
  $("#finishBtn").onclick=finishOrder;
  $("#againBtn").onclick=resetHome;
  $("#bigStars").onclick=()=>$("#ratingText").textContent="已提交：★★★★★  李师傅表示下次还接你的单";
  $("#priceExplain").onclick=()=>toast("起步价会根据距离、时段和师傅稀缺程度浮动");

  $("#targetInput").addEventListener("input",onSearchInput);
  $("#clearTarget").onclick=()=>{target=null;$("#targetInput").value="";$("#clearTarget").classList.add("hidden");$("#searchResults").classList.add("hidden");$("#distanceHint").textContent="选个套餐，师傅马上出发"};
  $$(".quickTargets button").forEach(b=>b.onclick=()=>{ $("#targetInput").value=b.dataset.q; onSearchInput(); });
}

function selectService(el){
  $$(".service").forEach(x=>x.classList.remove("active"));
  el.classList.add("active");
  selected={name:el.dataset.name,price:Number(el.dataset.price)};
  $("#callPrice").textContent=`· ¥${selected.price}起`;
}

function onSearchInput(){
  const q=$("#targetInput").value.trim();
  $("#clearTarget").classList.toggle("hidden",!q);
  clearTimeout(searchTimer);
  if(!q){$("#searchResults").classList.add("hidden");return}
  searchTimer=setTimeout(()=>searchPlaces(q),380);
}

async function searchPlaces(q){
  const box=$("#searchResults");
  box.innerHTML=`<div class="resultItem"><b>正在搜索“${escapeHtml(q)}”</b><small>附近地点加载中…</small></div>`;
  box.classList.remove("hidden");
  try{
    const url=`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lat=${current.lat}&lon=${current.lng}&limit=5&lang=zh`;
    const r=await fetch(url);
    const j=await r.json();
    const fs=j.features||[];
    if(!fs.length) throw 0;
    box.innerHTML="";
    fs.forEach(f=>{
      const p=f.properties||{};
      const name=p.name||p.street||p.city||q;
      const addr=[p.street,p.district,p.city,p.state].filter(Boolean).join(" · ");
      const [lng,lat]=f.geometry.coordinates;
      const item=document.createElement("div");
      item.className="resultItem";
      item.innerHTML=`<b>${escapeHtml(name)}</b><small>${escapeHtml(addr||"附近地点")}</small>`;
      item.onclick=()=>selectTarget({name,addr,lat,lng});
      box.appendChild(item);
    });
  }catch(e){
    box.innerHTML=`<div class="resultItem"><b>${escapeHtml(q)}</b><small>使用这个地址</small></div>`;
    box.firstChild.onclick=()=>selectTarget({name:q,addr:q,lat:current.lat+.006,lng:current.lng+.006});
  }
}

function selectTarget(t){
  target=t;
  $("#targetInput").value=t.name;
  $("#searchResults").classList.add("hidden");
  const d=haversine(current.lat,current.lng,t.lat,t.lng);
  $("#distanceHint").textContent=`距你约 ${d.toFixed(1)} km · ${selected.name}`;
  if(map._targetMarker) map.removeLayer(map._targetMarker);
  map._targetMarker=L.marker([t.lat,t.lng]).addTo(map);
  map.fitBounds(L.latLngBounds([[current.lat,current.lng],[t.lat,t.lng]]).pad(.35));
}

function callFighter(){
  if(!target && !$("#targetInput").value.trim()){
    $("#targetInput").focus();
    toast("先输入对方地址");
    return;
  }
  if(!target){
    target={name:$("#targetInput").value.trim(),addr:$("#targetInput").value.trim(),lat:current.lat+.006,lng:current.lng+.006};
  }
  showScreen("matchingScreen");
  setTimeout(()=>{
    if(matchingMap) matchingMap.remove();
    matchingMap=addBaseMap("matchingMap",current,15);
    L.marker([current.lat,current.lng],{icon:makeIcon("me",20)}).addTo(matchingMap);
    scatterFighters(matchingMap,current,7);
  },60);
  $("#matchingText").textContent=`已通知 8 名师傅，正在抢你的 ${selected.name} 订单`;
  $("#progressBar").style.width="0%";
  let pct=0;
  clearInterval(matchTimer);
  matchTimer=setInterval(()=>{
    pct+=8+Math.random()*10;
    $("#progressBar").style.width=Math.min(100,pct)+"%";
    if(pct>=100){
      clearInterval(matchTimer);
      setTimeout(showAccepted,260);
    }
  },240);
}

async function showAccepted(){
  showScreen("acceptedScreen");
  $("#acceptedService").textContent=selected.name;
  $("#acceptedTarget").textContent=target?.name||"未填写";
  $("#acceptedPrice").textContent=`¥${selected.price}起`;
  setTimeout(async()=>{
    if(acceptedMap) acceptedMap.remove();
    acceptedMap=addBaseMap("acceptedMap",current,15);
    const fighter={lat:current.lat+.006,lng:current.lng-.006};
    L.marker([current.lat,current.lng],{icon:makeIcon("me",20)}).addTo(acceptedMap);
    L.marker([fighter.lat,fighter.lng],{icon:makeIcon("fighter",34)}).addTo(acceptedMap);
    acceptedMap.fitBounds(L.latLngBounds([[current.lat,current.lng],[fighter.lat,fighter.lng]]).pad(.4));
    try{
      const u=`https://router.project-osrm.org/route/v1/driving/${fighter.lng},${fighter.lat};${current.lng},${current.lat}?overview=full&geometries=geojson`;
      const r=await fetch(u);const j=await r.json();
      const route=j.routes?.[0];
      if(route){
        L.geoJSON(route.geometry,{style:{color:"#ff7b19",weight:5,opacity:.85}}).addTo(acceptedMap);
        $("#etaMinutes").textContent=Math.max(2,Math.round(route.duration/60));
        $("#etaDistance").textContent=(route.distance/1000).toFixed(1);
      }
    }catch(e){
      L.polyline([[fighter.lat,fighter.lng],[current.lat,current.lng]],{color:"#ff7b19",weight:5,dashArray:"10 8"}).addTo(acceptedMap);
    }
  },60);
}

function startProgress(){
  showScreen("progressScreen");
  seconds=0;
  clearInterval(timerHandle);
  const states=[
    ["李师傅已到场","现场状态：双方正在互相打量"],
    ["李师傅正在热身","现场状态：围观群众开始往后退"],
    ["李师傅进入工作状态","现场状态：服务进行中"],
    ["李师傅停下来喝了口水","现场状态：短暂中场休息"],
    ["李师傅宣布差不多得了","现场状态：双方开始冷静"],
    ["现场逐渐变成调解会","现场状态：有人说“算了算了”"]
  ];
  timerHandle=setInterval(()=>{
    seconds++;
    $("#timer").textContent=String(Math.floor(seconds/60)).padStart(2,"0")+":"+String(seconds%60).padStart(2,"0");
    const s=states[Math.floor(seconds/3)%states.length];
    $("#progressHeadline").textContent=s[0];
    $("#liveStatus").textContent=s[1];
    $("#eventText").textContent=s[0];
  },1000);
}

function finishOrder(){
  clearInterval(timerHandle);
  const paid=Math.max(0,selected.price-3);
  $("#paidAmount").textContent=`¥${paid.toFixed(2)}`;
  $("#receiptService").textContent=selected.name;
  $("#orderNo").textContent="DDDD"+Date.now().toString().slice(-10);
  $("#receiptSummary").textContent="本次服务顺利结束";
  showScreen("receiptScreen");
}

function resetHome(){
  target=null;seconds=0;
  $("#targetInput").value="";
  $("#clearTarget").classList.add("hidden");
  $("#searchResults").classList.add("hidden");
  $("#ratingText").textContent="点击五星评价";
  showScreen("homeScreen");
  setTimeout(()=>{map.invalidateSize();map.setView([current.lat,current.lng],16);scatterFighters(map,current,8)},60);
}

function showScreen(id){
  $$(".screen").forEach(s=>s.classList.add("hidden"));
  $("#"+id).classList.remove("hidden");
  window.scrollTo(0,0);
}

function haversine(a,b,c,d){
  const R=6371,toRad=x=>x*Math.PI/180;
  const dLat=toRad(c-a),dLon=toRad(d-b);
  const h=Math.sin(dLat/2)**2+Math.cos(toRad(a))*Math.cos(toRad(c))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]))}
