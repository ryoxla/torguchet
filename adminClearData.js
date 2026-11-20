// routes/adminClearData.js — можно положить рядом с server.js (плоско)
// Очистка данных компании по выбранным таблицам.
// Компания берётся из заголовка X-Company-ID (req.companyId), как в остальном API.
// Подключить в server.js:  app.use(require('./adminClearData'));
// ВАЖНО: подключать ПОСЛЕ express.json() и после company-middleware (req.companyId).

const express = require('express');
const router = express.Router();

// masterPool — для проверки суперадмина; getPool(companyId) — пул компании
const { getPool } = require('./db');

// Таблицы, которые НИКОГДА не показываем и не трогаем (авторизация/служебные)
const PROTECTED_TABLES = new Set([
  'users',
  'user_permissions',
  'roles',
  'permissions',
  'role_permissions',
  'companies',
  'counterparty_users',
  'migrations',
]);

const toInt = (v) => (Number.isFinite(+v) ? parseInt(v, 10) : null);

// Права берём из подписанного токена (его выдал сервер при входе), а не из того, что прислал браузер.
// Очищать данные могут только администраторы.
async function ensureAllowed(req, res) {
  const role = req.auth && req.auth.role;
  if (role === 'superadmin' || role === 'admin') return true;
  res.status(403).json({ error: 'Недостаточно прав' });
  return false;
}

// GET: список таблиц компании с оценкой числа строк
router.get('/api/admin/tables', async (req, res) => {
  if (!(await ensureAllowed(req, res))) return;
  try {
    const pool = await getPool(req.companyId);
    const { rows } = await pool.query(`
      SELECT t.tablename AS table,
             COALESCE(s.n_live_tup, 0)::bigint AS rows
      FROM pg_tables t
      LEFT JOIN pg_stat_user_tables s ON s.relname = t.tablename
      WHERE t.schemaname = 'public'
      ORDER BY t.tablename
    `);
    const tables = rows
      .filter((r) => !PROTECTED_TABLES.has(r.table))
      .map((r) => ({ table: r.table, rows: Number(r.rows) }));
    res.json(tables);
  } catch (e) {
    console.error('tables list error:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST: очистить выбранные таблицы
router.post('/api/admin/clear-data', async (req, res) => {
  if (!(await ensureAllowed(req, res))) return;

  const { tables: selected, confirm } = req.body || {};

  if (confirm !== 'ОЧИСТИТЬ') {
    return res.status(400).json({ error: 'Операция не подтверждена' });
  }
  if (!Array.isArray(selected) || selected.length === 0) {
    return res.status(400).json({ error: 'Не выбраны таблицы для очистки' });
  }

  const pool = await getPool(req.companyId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Валидация выбора против РЕАЛЬНЫХ таблиц + отсечение защищённых
    // (защита от SQL-инъекции: в TRUNCATE попадают только имена из БД).
    const { rows } = await client.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
    );
    const real = new Set(rows.map((r) => r.tablename));
    const valid = selected.filter((t) => real.has(t) && !PROTECTED_TABLES.has(t));

    if (valid.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Нет корректных таблиц для очистки' });
    }

    const list = valid.map((t) => `"${t}"`).join(', ');
    await client.query(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);

    await client.query('COMMIT');
    res.json({ ok: true, cleared: valid });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('clear-data error:', e);
    res.status(500).json({ error: e.message || 'Ошибка очистки' });
  } finally {
    client.release();
  }
});

module.exports = router;
