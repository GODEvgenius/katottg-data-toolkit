/* Settlement summaries shared by the registry and data converter. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StatusSummary = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function rawCategory(item) {
    if (!item || !item.is_occupied) return 'safe';
    const status = String(item.status || '').toLowerCase();
    if (status.includes('активн')) return 'active';
    if (status.includes('можлив')) return 'possible';
    return 'occupied';
  }

  function buildIndex(data) {
    const byCode = new Map();
    for (const item of data) {
      // Legacy city-district records may repeat their special city's code.
      const previous = byCode.get(item.katottg);
      if (!previous || item.admin_level < previous.admin_level) byCode.set(item.katottg, item);
    }
    const index = new Map();
    for (const item of data) {
      if (item.admin_level !== 4) continue;
      let parent = byCode.get(item.parent_katottg);
      const visited = new Set();
      while (parent && !visited.has(parent.katottg)) {
        visited.add(parent.katottg);
        if ([1, 2, 3].includes(parent.admin_level)) {
          if (!index.has(parent.katottg)) index.set(parent.katottg, {
            total: 0, affected: 0, cityDistricts: 0,
            counts: { occupied: 0, active: 0, possible: 0, safe: 0 },
            registries: { yes: 0, no: 0, unknown: 0 }
          });
          const summary = index.get(parent.katottg);
          const category = rawCategory(item);
          summary.total++;
          summary.counts[category]++;
          if (category !== 'safe') summary.affected++;
          if (item.category === 'B') summary.cityDistricts++;
          summary.registries[item.systems_active === 'Так' ? 'yes' : item.systems_active === 'Ні' ? 'no' : 'unknown']++;
        }
        parent = byCode.get(parent.parent_katottg);
      }
    }
    for (const summary of index.values()) {
      summary.group = summary.affected === 0 ? 'safe' : summary.affected === summary.total ? 'occupied' : 'mixed';
      summary.category = summary.group === 'mixed' ? 'mixed' : summary.group === 'safe' ? 'safe' :
        ['occupied', 'active', 'possible'].reduce((best, key) => summary.counts[key] > summary.counts[best] ? key : best, 'occupied');
    }
    return index;
  }

  function plural(n, one, few, many) {
    return n % 100 >= 11 && n % 100 <= 19 ? many : n % 10 === 1 ? one : n % 10 >= 2 && n % 10 <= 4 ? few : many;
  }

  function unit(summary, count) {
    return summary.cityDistricts === summary.total
      ? plural(count, 'район міста', 'райони міста', 'районів міста')
      : plural(count, 'населений пункт', 'населені пункти', 'населених пунктів');
  }

  function statusText(summary) {
    const n = value => value.toLocaleString('uk-UA');
    if (summary.group === 'safe') return `Під контролем України: усі ${n(summary.total)} ${unit(summary, summary.total)}`;
    if (summary.group === 'occupied') return `ТОТ / бойові дії: усі ${n(summary.total)} ${unit(summary, summary.total)}`;
    return `ТОТ / бойові дії: ${n(summary.affected)} з ${n(summary.total)} ${unit(summary, summary.total)}`;
  }

  function applyToParents(data) {
    const index = buildIndex(data);
    for (const item of data) {
      if (![1, 2, 3].includes(item.admin_level)) continue;
      const summary = index.get(item.katottg);
      if (!summary) continue;
      item.source_status = item.status;
      item.source_is_occupied = item.is_occupied;
      item.status_basis = 'settlements';
      item.settlements_total = summary.total;
      item.settlements_occupied = summary.affected;
      item.settlements_status_counts = { ...summary.counts };
      item.settlements_group = summary.group;
      item.status = statusText(summary);
      item.is_occupied = summary.affected > 0;
    }
    return index;
  }

  return { rawCategory, buildIndex, statusText, unit, applyToParents };
});
