const express = require('express');
const cors    = require('cors');
const path    = require('path');
const bcrypt  = require('bcrypt');
const { masterPool, getPool, SINGLE } = require('./db');
const { provisionCompanyDb } = require('./provision');
const auth = require('./auth');
const { runMigrations } = require('./migrate');
const APP_VERSION = require('./package.json').version;
const BCRYPT_ROUNDS = 10;

// Ошибка в фоне (например, обрыв соединения с БД) не должна останавливать сервер
process.on('unhandledRejection', (e) => console.error('Необработанная ошибка:', e && e.message ? e.message : e));
process.on('uncaughtException',  (e) => console.error('Неперехваченная ошибка:', e && e.message ? e.message : e));

// Список активных компаний (в режиме одной базы она всегда одна)
async function activeCompanies() {
  if (SINGLE) return [{ id: 1 }];
  const { rows } = await masterPool.query('SELECT id FROM companies WHERE is_active=true');
  return rows;
}

// Права администратора берутся из подписанного токена, а не из того, что прислал браузер
const isAdminReq = (req) => !!req.auth && (req.auth.role === 'admin' || req.auth.role === 'superadmin');
function denyUnlessAdmin(req, res) {
  if (SINGLE && !isAdminReq(req)) { res.status(403).json({ error: 'Недостаточно прав' }); return true; }
  return false;
}
// true, если пользователь userId — единственный активный администратор
async function isLastAdmin(pool, userId) {
  const { rows: [me] } = await pool.query('SELECT is_admin FROM users WHERE id=$1', [userId]);
  if (!me || !me.is_admin) return false;
  const { rows: [c] } = await pool.query('SELECT COUNT(*)::int AS n FROM users WHERE is_admin AND is_active AND id<>$1', [userId]);
  return c.n === 0;
}
async function verifyPassword(plain, hash) {
  if (!hash) return { ok: false };
  if (hash.startsWith('$2')) return { ok: await bcrypt.compare(plain, hash) };
  const md5 = require('crypto').createHash('md5').update(plain).digest('hex'); // старый формат
  return { ok: md5 === hash, needsUpgrade: md5 === hash };
}

