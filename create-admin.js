// Создание (или сброс пароля) администратора в режиме MODE=single.
// Использование:  node create-admin.js ЛОГИН ПАРОЛЬ "Имя Фамилия" "Название компании"
// Тот же скрипт сбрасывает пароль, если администратор его забыл.
require('dotenv').config();
process.env.MODE = 'single';
const bcrypt = require('bcrypt');
const { getPool } = require('./db');
const { runMigrations } = require('./migrate');

(async () => {
  const [login, password, fullName, companyName] = process.argv.slice(2);
  if (!login || !password) {
    console.log('Использование: node create-admin.js ЛОГИН ПАРОЛЬ "Имя Фамилия" "Название компании"');
    process.exit(1);
  }
  if (password.length < 6) { console.error('Пароль должен быть не короче 6 символов.'); process.exit(1); }
  const pool = await getPool();
  await runMigrations(pool, 'основная база');

  let { rows: [co] } = await pool.query('SELECT id FROM companies ORDER BY id LIMIT 1');
  if (!co) {
    ({ rows: [co] } = await pool.query(
      'INSERT INTO companies (name, is_active) VALUES ($1, true) RETURNING id',
      [companyName || process.env.COMPANY_NAME || 'Моя компания']));
  } else if (companyName) {
    await pool.query('UPDATE companies SET name=$1 WHERE id=$2', [companyName, co.id]);
  }

  const hash = await bcrypt.hash(password, 10);
  const { rows: ex } = await pool.query('SELECT id FROM users WHERE login=$1', [login]);
  if (ex.length) {
    await pool.query('UPDATE users SET password_hash=$1, is_admin=true, is_active=true WHERE id=$2', [hash, ex[0].id]);
    console.log(`Пароль администратора "${login}" обновлён.`);
  } else {
    await pool.query(
      `INSERT INTO users (login, password_hash, full_name, company_id, is_active, is_admin, date_restrict)
       VALUES ($1,$2,$3,$4,true,true,false)`,
      [login, hash, fullName || login, co.id]);
    console.log(`Администратор "${login}" создан.`);
  }
  await pool.end();
})().catch(e => { console.error('Ошибка:', e.message); process.exit(1); });
