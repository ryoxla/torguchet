// Импорт справочников из Excel: шаблон, проверка (предпросмотр), загрузка одной транзакцией.
'use strict';
const express = require('express');
const { readTable, LIMITS, ImportFileError } = require('./format');
const { KINDS, prepareRows, findHeaderRow, summarize } = require('./kinds');
const { buildTemplate, buildErrorsFile } = require('./template');
const { ExcelMissingError } = require('./excel');

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function contentDisposition(name) {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

// Права: как у справочников. Админ — всегда; пользователь — если раздел «Справочники»
// у него не отключён и не «только просмотр». Кабинет контрагента — никогда.
async function canWriteDirectories(req, pool) {
  if (!req.auth) return false;
  if (req.auth.role === 'cabinet') return false;
  if (req.auth.role === 'admin' || req.auth.role === 'superadmin') return true;
  const uid = parseInt(req.userId, 10);
  if (!uid) return false;
  const { rows: [u] } = await pool.query('SELECT is_admin, is_active FROM users WHERE id=$1', [uid]).catch(() => ({ rows: [] }));
  if (u && u.is_active === false) return false;
  if (u && u.is_admin) return true;
  const { rows } = await pool.query("SELECT access FROM user_permissions WHERE user_id=$1 AND section='directories'", [uid]);
  const a = rows[0] ? String(rows[0].access) : 'true';
  return a !== 'false' && a !== 'readonly';
}

async function analyze(kind, buf, fileName, db, mode) {
  const def = KINDS[kind];
  const table = await readTable(buf, fileName, m => findHeaderRow(def, m));
  const prep = prepareRows(def, table.rows);
  if (prep.fatal) throw new ImportFileError(prep.fatal);
  if (prep.rows.length > LIMITS.rows) throw new ImportFileError(`В файле больше ${LIMITS.rows} строк. Разбейте его на несколько файлов.`);
  const ctx = await def.load(db);
  def.validate(prep.rows, ctx, mode);
  return { table, prep, ctx, ...summarize(prep.rows) };
}

const publicRow = r => ({ row: r.row, status: r.status, values: r.values, messages: r.messages });

module.exports = function registerImportRoutes(app, { getPool }) {
  const router = express.Router();
  const raw = express.raw({ type: () => true, limit: LIMITS.fileBytes + 1024 });

  router.param('kind', (req, res, next, kind) => {
    if (!Object.prototype.hasOwnProperty.call(KINDS, kind)) return res.status(404).json({ error: 'Неизвестный справочник' });
    next();
  });

  router.get('/:kind/template', async (req, res) => {
    try {
      const pool = await getPool(req.companyId);
      const buf = await buildTemplate(req.params.kind, pool);
      res.setHeader('Content-Type', XLSX_MIME);
      res.setHeader('Content-Disposition', contentDisposition(KINDS[req.params.kind].file));
      res.end(Buffer.from(buf));
    } catch (e) { res.status(e instanceof ExcelMissingError ? 503 : 500).json({ error: e.message }); }
  });

  const fileOf = req => ({
    buf: Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0),
    name: (() => { try { return decodeURIComponent(String(req.headers['x-file-name'] || '')); } catch { return ''; } })(),
  });
  const modeOf = req => (req.query.mode === 'upsert' ? 'upsert' : 'add');

  router.post('/:kind/preview', raw, async (req, res) => {
    try {
      const pool = await getPool(req.companyId);
      if (!(await canWriteDirectories(req, pool))) return res.status(403).json({ error: 'Недостаточно прав для изменения справочников' });
      const { buf, name } = fileOf(req);
      const a = await analyze(req.params.kind, buf, name, pool, modeOf(req));
      res.json({
        mode: modeOf(req), format: a.table.format, sheet: a.table.sheet, headerRow: a.prep.headerRow,
        columns: a.prep.columns, fileMessages: a.prep.fileMessages, counters: a.counters, toCreate: a.toCreate,
        rows: a.prep.rows.map(publicRow), limits: { rows: LIMITS.rows, fileBytes: LIMITS.fileBytes },
      });
    } catch (e) {
      if (e instanceof ImportFileError) return res.status(400).json({ error: e.message });
      if (e instanceof ExcelMissingError) return res.status(503).json({ error: e.message });
      console.error('Импорт (проверка):', e);
      res.status(500).json({ error: e.message });
    }
  });

  // Загрузка: файл проверяется заново внутри транзакции, пишутся только корректные строки
  router.post('/:kind/commit', raw, async (req, res) => {
    const kind = req.params.kind;
    const def = KINDS[kind];
    let client;
    try {
      const pool = await getPool(req.companyId);
      if (!(await canWriteDirectories(req, pool))) return res.status(403).json({ error: 'Недостаточно прав для изменения справочников' });
      const { buf, name } = fileOf(req);
      client = await pool.connect();
      await client.query('BEGIN');
      // Блокируем запись в эти таблицы до конца загрузки, чтобы параллельно не появились дубли
      await client.query(`LOCK TABLE ${def.lockTables.join(', ')} IN SHARE ROW EXCLUSIVE MODE`);
      const a = await analyze(kind, buf, name, client, modeOf(req));
      const expected = parseInt(req.query.expect, 10);
      const ready = a.counters.new + a.counters.update;
      if (Number.isInteger(expected) && expected !== ready) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Справочник изменился после проверки. Проверьте файл ещё раз.', counters: a.counters });
      }
      const result = await def.apply(client, a.prep.rows, a.ctx);
      await client.query('COMMIT');
      res.json({
        ok: true, mode: modeOf(req), ...result, counters: a.counters,
        skipped: a.counters.skip, errors: a.counters.error,
        rows: a.prep.rows.filter(r => r.status === 'error' || r.messages.some(m => m.level === 'warning')).map(publicRow),
      });
    } catch (e) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      if (e instanceof ImportFileError) return res.status(400).json({ error: e.message });
      if (e instanceof ExcelMissingError) return res.status(503).json({ error: e.message });
      console.error('Импорт (загрузка):', e);
      res.status(500).json({ error: 'Загрузка отменена, ничего не записано: ' + e.message });
    } finally {
      if (client) client.release();
    }
  });

  // Список ошибок и предупреждений в .xlsx (строки присылает браузер из результата проверки)
  router.post('/:kind/errors-file', express.json({ limit: '20mb' }), async (req, res) => {
    try {
      const rows = Array.isArray(req.body && req.body.rows) ? req.body.rows : [];
      const buf = await buildErrorsFile(req.params.kind, rows);
      res.setHeader('Content-Type', XLSX_MIME);
      res.setHeader('Content-Disposition', contentDisposition(`Ошибки импорта — ${KINDS[req.params.kind].title}.xlsx`));
      res.end(Buffer.from(buf));
    } catch (e) { res.status(e instanceof ExcelMissingError ? 503 : 500).json({ error: e.message }); }
  });

  // Слишком большой файл и прочие ошибки разбора тела запроса
  router.use((err, req, res, next) => {
    if (err && err.type === 'entity.too.large') return res.status(413).json({ error: `Файл больше ${LIMITS.fileBytes / 1024 / 1024} МБ.` });
    if (err) return res.status(400).json({ error: err.message });
    next();
  });

  app.use('/api/import', router);
};
