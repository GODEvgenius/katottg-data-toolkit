// Offline regression checks using fictional inputs generated in memory.
const assert = require('node:assert/strict');
const XLSX = require('../vendor/xlsx.full.min.js');
const core = require('../prepare_data_core.js');
const codes = ['UA99000000000010001', 'UA99010000000010001', 'UA99010010000010001',
  'UA99010010010010001', 'UA99010010020010001'];
const headers = ['Область', 'Назва району', 'Назва територіальної громади', 'Назва населеного пункту',
  'Код КАТОТТГ', 'Статус', 'Дата початку', 'Дата завершення', 'Функціонування систем'];
const row = ['Тестова область', 'Тестовий район', 'Тестова громада', 'Тестове село',
  codes[3], 'Територія активних бойових дій', '2024-01-02', '', 'Ні'];
const tables = [
  { name: 'Супровідний', rows: [['Вигадані тестові записи, не джерело даних']] },
  { name: 'Кодифікатор', rows: [
    ['Перший рівень', 'Другий рівень', 'Третій рівень', 'Четвертий рівень', 'Категорія', 'Назва'],
    [codes[0], '', '', '', 'О', 'Тестова область'],
    [codes[0], codes[1], '', '', 'Р', 'Тестовий район'],
    [codes[0], codes[1], codes[2], '', 'Н', 'Тестова громада'],
    [codes[0], codes[1], codes[2], codes[3], 'С', 'Тестове село'],
    [codes[0], codes[1], codes[2], codes[4], 'С', 'Тестовий тезка']
  ] },
  { name: 'Наказ', rows: [headers, row] },
  { name: 'Продовження', rows: [headers.map((_, i) => String(i + 1)),
    [...row.slice(0, 3), 'Тестове інше село', 'UA99010010030010002', ...row.slice(5)]] }
];

async function run() {
  const parsed = core.normalizeInputTables(tables, 'fictional.docx');
  assert.equal(parsed.kodifikator.length, 5);
  assert.equal(parsed.occupation.length, 2);
  assert.equal(parsed.occupation[0].date_start, '02.01.2024');
  assert(parsed.reports.find(r => r.table === 'Продовження').inherited);
  assert(parsed.reports.find(r => r.table === 'Супровідний').warning);
  const duplicate = structuredClone(parsed.occupation[0]);
  duplicate.sources = [{ file: 'fictional-second.xlsx', table: 'Наказ', row: 2 }];
  const result = core.mergeData(parsed.kodifikator, [...parsed.occupation, duplicate]);
  assert.equal(result.duplicates, 1);
  assert.equal(result.orders[0].sources.length, 2);
  assert.equal(result.data.find(r => r.katottg === codes[3]).history.length, 1);
  assert.equal(result.data.find(r => r.katottg === codes[4]).history.length, 0,
    'An order must not attach to another record with the same last five digits');
  const ended = core.mergeData([], [{ ...parsed.occupation[0], date_end: '03.01.2024' }]).data[0];
  assert.equal(ended.is_liberated, true);
  assert.equal(ended.history.at(-1).status, 'Під контролем України');
  const overlap = core.mergeData([], [parsed.occupation[0],
    { ...parsed.occupation[0], date_start: '01.02.2024', date_end: '02.02.2024' }]).data[0];
  assert.equal(overlap.is_liberated, false);
  assert.equal(overlap.date_start, '02.01.2024');

  const workbook = core.createWorkbook(result, parsed.reports, XLSX);
  assert.equal(workbook.SheetNames.length, 4);
  const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const exported = XLSX.read(bytes, { type: 'buffer' });
  assert.equal(exported.Sheets['Об’єднані накази'].E2.t, 's');
  assert.equal(exported.Sheets['Об’єднані накази'].G2.t, 's');
  const readBack = await core.readTables({ name: 'fictional-export.xlsx', arrayBuffer: async () => bytes }, { XLSX });
  const orders = core.normalizeTables(readBack, 'fictional-export.xlsx', 'occupation');
  assert.equal(orders.records.length, result.orders.length,
    'Re-import must use canonical orders, not calculated status/history sheets');
  assert.equal(orders.records[0].katottg, result.orders[0].katottg);
  assert.equal(orders.records[0].date_start, '02.01.2024');
  console.log('PASS: table detection, continuation headings, full-code joins, duplicates, periods and XLSX round-trip without datasets');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
