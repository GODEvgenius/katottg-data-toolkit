// Fictional, generated test records. No source dataset or geometry is included.
const code = n => 'UA' + String(99000000000000000n + BigInt(n)).padStart(17, '0');
const names = { full: 'Тестова повністю зачеплена', mixed: 'Тестова змішана',
  safe: 'Тестова контрольована', city: 'Тестове місто', almost: 'Тестова майже зачеплена',
  district: 'Тестовий перший', community: 'Тестова однакова' };

function makeFixture() {
  let next = 1;
  const data = [];
  function add(level, name, parent = null, status = 'safe', category = ['O', 'P', 'H', 'C'][level - 1]) {
    const item = { katottg: code(next++), admin_level: level, name, name_ua: name, category,
      category_name: ['Область', 'Район', 'Територіальна громада', 'Населений пункт'][level - 1],
      parent_katottg: parent?.katottg || null,
      region_name: parent ? (parent.admin_level === 1 ? parent.name : parent.region_name) : '',
      raion_name: parent ? (parent.admin_level === 2 ? parent.name : parent.raion_name) : '',
      hromada_name: parent ? (parent.admin_level === 3 ? parent.name : parent.hromada_name) : '',
      is_occupied: status !== 'safe', systems_active: status === 'safe' ? 'Так' : 'Ні',
      status: { safe: 'Під контролем України', occupied: 'Тимчасово окупована територія',
        active: 'Територія активних бойових дій', possible: 'Територія можливих бойових дій' }[status],
      history: [], sources: [], date_start: null, date_end: null };
    item.katottg_key5 = item.katottg.slice(-5);
    data.push(item);
    return item;
  }
  function branch(region, districtName, communityName, statuses) {
    const district = add(2, districtName, region);
    const community = add(3, communityName, district);
    statuses.forEach((status, i) => add(4, 'Тестовий населений пункт ' + (i + 1), community, status));
    return { district, community };
  }
  const full = add(1, names.full);
  branch(full, 'Тестовий зачеплений район', 'Тестова зачеплена громада', ['occupied', 'occupied']);
  const mixed = add(1, names.mixed);
  const first = branch(mixed, names.district, names.community, ['occupied', 'active', 'possible']);
  const duplicateCommunity = add(3, names.community, first.district);
  ['safe', 'possible'].forEach((status, i) => add(4, 'Тестовий тезка ' + (i + 1), duplicateCommunity, status));
  branch(mixed, 'Тестовий другий', 'Тестова інша громада', ['safe', 'safe']);
  const safe = add(1, names.safe);
  branch(safe, 'Тестовий контрольований район', 'Тестова контрольована громада', ['safe']);
  const city = add(1, names.city, null, 'safe', 'K');
  for (let i = 0; i < 3; i++) {
    const district = add(4, 'Тестовий район міста ' + (i + 1), city, 'safe', 'B');
    // Reproduce a legacy repeated city code without copying real records.
    if (i === 0) { district.katottg = city.katottg; district.katottg_key5 = city.katottg_key5; }
  }
  const almost = add(1, names.almost);
  branch(almost, 'Тестовий майже зачеплений район', 'Тестова майже зачеплена громада',
    Array.from({ length: 1001 }, (_, i) => i < 1000 ? 'occupied' : 'safe'));
  return { data, codes: { full: full.katottg, mixed: mixed.katottg, city: city.katottg,
    almost: almost.katottg, community: first.community.katottg,
    leaf: data.find(item => item.parent_katottg === first.community.katottg).katottg } };
}
module.exports = { makeFixture, code, names };