// id записи компании внутри базы компании: берём нужный, а если такого нет — первую существующую
async function companyRowId(pool, preferredId) {
  const { rows } = await pool.query(
    'SELECT id FROM companies ORDER BY (id = $1) DESC, id LIMIT 1',
    [parseInt(preferredId) || 0]
  );
  return rows[0] ? rows[0].id : null;
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ── РАЗДЕЛЫ, КОТОРЫХ НЕТ В РЕЖИМЕ ОДНОЙ БАЗЫ ──────────────────
app.use('/api', (req, res, next) => {
  if (SINGLE && /^\/(superadmin|intercompany|cabinet)(\/|$)|^\/counterparties\/[^/]+\/cabinet$/.test(req.path)) {
    return res.status(404).json({ error: 'Недоступно в этой версии' });
  }
  next();
});

// ── АВТОРИЗАЦИЯ ПО ТОКЕНУ ────────────────────────────────────
// Компания и пользователь берутся из подписанного токена, заголовкам X-User-ID / X-Company-ID больше не верим.
app.use('/api', auth.authMiddleware({ singleMode: SINGLE }));

// Панель суперадмина (компании, пользователи master, связи) доступна только суперадмину
app.use('/api/superadmin', (req, res, next) => {
  if (req.auth && req.auth.role === 'superadmin') return next();
  res.status(403).json({ error: 'Недостаточно прав' });
});

// Публичная информация: режим работы и версия (нужно экрану входа)
app.get('/api/config', (req, res) => res.json({ mode: SINGLE ? 'single' : 'multi', version: APP_VERSION }));

// Фронтенд (собранный vite) отдаётся из папки public
const PUBLIC_DIR = path.join(__dirname, 'public');
// index.html ссылается на бандлы с хэшем в имени. Его нельзя держать в кэше браузера:
// после обновления старая копия укажет на уже удалённый бандл (белая страница).
// no-cache = браузер каждый раз сверяется с сервером (304, если не менялся). Хэшированные assets кэшируются как обычно.
const noCacheHtml = (res) => res.setHeader('Cache-Control', 'no-cache');
app.use(express.static(PUBLIC_DIR, {
  setHeaders: (res, filePath) => { if (/\.html?$/i.test(filePath)) noCacheHtml(res); },
}));
app.get('/', (req, res) => {
  noCacheHtml(res);
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use((req, res, next) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  next();
});

// ── ROUTES: очистка данных (админ) ───────────────────────────
app.use(require('./adminClearData'));


// ── AUDIT LOG ────────────────────────────────────────────────

// Пользователь для журнала аудита берётся из токена входа (req.userId), а не из тела запроса.
// created_by в теле можно не передать или подменить; токен подделать нельзя.
function auditUserId(req) {
  const n = parseInt(req.userId, 10);
  return Number.isNaN(n) ? null : n;
}

async function logAudit(client, userId, tableName, recordId, action, oldData=null, newData=null) {
  try {
    // Безопасная сериализация — убираем circular references и функции
    const safeStr = (obj) => {
      if (!obj) return null;
      try { return JSON.stringify(obj, (k,v) => typeof v === 'function' ? undefined : v); }
      catch(e) { return null; }
    };
    await client.query(
      `INSERT INTO audit_log (user_id, table_name, record_id, action, old_data, new_data)
       VALUES ($1,$2,$3,$4::audit_action,$5,$6)`,
      [userId||null, tableName, recordId, action,
       safeStr(oldData), safeStr(newData)]
    );
  } catch(e) {
    console.error('Audit log error:', e.message, e.stack);
  }
}

app.get('/api/audit/:table/:id', async (req, res) => {
  const { table, id } = req.params;
  const { rows } = await (await getPool(req.companyId)).query(`
    SELECT al.*, COALESCE(NULLIF(BTRIM(u.full_name), ''), u.login) AS user_name
    FROM audit_log al
    LEFT JOIN users u ON u.id = al.user_id
    WHERE al.table_name=$1 AND al.record_id=$2
    ORDER BY al.created_at DESC
  `, [table, parseInt(id)]);
  res.json(rows);
});

// ── AUDIT LOG GENERAL ─────────────────────────────────────────
app.get('/api/audit', async (req, res) => {
  const { table_name, user_id, action, date_from, date_to } = req.query;
  const conditions = [];
  const params = [];
  let i = 1;
  if (table_name) { conditions.push(`al.table_name=$${i++}`); params.push(table_name); }
  if (user_id)    { conditions.push(`al.user_id=$${i++}`);    params.push(parseInt(user_id)); }
  if (action)     { conditions.push(`al.action=$${i++}::audit_action`); params.push(action); }
  if (date_from)  { conditions.push(`al.created_at>=$${i++}`); params.push(date_from); }
  if (date_to)    { conditions.push(`al.created_at<$${i++}`);  params.push(date_to); }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const { rows } = await (await getPool(req.companyId)).query(`
    SELECT al.id, al.action, al.table_name, al.record_id,
           al.old_data, al.new_data, al.created_at,
           COALESCE(NULLIF(BTRIM(u.full_name), ''), u.login) AS user_name
    FROM audit_log al
    LEFT JOIN users u ON u.id = al.user_id
    ${where}
    ORDER BY al.created_at DESC
  `, params);
  res.json(rows);
});

// ── АВТОРИЗАЦИЯ ───────────────────────────────────────────────

app.post('/api/login', async (req, res) => {
  try {
    const { login, password } = req.body || {};
    if (!login || !password) {
      return res.status(400).json({ error: 'Введите логин и пароль' });
    }
    const key = auth.loginKey(req, login);
    if (auth.isLocked(key)) {
      return res.status(429).json({ error: 'Слишком много неудачных попыток. Подождите 10 минут.' });
    }
    const fail = () => { auth.registerFail(key); return res.status(401).json({ error: 'Неверный логин или пароль' }); };

    // ── Режим одной базы: вход прямо по таблице users ──
    if (SINGLE) {
      const pool = await getPool();
      const { rows } = await pool.query(`
        SELECT u.id, u.login, u.full_name, u.email, u.is_active, u.date_restrict, u.is_admin, u.password_hash,
               r.name AS role_name, r.id AS role_id
        FROM users u LEFT JOIN roles r ON r.id = u.role_id
        WHERE u.login = $1 AND u.is_active = true`, [login]);
      if (!rows.length) return fail();
      const u = rows[0];
      const pw = await verifyPassword(password, u.password_hash);
      if (!pw.ok) return fail();
      if (pw.needsUpgrade) {
        await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [await bcrypt.hash(password, BCRYPT_ROUNDS), u.id]);
      }
      await pool.query('UPDATE users SET last_login_at = now() WHERE id = $1', [u.id]);
      const { rows: [co] } = await pool.query('SELECT id, name FROM companies ORDER BY id LIMIT 1');
      const { password_hash, ...safe } = u;
      const role = u.is_admin ? 'admin' : 'user';
      auth.registerSuccess(key);
      return res.json({
        user: { ...safe, company_id: co ? co.id : 1, company_name: co ? co.name : '', master_role: role },
        token: auth.issueToken({ uid: u.id, login: u.login, cid: 1, role })
      });
    }

    // ── Несколько компаний: сначала master, потом база компании ──
    const { rows: masterRows } = await masterPool.query(`
      SELECT mu.id, mu.login, mu.full_name, mu.role AS master_role,
             mu.company_id, mu.is_active, mu.password_hash,
             c.name AS company_name, c.db_url
      FROM master_users mu
      JOIN companies c ON c.id = mu.company_id
      WHERE mu.login = $1
        AND mu.is_active = true
        AND c.is_active = true
    `, [login]);
    if (!masterRows.length) return fail();

    const masterUser = masterRows[0];
    const pw = await verifyPassword(password, masterUser.password_hash);
    if (!pw.ok) return fail();
    if (pw.needsUpgrade) {
      await masterPool.query('UPDATE master_users SET password_hash=$1 WHERE id=$2',
        [await bcrypt.hash(password, BCRYPT_ROUNDS), masterUser.id]);
      console.log('Мигрирован пароль на bcrypt для:', login);
    }

    const companyPool = await getPool(masterUser.company_id);
    const { rows } = await companyPool.query(`
      SELECT u.id, u.login, u.full_name, u.email, u.is_active, u.date_restrict,
             r.name AS role_name, r.id AS role_id,
             u.company_id, c.name AS company_name
      FROM users u
      LEFT JOIN roles r     ON r.id = u.role_id
      LEFT JOIN companies c ON c.id = u.company_id
      WHERE u.login = $1 AND u.is_active = true
    `, [login]);
    if (!rows.length) {
      return res.status(401).json({ error: 'Пользователь не найден в базе компании' });
    }
    await companyPool.query('UPDATE users SET last_login_at = now() WHERE id = $1', [rows[0].id]);

    auth.registerSuccess(key);
    res.json({
      user: {
        ...rows[0],
        company_id: masterUser.company_id,
        company_name: masterUser.company_name,
        master_role: masterUser.master_role
      },
      token: auth.issueToken({ uid: rows[0].id, login: rows[0].login, cid: masterUser.company_id, role: masterUser.master_role })
    });
  } catch (e) {
    console.error('Ошибка входа:', e.message);
    res.status(500).json({ error: 'Ошибка входа: ' + e.message });
  }
});

// ── ТЕКУЩИЙ ПОЛЬЗОВАТЕЛЬ ──────────────────────────────────────

app.get('/api/me/:id', async (req, res) => {
  if (String(req.params.id) !== String(req.userId) && !isAdminReq(req)) {
    return res.status(403).json({ error: 'Недостаточно прав' });
  }
  const { rows } = await (await getPool(req.companyId)).query(`
    SELECT u.id, u.login, u.full_name, u.email, u.is_active, u.date_restrict,
           r.name AS role_name, r.id AS role_id,
           u.company_id, c.name AS company_name
    FROM users u
    LEFT JOIN roles r     ON r.id = u.role_id
    LEFT JOIN companies c ON c.id = u.company_id
    WHERE u.id = $1 AND u.is_active = true
  `, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Пользователь не найден' });
  res.json(rows[0]);
});

// ── SUPERADMIN ───────────────────────────────────────────────

// Список всех компаний (из master БД)
app.get('/api/superadmin/companies', async (req, res) => {
  try {
    const { rows } = await masterPool.query(
      'SELECT id, name, inn, is_active, created_at FROM companies ORDER BY id'
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Создать новую компанию
app.post('/api/superadmin/companies', async (req, res) => {
  try {
    const { name, inn, db_url, admin_login, admin_password, contacts } = req.body;
    if(!name || !db_url) return res.status(400).json({ error: 'Укажите название и db_url' });

    // Логин администратора должен быть свободен (проверяем до любых изменений)
    const adminHash = (admin_login && admin_password) ? await bcrypt.hash(admin_password, BCRYPT_ROUNDS) : null;
    if(admin_login && adminHash) {
      const { rows: busy } = await masterPool.query('SELECT 1 FROM master_users WHERE login=$1', [admin_login]);
      if(busy.length) return res.status(400).json({ error: `Логин "${admin_login}" уже занят` });
    }

    // 1. Добавляем компанию в master БД
    const { rows } = await masterPool.query(
      `INSERT INTO companies (name, inn, db_url, is_active)
       VALUES ($1, $2, $3, true) RETURNING *`,
      [name, inn||null, db_url]
    );
    const company = rows[0];

    // 2. Готовим базу компании: создаём, грузим структуру, пишем компанию и администратора
    try {
      await provisionCompanyDb({
        dbUrl: db_url, companyId: company.id, companyName: name, inn,
        adminLogin: admin_login, adminHash, installTrigger: installStockTrigger
      });
      try { await runMigrations(await getPool(company.id), 'компания ' + company.id); }
      catch (me) { console.error('⚠ Миграции новой компании:', me.message); }
    } catch(provErr) {
      await masterPool.query('DELETE FROM companies WHERE id=$1', [company.id]);
      return res.status(500).json({ error: 'Не удалось подготовить базу компании: ' + provErr.message });
    }

    // 3. Если указан admin — добавляем в master_users
    if(admin_login && adminHash) {
      await masterPool.query(
        `INSERT INTO master_users (login, password_hash, full_name, company_id, role, is_active)
         VALUES ($1, $2, $3, $4, 'admin', true)
         ON CONFLICT (login) DO NOTHING`,
        [admin_login, adminHash, admin_login, company.id]
      );
    }

    res.json(company);
  } catch(e) {
    if(e.code==='23505') res.status(400).json({ error: 'Компания с таким названием уже существует' });
    else res.status(500).json({ error: e.message });
  }
});

// Обновить компанию
app.put('/api/superadmin/companies/:id', async (req, res) => {
  try {
    const { name, inn, db_url, is_active } = req.body;
    // Пустые/непереданные поля НЕ затирают существующие значения.
    // db_url особенно критичен: его обнуление ломает подключение к базе компании.
    const { rows } = await masterPool.query(
      `UPDATE companies SET
         name      = COALESCE(NULLIF($1,''), name),
         inn       = COALESCE(NULLIF($2,''), inn),
         db_url    = COALESCE(NULLIF($3,''), db_url),
         is_active = COALESCE($4, is_active)
       WHERE id=$5 RETURNING *`,
      [
        name ?? null,
        inn ?? null,
        db_url ?? null,
        (typeof is_active === 'boolean' ? is_active : null),
        req.params.id,
      ]
    );
    if(!rows.length) return res.status(404).json({ error: 'Компания не найдена' });
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Список пользователей master по компании
app.get('/api/superadmin/companies/:id/users', async (req, res) => {
  try {
    const { rows } = await masterPool.query(
      `SELECT id, login, full_name, role, is_active, created_at
       FROM master_users WHERE company_id=$1 ORDER BY id`,
      [req.params.id]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Все пользователи master (для таблицы superadmin)
app.get('/api/superadmin/users', async (req, res) => {
  try {
    const { rows } = await masterPool.query(`
      SELECT mu.id, mu.login, mu.full_name, mu.role, mu.is_active, mu.company_id, mu.created_at,
             c.name AS company_name
      FROM master_users mu
      JOIN companies c ON c.id = mu.company_id
      ORDER BY mu.company_id, mu.id
    `);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Создать нового пользователя (superadmin)
app.post('/api/superadmin/users', async (req, res) => {
  try {
    const { login, full_name, role, company_id, password } = req.body;
    if (!login || !password || !company_id) {
      return res.status(400).json({ error: 'Укажите логин, пароль и компанию' });
    }

    // Проверяем уникальность логина
    const { rows: exists } = await masterPool.query(
      'SELECT id FROM master_users WHERE login=$1', [login]
    );
    if (exists.length) return res.status(400).json({ error: `Логин "${login}" уже занят` });

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Добавляем в master_users
    const { rows } = await masterPool.query(
      `INSERT INTO master_users (login, password_hash, full_name, company_id, role, is_active)
       VALUES ($1, $2, $3, $4, $5, true) RETURNING *`,
      [login, hash, full_name||null, company_id, role||'user']
    );

    // Добавляем в БД компании
    try {
      const pool = await getPool(company_id);
      const { rows: roles } = await pool.query('SELECT id FROM roles ORDER BY id LIMIT 1');
      const defaultRoleId = roles[0]?.id || null;
      const rowCompanyId = await companyRowId(pool, company_id);
      await pool.query(
        `INSERT INTO users (login, password_hash, full_name, role_id, company_id, is_active, date_restrict)
         VALUES ($1, $2, $3, $4, $5, true, false)
         ON CONFLICT (login) DO NOTHING`,
        [login, hash, full_name||null, defaultRoleId, rowCompanyId]
      );
    } catch(e) {
      console.error('Ошибка добавления в БД компании:', e.message);
    }

    res.json(rows[0]);
  } catch(e) {
    if (e.code==='23505') res.status(400).json({ error: 'Логин уже занят' });
    else res.status(500).json({ error: e.message });
  }
});

// Обновить пользователя в master
app.put('/api/superadmin/users/:id', async (req, res) => {
  try {
    const { login, full_name, role, company_id, is_active, password } = req.body;
    let query, params;
    if (password) {
      const saHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      query = `UPDATE master_users SET login=$1, full_name=$2, role=$3, company_id=$4, is_active=$5, password_hash=$6 WHERE id=$7 RETURNING *`;
      params = [login, full_name||null, role, company_id, is_active!==false, saHash, req.params.id];
    } else {
      query = `UPDATE master_users SET login=$1, full_name=$2, role=$3, company_id=$4, is_active=$5 WHERE id=$6 RETURNING *`;
      params = [login, full_name||null, role, company_id, is_active!==false, req.params.id];
    }
    const { rows } = await masterPool.query(query, params);
    if (!rows.length) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json(rows[0]);
  } catch(e) {
    if (e.code==='23505') res.status(400).json({ error: 'Логин уже занят' });
    else res.status(500).json({ error: e.message });
  }
});

// Удалить пользователя из master
app.delete('/api/superadmin/users/:id', async (req, res) => {
  try {
    // Получаем данные пользователя перед удалением
    const { rows } = await masterPool.query(
      'SELECT login, company_id FROM master_users WHERE id=$1', [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Пользователь не найден' });

    const { login, company_id } = rows[0];

    // Удаляем из master
    await masterPool.query('DELETE FROM master_users WHERE id=$1', [req.params.id]);

    // Удаляем из БД компании (если нет документов — удаляем, иначе деактивируем)
    try {
      const pool = await getPool(company_id);
      const { rows: [cnt] } = await pool.query(`
        SELECT (
          (SELECT COUNT(*) FROM orders_sale     WHERE created_by=(SELECT id FROM users WHERE login=$1)) +
          (SELECT COUNT(*) FROM orders_purchase WHERE created_by=(SELECT id FROM users WHERE login=$1)) +
          (SELECT COUNT(*) FROM payments        WHERE created_by=(SELECT id FROM users WHERE login=$1))
        ) AS total
      `, [login]);

      if (parseInt(cnt.total) > 0) {
        await pool.query('UPDATE users SET is_active=false WHERE login=$1', [login]);
      } else {
        await pool.query('DELETE FROM users WHERE login=$1', [login]);
      }
    } catch(e) {
      console.error('Ошибка удаления из БД компании:', e.message);
    }

    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Обновить профиль superadmin (логин и/или пароль)
app.put('/api/superadmin/profile', async (req, res) => {
  try {
    const { login, password } = req.body;
    if (!login) return res.status(400).json({ error: 'Укажите логин' });

    const companyId = req.headers['x-company-id'] || '1';

    // Найти superadmin в master — берём старый логин тоже
    const { rows } = await masterPool.query(
      `SELECT id, login FROM master_users WHERE company_id=$1 AND role='superadmin' LIMIT 1`,
      [companyId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Superadmin не найден' });

    const { id, login: oldLogin } = rows[0];

    // 1. Обновляем master_users
    if (password) {
      const profHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      await masterPool.query(
        `UPDATE master_users SET login=$1, password_hash=$2 WHERE id=$3`,
        [login, profHash, id]
      );
    } else {
      await masterPool.query(
        `UPDATE master_users SET login=$1 WHERE id=$2`,
        [login, id]
      );
    }

    // 2. Синхронизируем с БД компании
    const companyPool = await getPool(companyId);
    if (password) {
      const profCompHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      await companyPool.query(
        `UPDATE users SET login=$1, password_hash=$2 WHERE login=$3`,
        [login, profCompHash, oldLogin]
      );
    } else {
      await companyPool.query(
        `UPDATE users SET login=$1 WHERE login=$2`,
        [login, oldLogin]
      );
    }

    res.json({ ok: true });
  } catch(e) {
    if (e.code === '23505') res.status(400).json({ error: 'Такой логин уже занят' });
    else res.status(500).json({ error: e.message });
  }
});

// ── СПРАВОЧНИКИ ──────────────────────────────────────────────

// Валюты
app.get('/api/currencies', async (req, res) => {
  const { rows } = await (await getPool(req.companyId)).query('SELECT * FROM currencies ORDER BY id');
  res.json(rows);
});

// Единицы измерения
app.get('/api/units', async (req, res) => {
  const { rows } = await (await getPool(req.companyId)).query('SELECT * FROM units ORDER BY id');
  res.json(rows);
});

// Страны
app.get('/api/countries', async (req, res) => {
  const { rows } = await (await getPool(req.companyId)).query('SELECT * FROM countries ORDER BY name');
  res.json(rows);
});

// Сорта
app.get('/api/grades', async (req, res) => {
  const { rows } = await (await getPool(req.companyId)).query('SELECT * FROM grades WHERE is_active = true ORDER BY sort_order, name');
  res.json(rows);
});

// Категории товаров
app.get('/api/product-categories', async (req, res) => {
  const { rows } = await (await getPool(req.companyId)).query('SELECT * FROM product_categories WHERE is_active = true ORDER BY sort_order, name');
  res.json(rows);
});

app.post('/api/product-categories', async (req, res) => {
  const { name } = req.body;
  const { rows } = await (await getPool(req.companyId)).query(
    'INSERT INTO product_categories (name) VALUES ($1) RETURNING *', [name]
  );
  res.json(rows[0]);
});

// Категории контрагентов
app.get('/api/counterparty-categories', async (req, res) => {
  const { rows } = await (await getPool(req.companyId)).query('SELECT * FROM counterparty_categories WHERE is_active = true ORDER BY sort_order, name');
  res.json(rows);
});

app.post('/api/counterparty-categories', async (req, res) => {
  const { name } = req.body;
  const { rows } = await (await getPool(req.companyId)).query(
    'INSERT INTO counterparty_categories (name) VALUES ($1) RETURNING *', [name]
  );
  res.json(rows[0]);
});

// Статьи ДДС
app.get('/api/finance-articles', async (req, res) => {
  const { rows } = await (await getPool(req.companyId)).query('SELECT * FROM finance_articles WHERE is_active = true ORDER BY sort_order, id');
  res.json(rows);
});

// Склады
app.get('/api/warehouses', async (req, res) => {
  const { rows } = await (await getPool(req.companyId)).query(`
    SELECT w.*, c.name AS company_name
    FROM warehouses w
    LEFT JOIN companies c ON c.id = w.company_id
    WHERE w.is_active = true
    ORDER BY w.name
  `);
  res.json(rows);
});

// Банковские счета / кассы
app.get('/api/bank-accounts', async (req, res) => {
  const { rows } = await (await getPool(req.companyId)).query(`
    SELECT ba.*, cu.code AS currency_code, cu.symbol AS currency_symbol
    FROM bank_accounts ba
    LEFT JOIN currencies cu ON cu.id = ba.currency_id
    WHERE ba.is_active = true
    ORDER BY ba.name
  `);
  res.json(rows);
});

// Роли
app.get('/api/roles', async (req, res) => {
  const { rows } = await (await getPool(req.companyId)).query('SELECT * FROM roles WHERE is_active = true ORDER BY id');
  res.json(rows);
});

// Пользователи
app.get('/api/users', async (req, res) => {
  const { rows } = await (await getPool(req.companyId)).query(`
    SELECT u.id, u.login, u.full_name, u.email, u.is_active, u.last_login_at, u.date_restrict${SINGLE ? ', u.is_admin' : ''},
           r.name AS role_name, r.id AS role_id
    FROM users u
    LEFT JOIN roles r ON r.id = u.role_id
    ORDER BY u.id
  `);
  res.json(rows);
});

// ── КОНТРАГЕНТЫ ──────────────────────────────────────────────

app.get('/api/counterparties', async (req, res) => {
  const showAll = req.query.all === 'true';
  const { rows } = await (await getPool(req.companyId)).query(`
    SELECT cp.*, cc.name AS category_name, cu.code AS currency_code
    FROM counterparties cp
    LEFT JOIN counterparty_categories cc ON cc.id = cp.category_id
    LEFT JOIN currencies cu ON cu.id = cp.currency_id
    ${showAll ? '' : 'WHERE cp.is_active = true'}
    ORDER BY cp.name
  `);
  // Кабинеты контрагентов хранятся в мастер-базе — подгружаем отдельно
  const { rows: cabinets } = SINGLE ? { rows: [] } : await masterPool.query(
    'SELECT counterparty_id FROM cabinet_users WHERE company_id=$1',
    [req.companyId]
  );
  const cabinetSet = new Set(cabinets.map(c => c.counterparty_id));
  res.json(rows.map(r => ({ ...r, has_cabinet: cabinetSet.has(r.id) })));
});




// ── СТРАНЫ ────────────────────────────────────────────────────

app.post('/api/countries', async (req, res) => {
  const { name, alpha2, alpha3, numeric_code } = req.body;
  const { rows } = await (await getPool(req.companyId)).query(
    'INSERT INTO countries (name, alpha2, alpha3, numeric_code) VALUES ($1,$2,$3,$4) RETURNING *',
    [name, alpha2||null, alpha3||null, numeric_code||null]
  );
  res.json(rows[0]);
});

app.put('/api/countries/:id', async (req, res) => {
  const { name, alpha2, alpha3, numeric_code } = req.body;
  const { rows } = await (await getPool(req.companyId)).query(
    'UPDATE countries SET name=$1, alpha2=$2, alpha3=$3, numeric_code=$4 WHERE id=$5 RETURNING *',
    [name, alpha2||null, alpha3||null, numeric_code||null, parseInt(req.params.id)]
  );
  res.json(rows[0]);
});

// ── ЕДИНИЦЫ ИЗМЕРЕНИЯ ─────────────────────────────────────────

app.post('/api/units', async (req, res) => {
  const { name, short_name, okei_code } = req.body;
  const { rows } = await (await getPool(req.companyId)).query(
    'INSERT INTO units (name, short_name, okei_code) VALUES ($1,$2,$3) RETURNING *',
    [name, short_name||null, okei_code||null]
  );
  res.json(rows[0]);
});

app.put('/api/units/:id', async (req, res) => {
  const { name, short_name, okei_code } = req.body;
  const { rows } = await (await getPool(req.companyId)).query(
    'UPDATE units SET name=$1, short_name=$2, okei_code=$3 WHERE id=$4 RETURNING *',
    [name, short_name||null, okei_code||null, parseInt(req.params.id)]
  );
  res.json(rows[0]);
});

// ── СОРТА ─────────────────────────────────────────────────────

app.post('/api/grades', async (req, res) => {
  const { name, code, sort_order } = req.body;
  const { rows } = await (await getPool(req.companyId)).query(
    'INSERT INTO grades (name, code, sort_order, is_active) VALUES ($1,$2,$3,true) RETURNING *',
    [name, code||null, parseInt(sort_order)||0]
  );
  res.json(rows[0]);
});

app.put('/api/grades/:id', async (req, res) => {
  const { name, code, sort_order, is_active } = req.body;
  const { rows } = await (await getPool(req.companyId)).query(
    'UPDATE grades SET name=$1, code=$2, sort_order=$3, is_active=$4 WHERE id=$5 RETURNING *',
    [name, code||null, parseInt(sort_order)||0, is_active!==false, parseInt(req.params.id)]
  );
  res.json(rows[0]);
});

// ── КАТЕГОРИИ ТОВАРОВ ─────────────────────────────────────────

app.post('/api/product-categories', async (req, res) => {
  const { name } = req.body;
  const { rows } = await (await getPool(req.companyId)).query(
    'INSERT INTO product_categories (name) VALUES ($1) RETURNING *', [name]
  );
  res.json(rows[0]);
});

app.put('/api/product-categories/:id', async (req, res) => {
  const { name, is_active } = req.body;
  const { rows } = await (await getPool(req.companyId)).query(
    'UPDATE product_categories SET name=$1, is_active=$2 WHERE id=$3 RETURNING *',
    [name, is_active!==false, parseInt(req.params.id)]
  );
  res.json(rows[0]);
});

// ── СТАТЬИ ДДС ────────────────────────────────────────────────

app.post('/api/finance-articles', async (req, res) => {
  const { name, direction } = req.body;
  const { rows } = await (await getPool(req.companyId)).query(
    'INSERT INTO finance_articles (name, direction, is_active) VALUES ($1,$2,true) RETURNING *',
    [name, direction||'any']
  );
  res.json(rows[0]);
});

app.put('/api/finance-articles/:id', async (req, res) => {
  const { name, direction, is_active } = req.body;
  const { rows } = await (await getPool(req.companyId)).query(
    'UPDATE finance_articles SET name=$1, direction=$2, is_active=$3 WHERE id=$4 RETURNING *',
    [name, direction||'any', is_active!==false, parseInt(req.params.id)]
  );
  res.json(rows[0]);
});

// ── РОЛИ ─────────────────────────────────────────────────────

app.post('/api/roles', async (req, res) => {
  if (denyUnlessAdmin(req, res)) return;
  const { name, description } = req.body;
  const { rows } = await (await getPool(req.companyId)).query(
    'INSERT INTO roles (name, description, is_active) VALUES ($1,$2,true) RETURNING *',
    [name, description||null]
  );
  res.json(rows[0]);
});

app.put('/api/roles/:id', async (req, res) => {
  if (denyUnlessAdmin(req, res)) return;
  const { name, description, is_active } = req.body;
  const { rows } = await (await getPool(req.companyId)).query(
    'UPDATE roles SET name=$1, description=$2, is_active=$3 WHERE id=$4 RETURNING *',
    [name, description||null, is_active!==false, parseInt(req.params.id)]
  );
  res.json(rows[0]);
});


// ── ВАЛЮТЫ ────────────────────────────────────────────────────

app.post('/api/currencies', async (req, res) => {
  const { code, name, symbol, is_base } = req.body;
  const { rows } = await (await getPool(req.companyId)).query(
    'INSERT INTO currencies (code, name, symbol, is_base) VALUES ($1,$2,$3,$4) RETURNING *',
    [code, name, symbol||null, !!is_base]
  );
  res.json(rows[0]);
});

app.put('/api/currencies/:id', async (req, res) => {
  const { code, name, symbol, is_base } = req.body;
  const { rows } = await (await getPool(req.companyId)).query(
    'UPDATE currencies SET code=$1, name=$2, symbol=$3, is_base=$4 WHERE id=$5 RETURNING *',
    [code, name, symbol||null, !!is_base, parseInt(req.params.id)]
  );
  res.json(rows[0]);
});

// ── ПОЛЬЗОВАТЕЛИ ──────────────────────────────────────────────

app.post('/api/users', async (req, res) => {
  if (denyUnlessAdmin(req, res)) return;
  const { login, full_name, email, role_id, password, date_restrict } = req.body;
  const companyPool = await getPool(req.companyId);
  const rowCompanyId = await companyRowId(companyPool, req.companyId);
  const pwHash = await bcrypt.hash(password||'changeme', BCRYPT_ROUNDS);
  const { rows } = await companyPool.query(
    `INSERT INTO users (login, password_hash, full_name, email, role_id, company_id, is_active, date_restrict)
     VALUES ($1, $2, $3, $4, $5, $6, true, $7) RETURNING id, login, full_name, email, role_id, company_id, is_active, date_restrict`,
    [login, pwHash, full_name||null, email||null,
     parseInt(role_id)||null, rowCompanyId, date_restrict===true]
  );
  if (SINGLE && req.body.is_admin === true) {
    await companyPool.query('UPDATE users SET is_admin=true WHERE id=$1', [rows[0].id]);
  }
  // Синхронизируем с master_users
  if (!SINGLE) await masterPool.query(
    `INSERT INTO master_users (login, password_hash, full_name, company_id, role, is_active)
     VALUES ($1, $2, $3, $4, 'user', true)
     ON CONFLICT (login) DO NOTHING`,
    [login, pwHash, full_name||null, req.companyId]
  );
  res.json(rows[0]);
});

app.put('/api/users/:id', async (req, res) => {
  if (denyUnlessAdmin(req, res)) return;
  const { login, full_name, email, role_id, is_active, password, date_restrict } = req.body;
  if (SINGLE) {
    const demote = req.body.is_admin === false || is_active === false;
    if (demote && await isLastAdmin(await getPool(req.companyId), parseInt(req.params.id))) {
      return res.status(400).json({ error: 'Нельзя отключить или снять права с последнего администратора' });
    }
  }
  let query, params;
  if (password) {
    const pwHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    query = 'UPDATE users SET login=$1, full_name=$2, email=$3, role_id=$4, is_active=$5, password_hash=$6, date_restrict=$7 WHERE id=$8 RETURNING id, login, full_name, email, role_id, is_active, date_restrict';
    params = [login, full_name||null, email||null, parseInt(role_id)||null, is_active!==false, pwHash, date_restrict===true, parseInt(req.params.id)];
  } else {
    query = 'UPDATE users SET login=$1, full_name=$2, email=$3, role_id=$4, is_active=$5, date_restrict=$6 WHERE id=$7 RETURNING id, login, full_name, email, role_id, is_active, date_restrict';
    params = [login, full_name||null, email||null, parseInt(role_id)||null, is_active!==false, date_restrict===true, parseInt(req.params.id)];
  }
  const { rows } = await (await getPool(req.companyId)).query(query, params);
  if (SINGLE && typeof req.body.is_admin === 'boolean') {
    await (await getPool(req.companyId)).query('UPDATE users SET is_admin=$1 WHERE id=$2', [req.body.is_admin, parseInt(req.params.id)]);
  }

  // Синхронизируем с master_users
  if (password) {
    const syncHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    if (!SINGLE) await masterPool.query(
      `UPDATE master_users SET login=$1, password_hash=$2, is_active=$3 WHERE login=$4 AND company_id=$5`,
      [login, syncHash, is_active!==false, rows[0]?.login||login, req.companyId]
    );
  } else {
    if (!SINGLE) await masterPool.query(
      `UPDATE master_users SET login=$1, is_active=$2 WHERE company_id=$3 AND login IN (
        SELECT login FROM master_users WHERE company_id=$3
        INTERSECT
        SELECT $1::varchar
       )`,
      [login, is_active!==false, req.companyId]
    );
  }

  res.json(rows[0]);
});

// ── DELETE для справочников ───────────────────────────────────

app.delete('/api/countries/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { rows: [cnt] } = await (await getPool(req.companyId)).query('SELECT COUNT(*) FROM batches WHERE country_id=$1', [id]);
  if (parseInt(cnt.count) > 0) return res.status(400).json({ error: `Есть партии с этой страной (${cnt.count})` });
  await (await getPool(req.companyId)).query('DELETE FROM countries WHERE id=$1', [id]);
  res.json({ ok: true });
});

app.delete('/api/units/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { rows: [cnt] } = await (await getPool(req.companyId)).query('SELECT COUNT(*) FROM batches WHERE unit_id=$1', [id]);
  if (parseInt(cnt.count) > 0) return res.status(400).json({ error: `Нельзя удалить — есть партии с этой единицей измерения (${cnt.count})` });
  await (await getPool(req.companyId)).query('DELETE FROM units WHERE id=$1', [id]);
  res.json({ ok: true });
});

app.delete('/api/grades/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { rows: [cnt] } = await (await getPool(req.companyId)).query('SELECT COUNT(*) FROM batches WHERE grade_id=$1', [id]);
  if (parseInt(cnt.count) > 0) return res.status(400).json({ error: `Нельзя удалить — есть партии с этим сортом (${cnt.count})` });
  await (await getPool(req.companyId)).query('DELETE FROM product_grades WHERE grade_id=$1', [id]);
  await (await getPool(req.companyId)).query('DELETE FROM grades WHERE id=$1', [id]);
  res.json({ ok: true });
});

app.delete('/api/product-categories/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { rows: [cnt] } = await (await getPool(req.companyId)).query('SELECT COUNT(*) FROM products WHERE category_id=$1', [id]);
  if (parseInt(cnt.count) > 0) return res.status(400).json({ error: `Нельзя удалить — есть товары в этой категории (${cnt.count})` });
  await (await getPool(req.companyId)).query('DELETE FROM product_categories WHERE id=$1', [id]);
  res.json({ ok: true });
});

app.delete('/api/finance-articles/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { rows: [cnt] } = await (await getPool(req.companyId)).query('SELECT COUNT(*) FROM payments WHERE article_id=$1', [id]);
  if (parseInt(cnt.count) > 0) return res.status(400).json({ error: `Нельзя удалить — есть платежи по этой статье (${cnt.count})` });
  await (await getPool(req.companyId)).query('DELETE FROM finance_articles WHERE id=$1', [id]);
  res.json({ ok: true });
});

app.delete('/api/roles/:id', async (req, res) => {
  if (denyUnlessAdmin(req, res)) return;
  const id = parseInt(req.params.id);
  const { rows: [cnt] } = await (await getPool(req.companyId)).query('SELECT COUNT(*) FROM users WHERE role_id=$1', [id]);
  if (parseInt(cnt.count) > 0) return res.status(400).json({ error: `Есть пользователи с этой ролью (${cnt.count})` });
  await (await getPool(req.companyId)).query('DELETE FROM roles WHERE id=$1', [id]);
  res.json({ ok: true });
});

app.delete('/api/users/:id', async (req, res) => {
  if (denyUnlessAdmin(req, res)) return;
  const id = parseInt(req.params.id);
  const pool = await getPool(req.companyId);
  if (SINGLE && await isLastAdmin(pool, id)) return res.status(400).json({ error: 'Нельзя удалить последнего администратора' });
  if (req.userId && Number(req.userId) === id) return res.status(400).json({ error: 'Нельзя удалить самого себя' });

  // Получаем логин до удаления
  const { rows: userRows } = await pool.query('SELECT login FROM users WHERE id=$1', [id]);
  if (!userRows.length) return res.status(404).json({ error: 'Пользователь не найден' });
  const login = userRows[0].login;

  // Проверяем есть ли документы созданные пользователем
  const { rows: [cnt] } = await pool.query(`
    SELECT (
      (SELECT COUNT(*) FROM orders_sale     WHERE created_by=$1) +
      (SELECT COUNT(*) FROM orders_purchase WHERE created_by=$1) +
      (SELECT COUNT(*) FROM payments        WHERE created_by=$1)
    ) AS total
  `, [id]);

  if (parseInt(cnt.total) > 0) {
    // Есть документы — только деактивируем
    await pool.query('UPDATE users SET is_active=false WHERE id=$1', [id]);
    return res.json({ ok: true, deactivated: true, message: `Пользователь деактивирован (есть ${cnt.total} документов)` });
  }

  // Нет документов — удаляем полностью
  await pool.query('DELETE FROM users WHERE id=$1', [id]);
  if (!SINGLE) await masterPool.query('DELETE FROM master_users WHERE login=$1 AND company_id=$2', [login, req.companyId]);

  res.json({ ok: true, deleted: true });
});

// ── USER PERMISSIONS ─────────────────────────────────────────

// Получить права всех пользователей компании
app.get('/api/user-permissions', async (req, res) => {
  try {
    const pool = await getPool(req.companyId);
    const { rows } = await pool.query(
      `SELECT user_id, section, access FROM user_permissions ORDER BY user_id`
    );
    // Группируем по user_id: { userId: { section: access } }
    const result = {};
    rows.forEach(r => {
      if (!result[r.user_id]) result[r.user_id] = {};
      result[r.user_id][r.section] = r.access === 'true' ? true : r.access === 'false' ? false : r.access;
    });
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Сохранить права пользователя
app.put('/api/user-permissions/:userId', async (req, res) => {
  if (denyUnlessAdmin(req, res)) return;
  try {
    const pool = await getPool(req.companyId);
    const userId = parseInt(req.params.userId);
    const perms = req.body; // { section: access }

    // Удаляем старые права
    await pool.query('DELETE FROM user_permissions WHERE user_id=$1', [userId]);

    // Вставляем новые
    if (Object.keys(perms).length > 0) {
      const values = Object.entries(perms).map(([section, access]) =>
        `(${userId}, '${section}', '${String(access)}')`
      ).join(', ');
      await pool.query(
        `INSERT INTO user_permissions (user_id, section, access) VALUES ${values}
         ON CONFLICT (user_id, section) DO UPDATE SET access=EXCLUDED.access`
      );
    }

    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});



app.delete('/api/warehouses/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { rows: [cnt] } = await (await getPool(req.companyId)).query('SELECT COUNT(*) FROM stock WHERE warehouse_id=$1 AND qty>0', [id]);
  if (parseInt(cnt.count) > 0) return res.status(400).json({ error: `На складе есть остатки (${cnt.count} позиций)` });
  await (await getPool(req.companyId)).query('UPDATE warehouses SET is_active=false WHERE id=$1', [id]);
  res.json({ ok: true });
});

app.delete('/api/counterparties/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  // Проверяем все движения по контрагенту
  const { rows: [cnt] } = await (await getPool(req.companyId)).query(`
    SELECT COUNT(*) FROM (
      SELECT id FROM orders_sale     WHERE counterparty_id=$1
      UNION ALL
      SELECT id FROM orders_purchase WHERE counterparty_id=$1
      UNION ALL
      SELECT id FROM payments        WHERE counterparty_id=$1
      UNION ALL
      SELECT id FROM returns         WHERE counterparty_id=$1
    ) t
  `, [id]);
  if (parseInt(cnt.count) > 0) {
    return res.status(400).json({ error: `Нельзя удалить контрагента — есть связанные документы (${cnt.count} шт.)` });
  }
  await (await getPool(req.companyId)).query('DELETE FROM counterparties WHERE id=$1', [id]);
  res.json({ ok: true });
});

app.delete('/api/bank-accounts/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { rows: [cnt] } = await (await getPool(req.companyId)).query('SELECT COUNT(*) FROM payments WHERE bank_account_id=$1', [id]);
  if (parseInt(cnt.count) > 0) return res.status(400).json({ error: `Нельзя удалить — есть платежи по этому счёту (${cnt.count})` });
  await (await getPool(req.companyId)).query('UPDATE bank_accounts SET is_active=false WHERE id=$1', [id]);
  res.json({ ok: true });
});

app.delete('/api/currencies/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { rows: [cur] } = await (await getPool(req.companyId)).query('SELECT is_base FROM currencies WHERE id=$1', [id]);
  if (cur?.is_base) return res.status(400).json({ error: 'Нельзя удалить базовую валюту' });
  await (await getPool(req.companyId)).query('DELETE FROM currencies WHERE id=$1', [id]);
  res.json({ ok: true });
});

// ── БАНКОВСКИЕ СЧЕТА / КАССЫ ──────────────────────────────────

app.post('/api/bank-accounts', async (req, res) => {
  const { name, type, currency_id, account_number, bik, bank_name, company_id } = req.body;
  const toInt = v => { const n = parseInt(v); return isNaN(n) ? null : n; };
  const nullIfEmpty = v => (v === '' || v === undefined || v === null) ? null : v;
  const { rows } = await (await getPool(req.companyId)).query(
    `INSERT INTO bank_accounts (name, type, currency_id, account_number, bik, bank_name, company_id, balance, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,0,true) RETURNING *`,
    [name, type||'bank', toInt(currency_id), nullIfEmpty(account_number),
     nullIfEmpty(bik), nullIfEmpty(bank_name), toInt(company_id)||1]
  );
  res.json(rows[0]);
});

app.put('/api/bank-accounts/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, type, currency_id, account_number, bik, bank_name, is_active, is_default } = req.body;
  const toInt = v => { const n = parseInt(v); return isNaN(n) ? null : n; };
  const nullIfEmpty = v => (v === '' || v === undefined || v === null) ? null : v;
  const pool = await getPool(req.companyId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Если ставим по умолчанию — снимаем флаг с остальных того же типа
    if (is_default && type === 'cash') {
      await client.query("UPDATE bank_accounts SET is_default=false WHERE type='cash'");
    }
    const { rows } = await client.query(
      `UPDATE bank_accounts SET name=$1, type=$2, currency_id=$3, account_number=$4,
       bik=$5, bank_name=$6, is_active=$7, is_default=$8 WHERE id=$9 RETURNING *`,
      [name, type||'bank', toInt(currency_id), nullIfEmpty(account_number),
       nullIfEmpty(bik), nullIfEmpty(bank_name), is_active!==false, !!is_default, id]
    );
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch(e) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally { client.release(); }
});

// Касса — баланс и операции
app.get('/api/cash/balance', async (req, res) => {
  const { rows } = await (await getPool(req.companyId)).query(`
    SELECT ba.id, ba.name, ba.is_default,
      COALESCE(pi.total,0) - COALESCE(po.total,0) AS balance
    FROM bank_accounts ba
    LEFT JOIN (SELECT bank_account_id, SUM(amount) AS total FROM payments WHERE direction='incoming' AND status='posted' GROUP BY bank_account_id) pi ON pi.bank_account_id=ba.id
    LEFT JOIN (SELECT bank_account_id, SUM(amount) AS total FROM payments WHERE direction='outgoing' AND status='posted' GROUP BY bank_account_id) po ON po.bank_account_id=ba.id
    WHERE ba.type='cash' AND ba.is_active=true
    ORDER BY ba.is_default DESC, ba.name
  `);
  res.json(rows);
});

app.get('/api/cash/operations', async (req, res) => {
  const { date_from, date_to, account_id } = req.query;
  const conds = ["ba.type='cash'","py.status='posted'"];
  const params = [];
  if (date_from) { params.push(date_from); conds.push(`py.payment_date::date >= $${params.length}::date`); }
  if (date_to)   { params.push(date_to);   conds.push(`py.payment_date::date <= $${params.length}::date`); }
  if (account_id){ params.push(parseInt(account_id)); conds.push(`py.bank_account_id=$${params.length}`); }
  const where = conds.join(' AND ');
  const { rows } = await (await getPool(req.companyId)).query(`
    SELECT py.*, ba.name AS account_name, cp.name AS counterparty_name,
           cu.code AS currency_code, fa.name AS article_name,
           os.number AS order_number, r.number AS return_number
    FROM payments py
    JOIN bank_accounts ba ON ba.id=py.bank_account_id
    LEFT JOIN counterparties cp ON cp.id=py.counterparty_id
    LEFT JOIN currencies cu ON cu.id=py.currency_id
    LEFT JOIN finance_articles fa ON fa.id=py.article_id
    LEFT JOIN orders_sale os ON os.id=py.order_id
    LEFT JOIN returns r ON r.id=py.return_id
    WHERE ${where}
    ORDER BY py.payment_date DESC, py.id DESC
  `, params);
  res.json(rows);
});

// ── КАТЕГОРИИ КОНТРАГЕНТОВ ────────────────────────────────────

app.post('/api/counterparty-categories', async (req, res) => {
  const { name } = req.body;
  const { rows } = await (await getPool(req.companyId)).query(
    'INSERT INTO counterparty_categories (name) VALUES ($1) RETURNING *', [name]
  );
  res.json(rows[0]);
});

app.put('/api/counterparty-categories/:id', async (req, res) => {
  const { name, is_active } = req.body;
  const { rows } = await (await getPool(req.companyId)).query(
    'UPDATE counterparty_categories SET name=$1, is_active=$2 WHERE id=$3 RETURNING *',
    [name, is_active !== false, parseInt(req.params.id)]
  );
  res.json(rows[0]);
});

app.delete('/api/counterparty-categories/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { rows: [cnt] } = await (await getPool(req.companyId)).query(
    'SELECT COUNT(*) FROM counterparties WHERE category_id=$1', [id]
  );
  if (parseInt(cnt.count) > 0)
    return res.status(400).json({ error: `Нельзя удалить: есть ${cnt.count} контрагентов` });
  await (await getPool(req.companyId)).query('DELETE FROM counterparty_categories WHERE id=$1', [id]);
  res.json({ ok: true });
});

app.post('/api/counterparties', async (req, res) => {
  console.log('POST counterparty body:', JSON.stringify(req.body));
  const { name, type, category_id, inn, kpp, phone, email, address,
          credit_limit, credit_days, currency_id, is_anonymous } = req.body;
  const toInt = v => { const n = parseInt(v); return isNaN(n) ? null : n; };
  const toFloat = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
  const nullIfEmpty = v => (v === '' || v === undefined || v === null) ? null : v;
  try {
    const { rows } = await (await getPool(req.companyId)).query(`
      INSERT INTO counterparties
        (name, type, category_id, inn, kpp, phone, email, address,
         credit_limit, credit_days, currency_id, is_anonymous)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *
    `, [name, nullIfEmpty(type)||'legal', toInt(category_id), nullIfEmpty(inn),
        nullIfEmpty(kpp), nullIfEmpty(phone), nullIfEmpty(email), nullIfEmpty(address),
        toFloat(credit_limit), toInt(credit_days), toInt(currency_id), is_anonymous ?? false]);
    res.json(rows[0]);
  } catch(e) {
    if (e.code === '23505') return res.status(400).json({ error: `Контрагент с именем "${name}" уже существует` });
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/counterparties/:id', async (req, res) => {
  const { name, type, category_id, inn, kpp, phone, email, address,
          credit_limit, credit_days, currency_id, is_anonymous, is_active } = req.body;
  try {
    const { rows } = await (await getPool(req.companyId)).query(`
      UPDATE counterparties SET
        name=$1, type=$2, category_id=$3, inn=$4, kpp=$5,
        phone=$6, email=$7, address=$8, credit_limit=$9,
        credit_days=$10, currency_id=$11, is_anonymous=$12, is_active=$13
      WHERE id=$14
      RETURNING *, (SELECT code FROM currencies WHERE id=$11) AS currency_code
    `, [name, type, category_id, inn, kpp, phone, email, address,
        credit_limit, credit_days, currency_id, is_anonymous, is_active, req.params.id]);
    res.json(rows[0]);
  } catch(e) {
    if (e.code === '23505') return res.status(400).json({ error: `Контрагент с именем "${name}" уже существует` });
    res.status(500).json({ error: e.message });
  }
});

// ── ТОВАРЫ ───────────────────────────────────────────────────

app.get('/api/products', async (req, res) => {
  const { rows } = await (await getPool(req.companyId)).query(`
    SELECT p.*,
           pc.name  AS category_name,
           u.short_name AS unit_short,
           g.name   AS grade_name,
           co.name  AS country_name
    FROM products p
    LEFT JOIN product_categories pc ON pc.id = p.category_id
    LEFT JOIN units u  ON u.id  = p.default_unit_id
    LEFT JOIN grades g ON g.id  = p.default_grade_id
    LEFT JOIN countries co ON co.id = p.default_country_id
    WHERE p.is_active = true
    ORDER BY p.name
  `);
  res.json(rows);
});

app.post('/api/products', async (req, res) => {
  const { sku, name, category_id, default_unit_id, default_country_id,
          default_grade_id, has_serial, has_batch, min_stock, weight_kg } = req.body;
  const { rows } = await (await getPool(req.companyId)).query(`
    INSERT INTO products
      (sku, name, category_id, default_unit_id, default_country_id,
       default_grade_id, has_serial, has_batch, min_stock, weight_kg)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING *
  `, [sku, name, category_id, default_unit_id, default_country_id,
      default_grade_id, has_serial ?? false, has_batch ?? false, min_stock, weight_kg]);
  res.json(rows[0]);
});

app.put('/api/products/:id', async (req, res) => {
  const { sku, name, category_id, default_unit_id, default_country_id,
          default_grade_id, has_serial, has_batch, min_stock, weight_kg, is_active } = req.body;
  const { rows } = await (await getPool(req.companyId)).query(`
    UPDATE products SET
      sku=$1, name=$2, category_id=$3, default_unit_id=$4, default_country_id=$5,
      default_grade_id=$6, has_serial=$7, has_batch=$8, min_stock=$9,
      weight_kg=$10, is_active=$11
    WHERE id=$12 RETURNING *
  `, [sku, name, category_id, default_unit_id, default_country_id,
      default_grade_id, has_serial, has_batch, min_stock, weight_kg, is_active, req.params.id]);
  res.json(rows[0]);
});

// ── ИМПОРТ СПРАВОЧНИКОВ ИЗ EXCEL ─────────────────────────────
// Контрагенты, сорта, товары: шаблон, предпросмотр и загрузка одной транзакцией (папка import/)
require('./import')(app, { getPool });

// ── ОСТАТКИ ──────────────────────────────────────────────────

app.get('/api/stock', async (req, res) => {
  const { warehouse_id } = req.query;
  const params = [];
  let filter = 'WHERE s.qty > 0';
  if (warehouse_id) {
    params.push(parseInt(warehouse_id));
    filter += ` AND s.warehouse_id = $${params.length}`;
  }
  const { rows } = await (await getPool(req.companyId)).query(`
    SELECT s.id, s.qty, s.cost_price,
           s.product_id, s.batch_id, s.warehouse_id,
           p.name  AS product_name, p.sku,
           w.name  AS warehouse_name,
           u.short_name AS unit_short,
           g.name  AS grade_name,
           co.name AS country_name,
           b.batch_number, b.expiry_date,
           cp.name AS supplier_name,
           (SELECT op.created_at FROM order_purchase_lines opl
              JOIN orders_purchase op ON op.id = opl.order_id
              WHERE opl.batch_id = b.id
              ORDER BY op.created_at ASC LIMIT 1) AS purchase_date
    FROM stock s
    JOIN products p   ON p.id = s.product_id
    JOIN warehouses w ON w.id = s.warehouse_id
    LEFT JOIN batches b  ON b.id = s.batch_id
    LEFT JOIN units u    ON u.id = b.unit_id
    LEFT JOIN grades g   ON g.id = b.grade_id
    LEFT JOIN countries co ON co.id = b.country_id
    LEFT JOIN counterparties cp  ON cp.id = b.supplier_id
    ${filter}
    ORDER BY p.name, w.name
  `, params);
  res.json(rows);
});

// ── РАСХОДНЫЕ НАКЛАДНЫЕ ───────────────────────────────────────

// Следующий номер расходной накладной (счётчик по дате)
app.get('/api/orders-sale/next-number', async (req, res) => {
  try {
    const db = await getPool(req.companyId);
    const { rows } = await db.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(number FROM 4) AS INTEGER)), 0) AS maxn
       FROM orders_sale WHERE number ~ '^РН-[0-9]+$'
       AND (created_at AT TIME ZONE 'Europe/Moscow')::date = (NOW() AT TIME ZONE 'Europe/Moscow')::date`
    );
    let num = parseInt(rows[0].maxn) + 1;
    while ((await db.query(`SELECT 1 FROM orders_sale WHERE number=$1 AND (created_at AT TIME ZONE 'Europe/Moscow')::date = (NOW() AT TIME ZONE 'Europe/Moscow')::date LIMIT 1`, ['РН-' + num])).rows.length) num++;
    res.json({ number: `РН-${num}` });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/orders-sale', async (req, res) => {
  const { rows } = await (await getPool(req.companyId)).query(`
    SELECT os.*,
           cp.name AS counterparty_name,
           w.name  AS warehouse_name,
           cu.code AS currency_code,
           u.full_name AS created_by_name,
           COALESCE((SELECT SUM(qty) FROM order_sale_lines WHERE order_id=os.id), 0) AS total_qty
    FROM orders_sale os
    LEFT JOIN counterparties cp ON cp.id = os.counterparty_id
    LEFT JOIN warehouses w      ON w.id  = os.warehouse_id
    LEFT JOIN currencies cu     ON cu.id = os.currency_id
    LEFT JOIN users u           ON u.id  = os.created_by
    ORDER BY os.created_at DESC
  `);
  res.json(rows);
});

app.get('/api/orders-sale/:id/lines', async (req, res) => {
  const { rows } = await (await getPool(req.companyId)).query(`
    SELECT l.*, p.name AS product_name, p.sku,
           g.name AS grade_name, co.name AS country_name, un.short_name AS unit_short
    FROM order_sale_lines l
    JOIN products p ON p.id = l.product_id
    LEFT JOIN batches b  ON b.id = l.batch_id
    LEFT JOIN grades g   ON g.id = b.grade_id
    LEFT JOIN countries co ON co.id = b.country_id
    LEFT JOIN units un ON un.id = b.unit_id
    WHERE l.order_id = $1
  `, [req.params.id]);
  res.json(rows);
});

app.post('/api/orders-sale', async (req, res) => {
  console.log('orders-sale body:', JSON.stringify(req.body));
  let { number, payment_type, counterparty_id, cash_account_id, warehouse_id,
          company_id, currency_id, currency_rate, delivery_date, note, lines } = req.body;
  // Если currency_id не передан или некорректен — берём базовую валюту из БД
  if (!currency_id) {
    const { rows: cr } = await (await getPool(req.companyId)).query("SELECT id FROM currencies WHERE is_base=true LIMIT 1");
    currency_id = cr[0]?.id;
  }
  // Sanitize: empty string → null for optional fields
  const nullIfEmpty = v => (v === '' || v === undefined || v === null) ? null : v;
  const toInt = v => { const n = parseInt(v); return isNaN(n) ? null : n; };
  const toFloat = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
  const pool = await getPool(req.companyId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Генерируем уникальный номер РН-N с блокировкой от race condition
    await client.query(`LOCK TABLE orders_sale IN SHARE ROW EXCLUSIVE MODE`);
    const { rows: maxRows } = await client.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(number FROM 4) AS INTEGER)), 0) AS maxn
       FROM orders_sale WHERE number ~ '^РН-[0-9]+$'
       AND (created_at AT TIME ZONE 'Europe/Moscow')::date = (NOW() AT TIME ZONE 'Europe/Moscow')::date`
    );
    let nextNum = parseInt(maxRows[0].maxn) + 1;
    while (true) {
      number = 'РН-' + nextNum;
      const { rows: exists } = await client.query(
        `SELECT id FROM orders_sale WHERE number=$1 AND (created_at AT TIME ZONE 'Europe/Moscow')::date = (NOW() AT TIME ZONE 'Europe/Moscow')::date LIMIT 1`, [number]
      );
      if (!exists.length) break;
      nextNum++;
    }
    const { rows } = await client.query(`
      INSERT INTO orders_sale
        (number, payment_type, counterparty_id, cash_account_id, warehouse_id,
         company_id, currency_id, currency_rate, status, delivery_date, note, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft',$9,$10,NOW())
      RETURNING *
    `, [number, payment_type,
        toInt(counterparty_id), toInt(cash_account_id),
        toInt(warehouse_id), toInt(company_id),
        toInt(currency_id), toFloat(currency_rate),
        nullIfEmpty(delivery_date), note||null]);
    const order = rows[0];
    for (const l of (lines || [])) {
      await client.query(`
        INSERT INTO order_sale_lines (order_id, product_id, batch_id, qty, price, discount_pct, vat_pct)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
      `, [order.id, toInt(l.product_id), toInt(l.batch_id), toFloat(l.qty), toFloat(l.price), toFloat(l.discount_pct) || 0, toFloat(l.vat_pct) || 20]);
    }
    // Автоматически проводим: списываем с остатков (с учётом партии)
    const { rows: saleLines } = await client.query('SELECT * FROM order_sale_lines WHERE order_id=$1', [order.id]);
    for (const l of saleLines) {
      if (!l.product_id || !l.qty) continue;
      let stockQuery, stockParams;
      if (l.batch_id) {
        stockQuery = 'SELECT id, qty FROM stock WHERE warehouse_id=$1 AND product_id=$2 AND batch_id=$3 LIMIT 1';
        stockParams = [order.warehouse_id, l.product_id, l.batch_id];
      } else {
        // FIFO: берём самую раннюю партию
        stockQuery = 'SELECT id, qty, batch_id FROM stock WHERE warehouse_id=$1 AND product_id=$2 AND qty>0 ORDER BY id ASC LIMIT 1';
        stockParams = [order.warehouse_id, l.product_id];
      }
      const { rows: [stock] } = await client.query(stockQuery, stockParams);
      if (!stock || Number(stock.qty) < Number(l.qty)) {
        const { rows: [prod] } = await client.query('SELECT name FROM products WHERE id=$1', [l.product_id]);
        throw new Error(`Недостаточно товара: ${prod?.name || l.product_id} (нужно ${l.qty}, есть ${stock?.qty || 0})`);
      }
      await client.query('UPDATE stock SET qty = qty - $1 WHERE id=$2', [l.qty, stock.id]);
      // Сохраняем batch_id в строку накладной
      await client.query('UPDATE order_sale_lines SET batch_id=$1 WHERE order_id=$2 AND product_id=$3 AND batch_id IS NULL',
        [stock.batch_id, order.id, l.product_id]);
      await client.query(
        `INSERT INTO stock_movements (document_type, document_id, warehouse_id, product_id, batch_id, qty, created_at) VALUES ('sale',$1,$2,$3,$4,$5,COALESCE($6::timestamptz, NOW()))`,
        [order.id, order.warehouse_id, l.product_id, l.batch_id || stock.batch_id, -l.qty, order.delivery_date||null]
      );
    }
    const total = saleLines.reduce((s,l) => s + (Number(l.qty)||0)*(Number(l.price)||0), 0);
    const { rows: [posted] } = await client.query(
      "UPDATE orders_sale SET status='posted', total_amount=$1 WHERE id=$2 RETURNING *", [total, order.id]
    );

    // Автоматический входящий платёж при наличной оплате
    if (payment_type === 'cash' && toInt(cash_account_id)) {
      const { rows: [lastPay] } = await client.query(
        "SELECT number FROM payments ORDER BY id DESC LIMIT 1"
      );
      const lastNum = parseInt((lastPay?.number || '').replace(/\D/g, '')) || 0;
      const nextPayNum = 'П-' + String(lastNum + 1).padStart(4, '0');

      await client.query(`
        INSERT INTO payments
          (number, direction, bank_account_id, counterparty_id,
           currency_id, currency_rate, amount, amount_base,
           payment_date, purpose, status, created_by, order_id)
        VALUES ($1,'incoming',$2,$3,$4,$5,$6,$6,now(),$7,'posted',$8,$9)
      `, [
        nextPayNum,
        toInt(cash_account_id),
        null, // наличная продажа — розница, контрагент не нужен
        toInt(currency_id),
        toFloat(currency_rate) || 1,
        total,
        `Оплата по накладной ${number}`,
        toInt(req.body.created_by) || auditUserId(req),
        order.id,
      ]);
    }

    const { rows: auditSaleLines } = await client.query(`
      SELECT osl.*, p.name AS product_name, b.batch_number
      FROM order_sale_lines osl
      LEFT JOIN products p ON p.id=osl.product_id
      LEFT JOIN batches b ON b.id=osl.batch_id
      WHERE osl.order_id=$1
    `, [posted.id]);
    await client.query('COMMIT');
    await logAudit(await getPool(req.companyId), auditUserId(req), 'orders_sale', posted.id, 'INSERT', null, { ...posted, lines: auditSaleLines });
    // ── Межкомпанейский журнал: если контрагент связан с компанией системы ──
    await createInterCompanyDoc({
      companyId: req.companyId,
      counterpartyId: posted.counterparty_id,
      docType: 'sale',
      localDocId: posted.id,
      localDocNumber: posted.number,
      docDate: new Date().toISOString().slice(0, 10),
      amount: total,
      lines: auditSaleLines.map(l => ({
        product_name: l.product_name,
        qty: Number(l.qty),
        price: Number(l.price),
        sum: Number(l.qty) * Number(l.price),
      })),
    });
    res.json(posted);
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ── ПРИХОДНЫЕ НАКЛАДНЫЕ ───────────────────────────────────────


app.get('/api/orders-purchase/next-number', async (req, res) => {
  try {
    const db = await getPool(req.companyId);
    const { rows } = await db.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(number FROM 4) AS INTEGER)), 0) AS maxn
       FROM orders_purchase WHERE number ~ '^ПН-[0-9]+$'
       AND EXTRACT(year FROM created_at AT TIME ZONE 'Europe/Moscow') = EXTRACT(year FROM NOW() AT TIME ZONE 'Europe/Moscow')`
    );
    let num = parseInt(rows[0].maxn) + 1;
    while ((await db.query(`SELECT 1 FROM orders_purchase WHERE number=$1 AND EXTRACT(year FROM created_at AT TIME ZONE 'Europe/Moscow') = EXTRACT(year FROM NOW() AT TIME ZONE 'Europe/Moscow') LIMIT 1`, ['ПН-' + num])).rows.length) num++;
    res.json({ number: `ПН-${num}` });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/orders-purchase', async (req, res) => {
  const { rows } = await (await getPool(req.companyId)).query(`
    SELECT op.*,
           cp.name AS counterparty_name,
           w.name  AS warehouse_name,
           cu.code AS currency_code,
           COALESCE((SELECT SUM(qty) FROM order_purchase_lines WHERE order_id=op.id), 0) AS total_qty
    FROM orders_purchase op
    LEFT JOIN counterparties cp ON cp.id = op.counterparty_id
    LEFT JOIN warehouses w      ON w.id  = op.warehouse_id
    LEFT JOIN currencies cu     ON cu.id = op.currency_id
    ORDER BY op.created_at DESC
  `);
  res.json(rows);
});

app.post('/api/orders-purchase', async (req, res) => {
  const { number, date, counterparty_id, warehouse_id, company_id,
          currency_id, currency_rate, lines } = req.body;
  const nullIfEmpty = v => (v === '' || v === undefined || v === null) ? null : v;
  const toInt = v => { const n = parseInt(v); return isNaN(n) ? null : n; };
  const toFloat = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
  const pool = await getPool(req.companyId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Генерируем финальный номер с защитой от race condition
    let finalNumber = number;
    if (!finalNumber || finalNumber === 'ПН-...') {
      const { rows: maxRows } = await client.query(
        `SELECT COALESCE(MAX(CAST(SUBSTRING(number FROM 4) AS INTEGER)), 0) AS maxn
         FROM orders_purchase WHERE number ~ '^ПН-[0-9]+$'
         AND EXTRACT(year FROM created_at AT TIME ZONE 'Europe/Moscow') = EXTRACT(year FROM NOW() AT TIME ZONE 'Europe/Moscow')`
      );
      let nextNum = parseInt(maxRows[0].maxn) + 1;
      while (true) {
        finalNumber = 'ПН-' + nextNum;
        const { rows: exists } = await client.query(
          `SELECT id FROM orders_purchase WHERE number=$1 AND EXTRACT(year FROM created_at AT TIME ZONE 'Europe/Moscow') = EXTRACT(year FROM NOW() AT TIME ZONE 'Europe/Moscow') LIMIT 1`, [finalNumber]
        );
        if (!exists.length) break;
        nextNum++;
      }
    }
    const { rows } = await client.query(`
      INSERT INTO orders_purchase
        (number, counterparty_id, warehouse_id, company_id, currency_id, currency_rate, status, note, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,'draft',$7,COALESCE($8::timestamptz, NOW()))
      RETURNING *
    `, [finalNumber, toInt(counterparty_id), toInt(warehouse_id), toInt(company_id),
        toInt(currency_id), toFloat(currency_rate), req.body.note||null, date||null]);
    const order = rows[0];
    for (const l of (lines || []).filter(l => l.product_id && l.qty)) {
      await client.query(`
        INSERT INTO order_purchase_lines
          (order_id, product_id, grade_id, country_id, unit_id, qty, price, vat_pct)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, [order.id, toInt(l.product_id), toInt(l.grade_id), toInt(l.country_id), toInt(l.unit_id),
          toFloat(l.qty), toFloat(l.price), 20]);
    }
    // Автоматически проводим: приходуем на склад с созданием партии
    const rate = toFloat(currency_rate) || 1;
    const { rows: purLines } = await client.query('SELECT * FROM order_purchase_lines WHERE order_id=$1', [order.id]);
    for (const l of purLines) {
      if (!l.product_id || !l.qty) continue;
      const costRub = Number(l.price) * rate; // себестоимость в рублях
      // Используем партию из шапки или генерируем автоматически
      const batchNum = (req.body.batch_number && req.body.batch_number.trim())
        ? req.body.batch_number.trim()
        : await generateBatchNumber(client);
      const { rows: [batch] } = await client.query(
        `INSERT INTO batches (product_id, unit_id, country_id, grade_id, supplier_id, batch_number)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [l.product_id, l.unit_id, l.country_id, l.grade_id, order.counterparty_id, batchNum]
      );
      const batchId = batch.id;
      // Сохраняем batch_id в строку накладной для последующих редактирований
      await client.query(
        'UPDATE order_purchase_lines SET batch_id=$1 WHERE order_id=$2 AND product_id=$3 AND batch_id IS NULL',
        [batchId, order.id, l.product_id]
      );
      // Ищем остаток по этой же партии (на случай повторного проведения)
      const { rows: [existing] } = await client.query(
        'SELECT id, qty, cost_price FROM stock WHERE warehouse_id=$1 AND product_id=$2 AND batch_id=$3 LIMIT 1',
        [order.warehouse_id, l.product_id, batchId]
      );
      if (existing) {
        const newQty = Number(existing.qty) + Number(l.qty);
        const newCost = ((Number(existing.qty)*(Number(existing.cost_price)||0)) + (Number(l.qty)*costRub)) / newQty;
        await client.query('UPDATE stock SET qty=$1, cost_price=$2 WHERE id=$3', [newQty, newCost, existing.id]);
      } else {
        await client.query(
          'INSERT INTO stock (warehouse_id, product_id, batch_id, unit_id, qty, cost_price) VALUES ($1,$2,$3,$4,$5,$6)',
          [order.warehouse_id, l.product_id, batchId, l.unit_id, l.qty, costRub]
        );
      }
      await client.query(
        `INSERT INTO stock_movements (document_type, document_id, warehouse_id, product_id, batch_id, qty, cost_price, created_at) VALUES ('purchase',$1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz, NOW()))`,
        [order.id, order.warehouse_id, l.product_id, batchId, l.qty, costRub, order.created_at||null]
      );
    }
    const total = purLines.reduce((s,l) => s + (Number(l.qty)||0)*(Number(l.price)||0), 0);
    const { rows: [posted] } = await client.query(
      "UPDATE orders_purchase SET status='posted', total_amount=$1 WHERE id=$2 RETURNING *", [total, order.id]
    );
    // Сохраняем накладные расходы и распределяем себестоимость
    const overheads = req.body.overheads || [];
    for (const oh of overheads) {
      const ohRate = parseFloat(oh.currency_rate) || rate;
      const ohAmtRub = (parseFloat(oh.amount)||0) * ohRate;
      await client.query(
        `INSERT INTO overhead_costs (document_type, document_id, article_id, counterparty_id, amount, currency_id, currency_rate)
         VALUES ('purchase',$1,$2,$3,$4,$5,$6)`,
        [order.id, parseInt(oh.article_id)||null, parseInt(oh.counterparty_id)||null,
         ohAmtRub, parseInt(oh.currency_id)||parseInt(currency_id)||1, ohRate]
      );
    }
    if (overheads.length > 0) await applyOverheadCosts(client, order.id);
    const { rows: auditPurLines } = await client.query(`
      SELECT opl.*, p.name AS product_name, b.batch_number
      FROM order_purchase_lines opl
      LEFT JOIN products p ON p.id=opl.product_id
      LEFT JOIN batches b ON b.id=opl.batch_id
      WHERE opl.order_id=$1
    `, [posted.id]);
    await client.query('COMMIT');
    await logAudit(await getPool(req.companyId), auditUserId(req), 'orders_purchase', posted.id, 'INSERT', null, { ...posted, lines: auditPurLines });
    res.json(posted);

  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ── ПЛАТЕЖИ ───────────────────────────────────────────────────

app.get('/api/payments/next-number', async (req, res) => {
  try {
    const db = await getPool(req.companyId);
    const { rows } = await db.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(number FROM 4) AS INTEGER)), 0) AS maxn
       FROM payments WHERE number ~ '^ПЛ-[0-9]+$'
       AND (created_at AT TIME ZONE 'Europe/Moscow')::date = (NOW() AT TIME ZONE 'Europe/Moscow')::date`
    );
    let num = parseInt(rows[0].maxn) + 1;
    while ((await db.query(`SELECT 1 FROM payments WHERE number=$1 AND (created_at AT TIME ZONE 'Europe/Moscow')::date = (NOW() AT TIME ZONE 'Europe/Moscow')::date LIMIT 1`, ['ПЛ-' + num])).rows.length) num++;
    res.json({ number: `ПЛ-${num}` });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/payments', async (req, res) => {
  const { rows } = await (await getPool(req.companyId)).query(`
    SELECT py.*,
           cp.name  AS counterparty_name,
           ba.name  AS account_name,
           cu.code  AS currency_code,
           fa.name  AS article_name,
           os.number AS order_number,
           r.number  AS return_number
    FROM payments py
    LEFT JOIN counterparties cp ON cp.id = py.counterparty_id
    LEFT JOIN bank_accounts ba  ON ba.id = py.bank_account_id
    LEFT JOIN currencies cu     ON cu.id = py.currency_id
    LEFT JOIN finance_articles fa ON fa.id = py.article_id
    LEFT JOIN orders_sale os   ON os.id = py.order_id
    LEFT JOIN returns r        ON r.id  = py.return_id
    ORDER BY py.payment_date DESC
  `);
  res.json(rows);
});

app.post('/api/payments', async (req, res) => {
  const { number, direction, article_id, bank_account_id, counterparty_id,
          currency_id, currency_rate, amount, amount_base, payment_date, purpose, created_by,
          legal_name, pp_number } = req.body;
  const toInt   = v => { const n = parseInt(v);   return isNaN(n) ? null : n; };
  const toFloat = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
  const nullIfEmpty = v => (v === '' || v === undefined || v === null) ? null : v;
  const cpPool = await getPool(req.companyId);
  // Генерируем дневной номер если не передан или ПЛ-...
  let finalNumber = number;
  if (!finalNumber || finalNumber === 'ПЛ-...') {
    const { rows: maxRows } = await cpPool.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(number FROM 4) AS INTEGER)), 0) AS maxn
       FROM payments WHERE number ~ '^ПЛ-[0-9]+$'
       AND (created_at AT TIME ZONE 'Europe/Moscow')::date = (NOW() AT TIME ZONE 'Europe/Moscow')::date`
    );
    let nextNum = parseInt(maxRows[0].maxn) + 1;
    while (true) {
      finalNumber = 'ПЛ-' + nextNum;
      const { rows: exists } = await cpPool.query(
        `SELECT id FROM payments WHERE number=$1 AND (created_at AT TIME ZONE 'Europe/Moscow')::date = (NOW() AT TIME ZONE 'Europe/Moscow')::date LIMIT 1`,
        [finalNumber]
      );
      if (!exists.length) break;
      nextNum++;
    }
  }

  const { rows } = await cpPool.query(`
    INSERT INTO payments
      (number, direction, article_id, bank_account_id, counterparty_id,
       currency_id, currency_rate, amount, amount_base, payment_date, purpose, status, created_by, note, legal_name, pp_number)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'posted',$12,$13,$14,$15)
    RETURNING *
  `, [finalNumber, direction,
      toInt(article_id), toInt(bank_account_id), toInt(counterparty_id),
      toInt(currency_id), toFloat(currency_rate),
      toFloat(amount), toFloat(amount_base ?? amount),
      nullIfEmpty(payment_date), nullIfEmpty(purpose),
      (toInt(created_by) || auditUserId(req)), req.body.note||null,
      nullIfEmpty(legal_name), nullIfEmpty(pp_number)]);
  await logAudit(cpPool, auditUserId(req), 'payments', rows[0].id, 'INSERT', null, rows[0]);
  // ── Межкомпанейский журнал: если контрагент связан с компанией системы ──
  await createInterCompanyDoc({
    companyId: req.companyId,
    counterpartyId: rows[0].counterparty_id,
    docType: rows[0].direction === 'incoming' ? 'payment_in' : 'payment_out',
    localDocId: rows[0].id,
    localDocNumber: rows[0].number,
    docDate: rows[0].payment_date
      ? new Date(rows[0].payment_date).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10),
    amount: Number(rows[0].amount_base ?? rows[0].amount),
  });
  res.json(rows[0]);
});

// ============================================================
// INTERCOMPANY v2 — адаптировано под реальный server.js
// ВСТАВИТЬ ЦЕЛИКОМ в server.js (например, после блока платежей).
// Использует уже существующие: masterPool, getPool, logAudit,
// generateBatchNumber. Ничего дополнительно импортировать не надо.
// ============================================================

// ── ХЕЛПЕРЫ ───────────────────────────────────────────────────

async function icGetLinkedCompany(companyId, counterpartyId) {
  const r = await masterPool.query(
    `SELECT l.linked_company_id, c.name AS linked_company_name
       FROM company_counterparty_links l
       JOIN companies c ON c.id = l.linked_company_id
      WHERE l.company_id = $1 AND l.counterparty_id = $2`,
    [parseInt(companyId), parseInt(counterpartyId)]
  );
  return r.rows[0] || null;
}

async function icGetCompanyName(companyId) {
  const r = await masterPool.query(`SELECT name FROM companies WHERE id=$1`, [parseInt(companyId)]);
  return r.rows[0] ? r.rows[0].name : `Компания #${companyId}`;
}

const IC_MIRROR_TYPE = { sale: 'purchase', purchase: 'sale', payment_in: 'payment_out', payment_out: 'payment_in' };

// Ядро: пара записей (своя sent + зеркало received у партнёра).
// Вызывать ПОСЛЕ COMMIT основного документа. Сама не бросает наружу.
async function createInterCompanyDoc({ companyId, counterpartyId, docType, localDocId, localDocNumber, docDate, amount, lines }) {
  try {
    if (SINGLE || !counterpartyId) return null;
    const link = await icGetLinkedCompany(companyId, counterpartyId);
    if (!link) return null;

    const partnerId = link.linked_company_id;
    const myName = await icGetCompanyName(companyId);
    const myPool = await getPool(companyId);
    const partnerPool = await getPool(partnerId);
    const linesJson = lines && lines.length ? JSON.stringify(lines) : null;

    const mine = await myPool.query(
      `INSERT INTO inter_company_documents
         (doc_type, direction, partner_company_id, partner_company_name,
          local_doc_id, local_doc_number, doc_date, amount, lines, status)
       VALUES ($1,'sent',$2,$3,$4,$5,$6,$7,$8,'pending') RETURNING id`,
      [docType, partnerId, link.linked_company_name, localDocId, localDocNumber, docDate, amount, linesJson]
    );
    const theirs = await partnerPool.query(
      `INSERT INTO inter_company_documents
         (doc_type, direction, partner_company_id, partner_company_name,
          local_doc_number, doc_date, amount, lines, status, mirror_id)
       VALUES ($1,'received',$2,$3,$4,$5,$6,$7,'pending',$8) RETURNING id`,
      [IC_MIRROR_TYPE[docType], parseInt(companyId), myName, localDocNumber, docDate, amount, linesJson, mine.rows[0].id]
    );
    await myPool.query(`UPDATE inter_company_documents SET mirror_id=$1 WHERE id=$2`, [theirs.rows[0].id, mine.rows[0].id]);
    return { myId: mine.rows[0].id };
  } catch (e) {
    console.error('createInterCompanyDoc:', e.message); // не валим основной документ
    return null;
  }
}

// ── ЖУРНАЛ ────────────────────────────────────────────────────

app.get('/api/intercompany/documents', async (req, res) => {
  try {
    const { direction, status, partner, from, to } = req.query;
    const where = []; const vals = []; let i = 1;
    if (direction) { where.push(`direction=$${i++}`); vals.push(direction); }
    if (status)    { where.push(`status=$${i++}`); vals.push(status); }
    if (partner)   { where.push(`partner_company_id=$${i++}`); vals.push(parseInt(partner)); }
    if (from)      { where.push(`doc_date>=$${i++}`); vals.push(from); }
    if (to)        { where.push(`doc_date<=$${i++}`); vals.push(to); }
    const { rows } = await (await getPool(req.companyId)).query(
      `SELECT * FROM inter_company_documents
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY doc_date DESC, id DESC LIMIT 500`, vals);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/intercompany/documents/pending-count', async (req, res) => {
  try {
    const { rows } = await (await getPool(req.companyId)).query(
      `SELECT COUNT(*)::int AS cnt FROM inter_company_documents
        WHERE direction='received' AND status='pending'`);
    res.json({ count: rows[0].cnt });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// синхронизация статуса в обеих БД
async function icSetStatusBoth(companyId, docId, status, comment) {
  const myPool = await getPool(companyId);
  const { rows: [doc] } = await myPool.query(`SELECT * FROM inter_company_documents WHERE id=$1`, [docId]);
  if (!doc) return null;
  await myPool.query(
    `UPDATE inter_company_documents
        SET status=$2, dispute_comment=COALESCE($3, dispute_comment),
            confirmed_at = CASE WHEN $2='confirmed' THEN NOW() ELSE confirmed_at END
      WHERE id=$1`, [docId, status, comment ?? null]);
  if (doc.mirror_id) {
    const partnerPool = await getPool(doc.partner_company_id);
    await partnerPool.query(
      `UPDATE inter_company_documents
          SET status=$2, dispute_comment=COALESCE($3, dispute_comment),
              confirmed_at = CASE WHEN $2='confirmed' THEN NOW() ELSE confirmed_at END
        WHERE id=$1`, [doc.mirror_id, status, comment ?? null]);
  }
  return doc;
}

app.put('/api/intercompany/documents/:id/confirm', async (req, res) => {
  try {
    const pool = await getPool(req.companyId);
    const { rows: [d] } = await pool.query(`SELECT status FROM inter_company_documents WHERE id=$1`, [req.params.id]);
    if (!d) return res.status(404).json({ error: 'Документ не найден' });
    if (d.status === 'confirmed') return res.status(409).json({ error: 'Уже подтверждён' });
    await icSetStatusBoth(req.companyId, req.params.id, 'confirmed', null);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/intercompany/documents/:id/dispute', async (req, res) => {
  try {
    await icSetStatusBoth(req.companyId, req.params.id, 'disputed', req.body.comment || '');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── СОПОСТАВЛЕНИЕ ТОВАРОВ ─────────────────────────────────────

app.get('/api/intercompany/documents/:id/mapping', async (req, res) => {
  try {
    const pool = await getPool(req.companyId);
    const { rows: [doc] } = await pool.query(`SELECT * FROM inter_company_documents WHERE id=$1`, [req.params.id]);
    if (!doc) return res.status(404).json({ error: 'Документ не найден' });
    const lines = doc.lines || [];
    const result = [];
    for (const line of lines) {
      let suggestion = null;
      const { rows: [lk] } = await pool.query(
        `SELECT pl.local_product_id AS id, p.name
           FROM product_links pl JOIN products p ON p.id = pl.local_product_id
          WHERE pl.partner_company_id=$1 AND pl.partner_product_name=$2`,
        [doc.partner_company_id, line.product_name]);
      if (lk) suggestion = { ...lk, source: 'link' };
      else {
        const { rows: [ex] } = await pool.query(
          `SELECT id, name FROM products WHERE LOWER(TRIM(name))=LOWER(TRIM($1)) AND is_active IS NOT FALSE LIMIT 1`,
          [line.product_name]);
        if (ex) suggestion = { ...ex, source: 'exact' };
      }
      result.push({ ...line, suggestion });
    }
    res.json({
      doc: { id: doc.id, doc_number: doc.local_doc_number, doc_date: doc.doc_date,
             amount: doc.amount, partner_company_name: doc.partner_company_name, status: doc.status },
      lines: result
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── ПРОВОДКА ПРИХОДНОЙ ИЗ ВХОДЯЩЕЙ НАКЛАДНОЙ ──────────────────
// Полностью повторяет логику POST /api/orders-purchase:
// партии через generateBatchNumber, stock со средневзв. себестоимостью,
// stock_movements, status='posted', total_amount, logAudit.

app.post('/api/intercompany/documents/:id/accept', async (req, res) => {
  const toInt = v => { const n = parseInt(v); return isNaN(n) ? null : n; };
  const pool = await getPool(req.companyId);
  const client = await pool.connect();
  try {
    const { counterparty_id, warehouse_id, mappings, created_by } = req.body;
    if (!toInt(counterparty_id)) return res.status(400).json({ error: 'Не указан поставщик' });
    if (!toInt(warehouse_id))    return res.status(400).json({ error: 'Не указан склад' });
    if (!Array.isArray(mappings) || !mappings.length) return res.status(400).json({ error: 'Нет строк' });

    await client.query('BEGIN');
    const { rows: [doc] } = await client.query(
      `SELECT * FROM inter_company_documents WHERE id=$1 FOR UPDATE`, [req.params.id]);
    if (!doc) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Документ не найден' }); }
    if (doc.status === 'confirmed') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Документ уже проведён' }); }
    if (doc.direction !== 'received' || doc.doc_type !== 'purchase') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Проводка доступна только для входящих накладных' });
    }

    // базовая валюта (межкомпанейские документы в рублях)
    const { rows: [baseCur] } = await client.query(`SELECT id FROM currencies WHERE is_base=true LIMIT 1`);
    const currencyId = baseCur ? baseCur.id : 1;

    // 1) разрешаем товары: создаём новые при необходимости + запоминаем связки
    const resolved = [];
    for (const m of mappings) {
      let productId = toInt(m.local_product_id);
      if (!productId && m.new_product_name && m.new_product_name.trim()) {
        const { rows: [np] } = await client.query(
          `INSERT INTO products (name, has_serial, has_batch) VALUES ($1,false,true) RETURNING id`,
          [m.new_product_name.trim()]);
        productId = np.id;
      }
      if (!productId) throw new Error(`Не сопоставлен товар: ${m.product_name}`);
      // default_unit_id для строки накладной
      const { rows: [prod] } = await client.query(
        `SELECT default_unit_id, default_country_id, default_grade_id FROM products WHERE id=$1`, [productId]);
      await client.query(
        `INSERT INTO product_links (partner_company_id, partner_product_name, local_product_id)
         VALUES ($1,$2,$3)
         ON CONFLICT (partner_company_id, partner_product_name)
         DO UPDATE SET local_product_id = EXCLUDED.local_product_id`,
        [doc.partner_company_id, m.product_name, productId]);
      resolved.push({
        product_id: productId,
        unit_id: prod ? prod.default_unit_id : null,
        country_id: prod ? prod.default_country_id : null,
        grade_id: prod ? prod.default_grade_id : null,
        qty: Number(m.qty), price: Number(m.price),
      });
    }

    // 2) шапка приходной (как в POST /api/orders-purchase)
    const icNumber = `МК-${doc.local_doc_number || doc.id}`;
    const { rows: [order] } = await client.query(`
      INSERT INTO orders_purchase
        (number, counterparty_id, warehouse_id, company_id, currency_id, currency_rate, status, note, created_at)
      VALUES ($1,$2,$3,$4,$5,1,'draft',$6,NOW()) RETURNING *
    `, [icNumber, toInt(counterparty_id), toInt(warehouse_id), toInt(req.companyId), currencyId,
        `Межкомпанейская: ${doc.local_doc_number || ''} от ${doc.partner_company_name}`]);

    // 3) строки
    for (const l of resolved) {
      await client.query(`
        INSERT INTO order_purchase_lines
          (order_id, product_id, grade_id, country_id, unit_id, qty, price, vat_pct)
        VALUES ($1,$2,$3,$4,$5,$6,$7,20)
      `, [order.id, l.product_id, l.grade_id, l.country_id, l.unit_id, l.qty, l.price]);
    }

    // 4) проводим: партии + остатки + движения (зеркало логики orders-purchase)
    const { rows: purLines } = await client.query(
      'SELECT * FROM order_purchase_lines WHERE order_id=$1', [order.id]);
    for (const l of purLines) {
      if (!l.product_id || !l.qty) continue;
      const costRub = Number(l.price); // rate = 1
      const batchNum = await generateBatchNumber(client);
      const { rows: [batch] } = await client.query(
        `INSERT INTO batches (product_id, unit_id, country_id, grade_id, supplier_id, batch_number)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [l.product_id, l.unit_id, l.country_id, l.grade_id, order.counterparty_id, batchNum]);
      const batchId = batch.id;
      await client.query(
        'UPDATE order_purchase_lines SET batch_id=$1 WHERE order_id=$2 AND product_id=$3 AND batch_id IS NULL',
        [batchId, order.id, l.product_id]);
      const { rows: [existing] } = await client.query(
        'SELECT id, qty, cost_price FROM stock WHERE warehouse_id=$1 AND product_id=$2 AND batch_id=$3 LIMIT 1',
        [order.warehouse_id, l.product_id, batchId]);
      if (existing) {
        const newQty = Number(existing.qty) + Number(l.qty);
        const newCost = ((Number(existing.qty)*(Number(existing.cost_price)||0)) + (Number(l.qty)*costRub)) / newQty;
        await client.query('UPDATE stock SET qty=$1, cost_price=$2 WHERE id=$3', [newQty, newCost, existing.id]);
      } else {
        await client.query(
          'INSERT INTO stock (warehouse_id, product_id, batch_id, unit_id, qty, cost_price) VALUES ($1,$2,$3,$4,$5,$6)',
          [order.warehouse_id, l.product_id, batchId, l.unit_id, l.qty, costRub]);
      }
      await client.query(
        `INSERT INTO stock_movements (document_type, document_id, warehouse_id, product_id, batch_id, qty, cost_price, created_at)
         VALUES ('purchase',$1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz, NOW()))`,
        [order.id, order.warehouse_id, l.product_id, batchId, l.qty, costRub, order.created_at||null]);
    }
    const total = purLines.reduce((s,l) => s + (Number(l.qty)||0)*(Number(l.price)||0), 0);
    const { rows: [posted] } = await client.query(
      "UPDATE orders_purchase SET status='posted', total_amount=$1 WHERE id=$2 RETURNING *", [total, order.id]);

    // 5) статус confirmed у себя + ссылка на приходную
    await client.query(
      `UPDATE inter_company_documents
          SET status='confirmed', confirmed_at=NOW(), local_doc_id=$2 WHERE id=$1`,
      [doc.id, posted.id]);

    const { rows: auditPurLines } = await client.query(`
      SELECT opl.*, p.name AS product_name, b.batch_number
      FROM order_purchase_lines opl
      LEFT JOIN products p ON p.id=opl.product_id
      LEFT JOIN batches b ON b.id=opl.batch_id
      WHERE opl.order_id=$1`, [posted.id]);

    await client.query('COMMIT');

    // зеркало у партнёра (вне транзакции — другая БД)
    if (doc.mirror_id) {
      try {
        const partnerPool = await getPool(doc.partner_company_id);
        await partnerPool.query(
          `UPDATE inter_company_documents SET status='confirmed', confirmed_at=NOW() WHERE id=$1`,
          [doc.mirror_id]);
      } catch (e) { console.error('mirror confirm:', e.message); }
    }

    await logAudit(pool, auditUserId(req), 'orders_purchase', posted.id, 'INSERT', null, { ...posted, lines: auditPurLines });
    res.json({ ok: true, purchase_id: posted.id, number: posted.number });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});



// ── СВЯЗКИ КОНТРАГЕНТ ↔ КОМПАНИЯ ──────────────────────────────

app.get('/api/intercompany/links', async (req, res) => {
  try {
    const { rows } = await masterPool.query(
      `SELECT l.*, c.name AS linked_company_name
         FROM company_counterparty_links l
         JOIN companies c ON c.id = l.linked_company_id
        WHERE l.company_id=$1`, [parseInt(req.companyId)]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/intercompany/links', async (req, res) => {
  try {
    const { counterparty_id, linked_company_id } = req.body;
    if (parseInt(linked_company_id) === parseInt(req.companyId)) {
      return res.status(400).json({ error: 'Нельзя связать компанию с самой собой' });
    }
    await masterPool.query(
      `INSERT INTO company_counterparty_links (company_id, counterparty_id, linked_company_id)
       VALUES ($1,$2,$3)
       ON CONFLICT (company_id, counterparty_id)
       DO UPDATE SET linked_company_id = EXCLUDED.linked_company_id`,
      [parseInt(req.companyId), parseInt(counterparty_id), parseInt(linked_company_id)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/intercompany/links/:counterpartyId', async (req, res) => {
  try {
    await masterPool.query(
      `DELETE FROM company_counterparty_links WHERE company_id=$1 AND counterparty_id=$2`,
      [parseInt(req.companyId), parseInt(req.params.counterpartyId)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ── СУПЕРАДМИН: УПРАВЛЕНИЕ СВЯЗКАМИ ЛЮБОЙ КОМПАНИИ ────────────

// все связки (для таблицы в SuperAdmin UI)
app.get('/api/superadmin/intercompany-links', async (req, res) => {
  try {
    const { rows } = await masterPool.query(`
      SELECT l.*,
             c_owner.name  AS company_name,
             c_linked.name AS linked_company_name
      FROM company_counterparty_links l
      JOIN companies c_owner  ON c_owner.id  = l.company_id
      JOIN companies c_linked ON c_linked.id = l.linked_company_id
      ORDER BY l.company_id, l.id`);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// контрагенты выбранной компании (для выпадающего списка в UI)
app.get('/api/superadmin/companies/:id/counterparties', async (req, res) => {
  try {
    const pool = await getPool(req.params.id);
    const { rows } = await pool.query(
      `SELECT id, name FROM counterparties ORDER BY name LIMIT 2000`);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/superadmin/intercompany-links', async (req, res) => {
  try {
    const { company_id, counterparty_id, linked_company_id } = req.body;
    if (parseInt(company_id) === parseInt(linked_company_id)) {
      return res.status(400).json({ error: 'Нельзя связать компанию с самой собой' });
    }
    const { rows } = await masterPool.query(
      `INSERT INTO company_counterparty_links (company_id, counterparty_id, linked_company_id)
       VALUES ($1,$2,$3)
       ON CONFLICT (company_id, counterparty_id)
       DO UPDATE SET linked_company_id = EXCLUDED.linked_company_id
       RETURNING *`,
      [parseInt(company_id), parseInt(counterparty_id), parseInt(linked_company_id)]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/superadmin/intercompany-links/:id', async (req, res) => {
  try {
    await masterPool.query(
      `DELETE FROM company_counterparty_links WHERE id=$1`, [parseInt(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── ДВИЖЕНИЯ ТОВАРА ───────────────────────────────────────────

app.get('/api/stock-movements', async (req, res) => {
  const { product_id, warehouse_id, date_from, date_to } = req.query;
  const params = [];
  const filters = [];
  if (product_id)  { params.push(parseInt(product_id));  filters.push(`sm.product_id = $${params.length}`); }
  if (warehouse_id){ params.push(parseInt(warehouse_id)); filters.push(`sm.warehouse_id = $${params.length}`); }
  if (date_from)   { params.push(date_from); filters.push(`sm.created_at::date >= $${params.length}::date`); }
  if (date_to)     { params.push(date_to);   filters.push(`sm.created_at::date <= $${params.length}::date`); }
  const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';

  const { rows } = await (await getPool(req.companyId)).query(`
    SELECT sub.*
    FROM (
      SELECT sm.id, sm.document_type, sm.document_id, sm.warehouse_id,
             sm.product_id, sm.batch_id, sm.qty, sm.cost_price, sm.created_at,
             p.name   AS product_name, p.sku,
             w.name   AS warehouse_name,
             b.batch_number,
             cp.name  AS supplier_name,
             CASE sm.document_type
               WHEN 'purchase'  THEN op.number
               WHEN 'sale'      THEN os.number
               WHEN 'write_off' THEN wo.number
               ELSE sm.document_type || '-' || sm.document_id
             END AS doc_number,
             COALESCE(op.created_at, os.created_at, wo.created_at, sm.created_at) AS doc_date
      FROM stock_movements sm
      JOIN products p    ON p.id = sm.product_id
      JOIN warehouses w  ON w.id = sm.warehouse_id
      LEFT JOIN batches b         ON b.id  = sm.batch_id
      LEFT JOIN counterparties cp ON cp.id = b.supplier_id
      LEFT JOIN orders_purchase op ON op.id = sm.document_id AND sm.document_type = 'purchase'
      LEFT JOIN orders_sale     os ON os.id = sm.document_id AND sm.document_type = 'sale'
      LEFT JOIN write_offs      wo ON wo.id = sm.document_id AND sm.document_type = 'write_off'
      ${where}
    ) sub
    ORDER BY sub.doc_date DESC, sub.id DESC
    LIMIT 1000
  `, params);
  res.json(rows);
});






// ── ОБОРОТНАЯ ВЕДОМОСТЬ ПО ПАРТИЯМ ──────────────────────────

app.get('/api/inventory-report', async (req, res) => {
  const { date_from, date_to, warehouse_id, supplier_id, batch_id, grade_id, buyer_id } = req.query;

  const toInt = v => { const n = parseInt(v); return isNaN(n) ? null : n; };

  const dateFrom = date_from || '1900-01-01';
  const dateTo   = date_to   || '2999-12-31';

  // Дополнительные фильтры (JS-уровень, добавляются в HAVING/WHERE по batch)
  const batchConditions = ['b.id IS NOT NULL'];
  const params = [];

  if (supplier_id) {
    params.push(toInt(supplier_id));
    batchConditions.push(`b.supplier_id = $${params.length}`);
  }
  if (batch_id) {
    params.push(toInt(batch_id));
    batchConditions.push(`b.id = $${params.length}`);
  }
  if (grade_id) {
    params.push(toInt(grade_id));
    batchConditions.push(`b.grade_id = $${params.length}`);
  }
  if (buyer_id) {
    params.push(toInt(buyer_id));
    batchConditions.push(`EXISTS (
      SELECT 1 FROM order_sale_lines osl2
      JOIN orders_sale os2 ON os2.id = osl2.order_id
      WHERE osl2.batch_id = b.id
        AND os2.counterparty_id = $${params.length}
        AND os2.created_at::date BETWEEN '${dateFrom}'::date AND '${dateTo}'::date
    )`);
  }

  const warehouseCondition = warehouse_id
    ? `AND sm_base.warehouse_id = ${toInt(warehouse_id)}`
    : '';

  const batchWhere = batchConditions.length ? 'WHERE ' + batchConditions.join(' AND ') : '';

  try {
    const { rows } = await (await getPool(req.companyId)).query(`
      WITH
      -- Шаг 1: все уникальные комбинации партия+склад из движений
      -- Это основа — не зависит от таблицы stock
      base AS (
        SELECT DISTINCT sm_base.batch_id, sm_base.warehouse_id
        FROM stock_movements sm_base
        WHERE 1=1 ${warehouseCondition}
      ),
      -- Шаг 2: агрегируем все нужные суммы по каждой паре batch+warehouse
      agg AS (
        SELECT
          sm.batch_id,
          sm.warehouse_id,
          -- Остаток на начало = всё что было ДО dateFrom
          COALESCE(SUM(sm.qty) FILTER (
            WHERE sm.created_at::date < '${dateFrom}'::date
          ), 0) AS opening_qty,
          -- Приход за период
          COALESCE(SUM(sm.qty) FILTER (
            WHERE sm.document_type = 'purchase'
              AND sm.created_at::date BETWEEN '${dateFrom}'::date AND '${dateTo}'::date
          ), 0) AS incoming_qty,
          -- Продажи за период
          COALESCE(SUM(ABS(sm.qty)) FILTER (
            WHERE sm.document_type = 'sale'
              AND sm.created_at::date BETWEEN '${dateFrom}'::date AND '${dateTo}'::date
          ), 0) AS sale_qty,
          -- Возвраты за период
          COALESCE(SUM(sm.qty) FILTER (
            WHERE sm.document_type = 'return'
              AND sm.created_at::date BETWEEN '${dateFrom}'::date AND '${dateTo}'::date
          ), 0) AS return_qty,
          -- Перемещения за период (net, со знаком)
          COALESCE(SUM(sm.qty) FILTER (
            WHERE sm.document_type = 'transfer'
              AND sm.created_at::date BETWEEN '${dateFrom}'::date AND '${dateTo}'::date
          ), 0) AS transfer_qty,
          -- Списания за период
          COALESCE(SUM(ABS(sm.qty)) FILTER (
            WHERE sm.document_type = 'write_off'
              AND sm.created_at::date BETWEEN '${dateFrom}'::date AND '${dateTo}'::date
          ), 0) AS writeoff_qty,
          -- Наличие на конец периода = всё что было ДО dateTo включительно
          COALESCE(SUM(sm.qty) FILTER (
            WHERE sm.created_at::date <= '${dateTo}'::date
          ), 0) AS current_qty,
          -- Флаг: были ли движения за период (для фильтрации пустых строк)
          COUNT(*) FILTER (
            WHERE sm.created_at::date BETWEEN '${dateFrom}'::date AND '${dateTo}'::date
          ) AS period_movements_count
        FROM stock_movements sm
        JOIN base ON base.batch_id = sm.batch_id AND base.warehouse_id = sm.warehouse_id
        GROUP BY sm.batch_id, sm.warehouse_id
      )
      SELECT
        b.id            AS batch_id,
        b.batch_number,
        p.id            AS product_id,
        p.name          AS product_name,
        p.sku,
        g.name          AS grade_name,
        co.name         AS country_name,
        u.short_name    AS unit_short,
        sup.name        AS supplier_name,
        w.name          AS warehouse_name,
        w.id            AS warehouse_id,

        -- Себестоимость из stock (может быть 0 если партия полностью продана)
        COALESCE(s.cost_price, 0) AS cost_price,

        -- Средневзвешенная цена продажи за период
        COALESCE(
          (SELECT ROUND(
            (SUM(osl.price * osl.qty) / NULLIF(SUM(osl.qty), 0))::numeric, 2)
           FROM order_sale_lines osl
           JOIN orders_sale os ON os.id = osl.order_id AND os.status = 'posted'
           WHERE osl.batch_id = b.id
             AND os.created_at::date BETWEEN '${dateFrom}'::date AND '${dateTo}'::date
          ), 0
        ) AS avg_sale_price,

        agg.opening_qty,
        agg.incoming_qty,
        agg.sale_qty,
        agg.return_qty,
        agg.transfer_qty,
        agg.writeoff_qty,
        agg.current_qty,

        -- Дата приходной накладной (вариант 2: JOIN на orders_purchase)
        op.created_at::date AS purchase_date

      FROM agg
      JOIN batches b       ON b.id = agg.batch_id
      JOIN products p      ON p.id = b.product_id
      JOIN warehouses w    ON w.id = agg.warehouse_id
      LEFT JOIN stock s    ON s.batch_id = b.id AND s.warehouse_id = agg.warehouse_id
      LEFT JOIN grades g   ON g.id = b.grade_id
      LEFT JOIN countries co ON co.id = b.country_id
      LEFT JOIN units u    ON u.id = b.unit_id
      LEFT JOIN counterparties sup ON sup.id = b.supplier_id
      -- Берём дату приходной накладной через первое purchase-движение партии
      LEFT JOIN LATERAL (
        SELECT sm_p.document_id
        FROM stock_movements sm_p
        WHERE sm_p.batch_id = b.id
          AND sm_p.document_type = 'purchase'
        ORDER BY sm_p.created_at ASC
        LIMIT 1
      ) first_purchase ON true
      LEFT JOIN orders_purchase op ON op.id = first_purchase.document_id
      ${batchWhere}
      -- Показываем строки где есть текущий остаток ИЛИ были движения за период
      AND (
        agg.current_qty != 0
        OR agg.period_movements_count > 0
      )
      ORDER BY p.name, b.batch_number, w.name
    `, params);

    res.json(rows);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── ОТЧЁТ ДЕБИТОРЫ / КРЕДИТОРЫ ──────────────────────────────

app.get('/api/debtors-report', async (req, res) => {
  const { category_id, min_days, counterparty_id } = req.query;
  const toInt = v => { const n = parseInt(v); return isNaN(n) ? null : n; };
  const catFilter = toInt(category_id) ? `AND cp.category_id = ${toInt(category_id)}` : '';
  const cpFilter = toInt(counterparty_id) ? `AND os.counterparty_id = ${toInt(counterparty_id)}` : '';
  const minDays = toInt(min_days) || 0;
  const today = new Date().toISOString().slice(0, 10);

  try {
    const { rows } = await (await getPool(req.companyId)).query(`
      WITH docs AS (
        -- Расходные накладные в кредит
        SELECT
          os.id,
          os.number,
          'invoice' AS doc_type,
          COALESCE(os.delivery_date::date, os.created_at::date, CURRENT_DATE) AS doc_date,
          os.counterparty_id,
          cp.name AS cp_name,
          cc.name AS cp_category,
          os.total_amount AS amount
        FROM orders_sale os
        JOIN counterparties cp ON cp.id = os.counterparty_id
        LEFT JOIN counterparty_categories cc ON cc.id = cp.category_id
        WHERE os.status = 'posted'
          AND os.payment_type = 'credit'
          AND (cp.currency_id IS NULL OR cp.currency_id = 1)
          ${catFilter}
          ${cpFilter}
        UNION ALL
        -- Исходящие платежи (выданные в долг)
        SELECT
          p.id,
          p.number,
          'payment_out' AS doc_type,
          p.payment_date AS doc_date,
          p.counterparty_id,
          cp.name AS cp_name,
          cc.name AS cp_category,
          p.amount_base AS amount
        FROM payments p
        JOIN counterparties cp ON cp.id = p.counterparty_id
        LEFT JOIN counterparty_categories cc ON cc.id = cp.category_id
        WHERE p.direction = 'outgoing'
          AND p.status = 'posted'
          AND p.counterparty_id IS NOT NULL
          AND (cp.currency_id IS NULL OR cp.currency_id = 1)
          ${catFilter}
          ${toInt(counterparty_id) ? `AND p.counterparty_id = ${toInt(counterparty_id)}` : ''}
      ),
      docs_with_rn AS (
        SELECT *,
          ROW_NUMBER() OVER (
            PARTITION BY counterparty_id
            ORDER BY doc_date, id
          ) AS rn
        FROM docs
      ),
      payments AS (
        SELECT
          p.counterparty_id,
          SUM(CASE WHEN p.direction = 'incoming' THEN p.amount_base ELSE 0 END) AS paid_total
        FROM payments p
        WHERE p.counterparty_id IS NOT NULL AND p.status = 'posted'
        GROUP BY p.counterparty_id
      ),
      writeoffs AS (
        SELECT counterparty_id, COALESCE(SUM(amount), 0) AS writeoff_total
        FROM debt_writeoffs
        GROUP BY counterparty_id
      ),
      docs_with_prev AS (
        SELECT
          i.id, i.number, i.doc_type, i.doc_date, i.counterparty_id, i.cp_name, i.cp_category, i.amount, i.rn,
          COALESCE(SUM(i2.amount), 0) AS prev_sum
        FROM docs_with_rn i
        LEFT JOIN docs_with_rn i2 ON i2.counterparty_id = i.counterparty_id AND i2.rn < i.rn
        GROUP BY i.id, i.number, i.doc_type, i.doc_date, i.counterparty_id, i.cp_name, i.cp_category, i.amount, i.rn
      ),
      fifo AS (
        SELECT
          i.id, i.number, i.doc_type, i.doc_date, i.counterparty_id, i.cp_name, i.cp_category, i.amount,
          GREATEST(0,
            i.amount - GREATEST(0, COALESCE(p.paid_total, 0) + COALESCE(w.writeoff_total, 0) - i.prev_sum)
          ) AS debt,
          ('${today}'::date - i.doc_date) AS days_passed
        FROM docs_with_prev i
        LEFT JOIN payments p ON p.counterparty_id = i.counterparty_id
        LEFT JOIN writeoffs w ON w.counterparty_id = i.counterparty_id
      )
      SELECT id, number, doc_type, doc_date, counterparty_id, cp_name, cp_category,
        amount, debt, days_passed
      FROM fifo
      WHERE debt > 0.01
        AND days_passed >= ${minDays}
      ORDER BY counterparty_id, doc_date, id
    `);

    const grouped = {};
    rows.forEach(r => {
      if (!grouped[r.counterparty_id]) {
        grouped[r.counterparty_id] = {
          cp_id: r.counterparty_id,
          cp_name: r.cp_name,
          cp_category: r.cp_category,
          total_debt: 0,
          invoices: []
        };
      }
      grouped[r.counterparty_id].total_debt += Number(r.debt);
      grouped[r.counterparty_id].invoices.push({
        id: r.id,
        number: r.number,
        doc_type: r.doc_type,
        doc_date: r.doc_date,
        amount: Number(r.amount),
        debt: Number(r.debt),
        days_passed: Number(r.days_passed)
      });
    });

    const result = Object.values(grouped).sort((a, b) => {
      const maxDaysA = Math.max(...a.invoices.map(i => i.days_passed));
      const maxDaysB = Math.max(...b.invoices.map(i => i.days_passed));
      return maxDaysB - maxDaysA;
    });

    res.json(result);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/creditors-report', async (req, res) => {
  const { category_id, min_days, counterparty_id } = req.query;
  const toInt = v => { const n = parseInt(v); return isNaN(n) ? null : n; };
  const catFilter = toInt(category_id) ? `AND cp.category_id = ${toInt(category_id)}` : '';
  const cpFilter = toInt(counterparty_id) ? `AND op.counterparty_id = ${toInt(counterparty_id)}` : '';
  const minDays = toInt(min_days) || 0;
  const today = new Date().toISOString().slice(0, 10);

  try {
    const cpFilterPayments = toInt(counterparty_id) ? `AND p.counterparty_id = ${toInt(counterparty_id)}` : '';
    const { rows } = await (await getPool(req.companyId)).query(`
      WITH docs AS (
        -- Приходные накладные
        SELECT
          op.id,
          op.number,
          'invoice' AS doc_type,
          op.created_at::date AS doc_date,
          op.counterparty_id,
          cp.name AS cp_name,
          cc.name AS cp_category,
          op.total_amount AS amount
        FROM orders_purchase op
        JOIN counterparties cp ON cp.id = op.counterparty_id
        LEFT JOIN counterparty_categories cc ON cc.id = cp.category_id
        WHERE op.status = 'posted'
          AND (cp.currency_id IS NULL OR cp.currency_id = 1)
          ${catFilter}
          ${cpFilter}
      ),
      docs_with_rn AS (
        SELECT *,
          ROW_NUMBER() OVER (
            PARTITION BY counterparty_id
            ORDER BY COALESCE(doc_date, '1970-01-01'::date), id
          ) AS rn
        FROM docs
      ),
      payments AS (
        SELECT
          p.counterparty_id,
          SUM(CASE WHEN p.direction = 'outgoing' THEN p.amount_base ELSE 0 END) AS paid_total
        FROM payments p
        WHERE p.counterparty_id IS NOT NULL AND p.status = 'posted'
        GROUP BY p.counterparty_id
      ),
      docs_with_prev AS (
        SELECT
          i.id, i.number, i.doc_type, i.doc_date, i.counterparty_id, i.cp_name, i.cp_category, i.amount, i.rn,
          COALESCE(SUM(i2.amount), 0) AS prev_sum
        FROM docs_with_rn i
        LEFT JOIN docs_with_rn i2 ON i2.counterparty_id = i.counterparty_id AND i2.rn < i.rn
        GROUP BY i.id, i.number, i.doc_type, i.doc_date, i.counterparty_id, i.cp_name, i.cp_category, i.amount, i.rn
      ),
      fifo AS (
        SELECT
          i.id, i.number, i.doc_type, i.doc_date, i.counterparty_id, i.cp_name, i.cp_category, i.amount,
          GREATEST(0,
            i.amount - GREATEST(0, COALESCE(p.paid_total, 0) - i.prev_sum)
          ) AS debt,
          ('${today}'::date - i.doc_date) AS days_passed
        FROM docs_with_prev i
        LEFT JOIN payments p ON p.counterparty_id = i.counterparty_id
      )
      SELECT id, number, doc_type, doc_date, counterparty_id, cp_name, cp_category,
        amount, debt, days_passed
      FROM fifo
      WHERE debt > 0.01
        AND days_passed >= ${minDays}
      ORDER BY counterparty_id, doc_date, id
    `);

    const grouped = {};
    rows.forEach(r => {
      if (!grouped[r.counterparty_id]) {
        grouped[r.counterparty_id] = {
          cp_id: r.counterparty_id,
          cp_name: r.cp_name,
          cp_category: r.cp_category,
          total_debt: 0,
          invoices: []
        };
      }
      grouped[r.counterparty_id].total_debt += Number(r.debt);
      grouped[r.counterparty_id].invoices.push({
        id: r.id,
        number: r.number,
        doc_type: r.doc_type,
        doc_date: r.doc_date,
        amount: Number(r.amount),
        debt: Number(r.debt),
        days_passed: Number(r.days_passed)
      });
    });

    const result = Object.values(grouped).sort((a, b) => {
      const maxDaysA = Math.max(...a.invoices.map(i => i.days_passed));
      const maxDaysB = Math.max(...b.invoices.map(i => i.days_passed));
      return maxDaysB - maxDaysA;
    });

    res.json(result);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── ОТЧЁТ ПО ПРОДАЖАМ ────────────────────────────────────────

app.get('/api/sales-report', async (req, res) => {
  const { date_from, date_to, warehouse_id, counterparty_id, product_id, grade_id, payment_type, supplier_id, cp_category_id } = req.query;
  const toInt = v => { const n = parseInt(v); return isNaN(n) ? null : n; };

  const conditions = ["os.status = 'posted'"];
  const params = [];

  if (date_from)       { params.push(date_from);              conditions.push(`os.created_at::date >= $${params.length}::date`); }
  if (date_to)         { params.push(date_to);                conditions.push(`os.created_at::date <= $${params.length}::date`); }
  if (warehouse_id)    { params.push(toInt(warehouse_id));    conditions.push(`os.warehouse_id = $${params.length}`); }
  if (counterparty_id) { params.push(toInt(counterparty_id)); conditions.push(`os.counterparty_id = $${params.length}`); }
  if (product_id)      { params.push(toInt(product_id));      conditions.push(`osl.product_id = $${params.length}`); }
  if (grade_id)        { params.push(toInt(grade_id));        conditions.push(`b.grade_id = $${params.length}`); }
  if (payment_type)    { params.push(payment_type);           conditions.push(`os.payment_type = $${params.length}`); }
  if (supplier_id)     { params.push(parseInt(supplier_id));  conditions.push(`b.supplier_id = $${params.length}`); }
  if (cp_category_id)  { params.push(toInt(cp_category_id));  conditions.push(`cp.category_id = $${params.length}`); }

  const where = 'WHERE ' + conditions.join(' AND ');

  try {
    // Продажи
    const { rows: saleRows } = await (await getPool(req.companyId)).query(`
      SELECT
        os.id             AS order_id,
        os.number         AS order_number,
        os.created_at     AS sale_date,
        os.payment_type,
        'sale'            AS row_type,
        cp.name           AS counterparty_name,
        w.name            AS warehouse_name,
        p.id              AS product_id,
        p.name            AS product_name,
        b.batch_number,
        g.name            AS grade_name,
        co.name           AS country_name,
        sup.name          AS supplier_name,
        u.short_name      AS unit_short,
        osl.qty,
        osl.price,
        osl.qty * osl.price                                      AS revenue,
        COALESCE(sm.cost_price, s.cost_price, 0)                 AS cost_price,
        osl.qty * COALESCE(sm.cost_price, s.cost_price, 0)       AS cost_total,
        (osl.qty * osl.price) - (osl.qty * COALESCE(sm.cost_price, s.cost_price, 0)) AS profit,
        CASE WHEN osl.qty * osl.price > 0
          THEN ROUND(((osl.qty * osl.price - osl.qty * COALESCE(sm.cost_price, s.cost_price, 0)) / (osl.qty * osl.price) * 100)::numeric, 1)
          ELSE 0 END      AS margin_pct
      FROM order_sale_lines osl
      JOIN orders_sale os   ON os.id  = osl.order_id
      JOIN products p       ON p.id   = osl.product_id
      LEFT JOIN batches b   ON b.id   = osl.batch_id
      LEFT JOIN grades g    ON g.id   = b.grade_id
      LEFT JOIN countries co ON co.id = b.country_id
      LEFT JOIN counterparties sup ON sup.id = b.supplier_id
      LEFT JOIN units u     ON u.id   = b.unit_id
      LEFT JOIN counterparties cp ON cp.id = os.counterparty_id
      LEFT JOIN warehouses w ON w.id  = os.warehouse_id
      LEFT JOIN stock s     ON s.batch_id = osl.batch_id AND s.warehouse_id = os.warehouse_id
      LEFT JOIN LATERAL (
        SELECT cost_price FROM stock_movements
        WHERE document_type='sale' AND document_id=os.id
          AND batch_id=osl.batch_id AND warehouse_id=os.warehouse_id
        LIMIT 1
      ) sm ON true
      ${where}
      ORDER BY os.created_at DESC, p.name
    `, params);

    // Возвраты — отдельные строки со знаком минус
    const retConditions = ["r.status = 'posted'"];
    const retParams = [];
    if (date_from)       { retParams.push(date_from);            retConditions.push(`r.created_at::date >= $${retParams.length}::date`); }
    if (date_to)         { retParams.push(date_to);              retConditions.push(`r.created_at::date <= $${retParams.length}::date`); }
    if (warehouse_id)    { retParams.push(toInt(warehouse_id));  retConditions.push(`r.warehouse_id = $${retParams.length}`); }
    if (product_id)      { retParams.push(toInt(product_id));    retConditions.push(`rl.product_id = $${retParams.length}`); }
    if (grade_id)        { retParams.push(toInt(grade_id));      retConditions.push(`b.grade_id = $${retParams.length}`); }
    const retWhere = 'WHERE ' + retConditions.join(' AND ');

    const { rows: retRows } = await (await getPool(req.companyId)).query(`
      SELECT
        r.order_id        AS order_id,
        r.number          AS order_number,
        r.created_at      AS sale_date,
        'cash'            AS payment_type,
        'return'          AS row_type,
        NULL              AS counterparty_name,
        w.name            AS warehouse_name,
        p.id              AS product_id,
        p.name            AS product_name,
        b.batch_number,
        g.name            AS grade_name,
        co.name           AS country_name,
        sup.name          AS supplier_name,
        u.short_name      AS unit_short,
        -rl.qty           AS qty,
        rl.price,
        -(rl.qty * rl.price)                         AS revenue,
        COALESCE(sm.cost_price, s.cost_price, 0)     AS cost_price,
        -(rl.qty * COALESCE(sm.cost_price, s.cost_price, 0)) AS cost_total,
        -(rl.qty * rl.price) + (rl.qty * COALESCE(sm.cost_price, s.cost_price, 0)) AS profit,
        0                 AS margin_pct
      FROM return_lines rl
      JOIN returns r        ON r.id  = rl.return_id
      JOIN products p       ON p.id  = rl.product_id
      LEFT JOIN batches b   ON b.id  = rl.batch_id
      LEFT JOIN grades g    ON g.id  = b.grade_id
      LEFT JOIN countries co ON co.id = b.country_id
      LEFT JOIN counterparties sup ON sup.id = b.supplier_id
      LEFT JOIN units u     ON u.id  = b.unit_id
      LEFT JOIN warehouses w ON w.id = r.warehouse_id
      LEFT JOIN stock s     ON s.batch_id = rl.batch_id AND s.warehouse_id = r.warehouse_id
      LEFT JOIN stock_movements sm ON sm.document_type='return' AND sm.document_id=r.id
                                   AND sm.batch_id=rl.batch_id
      ${retWhere}
      ORDER BY r.created_at DESC, p.name
    `, retParams);

    // Объединяем и сортируем по дате
    const rows = [...saleRows, ...retRows].sort((a,b)=>new Date(b.sale_date)-new Date(a.sale_date));
    res.json(rows);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── БАЛАНС КОНТРАГЕНТОВ ───────────────────────────────────────

app.get('/api/counterparties/balance', async (req, res) => {
  const { date_to, counterparty_id, category_id } = req.query;
  const toIntLocal = v => { const n = parseInt(v); return isNaN(n) ? null : n; };
  const dateCut = date_to ? `AND os.created_at::date <= '${date_to}'::date` : '';
  const dateCutR = date_to ? `AND r.date <= '${date_to}'::date` : '';
  const dateCutP = date_to ? `AND p.payment_date <= '${date_to}'::date` : '';
  const dateCutPur = date_to ? `AND op.created_at::date <= '${date_to}'::date` : '';
  const cpFilter = toIntLocal(counterparty_id) ? `AND cp.id = ${toIntLocal(counterparty_id)}` : '';
  const catFilter = toIntLocal(category_id) ? `AND cp.category_id = ${toIntLocal(category_id)}` : '';

  // Вспомогательная функция: получить курс валюты на дату (ближайший предыдущий)
  // RUB = 1, остальные из currency_rates
  const { rows } = await (await getPool(req.companyId)).query(`
    WITH cp_rates AS (
      -- Для каждой операции получаем курс валюты контрагента на дату операции
      -- Если валюта контрагента = RUB (id=1) или NULL -> делитель 1
      SELECT cp.id AS cp_id, c.id AS cur_id, c.code AS cur_code, c.name AS cur_name
      FROM counterparties cp
      JOIN currencies c ON c.id = COALESCE(cp.currency_id, 1)
    ),
    -- Функция получения курса: ближайший предыдущий из currency_rates
    -- Для RUB возвращаем 1
    sale_conv AS (
      SELECT
        os.counterparty_id,
        SUM(
          CASE
            WHEN cp.currency_id IS NULL OR cp.currency_id = 1 THEN os.total_amount
            WHEN os.currency_id = cp.currency_id THEN os.total_amount
            WHEN (os.currency_id IS NULL OR os.currency_id = 1) THEN
              os.total_amount / NULLIF(COALESCE(
                os.currency_rate,
                (SELECT cr.rate FROM currency_rates cr
                 WHERE cr.currency_id = cp.currency_id
                   AND cr.rate_date <= os.created_at::date
                 ORDER BY cr.rate_date DESC LIMIT 1)
              , 1), 0)
            ELSE os.total_amount / NULLIF(COALESCE(os.currency_rate, 1), 0)
          END
        ) AS total,
        COUNT(*) AS cnt
      FROM orders_sale os
      JOIN counterparties cp ON cp.id = os.counterparty_id
      WHERE os.status = 'posted' AND os.payment_type = 'credit' ${dateCut}
      GROUP BY os.counterparty_id
    ),
    ret_conv AS (
      SELECT
        r.counterparty_id,
        SUM(
          r.total_amount / NULLIF(
            COALESCE(
              CASE WHEN cp.currency_id IS NULL OR cp.currency_id = 1 THEN 1
                   ELSE (
                     SELECT cr.rate FROM currency_rates cr
                     WHERE cr.currency_id = cp.currency_id
                       AND cr.rate_date <= r.date
                     ORDER BY cr.rate_date DESC LIMIT 1
                   )
              END, 1), 0)
        ) AS total,
        COUNT(*) AS cnt
      FROM returns r
      JOIN counterparties cp ON cp.id = r.counterparty_id
      WHERE r.status = 'posted' ${dateCutR}
      GROUP BY r.counterparty_id
    ),
    pay_in_conv AS (
      SELECT
        p.counterparty_id,
        SUM(
          CASE
            -- Платёж уже в валюте контрагента -> берём amount напрямую
            WHEN p.currency_id = cp.currency_id OR (p.currency_id IS NULL AND (cp.currency_id IS NULL OR cp.currency_id = 1)) THEN p.amount
            -- Контрагент в рублях -> берём amount_base
            WHEN cp.currency_id IS NULL OR cp.currency_id = 1 THEN p.amount_base
            -- Платёж в рублях, контрагент в валюте -> конвертируем через курс из currency_rates
            WHEN (p.currency_id IS NULL OR p.currency_id = 1) THEN
              p.amount_base / NULLIF(COALESCE(
                (SELECT cr.rate FROM currency_rates cr
                 WHERE cr.currency_id = cp.currency_id AND cr.rate_date <= p.payment_date
                 ORDER BY cr.rate_date DESC LIMIT 1),
                NULLIF(p.currency_rate, 0), 1
              ), 0)
            -- Платёж в другой валюте -> через amount_base и курс из currency_rates
            ELSE p.amount_base / NULLIF(COALESCE(
              (SELECT cr.rate FROM currency_rates cr
               WHERE cr.currency_id = cp.currency_id AND cr.rate_date <= p.payment_date
               ORDER BY cr.rate_date DESC LIMIT 1),
              NULLIF(p.currency_rate, 0), 1
            ), 0)
          END
        ) AS total
      FROM payments p
      JOIN counterparties cp ON cp.id = p.counterparty_id
      WHERE p.direction = 'incoming' AND p.status = 'posted' ${dateCutP}
      GROUP BY p.counterparty_id
    ),
    pur_conv AS (
      SELECT
        op.counterparty_id,
        SUM(
          CASE
            -- Контрагент рублёвый → total_amount в рублях → берём как есть
            WHEN cp.currency_id IS NULL OR cp.currency_id = 1 THEN op.total_amount
            -- Валюта документа совпадает с валютой контрагента → total_amount уже в нужной валюте
            WHEN op.currency_id = cp.currency_id THEN op.total_amount
            -- Документ в рублях, контрагент в валюте → делим на курс
            WHEN (op.currency_id IS NULL OR op.currency_id = 1) THEN
              op.total_amount / NULLIF(COALESCE(
                op.currency_rate,
                (SELECT cr.rate FROM currency_rates cr
                 WHERE cr.currency_id = cp.currency_id
                   AND cr.rate_date <= op.created_at::date
                 ORDER BY cr.rate_date DESC LIMIT 1)
              , 1), 0)
            -- Иначе → через курс документа
            ELSE op.total_amount / NULLIF(COALESCE(op.currency_rate, 1), 0)
          END
        ) AS total,
        COUNT(*) AS cnt
      FROM orders_purchase op
      JOIN counterparties cp ON cp.id = op.counterparty_id
      WHERE op.status = 'posted' ${dateCutPur}
      GROUP BY op.counterparty_id
    ),
    pay_out_conv AS (
      SELECT
        p.counterparty_id,
        SUM(
          CASE
            WHEN p.currency_id = cp.currency_id OR (p.currency_id IS NULL AND (cp.currency_id IS NULL OR cp.currency_id = 1)) THEN p.amount
            WHEN cp.currency_id IS NULL OR cp.currency_id = 1 THEN p.amount_base
            WHEN (p.currency_id IS NULL OR p.currency_id = 1) THEN
              p.amount_base / NULLIF(COALESCE(
                (SELECT cr.rate FROM currency_rates cr
                 WHERE cr.currency_id = cp.currency_id AND cr.rate_date <= p.payment_date
                 ORDER BY cr.rate_date DESC LIMIT 1),
                NULLIF(p.currency_rate, 0), 1
              ), 0)
            ELSE p.amount_base / NULLIF(COALESCE(
              (SELECT cr.rate FROM currency_rates cr
               WHERE cr.currency_id = cp.currency_id AND cr.rate_date <= p.payment_date
               ORDER BY cr.rate_date DESC LIMIT 1),
              NULLIF(p.currency_rate, 0), 1
            ), 0)
          END
        ) AS total
      FROM payments p
      JOIN counterparties cp ON cp.id = p.counterparty_id
      WHERE p.direction = 'outgoing' AND p.status = 'posted' ${dateCutP}
      GROUP BY p.counterparty_id
    ),
    overhead_conv AS (
      SELECT
        oc.counterparty_id,
        SUM(
          CASE
            WHEN cp.currency_id IS NULL OR cp.currency_id = 1 THEN oc.amount
            ELSE oc.amount / NULLIF(COALESCE(oc.currency_rate, 1), 0)
          END
        ) AS total
      FROM overhead_costs oc
      JOIN counterparties cp ON cp.id = oc.counterparty_id
      WHERE oc.counterparty_id IS NOT NULL
      GROUP BY oc.counterparty_id
    )
    SELECT
      cp.id,
      cp.name,
      cp.type,
      cc.name AS category_name,
      cp.inn,
      cp.phone,
      cp.credit_limit,
      cp.credit_days,
      c.id   AS currency_id,
      c.code AS currency_code,
      c.name AS currency_name,
      COALESCE(sale.total, 0)     AS sale_total,
      COALESCE(sale.cnt, 0)       AS sale_cnt,
      COALESCE(ret.total, 0)      AS return_total,
      COALESCE(ret.cnt, 0)        AS return_cnt,
      COALESCE(pur.total, 0)      AS purchase_total,
      COALESCE(pur.cnt, 0)        AS purchase_cnt,
      COALESCE(pay_in.total, 0)   AS paid_in,
      COALESCE(pay_out.total, 0)  AS paid_out,
      COALESCE(overhead.total, 0) AS overhead_total,
      COALESCE(sale.total, 0) - COALESCE(pur.total, 0) - COALESCE(overhead.total, 0)
        - COALESCE(pay_in.total, 0) + COALESCE(pay_out.total, 0) - COALESCE(ret.total, 0)
        - COALESCE((SELECT SUM(dw.amount) FROM debt_writeoffs dw WHERE dw.counterparty_id = cp.id), 0) AS saldo,
      GREATEST(COALESCE(sale.total, 0) - COALESCE(ret.total, 0) - COALESCE(pay_in.total, 0), 0)  AS balance_sale,
      GREATEST(COALESCE(pur.total, 0) + COALESCE(overhead.total, 0) - COALESCE(pay_out.total, 0), 0) AS balance_purchase
    FROM counterparties cp
    LEFT JOIN counterparty_categories cc ON cc.id = cp.category_id
    LEFT JOIN currencies c ON c.id = COALESCE(cp.currency_id, 1)
    LEFT JOIN sale_conv     sale    ON sale.counterparty_id    = cp.id
    LEFT JOIN ret_conv      ret     ON ret.counterparty_id     = cp.id
    LEFT JOIN pay_in_conv   pay_in  ON pay_in.counterparty_id  = cp.id
    LEFT JOIN pur_conv      pur     ON pur.counterparty_id     = cp.id
    LEFT JOIN pay_out_conv  pay_out ON pay_out.counterparty_id = cp.id
    LEFT JOIN overhead_conv overhead ON overhead.counterparty_id = cp.id
    WHERE cp.is_active = true ${cpFilter} ${catFilter}
    ORDER BY cp.name
  `);
  res.json(rows);
});


// ── ИСТОРИЯ ОПЕРАЦИЙ КОНТРАГЕНТА ─────────────────────────────

app.get('/api/counterparties/:id/history', async (req, res) => {
  const id = parseInt(req.params.id);
  const { date_from, date_to } = req.query;
  // Строим условия с параметрами
  const buildDateFilter = (col, paramOffset) => {
    const conds = []; const params = [id];
    if (date_from) { params.push(date_from); conds.push(`AND ${col}::date >= $${paramOffset + conds.length}`); }
    if (date_to)   { params.push(date_to);   conds.push(`AND ${col}::date <= $${paramOffset + conds.length}`); }
    return { filter: conds.join(' '), params };
  };

  const sf = buildDateFilter('created_at', 2);
  const sales = await (await getPool(req.companyId)).query(
    `SELECT 'sale' AS type, id, number, created_at AS date, total_amount AS amount, status
     FROM orders_sale WHERE counterparty_id=$1 AND status='posted' AND payment_type='credit' ${sf.filter} ORDER BY created_at DESC`,
    sf.params
  );
  const pf = buildDateFilter('created_at', 2);
  const purchases = await (await getPool(req.companyId)).query(
    `SELECT 'purchase' AS type, id, number, created_at AS date, total_amount AS amount, status
     FROM orders_purchase WHERE counterparty_id=$1 AND status='posted' ${pf.filter} ORDER BY created_at DESC`,
    pf.params
  );
  const pymf = buildDateFilter('payment_date', 2);
  const payments = await (await getPool(req.companyId)).query(
    `SELECT 'payment' AS type, id, number, payment_date AS date, amount, amount_base, currency_id, currency_rate, direction, status
     FROM payments WHERE counterparty_id=$1 AND status='posted' ${pymf.filter} ORDER BY payment_date DESC`,
    pymf.params
  );
  const ohf = buildDateFilter('oc.created_at', 2);
  const overheads = await (await getPool(req.companyId)).query(
    `SELECT 'overhead' AS type, oc.id,
            CONCAT('Накл. расходы: ', COALESCE(fa.name, ''), ' / ', COALESCE(op.number, '')) AS number,
            oc.created_at AS date, oc.amount, 'outgoing' AS direction, 'posted' AS status
     FROM overhead_costs oc
     LEFT JOIN finance_articles fa ON fa.id = oc.article_id
     LEFT JOIN orders_purchase op ON op.id = oc.document_id AND oc.document_type = 'purchase'
     WHERE oc.counterparty_id = $1 ${ohf.filter}
     ORDER BY oc.created_at DESC`,
    ohf.params
  );
  const all = [
    ...sales.rows.map(r=>({...r, amount:Number(r.amount)})),
    ...purchases.rows.map(r=>({...r, amount:Number(r.amount)})),
    ...payments.rows.map(r=>({...r, amount:Number(r.amount), amount_base:Number(r.amount_base), currency_id:Number(r.currency_id), currency_rate:Number(r.currency_rate)})),
    ...overheads.rows.map(r=>({...r, amount:Number(r.amount)})),
  ].sort((a,b)=>new Date(b.date)-new Date(a.date));
  res.json(all);
});


// ── НАКЛАДНЫЕ РАСХОДЫ ────────────────────────────────────────

app.get('/api/overhead-costs/:orderId', async (req, res) => {
  const { rows } = await (await getPool(req.companyId)).query(`
    SELECT oc.*, fa.name AS article_name, cp.name AS counterparty_name
    FROM overhead_costs oc
    LEFT JOIN finance_articles fa ON fa.id = oc.article_id
    LEFT JOIN counterparties cp ON cp.id = oc.counterparty_id
    WHERE oc.document_type = 'purchase' AND oc.document_id = $1
    ORDER BY oc.id
  `, [parseInt(req.params.orderId)]);
  res.json(rows);
});

app.post('/api/overhead-costs', async (req, res) => {
  const { document_id, article_id, counterparty_id, amount, currency_id, note } = req.body;
  const toInt   = v => { const n = parseInt(v);   return isNaN(n) ? null : n; };
  const toFloat = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
  const { rows: [row] } = await (await getPool(req.companyId)).query(`
    INSERT INTO overhead_costs (document_type, document_id, article_id, counterparty_id, amount, currency_id, is_allocated)
    VALUES ('purchase', $1, $2, $3, $4, $5, false) RETURNING *
  `, [toInt(document_id), toInt(article_id), toInt(counterparty_id), toFloat(amount), toInt(currency_id)]);
  res.json(row);
});

app.put('/api/overhead-costs/:id', async (req, res) => {
  const { article_id, counterparty_id, amount, currency_id, note } = req.body;
  const toInt   = v => { const n = parseInt(v);   return isNaN(n) ? null : n; };
  const toFloat = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
  const { rows: [row] } = await (await getPool(req.companyId)).query(`
    UPDATE overhead_costs SET article_id=$1, counterparty_id=$2, amount=$3, currency_id=$4
    WHERE id=$5 RETURNING *
  `, [toInt(article_id), toInt(counterparty_id), toFloat(amount), toInt(currency_id), parseInt(req.params.id)]);
  res.json(row);
});

app.delete('/api/overhead-costs/:id', async (req, res) => {
  await (await getPool(req.companyId)).query('DELETE FROM overhead_costs WHERE id=$1', [parseInt(req.params.id)]);
  res.json({ ok: true });
});

// Применить накладные расходы к себестоимости партий
async function applyOverheadCosts(client, orderId) {
  // Получаем строки накладной (с уже привязанным batch_id, проставленным при проведении)
  const { rows: lines } = await client.query(
    'SELECT * FROM order_purchase_lines WHERE order_id=$1', [orderId]
  );
  // Получаем накладные расходы
  const { rows: overheads } = await client.query(
    `SELECT SUM(amount) AS total FROM overhead_costs WHERE document_type='purchase' AND document_id=$1`, [orderId]
  );
  const totalOverhead = Number(overheads[0]?.total) || 0;
  if (totalOverhead === 0) return;

  // Общее количество по накладной
  const totalQty = lines.reduce((s, l) => s + Number(l.qty), 0);
  if (totalQty === 0) return;

  // Распределяем по количеству — обновляем себестоимость в stock ТОЧНО по batch_id этой строки
  for (const l of lines) {
    if (!l.batch_id || !Number(l.qty)) continue;
    const share = (Number(l.qty) / totalQty) * totalOverhead;
    const costAdd = share / Number(l.qty); // доп. себестоимость на единицу
    await client.query(`
      UPDATE stock SET cost_price = cost_price + $1
      WHERE batch_id = $2
    `, [costAdd, l.batch_id]);
    // Зеркалим прибавку и в движении прихода, чтобы себестоимость партии была видна в истории
    await client.query(`
      UPDATE stock_movements SET cost_price = cost_price + $1
      WHERE document_type='purchase' AND document_id=$2 AND batch_id=$3
    `, [costAdd, orderId, l.batch_id]);
  }
  // Помечаем как распределено
  await client.query(
    `UPDATE overhead_costs SET is_allocated=true WHERE document_type='purchase' AND document_id=$1`, [orderId]
  );
}

// ── ПАРТИИ — список по товару ─────────────────────────────────

app.get('/api/batches', async (req, res) => {
  const { product_id, warehouse_id } = req.query;
  let query = `
    SELECT b.*, 
           p.name AS product_name,
           g.name AS grade_name,
           co.name AS country_name,
           u.short_name AS unit_short,
           cp.name AS supplier_name,
           COALESCE(s.qty, 0) AS qty_in_stock,
           s.warehouse_id
    FROM batches b
    LEFT JOIN products p    ON p.id = b.product_id
    LEFT JOIN grades g      ON g.id = b.grade_id
    LEFT JOIN countries co  ON co.id = b.country_id
    LEFT JOIN units u       ON u.id = b.unit_id
    LEFT JOIN counterparties cp ON cp.id = b.supplier_id
    LEFT JOIN stock s       ON s.batch_id = b.id
    WHERE 1=1
  `;
  const params = [];
  if (product_id) { params.push(parseInt(product_id)); query += ` AND b.product_id = $${params.length}`; }
  if (warehouse_id) { params.push(parseInt(warehouse_id)); query += ` AND s.warehouse_id = $${params.length}`; }
  query += ' AND COALESCE(s.qty, 0) > 0 ORDER BY b.id DESC';
  const { rows } = await (await getPool(req.companyId)).query(query, params);
  res.json(rows);
});

// Генерация номера партии
async function generateBatchNumber(client) {
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const prefix = `${dd}-${mm}`;
  const { rows } = await client.query(
    `SELECT COUNT(*) AS cnt FROM batches WHERE batch_number LIKE $1`,
    [`${prefix}-%`]
  );
  const seq = String(parseInt(rows[0].cnt) + 1).padStart(3, '0');
  return `${prefix}-${seq}`;
}



// ── ПОСТУПЛЕНИЕ ПО ПАРТИИ ────────────────────────────────────────

app.get('/api/batches/:batch_id/purchase', async (req, res) => {
  const batchId = parseInt(req.params.batch_id);
  try {
    const { rows } = await (await getPool(req.companyId)).query(`
      SELECT
        op.created_at          AS purchase_date,
        op.number              AS order_number,
        op.id                  AS order_id,
        cp.name                AS counterparty_name,
        opl.qty,
        opl.price,
        opl.qty * opl.price    AS total_amount
      FROM order_purchase_lines opl
      JOIN orders_purchase op     ON op.id  = opl.order_id
      LEFT JOIN counterparties cp ON cp.id  = op.counterparty_id
      WHERE opl.batch_id = $1
      ORDER BY op.created_at DESC
    `, [batchId]);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── ПРОДАЖИ ПО ПАРТИИ ────────────────────────────────────────

app.get('/api/batches/:batch_id/sales', async (req, res) => {
  const batchId = parseInt(req.params.batch_id);
  try {
    const { rows } = await (await getPool(req.companyId)).query(`
      SELECT
        os.created_at          AS sale_date,
        os.number              AS order_number,
        os.id                  AS order_id,
        cp.name                AS counterparty_name,
        osl.qty,
        osl.price,
        osl.qty * osl.price                                         AS revenue,
        COALESCE(s.cost_price, 0)                                   AS cost_price,
        osl.qty * COALESCE(s.cost_price, 0)                         AS cost_total,
        (osl.qty * osl.price) - (osl.qty * COALESCE(s.cost_price, 0)) AS profit
      FROM order_sale_lines osl
      JOIN orders_sale os      ON os.id  = osl.order_id
      LEFT JOIN counterparties cp ON cp.id = os.counterparty_id
      LEFT JOIN stock s        ON s.batch_id = osl.batch_id AND s.warehouse_id = os.warehouse_id
      WHERE osl.batch_id = $1
        AND os.status = 'posted'
      ORDER BY os.created_at DESC
    `, [batchId]);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── ПОЛУЧЕНИЕ ОДНОЙ ПРИХОДНОЙ НАКЛАДНОЙ ──────────────────────

app.get('/api/orders-purchase/:id', async (req, res) => {
  const orderId = parseInt(req.params.id);
  const { rows: [order] } = await (await getPool(req.companyId)).query(`
    SELECT op.*, cp.name AS counterparty_name, w.name AS warehouse_name, cu.code AS currency_code
    FROM orders_purchase op
    LEFT JOIN counterparties cp ON cp.id = op.counterparty_id
    LEFT JOIN warehouses w      ON w.id  = op.warehouse_id
    LEFT JOIN currencies cu     ON cu.id = op.currency_id
    WHERE op.id = $1
  `, [orderId]);
  if (!order) return res.status(404).json({ error: 'Не найдена' });
  const { rows: lines } = await (await getPool(req.companyId)).query(`
    SELECT l.*, p.name AS product_name,
      b.batch_number, b.grade_id, b.country_id,
      g.name  AS grade_name,
      co.name AS country_name,
      u.short_name AS unit_short,
      cp.name AS supplier_name,
      COALESCE((
        SELECT SUM(ABS(sm.qty))
        FROM stock_movements sm
        WHERE sm.batch_id = l.batch_id
          AND sm.document_type != 'purchase'
      ), 0) AS moved_qty
    FROM order_purchase_lines l
    LEFT JOIN products p        ON p.id  = l.product_id
    LEFT JOIN batches b         ON b.id  = l.batch_id
    LEFT JOIN grades g          ON g.id  = b.grade_id
    LEFT JOIN countries co      ON co.id = b.country_id
    LEFT JOIN units u           ON u.id  = b.unit_id
    LEFT JOIN counterparties cp ON cp.id = b.supplier_id
    WHERE l.order_id = $1
  `, [orderId]);
  res.json({ ...order, lines });
});

// ── ПОЛУЧЕНИЕ ОДНОЙ РАСХОДНОЙ НАКЛАДНОЙ ──────────────────────

app.get('/api/orders-sale/:id', async (req, res) => {
  const orderId = parseInt(req.params.id);
  const { rows: [order] } = await (await getPool(req.companyId)).query(`
    SELECT os.*, cp.name AS counterparty_name, w.name AS warehouse_name,
           c.name AS company_name, cu.code AS currency_code
    FROM orders_sale os
    LEFT JOIN counterparties cp ON cp.id = os.counterparty_id
    LEFT JOIN warehouses w      ON w.id  = os.warehouse_id
    LEFT JOIN companies c       ON c.id  = w.company_id
    LEFT JOIN currencies cu     ON cu.id = os.currency_id
    WHERE os.id = $1
  `, [orderId]);
  if (!order) return res.status(404).json({ error: 'Не найдена' });
  const { rows: lines } = await (await getPool(req.companyId)).query(`
    SELECT l.*,
           p.name AS product_name,
           b.batch_number, b.grade_id, b.country_id, b.unit_id,
           g.name AS grade_name,
           co.name AS country_name,
           u.short_name AS unit_short,
           (SELECT op.created_at FROM order_purchase_lines opl
              JOIN orders_purchase op ON op.id = opl.order_id
              WHERE opl.batch_id = b.id
              ORDER BY op.created_at ASC LIMIT 1) AS purchase_date
    FROM order_sale_lines l
    LEFT JOIN products p ON p.id = l.product_id
    LEFT JOIN batches b  ON b.id = l.batch_id
    LEFT JOIN grades g   ON g.id = b.grade_id
    LEFT JOIN countries co ON co.id = b.country_id
    LEFT JOIN units u    ON u.id = b.unit_id
    WHERE l.order_id = $1
  `, [orderId]);
  res.json({ ...order, lines });
});

// ── ОБНОВЛЕНИЕ ПРИХОДНОЙ НАКЛАДНОЙ ───────────────────────────

// Проверка: есть ли продажи/списания по партиям этой накладной
app.get('/api/orders-purchase/:id/has-movements', async (req, res) => {
  const orderId = parseInt(req.params.id);
  const { rows: [order] } = await (await getPool(req.companyId)).query('SELECT * FROM orders_purchase WHERE id=$1', [orderId]);
  if (!order) return res.status(404).json({ error: 'Не найдена' });
  const { rows: movements } = await (await getPool(req.companyId)).query(`
    SELECT COUNT(*) AS cnt FROM stock_movements sm
    JOIN batches b ON b.id = sm.batch_id
    JOIN order_purchase_lines opl ON opl.order_id = $1 AND opl.product_id = b.product_id
    WHERE sm.document_type IN ('sale','write_off')
    AND b.supplier_id = $2
  `, [orderId, order.counterparty_id]);
  res.json({ has_movements: parseInt(movements[0].cnt) > 0 });
});

app.put('/api/orders-purchase/:id', async (req, res) => {
  const orderId = parseInt(req.params.id);
  const { number, date, counterparty_id, warehouse_id, company_id, currency_id, currency_rate, lines } = req.body;
  const toInt   = v => { const n = parseInt(v);   return isNaN(n) ? null : n; };
  const toFloat = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
  const pool = await getPool(req.companyId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [order] } = await client.query('SELECT * FROM orders_purchase WHERE id=$1', [orderId]);
    if (!order) return res.status(404).json({ error: 'Не найдена' });

    // Проверяем дату — нельзя ставить позже чем дата продаж по этой накладной
    if (date) {
      const { rows: salesCheck } = await client.query(`
        SELECT MIN(os.created_at::date) AS min_sale_date
        FROM order_sale_lines osl
        JOIN orders_sale os ON os.id = osl.order_id
        WHERE os.status = 'posted'
          AND osl.batch_id IN (
            SELECT opl.batch_id FROM order_purchase_lines opl WHERE opl.order_id = $1 AND opl.batch_id IS NOT NULL
          )
      `, [orderId]);
      if (salesCheck.length && salesCheck[0].min_sale_date) {
        const newDate = new Date(date);
        const minSaleDate = new Date(salesCheck[0].min_sale_date);
        if (newDate > minSaleDate) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: `Нельзя установить дату позже ${minSaleDate.toLocaleDateString('ru-RU')}: по накладной есть продажи начиная с этой даты`
          });
        }
      }
    }

    // Откатываем старые движения если была проведена
    if (order.status === 'posted') {
      const newWarehouseId = parseInt(req.body.warehouse_id);

      // Если склад меняется — проверяем есть ли продажи/списания с партий этой накладной
      if (newWarehouseId !== order.warehouse_id) {
        const { rows: batches } = await client.query(`
          SELECT b.id FROM batches b
          JOIN order_purchase_lines opl ON opl.order_id = $1
          WHERE b.product_id = opl.product_id AND b.supplier_id = $2
        `, [orderId, order.counterparty_id]);

        if (batches.length > 0) {
          const batchIds = batches.map(b => b.id);
          const { rows: movements } = await client.query(`
            SELECT COUNT(*) AS cnt FROM stock_movements
            WHERE document_type IN ('sale','write_off')
            AND batch_id = ANY($1)
          `, [batchIds]);
          if (parseInt(movements[0].cnt) > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
              error: 'Нельзя сменить склад: по партиям этой накладной уже были продажи или списания'
            });
          }
        }
      }

      const { rows: oldLines } = await client.query('SELECT * FROM order_purchase_lines WHERE order_id=$1', [orderId]);
      for (const l of oldLines) {
        if (l.batch_id) {
          await client.query(
            'UPDATE stock SET qty = qty - $1 WHERE warehouse_id=$2 AND batch_id=$3',
            [l.qty, order.warehouse_id, l.batch_id]
          );
        } else {
          await client.query(
            'UPDATE stock SET qty = qty - $1 WHERE warehouse_id=$2 AND product_id=$3',
            [l.qty, order.warehouse_id, l.product_id]
          );
        }
      }
      await client.query('DELETE FROM stock_movements WHERE document_type=$1 AND document_id=$2', ['purchase', orderId]);
    }

    // Обновляем заголовок
    await client.query(`
      UPDATE orders_purchase SET number=$1, counterparty_id=$2, warehouse_id=$3,
        company_id=$4, currency_id=$5, currency_rate=$6, created_at=COALESCE($7::timestamptz, created_at), note=$8 WHERE id=$9
    `, [number, toInt(counterparty_id), toInt(warehouse_id), toInt(company_id), toInt(currency_id), toFloat(currency_rate),
        date||null, req.body.note||null, orderId]);

    // Обновляем batch_number во всех партиях этой накладной если передан
    if (req.body.batch_number && req.body.batch_number.trim()) {
      await client.query(`
        UPDATE batches SET batch_number = $1
        WHERE id IN (
          SELECT batch_id FROM order_purchase_lines
          WHERE order_id = $2 AND batch_id IS NOT NULL
        )
      `, [req.body.batch_number.trim(), orderId]);
    }

    // Проверяем защищённые строки (с движениями)
    const { rows: protectedLines } = await client.query(`
      SELECT l.product_id, l.batch_id, l.qty,
        COALESCE((
          SELECT SUM(ABS(sm.qty)) FROM stock_movements sm
          WHERE sm.batch_id = l.batch_id AND sm.document_type != 'purchase'
        ), 0) AS moved_qty
      FROM order_purchase_lines l
      WHERE l.order_id = $1 AND l.batch_id IS NOT NULL
    `, [orderId]);

    for (const pl of protectedLines) {
      if (Number(pl.moved_qty) === 0) continue;
      // Проверяем что эта строка есть в новых данных с тем же product_id
      const newLine = (lines||[]).find(l => parseInt(l.product_id) === pl.product_id);
      if (!newLine) {
        await client.query('ROLLBACK');
        const { rows: [pr] } = await client.query('SELECT name FROM products WHERE id=$1', [pl.product_id]);
        return res.status(400).json({ error: `Нельзя удалить строку «${pr?.name}»: по ней есть движения (${pl.moved_qty} ед.)` });
      }
      if (parseFloat(newLine.qty) < Number(pl.moved_qty)) {
        await client.query('ROLLBACK');
        const { rows: [pr] } = await client.query('SELECT name FROM products WHERE id=$1', [pl.product_id]);
        return res.status(400).json({ error: `Количество «${pr?.name}» не может быть меньше ${pl.moved_qty} ед. (столько уже продано/списано)` });
      }
    }

    // Читаем batch_id из существующих строк ДО удаления
    const { rows: oldLinesBatch } = await client.query(
      'SELECT product_id, batch_id FROM order_purchase_lines WHERE order_id=$1 AND batch_id IS NOT NULL',
      [orderId]
    );
    // Карта: product_id -> batch_id (существующие партии этой накладной)
    const existingBatchMap = {};
    for (const ol of oldLinesBatch) {
      if (!existingBatchMap[ol.product_id]) existingBatchMap[ol.product_id] = ol.batch_id;
    }

    // Сохраняем старые строки для аудита ДО удаления
    const { rows: oldPurLines } = await client.query(`
      SELECT opl.*, p.name AS product_name, b.batch_number
      FROM order_purchase_lines opl
      LEFT JOIN products p ON p.id=opl.product_id
      LEFT JOIN batches b ON b.id=opl.batch_id
      WHERE opl.order_id=$1
    `, [orderId]);

    // Пересоздаём строки — сохраняем batch_id из карты
    await client.query('DELETE FROM order_purchase_lines WHERE order_id=$1', [orderId]);
    for (const l of (lines || [])) {
      const savedBatchId = existingBatchMap[toInt(l.product_id)] || null;
      await client.query(`
        INSERT INTO order_purchase_lines (order_id, product_id, grade_id, country_id, unit_id, qty, price, vat_pct, batch_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `, [orderId, toInt(l.product_id), toInt(l.grade_id), toInt(l.country_id), toInt(l.unit_id),
          toFloat(l.qty), toFloat(l.price), toFloat(l.vat_pct) || 20, savedBatchId]);
    }

    // Проводим заново — используем batch_id из строк
    const { rows: newLines } = await client.query('SELECT * FROM order_purchase_lines WHERE order_id=$1', [orderId]);
    for (const l of newLines) {
      let batchId = l.batch_id;

      if (!batchId) {
        // Нет сохранённой партии — создаём новую (первое проведение или новая строка)
        const batchNum = await generateBatchNumber(client);
        const { rows: [newBatch] } = await client.query(
          `INSERT INTO batches (product_id, unit_id, country_id, grade_id, supplier_id, batch_number)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [l.product_id, l.unit_id, l.country_id, l.grade_id, order.counterparty_id, batchNum]
        );
        batchId = newBatch.id;
        // Сохраняем batch_id обратно в строку
        await client.query(
          'UPDATE order_purchase_lines SET batch_id=$1 WHERE order_id=$2 AND product_id=$3 AND batch_id IS NULL',
          [batchId, orderId, l.product_id]
        );
      } else {
        // Батч уже существует — обновляем grade_id и country_id
        await client.query(
          'UPDATE batches SET grade_id=$1, country_id=$2 WHERE id=$3',
          [toInt(l.grade_id), toInt(l.country_id), batchId]
        );
      }

      const { rows: [existing] } = await client.query(
        'SELECT id, qty, cost_price FROM stock WHERE warehouse_id=$1 AND product_id=$2 AND batch_id=$3 LIMIT 1',
        [toInt(warehouse_id), l.product_id, batchId]
      );
      if (existing) {
        const putCostRub = Number(l.price) * (toFloat(currency_rate)||1);
        // Пересчитываем qty из всех движений чтобы учесть продажи
        const { rows: [recalc] } = await client.query(
          `SELECT COALESCE(SUM(qty),0) AS correct_qty FROM stock_movements WHERE batch_id=$1 AND warehouse_id=$2`,
          [batchId, toInt(warehouse_id)]
        );
        const correctQty = Number(recalc.correct_qty) + Number(l.qty); // + новый приход (ещё не добавлен в movements)
        await client.query('UPDATE stock SET qty=$1, cost_price=$2 WHERE id=$3', [correctQty, putCostRub, existing.id]);
      } else {
        const putCostRub = Number(l.price) * (toFloat(currency_rate)||1);
        await client.query(
          'INSERT INTO stock (warehouse_id, product_id, batch_id, unit_id, qty, cost_price) VALUES ($1,$2,$3,$4,$5,$6)',
          [toInt(warehouse_id), l.product_id, batchId, l.unit_id, l.qty, putCostRub]
        );
      }
      const putCostRub = Number(l.price) * (toFloat(currency_rate)||1);
      await client.query(
        `INSERT INTO stock_movements (document_type, document_id, warehouse_id, product_id, batch_id, qty, cost_price, created_at) VALUES ('purchase',$1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz, NOW()))`,
        [orderId, toInt(warehouse_id), l.product_id, batchId, l.qty, putCostRub, date||null]
      );
    }

    const total = newLines.reduce((s, l) => s + Number(l.qty) * Number(l.price), 0);
    const { rows: [updated] } = await client.query(
      "UPDATE orders_purchase SET status='posted', total_amount=$1 WHERE id=$2 RETURNING *",
      [total, orderId]
    );
    // Обновляем накладные расходы
    await client.query(`DELETE FROM overhead_costs WHERE document_type='purchase' AND document_id=$1`, [orderId]);
    const overheads = req.body.overheads || [];
    const putRate = toFloat(currency_rate) || 1;
    for (const oh of overheads) {
      const ohRate = parseFloat(oh.currency_rate) || putRate;
      const ohAmtRub = (parseFloat(oh.amount)||0) * ohRate;
      await client.query(
        `INSERT INTO overhead_costs (document_type, document_id, article_id, counterparty_id, amount, currency_id, currency_rate)
         VALUES ('purchase',$1,$2,$3,$4,$5,$6)`,
        [orderId, parseInt(oh.article_id)||null, parseInt(oh.counterparty_id)||null,
         ohAmtRub, parseInt(oh.currency_id)||parseInt(currency_id)||1, ohRate]
      );
    }
    await applyOverheadCosts(client, orderId);
    const { rows: auditPurPutLines } = await client.query(`
      SELECT opl.*, p.name AS product_name, b.batch_number
      FROM order_purchase_lines opl
      LEFT JOIN products p ON p.id=opl.product_id
      LEFT JOIN batches b ON b.id=opl.batch_id
      WHERE opl.order_id=$1
    `, [orderId]);
    await client.query('COMMIT');
    await logAudit(await getPool(req.companyId), auditUserId(req), 'orders_purchase', orderId, 'UPDATE',
      { ...order, lines: oldPurLines },
      { ...updated, lines: auditPurPutLines });
    res.json(updated);
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally { client.release(); }
});

// ── ОБНОВЛЕНИЕ РАСХОДНОЙ НАКЛАДНОЙ ───────────────────────────

app.put('/api/orders-sale/:id', async (req, res) => {
  console.log('PUT sale body:', JSON.stringify(req.body));
  const orderId = parseInt(req.params.id);
  const { number, date, payment_type, counterparty_id, cash_account_id, warehouse_id, company_id, currency_id, currency_rate, delivery_date, lines } = req.body;
  const toInt   = v => { const n = parseInt(v);   return isNaN(n) ? null : n; };
  const toFloat = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
  const nullIfEmpty = v => (v === '' || v === undefined || v === null) ? null : v;
  const pool = await getPool(req.companyId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [order] } = await client.query('SELECT * FROM orders_sale WHERE id=$1', [orderId]);
    if (!order) return res.status(404).json({ error: 'Не найдена' });

    // Блокируем редактирование если есть возвраты
    const { rows: rets } = await client.query(
      'SELECT number FROM returns WHERE order_id=$1', [orderId]
    );
    if (rets.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Нельзя редактировать накладную: по ней оформлен возврат ${rets.map(r=>r.number).join(', ')}. Сначала удалите возврат.`
      });
    }

    // Проверяем дату: не раньше последнего прихода товаров этой накладной на склад
    if (date) {
      const { rows: conflicts } = await client.query(`
        SELECT
          p.name             AS product_name,
          op.number          AS purchase_number,
          op.created_at      AS purchase_date
        FROM order_sale_lines osl
        JOIN products p ON p.id = osl.product_id
        JOIN stock_movements sm
          ON sm.batch_id = osl.batch_id
         AND sm.warehouse_id = $3
         AND sm.document_type = 'purchase'
        JOIN orders_purchase op ON op.id = sm.document_id
        WHERE osl.order_id = $1
          AND osl.batch_id IS NOT NULL
          AND op.created_at::date > $2::date
        ORDER BY op.created_at DESC
        LIMIT 1
      `, [orderId, date, order.warehouse_id]);
      if (conflicts.length > 0) {
        const c = conflicts[0];
        const d = new Date(c.purchase_date).toLocaleDateString('ru-RU');
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Дата расходной накладной не может быть раньше даты прихода товара «${c.product_name}» (приходная ${c.purchase_number} от ${d})`
        });
      }
    }

    // Откатываем старые движения по stock_movements (точный откат с учётом партий)
    if (order.status === 'posted') {
      const { rows: oldMvs } = await client.query(
        'SELECT * FROM stock_movements WHERE document_type=$1 AND document_id=$2', ['sale', orderId]
      );
      for (const mv of oldMvs) {
        if (mv.batch_id) {
          // Точный откат по партии
          await client.query(
            'UPDATE stock SET qty = qty + $1 WHERE warehouse_id=$2 AND product_id=$3 AND batch_id=$4',
            [Math.abs(mv.qty), mv.warehouse_id, mv.product_id, mv.batch_id]
          );
        } else {
          // Откат без партии — берём первую доступную запись по товару
          const { rows: [s] } = await client.query(
            'SELECT id FROM stock WHERE warehouse_id=$1 AND product_id=$2 ORDER BY id ASC LIMIT 1',
            [mv.warehouse_id, mv.product_id]
          );
          if (s) {
            await client.query('UPDATE stock SET qty = qty + $1 WHERE id=$2', [Math.abs(mv.qty), s.id]);
          }
        }
      }
      await client.query('DELETE FROM stock_movements WHERE document_type=$1 AND document_id=$2', ['sale', orderId]);
    }

    // Обновляем заголовок
    await client.query(`
      UPDATE orders_sale SET number=$1, payment_type=$2, counterparty_id=$3, cash_account_id=$4,
        warehouse_id=$5, company_id=$6, currency_id=$7, currency_rate=$8, delivery_date=$9, created_at=COALESCE($10::timestamptz, created_at), note=$11 WHERE id=$12
    `, [number, payment_type, toInt(counterparty_id), toInt(cash_account_id),
        toInt(warehouse_id), toInt(company_id), toInt(currency_id), toFloat(currency_rate),
        nullIfEmpty(delivery_date), date||null, req.body.note||null, orderId]);

    // Сохраняем старые строки для аудита ДО удаления
    const { rows: oldSaleLines } = await client.query(`
      SELECT osl.*, p.name AS product_name, b.batch_number
      FROM order_sale_lines osl
      LEFT JOIN products p ON p.id=osl.product_id
      LEFT JOIN batches b ON b.id=osl.batch_id
      WHERE osl.order_id=$1
    `, [orderId]);

    // Пересоздаём строки
    await client.query('DELETE FROM order_sale_lines WHERE order_id=$1', [orderId]);
    for (const l of (lines || [])) {
      await client.query(`
        INSERT INTO order_sale_lines (order_id, product_id, batch_id, qty, price, discount_pct, vat_pct)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
      `, [orderId, toInt(l.product_id), toInt(l.batch_id),
          toFloat(l.qty), toFloat(l.price), toFloat(l.discount_pct)||0, toFloat(l.vat_pct)||20]);
    }

    // Списываем заново с учётом партии
    const { rows: newLines } = await client.query('SELECT * FROM order_sale_lines WHERE order_id=$1', [orderId]);
    for (const l of newLines) {
      let stockRow;
      if (l.batch_id) {
        const { rows: [s] } = await client.query(
          'SELECT id, qty FROM stock WHERE warehouse_id=$1 AND product_id=$2 AND batch_id=$3 LIMIT 1',
          [toInt(warehouse_id), l.product_id, l.batch_id]
        );
        stockRow = s;
      } else {
        const { rows: [s] } = await client.query(
          'SELECT id, qty, batch_id FROM stock WHERE warehouse_id=$1 AND product_id=$2 AND qty>0 ORDER BY id ASC LIMIT 1',
          [toInt(warehouse_id), l.product_id]
        );
        stockRow = s;
      }
      console.log('stockRow:', stockRow, 'l.qty:', l.qty, 'l.batch_id:', l.batch_id, 'warehouse_id:', toInt(warehouse_id));
      if (!stockRow || Number(stockRow.qty) < Number(l.qty)) {
        const { rows: [prod] } = await client.query('SELECT name FROM products WHERE id=$1', [l.product_id]);
        throw new Error(`Недостаточно товара: ${prod?.name || l.product_id} (нужно ${l.qty}, есть ${stockRow?.qty || 0})`);
      }
      await client.query('UPDATE stock SET qty = qty - $1 WHERE id=$2', [l.qty, stockRow.id]);
      await client.query(
        `INSERT INTO stock_movements (document_type, document_id, warehouse_id, product_id, batch_id, qty, created_at) VALUES ('sale',$1,$2,$3,$4,$5,COALESCE($6::timestamptz, NOW()))`,
        [orderId, toInt(warehouse_id), l.product_id, l.batch_id || stockRow.batch_id, -l.qty, delivery_date||null]
      );
    }

    const total = newLines.reduce((s, l) => s + Number(l.qty) * Number(l.price), 0);
    const { rows: [updated] } = await client.query(
      "UPDATE orders_sale SET status='posted', total_amount=$1 WHERE id=$2 RETURNING *",
      [total, orderId]
    );

    // Синхронизация платежа при смене типа оплаты
    const wasCache = order.payment_type === 'cash';
    const isCash  = payment_type === 'cash';

    if (wasCache && !isCash) {
      // cash → credit: удаляем платёж
      await client.query('DELETE FROM payment_allocations WHERE payment_id IN (SELECT id FROM payments WHERE order_id=$1)', [orderId]);
      await client.query('DELETE FROM payments WHERE order_id=$1', [orderId]);
    } else if (!wasCache && isCash) {
      // credit → cash: обнуляем контрагента в накладной и создаём платёж
      await client.query('UPDATE orders_sale SET counterparty_id=NULL WHERE id=$1', [orderId]);
      const { rows: [lastPay] } = await client.query("SELECT number FROM payments ORDER BY id DESC LIMIT 1");
      const lastNum = parseInt((lastPay?.number || '').replace(/\D/g, '')) || 0;
      const nextPayNum = 'П-' + String(lastNum + 1).padStart(4, '0');
      await client.query(`
        INSERT INTO payments (number, direction, bank_account_id, counterparty_id, currency_id, currency_rate, amount, amount_base, payment_date, purpose, status, created_by, order_id)
        VALUES ($1,'incoming',$2,$3,$4,$5,$6,$6,now(),$7,'posted',$8,$9)
      `, [nextPayNum, toInt(cash_account_id), null, toInt(currency_id), toFloat(currency_rate)||1, total, `Оплата по накладной ${number}`, toInt(req.body.created_by) || auditUserId(req), orderId]);
    } else if (wasCache && isCash) {
      // cash → cash: обновляем сумму, кассу и контрагента из актуальной накладной
      await client.query(
        'UPDATE payments SET amount=$1, amount_base=$1, bank_account_id=$2, counterparty_id=NULL WHERE order_id=$3',
        [total, toInt(cash_account_id), orderId]
      );
    }

    const { rows: auditSalePutLines } = await client.query(`
      SELECT osl.*, p.name AS product_name, b.batch_number
      FROM order_sale_lines osl
      LEFT JOIN products p ON p.id=osl.product_id
      LEFT JOIN batches b ON b.id=osl.batch_id
      WHERE osl.order_id=$1
    `, [orderId]);
    await client.query('COMMIT');
    await logAudit(await getPool(req.companyId), auditUserId(req), 'orders_sale', orderId, 'UPDATE',
      { ...order, lines: oldSaleLines },
      { ...updated, lines: auditSalePutLines });
    res.json(updated);
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally { client.release(); }
});

// ── УДАЛЕНИЕ РАСХОДНОЙ НАКЛАДНОЙ ─────────────────────────────

app.delete('/api/orders-sale/:id', async (req, res) => {
  const orderId = parseInt(req.params.id);
  const pool = await getPool(req.companyId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [order] } = await client.query('SELECT * FROM orders_sale WHERE id=$1', [orderId]);
    if (!order) return res.status(404).json({ error: 'Накладная не найдена' });

    // Блокируем удаление если есть связанные возвраты
    const { rows: [retCount] } = await client.query(
      'SELECT COUNT(*) AS cnt FROM returns WHERE order_id=$1', [orderId]
    );
    if (parseInt(retCount.cnt) > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Нельзя удалить накладную: по ней оформлено ${retCount.cnt} возврат(а). Сначала удалите возвраты.` });
    }

    // Если проведена — восстанавливаем остатки по движениям
    if (order.status === 'posted') {
      const { rows: movements } = await client.query(
        'SELECT * FROM stock_movements WHERE document_type=$1 AND document_id=$2',
        ['sale', orderId]
      );
      for (const mv of movements) {
        // qty в движении отрицательный (списание), поэтому прибавляем abs(qty)
        await client.query(
          `UPDATE stock SET qty = qty + $1
           WHERE warehouse_id=$2 AND product_id=$3
           AND (batch_id=$4 OR (batch_id IS NULL AND $4::int IS NULL))`,
          [Math.abs(mv.qty), mv.warehouse_id, mv.product_id, mv.batch_id]
        );
      }
      await client.query('DELETE FROM stock_movements WHERE document_type=$1 AND document_id=$2', ['sale', orderId]);

      // Удаляем автоматически созданный наличный платёж (если был)
      if (order.payment_type === 'cash') {
        await client.query(
          'DELETE FROM payment_allocations WHERE payment_id IN (SELECT id FROM payments WHERE order_id=$1)',
          [orderId]
        );
        await client.query('DELETE FROM payments WHERE order_id=$1', [orderId]);
      }
    }

    await client.query('DELETE FROM order_sale_lines WHERE order_id=$1', [orderId]);
    await client.query('DELETE FROM orders_sale WHERE id=$1', [orderId]);
    await client.query('COMMIT');
    await logAudit(await getPool(req.companyId), auditUserId(req), 'orders_sale', orderId, 'DELETE', order, null);
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally { client.release(); }
});

// ── УДАЛЕНИЕ ПРИХОДНОЙ НАКЛАДНОЙ ─────────────────────────────


// ── КОРРЕКТИРОВКА ПОСТАВЩИКА ПО СТРОКЕ ПРИХОДНОЙ НАКЛАДНОЙ ──────────────────
app.post('/api/orders-purchase/:id/correct-supplier', async (req, res) => {
  const orderId = parseInt(req.params.id);
  const toInt = v => { const n = parseInt(v); return isNaN(n) ? null : n; };
  const { line_id, new_supplier_id, created_by } = req.body;
  if (!line_id || !new_supplier_id) return res.status(400).json({ error: 'Укажите строку и нового поставщика' });

  const pool = await getPool(req.companyId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Получаем оригинальную накладную
    const { rows: [order] } = await client.query('SELECT * FROM orders_purchase WHERE id=$1', [orderId]);
    if (!order) return res.status(404).json({ error: 'Накладная не найдена' });
    if (order.status !== 'posted') return res.status(400).json({ error: 'Накладная не проведена' });

    // 2. Получаем строку которую корректируем
    const { rows: [line] } = await client.query(
      'SELECT opl.*, p.name AS product_name FROM order_purchase_lines opl JOIN products p ON p.id=opl.product_id WHERE opl.id=$1 AND opl.order_id=$2',
      [parseInt(line_id), orderId]
    );
    if (!line) return res.status(404).json({ error: 'Строка не найдена' });

    // 3. Обновляем supplier_id в партии — влияет на отчёт продаж
    if (line.batch_id) {
      await client.query('UPDATE batches SET supplier_id=$1 WHERE id=$2', [parseInt(new_supplier_id), line.batch_id]);
    }

    // 4. Удаляем строку из оригинальной накладной
    await client.query('DELETE FROM order_purchase_lines WHERE id=$1', [parseInt(line_id)]);

    // 5. stock_movement будет перепривязан к новой накладной на шаге 10

    // 6. Пересчитываем total_amount оригинальной накладной
    const { rows: [totRow] } = await client.query(
      'SELECT COALESCE(SUM(qty*price),0) AS total FROM order_purchase_lines WHERE order_id=$1',
      [orderId]
    );
    await client.query('UPDATE orders_purchase SET total_amount=$1 WHERE id=$2', [totRow.total, orderId]);

    // 7. Создаём новую приходную накладную от нового поставщика с датой оригинала
    const newNumber = 'КОР-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random()*9000)+1000);
    const { rows: [newOrder] } = await client.query(`
      INSERT INTO orders_purchase (number, counterparty_id, warehouse_id, company_id, currency_id, currency_rate, status, note, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,'posted',$7,$8) RETURNING *
    `, [newNumber, parseInt(new_supplier_id), order.warehouse_id, order.company_id,
        order.currency_id, order.currency_rate,
        `Корректировка поставщика по накладной ${order.number}: ${line.product_name}`,
        order.created_at]);

    // 8. Добавляем строку в новую накладную с тем же batch_id
    await client.query(`
      INSERT INTO order_purchase_lines (order_id, product_id, grade_id, country_id, unit_id, qty, price, vat_pct, batch_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `, [newOrder.id, line.product_id, line.grade_id, line.country_id, line.unit_id,
        line.qty, line.price, line.vat_pct||0, line.batch_id]);

    // 9. Обновляем total_amount новой накладной
    await client.query(
      'UPDATE orders_purchase SET total_amount=$1 WHERE id=$2',
      [Number(line.qty) * Number(line.price), newOrder.id]
    );

    // 10. Перепривязываем stock_movement от старой накладной к новой (остатки не меняются)
    await client.query(
      "UPDATE stock_movements SET document_id=$1 WHERE document_type='purchase' AND document_id=$2 AND batch_id=$3",
      [newOrder.id, orderId, line.batch_id]
    );

    // 11. Защита от дублей в stock — оставляем только одну запись по batch_id+warehouse_id
    // Пересчитываем правильный остаток из movements
    const { rows: [stockCalc] } = await client.query(`
      SELECT COALESCE(SUM(qty),0) AS correct_qty
      FROM stock_movements
      WHERE batch_id=$1 AND warehouse_id=$2
    `, [line.batch_id, order.warehouse_id]);

    // Удаляем дубли — оставляем запись с максимальным id
    await client.query(`
      DELETE FROM stock WHERE batch_id=$1 AND warehouse_id=$2
      AND id NOT IN (
        SELECT id FROM stock WHERE batch_id=$1 AND warehouse_id=$2
        ORDER BY id DESC FETCH FIRST 1 ROWS ONLY
      )
    `, [line.batch_id, order.warehouse_id]);

    // Обновляем qty до правильного значения
    await client.query(
      'UPDATE stock SET qty=$1 WHERE batch_id=$2 AND warehouse_id=$3',
      [Number(stockCalc.correct_qty), line.batch_id, order.warehouse_id]
    );

    await client.query('COMMIT');
    await logAudit(await getPool(req.companyId), auditUserId(req), 'orders_purchase', orderId, 'UPDATE',
      { correction: `Строка ${line.product_name} перенесена к поставщику ${new_supplier_id}` }, null);

    res.json({ ok: true, new_order_id: newOrder.id, new_number: newNumber });
  } catch(e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

app.delete('/api/orders-purchase/:id', async (req, res) => {
  const orderId = parseInt(req.params.id);
  const pool = await getPool(req.companyId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [order] } = await client.query('SELECT * FROM orders_purchase WHERE id=$1', [orderId]);
    if (!order) return res.status(404).json({ error: 'Накладная не найдена' });

    // Блокируем удаление если по партиям этой накладной есть продажи или списания
    const { rows: [mvCount] } = await client.query(`
      SELECT COUNT(*) AS cnt
      FROM stock_movements sm
      JOIN order_purchase_lines opl ON opl.batch_id = sm.batch_id
      WHERE opl.order_id = $1
        AND sm.document_type != 'purchase'
    `, [orderId]);
    if (parseInt(mvCount.cnt) > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Нельзя удалить накладную: по ней оформлено ${mvCount.cnt} движений (продажи, списания, перемещения). Сначала удалите связанные документы.`
      });
    }

    // Если проведена — восстанавливаем остатки
    if (order.status === 'posted') {
      const { rows: lines } = await client.query('SELECT * FROM order_purchase_lines WHERE order_id=$1', [orderId]);
      for (const line of lines) {
        await client.query(
          `UPDATE stock SET qty = qty - $1 WHERE warehouse_id=$2 AND product_id=$3`,
          [line.qty, order.warehouse_id, line.product_id]
        );
      }
      await client.query('DELETE FROM stock_movements WHERE document_type=$1 AND document_id=$2', ['purchase', orderId]);
      // Удаляем нулевые остатки по партиям этой накладной
      await client.query(`
        DELETE FROM stock
        WHERE qty <= 0
          AND batch_id IN (
            SELECT opl.batch_id FROM order_purchase_lines opl
            WHERE opl.order_id = $1 AND opl.batch_id IS NOT NULL
          )
      `, [orderId]);
    }
    await client.query('DELETE FROM order_purchase_lines WHERE order_id=$1', [orderId]);
    await client.query("DELETE FROM overhead_costs WHERE document_type='purchase' AND document_id=$1", [orderId]);
    await client.query('DELETE FROM orders_purchase WHERE id=$1', [orderId]);
    await client.query('COMMIT');
    await logAudit(await getPool(req.companyId), auditUserId(req), 'orders_purchase', orderId, 'DELETE', order, null);
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally { client.release(); }
});

// ── УДАЛЕНИЕ ПЛАТЕЖА ─────────────────────────────────────────


// ── ПОЛУЧЕНИЕ ОДНОГО ПЛАТЕЖА ─────────────────────────────────

app.get('/api/payments/:id', async (req, res) => {
  const { rows: [row] } = await (await getPool(req.companyId)).query(`
    SELECT py.*,
           cp.name AS counterparty_name,
           ba.name AS account_name,
           cu.code AS currency_code,
           fa.name AS article_name
    FROM payments py
    LEFT JOIN counterparties cp ON cp.id = py.counterparty_id
    LEFT JOIN bank_accounts ba  ON ba.id = py.bank_account_id
    LEFT JOIN currencies cu     ON cu.id = py.currency_id
    LEFT JOIN finance_articles fa ON fa.id = py.article_id
    WHERE py.id = $1
  `, [parseInt(req.params.id)]);
  if (!row) return res.status(404).json({ error: 'Платёж не найден' });
  res.json(row);
});

// ── ОБНОВЛЕНИЕ ПЛАТЕЖА ────────────────────────────────────────

app.put('/api/payments/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  console.log('PUT payment body:', JSON.stringify(req.body));

  // Блокируем редактирование платежа привязанного к накладной
  const { rows: [existing] } = await (await getPool(req.companyId)).query('SELECT order_id FROM payments WHERE id=$1', [id]);
  if (!existing) return res.status(404).json({ error: 'Платёж не найден' });
  if (existing.order_id) {
    return res.status(400).json({ error: 'Нельзя редактировать платёж: он привязан к расходной накладной.' });
  }
  if (existing.return_id) {
    return res.status(400).json({ error: 'Нельзя редактировать платёж: он привязан к возврату.' });
  }
  const { rows: [oldPay] } = await (await getPool(req.companyId)).query('SELECT * FROM payments WHERE id=$1', [id]);

  const { number, direction, article_id, bank_account_id, counterparty_id,
          currency_id, currency_rate, amount, amount_base, payment_date, purpose,
          legal_name, pp_number } = req.body;
  const toInt   = v => { const n = parseInt(v);   return isNaN(n) ? null : n; };
  const toFloat = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
  const nullIfEmpty = v => (v === '' || v === undefined || v === null) ? null : v;
  const { rows: [row] } = await (await getPool(req.companyId)).query(`
    UPDATE payments SET
      number=$1, direction=$2, article_id=$3, bank_account_id=$4, counterparty_id=$5,
      currency_id=$6, currency_rate=$7, amount=$8, amount_base=$9,
      payment_date=$10, purpose=$11, note=$12, legal_name=$13, pp_number=$14
    WHERE id=$15 RETURNING *
  `, [number, direction,
      toInt(article_id), toInt(bank_account_id), toInt(counterparty_id),
      toInt(currency_id), toFloat(currency_rate),
      toFloat(amount), toFloat(amount_base ?? amount),
      nullIfEmpty(payment_date), nullIfEmpty(purpose),
      req.body.note||null, nullIfEmpty(legal_name), nullIfEmpty(pp_number), id]);
  if (!row) return res.status(404).json({ error: 'Платёж не найден' });
  await logAudit(await getPool(req.companyId), auditUserId(req), 'payments', id, 'UPDATE', oldPay, row);
  res.json(row);
});



// ── СОРТА ТОВАРА ─────────────────────────────────────────────

app.get('/api/products/:id/grades', async (req, res) => {
  const { rows } = await (await getPool(req.companyId)).query(
    'SELECT grade_id FROM product_grades WHERE product_id=$1',
    [parseInt(req.params.id)]
  );
  res.json(rows);
});

app.put('/api/products/:id/grades', async (req, res) => {
  const productId = parseInt(req.params.id);
  const { grade_ids = [] } = req.body;
  const pool = await getPool(req.companyId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM product_grades WHERE product_id=$1', [productId]);
    for (const gradeId of grade_ids) {
      await client.query(
        'INSERT INTO product_grades (product_id, grade_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [productId, parseInt(gradeId)]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true, count: grade_ids.length });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally { client.release(); }
});

// Получить доступные сорта для товара (для накладной)
app.get('/api/products/:id/available-grades', async (req, res) => {
  const productId = parseInt(req.params.id);
  // Если у товара нет привязанных сортов — вернуть все
  const { rows: linked } = await (await getPool(req.companyId)).query(
    'SELECT grade_id FROM product_grades WHERE product_id=$1', [productId]
  );
  if (linked.length === 0) {
    const { rows } = await (await getPool(req.companyId)).query('SELECT * FROM grades WHERE is_active=true ORDER BY sort_order,name');
    return res.json(rows);
  }
  const ids = linked.map(r => r.grade_id);
  const { rows } = await (await getPool(req.companyId)).query(
    `SELECT * FROM grades WHERE id = ANY($1) ORDER BY sort_order,name`, [ids]
  );
  res.json(rows);
});


// ── СКЛАДЫ — создание и обновление ───────────────────────────

app.post('/api/warehouses', async (req, res) => {
  const { name, address, company_id, is_active } = req.body;
  const { rows: [row] } = await (await getPool(req.companyId)).query(
    'INSERT INTO warehouses (name, address, company_id, is_active) VALUES ($1,$2,$3,$4) RETURNING *',
    [name, address||null, company_id||1, is_active!==false]
  );
  res.json(row);
});

app.put('/api/warehouses/:id', async (req, res) => {
  const { name, address, is_active, company_name, is_default } = req.body;
  const id = parseInt(req.params.id);
  // Если устанавливаем склад по умолчанию — сбрасываем у остальных
  if (is_default) {
    await (await getPool(req.companyId)).query('UPDATE warehouses SET is_default=false WHERE id != $1', [id]);
  }
  const { rows: [row] } = await (await getPool(req.companyId)).query(
    'UPDATE warehouses SET name=$1, address=$2, is_active=$3, is_default=$4 WHERE id=$5 RETURNING *',
    [name, address||null, is_active!==false, !!is_default, id]
  );
  if (company_name && row.company_id) {
    await (await getPool(req.companyId)).query('UPDATE companies SET name=$1 WHERE id=$2', [company_name, row.company_id]);
  }
  res.json({...row, company_name: company_name||null});
});

// ── УДАЛЕНИЕ ТОВАРА ──────────────────────────────────────────

app.delete('/api/products/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  // Проверяем связи
  const checks = await Promise.all([
    (await getPool(req.companyId)).query('SELECT COUNT(*) FROM stock WHERE product_id=$1 AND qty>0', [id]),
    (await getPool(req.companyId)).query('SELECT COUNT(*) FROM order_sale_lines WHERE product_id=$1', [id]),
    (await getPool(req.companyId)).query('SELECT COUNT(*) FROM order_purchase_lines WHERE product_id=$1', [id]),
    (await getPool(req.companyId)).query('SELECT COUNT(*) FROM batches WHERE product_id=$1', [id]),
  ]);
  const [stockCnt, saleCnt, purCnt, batchCnt] = checks.map(r => parseInt(r.rows[0].count));
  const errors = [];
  if (stockCnt > 0) errors.push(`есть остатки на складе (${stockCnt} записей)`);
  if (saleCnt > 0)  errors.push(`есть расходные накладные (${saleCnt} строк)`);
  if (purCnt > 0)   errors.push(`есть приходные накладные (${purCnt} строк)`);
  if (errors.length > 0) {
    return res.status(400).json({ error: `Нельзя удалить товар: ${errors.join(', ')}` });
  }
  await (await getPool(req.companyId)).query('DELETE FROM products WHERE id=$1', [id]);
  res.json({ ok: true });
});

app.delete('/api/payments/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const { rows: [pay] } = await (await getPool(req.companyId)).query('SELECT * FROM payments WHERE id=$1', [id]);
    if (!pay) return res.status(404).json({ error: 'Платёж не найден' });
    if (pay.order_id) {
      return res.status(400).json({ error: 'Нельзя удалить платёж: он привязан к расходной накладной. Удалите накладную.' });
    }
    if (pay.return_id) {
      return res.status(400).json({ error: 'Нельзя удалить платёж: он привязан к возврату. Удалите возврат.' });
    }
    await (await getPool(req.companyId)).query('DELETE FROM payment_allocations WHERE payment_id=$1', [id]);
    await (await getPool(req.companyId)).query(`UPDATE bank_statement_lines SET payment_id=NULL, status='new' WHERE payment_id=$1`, [id]);
    await (await getPool(req.companyId)).query('DELETE FROM payments WHERE id=$1', [id]);
    await logAudit(await getPool(req.companyId), auditUserId(req), 'payments', id, 'DELETE', pay, null);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── ПРОВЕДЕНИЕ РАСХОДНОЙ НАКЛАДНОЙ ───────────────────────────

app.post('/api/orders-sale/:id/post', async (req, res) => {
  const orderId = parseInt(req.params.id);
  const pool = await getPool(req.companyId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [order] } = await client.query('SELECT * FROM orders_sale WHERE id=$1', [orderId]);
    if (!order) return res.status(404).json({ error: 'Накладная не найдена' });
    if (order.status === 'posted') return res.status(400).json({ error: 'Накладная уже проведена' });
    const { rows: lines } = await client.query('SELECT * FROM order_sale_lines WHERE order_id=$1', [orderId]);
    if (!lines.length) return res.status(400).json({ error: 'В накладной нет товаров' });
    for (const line of lines) {
      const { rows: [stock] } = await client.query(
        `SELECT id, qty FROM stock WHERE warehouse_id=$1 AND product_id=$2 AND (batch_id=$3 OR (batch_id IS NULL AND $3 IS NULL)) LIMIT 1`,
        [order.warehouse_id, line.product_id, line.batch_id]
      );
      if (!stock || stock.qty < line.qty) {
        const { rows: [prod] } = await client.query('SELECT name FROM products WHERE id=$1', [line.product_id]);
        throw new Error(`Недостаточно товара: ${prod?.name || line.product_id} (нужно ${line.qty}, есть ${stock?.qty || 0})`);
      }
      await client.query('UPDATE stock SET qty = qty - $1 WHERE id=$2', [line.qty, stock.id]);
      await client.query(
        `INSERT INTO stock_movements (document_type, document_id, warehouse_id, product_id, batch_id, qty, created_at) VALUES ('sale',$1,$2,$3,$4,$5,COALESCE($6::timestamptz, NOW()))`,
        [orderId, order.warehouse_id, line.product_id, line.batch_id, -line.qty, order.delivery_date||null]
      );
    }
    const { rows: [updated] } = await client.query("UPDATE orders_sale SET status='posted' WHERE id=$1 RETURNING *", [orderId]);
    await client.query('COMMIT');
    res.json(updated);
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally { client.release(); }
});

// ── ПРОВЕДЕНИЕ ПРИХОДНОЙ НАКЛАДНОЙ ───────────────────────────

app.post('/api/orders-purchase/:id/post', async (req, res) => {
  const orderId = parseInt(req.params.id);
  const pool = await getPool(req.companyId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [order] } = await client.query('SELECT * FROM orders_purchase WHERE id=$1', [orderId]);
    if (!order) return res.status(404).json({ error: 'Накладная не найдена' });
    if (order.status === 'posted') return res.status(400).json({ error: 'Накладная уже проведена' });
    const { rows: lines } = await client.query('SELECT * FROM order_purchase_lines WHERE order_id=$1', [orderId]);
    if (!lines.length) return res.status(400).json({ error: 'В накладной нет товаров' });
    for (const line of lines) {
      let batchId = null;
      if (line.grade_id || line.country_id || line.unit_id) {
        const { rows: [batch] } = await client.query(
          `INSERT INTO batches (product_id, unit_id, country_id, grade_id, supplier_id) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [line.product_id, line.unit_id, line.country_id, line.grade_id, order.counterparty_id]
        );
        batchId = batch.id;
      }
      const { rows: [existing] } = await client.query(
        `SELECT id, qty, cost_price FROM stock WHERE warehouse_id=$1 AND product_id=$2 AND (batch_id=$3 OR (batch_id IS NULL AND $3 IS NULL)) LIMIT 1`,
        [order.warehouse_id, line.product_id, batchId]
      );
      if (existing) {
        const newQty = Number(existing.qty) + Number(line.qty);
        const newCost = ((Number(existing.qty) * (Number(existing.cost_price) || 0)) + (Number(line.qty) * Number(line.price))) / newQty;
        await client.query('UPDATE stock SET qty=$1, cost_price=$2 WHERE id=$3', [newQty, newCost, existing.id]);
      } else {
        await client.query(
          `INSERT INTO stock (warehouse_id, product_id, batch_id, unit_id, qty, cost_price) VALUES ($1,$2,$3,$4,$5,$6)`,
          [order.warehouse_id, line.product_id, batchId, line.unit_id, line.qty, line.price]
        );
      }
      await client.query(
        `INSERT INTO stock_movements (document_type, document_id, warehouse_id, product_id, batch_id, qty, cost_price, created_at) VALUES ('purchase',$1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz, NOW()))`,
        [orderId, order.warehouse_id, line.product_id, batchId, line.qty, line.price, order.created_at||null]
      );
    }
    const { rows: [totRow] } = await client.query(
      `SELECT COALESCE(SUM(qty * price), 0) AS total FROM order_purchase_lines WHERE order_id=$1`, [orderId]
    );
    const { rows: [updated] } = await client.query(
      "UPDATE orders_purchase SET status='posted', total_amount=$1 WHERE id=$2 RETURNING *", [totRow.total, orderId]
    );
    await client.query('COMMIT');
    res.json(updated);
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally { client.release(); }
});

// ── DASHBOARD — сводка ────────────────────────────────────────

app.get('/api/dashboard', async (req, res) => {
  try {
    // Период по from/to — оба параметра в формате YYYY-MM-DD.
    // Если не переданы — считаем как «сегодня».
    const fromRaw = req.query.from;
    const toRaw   = req.query.to;
    const isDate  = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
    const from = isDate(fromRaw) ? fromRaw : null;
    const to   = isDate(toRaw)   ? toRaw   : null;

    const dateFilter   = from && to
      ? `created_at::date BETWEEN '${from}'::date AND '${to}'::date`
      : `created_at::date = CURRENT_DATE`;
    const osDateFilter = dateFilter.replace(/^created_at/, 'os.created_at');
    const payDateFilter = from && to
      ? `payment_date BETWEEN '${from}'::date AND '${to}'::date`
      : `payment_date = CURRENT_DATE`;
    const woDateFilter = from && to
      ? `date::date BETWEEN '${from}'::date AND '${to}'::date`
      : `date::date = CURRENT_DATE`;

    const [
      salesPeriod,
      cashSalesPeriod,
      creditSalesPeriod,
      costPeriod,
      purchasesPeriod,
      stockSummary,
      debtors, creditors,
      paymentsPeriod,
      writeOffsPeriod,
      accountBalances,
      commissionSalesCash,
      commissionSalesCredit,
      salesExclCommission,
    ] = await Promise.all([

      // Все продажи за период (включая комиссионные; исключая накладные без строк товара — Начальный долг)
      (await getPool(req.companyId)).query(`
        SELECT COALESCE(SUM(total_amount),0) AS total, COUNT(*) AS cnt
        FROM orders_sale os
        WHERE status='posted' AND ${dateFilter}
          AND EXISTS (SELECT 1 FROM order_sale_lines osl WHERE osl.order_id = os.id)
      `),

      // Наличные продажи за период (включая комиссионные; исключая Начальный долг)
      (await getPool(req.companyId)).query(`
        SELECT COALESCE(SUM(total_amount),0) AS total, COUNT(*) AS cnt
        FROM orders_sale os
        WHERE status='posted' AND payment_type='cash' AND ${dateFilter}
          AND EXISTS (SELECT 1 FROM order_sale_lines osl WHERE osl.order_id = os.id)
      `),

      // Кредитные продажи за период (включая комиссионные; исключая Начальный долг)
      (await getPool(req.companyId)).query(`
        SELECT COALESCE(SUM(total_amount),0) AS total, COUNT(*) AS cnt
        FROM orders_sale os
        WHERE status='posted' AND payment_type='credit' AND ${dateFilter}
          AND EXISTS (SELECT 1 FROM order_sale_lines osl WHERE osl.order_id = os.id)
      `),

      // Себестоимость продаж за период (только обычные, не комиссия; берём cost_price из stock)
      (await getPool(req.companyId)).query(`
        SELECT COALESCE(SUM(osl.qty * COALESCE(s.cost_price,0)),0) AS total
        FROM order_sale_lines osl
        JOIN orders_sale os ON os.id = osl.order_id
        LEFT JOIN stock s ON s.product_id = osl.product_id AND (osl.batch_id IS NULL OR s.batch_id = osl.batch_id)
        WHERE os.status='posted' AND ${osDateFilter}
          AND NOT EXISTS (
            SELECT 1 FROM order_sale_lines osl2
            JOIN order_purchase_lines opl2 ON opl2.batch_id = osl2.batch_id
            WHERE osl2.order_id = os.id AND osl2.batch_id IS NOT NULL
            GROUP BY osl2.order_id
            HAVING COALESCE(SUM(opl2.price * osl2.qty),0) = 0
          )
      `),

      // Закупки за период
      (await getPool(req.companyId)).query(`
        SELECT COALESCE(SUM(total_amount),0) AS total, COUNT(*) AS cnt
        FROM orders_purchase WHERE status='posted' AND ${dateFilter}
      `),

      // Остатки на складе
      (await getPool(req.companyId)).query(`
        SELECT COUNT(*) AS positions,
               COUNT(DISTINCT product_id) AS products,
               COUNT(DISTINCT warehouse_id) AS warehouses,
               COALESCE(SUM(qty * COALESCE(cost_price,0)), 0) AS total_cost
        FROM stock WHERE qty > 0
      `),

      // Дебиторка
      (await getPool(req.companyId)).query(`
        SELECT COUNT(*) AS cnt,
               COALESCE(SUM(COALESCE(s.total,0) - COALESCE(r.total,0) - COALESCE(pi.total,0)), 0) AS amount
        FROM counterparties cp
        LEFT JOIN (SELECT counterparty_id, SUM(total_amount) AS total FROM orders_sale WHERE status='posted' GROUP BY counterparty_id) s ON s.counterparty_id = cp.id
        LEFT JOIN (SELECT counterparty_id, SUM(total_amount) AS total FROM returns WHERE status='posted' GROUP BY counterparty_id) r ON r.counterparty_id = cp.id
        LEFT JOIN (SELECT counterparty_id, SUM(amount) AS total FROM payments WHERE direction='incoming' AND status='posted' GROUP BY counterparty_id) pi ON pi.counterparty_id = cp.id
        WHERE cp.is_active = true AND (COALESCE(s.total,0) - COALESCE(r.total,0) - COALESCE(pi.total,0)) > 0
      `),

      // Кредиторка
      (await getPool(req.companyId)).query(`
        SELECT COUNT(*) AS cnt,
               COALESCE(SUM(COALESCE(p.total,0) + COALESCE(oh.total,0) - COALESCE(po.total,0)), 0) AS amount
        FROM counterparties cp
        LEFT JOIN (SELECT counterparty_id, SUM(total_amount) AS total FROM orders_purchase WHERE status='posted' GROUP BY counterparty_id) p ON p.counterparty_id = cp.id
        LEFT JOIN (SELECT counterparty_id, SUM(amount) AS total FROM overhead_costs WHERE counterparty_id IS NOT NULL GROUP BY counterparty_id) oh ON oh.counterparty_id = cp.id
        LEFT JOIN (SELECT counterparty_id, SUM(amount) AS total FROM payments WHERE direction='outgoing' AND status='posted' GROUP BY counterparty_id) po ON po.counterparty_id = cp.id
        WHERE cp.is_active = true AND (COALESCE(p.total,0) + COALESCE(oh.total,0) - COALESCE(po.total,0)) > 0
      `),

      // Платежи за период
      (await getPool(req.companyId)).query(`
        SELECT
          COALESCE(SUM(CASE WHEN direction='incoming' THEN amount ELSE 0 END), 0) AS incoming,
          COALESCE(SUM(CASE WHEN direction='outgoing' THEN amount ELSE 0 END), 0) AS outgoing
        FROM payments WHERE status='posted' AND ${payDateFilter}
      `),

      // Сумма списаний товаров за период
      (await getPool(req.companyId)).query(`
        SELECT COALESCE(SUM(total_amount),0) AS total, COUNT(*) AS cnt
        FROM write_offs WHERE status='posted' AND ${woDateFilter}
      `),

      // Остаток по каждому счёту/кассе
      (await getPool(req.companyId)).query(`
        SELECT ba.id, ba.name, ba.type,
               cu.code AS currency_code, cu.symbol AS currency_symbol,
               COALESCE(pi.total, 0) - COALESCE(po.total, 0) AS balance
        FROM bank_accounts ba
        LEFT JOIN currencies cu ON cu.id = ba.currency_id
        LEFT JOIN (SELECT bank_account_id, SUM(amount) AS total FROM payments WHERE direction='incoming' AND status='posted' GROUP BY bank_account_id) pi ON pi.bank_account_id = ba.id
        LEFT JOIN (SELECT bank_account_id, SUM(amount) AS total FROM payments WHERE direction='outgoing' AND status='posted' GROUP BY bank_account_id) po ON po.bank_account_id = ba.id
        WHERE ba.is_active = true ORDER BY ba.type, ba.name
      `),

      // Продажи Комиссия — наличные (цена прихода партии = 0)
      (await getPool(req.companyId)).query(`
        SELECT COALESCE(SUM(os.total_amount),0) AS total, COUNT(*) AS cnt
        FROM orders_sale os
        WHERE os.status='posted' AND os.payment_type='cash' AND ${osDateFilter}
          AND EXISTS (
            SELECT 1 FROM order_sale_lines osl
            JOIN order_purchase_lines opl ON opl.batch_id = osl.batch_id
            WHERE osl.order_id = os.id AND osl.batch_id IS NOT NULL
            GROUP BY osl.order_id
            HAVING COALESCE(SUM(opl.price * osl.qty),0) = 0
          )
      `),

      // Продажи Комиссия — кредит (цена прихода партии = 0)
      (await getPool(req.companyId)).query(`
        SELECT COALESCE(SUM(os.total_amount),0) AS total, COUNT(*) AS cnt
        FROM orders_sale os
        WHERE os.status='posted' AND os.payment_type='credit' AND ${osDateFilter}
          AND EXISTS (
            SELECT 1 FROM order_sale_lines osl
            JOIN order_purchase_lines opl ON opl.batch_id = osl.batch_id
            WHERE osl.order_id = os.id AND osl.batch_id IS NOT NULL
            GROUP BY osl.order_id
            HAVING COALESCE(SUM(opl.price * osl.qty),0) = 0
          )
      `),

      // Продажи без комиссии (для расчёта валовой прибыли; исключаем накладные без строк товара — например «Начальный долг»)
      (await getPool(req.companyId)).query(`
        SELECT COALESCE(SUM(os.total_amount),0) AS total
        FROM orders_sale os
        WHERE os.status='posted' AND ${osDateFilter}
          AND EXISTS (SELECT 1 FROM order_sale_lines osl0 WHERE osl0.order_id = os.id)
          AND NOT EXISTS (
            SELECT 1 FROM order_sale_lines osl
            JOIN order_purchase_lines opl ON opl.batch_id = osl.batch_id
            WHERE osl.order_id = os.id AND osl.batch_id IS NOT NULL
            GROUP BY osl.order_id
            HAVING COALESCE(SUM(opl.price * osl.qty),0) = 0
          )
      `),
    ]);

    const accounts  = accountBalances.rows.map(r => ({ ...r, balance: Number(r.balance) }));
    const bankTotal = accounts.filter(a => a.type === 'bank').reduce((s, a) => s + a.balance, 0);
    const cashTotal = accounts.filter(a => a.type === 'cash').reduce((s, a) => s + a.balance, 0);

    res.json({
      sales:            { total: Number(salesPeriod.rows[0].total), cnt: Number(salesPeriod.rows[0].cnt) },
      cash_sales:       { total: Number(cashSalesPeriod.rows[0].total), cnt: Number(cashSalesPeriod.rows[0].cnt) },
      credit_sales:     { total: Number(creditSalesPeriod.rows[0].total), cnt: Number(creditSalesPeriod.rows[0].cnt) },
      cost_total:       Number(costPeriod.rows[0].total),
      sales_excl_commission: Number(salesExclCommission.rows[0].total),
      purchases:        { total: Number(purchasesPeriod.rows[0].total), cnt: Number(purchasesPeriod.rows[0].cnt) },
      stock:            { positions: Number(stockSummary.rows[0].positions), products: Number(stockSummary.rows[0].products), warehouses: Number(stockSummary.rows[0].warehouses), total_cost: Number(stockSummary.rows[0].total_cost) },
      debtors:          { cnt: Number(debtors.rows[0].cnt), amount: Number(debtors.rows[0].amount) },
      creditors:        { cnt: Number(creditors.rows[0].cnt), amount: Number(creditors.rows[0].amount) },
      payments_period:  { incoming: Number(paymentsPeriod.rows[0].incoming), outgoing: Number(paymentsPeriod.rows[0].outgoing) },
      write_offs:       { total: Number(writeOffsPeriod.rows[0].total), cnt: Number(writeOffsPeriod.rows[0].cnt) },
      accounts,
      accounts_summary: { bank_total: bankTotal, cash_total: cashTotal, total: bankTotal + cashTotal },
      commission_sales: {
        cash:   { total: Number(commissionSalesCash.rows[0].total),   cnt: Number(commissionSalesCash.rows[0].cnt) },
        credit: { total: Number(commissionSalesCredit.rows[0].total), cnt: Number(commissionSalesCredit.rows[0].cnt) },
      },
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── СПИСАНИЯ ──────────────────────────────────────────────────

// Список всех списаний
app.get('/api/write-offs', async (req, res) => {
  const { rows } = await (await getPool(req.companyId)).query(`
    SELECT wo.*, w.name AS warehouse_name,
           u.full_name AS created_by_name,
           COALESCE(
             (SELECT SUM(wol.qty * COALESCE(wol.cost_price,0)) FROM write_off_lines wol WHERE wol.write_off_id = wo.id),
             0
           ) AS total_amount,
           COALESCE(
             (SELECT SUM(wol.qty) FROM write_off_lines wol WHERE wol.write_off_id = wo.id),
             0
           ) AS total_qty,
           COALESCE(
             (SELECT COUNT(*) FROM write_off_lines wol WHERE wol.write_off_id = wo.id),
             0
           ) AS lines_count
    FROM write_offs wo
    LEFT JOIN warehouses w ON w.id = wo.warehouse_id
    LEFT JOIN users u ON u.id = wo.created_by
    ORDER BY wo.created_at DESC
  `);
  res.json(rows);
});

// Строки одного списания
app.get('/api/write-offs/:id/lines', async (req, res) => {
  const { rows } = await (await getPool(req.companyId)).query(`
    SELECT wol.*,
           p.name AS product_name, p.sku,
           b.batch_number,
           g.name AS grade_name,
           co.name AS country_name,
           u.short_name AS unit_short
    FROM write_off_lines wol
    JOIN products p ON p.id = wol.product_id
    LEFT JOIN batches b ON b.id = wol.batch_id
    LEFT JOIN grades g ON g.id = b.grade_id
    LEFT JOIN countries co ON co.id = b.country_id
    LEFT JOIN units u ON u.id = b.unit_id
    WHERE wol.write_off_id = $1
    ORDER BY wol.id
  `, [parseInt(req.params.id)]);
  res.json(rows);
});

// Создать списание (сразу проводится)
app.post('/api/write-offs', async (req, res) => {
  const { number, warehouse_id, reason, comment, lines, created_by } = req.body;
  const toInt   = v => { const n = parseInt(v);   return isNaN(n) ? null : n; };
  const toFloat = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
  const pool = await getPool(req.companyId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { date } = req.body;

    // Проверяем дату списания — не раньше прихода товара на склад
    if (date && (lines||[]).length > 0) {
      for (const line of lines) {
        if (!line.batch_id) continue;
        const { rows: [purDate] } = await client.query(`
          SELECT MIN(op.created_at) AS purchase_date
          FROM stock_movements sm
          JOIN orders_purchase op ON op.id=sm.document_id
          WHERE sm.batch_id=$1 AND sm.document_type='purchase'
        `, [toInt(line.batch_id)]);
        if (purDate?.purchase_date && new Date(date) < new Date(purDate.purchase_date)) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: `Дата списания не может быть раньше даты прихода товара (${new Date(purDate.purchase_date).toLocaleDateString('ru-RU')})`
          });
        }
      }
    }

    // Создаём заголовок
    const { rows: [wo] } = await client.query(`
      INSERT INTO write_offs (number, warehouse_id, reason, comment, status, total_amount, created_by, date)
      VALUES ($1, $2, $3, $4, 'posted', 0, $5, $6) RETURNING *
    `, [number, toInt(warehouse_id), reason||'other', comment||null, (toInt(created_by) || auditUserId(req)), date||new Date().toISOString().slice(0,10)]);

    let totalAmount = 0;

    for (const line of (lines||[])) {
      // Берём себестоимость из stock
      const { rows: [stockRow] } = await client.query(`
        SELECT id, qty, cost_price FROM stock
        WHERE warehouse_id=$1 AND product_id=$2
        AND (batch_id=$3 OR ($3 IS NULL AND batch_id IS NULL))
        LIMIT 1
      `, [toInt(warehouse_id), toInt(line.product_id), toInt(line.batch_id)]);

      if (!stockRow) throw new Error(`Товар не найден на складе (product_id=${line.product_id})`);
      if (Number(stockRow.qty) < Number(line.qty)) {
        const { rows: [p] } = await client.query('SELECT name FROM products WHERE id=$1', [toInt(line.product_id)]);
        throw new Error(`Недостаточно товара «${p?.name}»: нужно ${line.qty}, есть ${stockRow.qty}`);
      }

      const costPrice = Number(stockRow.cost_price) || 0;
      const amount    = Number(line.qty) * costPrice;
      totalAmount    += amount;

      // Вставляем строку
      await client.query(`
        INSERT INTO write_off_lines (write_off_id, product_id, batch_id, qty, cost_price, amount)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [wo.id, toInt(line.product_id), toInt(line.batch_id), toFloat(line.qty), costPrice, amount]);

      // Списываем со склада
      await client.query('UPDATE stock SET qty = qty - $1 WHERE id=$2', [line.qty, stockRow.id]);

      // Движение товара
      await client.query(`
        INSERT INTO stock_movements (document_type, document_id, warehouse_id, product_id, batch_id, qty, cost_price, created_at)
        VALUES ('write_off', $1, $2, $3, $4, $5, $6, NOW())
      `, [wo.id, toInt(warehouse_id), toInt(line.product_id), toInt(line.batch_id), -Number(line.qty), costPrice]);
    }

    // Обновляем итог
    const { rows: [result] } = await client.query(
      'UPDATE write_offs SET total_amount=$1 WHERE id=$2 RETURNING *',
      [totalAmount, wo.id]
    );

    const { rows: auditWoLines } = await client.query(`
      SELECT wol.*, p.name AS product_name, b.batch_number
      FROM write_off_lines wol
      LEFT JOIN products p ON p.id=wol.product_id
      LEFT JOIN batches b ON b.id=wol.batch_id
      WHERE wol.write_off_id=$1
    `, [result.id]);
    console.log('write_offs audit: result.id=', result.id, 'lines=', auditWoLines.length);
    await client.query('COMMIT');
    await logAudit(await getPool(req.companyId), auditUserId(req), 'write_offs', result.id, 'INSERT', null, { ...result, lines: auditWoLines });
    res.json(result);
  } catch(e) {
    console.error('write_offs POST error:', e.message);
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally { client.release(); }
});

// Редактировать списание (откат старых строк + проведение новых)
app.put('/api/write-offs/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { number, warehouse_id, reason, comment, lines } = req.body;
  const toInt   = v => { const n = parseInt(v);   return isNaN(n) ? null : n; };
  const toFloat = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
  const pool = await getPool(req.companyId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [wo] } = await client.query('SELECT * FROM write_offs WHERE id=$1', [id]);
    if (!wo) return res.status(404).json({ error: 'Списание не найдено' });

    // 1. Откатываем старые строки — возвращаем товар на склад
    const { rows: oldLines } = await client.query(
      'SELECT * FROM write_off_lines WHERE write_off_id=$1', [id]
    );
    for (const line of oldLines) {
      await client.query(`
        UPDATE stock SET qty = qty + $1
        WHERE warehouse_id=$2 AND product_id=$3
        AND (batch_id=$4 OR ($4 IS NULL AND batch_id IS NULL))
      `, [line.qty, wo.warehouse_id, line.product_id, line.batch_id]);
    }
    await client.query(
      'DELETE FROM stock_movements WHERE document_type=$1 AND document_id=$2',
      ['write_off', id]
    );
    await client.query('DELETE FROM write_off_lines WHERE write_off_id=$1', [id]);

    // 2. Обновляем заголовок
    await client.query(
      'UPDATE write_offs SET number=$1, reason=$2, comment=$3 WHERE id=$4',
      [number, reason || 'other', comment || null, id]
    );

    // 3. Проводим новые строки
    let totalAmount = 0;
    for (const line of (lines || [])) {
      const { rows: [stockRow] } = await client.query(`
        SELECT id, qty, cost_price FROM stock
        WHERE warehouse_id=$1 AND product_id=$2
        AND (batch_id=$3 OR ($3 IS NULL AND batch_id IS NULL))
        LIMIT 1
      `, [toInt(wo.warehouse_id), toInt(line.product_id), toInt(line.batch_id)]);

      if (!stockRow) throw new Error(`Товар не найден на складе (product_id=${line.product_id})`);
      if (Number(stockRow.qty) < Number(line.qty)) {
        const { rows: [p] } = await client.query('SELECT name FROM products WHERE id=$1', [toInt(line.product_id)]);
        throw new Error(`Недостаточно товара «${p?.name}»: нужно ${line.qty}, есть ${stockRow.qty}`);
      }

      const costPrice = Number(stockRow.cost_price) || 0;
      const amount    = Number(line.qty) * costPrice;
      totalAmount    += amount;

      await client.query(`
        INSERT INTO write_off_lines (write_off_id, product_id, batch_id, qty, cost_price, amount)
        VALUES ($1,$2,$3,$4,$5,$6)
      `, [id, toInt(line.product_id), toInt(line.batch_id), toFloat(line.qty), costPrice, amount]);

      await client.query('UPDATE stock SET qty = qty - $1 WHERE id=$2', [line.qty, stockRow.id]);

      await client.query(`
        INSERT INTO stock_movements (document_type, document_id, warehouse_id, product_id, batch_id, qty, cost_price, created_at)
        VALUES ('write_off',$1,$2,$3,$4,$5,$6,NOW())
      `, [id, toInt(wo.warehouse_id), toInt(line.product_id), toInt(line.batch_id), -Number(line.qty), costPrice]);
    }

    const { rows: [result] } = await client.query(
      'UPDATE write_offs SET total_amount=$1 WHERE id=$2 RETURNING *',
      [totalAmount, id]
    );

    // Аудит — читаем новые строки после записи
    const { rows: auditNewLines } = await client.query(`
      SELECT wol.*, p.name AS product_name, b.batch_number
      FROM write_off_lines wol
      LEFT JOIN products p ON p.id=wol.product_id
      LEFT JOIN batches b ON b.id=wol.batch_id
      WHERE wol.write_off_id=$1
    `, [id]);
    // Обогащаем старые строки названиями
    const oldLinesWithNames = await Promise.all(oldLines.map(async l => {
      const { rows: [p] } = await client.query('SELECT name FROM products WHERE id=$1', [l.product_id]);
      const { rows: [b] } = await client.query('SELECT batch_number FROM batches WHERE id=$1', [l.batch_id||0]);
      return { ...l, product_name: p?.name, batch_number: b?.batch_number };
    }));

    await client.query('COMMIT');
    await logAudit(await getPool(req.companyId), auditUserId(req), 'write_offs', id, 'UPDATE',
      { ...wo, lines: oldLinesWithNames },
      { ...result, lines: auditNewLines });
    res.json(result);
  } catch(e) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally { client.release(); }
});

// Удалить списание (откатить остатки)
app.delete('/api/write-offs/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const pool = await getPool(req.companyId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: lines } = await client.query(
      'SELECT * FROM write_off_lines WHERE write_off_id=$1', [id]
    );
    const { rows: [wo] } = await client.query('SELECT * FROM write_offs WHERE id=$1', [id]);
    if (!wo) return res.status(404).json({ error: 'Списание не найдено' });

    // Возвращаем товар на склад
    for (const line of lines) {
      await client.query(`
        UPDATE stock SET qty = qty + $1
        WHERE warehouse_id=$2 AND product_id=$3
        AND (batch_id=$4 OR ($4 IS NULL AND batch_id IS NULL))
      `, [line.qty, wo.warehouse_id, line.product_id, line.batch_id]);
      await client.query(`
        DELETE FROM stock_movements WHERE document_type='write_off' AND document_id=$1
      `, [id]);
    }

    await client.query('DELETE FROM write_off_lines WHERE write_off_id=$1', [id]);
    await client.query('DELETE FROM write_offs WHERE id=$1', [id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch(e) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally { client.release(); }
});

// ── ВОЗВРАТЫ ──────────────────────────────────────────────────

// Список всех возвратов
app.get('/api/returns', async (req, res) => {
  const { order_id } = req.query;
  const where = order_id ? `WHERE r.order_id = ${parseInt(order_id)}` : '';
  const { rows } = await (await getPool(req.companyId)).query(`
    SELECT r.*,
           cp.name AS counterparty_name,
           w.name  AS warehouse_name,
           os.number AS sale_number,
           u.full_name AS created_by_name,
           COALESCE(
             (SELECT SUM(rl.qty * rl.price) FROM return_lines rl WHERE rl.return_id = r.id), 0
           ) AS total_amount,
           COALESCE(
             (SELECT COUNT(*) FROM return_lines rl WHERE rl.return_id = r.id), 0
           ) AS lines_count
    FROM returns r
    LEFT JOIN counterparties cp ON cp.id = r.counterparty_id
    LEFT JOIN warehouses w      ON w.id  = r.warehouse_id
    LEFT JOIN orders_sale os    ON os.id = r.order_id
    LEFT JOIN users u           ON u.id  = r.created_by
    ${where}
    ORDER BY r.created_at DESC
  `);
  res.json(rows);
});

// Строки одного возврата
app.get('/api/returns/:id/lines', async (req, res) => {
  const { rows } = await (await getPool(req.companyId)).query(`
    SELECT rl.*,
           p.name AS product_name, p.sku,
           b.batch_number,
           g.name AS grade_name,
           co.name AS country_name,
           u.short_name AS unit_short
    FROM return_lines rl
    JOIN products p ON p.id = rl.product_id
    LEFT JOIN batches b  ON b.id = rl.batch_id
    LEFT JOIN grades g   ON g.id = b.grade_id
    LEFT JOIN countries co ON co.id = b.country_id
    LEFT JOIN units u    ON u.id = b.unit_id
    WHERE rl.return_id = $1
    ORDER BY rl.id
  `, [parseInt(req.params.id)]);
  res.json(rows);
});

// Строки расходной накладной для подстановки в возврат
app.get('/api/orders-sale/:id/lines-for-return', async (req, res) => {
  const { rows } = await (await getPool(req.companyId)).query(`
    SELECT osl.product_id, osl.batch_id, osl.qty, osl.price,
           p.name AS product_name,
           b.batch_number,
           g.name AS grade_name,
           co.name AS country_name,
           u.short_name AS unit_short
    FROM order_sale_lines osl
    JOIN products p ON p.id = osl.product_id
    LEFT JOIN batches b  ON b.id = osl.batch_id
    LEFT JOIN grades g   ON g.id = b.grade_id
    LEFT JOIN countries co ON co.id = b.country_id
    LEFT JOIN units u    ON u.id = b.unit_id
    WHERE osl.order_id = $1
  `, [parseInt(req.params.id)]);
  res.json(rows);
});

// Создать возврат (сразу проводится)
app.post('/api/returns', async (req, res) => {
  const { number, order_id, counterparty_id, warehouse_id, reason, lines, created_by, date } = req.body;
  const toInt   = v => { const n = parseInt(v);   return isNaN(n) ? null : n; };
  const toFloat = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
  const pool = await getPool(req.companyId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Проверяем дату возврата — не раньше даты исходной накладной
    if (date && order_id) {
      const { rows: [origOrder] } = await client.query(
        'SELECT created_at FROM orders_sale WHERE id=$1', [toInt(order_id)]
      );
      if (origOrder && new Date(date) < new Date(new Date(origOrder.created_at).toISOString().slice(0,10))) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Дата возврата не может быть раньше даты накладной продажи (${new Date(origOrder.created_at).toLocaleDateString('ru-RU')})`
        });
      }
    }

    // Создаём заголовок
    const { rows: [ret] } = await client.query(`
      INSERT INTO returns (number, order_id, counterparty_id, warehouse_id, reason, status, total_amount, created_by, date)
      VALUES ($1, $2, $3, $4, $5, 'posted', 0, $6, $7) RETURNING *
    `, [number, toInt(order_id), toInt(counterparty_id), toInt(warehouse_id), reason||null, (toInt(created_by) || auditUserId(req)), date||new Date().toISOString().slice(0,10)]);

    let totalAmount = 0;

    for (const line of (lines || [])) {
      const qty   = toFloat(line.qty);
      const price = toFloat(line.price);
      const amount = qty * price;
      totalAmount += amount;

      // Вставляем строку
      await client.query(`
        INSERT INTO return_lines (return_id, product_id, batch_id, qty, price)
        VALUES ($1, $2, $3, $4, $5)
      `, [ret.id, toInt(line.product_id), toInt(line.batch_id), qty, price]);

      // Возвращаем товар на склад
      const { rows: [stockRow] } = await client.query(`
        SELECT id FROM stock
        WHERE warehouse_id=$1 AND product_id=$2
        AND (batch_id=$3 OR ($3 IS NULL AND batch_id IS NULL))
        LIMIT 1
      `, [toInt(warehouse_id), toInt(line.product_id), toInt(line.batch_id)]);

      if (stockRow) {
        await client.query('UPDATE stock SET qty = qty + $1 WHERE id=$2', [qty, stockRow.id]);
      } else {
        await client.query(`
          INSERT INTO stock (warehouse_id, product_id, batch_id, qty, cost_price)
          VALUES ($1, $2, $3, $4, $5)
        `, [toInt(warehouse_id), toInt(line.product_id), toInt(line.batch_id), qty, price]);
      }

      // Движение товара
      await client.query(`
        INSERT INTO stock_movements (document_type, document_id, warehouse_id, product_id, batch_id, qty, cost_price, created_at)
        VALUES ('return', $1, $2, $3, $4, $5, $6, NOW())
      `, [ret.id, toInt(warehouse_id), toInt(line.product_id), toInt(line.batch_id), qty, price]);
    }

    // Обновляем итог
    await client.query('UPDATE returns SET total_amount=$1 WHERE id=$2', [totalAmount, ret.id]);

    // Автоматический исходящий платёж из кассы если исходная накладная была наличной
    if (toInt(order_id)) {
      const { rows: [origOrder] } = await client.query(
        'SELECT payment_type, cash_account_id, number FROM orders_sale WHERE id=$1', [toInt(order_id)]
      );
      if (origOrder?.payment_type === 'cash' && origOrder?.cash_account_id) {
        const { rows: [lastPay] } = await client.query(
          "SELECT number FROM payments ORDER BY id DESC LIMIT 1"
        );
        const lastNum = parseInt((lastPay?.number || '').replace(/\D/g, '')) || 0;
        const nextPayNum = 'П-' + String(lastNum + 1).padStart(4, '0');

        await client.query(`
          INSERT INTO payments
            (number, direction, bank_account_id, counterparty_id,
             currency_id, amount, amount_base,
             payment_date, purpose, status, created_by, return_id)
          VALUES ($1,'outgoing',$2,$3,
            (SELECT currency_id FROM orders_sale WHERE id=$4),
            $5,$5, now(),$6,'posted',$7,$8)
        `, [
          nextPayNum,
          origOrder.cash_account_id,
          toInt(counterparty_id),
          toInt(order_id),
          totalAmount,
          `Возврат по накладной ${origOrder.number} (${number})`,
          toInt(created_by) || auditUserId(req),
          ret.id,
        ]);
      }
    }

    const { rows: auditRetLines } = await client.query('SELECT * FROM return_lines WHERE return_id=$1', [ret.id]);
    await client.query('COMMIT');
    await logAudit(await getPool(req.companyId), auditUserId(req), 'returns', ret.id, 'INSERT', null, { ...ret, total_amount: totalAmount, lines: auditRetLines });
    res.json({ ...ret, total_amount: totalAmount });
  } catch(e) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally { client.release(); }
});

// Удалить возврат (откатить остатки)
app.delete('/api/returns/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const pool = await getPool(req.companyId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [ret] } = await client.query('SELECT * FROM returns WHERE id=$1', [id]);
    if (!ret) return res.status(404).json({ error: 'Возврат не найден' });
    const { rows: lines } = await client.query('SELECT * FROM return_lines WHERE return_id=$1', [id]);

    // Снимаем товар со склада обратно
    for (const line of lines) {
      await client.query(`
        UPDATE stock SET qty = qty - $1
        WHERE warehouse_id=$2 AND product_id=$3
        AND (batch_id=$4 OR ($4 IS NULL AND batch_id IS NULL))
      `, [line.qty, ret.warehouse_id, line.product_id, line.batch_id]);
    }
    await client.query('DELETE FROM stock_movements WHERE document_type=$1 AND document_id=$2', ['return', id]);
    await client.query('DELETE FROM return_lines WHERE return_id=$1', [id]);

    // Откатываем автоматический платёж из кассы если он был
    await client.query(
      'DELETE FROM payment_allocations WHERE payment_id IN (SELECT id FROM payments WHERE return_id=$1)',
      [id]
    );
    await client.query('DELETE FROM payments WHERE return_id=$1', [id]);

    await client.query('DELETE FROM returns WHERE id=$1', [id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch(e) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally { client.release(); }
});

// ── ПЕРЕМЕЩЕНИЯ ───────────────────────────────────────────────

app.get('/api/transfers', async (req, res) => {
  const { rows } = await (await getPool(req.companyId)).query(`
    SELECT t.*,
           fw.name AS from_warehouse_name,
           tw.name AS to_warehouse_name,
           u.full_name AS created_by_name,
           COALESCE((SELECT COUNT(*) FROM transfer_lines tl WHERE tl.transfer_id = t.id), 0) AS lines_count,
           COALESCE((SELECT SUM(tl.qty * COALESCE(tl.cost_price,0)) FROM transfer_lines tl WHERE tl.transfer_id = t.id), 0) AS total_amount
    FROM transfers t
    LEFT JOIN warehouses fw ON fw.id = t.from_warehouse_id
    LEFT JOIN warehouses tw ON tw.id = t.to_warehouse_id
    LEFT JOIN users u ON u.id = t.created_by
    ORDER BY t.created_at DESC
  `);
  res.json(rows);
});

app.get('/api/transfers/:id/lines', async (req, res) => {
  const { rows } = await (await getPool(req.companyId)).query(`
    SELECT tl.*,
           p.name AS product_name,
           b.batch_number,
           g.name AS grade_name,
           u.short_name AS unit_short
    FROM transfer_lines tl
    JOIN products p ON p.id = tl.product_id
    LEFT JOIN batches b ON b.id = tl.batch_id
    LEFT JOIN grades g  ON g.id = b.grade_id
    LEFT JOIN units u   ON u.id = b.unit_id
    WHERE tl.transfer_id = $1
    ORDER BY tl.id
  `, [parseInt(req.params.id)]);
  res.json(rows);
});

app.post('/api/transfers', async (req, res) => {
  const { number, from_warehouse_id, to_warehouse_id, comment, lines, created_by } = req.body;
  const toInt   = v => { const n = parseInt(v);   return isNaN(n) ? null : n; };
  const toFloat = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
  const pool = await getPool(req.companyId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (toInt(from_warehouse_id) === toInt(to_warehouse_id))
      throw new Error('Склад-источник и склад-назначение не могут совпадать');

    const { rows: [tr] } = await client.query(`
      INSERT INTO transfers (number, from_warehouse_id, to_warehouse_id, comment, status, total_amount, created_by)
      VALUES ($1,$2,$3,$4,'posted',0,$5) RETURNING *
    `, [number, toInt(from_warehouse_id), toInt(to_warehouse_id), comment||null, toInt(created_by) || auditUserId(req)]);

    let totalAmount = 0;

    for (const line of (lines || [])) {
      const qty = toFloat(line.qty);

      // Берём себестоимость из stock на складе-источнике
      const { rows: [stockRow] } = await client.query(`
        SELECT id, qty AS available, cost_price FROM stock
        WHERE warehouse_id=$1 AND product_id=$2
        AND (batch_id=$3 OR ($3 IS NULL AND batch_id IS NULL))
        LIMIT 1
      `, [toInt(from_warehouse_id), toInt(line.product_id), toInt(line.batch_id)]);

      if (!stockRow) throw new Error(`Товар не найден на складе-источнике (product_id=${line.product_id})`);
      if (Number(stockRow.available) < qty) {
        const { rows: [p] } = await client.query('SELECT name FROM products WHERE id=$1', [toInt(line.product_id)]);
        throw new Error(`Недостаточно товара «${p?.name}»: нужно ${qty}, есть ${stockRow.available}`);
      }

      const costPrice = Number(stockRow.cost_price) || 0;
      totalAmount += qty * costPrice;

      // Вставляем строку
      await client.query(`
        INSERT INTO transfer_lines (transfer_id, product_id, batch_id, qty, cost_price)
        VALUES ($1,$2,$3,$4,$5)
      `, [tr.id, toInt(line.product_id), toInt(line.batch_id), qty, costPrice]);

      // Списываем со склада-источника
      await client.query('UPDATE stock SET qty = qty - $1 WHERE id=$2', [qty, stockRow.id]);
      await client.query(`
        INSERT INTO stock_movements (document_type, document_id, warehouse_id, product_id, batch_id, qty, cost_price, created_at)
        VALUES ('transfer',$1,$2,$3,$4,$5,$6,NOW())
      `, [tr.id, toInt(from_warehouse_id), toInt(line.product_id), toInt(line.batch_id), -qty, costPrice]);

      // Добавляем на склад-назначение (та же партия, та же себестоимость)
      const { rows: [destRow] } = await client.query(`
        SELECT id, qty AS available, cost_price FROM stock
        WHERE warehouse_id=$1 AND product_id=$2
        AND (batch_id=$3 OR ($3 IS NULL AND batch_id IS NULL))
        LIMIT 1
      `, [toInt(to_warehouse_id), toInt(line.product_id), toInt(line.batch_id)]);

      if (destRow) {
        // Пересчитываем среднюю себестоимость
        const newQty  = Number(destRow.available) + qty;
        const newCost = (Number(destRow.available) * Number(destRow.cost_price||0) + qty * costPrice) / newQty;
        await client.query('UPDATE stock SET qty=$1, cost_price=$2 WHERE id=$3', [newQty, newCost, destRow.id]);
      } else {
        await client.query(`
          INSERT INTO stock (warehouse_id, product_id, batch_id, qty, cost_price)
          VALUES ($1,$2,$3,$4,$5)
        `, [toInt(to_warehouse_id), toInt(line.product_id), toInt(line.batch_id), qty, costPrice]);
      }
      await client.query(`
        INSERT INTO stock_movements (document_type, document_id, warehouse_id, product_id, batch_id, qty, cost_price, created_at)
        VALUES ('transfer',$1,$2,$3,$4,$5,$6,NOW())
      `, [tr.id, toInt(to_warehouse_id), toInt(line.product_id), toInt(line.batch_id), qty, costPrice]);
    }

    await client.query('UPDATE transfers SET total_amount=$1 WHERE id=$2', [totalAmount, tr.id]);
    const { rows: auditTrLines } = await client.query('SELECT * FROM transfer_lines WHERE transfer_id=$1', [tr.id]);
    await client.query('COMMIT');
    await logAudit(await getPool(req.companyId), auditUserId(req), 'transfers', tr.id, 'INSERT', null, { ...tr, lines: auditTrLines });
    res.json({ ...tr, total_amount: totalAmount });
  } catch(e) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally { client.release(); }
});

app.delete('/api/transfers/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const pool = await getPool(req.companyId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [tr] } = await client.query('SELECT * FROM transfers WHERE id=$1', [id]);
    if (!tr) return res.status(404).json({ error: 'Перемещение не найдено' });
    const { rows: lines } = await client.query('SELECT * FROM transfer_lines WHERE transfer_id=$1', [id]);

    // Проверяем: были ли движения на складе-назначения по этим партиям после перемещения
    for (const line of lines) {
      const { rows: movements } = await client.query(`
        SELECT COUNT(*) AS cnt FROM stock_movements
        WHERE warehouse_id = $1
          AND product_id = $2
          AND (batch_id = $3 OR ($3 IS NULL AND batch_id IS NULL))
          AND document_type IN ('sale', 'write_off', 'transfer')
          AND document_id != $4
          AND created_at > $5
      `, [tr.to_warehouse_id, line.product_id, line.batch_id, id, tr.created_at]);
      if (parseInt(movements[0].cnt) > 0) {
        await client.query('ROLLBACK');
        const { rows: [p] } = await client.query('SELECT name FROM products WHERE id=$1', [line.product_id]);
        return res.status(400).json({
          error: `Нельзя удалить перемещение: по товару «${p?.name}» на складе-назначении уже были продажи или списания`
        });
      }
    }

    for (const line of lines) {
      // Возвращаем на склад-источник
      await client.query(`
        UPDATE stock SET qty = qty + $1
        WHERE warehouse_id=$2 AND product_id=$3
        AND (batch_id=$4 OR ($4 IS NULL AND batch_id IS NULL))
      `, [line.qty, tr.from_warehouse_id, line.product_id, line.batch_id]);
      // Снимаем со склада-назначения
      await client.query(`
        UPDATE stock SET qty = qty - $1
        WHERE warehouse_id=$2 AND product_id=$3
        AND (batch_id=$4 OR ($4 IS NULL AND batch_id IS NULL))
      `, [line.qty, tr.to_warehouse_id, line.product_id, line.batch_id]);
    }
    await client.query('DELETE FROM stock_movements WHERE document_type=$1 AND document_id=$2', ['transfer', id]);
    await client.query('DELETE FROM transfer_lines WHERE transfer_id=$1', [id]);
    await client.query('DELETE FROM transfers WHERE id=$1', [id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch(e) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally { client.release(); }
});

// ── СПИСАНИЕ ДОЛГОВ ───────────────────────────────────────────

// Получить список
app.get('/api/debt-writeoffs', async (req, res) => {
  try {
    const { rows } = await (await getPool(req.companyId)).query(`
      SELECT dw.*, cp.name AS counterparty_name, cu.code AS currency_code
      FROM debt_writeoffs dw
      LEFT JOIN counterparties cp ON cp.id = dw.counterparty_id
      LEFT JOIN currencies cu ON cu.id = dw.currency_id
      ORDER BY dw.date DESC, dw.id DESC
    `);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Создать документ списания долга
app.post('/api/debt-writeoffs', async (req, res) => {
  const { date, counterparty_id, amount, currency_id, note, created_by } = req.body;
  try {
    const pool = await getPool(req.companyId);
    // Генерируем номер ДС-N (сброс каждый год)
    const year = new Date().getFullYear();
    const { rows: [last] } = await pool.query(
      `SELECT number FROM debt_writeoffs WHERE EXTRACT(YEAR FROM created_at) = $1 ORDER BY id DESC LIMIT 1`, [year]
    );
    let nextN = 1;
    if (last) {
      const m = last.number.match(/(\d+)$/);
      if (m) nextN = parseInt(m[1]) + 1;
    }
    const number = `ДС-${nextN}`;
    const { rows: [row] } = await pool.query(`
      INSERT INTO debt_writeoffs (number, date, counterparty_id, amount, currency_id, note, created_by, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING *,
        (SELECT name FROM counterparties WHERE id=$3) AS counterparty_name,
        (SELECT code FROM currencies WHERE id=$5) AS currency_code
    `, [number, date||new Date().toISOString().slice(0,10), counterparty_id, amount, currency_id||null, note||null, created_by || auditUserId(req)]);
    res.json(row);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Удалить документ списания долга
app.delete('/api/debt-writeoffs/:id', async (req, res) => {
  try {
    await (await getPool(req.companyId)).query('DELETE FROM debt_writeoffs WHERE id=$1', [parseInt(req.params.id)]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── ЗАПУСК ────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;

// ─── КУРСЫ ВАЛЮТ ──────────────────────────────────────────────────────────────

// Загрузка курсов с ЦБ РФ
async function loadCBRRates() {
  try {
    const https = require('https');
    const today = new Date();
    const dd = String(today.getDate()).padStart(2,'0');
    const mm = String(today.getMonth()+1).padStart(2,'0');
    const yyyy = today.getFullYear();
    const url = `https://www.cbr.ru/scripts/XML_daily.asp?date_req=${dd}/${mm}/${yyyy}`;

    const xml = await new Promise((resolve, reject) => {
      https.get(url, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
        res.on('error', reject);
      }).on('error', reject);
    });

    // Загружаем курсы для всех активных компаний
    const companies = await activeCompanies();

    for (const company of companies) {
      try {
        const pool = await getPool(company.id);
        const { rows: currencies } = await pool.query("SELECT id, code FROM currencies WHERE code != 'RUB'");

        for (const cur of currencies) {
          const regex = new RegExp(`<CharCode>${cur.code}</CharCode>[^<]*<Nominal>(\\d+)</Nominal>[^<]*<Value>([\\d,]+)</Value>`);
          const match = xml.match(regex);
          if (match) {
            const nominal = parseInt(match[1]);
            const rate = parseFloat(match[2].replace(',', '.')) / nominal;
            const rateDate = `${yyyy}-${mm}-${dd}`;

            await pool.query(`
              INSERT INTO currency_rates (currency_id, rate_date, rate, source)
              VALUES ($1, $2, $3, 'cbr')
              ON CONFLICT (currency_id, rate_date) DO UPDATE
              SET rate = EXCLUDED.rate, source =
                CASE WHEN currency_rates.source = 'manual' THEN 'manual' ELSE 'cbr' END
            `, [cur.id, rateDate, rate]);

            console.log('CBR rate loaded: company=' + company.id + ' ' + cur.code + ' = ' + rate + ' on ' + rateDate);
          }
        }
      } catch(e) {
        console.error('CBR rate error for company ' + company.id + ':', e.message);
      }
    }
  } catch(e) {
    console.error('CBR rate load error:', e.message);
  }
}
setInterval(loadCBRRates, 24 * 60 * 60 * 1000);

// GET /api/currency-rates — список курсов
app.get('/api/currency-rates', async (req, res) => {
  try {
    const { rows } = await (await getPool(req.companyId)).query(`
      SELECT cr.id, cr.currency_id, c.code AS currency_code, c.name AS currency_name,
             cr.rate_date, cr.rate, cr.source
      FROM currency_rates cr
      JOIN currencies c ON c.id = cr.currency_id
      ORDER BY cr.rate_date DESC, c.code
      LIMIT 500
    `);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/currency-rates — ручной ввод курса
app.post('/api/currency-rates', async (req, res) => {
  const { currency_id, rate_date, rate } = req.body;
  try {
    const { rows: [row] } = await (await getPool(req.companyId)).query(`
      INSERT INTO currency_rates (currency_id, rate_date, rate, source)
      VALUES ($1, $2, $3, 'manual')
      ON CONFLICT (currency_id, rate_date) DO UPDATE
      SET rate = EXCLUDED.rate, source = 'manual'
      RETURNING *
    `, [toInt(currency_id), rate_date, parseFloat(rate)]);
    res.json(row);
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// DELETE /api/currency-rates/:id — удалить курс
app.delete('/api/currency-rates/:id', async (req, res) => {
  try {
    await (await getPool(req.companyId)).query('DELETE FROM currency_rates WHERE id=$1', [parseInt(req.params.id)]);
    res.json({ ok: true });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/currency-rates/:id', async (req, res) => {
  try {
    const { currency_id, rate_date, rate } = req.body;
    const { rows } = await (await getPool(req.companyId)).query(
      `UPDATE currency_rates SET currency_id=$1, rate_date=$2, rate=$3 WHERE id=$4 RETURNING *`,
      [parseInt(currency_id), rate_date, parseFloat(rate), parseInt(req.params.id)]
    );
    res.json(rows[0]);
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// GET /api/currency-rate/:currencyId/:date — курс на дату (ближайший предыдущий)
app.get('/api/currency-rate/:currencyId/:date', async (req, res) => {
  try {
    const { currencyId, date } = req.params;
    if (parseInt(currencyId) === 1) return res.json({ rate: 1 }); // RUB
    const { rows: [row] } = await (await getPool(req.companyId)).query(`
      SELECT rate FROM currency_rates
      WHERE currency_id = $1 AND rate_date <= $2
      ORDER BY rate_date DESC LIMIT 1
    `, [toInt(currencyId), date]);
    res.json({ rate: row ? parseFloat(row.rate) : null });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── КАРТОЧКА КОНТРАГЕНТА (с детализацией товаров) ────────────
app.get('/api/counterparties/:id/card', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { date_from, date_to } = req.query;

    // Получаем валюту и курс контрагента на уровне эндпоинта
    const { rows:[cpRow] } = await (await getPool(req.companyId)).query(`
      SELECT cp.currency_id,
        COALESCE((SELECT cr.rate FROM currency_rates cr WHERE cr.currency_id=cp.currency_id ORDER BY cr.rate_date DESC LIMIT 1), 1) AS cur_rate
      FROM counterparties cp WHERE cp.id=$1
    `, [id]);
    const cpCurId = cpRow?.currency_id || 1;
    const cpRate  = Number(cpRow?.cur_rate) || 1;

    const dateFilter = (col) => {
      const conds = [];
      if (date_from) conds.push(`AND ${col}::date >= '${date_from}'`);
      if (date_to)   conds.push(`AND ${col}::date <= '${date_to}'`);
      return conds.join(' ');
    };

    // Баланс на дату в валюте контрагента
    const getBalance = async (beforeDate, toDate) => {
      const conds = [];
      if (beforeDate) conds.push(`AND op_date::date < '${beforeDate}'`);
      if (toDate)     conds.push(`AND op_date::date <= '${toDate}'`);
      const where = conds.join(' ');

      const { rows:[b] } = await (await getPool(req.companyId)).query(`
        WITH ops AS (
          SELECT COALESCE(delivery_date::timestamptz, created_at) AS op_date, total_amount AS amt_rub, currency_id, COALESCE(currency_rate,1) AS rate, 'sale' AS t
          FROM orders_sale WHERE counterparty_id=$1 AND status='posted'
          UNION ALL
          SELECT created_at, total_amount, currency_id, COALESCE(currency_rate,1), 'purchase'
          FROM orders_purchase WHERE counterparty_id=$1 AND status='posted'
          UNION ALL
          SELECT payment_date, COALESCE(amount_base,amount), currency_id, COALESCE(currency_rate,1),
            CASE WHEN direction='incoming' THEN 'pay_in' ELSE 'pay_out' END
          FROM payments WHERE counterparty_id=$1 AND status='posted'
          UNION ALL
          SELECT created_at, total_amount, NULL, 1, 'return'
          FROM returns WHERE counterparty_id=$1 AND status='posted'
          UNION ALL
          SELECT op.created_at, oc.amount/COALESCE(oc.currency_rate,1), $2, 1, 'overhead'
          FROM overhead_costs oc JOIN orders_purchase op ON op.id=oc.document_id AND oc.document_type='purchase'
          WHERE oc.counterparty_id=$1
          UNION ALL
          SELECT created_at, amount, NULL, 1, 'debt_writeoff'
          FROM debt_writeoffs WHERE counterparty_id=$1
        )
        SELECT
          COALESCE(SUM(CASE WHEN t IN ('sale','pay_out') THEN
            CASE WHEN $2=1 THEN amt_rub
                 WHEN currency_id=$2 THEN amt_rub
                 ELSE amt_rub/$3 END
          ELSE 0 END),0)
          -COALESCE(SUM(CASE WHEN t IN ('purchase','pay_in','return','overhead','debt_writeoff') THEN
            CASE WHEN $2=1 THEN amt_rub
                 WHEN currency_id=$2 THEN amt_rub
                 ELSE amt_rub/$3 END
          ELSE 0 END),0) AS balance
        FROM ops WHERE 1=1 ${where}
      `, [id, cpCurId, cpRate]);
      return Number(b.balance)||0;
    };

    const balanceOpen  = date_from ? await getBalance(date_from, null) : null;
    const balanceClose = date_to   ? await getBalance(null, date_to)   : null;

    // Продажи с товарами
    const { rows: sales } = await (await getPool(req.companyId)).query(`
      SELECT os.id, os.number, os.created_at AS date, os.total_amount, os.payment_type,
             os.note, os.status, w.name AS warehouse_name,
             json_agg(json_build_object(
               'product_name', p.name,
               'batch_number', b.batch_number,
               'grade_name',   g.name,
               'country_name', co.name,
               'unit_short',   u.short_name,
               'qty',          osl.qty,
               'price',        osl.price,
               'amount',       osl.qty * osl.price
             ) ORDER BY osl.id) AS lines
      FROM orders_sale os
      LEFT JOIN order_sale_lines osl ON osl.order_id = os.id
      LEFT JOIN products p  ON p.id  = osl.product_id
      LEFT JOIN batches b   ON b.id  = osl.batch_id
      LEFT JOIN grades g    ON g.id  = b.grade_id
      LEFT JOIN countries co ON co.id = b.country_id
      LEFT JOIN units u     ON u.id  = b.unit_id
      LEFT JOIN warehouses w ON w.id = os.warehouse_id
      WHERE os.counterparty_id = $1 AND os.status = 'posted' ${dateFilter('os.created_at')}
      GROUP BY os.id, os.number, os.created_at, os.total_amount, os.payment_type, os.note, os.status, w.name
      ORDER BY os.created_at DESC
    `, [id]);

    // Закупки с товарами
    const { rows: purchases } = await (await getPool(req.companyId)).query(`
      SELECT op.id, op.number, op.created_at AS date, op.total_amount,
             op.note, op.status, w.name AS warehouse_name,
             json_agg(json_build_object(
               'product_name', p.name,
               'batch_number', b.batch_number,
               'grade_name',   g.name,
               'country_name', co.name,
               'unit_short',   u.short_name,
               'qty',          opl.qty,
               'price',        opl.price,
               'amount',       opl.qty * opl.price
             ) ORDER BY opl.id) AS lines
      FROM orders_purchase op
      LEFT JOIN order_purchase_lines opl ON opl.order_id = op.id
      LEFT JOIN products p   ON p.id  = opl.product_id
      LEFT JOIN batches b    ON b.id  = opl.batch_id
      LEFT JOIN grades g     ON g.id  = b.grade_id
      LEFT JOIN countries co ON co.id = b.country_id
      LEFT JOIN units u      ON u.id  = b.unit_id
      LEFT JOIN warehouses w ON w.id  = op.warehouse_id
      WHERE op.counterparty_id = $1 AND op.status = 'posted' ${dateFilter('op.created_at')}
      GROUP BY op.id, op.number, op.created_at, op.total_amount, op.note, op.status, w.name
      ORDER BY op.created_at DESC
    `, [id]);

    // Платежи
    const { rows: payments } = await (await getPool(req.companyId)).query(`
      SELECT py.id, py.number, py.payment_date AS date, py.amount, py.amount_base,
             py.currency_id, py.currency_rate, py.direction,
             py.note, fa.name AS article_name, ba.name AS account_name
      FROM payments py
      LEFT JOIN finance_articles fa ON fa.id = py.article_id
      LEFT JOIN bank_accounts ba    ON ba.id = py.bank_account_id
      WHERE py.counterparty_id = $1 AND py.status = 'posted' ${dateFilter('py.payment_date')}
      ORDER BY py.payment_date DESC
    `, [id]);

    // Возвраты с товарами
    const { rows: returns } = await (await getPool(req.companyId)).query(`
      SELECT r.id, r.number, r.date, r.total_amount, r.reason,
             os.number AS order_number, w.name AS warehouse_name,
             json_agg(json_build_object(
               'product_name', p.name,
               'batch_number', b.batch_number,
               'grade_name',   g.name,
               'country_name', co.name,
               'unit_short',   u.short_name,
               'qty',          rl.qty,
               'price',        rl.price,
               'amount',       rl.qty * rl.price
             ) ORDER BY rl.id) AS lines
      FROM returns r
      JOIN return_lines rl ON rl.return_id = r.id
      LEFT JOIN orders_sale os ON os.id = r.order_id
      LEFT JOIN products p   ON p.id  = rl.product_id
      LEFT JOIN batches b    ON b.id  = rl.batch_id
      LEFT JOIN grades g     ON g.id  = b.grade_id
      LEFT JOIN countries co ON co.id = b.country_id
      LEFT JOIN units u      ON u.id  = b.unit_id
      LEFT JOIN warehouses w ON w.id  = r.warehouse_id
      WHERE r.counterparty_id = $1 AND r.status = 'posted' ${dateFilter('r.date')}
      GROUP BY r.id, r.number, r.date, r.total_amount, r.reason, os.number, w.name
      ORDER BY r.date DESC
    `, [id]);

    // Накладные расходы
    const { rows: overheads } = await (await getPool(req.companyId)).query(`
      SELECT oc.id, oc.amount, oc.currency_id, oc.currency_rate,
             oc.document_type, oc.document_id,
             fa.name AS article_name,
             COALESCE(op.created_at, NOW()) AS date,
             op.number AS doc_number
      FROM overhead_costs oc
      LEFT JOIN finance_articles fa ON fa.id = oc.article_id
      LEFT JOIN orders_purchase op ON op.id = oc.document_id AND oc.document_type = 'purchase'
      WHERE oc.counterparty_id = $1 ${dateFilter('op.created_at')}
      ORDER BY op.created_at DESC
    `, [id]);

    // Списания долгов
    const { rows: debtWriteoffs } = await (await getPool(req.companyId)).query(`
      SELECT dw.id, dw.number, dw.date, dw.amount, dw.currency_id, dw.note
      FROM debt_writeoffs dw
      WHERE dw.counterparty_id = $1 ${dateFilter('dw.date')}
      ORDER BY dw.date DESC
    `, [id]);

    res.json({
      sales:          sales.map(r => ({ ...r, total_amount: Number(r.total_amount) })),
      purchases:      purchases.map(r => ({ ...r, total_amount: Number(r.total_amount) })),
      payments:       payments.map(r => ({ ...r, amount: Number(r.amount), amount_base: Number(r.amount_base)||0, currency_id: Number(r.currency_id)||1, currency_rate: Number(r.currency_rate)||1 })),
      returns:        returns.map(r => ({ ...r, total_amount: Number(r.total_amount) })),
      overheads:      overheads.map(r => ({ ...r, amount: Number(r.amount), currency_rate: Number(r.currency_rate)||1 })),
      debt_writeoffs: debtWriteoffs.map(r => ({ ...r, amount: Number(r.amount) })),
      balance_open:   balanceOpen,
      balance_close:  balanceClose,
      cp_rate:        cpRate,
      cp_currency_id: cpCurId,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── НАЧАЛЬНЫЕ ОСТАТКИ ─────────────────────────────────────────
// История начальных остатков
app.get('/api/opening-balances/history', async (req, res) => {
  try {
    const { rows: finRows } = await (await getPool(req.companyId)).query(`
      SELECT p.id AS record_id, p.payment_date AS date, 'finance' AS type,
             cp.name AS name, p.direction, p.amount,
             c.code AS currency_code, p.note, NULL AS qty, NULL AS unit_short
      FROM payments p
      LEFT JOIN counterparties cp ON cp.id = p.counterparty_id
      LEFT JOIN currencies c ON c.id = p.currency_id
      WHERE p.number LIKE 'НО-%'
      ORDER BY p.payment_date DESC
    `);
    const { rows: stockRows } = await (await getPool(req.companyId)).query(`
      SELECT sm.id AS record_id, sm.created_at AS date, 'stock' AS type,
             pr.name AS name, NULL AS direction, NULL AS amount,
             NULL AS currency_code, NULL AS note, sm.qty, u.short_name AS unit_short,
             sm.warehouse_id, sm.product_id, sm.batch_id, sm.cost_price
      FROM stock_movements sm
      JOIN products pr ON pr.id = sm.product_id
      LEFT JOIN batches b ON b.id = sm.batch_id
      LEFT JOIN units u ON u.id = b.unit_id
      WHERE sm.document_type = 'opening_balance'
      ORDER BY sm.created_at DESC
    `);
    res.json([...finRows, ...stockRows].sort((a,b)=>new Date(b.date)-new Date(a.date)));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/opening-balances/stock/:id', async (req, res) => {
  const pool = await getPool(req.companyId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const smId = parseInt(req.params.id);
    const { rows:[sm] } = await client.query('SELECT * FROM stock_movements WHERE id=$1', [smId]);
    if (!sm) return res.status(404).json({ error: 'Не найдено' });
    // Удаляем движение сначала
    await client.query('DELETE FROM stock_movements WHERE id=$1', [smId]);
    // Удаляем из stock
    await client.query('DELETE FROM stock WHERE warehouse_id=$1 AND product_id=$2 AND batch_id=$3',
      [sm.warehouse_id, sm.product_id, sm.batch_id]);
    // Удаляем партию последней
    await client.query('DELETE FROM batches WHERE id=$1', [sm.batch_id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

app.put('/api/opening-balances/stock/:id', async (req, res) => {
  const pool = await getPool(req.companyId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { qty, cost_price } = req.body;
    const smId = parseInt(req.params.id);
    const { rows:[sm] } = await client.query('SELECT * FROM stock_movements WHERE id=$1', [smId]);
    if (!sm) return res.status(404).json({ error: 'Не найдено' });
    await client.query('UPDATE stock_movements SET qty=$1, cost_price=$2 WHERE id=$3', [parseFloat(qty), parseFloat(cost_price)||0, smId]);
    await client.query('UPDATE stock SET qty=$1, cost_price=$2 WHERE warehouse_id=$3 AND product_id=$4 AND batch_id=$5',
      [parseFloat(qty), parseFloat(cost_price)||0, sm.warehouse_id, sm.product_id, sm.batch_id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

app.post('/api/opening-balances', async (req, res) => {
  const pool = await getPool(req.companyId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { date, finance=[], stock=[] } = req.body;

    // Финансовые остатки — создаём платежи с номером НО-ДАТА
    for (const f of finance) {
      const num = 'НО-' + date.replace(/-/g,'') + '-' + Math.floor(Math.random()*9000+1000);
      const clearingAcc = await client.query("SELECT id FROM bank_accounts WHERE type='clearing' LIMIT 1");
      const accId = clearingAcc.rows[0]?.id || null;
      await client.query(`
        INSERT INTO payments
          (number, direction, counterparty_id, currency_id, currency_rate,
           amount, amount_base, payment_date, note, status, bank_account_id)
        VALUES ($1,$2,$3,$4,1,$5,$5,$6,$7,'posted',$8)
      `, [num, f.direction, f.counterparty_id, f.currency_id||1,
          f.amount, date, ('Начальный остаток'+(f.note?' · '+f.note:'')), accId]);
    }

    // Складские остатки — создаём записи в stock напрямую
    for (const s of stock) {
      // Создаём партию
      const batchNum = 'НО-' + date.replace(/-/g,'');
      const { rows:[batch] } = await client.query(`
        INSERT INTO batches (product_id, unit_id, country_id, grade_id, batch_number)
        VALUES ($1,$2,$3,$4,$5) RETURNING id
      `, [s.product_id, s.unit_id||null, s.country_id||null, s.grade_id||null, batchNum]);

      // Добавляем в stock
      const { rows:[existing] } = await client.query(
        'SELECT id FROM stock WHERE warehouse_id=$1 AND product_id=$2 AND batch_id=$3',
        [s.warehouse_id, s.product_id, batch.id]
      );
      if (existing) {
        await client.query(
          'UPDATE stock SET qty=$1, cost_price=$2 WHERE id=$3',
          [s.qty, s.cost_price||0, existing.id]
        );
      } else {
        await client.query(`
          INSERT INTO stock (warehouse_id, product_id, batch_id, unit_id, qty, cost_price)
          VALUES ($1,$2,$3,$4,$5,$6)
        `, [s.warehouse_id, s.product_id, batch.id, s.unit_id||null, s.qty, s.cost_price||0]);
      }
      // Движение
      await client.query(`
        INSERT INTO stock_movements
          (document_type, document_id, warehouse_id, product_id, batch_id, qty, cost_price, created_at)
        VALUES ('opening_balance',0,$1,$2,$3,$4,$5,NOW())
      `, [s.warehouse_id, s.product_id, batch.id, s.qty, s.cost_price||0]);
    }

    await client.query('COMMIT');
    res.json({ ok: true, finance: finance.length, stock: stock.length });
  } catch(e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// ── ЮРИДИЧЕСКИЕ ЛИЦА ──────────────────────────────────────────
app.get('/api/legal-entities', async (req, res) => {
  try {
    const { rows } = await (await getPool(req.companyId)).query('SELECT * FROM legal_entities ORDER BY name');
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/legal-entities', async (req, res) => {
  try {
    const { name, inn, kpp, is_active=true } = req.body;
    const { rows } = await (await getPool(req.companyId)).query(
      'INSERT INTO legal_entities (name,inn,kpp,is_active) VALUES ($1,$2,$3,$4) RETURNING *',
      [name, inn||null, kpp||null, is_active]
    );
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/legal-entities/:id', async (req, res) => {
  try {
    const { name, inn, kpp, is_active } = req.body;
    const { rows } = await (await getPool(req.companyId)).query(
      'UPDATE legal_entities SET name=$1,inn=$2,kpp=$3,is_active=$4 WHERE id=$5 RETURNING *',
      [name, inn||null, kpp||null, is_active, parseInt(req.params.id)]
    );
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/legal-entities/:id', async (req, res) => {
  try {
    await (await getPool(req.companyId)).query('DELETE FROM legal_entities WHERE id=$1', [parseInt(req.params.id)]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── ЛИЧНЫЙ КАБИНЕТ КОНТРАГЕНТА ────────────────────────────────
// Получить данные кабинета контрагента
app.get('/api/counterparties/:id/cabinet', async (req, res) => {
  try {
    // Ищем в master cabinet_users
    const { rows } = await masterPool.query(
      'SELECT id, counterparty_id, login, is_active, created_at FROM cabinet_users WHERE counterparty_id=$1 AND company_id=$2',
      [parseInt(req.params.id), req.companyId]
    );
    res.json(rows[0]||null);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Создать логин кабинета
app.post('/api/counterparties/:id/cabinet', async (req, res) => {
  try {
    const { login, password, is_active=true } = req.body;

    // Проверяем уникальность глобально
    const { rows: exists } = await masterPool.query(
      'SELECT id FROM cabinet_users WHERE login=$1', [login]
    );
    if(exists.length) return res.status(400).json({ error: `Логин "${login}" уже занят в системе` });

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Сохраняем в master
    const { rows } = await masterPool.query(
      'INSERT INTO cabinet_users (login, password_hash, company_id, counterparty_id, is_active) VALUES ($1,$2,$3,$4,$5) RETURNING id,counterparty_id,login,is_active',
      [login, hash, req.companyId, parseInt(req.params.id), is_active]
    );

    // Синхронизируем с БД компании
    const pool = await getPool(req.companyId);
    await pool.query(
      'INSERT INTO counterparty_users (counterparty_id, login, password_hash, is_active) VALUES ($1,$2,$3,$4) ON CONFLICT (login) DO UPDATE SET password_hash=$3, is_active=$4',
      [parseInt(req.params.id), login, hash, is_active]
    );

    res.json(rows[0]);
  } catch(e) {
    if(e.code==='23505') res.status(400).json({ error: 'Логин уже занят' });
    else res.status(500).json({ error: e.message });
  }
});

// Обновить логин кабинета
app.put('/api/counterparties/:id/cabinet', async (req, res) => {
  try {
    const { login, password, is_active } = req.body;
    const counterpartyId = parseInt(req.params.id);

    // Получаем старый логин
    const { rows: old } = await masterPool.query(
      'SELECT login FROM cabinet_users WHERE counterparty_id=$1 AND company_id=$2',
      [counterpartyId, req.companyId]
    );
    const oldLogin = old[0]?.login;

    let masterQ, masterParams, companyQ, companyParams;
    if(password) {
      const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      masterQ = 'UPDATE cabinet_users SET login=$1, password_hash=$2, is_active=$3 WHERE counterparty_id=$4 AND company_id=$5 RETURNING id,counterparty_id,login,is_active';
      masterParams = [login, hash, is_active, counterpartyId, req.companyId];
      companyQ = 'UPDATE counterparty_users SET login=$1, password_hash=$2, is_active=$3 WHERE login=$4';
      companyParams = [login, hash, is_active, oldLogin];
    } else {
      masterQ = 'UPDATE cabinet_users SET login=$1, is_active=$2 WHERE counterparty_id=$3 AND company_id=$4 RETURNING id,counterparty_id,login,is_active';
      masterParams = [login, is_active, counterpartyId, req.companyId];
      companyQ = 'UPDATE counterparty_users SET login=$1, is_active=$2 WHERE login=$3';
      companyParams = [login, is_active, oldLogin];
    }

    const { rows } = await masterPool.query(masterQ, masterParams);
    const pool = await getPool(req.companyId);
    await pool.query(companyQ, companyParams);

    res.json(rows[0]);
  } catch(e) {
    if(e.code==='23505') res.status(400).json({ error: 'Логин уже занят' });
    else res.status(500).json({ error: e.message });
  }
});

// Удалить логин кабинета
app.delete('/api/counterparties/:id/cabinet', async (req, res) => {
  try {
    const counterpartyId = parseInt(req.params.id);
    const { rows } = await masterPool.query(
      'SELECT login FROM cabinet_users WHERE counterparty_id=$1 AND company_id=$2',
      [counterpartyId, req.companyId]
    );
    const login = rows[0]?.login;

    await masterPool.query('DELETE FROM cabinet_users WHERE counterparty_id=$1 AND company_id=$2', [counterpartyId, req.companyId]);
    if(login) {
      const pool = await getPool(req.companyId);
      await pool.query('DELETE FROM counterparty_users WHERE login=$1', [login]);
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Логин в личный кабинет — через master
app.post('/api/cabinet/login', async (req, res) => {
  try {
    const { login, password } = req.body || {};
    const ckey = auth.loginKey(req, login);
    if (auth.isLocked(ckey)) return res.status(429).json({ error: 'Слишком много неудачных попыток. Подождите 10 минут.' });

    // Ищем в master cabinet_users
    const { rows: cabRows } = await masterPool.query(
      'SELECT * FROM cabinet_users WHERE login=$1 AND is_active=true',
      [login]
    );
    if(!cabRows.length) { auth.registerFail(ckey); return res.status(401).json({ error: 'Неверный логин или пароль' }); }

    const cabUser = cabRows[0];
    const ok = await bcrypt.compare(password, cabUser.password_hash);
    if(!ok) { auth.registerFail(ckey); return res.status(401).json({ error: 'Неверный логин или пароль' }); }

    // Загружаем данные контрагента из БД компании
    const pool = await getPool(cabUser.company_id);
    const { rows } = await pool.query(
      `SELECT cu.*, cp.name AS cp_name, cp.currency_id, c.code AS currency_code
       FROM counterparty_users cu
       JOIN counterparties cp ON cp.id=cu.counterparty_id
       LEFT JOIN currencies c ON c.id=cp.currency_id
       WHERE cu.login=$1`,
      [login]
    );

    if(!rows.length) return res.status(401).json({ error: 'Данные контрагента не найдены' });
    const { password_hash, ...safe } = rows[0];
    auth.registerSuccess(ckey);
    res.json({ ...safe, company_id: cabUser.company_id,
      token: auth.issueToken({ uid: rows[0].id, login, cid: cabUser.company_id, role: 'cabinet' }) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Получить список выписок
app.get('/api/bank-statements', async (req, res) => {
  try {
    const { rows } = await (await getPool(req.companyId)).query(`
      SELECT bs.*, ba.name AS account_name,
        COUNT(bsl.id) AS total_lines,
        COUNT(bsl.id) FILTER (WHERE bsl.status='posted') AS posted_lines,
        COUNT(bsl.id) FILTER (WHERE bsl.status='new') AS new_lines
      FROM bank_statements bs
      LEFT JOIN bank_accounts ba ON ba.id = bs.bank_account_id
      LEFT JOIN bank_statement_lines bsl ON bsl.statement_id = bs.id
      GROUP BY bs.id, ba.name
      ORDER BY bs.loaded_at DESC
    `);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Получить строки выписки
app.get('/api/bank-statements/:id/lines', async (req, res) => {
  try {
    const { rows } = await (await getPool(req.companyId)).query(`
      SELECT bsl.*, cp.name AS counterparty_name_matched
      FROM bank_statement_lines bsl
      LEFT JOIN counterparties cp ON cp.id = bsl.counterparty_id
      WHERE bsl.statement_id = $1
      ORDER BY bsl.operation_date, bsl.id
    `, [parseInt(req.params.id)]);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Загрузить выписку (массив строк)
app.post('/api/bank-statements', async (req, res) => {
  const pool = await getPool(req.companyId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { bank_account_id, date_from, date_to, source='manual', lines=[] } = req.body;

    // Проверка на дубликат — та же выписка уже загружена
    const { rows: existing } = await client.query(
      `SELECT id FROM bank_statements WHERE bank_account_id=$1 AND date_from=$2 AND date_to=$3`,
      [parseInt(bank_account_id)||null, date_from||null, date_to||null]
    );
    if (existing.length) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(409).json({ error: 'Выписка за этот период уже загружена (id=' + existing[0].id + ')' });
    }

    const { rows: [stmt] } = await client.query(
      `INSERT INTO bank_statements (bank_account_id, date_from, date_to, source)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [parseInt(bank_account_id)||null, date_from||null, date_to||null, source]
    );

    for (const line of lines) {
      // Ищем контрагента по псевдонимам (ИНН приоритет, потом название)
      let cpId = null;
      if (line.counterparty_inn) {
        const { rows } = await client.query(
          `SELECT counterparty_id FROM counterparty_aliases WHERE inn = $1 LIMIT 1`,
          [line.counterparty_inn]
        );
        if (rows.length) cpId = rows[0].counterparty_id;
      }
      if (!cpId && line.counterparty_name) {
        const { rows } = await client.query(
          `SELECT counterparty_id FROM counterparty_aliases
           WHERE LOWER(alias_name) = LOWER($1) LIMIT 1`,
          [line.counterparty_name]
        );
        if (rows.length) cpId = rows[0].counterparty_id;
      }
      // Если не найден по псевдонимам — ищем по основному названию
      if (!cpId && line.counterparty_name) {
        const { rows } = await client.query(
          `SELECT id FROM counterparties
           WHERE LOWER(name) = LOWER($1) AND is_active = true LIMIT 1`,
          [line.counterparty_name]
        );
        if (rows.length) cpId = rows[0].id;
      }

      // Автозаполнение справочника Юридических лиц по ИНН из выписки
      if (line.counterparty_inn && line.counterparty_name) {
        const { rows: [existingLe] } = await client.query(
          `SELECT id FROM legal_entities WHERE inn = $1 LIMIT 1`,
          [line.counterparty_inn]
        );
        if (!existingLe) {
          await client.query(
            `INSERT INTO legal_entities (name, inn, is_active, created_at)
             VALUES ($1, $2, true, NOW())
             ON CONFLICT (inn) DO NOTHING`,
            [line.counterparty_name, line.counterparty_inn]
          );
        }
      }

      const status = cpId ? 'matched' : 'new';

      const { rows: [bsl] } = await client.query(
        `INSERT INTO bank_statement_lines
          (statement_id, operation_date, amount, direction, counterparty_name, counterparty_inn, purpose, doc_number, counterparty_id, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [stmt.id, line.operation_date, parseFloat(line.amount), line.direction,
         line.counterparty_name||null, line.counterparty_inn||null,
         line.purpose||null, line.doc_number||null, cpId, status]
      );

      // Если сопоставлен — автоматически создаём и проводим платёж
      if (cpId) {
        await autoCreatePayment(client, bsl, cpId);
      }
    }

    await client.query('COMMIT');
    res.json({ ok: true, statement_id: stmt.id });
  } catch(e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// Ручное сопоставление строки
app.post('/api/bank-statement-lines/:id/match', async (req, res) => {
  const pool = await getPool(req.companyId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const lineId = parseInt(req.params.id);
    const { counterparty_id, save_alias } = req.body;

    const { rows: [line] } = await client.query(
      'SELECT * FROM bank_statement_lines WHERE id=$1', [lineId]
    );
    if (!line) return res.status(404).json({ error: 'Не найдена' });

    await client.query(
      'UPDATE bank_statement_lines SET counterparty_id=$1, status=$2 WHERE id=$3',
      [parseInt(counterparty_id), 'matched', lineId]
    );

    // Сохранить псевдоним если запрошено
    if (save_alias && line.counterparty_name) {
      await client.query(
        `INSERT INTO counterparty_aliases (counterparty_id, alias_name, inn)
         VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [parseInt(counterparty_id), line.counterparty_name, line.counterparty_inn||null]
      );
    }

    await autoCreatePayment(client, line, parseInt(counterparty_id));
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch(e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// Пропустить строку
app.post('/api/bank-statement-lines/:id/skip', async (req, res) => {
  try {
    await (await getPool(req.companyId)).query('UPDATE bank_statement_lines SET status=$1 WHERE id=$2', ['skipped', parseInt(req.params.id)]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Удаление выписки
app.delete('/api/bank-statements/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const pool = await getPool(req.companyId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: lines } = await client.query('SELECT payment_id FROM bank_statement_lines WHERE statement_id=$1 AND payment_id IS NOT NULL', [id]);
    for (const l of lines) {
      await client.query('DELETE FROM payment_allocations WHERE payment_id=$1', [l.payment_id]);
      await client.query('DELETE FROM payments WHERE id=$1', [l.payment_id]);
    }
    await client.query('DELETE FROM bank_statement_lines WHERE statement_id=$1', [id]);
    await client.query('DELETE FROM bank_statements WHERE id=$1', [id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch(e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// Создание платежа из строки выписки
async function autoCreatePayment(client, line, cpId) {
  const direction = line.direction === 'in' ? 'incoming' : 'outgoing';
  const num = 'БВ-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random()*9000)+1000);
  const amount = Math.abs(parseFloat(line.amount));

  // Достаём bank_account_id из выписки
  const { rows: [stmt] } = await client.query(
    `SELECT bank_account_id FROM bank_statements WHERE id = $1`,
    [line.statement_id]
  );
  const bankAccountId = stmt?.bank_account_id || null;

  // Извлекаем номер п/п из doc_number (формат: "П.П. № 747 от 27.05.2026")
  const ppMatch = (line.doc_number || '').match(/№\s*([\d\/\-]+)/);
  const ppNumber = ppMatch ? ppMatch[1] : (line.doc_number || null);

  const { rows: [pay] } = await client.query(
    `INSERT INTO payments
      (number, payment_date, direction, amount, amount_base, counterparty_id,
       bank_account_id, currency_id, currency_rate, note, status, pp_number, legal_name)
     VALUES ($1,$2,$3,$4,$4,$5,$6,1,1,$7,'posted',$8,$9) RETURNING id`,
    [num, line.operation_date, direction, amount, cpId, bankAccountId,
     line.purpose||null, ppNumber, line.counterparty_name||null]
  );
  await client.query(
    'UPDATE bank_statement_lines SET payment_id=$1, status=$2 WHERE id=$3',
    [pay.id, 'posted', line.id]
  );
}
app.get('/api/counterparties/:id/aliases', async (req, res) => {
  try {
    const { rows } = await (await getPool(req.companyId)).query(
      `SELECT id, alias_name, inn, note, created_at FROM counterparty_aliases WHERE counterparty_id=$1 ORDER BY id`,
      [parseInt(req.params.id)]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/counterparties/:id/aliases', async (req, res) => {
  try {
    const { alias_name, inn, note } = req.body;
    if (!alias_name) return res.status(400).json({ error: 'alias_name required' });
    const { rows } = await (await getPool(req.companyId)).query(
      `INSERT INTO counterparty_aliases(counterparty_id, alias_name, inn, note) VALUES($1,$2,$3,$4) RETURNING *`,
      [parseInt(req.params.id), alias_name, inn||null, note||null]
    );
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/counterparties/:id/aliases/:aliasId', async (req, res) => {
  try {
    await (await getPool(req.companyId)).query(
      `DELETE FROM counterparty_aliases WHERE id=$1 AND counterparty_id=$2`,
      [parseInt(req.params.aliasId), parseInt(req.params.id)]
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── ИНИЦИАЛИЗАЦИЯ ТРИГГЕРОВ И ФУНКЦИЙ ПЕРЕСЧЁТА ─────────────────────────────
async function installStockTrigger(db) {
        await db.query(`
          CREATE OR REPLACE FUNCTION recalculate_stock_on_movement_delete()
          RETURNS TRIGGER AS $$
          BEGIN
            UPDATE stock
            SET qty = COALESCE((
              SELECT SUM(qty) FROM stock_movements
              WHERE batch_id = OLD.batch_id
              AND warehouse_id = OLD.warehouse_id
            ), 0)
            WHERE batch_id = OLD.batch_id
            AND warehouse_id = OLD.warehouse_id;
            RETURN OLD;
          END;
          $$ LANGUAGE plpgsql;
        `);
        await db.query(`
          DROP TRIGGER IF EXISTS trg_recalc_stock_on_movement_delete ON stock_movements;
        `);
        await db.query(`
          CREATE TRIGGER trg_recalc_stock_on_movement_delete
          AFTER DELETE ON stock_movements
          FOR EACH ROW
          EXECUTE FUNCTION recalculate_stock_on_movement_delete();
        `);
}

async function initDbTriggers() {
  try {
    // Устанавливаем триггеры для всех активных компаний
    const companies = await activeCompanies();
    for (const company of companies) {
      try {
        const pool = await getPool(company.id);
        await installStockTrigger(pool);
        console.log(`✅ Триггер установлен для компании ${company.id}`);
      } catch(e) {
        console.error(`❌ Ошибка триггера для компании ${company.id}:`, e.message);
      }
    }
  } catch(e) {
    console.error('❌ Ошибка установки триггера:', e.message);
  }
}

// ── ЭНДПОИНТ ПЕРЕСЧЁТА ОСТАТКОВ ─────────────────────────────────────────────
app.post('/api/recalculate-stock', async (req, res) => {
  try {
    // Удаляем дубли в stock — оставляем запись с максимальным id
    const { rowCount: dupsDeleted } = await (await getPool(req.companyId)).query(`
      DELETE FROM stock s1
      WHERE s1.id NOT IN (
        SELECT MAX(s2.id)
        FROM stock s2
        GROUP BY s2.batch_id, s2.warehouse_id
      )
    `);

    // Пересчитываем qty из движений для всех записей
    const { rowCount: updated } = await (await getPool(req.companyId)).query(`
      UPDATE stock s
      SET qty = COALESCE((
        SELECT SUM(sm.qty)
        FROM stock_movements sm
        WHERE sm.batch_id = s.batch_id
        AND sm.warehouse_id = s.warehouse_id
      ), 0)
    `);

    res.json({
      ok: true,
      duplicates_removed: dupsDeleted,
      records_updated: updated,
      message: `Пересчитано: ${updated} записей, удалено дублей: ${dupsDeleted}`
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});


// ═══════════════════════════════════════════════════════════════════
// POST /api/opening-debts
// Загрузка начальных долгов из Excel (массив строк)
// Body: { lines: [{ counterparty_name, date, amount }] }
// ═══════════════════════════════════════════════════════════════════
app.post('/api/opening-debts', async (req, res) => {
  const { lines = [] } = req.body;
  if (!lines.length) return res.status(400).json({ error: 'Нет строк для загрузки' });

  const pool = await getPool(req.companyId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let created = 0, skipped = 0;
    const errors = [];

    // Генерируем префикс номера
    const { rows: [lastOrder] } = await client.query(
      `SELECT number FROM orders_sale WHERE number LIKE 'НД-%' ORDER BY id DESC LIMIT 1`
    );
    let lastNum = parseInt((lastOrder?.number || 'НД-0').replace('НД-', '')) || 0;

    for (const line of lines) {
      const { counterparty_name, date, amount } = line;
      if (!counterparty_name || !amount || parseFloat(amount) <= 0) { skipped++; continue; }

      try {
        // 1. Ищем контрагента по названию (без учёта регистра)
        let { rows: [cp] } = await client.query(
          `SELECT id FROM counterparties WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) AND is_active = true LIMIT 1`,
          [counterparty_name]
        );

        // 2. Не нашли — создаём нового
        if (!cp) {
          const { rows: [newCp] } = await client.query(
            `INSERT INTO counterparties (name, type, is_active)
             VALUES ($1, 'legal', true) RETURNING id`,
            [counterparty_name.trim()]
          );
          cp = newCp;
        }

        // 3. Генерируем номер накладной
        lastNum++;
        const number = 'НД-' + String(lastNum).padStart(4, '0');

        // 4. Создаём накладную — заголовок без строк товара
        const deliveryDate = date || new Date().toISOString().slice(0, 10);
        // Сохраняем дату с явным московским timezone чтобы избежать сдвига при UTC конвертации
        const deliveryDateTZ = deliveryDate + 'T12:00:00+03:00';
        await client.query(
          `INSERT INTO orders_sale
            (number, payment_type, counterparty_id, cash_account_id, warehouse_id,
             company_id, currency_id, currency_rate, status, delivery_date, total_amount, note, created_at)
           VALUES ($1,'credit',$2,NULL,NULL,1,1,1,'posted',$3,$4,'Начальный долг',$5)`,
          [number, cp.id, deliveryDate, parseFloat(amount), deliveryDateTZ]
        );

        created++;
      } catch(e) {
        errors.push(`${counterparty_name}: ${e.message}`);
        skipped++;
      }
    }

    await client.query('COMMIT');
    res.json({ ok: true, created, skipped, errors });
  } catch(e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// POST /api/opening-creditor-debts
// Загрузка начальных долгов поставщикам из Excel
// Body: { lines: [{ counterparty_name, date, amount }] }
app.post('/api/opening-creditor-debts', async (req, res) => {
  const { lines = [] } = req.body;
  if (!lines.length) return res.status(400).json({ error: 'Нет строк для загрузки' });

  const pool = await getPool(req.companyId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let created = 0, skipped = 0;
    const errors = [];

    const { rows: [lastOrder] } = await client.query(
      `SELECT number FROM orders_purchase WHERE number LIKE 'НП-%' ORDER BY id DESC LIMIT 1`
    );
    let lastNum = parseInt((lastOrder?.number || 'НП-0').replace('НП-', '')) || 0;

    for (const line of lines) {
      const { counterparty_name, date, amount } = line;
      if (!counterparty_name || !amount || parseFloat(amount) <= 0) { skipped++; continue; }

      try {
        // 1. Ищем контрагента
        let { rows: [cp] } = await client.query(
          `SELECT id FROM counterparties WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) AND is_active = true LIMIT 1`,
          [counterparty_name]
        );

        // 2. Не нашли — создаём нового
        if (!cp) {
          const { rows: [newCp] } = await client.query(
            `INSERT INTO counterparties (name, type, is_active) VALUES ($1, 'legal', true) RETURNING id`,
            [counterparty_name.trim()]
          );
          cp = newCp;
        }

        // 3. Генерируем номер
        lastNum++;
        const number = 'НП-' + String(lastNum).padStart(4, '0');

        // 4. Создаём приходную накладную без строк товара
        const deliveryDate = date || new Date().toISOString().slice(0, 10);
        const deliveryDateTZ = deliveryDate + 'T12:00:00+03:00';
        await client.query(
          `INSERT INTO orders_purchase
            (number, counterparty_id, warehouse_id, company_id, currency_id,
             currency_rate, status, total_amount, note, created_at)
           VALUES ($1,$2,NULL,1,1,1,'posted',$3,'Начальный долг поставщику',$4)`,
          [number, cp.id, parseFloat(amount), deliveryDateTZ]
        );

        created++;
      } catch(e) {
        errors.push(`${counterparty_name}: ${e.message}`);
        skipped++;
      }
    }

    await client.query('COMMIT');
    res.json({ ok: true, created, skipped, errors });
  } catch(e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

(async () => {
  if (SINGLE) {
    try {
      const applied = await runMigrations(await getPool(), 'основная база');
      if (applied.length) console.log('✅ Применены миграции:', applied.join(', '));
    } catch (e) {
      console.error('❌ ' + e.message);
      console.error('Сервер не запущен: база не обновлена. Сделайте резервную копию и обратитесь к разработчику.');
      process.exit(1);
    }
  }
  if (!SINGLE) {
    // каждая компания подтягивается до актуальной схемы; ошибка одной базы не останавливает сервер
    try {
      for (const c of await activeCompanies()) {
        try {
          const applied = await runMigrations(await getPool(c.id), 'компания ' + c.id);
          if (applied.length) console.log(`✅ Компания ${c.id}: применены миграции:`, applied.join(', '));
        } catch (e) { console.error('⚠ Компания ' + c.id + ': ' + e.message); }
      }
    } catch (e) { console.error('⚠ Миграции компаний пропущены:', e.message); }
  }
  app.listen(PORT, async () => {
    console.log(`✅ ТоргУчёт ${APP_VERSION} (${SINGLE ? 'одна база' : 'несколько компаний'}) запущен: http://localhost:${PORT}`);
    const ips = Object.values(require('os').networkInterfaces()).flat().filter(n => n && n.family === 'IPv4' && !n.internal).map(n => n.address);
    if (ips.length) console.log('   Для других компьютеров сети: ' + ips.map(ip => `http://${ip}:${PORT}`).join('  '));
    await initDbTriggers();
  });
})();
