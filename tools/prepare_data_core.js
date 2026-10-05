/* Shared import, merge and export logic for prepare_data.html. No server required. */
(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./status_summary.js') : root.StatusSummary);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PrepareData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (StatusSummary) {
  'use strict';

  const categoryNames = {
    O: 'Область / місто зі спеціальним статусом', K: 'Місто зі спеціальним статусом',
    P: 'Район', H: 'Територіальна громада', M: 'Місто', T: 'Селище міського типу',
    C: 'Село', X: 'Селище', B: 'Район у місті'
  };
  const levelNames = { 1: 'Область / Регіон', 2: 'Район', 3: 'Територіальна громада', 4: 'Населений пункт' };
  const columnLabels = {
    code: 'Код КАТОТТГ', region: 'Область', raion: 'Район', hromada: 'Громада',
    name: 'Населений пункт / назва', status: 'Статус', start: 'Дата початку',
    end: 'Дата завершення', systems: 'Функціонування систем', category: 'Категорія',
    level1: 'Перший рівень', level2: 'Другий рівень', level3: 'Третій рівень', level4: 'Четвертий рівень'
  };
  const text = value => String(value == null ? '' : value).replace(/\u00ad/g, '').replace(/\s+/g, ' ').trim();
  const lower = value => text(value).toLowerCase();
  const code = value => {
    const compact = text(value).toUpperCase().replace(/\s/g, '');
    return /^UA\d{17}$/.test(compact) ? compact : '';
  };
  const key5 = value => text(value).replace(/\D/g, '').slice(-5).padStart(5, '0');
  const date = value => {
    if (value instanceof Date && !isNaN(value)) {
      return `${String(value.getUTCDate()).padStart(2, '0')}.${String(value.getUTCMonth() + 1).padStart(2, '0')}.${value.getUTCFullYear()}`;
    }
    const s = text(value);
    if (!s || /^(?:[-–—]+|null|ні|немає)$/i.test(s)) return null;
    const dmy = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s.*)?$/);
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
    if (dmy) return `${dmy[1].padStart(2, '0')}.${dmy[2].padStart(2, '0')}.${dmy[3]}`;
    if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
    return s;
  };
  const dateValue = value => {
    const m = text(value).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : 0;
  };
  const inferLevel = value => {
    if (value.slice(9, 12) !== '000' || value.slice(12, 14) !== '00') return 4;
    if (value.slice(6, 9) !== '000') return 3;
    if (value.slice(4, 6) !== '00') return 2;
    return 1;
  };
  const prefix = (value, level) => value.slice(0, { 1: 4, 2: 6, 3: 9, 4: 12 }[level]);

  function descendants(node, name) {
    return Array.from(node.getElementsByTagNameNS('*', name));
  }
  function ancestor(node, name) {
    for (let p = node.parentNode; p; p = p.parentNode) if (p.localName === name) return p;
    return null;
  }
  function attribute(node, name) {
    if (!node) return '';
    const attr = Array.from(node.attributes).find(a => a.localName === name);
    return attr ? attr.value : '';
  }
  function cellText(cell) {
    // Keep paragraph and line boundaries so split header runs remain separate words.
    const chunks = [];
    function visit(node) {
      if (node.nodeType !== 1 || node.localName === 'del') return;
      if (node.localName === 't') chunks.push(node.textContent);
      else if (['br', 'tab', 'cr'].includes(node.localName)) chunks.push(' ');
      else {
        for (const child of Array.from(node.childNodes)) visit(child);
        if (node.localName === 'p') chunks.push(' ');
      }
    }
    visit(cell);
    return text(chunks.join(''));
  }

  function wordTables(xml, DOMParserClass) {
    const parser = new (DOMParserClass || globalThis.DOMParser)();
    const document = parser.parseFromString(xml, 'application/xml');
    if (descendants(document, 'parsererror').length) throw new Error('Пошкоджений XML документа Word.');
    return descendants(document, 'tbl').map((table, index) => {
      const vertical = [];
      const rows = descendants(table, 'tr').filter(row => ancestor(row, 'tbl') === table).map(row => {
        const values = [];
        const before = descendants(row, 'gridBefore').find(n => ancestor(n, 'tr') === row);
        let column = Number(attribute(before, 'val')) || 0;
        for (const cell of descendants(row, 'tc').filter(c => ancestor(c, 'tr') === row)) {
          const props = Array.from(cell.children).find(n => n.localName === 'tcPr');
          const spanNode = props && descendants(props, 'gridSpan')[0];
          const span = Math.max(1, Number(attribute(spanNode, 'val')) || 1);
          const merge = props && descendants(props, 'vMerge')[0];
          const continuation = merge && attribute(merge, 'val') !== 'restart';
          const content = cellText(cell);
          for (let offset = 0; offset < span; offset++) {
            const col = column + offset;
            values[col] = continuation ? (vertical[col] || content) : content;
            vertical[col] = merge ? values[col] : '';
          }
          column += span;
        }
        return values;
      });
      return { name: `Таблиця ${index + 1}`, rows };
    });
  }

  async function readTables(file, libraries) {
    const extension = file.name.split('.').pop().toLowerCase();
    if (extension === 'doc') throw new Error('Старий формат .doc не підтримується. Збережіть файл у Word як .docx.');
    if (!['docx', 'xlsx', 'xls'].includes(extension)) throw new Error('Оберіть файл .docx, .xlsx або .xls.');
    const data = await file.arrayBuffer();
    if (extension === 'docx') {
      if (!libraries.JSZip) throw new Error('Не завантажено модуль читання Word. Перевірте з’єднання та оновіть сторінку.');
      const archive = await libraries.JSZip.loadAsync(data);
      const entry = archive.file('word/document.xml');
      if (!entry) throw new Error('Файл не містить документа Word (word/document.xml).');
      const tables = wordTables(await entry.async('string'), libraries.DOMParser);
      if (!tables.length) throw new Error('У документі Word не знайдено таблиць.');
      return tables;
    }
    if (!libraries.XLSX) throw new Error('Не завантажено модуль Excel. Перевірте з’єднання та оновіть сторінку.');
    const workbook = libraries.XLSX.read(new Uint8Array(data), { type: 'array', cellDates: true });
    return workbook.SheetNames.map(name => {
      const sheet = workbook.Sheets[name];
      const range = libraries.XLSX.utils.decode_range(sheet['!ref'] || 'A1');
      range.s = { r: 0, c: 0 };
      const rows = libraries.XLSX.utils.sheet_to_json(sheet, { header: 1, range, defval: '', raw: true, blankrows: true });
      // SheetJS returns blank continuation cells for merged ranges. Expand only actual merges.
      for (const merge of sheet['!merges'] || []) {
        const value = (rows[merge.s.r] || [])[merge.s.c];
        for (let r = merge.s.r; r <= merge.e.r; r++) {
          if (!rows[r]) rows[r] = [];
          for (let c = merge.s.c; c <= merge.e.c; c++) if (!text(rows[r][c])) rows[r][c] = value;
        }
      }
      return { name, rows };
    });
  }

  function detectColumns(rows, kind, previous) {
    const firstData = rows.findIndex(row => row.some(value => code(value)));
    if (firstData < 0) return null;
    const width = Math.max(...rows.slice(0, firstData + 1).map(row => row.length));
    const headers = Array.from({ length: width }, (_, column) => {
      const parts = new Set(rows.slice(0, firstData).map(row => lower(row[column])).filter(s => s && !/^\d+$/.test(s)));
      return Array.from(parts).join(' ');
    });
    const find = matcher => headers.findIndex(h => matcher(h));
    const columns = {};
    const assign = (field, matcher) => { const i = find(matcher); if (i >= 0) columns[field] = i; };
    assign('code', h => /код|катоттг|katottg/.test(h) && !/рівень/.test(h));
    assign('status', h => h === 'status' || h === 'стан' || /стан територ|територія.*бойових|тимчасово окупована/.test(h) || /статус/.test(h) && !/спеціальн/.test(h));
    assign('start', h => h === 'date_start' || /дата.*почат|початок/.test(h));
    assign('end', h => h === 'date_end' || /дата.*заверш|дата.*припин|завершення/.test(h));
    assign('systems', h => h === 'systems_active' || /функціонування|систем/.test(h));
    assign('region', h => h === 'region_name' || /област|автономна|регіон/.test(h));
    assign('raion', h => h === 'raion_name' || /назва району|^район$/.test(h));
    assign('hromada', h => h === 'hromada_name' || /назва територіальної громади|^громада$/.test(h));
    assign('name', h => /^(name|name_ua|назва)$/.test(h) || /назва населеного|назва об.?єкта|назва адміністратив/.test(h));
    assign('category', h => h === 'category' || /категор/.test(h));
    ['перший', 'другий', 'третій', 'четвертий'].forEach((label, i) => assign(`level${i + 1}`, h => h.includes(label) && h.includes('рівень')));
    if (kind === 'kodifikator') {
      if ([1, 2, 3, 4].every(i => columns[`level${i}`] != null) && columns.name != null) return { columns, firstData, width, headers, inherited: false };
      return null;
    }
    // Continuation tables/sheets may repeat only numbered column headings.
    if (columns.status == null && previous && previous.width === width &&
        rows[firstData].some((v, i) => code(v) && i === previous.columns.code) &&
        rows.slice(0, firstData).every(row => row.every(v => !text(v) || /^\d+$/.test(text(v))))) {
      return { ...previous, firstData, inherited: true };
    }
    // The supplied ministry layout also has a stable nine-column numbered continuation.
    if (columns.status == null && width === 9 && code(rows[firstData][4]) && /бойов|окупован|контрол/i.test(text(rows[firstData][5]))) {
      return { columns: { region: 0, raion: 1, hromada: 2, name: 3, code: 4, status: 5, start: 6, end: 7, systems: 8 }, firstData, width, headers, inherited: true };
    }
    if (columns.code == null) {
      const i = rows[firstData].findIndex(v => code(v));
      if (i >= 0) columns.code = i;
    }
    if (columns.status == null || columns.code == null) return null;
    return { columns, firstData, width, headers, inherited: false };
  }

  function category(value) {
    const equivalents = { 'О': 'O', 'К': 'K', 'Р': 'P', 'Н': 'H', 'М': 'M', 'Т': 'T', 'С': 'C', 'Х': 'X', 'В': 'B' };
    const s = text(value).toUpperCase();
    return equivalents[s] || s;
  }
  function normalizeTables(tables, fileName, kind) {
    const records = [];
    const reports = [];
    let previous = null;
    // Re-import our canonical order sheet, not current-state and derived history sheets.
    const canonical = kind === 'occupation' && tables.find(table => table.name === 'Об’єднані накази');
    for (const table of tables) {
      if (canonical && table !== canonical) continue;
      const mapping = detectColumns(table.rows, kind, previous);
      const report = { file: fileName, table: table.name, rows: 0, skipped: 0, columns: mapping ? mapping.columns : {}, inherited: Boolean(mapping && mapping.inherited) };
      reports.push(report);
      if (!mapping) {
        report.warning = 'Не знайдено потрібних заголовків або кодів КАТОТТГ; таблицю пропущено.';
        continue;
      }
      previous = mapping;
      const c = mapping.columns;
      let parents = {};
      for (let r = mapping.firstData; r < table.rows.length; r++) {
        const row = table.rows[r];
        const get = field => c[field] == null ? '' : text(row[c[field]]);
        const source = { file: fileName, table: table.name, row: r + 1 };
        if (kind === 'occupation') {
          const k = code(get('code'));
          if (!k) {
            if (row.some(v => /UA\d/i.test(text(v)))) report.skipped++;
            continue;
          }
          if (!get('status')) { report.skipped++; continue; }
          records.push({ katottg: k, key5: key5(k), name: get('name'), region_name: get('region'), raion_name: get('raion'), hromada_name: get('hromada'), status: get('status'), date_start: date(row[c.start]), date_end: date(row[c.end]), systems_active: get('systems') || null, sources: [source] });
        } else {
          let level = 0;
          let k = '';
          for (let i = 4; i >= 1; i--) {
            const candidate = code(get(`level${i}`));
            if (candidate) { level = i; k = candidate; break; }
          }
          if (!k || !get('name')) { report.skipped++; continue; }
          // A fifth-level city district must not become a duplicate of its settlement.
          if (category(get('category')) === 'B') { report.skipped++; continue; }
          const parent = level > 1 ? code(get(`level${level - 1}`)) || (parents[level - 1] || {}).katottg || null : null;
          records.push({ katottg: k, admin_level: level, name: get('name'), category: category(get('category')), parent_katottg: parent, region_name: level > 1 ? (parents[1] || {}).name || '' : '', raion_name: level > 2 ? (parents[2] || {}).name || '' : '', hromada_name: level > 3 ? (parents[3] || {}).name || '' : '', sources: [source] });
          parents[level] = { katottg: k, name: get('name') };
          for (let i = level + 1; i <= 4; i++) delete parents[i];
        }
        report.rows++;
      }
      if (report.skipped) report.warning = `Пропущено ${report.skipped} рядків із неповними даними або додатковим рівнем.`;
    }
    if (!records.length) throw new Error(`${fileName}: не знайдено рядків ${kind === 'occupation' ? 'зі статусами' : 'кодифікатора'}. Перевірте таблиці та заголовки.`);
    return { records, reports };
  }

  function normalizeInputTables(tables, fileName) {
    const groups = { kodifikator: [], occupation: [] };
    const skipped = [];
    let previousOrder = null;
    for (const table of tables) {
      if (detectColumns(table.rows, 'kodifikator')) {
        groups.kodifikator.push(table);
        continue;
      }
      const orderMapping = detectColumns(table.rows, 'occupation', previousOrder);
      if (orderMapping) {
        groups.occupation.push(table);
        previousOrder = orderMapping;
      } else {
        skipped.push({ file: fileName, table: table.name, rows: 0, skipped: 0, columns: {}, inherited: false, kind: null, warning: 'Не знайдено потрібних заголовків або кодів КАТОТТГ; таблицю пропущено.' });
      }
    }
    if (!groups.kodifikator.length && !groups.occupation.length) {
      throw new Error(`${fileName}: не знайдено таблиць кодифікатора або наказів зі статусами. Перевірте таблиці та заголовки.`);
    }
    const result = { kodifikator: [], occupation: [], reports: skipped };
    for (const kind of ['kodifikator', 'occupation']) {
      if (!groups[kind].length) continue;
      const normalized = normalizeTables(groups[kind], fileName, kind);
      result[kind] = normalized.records;
      result.reports.push(...normalized.reports.map(report => ({ ...report, kind })));
    }
    // Keep the source table order in the import report, regardless of detected type.
    const positions = new Map(tables.map((table, index) => [table.name, index]));
    result.reports.sort((a, b) => positions.get(a.table) - positions.get(b.table));
    return result;
  }

  const sourceKey = source => JSON.stringify([source.file, source.table, source.row]);
  function mergeSources(target, incoming) {
    const seen = new Set((target.sources || []).map(sourceKey));
    for (const source of incoming.sources || []) if (!seen.has(sourceKey(source))) { target.sources.push(source); seen.add(sourceKey(source)); }
  }
  function deduplicateOrders(records) {
    const unique = new Map();
    for (const record of records) {
      const fingerprint = JSON.stringify([record.katottg, lower(record.status), date(record.date_start), date(record.date_end), lower(record.systems_active)]);
      if (unique.has(fingerprint)) mergeSources(unique.get(fingerprint), record);
      else unique.set(fingerprint, { ...record, sources: [...record.sources] });
    }
    return Array.from(unique.values());
  }
  function orderBase(record) {
    const level = inferLevel(record.katottg);
    const settlement = record.name;
    const cat = level === 1 ? (/^м\./i.test(record.region_name) ? 'K' : 'O') : level === 2 ? 'P' : level === 3 ? 'H' : /^м\./i.test(settlement) ? 'M' : /^с[.-]?ще|^селище/i.test(settlement) ? 'X' : /^с\./i.test(settlement) ? 'C' : '';
    const name = (level === 1 ? record.region_name : level === 2 ? record.raion_name : level === 3 ? record.hromada_name : settlement) || settlement || record.katottg;
    return { katottg: record.katottg, admin_level: level, name: name.replace(/^(?:м\.|с\.|с-ще|смт\.)\s*/i, ''), category: cat, parent_katottg: null, region_name: level > 1 ? record.region_name : '', raion_name: level > 2 ? record.raion_name : '', hromada_name: level > 3 ? record.hromada_name : '', sources: [...record.sources] };
  }
  function mergeData(kodifikator, occupation) {
    const orders = deduplicateOrders(occupation);
    const histories = new Map();
    const bases = new Map();
    for (const record of kodifikator) {
      if (bases.has(record.katottg)) mergeSources(bases.get(record.katottg), record);
      else bases.set(record.katottg, { ...record, sources: [...record.sources] });
    }
    let addedFromOrders = 0;
    for (const record of orders) {
      if (!histories.has(record.katottg)) histories.set(record.katottg, []);
      histories.get(record.katottg).push(record);
      if (!bases.has(record.katottg)) { bases.set(record.katottg, orderBase(record)); addedFromOrders++; }
      else mergeSources(bases.get(record.katottg), record);
    }
    // Resolve ancestors by administrative prefixes, even when files/sheets are out of order.
    const ancestors = new Map();
    for (const base of bases.values()) ancestors.set(`${base.admin_level}:${prefix(base.katottg, base.admin_level)}`, base);
    for (const base of bases.values()) {
      let parent = null;
      for (let level = 1; level < base.admin_level; level++) {
        const found = ancestors.get(`${level}:${prefix(base.katottg, level)}`);
        if (found) {
          parent = found;
          if (level === 1) base.region_name = found.name;
          if (level === 2) base.raion_name = found.name;
          if (level === 3) base.hromada_name = found.name;
        }
      }
      if (parent) base.parent_katottg = parent.katottg;
    }
    let matched = 0;
    const data = Array.from(bases.values()).map(base => {
      const history = (histories.get(base.katottg) || []).map(r => ({ katottg: r.katottg, key5: r.key5, status: r.status, date_start: r.date_start, date_end: r.date_end, systems_active: r.systems_active, sources: r.sources })).sort((a, b) => dateValue(a.date_start) - dateValue(b.date_start) || dateValue(a.date_end) - dateValue(b.date_end) || a.status.localeCompare(b.status, 'uk'));
      if (history.length) matched++;
      // An ongoing interval takes precedence over an ended interval from another order.
      const active = history.filter(r => !r.date_end);
      const last = active.length ? active[active.length - 1] : history.slice().sort((a, b) => dateValue(a.date_end) - dateValue(b.date_end)).pop();
      const liberated = Boolean(last && !active.length);
      if (liberated) history.push({ katottg: base.katottg, key5: key5(base.katottg), status: 'Під контролем України', date_start: last.date_end, date_end: null, systems_active: 'Так', sources: [] });
      return {
        id: `KAT-${key5(base.katottg)}`, katottg: base.katottg, katottg_key5: key5(base.katottg),
        pcode_prefix: prefix(base.katottg, base.admin_level), admin_level: base.admin_level,
        admin_level_name: levelNames[base.admin_level], category: base.category,
        category_name: categoryNames[base.category] || base.category, name: base.name, name_ua: base.name,
        parent_katottg: base.parent_katottg, region_name: base.region_name, raion_name: base.raion_name,
        hromada_name: base.hromada_name, status: last && !liberated ? last.status : 'Під контролем України',
        is_occupied: Boolean(last && !liberated && !/під контролем україни/i.test(last.status)), is_liberated: liberated,
        date_start: last ? (liberated ? last.date_end : last.date_start) : null,
        date_end: last && !liberated ? last.date_end : null, systems_active: liberated ? 'Так' : last ? last.systems_active : null,
        total_versions: history.length, history, sources: base.sources
      };
    });
    StatusSummary.applyToParents(data);
    data.sort((a, b) => a.katottg.localeCompare(b.katottg));
    return { data, orders, matched, addedFromOrders, duplicates: occupation.length - orders.length, multiVersion: data.filter(item => item.total_versions > 1).length };
  }

  function createWorkbook(result, reports, XLSX) {
    const workbook = XLSX.utils.book_new();
    const addSheet = (name, rows) => {
      const sheet = XLSX.utils.aoa_to_sheet(rows);
      sheet['!cols'] = rows[0].map((h, i) => ({ wch: /назва|name|статус|status|джерел|sources/i.test(h) ? 42 : i === 0 ? 24 : 22 }));
      if (rows.length > 1) sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: rows[0].length - 1 } }) };
      XLSX.utils.book_append_sheet(workbook, sheet, name);
    };
    const fields = ['id', 'katottg', 'katottg_key5', 'pcode_prefix', 'admin_level', 'admin_level_name', 'category', 'category_name', 'name', 'name_ua', 'parent_katottg', 'region_name', 'raion_name', 'hromada_name', 'status', 'is_occupied', 'is_liberated', 'date_start', 'date_end', 'systems_active', 'total_versions', 'settlements_total', 'settlements_occupied', 'settlements_group', 'status_basis', 'source_status', 'source_is_occupied'];
    const sourcesText = sources => (sources || []).map(s => `${s.file} / ${s.table} / ${s.row}`).join('; ');
    addSheet('Дані КАТОТТГ', [fields.concat('sources'), ...result.data.map(item => fields.map(field => item[field] == null ? '' : item[field]).concat(sourcesText(item.sources)))]);
    addSheet('Об’єднані накази', [
      ['Область', 'Назва району', 'Назва територіальної громади', 'Назва населеного пункту', 'Код КАТОТТГ', 'Статус', 'Дата початку', 'Дата завершення', 'Функціонування систем', 'Джерела'],
      ...result.orders.map(r => [r.region_name, r.raion_name, r.hromada_name, r.name, r.katottg, r.status, r.date_start || '', r.date_end || '', r.systems_active || '', sourcesText(r.sources)])
    ]);
    const historyRows = [['katottg', 'key5', 'status', 'date_start', 'date_end', 'systems_active', 'sources']];
    for (const item of result.data) for (const r of item.history) historyRows.push([r.katottg, r.key5, r.status, r.date_start || '', r.date_end || '', r.systems_active || '', sourcesText(r.sources)]);
    addSheet('Історія статусів', historyRows);
    addSheet('Джерела та колонки', [
      ['Файл', 'Таблиця / аркуш', 'Імпортовано рядків', 'Пропущено рядків', 'Визначені колонки', 'Примітка', 'Тип таблиці'],
      ...reports.map(r => [r.file, r.table, r.rows, r.skipped, Object.entries(r.columns).map(([key, index]) => `${index + 1}: ${columnLabels[key] || key}`).join('; '), r.warning || (r.inherited ? 'Колонки продовження таблиці' : ''), r.kind === 'kodifikator' ? 'Кодифікатор' : r.kind === 'occupation' ? 'Наказ зі статусами' : ''])
    ]);
    return workbook;
  }

  return { text, code, key5, date, inferLevel, wordTables, readTables, detectColumns, normalizeTables, normalizeInputTables, deduplicateOrders, mergeData, createWorkbook, columnLabels };
});
