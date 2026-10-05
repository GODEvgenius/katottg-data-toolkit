// Tests the actual registry functions with a small DOM substitute; no browser or network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require.resolve('../../index.html'), 'utf8');
const { makeFixture, names } = require('./fixtures.cjs');
const { data, codes } = makeFixture();
const elements = new Map();
class Element {
  constructor() {
    this.value = ''; this.textContent = ''; this.style = {}; this.children = []; this.attributes = {};
    this.classes = new Set(); this.classList = {
      add: (...names) => names.forEach(name => this.classes.add(name)),
      remove: (...names) => names.forEach(name => this.classes.delete(name)),
      contains: name => this.classes.has(name),
      toggle: (name, force) => { const on = force === undefined ? !this.classes.has(name) : force; on ? this.classes.add(name) : this.classes.delete(name); return on; }
    };
  }
  addEventListener() {}
  appendChild(child) { this.children.push(child); return child; }
  append(...children) { this.children.push(...children); }
  setAttribute(key, value) { this.attributes[key] = value; }
  getAttribute(key) { return this.attributes[key]; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  get selectedOptions() { return [{ textContent: this.value }]; }
}
const element = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
for (const m of html.matchAll(/\bid="([^"]+)"/g)) element(m[1]);
for (const id of ['selectStatusCategory', 'selectRegistries']) element(id).value = 'all';
element('selectLevel').value = '4';
element('objectCardModal').classList.add('hidden'); element('mapObjectSidebar').classList.add('hidden');
const context = { console, URL, Map, Set, StatusSummary: require('../status_summary.js'), RegistryUrlState: require('../registry_url_state.js'),
  lucide: { createIcons() {} }, location: { href: 'http://127.0.0.1:8765/' },
  document: { getElementById: element, createElement: () => new Element(), querySelectorAll: () => [], addEventListener() {}, body: new Element() },
  addEventListener() {}, setTimeout() {}, requestAnimationFrame: fn => fn(),
  navigator: { clipboard: { writeText: async () => {} } }
};
context.window = context;
context.history = { replaceState: (_, __, href) => { context.location.href = href; } };
vm.createContext(context);
const script = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].find(m => m[2].includes('// ===== STATE ====='))[2];
vm.runInContext(script, context);
context.fixture = data;
vm.runInContext(`
  allData = fixture; statusSummaryIndex = StatusSummary.buildIndex(allData);
  allDataByKatottg = new Map();
  for (const item of allData) { const old = allDataByKatottg.get(item.katottg); if (!old || old.admin_level > item.admin_level) allDataByKatottg.set(item.katottg, item); }
  renderTable = () => {};
  renderHierarchy = () => { hierarchyVisibleItems = getHierItems().filter(matchesSearch); };
  renderMapSearchResults = () => {};
  initMapIfNeeded = () => { mapInitialized = true; };
  restoringUrl = false;
`, context);
const run = source => vm.runInContext(source, context);
run("switchView('hierarchy')");
assert.equal(element('lblFilteredCount').textContent, '5');
assert.equal(element('lblResultUnit').textContent, 'регіонів');
assert.equal(element('badgeCountSafe').textContent, '2');
assert.equal(element('badgeCountMixed').textContent, '2');
assert.equal(element('badgeCountOccupied').textContent, '1');
for (const [mode, count] of [['safe', 2], ['mixed', 2], ['occupied', 1]]) {
  run(`setFilterMode('${mode}')`);
  assert.equal(Number(element('lblFilteredCount').textContent), count);
}
run(`setFilterMode('all'); navigateHierarchy(2, '${names.mixed}')`);
assert.equal(element('lblFilteredCount').textContent, '2');
run(`navigateHierarchy(3, '${names.mixed}', '${names.district}')`);
element('filterSearchInput').value = names.community; run('applyFilters()');
assert.equal(element('lblFilteredCount').textContent, '2');
run(`navigateHierarchy(4, '${names.mixed}', '${names.district}', '${names.community}', '${codes.community}')`);
assert.equal(element('lblFilteredCount').textContent, '3');
run(`showObjectCard('${codes.leaf}')`);
const link = context.location.href;
assert(link.includes('hromada=' + codes.community));
assert(link.includes('card=' + codes.leaf));
async function finish() {
  await run('restoreUrlState()');
  assert.equal(element('lblFilteredCount').textContent, '3');
  assert.equal(element('objCardKatottg').textContent, codes.leaf);
  assert.equal(context.location.href, link);
  run("closeObjectCard(); navigateHierarchy(1); currentMapLevel = 1; currentView = 'map'; applyFilters()");
  const full = run(`getMapStyle({properties:{katottg:'${codes.full}'}})`);
  const mixed = run(`getMapStyle({properties:{katottg:'${codes.mixed}'}})`);
  assert.equal(full.fillColor, '#ef4444');
  assert.equal(mixed.fillColor, '#8b5cf6');
  run("setFilterMode('mixed')");
  assert.equal(run(`getMapStyle({properties:{katottg:'${codes.full}'}}).fillOpacity`), 0.04);
  assert.equal(run(`getMapStyle({properties:{katottg:'${codes.mixed}'}}).fillColor`), '#8b5cf6');
  run("currentView='hierarchy'; setFilterMode('all')");
  const csv = run('buildCurrentCsv()');
  assert.equal(csv.split('\r\n').length, 6);
  assert(csv.includes('7;1;1;2;3'));
  element('filterSearchInput').value = names.mixed;
  element('selectStatusCategory').value = 'possible'; element('selectRegistries').value = 'no';
  run(`currentFilterMode='mixed'; applyFilters(); showObjectCard('${codes.mixed}')`);
  const filteredLink = context.location.href;
  await run('restoreUrlState()');
  assert.equal(element('lblFilteredCount').textContent, '1');
  assert.equal(element('filterSearchInput').value, names.mixed);
  assert.equal(element('selectStatusCategory').value, 'possible');
  assert.equal(element('selectRegistries').value, 'no');
  assert.equal(context.location.href, filteredLink);
  assert(element('objCardStatusText').textContent.includes('4 з 7'));
  run(`showMapFeatureDetails({properties:{katottg:'${codes.mixed}'}})`);
  assert.equal(element('mapDetailStatusText').textContent, element('objCardStatusText').textContent);
  console.log('PASS: actual registry filters, hierarchy drill-down, duplicate names, exact community URL restoration, card restoration, map colors and CSV summaries');
}
finish().catch(error => { console.error(error); process.exitCode = 1; });
