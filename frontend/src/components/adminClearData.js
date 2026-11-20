// routes/adminClearData.js
// Очистка данных компании по выбранным таблицам.
// Компания берётся из заголовка X-Company-ID (req.companyId), как в остальном API.
// Подключить в server.js:  app.use(require('./routes/adminClearData'));
// ВАЖНО: подключать ПОСЛЕ express.json() и после company-middleware (req.companyId).

const express = require('express');
const router = express.Router();

// masterPool — для проверки суперадмина; getPool(companyId) — пул компании
const { getPool, masterPool } = require('../db');

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

// ⬇️ НАЗВАНИЯ РОЛЕЙ, которым разрешена очистка (посмотри свои в таблице roles).
const ADMIN_ROLE_NAMES = new Set(['Администратор', 'admin', 'Владелец', 'owner']);

const toInt = (v) => (Number.isFinite(+v) ? parseInt(v, 10) : null);

// Проверка прав: клиент присылает userId (+ viaMaster для суперадмина),
// сервер сам перечитывает роль из БД. Возвращает true/false, сам шлёт ошибку.
async function ensureAdmin(req, res) {
  const userId   = toInt(req.body?.userId ?? req.query.userId);
  const viaMaster = String(req.body?.viaMaster ?? req.query.viaMaster) === 'true';

  if (!userId) {
    res.status(401).json({ error: 'Не указан пользователь' });
    return false;
  }

  try {
    if (viaMaster) {
      const { rows } = await masterPool.query(
        `SELECT id FROM master_users WHERE id=$1 AND role='superadmin' AND is_active=true`,
        [userId]
      );
      if (!rows[0]) { res.status(403).json({ error: 'Доступ только для администратора' }); return false; }
      return true;
    }

    const pool = await getPool(req.companyId);
    const { rows } = await pool.query(
      `SELECT r.name AS role_name
         FROM users u LEFT JOIN roles r ON r.id = u.role_id
        WHERE u.id=$1 AND u.is_active=true`,
      [userId]
    );
    const role = rows[0]?.role_name;
    if (!role || !ADMIN_ROLE_NAMES.has(role)) {
      res.status(403).json({ error: 'Доступ только для администратора' });
      return false;
    }
    return true;
  } catch (e) {
    console.error('ensureAdmin error:', e);
    res.status(500).json({ error: 'Ошибка проверки прав' });
    return false;
  }
}

// GET: список таблиц компании с оценкой числа строк
router.get('/api/admin/tables', async (req, res) => {
  if (!(await ensureAdmin(req, res))) return;
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
  if (!(await ensureAdmin(req, res))) return;

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
