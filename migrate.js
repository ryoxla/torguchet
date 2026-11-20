// Миграции базы: пронумерованные SQL-файлы из папки migrations/.
// Какие уже применены, хранится в самой базе (таблица schema_migrations),
// поэтому каждая база сама подтягивается до актуальной версии, и повторно ничего не выполняется.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'migrations');

function listMigrations() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter(f => /^\d+.*\.sql$/i.test(f)).sort();
}

async function runMigrations(pool, label = 'база') {
  const client = await pool.connect();
  try {
    // защита от одновременного запуска двух серверов
    await client.query('SELECT pg_advisory_lock(727272)');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const { rows } = await client.query('SELECT version FROM schema_migrations');
    const done = new Set(rows.map(r => r.version));
    const applied = [];
    for (const file of listMigrations()) {
      if (done.has(file)) continue;
      const sql = fs.readFileSync(path.join(DIR, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied.push(file);
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(`Миграция ${file} не применена (${label}): ${e.message}`);
      }
    }
    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock(727272)').catch(() => {});
    client.release();
  }
}

module.exports = { runMigrations, listMigrations };
