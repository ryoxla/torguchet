// Справочники, которые можно загрузить из Excel: колонки, проверка строк и запись в базу.
'use strict';

// ── Нормализация значений ───────────────────────────────────
const pad2 = n => String(n).padStart(2, '0');
const fmtDate = d => `${pad2(d.getUTCDate())}.${pad2(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
function text(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return fmtDate(v);
  if (typeof v === 'object') return '';
  if (typeof v === 'number') return Number.isInteger(v) ? v.toFixed(0) : String(v);
  return String(v).replace(/[\u00a0\u2007\u202f\t\r\n]/g, ' ').replace(/\s+/g, ' ').trim();
}
const keyOf = v => text(v).toLowerCase();
const normHeader = s => text(s).toLowerCase().replace(/ё/g, 'е').replace(/[*,.:;()₽"«»]/g, ' ').replace(/\s+/g, ' ').trim();

const TRUE_WORDS = new Set(['да', 'д', 'yes', 'y', 'true', 'истина', '1', '+', 'вкл', 'активен', 'активна']);
const FALSE_WORDS = new Set(['нет', 'н', 'no', 'n', 'false', 'ложь', '0', '-', 'выкл', 'неактивен', 'неактивна']);
function parseBool(v) {
  if (typeof v === 'boolean') return v;
  const t = keyOf(v);
  if (TRUE_WORDS.has(t)) return true;
  if (FALSE_WORDS.has(t)) return false;
  return undefined;
}
function parseNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  const t = text(v).replace(/\s/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return undefined;
  return Number(t);
}
const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;
const sameNum = (a, b) => (a === null || a === undefined || a === '' ? null : Number(a)) === (b === null || b === undefined ? null : Number(b));

function innChecksumOk(inn) {
  const d = inn.split('').map(Number);
  const k = (w) => (w.reduce((s, wi, i) => s + wi * d[i], 0) % 11) % 10;
  if (d.length === 10) return k([2, 4, 10, 3, 5, 9, 4, 6, 8]) === d[9];
  if (d.length === 12) return k([7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === d[10] && k([3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === d[11];
  return false;
}

// Уникальные названия без учёта регистра (первое написание)
function uniqByKey(list) { const m = new Map(); for (const n of list) if (n && !m.has(keyOf(n))) m.set(keyOf(n), n); return [...m.values()]; }

// ── Описание колонок ────────────────────────────────────────
// key — внутреннее имя, header — заголовок в шаблоне, aliases — другие допустимые заголовки
const ACTIVE_COL = { key: 'is_active', header: 'Активен', aliases: ['активна', 'активно', 'статус'], width: 11, list: ['да', 'нет'],
  format: 'да / нет', hint: 'Пусто — «да» для новой записи, без изменений для найденной.' };

const KINDS = {
  counterparties: {
    title: 'Контрагенты', file: 'ТоргУчёт-шаблон-контрагенты.xlsx', section: 'Справочники → Контрагенты',
    keyText: 'Наименование (без учёта регистра и лишних пробелов). Совпадение ИНН с другим контрагентом — предупреждение.',
    columns: [
      { key: 'name', header: 'Наименование', required: true, aliases: ['название', 'контрагент', 'наименование контрагента'], width: 34,
        format: 'текст, до 255', hint: 'Как в документах и актах сверки. По наименованию программа ищет контрагента в справочнике.' },
      { key: 'type', header: 'Тип', width: 11, list: ['Юрлицо', 'Физлицо'], format: 'Юрлицо / Физлицо',
        hint: 'Пусто — «Юрлицо» для нового контрагента.' },
      { key: 'category', header: 'Категория', aliases: ['категория контрагента', 'группа'], width: 22, format: 'название',
        hint: 'Из справочника «Категории контрагентов». Если такой категории нет, она будет создана.' },
      { key: 'inn', header: 'ИНН', width: 15, format: '10 или 12 цифр', text: true, hint: 'Лучше хранить в Excel как текст, чтобы не терялся ведущий ноль.' },
      { key: 'kpp', header: 'КПП', width: 12, format: '9 знаков', text: true, hint: 'Обычно для юрлиц.' },
      { key: 'phone', header: 'Телефон', width: 18, format: 'до 50 знаков' },
      { key: 'email', header: 'Email', aliases: ['e-mail', 'почта', 'электронная почта'], width: 24, format: 'до 255 знаков' },
      { key: 'address', header: 'Адрес', width: 34, format: 'до 500 знаков' },
      { key: 'credit_limit', header: 'Кредитный лимит, ₽', aliases: ['кредитный лимит', 'лимит', 'лимит р'], width: 16, num: true, format: 'число ≥ 0, 2 знака' },
      { key: 'credit_days', header: 'Дней отсрочки', aliases: ['отсрочка', 'отсрочка дней', 'дни отсрочки'], width: 12, num: true, format: 'целое число' },
      { key: 'currency', header: 'Валюта взаиморасчётов', aliases: ['валюта взаиморасчетов', 'валюта'], width: 14, format: 'код, например RUB',
        hint: 'Код или название из справочника «Валюты». Неизвестная валюта — ошибка строки. Пусто — базовая валюта для нового контрагента.' },
      ACTIVE_COL,
    ],
    example: { name: 'ООО «Агро-Юг» (пример)', type: 'Юрлицо', category: 'Оптовые покупатели', inn: '7701234567', kpp: '773101001',
      phone: '+7 495 123-45-67', email: 'zakup@agroyug.ru', address: 'г. Москва, ул. Складская, 12', credit_limit: 300000,
      credit_days: 14, currency: 'RUB', is_active: 'да' },
    notIncluded: [
      'Признак «Анонимный» (служебный контрагент для розницы) — не загружается.',
      'Кабинет контрагента, юридические лица для банковской выписки, остатки долга — заводятся в программе отдельно.',
    ],
  },
  grades: {
    title: 'Сорта', file: 'ТоргУчёт-шаблон-сорта.xlsx', section: 'Справочники → Сорта',
    keyText: 'Наименование (без учёта регистра и лишних пробелов). Если сорт с таким именем уже есть, но код другой — это ошибка строки, запись не меняется.',
    columns: [
      { key: 'name', header: 'Наименование', required: true, aliases: ['название', 'сорт'], width: 24, format: 'текст, до 100',
        hint: 'Сортность товара: Высший, 1-й, Нестандарт… Это не категории товаров.' },
      { key: 'code', header: 'Код', width: 12, format: 'текст, до 20', text: true, hint: 'Короткое обозначение, например В/С.' },
      { key: 'sort_order', header: 'Порядок', aliases: ['порядок сортировки', 'сортировка'], width: 11, num: true, format: 'целое число',
        hint: 'Чем меньше число, тем выше сорт в списке. Пусто — 0 для нового сорта.' },
      ACTIVE_COL,
    ],
    example: { name: 'Высший (пример)', code: 'В/С', sort_order: 10, is_active: 'да' },
    notIncluded: ['Категории товаров, единицы, цены и остатки — не сорта, в этом файле их нет.'],
  },
  products: {
    title: 'Товары', file: 'ТоргУчёт-шаблон-товары.xlsx', section: 'Справочники → Товары',
    keyText: 'Артикул, если он заполнен; иначе наименование (без учёта регистра и лишних пробелов).',
    columns: [
      { key: 'name', header: 'Наименование', required: true, aliases: ['название', 'товар', 'наименование товара', 'номенклатура'], width: 34,
        format: 'текст, до 500', hint: 'Одна строка — одна позиция номенклатуры.' },
      { key: 'sku', header: 'Артикул', aliases: ['код товара', 'sku'], width: 14, format: 'текст, до 100', text: true,
        hint: 'Уникален. Если заполнен, товар ищется по артикулу (так можно переименовать товар).' },
      { key: 'category', header: 'Категория', aliases: ['категория товара', 'группа'], width: 18, format: 'название',
        hint: 'Из справочника категорий товаров. Если такой категории нет, она будет создана.' },
      { key: 'unit', header: 'Ед. изм.', aliases: ['ед изм', 'единица', 'единица измерения', 'ед'], width: 10, format: 'кг, шт, л…',
        hint: 'Краткое или полное название из справочника «Единицы измерения». Неизвестная единица — ошибка строки.' },
      { key: 'country', header: 'Страна по умолчанию', aliases: ['страна', 'страна происхождения'], width: 18, format: 'название или код',
        hint: 'Название или код (RU, RUS) из справочника «Страны». Неизвестная страна — ошибка строки.' },
      { key: 'grade', header: 'Сорт по умолчанию', aliases: ['сорт'], width: 16, format: 'название сорта',
        hint: 'Если такого сорта нет, он будет создан.' },
      { key: 'grades', header: 'Доступные сорта', aliases: ['сорта'], width: 22, format: 'через «;»',
        hint: 'Несколько сортов через точку с запятой. Неизвестные будут созданы. Пусто — в карточке без изменений (у нового товара доступны все сорта).' },
      { key: 'has_batch', header: 'Учёт партий', aliases: ['партии'], width: 11, list: ['да', 'нет'], format: 'да / нет' },
      { key: 'has_serial', header: 'Серийные номера', aliases: ['серийный учет', 'серийные'], width: 12, list: ['да', 'нет'], format: 'да / нет' },
      { key: 'min_stock', header: 'Мин. остаток', aliases: ['мин остаток', 'минимальный остаток'], width: 12, num: true, format: 'число ≥ 0' },
      { key: 'weight_kg', header: 'Вес, кг', aliases: ['вес кг', 'вес'], width: 10, num: true, format: 'число ≥ 0' },
      ACTIVE_COL,
    ],
    example: { name: 'Мука пшеничная в/с (пример)', sku: 'ПРИМЕР-001', category: 'Бакалея', unit: 'кг', country: 'Россия', grade: 'Высший',
      grades: 'Высший; 1-й', has_batch: 'да', has_serial: 'нет', min_stock: 50, weight_kg: 1, is_active: 'да' },
    notIncluded: [
      'Цены и остатки не хранятся в карточке товара. Начальные остатки — раздел «Нач. остатки».',
      'Штрихкодов в программе нет.',
      'Единица, страна и сорт сохраняются в карточку товара. В строку накладной они автоматически не подставляются.',
    ],
  },
};

// ── Сопоставление заголовков ────────────────────────────────
function headerIndex(def) {
  const m = new Map();
  for (const c of def.columns) {
    m.set(normHeader(c.header), c.key);
    for (const a of c.aliases || []) m.set(normHeader(a), c.key);
  }
  return m;
}
// Номер строки (в матрице) с заголовками или -1
function findHeaderRow(def, matrix) {
  const idx = headerIndex(def);
  const req = def.columns.filter(c => c.required).map(c => c.key);
  for (let i = 0; i < Math.min(matrix.length, 30); i++) {
    const keys = new Set(matrix[i].cells.map(v => idx.get(normHeader(v))).filter(Boolean));
    if (req.every(k => keys.has(k)) && keys.size >= 1) return i;
  }
  return -1;
}

// ── Общая разборка строк ────────────────────────────────────
function prepareRows(def, matrix) {
  const hi = findHeaderRow(def, matrix);
  const fileMessages = [];
  if (hi < 0) {
    const req = def.columns.filter(c => c.required).map(c => `«${c.header}»`).join(', ');
    return { fatal: `Не найдена строка заголовков с колонкой ${req}. Скачайте шаблон и не переименовывайте заголовки.` };
  }
  const idx = headerIndex(def);
  const colMap = []; // номер колонки → key
  const seen = new Set();
  matrix[hi].cells.forEach((h, i) => {
    const t = text(h);
    if (!t) return;
    const k = idx.get(normHeader(h));
    if (!k) { fileMessages.push({ level: 'warning', text: `Колонка «${t}» не распознана и пропущена.` }); return; }
    if (seen.has(k)) { fileMessages.push({ level: 'warning', text: `Колонка «${t}» повторяется — использована первая.` }); return; }
    seen.add(k); colMap[i] = k;
  });
  const rows = [];
  for (let r = hi + 1; r < matrix.length; r++) {
    const { n, cells } = matrix[r];
    const raw = {}, values = {}, cellErrors = [];
    let any = false;
    colMap.forEach((k, i) => {
      if (!k) return;
      const v = cells[i] === undefined ? null : cells[i];
      if (v && typeof v === 'object' && !(v instanceof Date) && v.error) { cellErrors.push(k); values[k] = v.error; any = true; return; }
      raw[k] = v; values[k] = text(v);
      if (values[k] !== '') any = true;
    });
    if (!any) continue;
    rows.push({ row: n, raw, values, cellErrors, messages: [], status: null, data: {} });
  }
  return { headerRow: matrix[hi].n, columns: def.columns.map(c => ({ key: c.key, header: c.header, required: !!c.required, found: seen.has(c.key) })), rows, fileMessages };
}

function rowHelpers(r) {
  return {
    err: (col, t) => r.messages.push({ level: 'error', col, text: t }),
    warn: (col, t) => r.messages.push({ level: 'warning', col, text: t }),
    info: (col, t) => r.messages.push({ level: 'info', col, text: t }),
  };
}

function isExample(def, r) {
  const ex = def.example;
  return text(r.values.name) === ex.name;
}

function commonChecks(def, r) {
  const { err } = rowHelpers(r);
  for (const k of r.cellErrors) err(k, 'В ячейке ошибка формулы');
}

function str(r, key, max, label) {
  const v = r.values[key];
  if (v === undefined || v === '') return undefined;
  if (v.length > max) { rowHelpers(r).err(key, `${label}: длиннее ${max} знаков`); return undefined; }
  return v;
}
function num(r, key, { int = false, min = 0, max, scale = 2, label }) {
  const v = r.values[key];
  if (v === undefined || v === '') return undefined;
  const n = parseNum(r.raw[key]);
  if (n === undefined) { rowHelpers(r).err(key, `${label}: «${v}» — не число`); return undefined; }
  if (int && !Number.isInteger(n)) { rowHelpers(r).err(key, `${label}: нужно целое число`); return undefined; }
  if (n < min || (max !== undefined && n > max)) { rowHelpers(r).err(key, `${label}: число вне допустимого диапазона`); return undefined; }
  return int ? n : round(n, scale);
}
function bool(r, key, label) {
  const v = r.values[key];
  if (v === undefined || v === '') return undefined;
  const b = parseBool(r.raw[key]);
  if (b === undefined) rowHelpers(r).err(key, `${label}: укажите «да» или «нет»`);
  return b;
}
function pickActive(list) {
  if (!list || !list.length) return null;
  return list.find(x => x.is_active !== false) || list[0];
}
function markFileDuplicates(rows, keyFn, colKey, label) {
  const groups = new Map();
  for (const r of rows) {
    if (r.status === 'skip') continue;
    const k = keyFn(r);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const nums = list.map(x => x.row).join(', ');
    for (const r of list) rowHelpers(r).err(colKey, `${label} повторяется в файле (строки ${nums})`);
  }
}
function finishStatus(r, mode, match, changes, labels) {
  const { info } = rowHelpers(r);
  if (r.status === 'skip') return;
  if (r.messages.some(m => m.level === 'error')) { r.status = 'error'; return; }
  if (!match) { r.status = 'new'; return; }
  r.matchId = match.id;
  if (mode !== 'upsert') { r.status = 'skip'; info(null, 'Уже есть в справочнике — пропущено (режим «только новые»)'); return; }
  const keys = Object.keys(changes);
  if (!keys.length) { r.status = 'skip'; info(null, 'Уже есть, изменений нет'); return; }
  r.status = 'update'; r.changes = changes;
  info(null, 'Будет обновлено: ' + keys.map(k => labels[k] || k).join(', '));
}
const labelsOf = def => Object.fromEntries(def.columns.map(c => [c.key, c.header]));

// ── Контрагенты ─────────────────────────────────────────────
async function loadCounterparties(db) {
  const [{ rows: cps }, { rows: cats }, { rows: curs }] = await Promise.all([
    db.query('SELECT id, name, type, category_id, inn, kpp, phone, email, address, credit_limit, credit_days, currency_id, is_active FROM counterparties'),
    db.query('SELECT id, name, is_active FROM counterparty_categories'),
    db.query('SELECT id, code, name, is_base FROM currencies ORDER BY id'),
  ]);
  const byKey = new Map(), byInn = new Map();
  for (const c of cps) {
    const k = keyOf(c.name);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(c);
    if (c.inn) { const i = String(c.inn).trim(); if (!byInn.has(i)) byInn.set(i, []); byInn.get(i).push(c); }
  }
  const catByKey = new Map();
  for (const c of cats) { const k = keyOf(c.name); if (!catByKey.has(k) || c.is_active) catByKey.set(k, c); }
  const curByKey = new Map();
  for (const c of curs) { curByKey.set(keyOf(c.code), c); if (c.name && !curByKey.has(keyOf(c.name))) curByKey.set(keyOf(c.name), c); }
  const base = curs.find(c => c.is_base) || curs.find(c => keyOf(c.code) === 'rub') || null;
  return { byKey, byInn, catByKey, curByKey, baseCurrencyId: base ? base.id : null };
}

function validateCounterparties(rows, ctx, mode) {
  const def = KINDS.counterparties;
  for (const r of rows) {
    const { err, warn, info } = rowHelpers(r);
    if (isExample(def, r)) { r.status = 'skip'; info(null, 'Строка-пример из шаблона — пропущена'); continue; }
    commonChecks(def, r);
    const d = r.data;
    d.name = str(r, 'name', 255, 'Наименование');
    if (!r.values.name) err('name', 'Не заполнено наименование');
    if (r.values.type) {
      const t = keyOf(r.values.type);
      if (['юрлицо', 'юр лицо', 'юридическое лицо', 'юл', 'legal', 'организация'].includes(t)) d.type = 'legal';
      else if (['физлицо', 'физ лицо', 'физическое лицо', 'фл', 'individual', 'ип', 'частное лицо'].includes(t)) d.type = 'individual';
      else err('type', `Тип «${r.values.type}»: укажите «Юрлицо» или «Физлицо»`);
    }
    if (r.values.category) {
      const name = str(r, 'category', 255, 'Категория');
      if (name) {
        const c = ctx.catByKey.get(keyOf(name));
        if (c) { d.category_id = c.id; if (c.is_active === false) warn('category', `Категория «${c.name}» отключена в справочнике`); }
        else { d.category_new = name; info('category', `Категория «${name}» будет создана`); }
      }
    }
    if (r.values.inn) {
      let inn = r.values.inn.replace(/[\s-]/g, '');
      if (typeof r.raw.inn === 'number' && (inn.length === 9 || inn.length === 11)) { inn = '0' + inn; warn('inn', `ИНН был числом без ведущего нуля — исправлено на ${inn}`); }
      if (!/^(\d{10}|\d{12})$/.test(inn)) err('inn', `ИНН «${r.values.inn}»: нужно 10 или 12 цифр`);
      else { d.inn = inn; if (!innChecksumOk(inn)) warn('inn', 'ИНН не проходит проверку контрольной суммы'); }
    }
    if (r.values.kpp) {
      let kpp = r.values.kpp.replace(/\s/g, '').toUpperCase();
      if (typeof r.raw.kpp === 'number' && kpp.length === 8) { kpp = '0' + kpp; warn('kpp', `КПП был числом без ведущего нуля — исправлено на ${kpp}`); }
      if (!/^\d{4}[\dA-Z]{2}\d{3}$/.test(kpp)) err('kpp', `КПП «${r.values.kpp}»: нужно 9 знаков`);
      else d.kpp = kpp;
    }
    d.phone = str(r, 'phone', 50, 'Телефон');
    d.email = str(r, 'email', 255, 'Email');
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) warn('email', 'Email выглядит некорректно');
    d.address = str(r, 'address', 500, 'Адрес');
    d.credit_limit = num(r, 'credit_limit', { max: 9999999999999.99, scale: 2, label: 'Кредитный лимит' });
    d.credit_days = num(r, 'credit_days', { int: true, max: 36500, label: 'Дней отсрочки' });
    if (r.values.currency) {
      const c = ctx.curByKey.get(keyOf(r.values.currency));
      if (c) d.currency_id = c.id; else err('currency', `Валюта «${r.values.currency}» не найдена в справочнике «Валюты»`);
    }
    d.is_active = bool(r, 'is_active', 'Активен');
    r.key = d.name ? keyOf(d.name) : null;
  }
  markFileDuplicates(rows, r => r.key, 'name', 'Наименование');
  // ИНН: совпадение — только предупреждение
  const innRows = new Map();
  for (const r of rows) if (r.status !== 'skip' && r.data.inn) { if (!innRows.has(r.data.inn)) innRows.set(r.data.inn, []); innRows.get(r.data.inn).push(r.row); }
  const labels = labelsOf(def);
  for (const r of rows) {
    if (r.status === 'skip') continue;
    const d = r.data;
    const match = r.key ? pickActive(ctx.byKey.get(r.key)) : null;
    if (d.inn) {
      const others = (ctx.byInn.get(d.inn) || []).filter(c => !match || c.id !== match.id);
      if (others.length) rowHelpers(r).warn('inn', `ИНН уже есть у контрагента «${others[0].name}»${others.length > 1 ? ` и ещё ${others.length - 1}` : ''}`);
      const same = innRows.get(d.inn);
      if (same && same.length > 1) rowHelpers(r).warn('inn', `ИНН повторяется в файле (строки ${same.join(', ')})`);
    }
    const ch = {};
    if (match) {
      if (d.type !== undefined && d.type !== match.type) ch.type = d.type;
      if (d.category_new) ch.category = d.category_new;
      else if (d.category_id !== undefined && d.category_id !== match.category_id) ch.category = d.category_id;
      for (const k of ['inn', 'kpp', 'phone', 'email', 'address']) if (d[k] !== undefined && d[k] !== (match[k] || '').trim()) ch[k] = d[k];
      if (d.credit_limit !== undefined && !sameNum(match.credit_limit, d.credit_limit)) ch.credit_limit = d.credit_limit;
      if (d.credit_days !== undefined && !sameNum(match.credit_days, d.credit_days)) ch.credit_days = d.credit_days;
      if (d.currency_id !== undefined && d.currency_id !== match.currency_id) ch.currency = d.currency_id;
      if (d.is_active !== undefined && d.is_active !== (match.is_active !== false)) ch.is_active = d.is_active;
      if (ch.is_active === true && (ctx.byKey.get(r.key) || []).some(c => c.id !== match.id && c.is_active)) {
        rowHelpers(r).err('is_active', 'Нельзя включить: уже есть активный контрагент с таким наименованием');
      }
    }
    finishStatus(r, mode, match, ch, labels);
  }
}

async function ensureCategories(client, table, names) {
  const map = new Map();
  for (const name of names) {
    const k = keyOf(name);
    if (map.has(k)) continue;
    const { rows: ex } = await client.query(`SELECT id FROM ${table} WHERE lower(trim(name))=$1 ORDER BY is_active DESC, id LIMIT 1`, [k]);
    if (ex[0]) { map.set(k, ex[0].id); continue; }
    const { rows } = await client.query(`INSERT INTO ${table} (name) VALUES ($1) RETURNING id`, [name]);
    map.set(k, rows[0].id);
  }
  return map;
}

async function applyCounterparties(client, rows, ctx) {
  const ok = rows.filter(r => r.status === 'new' || r.status === 'update');
  const newCats = uniqByKey(ok.map(r => r.data.category_new));
  const catMap = await ensureCategories(client, 'counterparty_categories', newCats);
  const catId = d => d.category_new ? catMap.get(keyOf(d.category_new)) : d.category_id;
  let inserted = 0, updated = 0;
  for (const r of ok) {
    const d = r.data;
    if (r.status === 'new') {
      await client.query(`INSERT INTO counterparties
          (name, type, category_id, inn, kpp, phone, email, address, credit_limit, credit_days, currency_id, is_anonymous, is_active)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,false,$12)`,
      [d.name, d.type || 'legal', catId(d) ?? null, d.inn ?? null, d.kpp ?? null, d.phone ?? null, d.email ?? null, d.address ?? null,
        d.credit_limit ?? null, d.credit_days ?? null, d.currency_id ?? ctx.baseCurrencyId, d.is_active ?? true]);
      inserted++;
    } else {
      const set = [], vals = [];
      const add = (col, v) => { vals.push(v); set.push(`${col}=$${vals.length}`); };
      const c = r.changes;
      if ('type' in c) add('type', d.type);
      if ('category' in c) add('category_id', catId(d));
      for (const k of ['inn', 'kpp', 'phone', 'email', 'address', 'credit_limit', 'credit_days', 'is_active']) if (k in c) add(k, d[k]);
      if ('currency' in c) add('currency_id', d.currency_id);
      vals.push(r.matchId);
      await client.query(`UPDATE counterparties SET ${set.join(', ')} WHERE id=$${vals.length}`, vals);
      updated++;
    }
  }
  return { inserted, updated, createdCategories: newCats, createdGrades: [] };
}

// ── Сорта ───────────────────────────────────────────────────
async function loadGrades(db) {
  const { rows } = await db.query('SELECT id, name, code, sort_order, is_active FROM grades');
  const byKey = new Map(), byCode = new Map();
  for (const g of rows) {
    const k = keyOf(g.name);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(g);
    if (g.code && keyOf(g.code)) { const c = keyOf(g.code); if (!byCode.has(c)) byCode.set(c, []); byCode.get(c).push(g); }
  }
  return { byKey, byCode };
}

function validateGrades(rows, ctx, mode) {
  const def = KINDS.grades;
  for (const r of rows) {
    const { err, info } = rowHelpers(r);
    if (isExample(def, r)) { r.status = 'skip'; info(null, 'Строка-пример из шаблона — пропущена'); continue; }
    commonChecks(def, r);
    const d = r.data;
    d.name = str(r, 'name', 100, 'Наименование');
    if (!r.values.name) err('name', 'Не заполнено наименование');
    d.code = str(r, 'code', 20, 'Код');
    d.sort_order = num(r, 'sort_order', { int: true, min: -1000000, max: 1000000, label: 'Порядок' });
    d.is_active = bool(r, 'is_active', 'Активен');
    r.key = d.name ? keyOf(d.name) : null;
  }
  markFileDuplicates(rows, r => r.key, 'name', 'Наименование');
  const codeRows = new Map();
  for (const r of rows) if (r.status !== 'skip' && r.data.code) { const c = keyOf(r.data.code); if (!codeRows.has(c)) codeRows.set(c, []); codeRows.get(c).push(r.row); }
  const labels = labelsOf(def);
  for (const r of rows) {
    if (r.status === 'skip') continue;
    const d = r.data;
    const { err, warn } = rowHelpers(r);
    const match = r.key ? pickActive(ctx.byKey.get(r.key)) : null;
    if (match && d.code && match.code && keyOf(match.code) && keyOf(match.code) !== keyOf(d.code)) {
      err('code', `Сорт «${match.name}» уже есть с кодом «${match.code}». Код в файле другой — запись не изменена`);
    }
    if (d.code) {
      const others = (ctx.byCode.get(keyOf(d.code)) || []).filter(g => !match || g.id !== match.id);
      if (others.length) warn('code', `Код «${d.code}» уже у сорта «${others[0].name}»`);
      const same = codeRows.get(keyOf(d.code));
      if (same && same.length > 1) warn('code', `Код повторяется в файле (строки ${same.join(', ')})`);
    }
    const ch = {};
    if (match) {
      if (d.code && !(match.code && keyOf(match.code))) ch.code = d.code;
      if (d.sort_order !== undefined && !sameNum(match.sort_order, d.sort_order)) ch.sort_order = d.sort_order;
      if (d.is_active !== undefined && d.is_active !== (match.is_active !== false)) ch.is_active = d.is_active;
    }
    finishStatus(r, mode, match, ch, labels);
  }
}

async function applyGrades(client, rows) {
  let inserted = 0, updated = 0;
  for (const r of rows) {
    const d = r.data;
    if (r.status === 'new') {
      await client.query('INSERT INTO grades (name, code, sort_order, is_active) VALUES ($1,$2,$3,$4)',
        [d.name, d.code ?? null, d.sort_order ?? 0, d.is_active ?? true]);
      inserted++;
    } else if (r.status === 'update') {
      const set = [], vals = [];
      for (const k of ['code', 'sort_order', 'is_active']) if (k in r.changes) { vals.push(d[k]); set.push(`${k}=$${vals.length}`); }
      vals.push(r.matchId);
      await client.query(`UPDATE grades SET ${set.join(', ')} WHERE id=$${vals.length}`, vals);
      updated++;
    }
  }
  return { inserted, updated, createdCategories: [], createdGrades: [] };
}

// ── Товары ──────────────────────────────────────────────────
async function loadProducts(db) {
  const [{ rows: prods }, { rows: cats }, { rows: units }, { rows: countries }, { rows: grades }, { rows: pg }] = await Promise.all([
    db.query('SELECT id, sku, name, category_id, default_unit_id, default_country_id, default_grade_id, has_serial, has_batch, min_stock, weight_kg, is_active FROM products'),
    db.query('SELECT id, name, is_active FROM product_categories'),
    db.query('SELECT id, name, short_name FROM units ORDER BY id'),
    db.query('SELECT id, name, alpha2, alpha3 FROM countries ORDER BY id'),
    db.query('SELECT id, name, code, is_active FROM grades ORDER BY id'),
    db.query('SELECT product_id, grade_id FROM product_grades'),
  ]);
  const bySku = new Map(), byName = new Map();
  for (const p of prods) {
    if (p.sku && keyOf(p.sku)) bySku.set(keyOf(p.sku), p);
    const k = keyOf(p.name);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(p);
  }
  const catByKey = new Map();
  for (const c of cats) { const k = keyOf(c.name); if (!catByKey.has(k) || c.is_active) catByKey.set(k, c); }
  const unitByKey = new Map();
  for (const u of units) { if (u.short_name) unitByKey.set(keyOf(u.short_name), u); }
  for (const u of units) { const k = keyOf(u.name); if (!unitByKey.has(k)) unitByKey.set(k, u); }
  for (const u of units) { const k = keyOf(u.short_name || '').replace(/\.$/, ''); if (k && !unitByKey.has(k)) unitByKey.set(k, u); }
  const countryByKey = new Map();
  for (const c of countries) { countryByKey.set(keyOf(c.name), c); }
  for (const c of countries) for (const a of [c.alpha2, c.alpha3]) { const k = keyOf(a || ''); if (k && !countryByKey.has(k)) countryByKey.set(k, c); }
  const gradeByKey = new Map();
  for (const g of grades) { const k = keyOf(g.name); if (!gradeByKey.has(k) || g.is_active) gradeByKey.set(k, g); }
  for (const g of grades) { const k = keyOf(g.code || ''); if (k && !gradeByKey.has(k)) gradeByKey.set(k, g); }
  const pgMap = new Map();
  for (const x of pg) { if (!pgMap.has(x.product_id)) pgMap.set(x.product_id, new Set()); pgMap.get(x.product_id).add(x.grade_id); }
  return { bySku, byName, catByKey, unitByKey, countryByKey, gradeByKey, pgMap };
}

function validateProducts(rows, ctx, mode) {
  const def = KINDS.products;
  const resolveGrade = (r, name, col) => {
    if (name.length > 100) { rowHelpers(r).err(col, `Сорт «${name.slice(0, 30)}…»: длиннее 100 знаков`); return null; }
    const g = ctx.gradeByKey.get(keyOf(name));
    if (g) {
      r.warnedGrades = r.warnedGrades || new Set();
      if (g.is_active === false && !r.warnedGrades.has(g.id)) { r.warnedGrades.add(g.id); rowHelpers(r).warn(col, `Сорт «${g.name}» отключён в справочнике`); }
      return { id: g.id, name: g.name };
    }
    return { newName: name };
  };
  for (const r of rows) {
    const { err, warn, info } = rowHelpers(r);
    if (isExample(def, r)) { r.status = 'skip'; info(null, 'Строка-пример из шаблона — пропущена'); continue; }
    commonChecks(def, r);
    const d = r.data;
    d.name = str(r, 'name', 500, 'Наименование');
    if (!r.values.name) err('name', 'Не заполнено наименование');
    d.sku = str(r, 'sku', 100, 'Артикул');
    if (r.values.category) {
      const name = str(r, 'category', 255, 'Категория');
      if (name) {
        const c = ctx.catByKey.get(keyOf(name));
        if (c) { d.category_id = c.id; if (c.is_active === false) warn('category', `Категория «${c.name}» отключена в справочнике`); }
        else { d.category_new = name; info('category', `Категория «${name}» будет создана`); }
      }
    }
    if (r.values.unit) {
      const u = ctx.unitByKey.get(keyOf(r.values.unit)) || ctx.unitByKey.get(keyOf(r.values.unit).replace(/\.$/, ''));
      if (u) d.unit_id = u.id; else err('unit', `Единица «${r.values.unit}» не найдена в справочнике «Единицы измерения»`);
    }
    if (r.values.country) {
      const c = ctx.countryByKey.get(keyOf(r.values.country));
      if (c) d.country_id = c.id; else err('country', `Страна «${r.values.country}» не найдена в справочнике «Страны»`);
    }
    const newGrades = new Set();
    if (r.values.grade) {
      d.grade = resolveGrade(r, r.values.grade, 'grade');
      if (d.grade && d.grade.newName) newGrades.add(d.grade.newName);
    }
    if (r.values.grades) {
      const names = String(r.raw.grades ?? '').split(/[;\n]/).map(s => text(s)).filter(Boolean);
      const list = [], seen = new Set();
      for (const n of names) {
        const g = resolveGrade(r, n, 'grades');
        if (!g) continue;
        const k = g.id ? 'id:' + g.id : 'new:' + keyOf(g.newName);
        if (seen.has(k)) continue;
        seen.add(k); list.push(g);
        if (g.newName) newGrades.add(g.newName);
      }
      if (d.grade) {
        const k = d.grade.id ? 'id:' + d.grade.id : 'new:' + keyOf(d.grade.newName);
        if (!seen.has(k)) { list.push(d.grade); info('grades', `Сорт по умолчанию «${d.grade.name || d.grade.newName}» добавлен в доступные сорта`); }
      }
      d.grades = list;
    }
    for (const n of newGrades) info(r.values.grades && !r.values.grade ? 'grades' : 'grade', `Сорт «${n}» будет создан`);
    d.has_batch = bool(r, 'has_batch', 'Учёт партий');
    d.has_serial = bool(r, 'has_serial', 'Серийные номера');
    d.min_stock = num(r, 'min_stock', { max: 999999999999.999, scale: 3, label: 'Мин. остаток' });
    d.weight_kg = num(r, 'weight_kg', { max: 999999.9999, scale: 4, label: 'Вес, кг' });
    d.is_active = bool(r, 'is_active', 'Активен');
    r.key = d.sku ? 'sku:' + keyOf(d.sku) : (d.name ? 'name:' + keyOf(d.name) : null);
  }
  markFileDuplicates(rows, r => r.key && r.key.startsWith('sku:') ? r.key : null, 'sku', 'Артикул');
  markFileDuplicates(rows, r => r.key && r.key.startsWith('name:') ? r.key : null, 'name', 'Наименование (без артикула)');
  const labels = labelsOf(def);
  for (const r of rows) {
    if (r.status === 'skip') continue;
    const d = r.data;
    const { err, warn } = rowHelpers(r);
    let match = null;
    if (d.sku) {
      match = ctx.bySku.get(keyOf(d.sku)) || null;
      if (!match && d.name) {
        const same = ctx.byName.get(keyOf(d.name)) || [];
        if (same.length) warn('sku', `Товар «${same[0].name}» уже есть ${same[0].sku ? `с артикулом «${same[0].sku}»` : 'без артикула'} — будет создан ещё один`);
      }
    } else if (d.name) {
      const list = ctx.byName.get(keyOf(d.name)) || [];
      const active = list.filter(p => p.is_active !== false);
      const cand = active.length ? active : list;
      if (cand.length > 1) err('name', `В справочнике несколько товаров «${d.name}» — укажите артикул`);
      else match = cand[0] || null;
    }
    const ch = {};
    if (match) {
      if (d.sku && d.name && d.name !== text(match.name)) ch.name = d.name;
      if (d.category_new) ch.category = d.category_new;
      else if (d.category_id !== undefined && d.category_id !== match.category_id) ch.category = d.category_id;
      if (d.unit_id !== undefined && d.unit_id !== match.default_unit_id) ch.unit = d.unit_id;
      if (d.country_id !== undefined && d.country_id !== match.default_country_id) ch.country = d.country_id;
      if (d.grade && (d.grade.newName || d.grade.id !== match.default_grade_id)) ch.grade = true;
      if (d.grades) {
        const cur = ctx.pgMap.get(match.id) || new Set();
        const next = d.grades.filter(g => g.id).map(g => g.id);
        if (d.grades.some(g => g.newName) || next.length !== cur.size || next.some(id => !cur.has(id))) ch.grades = true;
      }
      for (const k of ['has_batch', 'has_serial']) if (d[k] !== undefined && d[k] !== !!match[k]) ch[k] = d[k];
      for (const k of ['min_stock', 'weight_kg']) if (d[k] !== undefined && !sameNum(match[k], d[k])) ch[k] = d[k];
      if (d.is_active !== undefined && d.is_active !== (match.is_active !== false)) ch.is_active = d.is_active;
    }
    finishStatus(r, mode, match, ch, labels);
  }
}

async function applyProducts(client, rows) {
  const ok = rows.filter(r => r.status === 'new' || r.status === 'update');
  const newCats = uniqByKey(ok.map(r => r.data.category_new));
  const catMap = await ensureCategories(client, 'product_categories', newCats);
  // Новые сорта (по первому написанию в файле)
  const gradeNames = new Map();
  for (const r of ok) for (const g of [r.data.grade, ...(r.data.grades || [])]) if (g && g.newName && !gradeNames.has(keyOf(g.newName))) gradeNames.set(keyOf(g.newName), g.newName);
  const gradeMap = new Map();
  for (const [k, name] of gradeNames) {
    const { rows: ex } = await client.query('SELECT id FROM grades WHERE lower(trim(name))=$1 ORDER BY is_active DESC, id LIMIT 1', [k]);
    if (ex[0]) { gradeMap.set(k, ex[0].id); continue; }
    const { rows: ins } = await client.query('INSERT INTO grades (name, code, sort_order, is_active) VALUES ($1,NULL,0,true) RETURNING id', [name]);
    gradeMap.set(k, ins[0].id);
  }
  const gid = g => g.id || gradeMap.get(keyOf(g.newName));
  const catId = d => d.category_new ? catMap.get(keyOf(d.category_new)) : d.category_id;
  const setGrades = async (productId, list) => {
    await client.query('DELETE FROM product_grades WHERE product_id=$1', [productId]);
    const ids = [...new Set(list.map(gid))];
    if (ids.length) await client.query('INSERT INTO product_grades (product_id, grade_id) SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING', [productId, ids]);
  };
  let inserted = 0, updated = 0;
  for (const r of ok) {
    const d = r.data;
    if (r.status === 'new') {
      const { rows: [p] } = await client.query(`INSERT INTO products
          (sku, name, category_id, default_unit_id, default_country_id, default_grade_id, has_serial, has_batch, min_stock, weight_kg, is_active)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [d.sku ?? null, d.name, catId(d) ?? null, d.unit_id ?? null, d.country_id ?? null, d.grade ? gid(d.grade) : null,
        d.has_serial ?? false, d.has_batch ?? false, d.min_stock ?? null, d.weight_kg ?? null, d.is_active ?? true]);
      if (d.grades && d.grades.length) await setGrades(p.id, d.grades);
      inserted++;
    } else {
      const set = [], vals = [];
      const add = (col, v) => { vals.push(v); set.push(`${col}=$${vals.length}`); };
      const c = r.changes;
      if ('name' in c) add('name', d.name);
      if ('category' in c) add('category_id', catId(d));
      if ('unit' in c) add('default_unit_id', d.unit_id);
      if ('country' in c) add('default_country_id', d.country_id);
      if ('grade' in c) add('default_grade_id', gid(d.grade));
      for (const k of ['has_batch', 'has_serial', 'min_stock', 'weight_kg', 'is_active']) if (k in c) add(k, d[k]);
      if (set.length) { vals.push(r.matchId); await client.query(`UPDATE products SET ${set.join(', ')} WHERE id=$${vals.length}`, vals); }
      if ('grades' in c) await setGrades(r.matchId, d.grades);
      updated++;
    }
  }
  return { inserted, updated, createdCategories: newCats, createdGrades: [...gradeNames.values()] };
}

