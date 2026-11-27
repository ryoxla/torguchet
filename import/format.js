// Чтение загруженного файла импорта: .xlsx (exceljs) или .csv. Старый .xls не поддерживается.
'use strict';
const { loadExcel } = require('./excel');

const LIMITS = {
  fileBytes: 5 * 1024 * 1024,      // размер загружаемого файла
  unzippedBytes: 80 * 1024 * 1024, // суммарный распакованный размер xlsx (защита от «zip-бомбы»)
  zipEntries: 2000,
  rows: 5000,                      // строк данных в одном файле
  cols: 60,
};

class ImportFileError extends Error {}

// Проверяем оглавление zip до распаковки: число файлов и их распакованный размер.
function checkZip(buf) {
  const min = Math.max(0, buf.length - 65557);
  let eocd = -1;
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new ImportFileError('Файл повреждён или это не книга Excel (.xlsx).');
  const entries = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (entries > LIMITS.zipEntries) throw new ImportFileError('Слишком сложный файл Excel.');
  let p = cdOffset, total = 0;
  for (let n = 0; n < entries; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) {
      throw new ImportFileError('Файл повреждён или это не книга Excel (.xlsx).');
    }
    const usize = buf.readUInt32LE(p + 24);
    total += usize === 0xffffffff ? Infinity : usize;
    p += 46 + buf.readUInt16LE(p + 28) + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  if (total > LIMITS.unzippedBytes) {
    throw new ImportFileError('Файл Excel слишком большой после распаковки. Разбейте его на несколько файлов.');
  }
}

// Значение ячейки exceljs → строка | число | boolean | Date | null | {error}
function plainCell(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map(t => t.text || '').join('');
    if ('result' in v || 'formula' in v || 'sharedFormula' in v) return plainCell(v.result);
    if ('error' in v) return { error: String(v.error) };
    if ('text' in v) return plainCell(v.text);
    if ('hyperlink' in v) return String(v.hyperlink);
    return String(v);
  }
  return v;
}

async function readXlsx(buf, headerProbe) {
  checkZip(buf);
  const wb = new (loadExcel().Workbook)();
  try {
    await wb.xlsx.load(buf);
  } catch (e) {
    throw new ImportFileError('Не удалось прочитать файл Excel: ' + (e && e.message ? e.message : e));
  }
  const sheets = wb.worksheets.filter(ws => ws.state !== 'hidden' && ws.state !== 'veryHidden');
  if (!sheets.length) throw new ImportFileError('В книге нет листов.');
  const toMatrix = (ws) => {
    const out = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const cells = [];
      const n = Math.min(row.cellCount, LIMITS.cols);
      for (let c = 1; c <= n; c++) cells.push(plainCell(row.getCell(c).value));
      if (!cells.some(v => v !== null && String(v).trim() !== '')) return; // строка только с оформлением
      out.push({ n: rowNumber, cells });
      if (out.length > LIMITS.rows + 50) {
        throw new ImportFileError(`В файле больше ${LIMITS.rows} строк. Разбейте его на несколько файлов.`);
      }
    });
    return out;
  };
  // Сначала лист «Данные» (так назван лист в шаблоне), затем первый лист, где нашлась строка заголовков
  const ordered = [...sheets].sort((a, b) => (b.name.trim().toLowerCase() === 'данные') - (a.name.trim().toLowerCase() === 'данные'));
  for (const ws of ordered) {
    const m = toMatrix(ws);
    if (headerProbe(m) >= 0) return { sheet: ws.name, rows: m };
  }
  return { sheet: ordered[0].name, rows: toMatrix(ordered[0]) };
}

function decodeText(buf) {
  let b = buf;
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return b.slice(3).toString('utf8');
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.slice(2));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(b); }
  catch { return new TextDecoder('windows-1251').decode(b); } // CSV из старого Excel
}

function parseCsv(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const count = ch => firstLine.split(ch).length - 1;
  const delim = [';', '\t', ','].sort((a, b) => count(b) - count(a))[0];
  const rows = [];
  let row = [], field = '', q = false, i = 0, line = 1, rowLine = 1;
  const pushRow = () => { row.push(field); field = ''; if (row.some(c => c !== '')) rows.push({ n: rowLine, cells: row.slice(0, LIMITS.cols).map(c => c === '' ? null : c) }); row = []; };
  while (i < text.length) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } q = false; i++; continue; }
      if (ch === '\n') line++;
      field += ch; i++; continue;
    }
    if (ch === '"' && field === '') { q = true; i++; continue; }
    if (ch === delim) { row.push(field); field = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { pushRow(); line++; rowLine = line; i++; if (rows.length > LIMITS.rows + 50) break; continue; }
    field += ch; i++;
  }
  if (field !== '' || row.length) pushRow();
  if (rows.length > LIMITS.rows + 50) throw new ImportFileError(`В файле больше ${LIMITS.rows} строк. Разбейте его на несколько файлов.`);
  return rows;
}

// Определяем формат по содержимому, а не по расширению
async function readTable(buf, fileName, headerProbe) {
  if (!buf || !buf.length) throw new ImportFileError('Файл пустой.');
  if (buf.length > LIMITS.fileBytes) throw new ImportFileError(`Файл больше ${LIMITS.fileBytes / 1024 / 1024} МБ.`);
  const name = String(fileName || '').toLowerCase();
  if (buf[0] === 0x50 && buf[1] === 0x4b) return { format: 'xlsx', ...(await readXlsx(buf, headerProbe)) };
  if (buf.readUInt32BE(0) === 0xd0cf11e0) {
    throw new ImportFileError('Старый формат .xls не поддерживается. Откройте файл в Excel и сохраните как «Книга Excel (.xlsx)» или «CSV (разделители — точка с запятой)».');
  }
  if (/\.(xlsx|xlsm|xls|ods)$/.test(name)) throw new ImportFileError('Файл не похож на книгу Excel (.xlsx).');
  const text = decodeText(buf);
  if (/[\u0000-\u0008]/.test(text.slice(0, 2000))) throw new ImportFileError('Неизвестный формат файла. Нужен .xlsx или .csv.');
  return { format: 'csv', sheet: null, rows: parseCsv(text) };
}

module.exports = { readTable, LIMITS, ImportFileError, checkZip, parseCsv };
