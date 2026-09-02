(() => {
  const data = window.AIRWISE_DATA;
  if (!data || !Array.isArray(data.uomRects) || !data.uomRects.length) return;

  const PI = Math.PI;
  const A = 6378245.0;
  const EE = 0.00669342162296594323;

  function outOfChina(lng, lat) {
    return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
  }
  function transformLat(x, y) {
    let ret = -100 + 2*x + 3*y + 0.2*y*y + 0.1*x*y + 0.2*Math.sqrt(Math.abs(x));
    ret += (20*Math.sin(6*x*PI) + 20*Math.sin(2*x*PI))*2/3;
    ret += (20*Math.sin(y*PI) + 40*Math.sin(y/3*PI))*2/3;
    ret += (160*Math.sin(y/12*PI) + 320*Math.sin(y*PI/30))*2/3;
    return ret;
  }
  function transformLng(x, y) {
    let ret = 300 + x + 2*y + 0.1*x*x + 0.1*x*y + 0.1*Math.sqrt(Math.abs(x));
    ret += (20*Math.sin(6*x*PI) + 20*Math.sin(2*x*PI))*2/3;
    ret += (20*Math.sin(x*PI) + 40*Math.sin(x/3*PI))*2/3;
    ret += (150*Math.sin(x/12*PI) + 300*Math.sin(x/30*PI))*2/3;
    return ret;
  }
  function wgsToGcj(lng, lat) {
    if (outOfChina(lng, lat)) return [lng, lat];
    let dLat = transformLat(lng - 105, lat - 35);
    let dLng = transformLng(lng - 105, lat - 35);
    const radLat = lat / 180 * PI;
    let magic = Math.sin(radLat);
    magic = 1 - EE * magic * magic;
    const sqrtMagic = Math.sqrt(magic);
    dLat = dLat * 180 / ((A * (1 - EE)) / (magic * sqrtMagic) * PI);
    dLng = dLng * 180 / (A / sqrtMagic * Math.cos(radLat) * PI);
    return [lng + dLng, lat + dLat];
  }
  function gcjToWgs(lng, lat) {
    if (outOfChina(lng, lat)) return [lng, lat];
    let wLng = lng, wLat = lat;
    for (let i = 0; i < 5; i++) {
      const [gLng, gLat] = wgsToGcj(wLng, wLat);
      wLng -= (gLng - lng);
      wLat -= (gLat - lat);
    }
    return [wLng, wLat];
  }

  data.uomRects = data.uomRects.map(([west, south, east, north]) => {
    const corners = [
      gcjToWgs(west, south), gcjToWgs(west, north),
      gcjToWgs(east, south), gcjToWgs(east, north)
    ];
    const lngs = corners.map(p => p[0]);
    const lats = corners.map(p => p[1]);
    return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
  });
  data.uomCoordinateFix = 'GCJ-02→WGS-84';

  // The local mask is made of many scanline rectangles. Suppress their individual outlines
  // so the union looks like UOM's continuous cyan airspace instead of a striped grid.
  if (window.L && L.rectangle && !L.__airwiseBlueRectPatched) {
    const originalRectangle = L.rectangle;
    L.rectangle = function(bounds, options) {
      if (options && options.pane === 'airwise-blue') {
        options = { ...options, stroke: false, weight: 0, opacity: 0, fillOpacity: 0.26 };
      }
      return originalRectangle.call(this, bounds, options);
    };
    L.__airwiseBlueRectPatched = true;
  }

  const status = document.getElementById('uomStatus');
  if (status) status.textContent = '本地UOM蓝区已完成GCJ‑02→WGS‑84坐标校正；起飞前仍请打开UOM核验实时空域。';
})();
