(() => {
  const DATA = window.AIRWISE_DATA || { railways: [], uomRects: [] };
  const $ = (id) => document.getElementById(id);
  const els = {
    locateBtn: $('locateBtn'), layersBtn: $('layersBtn'), layerCount: $('layerCount'), panel: $('panel'), closePanel: $('closePanel'), detailsBtn: $('detailsBtn'),
    dockTitle: $('dockTitle'), dockSub: $('dockSub'), coordText: $('coordText'), riskCard: $('riskCard'), uomStatus: $('uomStatus'), railDistance: $('railDistance'),
    weatherTime: $('weatherTime'), weatherBox: $('weatherBox'), reportDate: $('reportDate'), reportTime: $('reportTime'), pilot: $('pilot'), phone: $('phone'),
    altitude: $('altitude'), radiusKm: $('radiusKm'), reportText: $('reportText'), copyReport: $('copyReport'), importBtn: $('importBtn'), exportBtn: $('exportBtn'), fileInput: $('fileInput'),
    customList: $('customList'), layersSheet: $('layersSheet'), closeLayers: $('closeLayers'), toggleBlue: $('toggleBlue'), toggleRailOrange: $('toggleRailOrange'),
    toggleRailRed: $('toggleRailRed'), toggleOther: $('toggleOther'), satelliteBtn: $('satelliteBtn'), uomToken: $('uomToken'), saveUomToken: $('saveUomToken'),
    clearUomToken: $('clearUomToken'), uomLiveState: $('uomLiveState'), uomModeBadge: $('uomModeBadge')
  };

  const STORAGE_KEY = 'airwise-custom-zones-v1';
  const UOM_TOKEN_KEY = 'airwise-uom-airspace-token-v1';
  let selected = null, weather = null, satellite = false, liveUomLayer = null, liveUomConnected = false, liveUomErrors = 0;
  let customZones = loadCustomZones();

  const map = L.map('map', { zoomControl: false, preferCanvas: true, minZoom: 8, maxZoom: 18 }).setView([22.271, 113.495], 12);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  const baseStreet = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap contributors' }).addTo(map);
  const baseSatellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, attribution: 'Tiles © Esri' });
  const panes = { blue:430, uomlive:440, other:450, orange:470, red:490, custom:520, selection:650 };
  Object.entries(panes).forEach(([name, zIndex]) => { const p = map.createPane(`airwise-${name}`); p.style.zIndex = String(zIndex); });

  const layers = {
    blue: L.layerGroup().addTo(map), railOrange: L.layerGroup().addTo(map), railRed: L.layerGroup().addTo(map), other: L.layerGroup().addTo(map), custom: L.layerGroup().addTo(map)
  };

  const OTHER_ZONES = [
    { name: '横琴粤澳深度合作区全域', type: 'polygon', severity: 'red', coords: [[22.160,113.438],[22.151,113.474],[22.151,113.523],[22.132,113.569],[22.100,113.594],[22.064,113.588],[22.038,113.562],[22.044,113.512],[22.070,113.474],[22.111,113.450]], note: '官方通告明确为管制空域；法定边界以官方/UOM为准。' },
    { name: '珠海金湾机场核心风险参考圈', type: 'circle', severity: 'red', center: [22.0064,113.376], radius: 7000, note: '7公里仅作机场核心风险初筛，并非法定管制边界。' },
    { name: '澳门机场邻近高风险参考圈', type: 'circle', severity: 'orange', center: [22.1496,113.5915], radius: 6000, note: '跨境机场邻近风险参考层，不代表法定禁飞边界。' },
    { name: '九洲港/九洲机场邻近核验区', type: 'circle', severity: 'yellow', center: [22.2395,113.5935], radius: 1600, note: '机场、客运港和人口密集区叠加，需额外核验。' },
    { name: '港珠澳大桥珠海口岸', type: 'circle', severity: 'yellow', center: [22.1975,113.6686], radius: 2600, note: '跨境口岸和交通枢纽高关注区域。' },
  ];
  const severityStyle = {
    red: { color:'#ff3658', fill:'#ff3658', fillOpacity:.08 }, orange:{ color:'#ff9f43', fill:'#ff9f43', fillOpacity:.055 }, yellow:{ color:'#f3cf55', fill:'#f3cf55', fillOpacity:.045 }
  };

  function popup(name, note){ return `<b>${escapeHtml(name)}</b><br><span style="color:#9eb2a9">${escapeHtml(note || '')}</span>`; }
  function escapeHtml(v=''){ return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

  function renderBlue(){
    layers.blue.clearLayers();
    DATA.uomRects.forEach(([west,south,east,north]) => {
      L.rectangle([[south,west],[north,east]], { pane:'airwise-blue', color:'#13bfd2', weight:1, opacity:.72, fillColor:'#2ddbea', fillOpacity:.31, interactive:false }).addTo(layers.blue);
    });
  }

  function setUomLiveStatus(mode, text){
    if (els.uomLiveState) els.uomLiveState.textContent = text;
    if (els.uomModeBadge) {
      els.uomModeBadge.textContent = mode === 'live' ? 'UOM官方实时' : mode === 'loading' ? '连接中' : '本地参考';
      els.uomModeBadge.classList.toggle('live', mode === 'live');
    }
    if (mode === 'live') {
      liveUomConnected = true;
      els.uomStatus.textContent = '已叠加UOM官方广东实时适飞空域图层。铁路红/橙带仍按本工具规则覆盖显示；自动选点判断仍保留本地蓝区参考，最终以官方UOM图层和临时管制为准。';
    } else if (mode === 'loading') {
      liveUomConnected = false;
      els.uomStatus.textContent = '正在连接UOM官方广东适飞空域图层；连接失败时会自动保留本地蓝区参考。';
    } else {
      liveUomConnected = false;
      els.uomStatus.textContent = '当前显示本地UOM蓝区参考。可在“图层”里粘贴你自己的UOM空域token，直接叠加官方广东实时蓝区。';
    }
  }

  function disconnectLiveUom(clearToken=false){
    if (liveUomLayer && map.hasLayer(liveUomLayer)) map.removeLayer(liveUomLayer);
    liveUomLayer = null;
    liveUomErrors = 0;
    if (clearToken) localStorage.removeItem(UOM_TOKEN_KEY);
    setUomLiveStatus('local', '未连接');
  }

  function connectLiveUom(token){
    token = String(token || '').trim();
    if (token.length < 10) { disconnectLiveUom(false); return false; }
    if (liveUomLayer && map.hasLayer(liveUomLayer)) map.removeLayer(liveUomLayer);
    liveUomErrors = 0;
    setUomLiveStatus('loading', '连接中…');
    liveUomLayer = L.tileLayer.wms('https://uom.caac.gov.cn/map/airspace/wms', {
      token,
      layers: 'QGSFKYFW:sf440000',
      styles: 'QGSFKYFW:shifeikongyu',
      format: 'image/png8',
      transparent: true,
      version: '1.1.0',
      srs: 'EPSG:3857',
      pane: 'airwise-uomlive',
      opacity: .62,
      attribution: '中国民航局 UOM 空域信息'
    });
    liveUomLayer.on('tileload', () => {
      if (!liveUomConnected) setUomLiveStatus('live', '已连接');
    });
    liveUomLayer.on('tileerror', () => {
      liveUomErrors += 1;
      if (liveUomErrors >= 3) {
        if (liveUomLayer && map.hasLayer(liveUomLayer)) map.removeLayer(liveUomLayer);
        setUomLiveStatus('local', 'token失效/连接失败');
      }
    });
    liveUomLayer.addTo(map);
    return true;
  }

  function metersPerPixel(lat, zoom){ return 156543.03392 * Math.cos(lat * Math.PI / 180) / (2 ** zoom); }
  function renderRails(){
    layers.railOrange.clearLayers(); layers.railRed.clearLayers();
    const mpp = metersPerPixel(map.getCenter().lat, map.getZoom());
    DATA.railways.forEach((rail) => rail.lines.forEach((line) => {
      const pts = line.map(([lng,lat]) => [lat,lng]);
      L.polyline(pts, { pane:'airwise-orange', color:'#ff9f43', weight:Math.max(6,1000/mpp), opacity:.10, lineCap:'round', lineJoin:'round', interactive:false }).addTo(layers.railOrange);
      L.polyline(pts, { pane:'airwise-orange', color:'#ffc080', weight:Math.max(2,7/mpp), opacity:.34, dashArray:'8 8', lineCap:'round', interactive:false }).addTo(layers.railOrange);
      L.polyline(pts, { pane:'airwise-red', color:'#ff3658', weight:Math.max(5,200/mpp), opacity:.15, lineCap:'round', lineJoin:'round', interactive:false }).addTo(layers.railRed);
      L.polyline(pts, { pane:'airwise-red', color:'#ff3658', weight:Math.max(2,4/mpp), opacity:.68, lineCap:'round', interactive:false }).addTo(layers.railRed);
    }));
  }
  function renderOther(){
    layers.other.clearLayers();
    OTHER_ZONES.forEach(z => {
      const st = severityStyle[z.severity];
      const opt = { pane:'airwise-other', color:st.color, weight:1.25, opacity:.48, fillColor:st.fill, fillOpacity:st.fillOpacity };
      const layer = z.type === 'circle' ? L.circle(z.center,{...opt,radius:z.radius}) : L.polygon(z.coords,opt);
      layer.bindPopup(popup(z.name,z.note)); layer.addTo(layers.other);
    });
  }
  function renderCustom(){
    layers.custom.clearLayers();
    customZones.forEach(z => {
      let layer;
      const opt={pane:'airwise-custom',color:z.color||'#b88cff',weight:2,fillColor:z.color||'#b88cff',fillOpacity:.15};
      if(z.geometry.type==='Polygon') layer=L.polygon(z.geometry.coordinates[0].map(([lng,lat])=>[lat,lng]),opt);
      else if(z.geometry.type==='Point') layer=L.circle([z.geometry.coordinates[1],z.geometry.coordinates[0]],{...opt,radius:z.radius||500});
      else return;
      layer.bindPopup(popup(z.name,z.note||'我的区域')); layer.addTo(layers.custom);
    });
    renderCustomList(); updateLayerCount();
  }
  function renderCustomList(){
    els.customList.innerHTML = customZones.length ? customZones.map((z,i)=>`<article><span>${escapeHtml(z.name||`区域${i+1}`)}</span><button data-del="${i}">删除</button></article>`).join('') : '<small style="color:#71877d">还没有自定义区域。可以用地图右上角画区，或导入 GeoJSON。</small>';
    els.customList.querySelectorAll('[data-del]').forEach(btn=>btn.onclick=()=>{customZones.splice(Number(btn.dataset.del),1);saveCustomZones();renderCustom();});
  }
  function updateLayerCount(){
    const count = DATA.uomRects.length + DATA.railways.length*2 + OTHER_ZONES.length + customZones.length + (liveUomConnected ? 1 : 0);
    els.layerCount.querySelector('b').textContent=count;
  }
  renderBlue(); renderRails(); renderOther(); renderCustom();
  map.on('zoomend', renderRails);

  const savedUomToken = localStorage.getItem(UOM_TOKEN_KEY) || '';
  if (els.uomToken) els.uomToken.value = savedUomToken;
  if (savedUomToken) connectLiveUom(savedUomToken);
  if (els.saveUomToken) els.saveUomToken.onclick = () => {
    const token = els.uomToken.value.trim();
    if (token.length < 10) { alert('token太短，先从UOM空域查询页面获取有效空域token'); return; }
    localStorage.setItem(UOM_TOKEN_KEY, token);
    connectLiveUom(token);
  };
  if (els.clearUomToken) els.clearUomToken.onclick = () => {
    if (els.uomToken) els.uomToken.value = '';
    disconnectLiveUom(true);
  };

  let selectionMarker = null;
  map.on('click', e => selectPoint([e.latlng.lat,e.latlng.lng]));
  function selectPoint(point){
    selected=point;
    if(selectionMarker) map.removeLayer(selectionMarker);
    selectionMarker=L.circleMarker(point,{pane:'airwise-selection',radius:9,color:'#06110d',weight:3,fillColor:'#37e6a1',fillOpacity:1}).addTo(map);
    els.coordText.textContent=`${point[0].toFixed(6)}, ${point[1].toFixed(6)}`;
    updateRisk(); updateReport(); fetchWeather(point);
  }

  function pointInRect([lat,lng],[w,s,e,n]){ return lng>=w&&lng<=e&&lat>=s&&lat<=n; }
  function haversine(a,b){ const R=6371000, p1=a[0]*Math.PI/180,p2=b[0]*Math.PI/180,dp=(b[0]-a[0])*Math.PI/180,dl=(b[1]-a[1])*Math.PI/180; const x=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2; return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x)); }
  function segDist(p,a,b){
    const lat=p[0], lng=p[1], kx=111320*Math.cos(lat*Math.PI/180), ky=110540;
    let ax=(a[1]-lng)*kx, ay=(a[0]-lat)*ky, bx=(b[1]-lng)*kx, by=(b[0]-lat)*ky;
    const dx=bx-ax,dy=by-ay,den=dx*dx+dy*dy; const t=den?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/den)):0;
    return Math.hypot(ax+t*dx,ay+t*dy);
  }
  function railDistance(p){
    let best={name:'铁路',distance:Infinity};
    DATA.railways.forEach(r=>r.lines.forEach(line=>{for(let i=1;i<line.length;i++){const a=[line[i-1][1],line[i-1][0]],b=[line[i][1],line[i][0]],d=segDist(p,a,b);if(d<best.distance)best={name:r.name,distance:d};}}));
    return best;
  }
  function inCircle(p,c,r){ return haversine(p,c)<=r; }
  function pointInPoly(point, poly){ const [lat,lng]=point; let inside=false; for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [yi,xi]=poly[i],[yj,xj]=poly[j]; const hit=((yi>lat)!=(yj>lat))&&(lng<(xj-xi)*(lat-yi)/(yj-yi+1e-12)+xi); if(hit)inside=!inside;} return inside; }
  function matchedOther(p){ return OTHER_ZONES.filter(z=>z.type==='circle'?inCircle(p,z.center,z.radius):pointInPoly(p,z.coords)); }
  function updateRisk(){
    if(!selected)return;
    const rd=railDistance(selected), blue=DATA.uomRects.some(r=>pointInRect(selected,r)), other=matchedOther(selected);
    let key='yellow',title='需UOM核验',detail=liveUomConnected?'请以地图上的UOM官方实时蓝区为准；本地点选逻辑未直接读取WMS像素属性。':'该点未命中本地蓝区参考，或超出复现数据覆盖范围。';
    if(rd.distance<=100){key='red';title='绝对禁止起飞';detail=`距${rd.name}约 ${Math.round(rd.distance)} 米，处于铁路0–100米禁飞带。`;}
    else if(rd.distance<=500){key='orange';title='100–500米：先报备';detail=`距${rd.name}约 ${Math.round(rd.distance)} 米，处于铁路报备带。`;}
    else if(other.some(z=>z.severity==='red')){key='red';title='绝对禁止/高风险';detail=other.find(z=>z.severity==='red').name;}
    else if(other.some(z=>z.severity==='orange')){key='orange';title='高风险，先核验';detail=other.find(z=>z.severity==='orange').name;}
    else if(blue){key='green';title=liveUomConnected?'本地参考命中 · 看官方蓝区确认':'位于UOM蓝色适飞参考';detail=liveUomConnected?'本地蓝区参考命中，且铁路500米走廊外；请同时确认地图上的UOM官方实时蓝区。':'未命中铁路500米走廊；仍需打开UOM确认实时空域和临时管制。';}
    if(weather&&(weather.gust>=35||weather.wind>=25||weather.rain>0)&&key==='green'){key='orange';title='天气不建议飞';detail='阵风、持续风或降水达到保守阈值。';}
    els.riskCard.className=`risk-card ${key}`; els.riskCard.innerHTML=`<small>即时判断</small><h1>${title}</h1><p>${detail}</p>`;
    els.dockTitle.textContent=title; els.dockSub.textContent=`铁路 ${Math.round(rd.distance)}m · ${liveUomConnected?'UOM实时图层已开':(blue?'蓝区参考命中':'蓝区未命中')}`;
    els.railDistance.innerHTML=`<span><b>${rd.name}</b><br>${rd.distance<1000?Math.round(rd.distance)+' 米':(rd.distance/1000).toFixed(2)+' km'}</span>`;
    if (!liveUomConnected) els.uomStatus.textContent=blue?'此点命中本地UOM蓝区参考；铁路500米范围已优先剔除。起飞前仍需官方UOM核验。':'此点未命中本地蓝区参考；可能在非适飞区，也可能超出本地参考覆盖范围，请打开UOM核验。';
  }

  async function fetchWeather([lat,lng]){
    els.weatherBox.innerHTML='<span>天气加载中…</span>';
    try{
      const u=new URL('https://api.open-meteo.com/v1/forecast');
      u.searchParams.set('latitude',lat);u.searchParams.set('longitude',lng);u.searchParams.set('current','temperature_2m,precipitation,wind_speed_10m,wind_gusts_10m');u.searchParams.set('timezone','Asia/Shanghai');
      const r=await fetch(u), j=await r.json();
      weather={temp:j.current?.temperature_2m||0,wind:j.current?.wind_speed_10m||0,gust:j.current?.wind_gusts_10m||0,rain:j.current?.precipitation||0};
      els.weatherTime.textContent=j.current?.time?.slice(11,16)||'刚刚';
      els.weatherBox.innerHTML=`<div><b>${weather.temp.toFixed(1)}°</b><small>气温</small></div><div><b>${weather.wind.toFixed(0)}</b><small>持续风 km/h</small></div><div><b>${weather.gust.toFixed(0)}</b><small>阵风 km/h</small></div><div><b>${weather.rain.toFixed(1)}</b><small>降水 mm</small></div>`;
      updateRisk(); updateReport();
    }catch{els.weatherBox.innerHTML='<span>天气暂时没拉到，空域判断仍可使用。</span>';}
  }

  function updateReport(){
    if(!selected){els.reportText.value='先在地图上选择起飞位置。';return;}
    const rd=railDistance(selected); const blue=DATA.uomRects.some(r=>pointInRect(selected,r));
    const date=els.reportDate.value||'________',time=els.reportTime.value||'________',pilot=els.pilot.value.trim()||'________',phone=els.phone.value.trim()||'________';
    const alt=Math.min(500,Math.max(20,Number(els.altitude.value)||120)),radius=Math.max(.1,Number(els.radiusKm.value)||1);
    els.reportText.value=[
      '【无人驾驶航空器飞行活动报备】',`申请人：${pilot}`,`联系电话：${phone}`,`飞行时间：${date} ${time}`,
      `起飞坐标：${selected[0].toFixed(6)}, ${selected[1].toFixed(6)}`,`飞行区域：以起飞点为中心，最大半径约 ${radius.toFixed(1)} km`,`航空器：DJI Mavic 4 Pro`,`最大真高：≤${alt} 米`,
      '飞行目的：个人航拍','安全措施：全程视距内飞行；避开铁路、人员密集区及敏感设施；不飞越人群；服从现场管理；遇临时管制、天气变化或现场异常立即终止。',
      `本图初筛：距${rd.name}约 ${Math.round(rd.distance)} 米；${blue?'命中UOM蓝区本地参考':'未命中UOM蓝区本地参考'}；${liveUomConnected?'UOM官方实时图层已开启，请以其显示为准':'未连接UOM官方实时图层'}。最终以UOM/审批和现场要求为准。`
    ].join('\n');
  }
  [els.reportDate,els.reportTime,els.pilot,els.phone,els.altitude,els.radiusKm].forEach(el=>el.addEventListener('input',updateReport));
  els.reportDate.value=new Date().toISOString().slice(0,10); updateReport();
  els.copyReport.onclick=async()=>{try{await navigator.clipboard.writeText(els.reportText.value);els.copyReport.textContent='已复制 ✓';setTimeout(()=>els.copyReport.textContent='复制报备模板',1200);}catch{els.reportText.select();document.execCommand('copy');}};

  els.locateBtn.onclick=()=>{if(!navigator.geolocation)return alert('当前浏览器不支持定位');navigator.geolocation.getCurrentPosition(p=>{const pt=[p.coords.latitude,p.coords.longitude];map.setView(pt,14);selectPoint(pt);},()=>alert('定位失败，请检查Safari定位权限'),{enableHighAccuracy:true,timeout:9000});};
  els.detailsBtn.onclick=()=>els.panel.classList.add('open'); els.closePanel.onclick=()=>els.panel.classList.remove('open');
  els.layersBtn.onclick=els.layerCount.onclick=()=>els.layersSheet.classList.remove('hidden'); els.closeLayers.onclick=()=>els.layersSheet.classList.add('hidden'); els.layersSheet.onclick=e=>{if(e.target===els.layersSheet)els.layersSheet.classList.add('hidden')};
  [['toggleBlue','blue'],['toggleRailOrange','railOrange'],['toggleRailRed','railRed'],['toggleOther','other']].forEach(([id,key])=>$(id).onchange=e=>e.target.checked?layers[key].addTo(map):map.removeLayer(layers[key]));
  els.satelliteBtn.onclick=()=>{satellite=!satellite;if(satellite){map.removeLayer(baseStreet);baseSatellite.addTo(map);els.satelliteBtn.textContent='切换街道图';}else{map.removeLayer(baseSatellite);baseStreet.addTo(map);els.satelliteBtn.textContent='切换卫星图';}};

  function loadCustomZones(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]')}catch{return[]}}
  function saveCustomZones(){localStorage.setItem(STORAGE_KEY,JSON.stringify(customZones));}
  els.importBtn.onclick=()=>els.fileInput.click();
  els.fileInput.onchange=async()=>{const f=els.fileInput.files?.[0];if(!f)return;try{const j=JSON.parse(await f.text()),features=j.type==='FeatureCollection'?j.features:[j];const incoming=features.flatMap((ft,i)=>{if(!ft.geometry)return[];const g=ft.geometry;if(g.type!=='Polygon'&&g.type!=='Point')return[];return[{name:ft.properties?.name||`导入区域${i+1}`,note:ft.properties?.notes||'',color:ft.properties?.color||'#b88cff',radius:Number(ft.properties?.radius_m||500),geometry:g}]});customZones=[...incoming,...customZones];saveCustomZones();renderCustom();alert(`已导入 ${incoming.length} 个区域`);}catch{alert('导入失败，请确认是有效GeoJSON');}els.fileInput.value='';};
  els.exportBtn.onclick=()=>{const features=customZones.map(z=>({type:'Feature',geometry:z.geometry,properties:{name:z.name,notes:z.note||'',color:z.color||'#b88cff',radius_m:z.radius||undefined}}));const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({type:'FeatureCollection',features},null,2)],{type:'application/geo+json'}));a.download=`zhuhai-airwise-zones-${new Date().toISOString().slice(0,10)}.geojson`;a.click();URL.revokeObjectURL(a.href);};

  if(L.Control.Draw){
    const drawItems=new L.FeatureGroup().addTo(map);
    map.addControl(new L.Control.Draw({position:'topright',edit:{featureGroup:drawItems},draw:{polyline:false,marker:false,circlemarker:false,rectangle:true,polygon:true,circle:true}}));
    map.on(L.Draw.Event.CREATED,e=>{const layer=e.layer;drawItems.addLayer(layer);let zone=null;if(e.layerType==='circle'){const c=layer.getLatLng();zone={name:'我的区域',note:'手动绘制',color:'#b88cff',radius:layer.getRadius(),geometry:{type:'Point',coordinates:[c.lng,c.lat]}};}else{const g=layer.toGeoJSON().geometry;zone={name:'我的区域',note:'手动绘制',color:'#b88cff',geometry:g};}customZones.unshift(zone);saveCustomZones();renderCustom();drawItems.clearLayers();});
  }

  updateLayerCount();
})();
