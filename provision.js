// Автоматическая подготовка базы новой компании:
// создаёт базу, загружает структуру из schema_company.sql, записывает компанию и администратора.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const SCHEMA_FILE = path.join(__dirname, 'schema_company.sql');

function parseDbUrl(dbUrl) {
  let u;
  try { u = new URL(dbUrl); } catch { throw new Error('Неверный формат Database URL'); }
  if (!/^postgres(ql)?:$/.test(u.protocol)) throw new Error('Database URL должен начинаться с postgresql://');
  const dbName = decodeURIComponent(u.pathname.replace(/^\//, ''));
  if (!/^[A-Za-z0-9_]{1,63}$/.test(dbName)) {
    throw new Error('Имя базы в адресе: только латинские буквы, цифры и _ (до 63 символов)');
  }
  return { u, dbName };
}

async function withClient(url, fn) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try { return await fn(client); }
  finally { await client.end().catch(() => {}); }
}

// installTrigger(client) — функция из server.js, ставит триггер пересчёта остатков
async function provisionCompanyDb({ dbUrl, companyId, companyName, inn, adminLogin, adminHash, installTrigger }) {
  const { u, dbName } = parseDbUrl(dbUrl);
  const maintUrl = new URL(u.toString());
  maintUrl.pathname = '/postgres';

  // 1. Создаём базу, если её ещё нет
  let created = false;
  await withClient(maintUrl.toString(), async (c) => {
    const { rows } = await c.query('SELECT 1 FROM pg_database WHERE datname=$1', [dbName]);
    if (!rows.length) {
      await c.query(`CREATE DATABASE "${dbName}" ENCODING 'UTF8' TEMPLATE template0`);
      created = true;
    }
  });

  try {
    // 2. Структура таблиц: только если в базе ещё нет таблицы users
    const hasSchema = await withClient(u.toString(), async (c) => {
      const { rows } = await c.query("SELECT to_regclass('public.users') AS t");
      return !!rows[0].t;
    });
    if (!hasSchema) {
      if (!fs.existsSync(SCHEMA_FILE)) {
        throw new Error('Не найден файл schema_company.sql рядом с server.js');
      }
      const sql = fs.readFileSync(SCHEMA_FILE, 'utf8')
        .split(/\r?\n/).filter(l => !l.startsWith('\\') && !/^SET transaction_timeout/i.test(l)).join('\n');   // убираем psql-команды (\restrict и т.п.)
      await withClient(u.toString(), (c) => c.query(sql));
    }

    // 3. Запись о компании внутри её базы + администратор + триггер
    await withClient(u.toString(), async (c) => {
      await c.query(
        `INSERT INTO public.companies (id, name, inn, is_active)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
        [companyId, companyName, inn ? String(inn).slice(0, 12) : null]
      );
      if (adminLogin && adminHash) {
        await c.query(
          `INSERT INTO public.users (login, password_hash, full_name, company_id, is_active, date_restrict)
           VALUES ($1, $2, $3, $4, true, false)
           ON CONFLICT (login) DO NOTHING`,
          [adminLogin, adminHash, adminLogin, companyId]
        );
      }
      if (installTrigger) await installTrigger(c);
    });
  } catch (e) {
    // если базу создали мы сами, а наполнить не удалось, удаляем её, чтобы можно было повторить
    if (created) {
      await withClient(maintUrl.toString(), (c) =>
        c.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`)
      ).catch(() => {});
    }
    throw e;
  }
  return { created };
}

module.exports = { provisionCompanyDb };
