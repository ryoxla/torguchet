// Шаблоны импорта (.xlsx) собираются на лету: колонки те же, что читает импорт,
// а списки единиц, валют, стран, категорий и сортов берутся из базы этой компании.
'use strict';
const { loadExcel } = require('./excel');
const { KINDS } = require('./kinds');

const COLORS = { head: 'FF1F3A5F', headReq: 'FF8B1E1E', example: 'FF1D4ED8', note: 'FF5A6472', zebra: 'FFF4F6F8', border: 'FFCFD6DD' };
const thin = { style: 'thin', color: { argb: COLORS.border } };
const box = { top: thin, left: thin, bottom: thin, right: thin };

async function referenceLists(db, kind) {
  const q = async (sql) => (await db.query(sql)).rows;
  if (kind === 'counterparties') {
    return {
      'Валюты (код)': (await q('SELECT code, name FROM currencies ORDER BY id')).map(r => [r.code.trim(), r.name || '']),
      'Категории контрагентов': (await q('SELECT name FROM counterparty_categories WHERE is_active IS NOT FALSE ORDER BY sort_order, name')).map(r => [r.name]),
    };
  }
  if (kind === 'products') {
    return {
      'Единицы измерения': (await q('SELECT short_name, name FROM units ORDER BY id')).map(r => [r.short_name || r.name, r.name]),
      'Страны': (await q('SELECT name, alpha2 FROM countries ORDER BY name')).map(r => [r.name, (r.alpha2 || '').trim()]),
      'Категории товаров': (await q('SELECT name FROM product_categories WHERE is_active IS NOT FALSE ORDER BY sort_order, name')).map(r => [r.name]),
      'Сорта': (await q('SELECT name, code FROM grades WHERE is_active IS NOT FALSE ORDER BY sort_order, name')).map(r => [r.name, r.code || '']),
    };
  }
  return {};
}

