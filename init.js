import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initDb() {
  if (!process.env.DATABASE_URL) {
    console.error('[DB] ERREUR : DATABASE_URL manquant dans .env');
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    await pool.query(schemaSql);
    console.log('[DB] Tables PostgreSQL initialisées avec succès.');
  } catch (err) {
    console.error('[DB] Échec initialisation PostgreSQL :', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

initDb();
