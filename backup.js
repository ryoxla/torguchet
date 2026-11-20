// Резервная копия всех баз этой установки. Адреса баз берутся из .env, ничего вписывать не нужно.
// Запуск: backup.bat (или node backup.js). Копии лежат в папке backup\ГГГГ-ММ-ДД_ЧЧ-ММ\
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const SINGLE = String(process.env.MODE || '').toLowerCase() === 'single';

function findPgDump() {
  const exe = process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump';
  if (process.env.PGBIN) {
    const p = path.join(process.env.PGBIN, exe);
    if (fs.existsSync(p)) return p;
  }
  if (process.platform === 'win32') {
    for (const root of [process.env['ProgramFiles'], process.env['ProgramFiles(x86)']].filter(Boolean)) {
      const base = path.join(root, 'PostgreSQL');
      if (!fs.existsSync(base)) continue;
      const vers = fs.readdirSync(base).filter(v => /^\d+/.test(v)).sort((a, b) => parseInt(b) - parseInt(a));
      for (const v of vers) { const p = path.join(base, v, 'bin', exe); if (fs.existsSync(p)) return p; }
    }
  }
  return exe; // вдруг есть в PATH
}

const stamp = () => {
  const d = new Date(), z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(d.getHours())}-${z(d.getMinutes())}`;
};

async function listDatabases() {
  if (SINGLE) {
    if (!process.env.DATABASE_URL) throw new Error('В .env не задан DATABASE_URL');
    return [{ label: 'основная база', url: process.env.DATABASE_URL }];
  }
  if (!process.env.MASTER_DATABASE_URL) throw new Error('В .env не задан MASTER_DATABASE_URL');
  const { Pool } = require('pg');
  const list = [{ label: 'master', url: process.env.MASTER_DATABASE_URL }];
  const pool = new Pool({ connectionString: process.env.MASTER_DATABASE_URL });
  try {
    const { rows } = await pool.query('SELECT name, db_url FROM companies WHERE db_url IS NOT NULL ORDER BY id');
    for (const r of rows) list.push({ label: r.name, url: r.db_url });
  } finally { await pool.end().catch(() => {}); }
  return list;
}

(async () => {
  const pgDump = findPgDump();
  const dbs = await listDatabases();
  const dest = path.join(__dirname, 'backup', stamp());
  fs.mkdirSync(dest, { recursive: true });
  console.log('pg_dump:', pgDump);
  console.log('Папка копии:', dest, '\n');

  const used = new Set();
  let failed = 0;
  for (const db of dbs) {
    let name;
    try { name = decodeURIComponent(new URL(db.url).pathname.replace(/^\//, '')) || 'db'; } catch { name = 'db'; }
    let file = name, i = 2;
    while (used.has(file)) file = name + '_' + i++;
    used.add(file);
    const out = path.join(dest, file + '.dump');
    process.stdout.write(`Копирую «${db.label}» (${name}) ... `);
    const r = spawnSync(pgDump, ['-d', db.url, '-Fc', '--no-owner', '-f', out], { encoding: 'utf8' });
    const size = fs.existsSync(out) ? fs.statSync(out).size : 0;
    if (r.error || r.status !== 0 || size === 0) {
      failed++;
      console.log('ОШИБКА');
      console.error('   ' + (r.error ? r.error.message : (r.stderr || '').trim() || 'пустой файл'));
    } else {
      console.log(`готово (${(size / 1048576).toFixed(1)} МБ)`);
    }
  }
  if (failed) { console.error(`\nНе удалось скопировать баз: ${failed}. Копия НЕ полная.`); process.exit(1); }
  console.log('\nГотово. Копия сохранена: ' + dest);
})().catch(e => { console.error('Ошибка резервного копирования:', e.message); process.exit(1); });
