(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RegistryUrlState = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const keys = ['view', 'region', 'raion', 'hromada', 'hromada_name', 'q', 'mode', 'status', 'registries', 'level', 'card', 'mapobject'];
  function read(href) {
    const p = new URL(href).searchParams;
    const enumValue = (key, allowed, fallback) => allowed.includes(p.get(key)) ? p.get(key) : fallback;
    const code = key => /^UA\d{17}$/.test(p.get(key) || '') ? p.get(key) : null;
    return {
      view: enumValue('view', ['table', 'hierarchy', 'map'], 'table'),
      level: enumValue('level', ['all', '1', '2', '3', '4'], null),
      mode: enumValue('mode', ['all', 'safe', 'mixed', 'occupied'], 'all'),
      status: enumValue('status', ['all', 'safe', 'occupied', 'active', 'possible'], 'all'),
      registries: enumValue('registries', ['all', 'yes', 'no'], 'all'),
      q: p.get('q') || '', region: code('region'), raion: code('raion'), hromada: code('hromada'),
      hromada_name: p.get('hromada_name') || '', card: code('card'), mapobject: code('mapobject')
    };
  }
  function write(href, state) {
    const url = new URL(href);
    for (const key of keys) {
      if (state[key] == null || state[key] === '' || (['mode', 'status', 'registries'].includes(key) && state[key] === 'all')) url.searchParams.delete(key);
      else url.searchParams.set(key, state[key]);
    }
    return url.href;
  }
  return { read, write };
});
