const { Pool, types } = require('pg');
require('dotenv').config();

types.setTypeParser(1082, val => val);
types.setTypeParser(1114, val => val);
types.setTypeParser(1184, val => val);

const isProduction = process.env.NODE_ENV === 'production';

// MODE=single  — одна база, одна компания (установка у клиента)
// MODE=multi   — несколько компаний + master-база (по умолчанию, как раньше)
const SINGLE = String(process.env.MODE || '').toLowerCase() === 'single';

function setupClient(pool) {
  pool.on('connect', async (client) => {
    try {
      await client.query("SET client_encoding = 'UTF8'");
      await client.query("SET timezone = 'Europe/Moscow'");
    } catch (e) { console.error('Ошибка настройки соединения:', e.message); }
  });
  pool.on('error', (err) => console.error('Ошибка подключения к БД:', err.message));
  return pool;
}

function createPool(connectionString) {
  return setupClient(new Pool({
    connectionString,
    ssl: isProduction ? { rejectUnauthorized: false } : false
  }));
}

let masterPool;
let getPool;

if (SINGLE) {
  // ── ОДНА БАЗА ──────────────────────────────────────────────
  if (!process.env.DATABASE_URL) {
    console.error('MODE=single: в .env не задан DATABASE_URL (адрес базы).');
    process.exit(1);
  }
  const onlyPool = createPool(process.env.DATABASE_URL);
  getPool = async () => onlyPool;

  // master-базы в этом режиме нет. Если какой-то код всё же к ней обратится,
  // он получит пустой результат и громкое предупреждение в консоли.
  const warned = new Set();
  masterPool = {
    query: async (sql) => {
      const k = String(sql).replace(/\s+/g, ' ').trim().slice(0, 70);
      if (!warned.has(k)) { warned.add(k); console.warn('⚠ master недоступен в MODE=single, запрос пропущен:', k); }
      return { rows: [], rowCount: 0 };
    }
  };
} else {
  // ── НЕСКОЛЬКО КОМПАНИЙ (как раньше) ────────────────────────
  masterPool = createPool(process.env.MASTER_DATABASE_URL);
  const companyPools = {};

  getPool = async function (companyId) {
    const id = String(companyId);
    if (companyPools[id]) return companyPools[id];

    const { rows } = await masterPool.query(
      'SELECT db_url FROM companies WHERE id = $1 AND is_active = true',
      [id]
    );
    if (!rows.length) throw new Error(`Компания не найдена: ${companyId}`);

    companyPools[id] = createPool(rows[0].db_url);
    return companyPools[id];
  };

  // Локальная разработка без MASTER_DATABASE_URL
  if (!process.env.MASTER_DATABASE_URL) {
    companyPools['1'] = setupClient(new Pool({
      host: 'localhost', port: 5432, database: 'trade_db', user: 'postgres', password: '123',
    }));
  }
}

module.exports = { masterPool, getPool, SINGLE };
