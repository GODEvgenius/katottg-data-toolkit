// Run with Node and Playwright on NODE_PATH. Uses local vendor libraries; no network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const XLSX = require('../vendor/xlsx.full.min.js');
const JSZip = require('../vendor/jszip.min.js');
const core = require('../prepare_data_core.js');

const workspace = path.resolve(__dirname, '../..');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'katottg-converter-'));
const firstCode = 'UA12060090010097136';
const secondCode = 'UA12060090020011111';
const headers = ['Область', 'Назва району', 'Назва територіальної громади', 'Назва населеного пункту', 'Код КАТОТТГ', 'Статус', 'Дата початку', 'Дата завершення', 'Функціонування систем'];
const orderRow = [ 'Дніпропетровська', 'Криворізький', 'Грушівська', 'с. Грушівка', firstCode, 'Територія можливих бойових дій', '27.09.2024', '', 'Так' ];

function writeWorkbook(name, sheets, bookType = 'xlsx') {
  const workbook = XLSX.utils.book_new();
  for (const [title, rows] of sheets) XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), title);
  const filename = path.join(output, name);
  fs.writeFileSync(filename, XLSX.write(workbook, { bookType, type: 'buffer' }));
  return filename;
}

async function run() {
  // Full-code joins must not attach an order to another territory sharing its last five digits.
  const sameKey = 'UA63020010010097136';
  const base = k => ({ katottg: k, admin_level: 4, name: k, category: 'C', parent_katottg: null, region_name: '', raion_name: '', hromada_name: '', sources: [] });
  const order = (k, start, end) => ({ katottg: k, key5: core.key5(k), name: 'Грушівка', region_name: 'Дніпропетровська', raion_name: 'Криворізький', hromada_name: 'Грушівська', status: 'Територія активних бойових дій', date_start: start, date_end: end, systems_active: 'Ні', sources: [] });
  const exact = core.mergeData([base(firstCode), base(sameKey)], [order(firstCode, '01.01.2022', null)]);
  assert.equal(exact.data.find(r => r.katottg === sameKey).history.length, 0);
  const overlap = core.mergeData([], [order(firstCode, '01.01.2022', null), order(firstCode, '01.02.2023', '01.03.2023')]);
  assert.equal(overlap.data[0].is_liberated, false);
  assert.equal(overlap.data[0].date_start, '01.01.2022');
  const ended = core.mergeData([], [order(firstCode, '01.01.2022', '02.02.2022')]);
  assert.equal(ended.data[0].is_liberated, true);
  assert.equal(ended.data[0].history.at(-1).date_start, '02.02.2022');
  assert.equal(core.mergeData([], [order(firstCode, '01.01.2022', null), order(firstCode, '01.01.2022', null)]).duplicates, 1);
  console.log('PASS: exact-code matching, duplicate removal, overlapping and ended intervals');
  const detected = core.normalizeInputTables([
    { name: 'Наказ', rows: [headers, orderRow] },
    { name: 'Кодифікатор', rows: [
      ['Перший рівень', 'Другий рівень', 'Третій рівень', 'Четвертий рівень', 'Категорія', 'Назва'],
      ['UA12000000000090473', '', '', '', 'О', 'Дніпропетровська']
    ] },
    { name: 'Продовження', rows: [['1', '2', '3', '4', '5', '6', '7', '8', '9'], [...orderRow.slice(0, 4), secondCode, ...orderRow.slice(5)]] },
    { name: 'Супровідний', rows: [['Текст без таблиці даних']] }
  ], 'mixed-content.docx');
  assert.equal(detected.kodifikator.length, 1);
  assert.equal(detected.occupation.length, 2);
  assert.deepEqual(detected.reports.map(r => r.kind), ['occupation', 'kodifikator', 'occupation', null]);
  assert.equal(detected.reports[2].inherited, true);
  assert.throws(() => core.normalizeInputTables([{ name: 'Текст', rows: [['Немає даних']] }], 'unknown.xlsx'), /unknown\.xlsx: не знайдено таблиць/);
  console.log('PASS: automatic table types, mixed-content documents, continuation tables and unknown-file errors');

  const browserPath = process.env.BROWSER_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined);
  const browser = await chromium.launch({ headless: true, ...(browserPath ? { executablePath: browserPath } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const pageErrors = [];
    const dialogs = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept(); });
    await page.route('https://**/*', route => route.abort());
    await page.goto(pathToFileURL(path.join(workspace, 'tools/prepare_data.html')).href);
    assert.equal(await page.locator('#btnProcess').isDisabled(), true);
    const samples = ['f543637n52.docx', 'f543637n54.docx', 'f543637n55.docx'].map(name => path.join(workspace, 'internal files', name));
    // Regression: users may put status Word files in the field labelled "Кодифікатор".
    await page.locator('#fileKodifikator').setInputFiles(samples.slice(0, 2));
    await page.locator('#fileKodifikator').setInputFiles(samples.slice(2));
    assert.equal(await page.locator('#kodifikatorFileInfo > div').count(), 3);
    await page.locator('#fileKodifikator').setInputFiles(samples[0]);
    assert.equal(await page.locator('#kodifikatorFileInfo > div').count(), 3, 'Same file must not be added twice');
    await page.locator('#fileOccupation').setInputFiles(samples[1]);
    await page.locator('#btnProcess').click();
    await page.locator('#downloadSection').waitFor({ state: 'visible', timeout: 120000 });
    assert.deepEqual(dialogs, []);
    const imported = await page.evaluate(() => ({ total: generatedDataJson.length, orders: generatedResult.orders.length, duplicates: generatedResult.duplicates, reports: importReports.map(r => r.rows) }));
    assert.deepEqual(imported, { total: 10856, orders: 17633, duplicates: 1, reports: [4870, 2746, 5434, 4584] });
    assert.equal(await page.evaluate(() => importReports.every(report => report.columns.status === 5)), true);
    assert.equal(await page.evaluate(() => importReports.every(report => report.kind === 'occupation')), true);
    assert.match(await page.locator('#importReport').textContent(), /наказ зі статусами/);
    const actualStatusCounts = await page.evaluate(() => {
      const counts = {};
      for (const row of generatedResult.orders) counts[row.status] = (counts[row.status] || 0) + 1;
      return counts;
    });
    assert.equal(Object.keys(actualStatusCounts).length, 3);
    assert.equal(actualStatusCounts['Тимчасово окупована Російською Федерацією територія України'], 6814);
    assert.equal(actualStatusCounts['Територія активних бойових дій'], 4741);
    assert.equal(actualStatusCounts['Територія можливих бойових дій'], 6078);
    assert.match(await page.locator('#attachJsonLabel').textContent(), /data\.json/);
    console.log('PASS: all three real Word files in codifier field, automatic status detection, cross-field deduplication, four tables and continuation');

    const jsonDownloadPromise = page.waitForEvent('download');
    await page.locator('#btnDownloadJson').click();
    const jsonDownload = await jsonDownloadPromise;
    assert.equal(jsonDownload.suggestedFilename(), 'data.json');
    const data = JSON.parse(fs.readFileSync(await jsonDownload.path(), 'utf8'));
    assert.equal(data.length, 10856);
    assert.equal(new Set(data.map(r => r.katottg)).size, data.length);
    assert(data.every(r => core.code(r.katottg) && r.name_ua && r.pcode_prefix && Array.isArray(r.history)));
    assert(data.every(r => r.total_versions === r.history.length));
    const xlsxDownloadPromise = page.waitForEvent('download');
    await page.locator('#btnDownloadXlsx').click();
    const xlsxDownload = await xlsxDownloadPromise;
    assert.equal(xlsxDownload.suggestedFilename(), 'katottg_merged.xlsx');
    const xlsxBytes = fs.readFileSync(await xlsxDownload.path());
    const workbook = XLSX.read(xlsxBytes, { type: 'buffer' });
    assert.deepEqual(workbook.SheetNames, ['Дані КАТОТТГ', 'Об’єднані накази', 'Історія статусів', 'Джерела та колонки']);
    const excelData = XLSX.utils.sheet_to_json(workbook.Sheets['Дані КАТОТТГ']);
    assert.equal(excelData.length, data.length);
    assert.deepEqual(excelData.map(r => [r.katottg, r.status, r.total_versions, r.is_occupied]), data.map(r => [r.katottg, r.status, r.total_versions, r.is_occupied]));
    assert.equal(XLSX.utils.sheet_to_json(workbook.Sheets['Об’єднані накази']).length, 17633);
    const reimportPath = path.join(output, 'roundtrip.xlsx');
    fs.writeFileSync(reimportPath, xlsxBytes);
    const reimport = await page.evaluate(async bytes => {
      const f = new File([new Uint8Array(bytes)], 'roundtrip.xlsx');
      const tables = await PrepareData.readTables(f, { XLSX, JSZip, DOMParser });
      const normalized = PrepareData.normalizeInputTables(tables, f.name);
      return { count: normalized.occupation.length, data: PrepareData.mergeData(normalized.kodifikator, normalized.occupation).data.map(r => [r.katottg, r.status, r.total_versions]) };
    }, Array.from(xlsxBytes));
    assert.equal(reimport.count, 17633);
    assert.deepEqual(reimport.data, data.map(r => [r.katottg, r.status, r.total_versions]));
    console.log('PASS: actual JSON and XLSX downloads agree; merged XLSX re-import preserves statuses');

    const territory = data.find(r => r.katottg === firstCode);
    const geoPath = path.join(output, 'ukr_admin4.geojson');
    fs.writeFileSync(geoPath, JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { adm4_pcode: territory.pcode_prefix, adm4_name1: territory.name_ua, adm1_pcode: 'UA12' }, geometry: { type: 'Point', coordinates: [33.1234567, 48.7654321] } }] }));
    await page.locator('#filesGeoInput').setInputFiles(geoPath);
    await page.locator('#btnProcessAllGeo').click();
    await page.locator('#geoBatchDownloadSection').waitFor({ state: 'visible' });
    const geo = await page.evaluate(() => JSON.parse(batchGeoFiles[0].optData).features[0]);
    assert.equal(geo.properties.katottg, firstCode);
    assert.equal(geo.properties.status, territory.status);
    assert.deepEqual(geo.geometry.coordinates, [33.12346, 48.76543]);
    const zipPromise = page.waitForEvent('download');
    await page.locator('#btnDownloadAllFromModuleA').click();
    const zipDownload = await zipPromise;
    const archive = await JSZip.loadAsync(fs.readFileSync(await zipDownload.path()));
    assert(archive.file('data.json'));
    assert(archive.file('katottg_merged.xlsx'));
    assert(archive.file('ukr_admin4.geojson'));
    assert(archive.file('admin4_by_oblast/UA12.json'));
    const chunk = JSON.parse(await archive.file('admin4_by_oblast/UA12.json').async('string'));
    assert.equal(chunk.features[0].properties.katottg, firstCode);
    assert.equal(JSON.parse(await archive.file('data.json').async('string')).length, 10856);
    console.log('PASS: geoconnection still uses generated JSON; complete ZIP includes XLSX and JSON');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, 'prepare-data.png'), fullPage: true });

    // Adding/removing inputs invalidates previous data and already-enriched geofiles.
    await page.locator('#kodifikatorFileInfo button').last().click();
    assert.equal(await page.locator('#kodifikatorFileInfo > div').count(), 2);
    assert.equal(await page.locator('#downloadSection').isVisible(), false);
    assert.equal(await page.evaluate(() => generatedDataJson), null);
    assert.equal(await page.evaluate(() => batchGeoFiles[0].status), 'pending');

    await page.reload();
    // Reordered columns, an unrelated first sheet, dates stored as Excel dates, mixed formats.
    const reordered = [5, 4, 7, 3, 0, 8, 1, 2, 6];
    const rows = [headers.map((_, i) => headers[reordered[i]]), orderRow.map((_, i) => orderRow[reordered[i]])];
    rows[1][8] = new Date('2024-09-27T00:00:00Z');
    const mixedXlsx = writeWorkbook('mixed.xlsx', [['Титульний', [['Супровідний аркуш']]], ['Дані', rows]]);
    const mixedXls = writeWorkbook('mixed.xls', [['Дані', [headers, orderRow]]], 'biff8');
    await page.locator('#fileOccupation').setInputFiles([samples[0], mixedXlsx, mixedXls]);
    await page.locator('#btnProcess').click();
    await page.locator('#downloadSection').waitFor({ state: 'visible', timeout: 120000 });
    const mixed = await page.evaluate(() => ({ orders: generatedResult.orders.length, duplicates: generatedResult.duplicates, records: generatedResult.orders.filter(r => r.katottg === 'UA12060090010097136') }));
    assert.equal(mixed.orders, 4870);
    assert.equal(mixed.duplicates, 2);
    assert.equal(mixed.records.find(r => r.date_start === '27.09.2024').sources.length, 3);
    console.log('PASS: mixed Word/XLSX/XLS, all sheets, reordered columns, Excel dates and source deduplication');

    await page.reload();
    const codifier = writeWorkbook('kodifikator.xlsx', [['Кодифікатор', [
      ['Назва', 'Категорія', 'Четвертий рівень', 'Другий рівень', 'Перший рівень', 'Третій рівень'],
      ['Дніпропетровська', 'О', '', '', 'UA12000000000090473', ''],
      ['Криворізький', 'Р', '', 'UA12060000000090696', '', ''],
      ['Грушівська', 'Н', '', '', '', 'UA12060090000035995'],
      ['Грушівка', 'С', firstCode, '', '', ''],
      ['Інше село', 'С', secondCode, '', '', '']
    ]]]);
    const oneOrder = writeWorkbook('one-order.xlsx', [['Наказ', [headers, orderRow]]]);
    // The reverse placement also works, with codifier and order in the same input.
    await page.locator('#fileOccupation').setInputFiles([codifier, oneOrder]);
    await page.locator('#btnProcess').click();
    await page.locator('#downloadSection').waitFor({ state: 'visible' });
    const hierarchy = await page.evaluate(() => generatedDataJson);
    assert.equal(hierarchy.length, 5);
    assert.equal(hierarchy.find(r => r.katottg === firstCode).parent_katottg, 'UA12060090000035995');
    assert.equal(hierarchy.find(r => r.admin_level === 3).settlements_total, 2);
    assert.equal(hierarchy.find(r => r.admin_level === 3).settlements_occupied, 1);
    assert.equal(hierarchy.find(r => r.katottg === secondCode).history.length, 0);
    assert.equal(hierarchy.find(r => r.katottg === firstCode).category, 'C');
    console.log('PASS: optional codifier hierarchy, reordered columns, Cyrillic categories and settlement counts');

    const codifierWorkbook = XLSX.read(fs.readFileSync(codifier), { type: 'buffer' });
    const codifierRows = XLSX.utils.sheet_to_json(codifierWorkbook.Sheets['Кодифікатор'], { header: 1, defval: '' });
    const escapeXml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    const wordArchive = new JSZip();
    wordArchive.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:tbl>' + codifierRows.map(row => '<w:tr>' + row.map(value => '<w:tc><w:p><w:r><w:t>' + escapeXml(value) + '</w:t></w:r></w:p></w:tc>').join('') + '</w:tr>').join('') + '</w:tbl></w:body></w:document>');
    const wordCodifier = path.join(output, 'kodifikator.docx');
    fs.writeFileSync(wordCodifier, await wordArchive.generateAsync({ type: 'nodebuffer' }));
    await page.locator('#fileKodifikator').setInputFiles(wordCodifier);
    assert.equal(await page.locator('#kodifikatorFileInfo > div').count(), 1);
    await page.locator('#btnProcess').click();
    await page.locator('#downloadSection').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => generatedDataJson.length), 5);
    assert.equal(await page.evaluate(() => generatedDataJson.find(r => r.admin_level === 1).sources.length), 2);
    console.log('PASS: Word codifier and multiple mixed codifier files');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, 'prepare-data-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(output, 'prepare-data-mobile.png'), fullPage: true });
    console.log('Layout widths:', await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth })));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.setViewportSize({ width: 1440, height: 1100 });

    // Exercise DOCX merged cells independently of the real samples, including a reordered codifier.
    const xmlResults = await page.evaluate(() => {
      const xml = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:tbl><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>Адміністративна одиниця</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr><w:p><w:r><w:t>Дата початку</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>Код</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Назва</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p/></w:tc></w:tr></w:tbl></w:body></w:document>';
      return PrepareData.wordTables(xml)[0].rows;
    });
    assert.deepEqual(xmlResults, [['Адміністративна одиниця', 'Адміністративна одиниця', 'Дата початку'], ['Код', 'Назва', 'Дата початку']]);

    await page.reload();
    const invalidDocx = path.join(output, 'broken.docx');
    fs.writeFileSync(invalidDocx, 'Not a ZIP file');
    await page.locator('#fileOccupation').setInputFiles(invalidDocx);
    await page.locator('#btnProcess').click();
    await page.waitForFunction(() => !isProcessingData);
    assert.equal(await page.locator('#downloadSection').isVisible(), false);
    assert.match(dialogs.at(-1), /broken\.docx/);
    assert.equal(await page.locator('#btnProcess').isEnabled(), true);
    const unsupported = path.join(output, 'legacy.doc');
    fs.writeFileSync(unsupported, 'Old Word');
    await page.locator('#fileOccupation').setInputFiles(unsupported);
    assert.match(dialogs.at(-1), /\.docx/);
    assert.deepEqual(pageErrors, []);
    console.log('PASS: merged-cell expansion, invalid Word errors, unsupported .doc guidance, no browser errors');
    console.log(`Visual check: ${path.join(output, 'prepare-data.png')}`);
    console.log(`Desktop check: ${path.join(output, 'prepare-data-desktop.png')}`);
    console.log(`Mobile check: ${path.join(output, 'prepare-data-mobile.png')}`);
    console.log('All converter checks passed.');
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
