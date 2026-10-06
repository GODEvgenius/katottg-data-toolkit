/* Viewport-only settlement polygons. No dataset is embedded in this module. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SettlementMap = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function geometryBounds(geometry) {
    if (!geometry) return null;
    let box = null;
    function visit(coordinates) {
      if (!Array.isArray(coordinates)) return;
      if (typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
        const [x, y] = coordinates;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        if (!box) box = [x, y, x, y];
        else { box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y); }
      } else coordinates.forEach(visit);
    }
    if (geometry.type === 'GeometryCollection') {
      for (const child of geometry.geometries || []) {
        const b = geometryBounds(child);
        if (b) { visit([b[0], b[1]]); visit([b[2], b[3]]); }
      }
    } else visit(geometry.coordinates);
    return box;
  }

  function intersects(a, b) {
    return !!(a && b && a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]);
  }

  function regionCode(feature) {
    const p = feature.properties || {};
    for (const code of [p.adm1_pcode, p.katottg]) if (/^UA\d{2}/.test(code || '')) return code.slice(0, 4);
    return null;
  }

  function createViewportLayer({ map, L, loadGeoJson, style, onFeature, onStatus, minZoom = 8,
    yieldTask = () => new Promise(resolve => setTimeout(resolve, 0)), batchSize = 80 }) {
    const renderer = L.canvas({ padding: 0.2 });
    const layer = L.featureGroup();
    const context = L.geoJSON(null, { renderer, interactive: false, smoothFactor: 2,
      style: { color: '#94a3b8', weight: 0.8, opacity: 0.6, fill: false } });
    const options = { renderer, smoothFactor: 1.5, style,
      onEachFeature: (feature, path) => path.on('click', () => onFeature(feature)) };
    const visible = new Map();
    const indexes = new Map();
    let regionsPromise = null;
    let active = false;
    let revision = 0;
    let useMonolith = false;

    function cancel() {
      active = false; revision++;
      if (map.hasLayer(layer)) map.removeLayer(layer);
      if (map.hasLayer(context)) map.removeLayer(context);
    }
    function invalidate() { revision++; }
    const valid = token => active && token === revision;

    async function regions() {
      if (!regionsPromise) regionsPromise = loadGeoJson(1).then(geo => {
        context.addData(geo);
        return (geo.features || []).map(feature => ({ code: regionCode(feature), bounds: geometryBounds(feature.geometry) }));
      }).catch(error => {
        if (error.status === 404) return []; // A settlement-only legacy package can still use its full layer.
        regionsPromise = null; throw error;
      });
      return regionsPromise;
    }

    async function index(key, token) {
      if (indexes.has(key)) return indexes.get(key);
      const geo = await loadGeoJson(key);
      if (!valid(token)) return [];
      const entries = [];
      const features = geo.features || [];
      for (let i = 0; i < features.length; i++) {
        entries.push({ key: key + ':' + i, feature: features[i], bounds: geometryBounds(features[i].geometry) });
        if ((i + 1) % batchSize === 0) { await yieldTask(); if (!valid(token)) return []; }
      }
      indexes.set(key, entries);
      // Keep a bounded number of regional geometry indexes after travelling across the country.
      if (indexes.size > 8) indexes.delete(indexes.keys().next().value);
      return entries;
    }

    async function refresh() {
      active = true;
      const token = ++revision;
      onStatus({ phase: 'loading', minZoom });
      try {
        const regionList = await regions();
        if (!valid(token)) return;
        if (!regionList.some(region => region.code)) useMonolith = true;
        if (!map.hasLayer(context)) context.addTo(map);
        if (!map.hasLayer(layer)) layer.addTo(map);
        if (map.getZoom() < minZoom) {
          layer.clearLayers(); visible.clear();
          onStatus({ phase: 'overview', shown: 0, minZoom });
          return;
        }
        const bounds = map.getBounds().pad(0.15);
        const box = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
        const codes = [...new Set(regionList.filter(r => r.code && intersects(r.bounds, box)).map(r => r.code))];
        const desired = new Map();
        let next = 0;
        let failed = false;
        async function worker() {
          while (next < codes.length && valid(token) && !useMonolith) {
            const code = codes[next++];
            try {
              const entries = await index('admin4_by_oblast/' + code, token);
              if (!valid(token)) return;
              for (const entry of entries) if (intersects(entry.bounds, box)) desired.set(entry.key, entry);
            } catch (error) {
              // Older packages can omit regional chunks; retain compatibility with their full layer.
              if (error.status === 404) useMonolith = true;
              else { failed = true; console.error(error); }
            }
          }
        }
        await Promise.all([worker(), worker()]);
        if (!valid(token)) return;
        if (useMonolith) {
          desired.clear();
          for (const entry of await index(4, token)) if (intersects(entry.bounds, box)) desired.set(entry.key, entry);
        }
        if (!valid(token)) return;
        for (const [key, path] of visible) if (!desired.has(key)) { layer.removeLayer(path); visible.delete(key); }
        let count = 0;
        for (const [key, entry] of desired) {
          if (!valid(token)) return;
          const old = visible.get(key);
          if (old) old.setStyle(style(entry.feature));
          else {
            const path = L.geoJSON(entry.feature, options).getLayers()[0];
            if (path) { layer.addLayer(path); visible.set(key, path); }
          }
          if (++count % batchSize === 0) { await yieldTask(); if (!valid(token)) return; }
        }
        if (valid(token)) onStatus({ phase: failed ? 'partial' : 'ready', shown: visible.size, minZoom });
      } catch (error) {
        if (valid(token)) { console.error(error); onStatus({ phase: 'error', minZoom }); }
      }
    }
    return { layer, refresh, cancel, invalidate, minZoom };
  }
  return { geometryBounds, intersects, regionCode, createViewportLayer };
});
