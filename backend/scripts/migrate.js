const fs = require('fs/promises');
const path = require('path');
const db = require('../config/db');

async function run() {
  const { rows } = await db.query("SELECT to_regclass('public.companies') AS companies_table");
  const migrationsDir = path.join(__dirname, '..', '..', 'database', 'migrations');

  if (!rows[0].companies_table) {
    const schema = await fs.readFile(path.join(__dirname, '..', '..', 'database', 'schema.sql'), 'utf8');
    await db.query(schema);
  }

  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  const names = (await fs.readdir(migrationsDir)).filter(name => name.endsWith('.sql')).sort();
  for (const name of names) {
    const applied = await db.query('SELECT 1 FROM schema_migrations WHERE name=$1', [name]);
    if (applied.rows.length) continue;

    // A new database was created from the latest schema, so its migrations are already included.
    if (!rows[0].companies_table) {
      await db.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      continue;
    }

    const migration = await fs.readFile(path.join(migrationsDir, name), 'utf8');
    await db.query('BEGIN');
    try {
      await db.query(migration);
      await db.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  }
}

run()
  .then(() => console.log('Database schema is ready.'))
  .catch(error => { console.error('Database migration failed:', error); process.exitCode = 1; })
  .finally(() => db.pool.end());
