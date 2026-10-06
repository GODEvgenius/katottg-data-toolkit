// Fictional polygons: exercise viewport loading, reuse, retries and stale async work.
const assert = require('node:assert/strict');
const { geometryBounds, intersects, regionCode, createViewportLayer } = require('../settlement_map.js');
const polygon = (code, x, y, size = 1) => ({ type: 'Feature', properties: { katottg: code },
  geometry: { type: 'Polygon', coordinates: [[[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]]] } });
const collection = features => ({ type: 'FeatureCollection', features });
const regions = collection([polygon('UA010000', 0, 0, 10), polygon('UA020000', 20, 0, 10)]);
const one = polygon('UA010001', 1, 1), two = polygon('UA010002', 7, 7), three = polygon('UA020001', 21, 1);
assert.deepEqual(geometryBounds({ type: 'MultiPolygon', coordinates: [[one.geometry.coordinates], [two.geometry.coordinates]] }), [1, 1, 8, 8]);
assert.deepEqual(geometryBounds({ type: 'GeometryCollection', geometries: [one.geometry, three.geometry] }), [1, 1, 22, 2]);
assert.equal(geometryBounds({ type: 'Polygon', coordinates: [] }), null);
assert(intersects([0, 0, 1, 1], [1, 1, 2, 2]));
assert(!intersects([0, 0, 1, 1], [2, 2, 3, 3]));
assert.equal(regionCode({ properties: { adm1_pcode: 'UA01', katottg: 'UA020000' } }), 'UA01');

class Group {
  constructor() { this.layers = new Set(); }
  addTo(map) { map.layers.add(this); return this; }
  addLayer(path) { this.layers.add(path); }
  removeLayer(path) { this.layers.delete(path); }
  clearLayers() { this.layers.clear(); }
  addData() {}
}
function setup(extra = {}) {
  const calls = [], states = [], clicks = [];
  const map = { layers: new Set(), zoom: 6, box: [0, 0, 4, 4],
    hasLayer(layer) { return this.layers.has(layer); }, removeLayer(layer) { this.layers.delete(layer); },
    getZoom() { return this.zoom; },
    getBounds() { const b = this.box; return { pad() { return this; }, getWest: () => b[0], getSouth: () => b[1], getEast: () => b[2], getNorth: () => b[3] }; }
  };
  const L = { canvas: () => ({}), featureGroup: () => new Group(),
    geoJSON(feature, options) {
      if (!feature) return new Group();
      const path = { feature, options: { ...options.style(feature) }, handlers: {},
        on(name, fn) { this.handlers[name] = fn; }, setStyle(value) { this.options = value; } };
      options.onEachFeature(feature, path);
      return { getLayers: () => [path] };
    }
  };
  const files = { 1: regions, 'admin4_by_oblast/UA01': collection([one, two]), 'admin4_by_oblast/UA02': collection([three]), 4: collection([one, two, three]) };
  let color = 'green';
  const controller = createViewportLayer({ map, L,
    loadGeoJson: async key => { calls.push(key); return files[key]; },
    style: () => ({ color }), onFeature: feature => clicks.push(feature), onStatus: state => states.push(state),
    yieldTask: async () => {}, ...extra });
  return { controller, map, calls, states, clicks, setColor: value => { color = value; } };
}