KINDS.counterparties.load = loadCounterparties;
KINDS.counterparties.validate = validateCounterparties;
KINDS.counterparties.apply = applyCounterparties;
KINDS.counterparties.lockTables = ['counterparties', 'counterparty_categories'];
KINDS.grades.load = loadGrades;
KINDS.grades.validate = validateGrades;
KINDS.grades.apply = applyGrades;
KINDS.grades.lockTables = ['grades'];
KINDS.products.load = loadProducts;
KINDS.products.validate = validateProducts;
KINDS.products.apply = applyProducts;
KINDS.products.lockTables = ['products', 'product_categories', 'grades', 'product_grades'];

// Итог проверки: счётчики и что будет создано
function summarize(rows) {
  const counters = { total: rows.length, new: 0, update: 0, skip: 0, error: 0, warnings: 0 };
  for (const r of rows) {
    counters[r.status]++;
    if (r.messages.some(m => m.level === 'warning')) counters.warnings++;
  }
  const ok = rows.filter(r => r.status === 'new' || r.status === 'update');
  const uniqNames = list => { const m = new Map(); for (const n of list) if (n && !m.has(keyOf(n))) m.set(keyOf(n), n); return [...m.values()]; };
  const toCreate = {
    categories: uniqNames(ok.map(r => r.data.category_new)),
    grades: uniqNames(ok.flatMap(r => [r.data.grade, ...(r.data.grades || [])]).filter(g => g && g.newName).map(g => g.newName)),
  };
  return { counters, toCreate };
}

module.exports = { KINDS, prepareRows, findHeaderRow, summarize, text, keyOf, normHeader, parseBool, parseNum, innChecksumOk };
