// Авторизация по подписанному токену.
// Токен выдаётся при входе и подписан секретом, который знает только сервер.
// Поэтому подделать «я администратор» или «я из другой компании» заголовками уже нельзя.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const TOKEN_TTL_SEC = 12 * 60 * 60; // 12 часов

// ── Секрет подписи ───────────────────────────────────────────
// Берём AUTH_SECRET из .env. Если его нет, создаём случайный и сохраняем в файл .auth_secret
// (у каждой установки он свой, после перезапуска сервера вход не слетает).
function loadSecret() {
  if (process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 16) return process.env.AUTH_SECRET;
  const file = path.join(__dirname, '.auth_secret');
  try {
    const s = fs.readFileSync(file, 'utf8').trim();
    if (s.length >= 32) return s;
  } catch { /* файла ещё нет */ }
  const s = crypto.randomBytes(32).toString('hex');
  try { fs.writeFileSync(file, s, { mode: 0o600 }); }
  catch (e) { console.error('Не удалось сохранить .auth_secret:', e.message, '(после перезапуска придётся входить заново)'); }
  return s;
}
const SECRET = loadSecret();

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', SECRET).update(data).digest();

function issueToken(payload) {
  const now = Math.floor(Date.now() / 1000);
  const body = b64u(JSON.stringify({ ...payload, iat: now, exp: now + TOKEN_TTL_SEC }));
  return body + '.' + b64u(sign(body));
}

function verifyToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  let given;
  try { given = Buffer.from(sig, 'base64url'); } catch { return null; }
  const expected = sign(body);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  let data;
  try { data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  if (!data || typeof data.exp !== 'number' || data.exp < Math.floor(Date.now() / 1000)) return null;
  return data;
}

// ── Защита от подбора пароля ─────────────────────────────────
// 8 неудачных попыток подряд для одного логина с одного адреса: блокировка на 10 минут.
const attempts = new Map(); // key -> { n, until }
const MAX_FAILS = 8;
const LOCK_MS = 10 * 60 * 1000;

function loginKey(req, login) { return (req.ip || '') + '|' + String(login || '').toLowerCase(); }
function isLocked(key) {
  const a = attempts.get(key);
  if (!a) return false;
  if (a.until && a.until > Date.now()) return true;
  if (a.until && a.until <= Date.now()) attempts.delete(key);
  return false;
}
function registerFail(key) {
  const a = attempts.get(key) || { n: 0, until: 0 };
  a.n += 1;
  if (a.n >= MAX_FAILS) { a.until = Date.now() + LOCK_MS; a.n = 0; }
  attempts.set(key, a);
}
function registerSuccess(key) { attempts.delete(key); }
setInterval(() => { // чистим старые записи
  const now = Date.now();
  for (const [k, a] of attempts) if (a.until && a.until < now) attempts.delete(k);
}, 15 * 60 * 1000).unref();

// ── Middleware ───────────────────────────────────────────────
// Публичные маршруты: вход и информация о режиме.
const PUBLIC = new Set(['POST /api/login', 'POST /api/cabinet/login', 'GET /api/config']);

function authMiddleware({ singleMode }) {
  return (req, res, next) => {
    const key = req.method + ' ' + req.baseUrl + req.path;
    if (PUBLIC.has(key)) { req.companyId = '1'; req.userId = null; return next(); }

    const h = req.headers.authorization || '';
    const auth = h.startsWith('Bearer ') ? verifyToken(h.slice(7)) : null;
    if (!auth) return res.status(401).json({ error: 'Требуется вход в систему' });

    req.auth = auth;
    req.userId = auth.uid || null;
    // Компанию определяет токен. Исключение: суперадмин может переключаться между компаниями.
    if (singleMode) req.companyId = '1';
    else if (auth.role === 'superadmin' && req.headers['x-company-id']) req.companyId = String(req.headers['x-company-id']);
    else req.companyId = String(auth.cid || '1');
    next();
  };
}

module.exports = { issueToken, verifyToken, authMiddleware, loginKey, isLocked, registerFail, registerSuccess };