async function test() {
  const s = setup();
  await s.controller.refresh();
  assert.deepEqual(s.calls, [1]); // National overview never requests the large settlement layer.
  assert.equal(s.states.at(-1).phase, 'overview');
  s.map.zoom = 8;
  await s.controller.refresh();
  assert.deepEqual(s.calls, [1, 'admin4_by_oblast/UA01']);
  assert.equal(s.controller.layer.layers.size, 1);
  const first = [...s.controller.layer.layers][0];
  first.handlers.click(); assert.equal(s.clicks[0], one);
  s.setColor('red'); await s.controller.refresh();
  assert.equal([...s.controller.layer.layers][0], first); // Reuse visible paths, update filter styling.
  assert.equal(first.options.color, 'red');
  s.map.box = [6, 6, 9, 9]; await s.controller.refresh();
  assert.equal([...s.controller.layer.layers][0].feature, two);
  assert.equal(s.calls.length, 2); // Same regional geometry is cached.
  s.map.box = [20, 0, 24, 4]; await s.controller.refresh();
  assert.equal([...s.controller.layer.layers][0].feature, three);
  assert.equal(s.states.at(-1).shown, 1);
  s.controller.cancel(); assert.equal(s.map.layers.size, 0);

  let release;
  const late = setup({ loadGeoJson: key => key === 1 ? Promise.resolve(regions) : new Promise(resolve => { release = resolve; }) });
  late.map.zoom = 8;
  const pending = late.controller.refresh();
  while (!release) await Promise.resolve();
  late.controller.cancel(); release(collection([one])); await pending;
  assert.equal(late.map.layers.size, 0);
  assert.equal(late.controller.layer.layers.size, 0); // A finished old request cannot restore the layer.

  let finishOld;
  const race = setup({ loadGeoJson: key => {
    if (key === 1) return Promise.resolve(regions);
    if (key.endsWith('UA01')) return new Promise(resolve => { finishOld = resolve; });
    return Promise.resolve(collection([three]));
  } });
  race.map.zoom = 8;
  const oldView = race.controller.refresh();
  while (!finishOld) await Promise.resolve();
  race.map.box = [20, 0, 24, 4]; await race.controller.refresh();
  finishOld(collection([one])); await oldView;
  assert.equal([...race.controller.layer.layers][0].feature, three);
  assert.equal(race.states.at(-1).phase, 'ready');

  let paused, continueBatch;
  const batched = setup({ batchSize: 1, yieldTask: () => new Promise(resolve => { paused = true; continueBatch = resolve; }) });
  batched.map.zoom = 8;
  const building = batched.controller.refresh();
  while (!paused) await Promise.resolve();
  batched.controller.cancel(); continueBatch(); await building;
  assert.equal(batched.controller.layer.layers.size, 0);

  const fallbackCalls = [];
  const fallback = setup({ loadGeoJson: async key => {
    fallbackCalls.push(key);
    if (key === 1) return regions;
    if (key === 4) return collection([one, two, three]);
    throw Object.assign(new Error('Missing optional chunk'), { status: 404 });
  } });
  fallback.map.zoom = 8; await fallback.controller.refresh();
  assert.deepEqual(fallbackCalls, [1, 'admin4_by_oblast/UA01', 4]);
  assert.equal(fallback.controller.layer.layers.size, 1);
  await fallback.controller.refresh(); assert.equal(fallbackCalls.length, 3);

  const settlementsOnly = setup({ loadGeoJson: async key => {
    if (key === 1) throw Object.assign(new Error('No region layer'), { status: 404 });
    assert.equal(key, 4); return collection([one, two, three]);
  } });
  settlementsOnly.map.zoom = 8; await settlementsOnly.controller.refresh();
  assert.equal(settlementsOnly.states.at(-1).phase, 'ready');
  assert.equal(settlementsOnly.controller.layer.layers.size, 1);

  let fail = true;
  const retry = setup({ loadGeoJson: async key => {
    if (key === 1 && fail) { fail = false; throw new Error('Temporary connection failure'); }
    return key === 1 ? regions : collection([one]);
  } });
  const originalError = console.error; console.error = () => {};
  try { await retry.controller.refresh(); } finally { console.error = originalError; }
  assert.equal(retry.states.at(-1).phase, 'error');
  retry.map.zoom = 8; await retry.controller.refresh();
  assert.equal(retry.states.at(-1).phase, 'ready');
  console.log('PASS: settlement viewport loading, overview, path reuse, filter styling, clicks, cancellation during fetch/batches, legacy fallback and retry');
}
test().catch(error => { console.error(error); process.exitCode = 1; });