function listValidation(values) {
  const s = values.join(',');
  if (!values.length || s.length > 250 || values.some(v => /[",]/.test(v))) return null;
  return { type: 'list', allowBlank: true, formulae: ['"' + s + '"'], showErrorMessage: false };
}

async function buildTemplate(kind, db) {
  const def = KINDS[kind];
  const refs = db ? await referenceLists(db, kind) : {};
  const wb = new (loadExcel().Workbook)();
  wb.creator = 'ТоргУчёт';
  wb.created = new Date(Date.UTC(2026, 0, 1));
  const ws = wb.addWorksheet('Данные', { views: [{ state: 'frozen', ySplit: 3 }], properties: { defaultRowHeight: 18 } });
  const cols = def.columns;
  ws.columns = cols.map(c => ({ key: c.key, width: c.width || 14 }));
  const last = cols.length;

  ws.mergeCells(1, 1, 1, last);
  ws.getCell(1, 1).value = `ТоргУчёт — импорт: ${def.title}`;
  ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: COLORS.head } };
  ws.getRow(1).height = 24;
  ws.mergeCells(2, 1, 2, last);
  ws.getCell(2, 1).value = 'Колонки со звёздочкой (*) обязательны. Синяя строка — пример: её можно оставить (она пропускается) или удалить. ' +
    'Не переименовывайте заголовки. Подсказки — в примечаниях к заголовкам и на листе «Инструкция».';
  ws.getCell(2, 1).font = { italic: true, size: 9, color: { argb: COLORS.note } };
  ws.getCell(2, 1).alignment = { wrapText: true, vertical: 'top' };
  ws.getRow(2).height = 30;

  const head = ws.getRow(3);
  cols.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.header + (c.required ? ' *' : '');
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.required ? COLORS.headReq : COLORS.head } };
    cell.alignment = { vertical: 'middle', wrapText: true };
    cell.border = box;
    const note = [c.format && `Формат: ${c.format}.`, c.hint].filter(Boolean).join('\n');
    if (note) cell.note = { texts: [{ text: note }], margins: { insetmode: 'auto' } };
  });
  head.height = 32;

  const ex = ws.getRow(4);
  cols.forEach((c, i) => {
    const cell = ex.getCell(i + 1);
    const v = def.example[c.key];
    cell.value = v === undefined ? null : v;
    cell.font = { italic: true, color: { argb: COLORS.example } };
    cell.border = box;
  });
  // Текстовый формат для ИНН/КПП/артикула, чтобы Excel не съедал ведущие нули
  const lastRow = 2003;
  cols.forEach((c, i) => {
    if (c.text) ws.getColumn(i + 1).numFmt = '@';
    let values = c.list;
    if (!values && kind === 'products' && c.key === 'unit' && refs['Единицы измерения']) values = refs['Единицы измерения'].map(r => r[0]);
    if (!values && kind === 'counterparties' && c.key === 'currency' && refs['Валюты (код)']) values = refs['Валюты (код)'].map(r => r[0]);
    const dv = values && listValidation(values);
    if (dv) for (let r = 4; r <= lastRow; r++) ws.getCell(r, i + 1).dataValidation = dv;
  });
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: last } };
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };

  // Инструкция
  const ins = wb.addWorksheet('Инструкция');
  ins.columns = [{ width: 26 }, { width: 15 }, { width: 22 }, { width: 80 }];
  let r = 1;
  const title = (t, size = 12) => { ins.mergeCells(r, 1, r, 4); const c = ins.getCell(r, 1); c.value = t; c.font = { bold: true, size, color: { argb: COLORS.head } }; ins.getRow(r).height = size + 10; r++; };
  const para = (t, h) => { ins.mergeCells(r, 1, r, 4); const c = ins.getCell(r, 1); c.value = t; c.alignment = { wrapText: true, vertical: 'top' }; ins.getRow(r).height = h || Math.max(18, Math.ceil(t.length / 120) * 15 + (t.split('\n').length - 1) * 15); r++; };
  title(`Импорт справочника «${def.title}»`, 14);
  para(`Где: ${def.section} → кнопка «Импорт из Excel». Заполните лист «Данные» и загрузите файл. ` +
    'Программа сначала покажет предпросмотр: какие строки будут добавлены, обновлены, пропущены и в каких ошибки. Ничего не записывается, пока вы не нажмёте «Загрузить».');
  r++;
  title('Колонки');
  const hr = ins.getRow(r);
  ['Колонка', 'Обязательна', 'Формат', 'Как заполнять'].forEach((t, i) => {
    const c = hr.getCell(i + 1); c.value = t; c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.head } }; c.border = box;
  });
  r++;
  cols.forEach((c, i) => {
    const row = ins.getRow(r);
    const vals = [c.header + (c.required ? ' *' : ''), c.required ? 'да' : 'нет', c.format || '', c.hint || ''];
    vals.forEach((v, j) => {
      const cell = row.getCell(j + 1); cell.value = v; cell.border = box; cell.alignment = { wrapText: true, vertical: 'top' };
      if (i % 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.zebra } };
      if (j === 1 && c.required) cell.font = { bold: true, color: { argb: COLORS.headReq } };
    });
    row.height = Math.max(18, Math.ceil((c.hint || '').length / 85) * 15);
    r++;
  });
  r++;
  title('Как программа ищет дубли');
  para(def.keyText);
  para('Если одна и та же запись встречается в файле дважды — обе строки считаются ошибкой.');
  r++;
  title('Режимы загрузки');
  para('«Только добавить новые» — найденные в справочнике записи пропускаются, ничего не меняется.\n' +
    '«Добавить и обновить найденные» — у найденных записей меняются только те поля, которые заполнены в файле. Пустая ячейка не стирает значение в программе.', 48);
  para('Строки с ошибками не загружаются. Все корректные строки записываются одной операцией: если что-то пойдёт не так, не запишется ничего. Список ошибок можно скачать после проверки.');
  r++;
  title('Форматы');
  para('Да/нет: «да», «нет» (также 1/0). Числа: можно с запятой (1,5) и пробелами (300 000). Подходит .xlsx и .csv (разделитель «;» или «,», кодировка UTF-8 или Windows-1251). ' +
    'Старый .xls нужно пересохранить как .xlsx. До 5 МБ и до 5000 строк в одном файле.');
  r++;
  title('Чего нет в этом файле');
  para(def.notIncluded.map(t => '• ' + t).join('\n'), Math.max(18, def.notIncluded.length * 30));
  ins.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };

  // Справочные значения из базы
  const refNames = Object.keys(refs);
  if (refNames.length) {
    const vs = wb.addWorksheet('Значения');
    let col = 1;
    for (const name of refNames) {
      const list = refs[name];
      const w = list[0] && list[0].length > 1 ? 2 : 1;
      vs.getColumn(col).width = 26; if (w > 1) vs.getColumn(col + 1).width = 18;
      const h = vs.getCell(1, col); h.value = name; h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.head } };
      if (w > 1) { vs.mergeCells(1, col, 1, col + 1); }
      list.forEach((vals, i) => vals.slice(0, w).forEach((v, j) => { vs.getCell(i + 2, col + j).value = v; }));
      if (!list.length) vs.getCell(2, col).value = '(пока пусто)';
      col += w + 1;
    }
    vs.getCell(1, col).value = 'Значения на момент скачивания шаблона. Пишите в «Данные» так же, как здесь.';
    vs.getCell(1, col).font = { italic: true, color: { argb: COLORS.note } };
  }
  wb.views = [{ activeTab: 0 }];
  return wb.xlsx.writeBuffer();
}

// Файл со списком ошибок после проверки
async function buildErrorsFile(kind, rows) {
  const def = KINDS[kind];
  const wb = new (loadExcel().Workbook)();
  const ws = wb.addWorksheet('Ошибки');
  const cols = def.columns;
  ws.columns = [{ header: 'Строка', width: 8 }, { header: 'Статус', width: 12 }, { header: 'Ошибки и предупреждения', width: 60 },
    ...cols.map(c => ({ header: c.header, width: c.width || 14 }))];
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.head } }; });
  const ST = { error: 'ошибка', new: 'новая', update: 'обновление', skip: 'пропуск' };
  for (const x of rows.slice(0, 10000)) {
    const msgs = (x.messages || []).filter(m => m.level !== 'info').map(m => (m.level === 'error' ? '✖ ' : '⚠ ') + String(m.text || '').slice(0, 500));
    const row = ws.addRow([x.row, ST[x.status] || x.status, msgs.join('\n'), ...cols.map(c => (x.values && x.values[c.key] != null ? String(x.values[c.key]).slice(0, 1000) : ''))]);
    row.getCell(3).alignment = { wrapText: true, vertical: 'top' };
    if (x.status === 'error') row.getCell(2).font = { bold: true, color: { argb: 'FFB91C1C' } };
  }
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  return wb.xlsx.writeBuffer();
}

module.exports = { buildTemplate, buildErrorsFile };
