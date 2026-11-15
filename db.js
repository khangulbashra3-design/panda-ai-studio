import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

export const isDbConfigured = Boolean(process.env.DATABASE_URL);

export const pool = isDbConfigured
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
    })
  : null;

export async function query(text, params) {
  if (!pool) {
    throw new Error('Base de données PostgreSQL non configurée (DATABASE_URL manquant).');
  }
  return pool.query(text, params);
}
