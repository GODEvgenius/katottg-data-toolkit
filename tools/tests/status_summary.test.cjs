const assert = require('node:assert/strict');
const Summary = require('../status_summary.js');
const UrlState = require('../registry_url_state.js');
const core = require('../prepare_data_core.js');
const { makeFixture, code } = require('./fixtures.cjs');
const { data, codes: fixtureCodes } = makeFixture();

const index = Summary.buildIndex(data);
const full = index.get(fixtureCodes.full);
assert.equal(full.total, 2);
assert.equal(full.affected, 2);
assert.equal(full.group, 'occupied');
assert(!Summary.statusText(full).includes('Частково'));
const almost = index.get(fixtureCodes.almost);
assert.equal(almost.total, 1001);
assert.equal(almost.affected, 1000);
assert.equal(almost.counts.safe, 1);
assert.equal(almost.group, 'mixed');
assert(!Summary.statusText(almost).includes('100%'));
const buckets = { safe: 0, mixed: 0, occupied: 0 };
for (const item of data.filter(item => item.admin_level === 1)) buckets[index.get(item.katottg).group]++;
assert.deepEqual(buckets, { safe: 2, mixed: 2, occupied: 1 });
for (const summary of index.values()) {
  assert.equal(Object.values(summary.counts).reduce((sum, n) => sum + n, 0), summary.total);
  assert.equal(summary.affected + summary.counts.safe, summary.total);
  assert.equal(['safe', 'mixed', 'occupied'].filter(group => summary.group === group).length, 1);
}

const codes = [2001, 2002, 2003, 2004, 2005].map(code);
const native = codes.map((katottg, i) => ({ katottg, admin_level: Math.min(i + 1, 4), parent_katottg: i ? codes[Math.min(i - 1, 2)] : null,
  name: String(i), category: i > 2 ? 'C' : ['O', 'P', 'H'][i], region_name: i ? '0' : '', raion_name: i > 1 ? '1' : '', hromada_name: i > 2 ? '2' : '', sources: [] }));
const order = (katottg, status) => ({ katottg, status, date_start: '01.01.2024', date_end: null, systems_active: 'Ні', sources: [] });
const merged = core.mergeData(native, [order(codes[3], 'Територія активних бойових дій'), order(codes[4], 'Тимчасово окупована територія')]).data;
for (const item of merged.filter(item => item.admin_level < 4)) {
  assert.equal(item.settlements_total, 2);
  assert.equal(item.settlements_occupied, 2);
  assert.equal(item.settlements_group, 'occupied');
  assert.equal(item.status_basis, 'settlements');
  assert(!item.status.includes('Частково'));
  assert.equal(item.source_is_occupied, false);
  assert.equal(item.history.length, 0, 'A calculated summary must not create an order history');
}
assert.equal(merged.find(item => item.katottg === codes[3]).history.length, 1);
const legacy = structuredClone(data);
Summary.applyToParents(legacy);
assert.equal(legacy.filter(item => item.admin_level === 4 && item.status_basis === 'settlements').length, 0);
assert.equal(index.get(fixtureCodes.city).cityDistricts, 3);

const state = { view: 'hierarchy', level: '4', region: codes[0], raion: codes[1], hromada: codes[2], q: 'Назва & код',
  mode: 'occupied', status: 'active', registries: 'no', card: codes[3], mapobject: null, hromada_name: '' };
assert.deepEqual(UrlState.read(UrlState.write('http://127.0.0.1:8765/', state)), state);
assert.equal(UrlState.read('http://127.0.0.1:8765/?view=bad&level=99&mode=bad&card=garbage').view, 'table');
assert.equal(UrlState.read('http://127.0.0.1:8765/?card=garbage').card, null);
console.log('PASS: synthetic counts, disjoint groups, exact fractions, legacy city codes, converter parent summaries, source history and URL state');
