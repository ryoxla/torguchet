// Установка у нового клиента: создаёт базу, структуру, файл .env, справочники и администратора.
// Запускается из install.bat.
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');
const { Client } = require('pg');
const bcrypt = require('bcrypt');
const { provisionCompanyDb } = require('./provision');
const { runMigrations } = require('./migrate');

const ENV_FILE = path.join(__dirname, '.env');
let cleanup = null; // удалить созданную базу, если установка не удалась

// ввод строк (работает и с клавиатуры, и из файла)
const rl = readline.createInterface({ input: process.stdin });
const queue = []; let waiter = null; let closed = false;
rl.on('line', l => { if (waiter) { const w = waiter; waiter = null; w(l); } else queue.push(l); });
rl.on('close', () => { closed = true; if (waiter) { const w = waiter; waiter = null; w(''); } });
function ask(q, def) {
  process.stdout.write(q + (def !== undefined && def !== '' ? ` [${def}]` : '') + ': ');
  return new Promise(res => {
    const done = l => { l = String(l).replace(/\r$/, '').trim(); if (!process.stdin.isTTY) console.log(l); res(l === '' && def !== undefined ? String(def) : l); };
    if (queue.length) return done(queue.shift());
    if (closed) return done('');
    waiter = done;
  });
}
async function askRequired(q, def, check) {
  for (;;) {
    const v = await ask(q, def);
    const err = !v ? 'Поле не может быть пустым.' : (check ? check(v) : null);
    if (!err) return v;
    console.log('  ! ' + err);
    if (closed && !queue.length) { console.error('Ввод прерван.'); process.exit(1); }
  }
}

async function withClient(url, fn) {
  const c = new Client({ connectionString: url });
  await c.connect();
  try { return await fn(c); } finally { await c.end().catch(() => {}); }
}

async function seedReference(url) {
  await withClient(url, async (c) => {
    await c.query(`INSERT INTO currencies (code, name, symbol, is_base)
      SELECT 'RUB','Российский рубль','₽',true WHERE NOT EXISTS (SELECT 1 FROM currencies WHERE code='RUB')`);
    for (const [name, short, okei] of [['Килограмм','кг','166'],['Штука','шт','796'],['Тонна','т','168'],['Литр','л','112'],['Упаковка','уп','778'],['Ящик','ящ',null]]) {
      await c.query(`INSERT INTO units (name, short_name, okei_code)
        SELECT $1::varchar,$2::varchar,$3::varchar WHERE NOT EXISTS (SELECT 1 FROM units WHERE name=$1::varchar)`, [name, short, okei]);
    }
    const { rows: [co] } = await c.query('SELECT id FROM companies ORDER BY id LIMIT 1');
    const { rows: [cur] } = await c.query("SELECT id FROM currencies WHERE code='RUB'");
    await c.query(`INSERT INTO warehouses (name, company_id, is_active, is_default)
      SELECT 'Основной склад',$1,true,true WHERE NOT EXISTS (SELECT 1 FROM warehouses)`, [co.id]);
    await c.query(`INSERT INTO bank_accounts (company_id, name, type, currency_id, is_active, is_default)
      SELECT $1,'Касса','cash',$2,true,true WHERE NOT EXISTS (SELECT 1 FROM bank_accounts)`, [co.id, cur.id]);
  });
}

