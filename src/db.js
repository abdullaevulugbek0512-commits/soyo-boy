import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => console.error('Baza xatosi:', err.message));

export async function migrate() {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const sql = await readFile(path.join(dir, 'schema.sql'), 'utf8');
  await pool.query(sql);
}

export async function upsertCustomer(from) {
  const { rows } = await pool.query(
    `INSERT INTO customers (telegram_id, first_name, username)
     VALUES ($1, $2, $3)
     ON CONFLICT (telegram_id) DO UPDATE
       SET first_name = EXCLUDED.first_name, username = EXCLUDED.username
     RETURNING *`,
    [from.id, from.first_name ?? null, from.username ?? null]
  );
  return rows[0];
}

export async function setLang(telegramId, lang) {
  await pool.query('UPDATE customers SET lang = $2 WHERE telegram_id = $1', [telegramId, lang]);
}
