import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, isDbConfigured } from './db.js';

const router = express.Router();

function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET non configuré dans les variables d\'environnement.');
  }
  return process.env.JWT_SECRET;
}

export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentification requise. Connectez-vous.' });
  }
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Session expirée ou invalide. Veuillez vous reconnecter.' });
  }
}

router.post('/register', async (req, res) => {
  try {
    if (!isDbConfigured) {
      return res.status(503).json({ error: 'Base de données PostgreSQL non connectée.' });
    }
    const { email, password, fullName } = req.body;
    if (!email || !password || !fullName) {
      return res.status(400).json({ error: 'Nom complet, e-mail et mot de passe requis.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Un compte existe déjà avec cette adresse e-mail.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await query(
      `INSERT INTO users (email, password_hash, full_name, plan, credits)
       VALUES ($1, $2, $3, 'free', 10)
       RETURNING id, email, full_name, plan, credits, created_at`,
      [normalizedEmail, passwordHash, fullName.trim()]
    );

    const user = result.rows[0];
    await query(
      `INSERT INTO credit_transactions (user_id, amount, reason)
       VALUES ($1, 10, 'Crédits de bienvenue (Plan Gratuit)')`,
      [user.id]
    );

    const token = jwt.sign({ id: user.id, email: user.email }, getJwtSecret(), { expiresIn: '7d' });
    res.status(201).json({ token, user });
  } catch (err) {
    console.error('[AUTH REGISTER]', err);
    res.status(500).json({ error: err.message || 'Erreur lors de la création du compte.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    if (!isDbConfigured) {
      return res.status(503).json({ error: 'Base de données PostgreSQL non connectée.' });
    }
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail et mot de passe requis.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const result = await query(
      'SELECT id, email, password_hash, full_name, plan, credits, created_at FROM users WHERE email = $1',
      [normalizedEmail]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Identifiants incorrects.' });
    }

    const userRow = result.rows[0];
    const valid = await bcrypt.compare(password, userRow.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Identifiants incorrects.' });
    }

    const token = jwt.sign({ id: userRow.id, email: userRow.email }, getJwtSecret(), { expiresIn: '7d' });
    const { password_hash, ...user } = userRow;
    res.json({ token, user });
  } catch (err) {
    console.error('[AUTH LOGIN]', err);
    res.status(500).json({ error: err.message || 'Erreur lors de la connexion.' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const userRes = await query(
      'SELECT id, email, full_name, plan, credits, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }
    const txRes = await query(
      'SELECT id, amount, reason, created_at FROM credit_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 25',
      [req.user.id]
    );
    res.json({ user: userRes.rows[0], transactions: txRes.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