(async () => {
  console.log('============================================');
  console.log('  Установка ТоргУчёт');
  console.log('============================================\n');
  if (!fs.existsSync(path.join(__dirname, 'schema_company.sql'))) {
    console.error('Нет файла schema_company.sql рядом с программой. Установка невозможна.'); process.exit(1);
  }
  if (fs.existsSync(ENV_FILE)) {
    console.log('Файл .env уже существует: программа уже установлена.');
    console.log('Для обновления используйте update.bat. Для новой установки удалите .env и базу.');
    process.exit(1);
  }

  console.log('--- PostgreSQL ---');
  let host, port, pass, adminUrl;
  for (;;) {
    host = await ask('Адрес сервера PostgreSQL', 'localhost');
    port = await ask('Порт', '5432');
    pass = await askRequired('Пароль пользователя postgres (его вы задали при установке PostgreSQL)');
    adminUrl = `postgresql://postgres:${encodeURIComponent(pass)}@${host}:${port}/postgres`;
    try { await withClient(adminUrl, c => c.query('SELECT 1')); console.log('  Подключение успешно.\n'); break; }
    catch (e) {
      console.log('  ! Не удалось подключиться: ' + e.message);
      console.log('    Проверьте, что PostgreSQL установлен и запущен, а пароль и порт верные.\n');
      if (closed && !queue.length) process.exit(1);
    }
  }

  const dbName = await askRequired('Имя новой базы (латиницей)', 'torguchet', v => /^[A-Za-z0-9_]{1,63}$/.test(v) ? null : 'Только латинские буквы, цифры и _');
  const dbUrl = `postgresql://postgres:${encodeURIComponent(pass)}@${host}:${port}/${dbName}`;
  const exists = await withClient(adminUrl, async c => (await c.query('SELECT 1 FROM pg_database WHERE datname=$1', [dbName])).rows.length > 0);
  if (exists) {
    const hasUsers = await withClient(dbUrl, async c => !!(await c.query("SELECT to_regclass('public.users') t")).rows[0].t);
    if (hasUsers) { console.error(`\nБаза "${dbName}" уже существует и содержит данные. Установка остановлена, чтобы ничего не затереть.`); process.exit(1); }
  }

  console.log('\n--- Компания ---');
  const company = await askRequired('Название компании');
  console.log('\n--- Администратор (главный пользователь) ---');
  const login = await askRequired('Логин');
  const fullName = await ask('Имя и фамилия', login);
  const password = await askRequired('Пароль (не короче 6 символов)', undefined, v => v.length >= 6 ? null : 'Слишком короткий пароль');
  const appPort = await ask('Порт программы', '3000');

  console.log('\nСоздаю базу и структуру таблиц...');
  if (!exists) cleanup = async () => { await withClient(adminUrl, c => c.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`)); };
  await provisionCompanyDb({ dbUrl, companyId: 1, companyName: company, inn: null, adminLogin: null, adminHash: null, installTrigger: null });

  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: dbUrl });
  try {
    const applied = await runMigrations(pool, 'основная база');
    console.log('Миграции применены: ' + (applied.join(', ') || 'нет'));
  } finally { await pool.end(); }

  console.log('Добавляю начальные справочники (рубль, единицы, склад, касса)...');
  await seedReference(dbUrl);

  const hash = await bcrypt.hash(password, 10);
  await withClient(dbUrl, async c => {
    await c.query(`INSERT INTO users (login, password_hash, full_name, company_id, is_active, is_admin, date_restrict)
                   VALUES ($1,$2,$3,1,true,true,false)`, [login, hash, fullName]);
  });
  console.log('Администратор создан.');

  fs.writeFileSync(ENV_FILE,
`PORT=${appPort}
MODE=single
DATABASE_URL=${dbUrl}
# Секрет для подписи входа создаётся автоматически (файл .auth_secret).
# Не копируйте .env и .auth_secret на другие установки.
`);
  console.log('Файл .env создан.');

  console.log('\n============================================');
  console.log('  Установка завершена.');
  console.log('  Запустите start.bat и войдите под логином: ' + login);
  console.log('============================================');
  process.exit(0);
})().catch(async e => {
  console.error('\nОшибка установки: ' + e.message);
  try { if (cleanup) { await cleanup(); console.error('Созданная база удалена, можно запустить install.bat заново.'); } } catch {}
  try { if (fs.existsSync(ENV_FILE)) fs.unlinkSync(ENV_FILE); } catch {}
  process.exit(1);
});
