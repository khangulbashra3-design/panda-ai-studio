import express from 'express';
import Stripe from 'stripe';
import dotenv from 'dotenv';
import { query } from './db.js';
import { requireAuth } from './auth.js';

dotenv.config();

const router = express.Router();

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

export function getPlansConfig() {
  return [
    {
      id: 'free',
      name: 'Gratuit',
      priceEur: 0,
      credits: 10,
      stripeConfigured: true,
      features: [
        '10 crédits offerts à l\'inscription',
        'Éditeur vidéo FFmpeg local',
        'Générateur TikTok Shop',
        'Export MP4 standard',
      ],
    },
    {
      id: 'starter',
      name: 'Starter',
      priceEur: Number(process.env.PLAN_PRICE_STARTER_EUR || 19),
      credits: 100,
      stripePriceId: process.env.STRIPE_PRICE_STARTER || null,
      stripeConfigured: Boolean(stripe && process.env.STRIPE_PRICE_STARTER),
      features: [
        '100 crédits / mois',
        'Photos vers vidéo & Texte vers vidéo',
        'Voix off multilingues (FR, EN, AR, ES)',
        'Export 1080p sans filigrane',
      ],
    },
    {
      id: 'pro',
      name: 'Pro',
      priceEur: Number(process.env.PLAN_PRICE_PRO_EUR || 49),
      credits: 350,
      stripePriceId: process.env.STRIPE_PRICE_PRO || null,
      stripeConfigured: Boolean(stripe && process.env.STRIPE_PRICE_PRO),
      features: [
        '350 crédits / mois',
        'Transformation vidéo existante',
        'Sous-titres automatiques Whisper SRT',
        'Variantes TikTok Shop illimitées',
      ],
    },
    {
      id: 'premium',
      name: 'Premium',
      priceEur: Number(process.env.PLAN_PRICE_PREMIUM_EUR || 129),
      credits: 1200,
      stripePriceId: process.env.STRIPE_PRICE_PREMIUM || null,
      stripeConfigured: Boolean(stripe && process.env.STRIPE_PRICE_PREMIUM),
      features: [
        '1 200 crédits / mois',
        'Priorité file de rendu IA',
        'Accès complet API fournisseurs connectés',
        'Support prioritaire studio',
      ],
    },
  ];
}

router.get('/plans', (_req, res) => {
  res.json({
    stripeConnected: Boolean(stripe),
    plans: getPlansConfig(),
  });
});

router.post('/create-checkout-session', requireAuth, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({
        error: 'Paiement Stripe non connecté : configurez STRIPE_SECRET_KEY sur le serveur.',
      });
    }

    const { planId } = req.body;
    const plan = getPlansConfig().find((p) => p.id === planId);
    if (!plan || plan.id === 'free') {
      return res.status(400).json({ error: 'Formule payante invalide.' });
    }
    if (!plan.stripePriceId) {
      return res.status(503).json({
        error: `Tarif Stripe non configuré pour la formule ${plan.name} (variable STRIPE_PRICE_${plan.id.toUpperCase()} manquante).`,
      });
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: req.user.email,
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      metadata: {
        userId: req.user.id,
        planId: plan.id,
        credits: String(plan.credits),
      },
      success_url: `${frontendUrl}/?payment=success`,
      cancel_url: `${frontendUrl}/?payment=cancelled`,
    });

    res.json({ checkoutUrl: session.url });
  } catch (err) {
    console.error('[STRIPE CHECKOUT]', err);
    res.status(500).json({ error: err.message });
  }
});

export async function handleStripeWebhook(req, res) {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(400).send('Stripe Webhook non configuré.');
  }
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Signature Webhook invalide : ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata?.userId;
    const planId = session.metadata?.planId;
    const creditsToAdd = Number(session.metadata?.credits || 0);

    if (userId && creditsToAdd > 0) {
      await query(
        'UPDATE users SET plan = $1, credits = credits + $2, updated_at = NOW() WHERE id = $3',
        [planId, creditsToAdd, userId]
      );
      await query(
        'INSERT INTO credit_transactions (user_id, amount, reason, stripe_session_id) VALUES ($1, $2, $3, $4)',
        [userId, creditsToAdd, `Abonnement ${planId.toUpperCase()} activé via Stripe`, session.id]
      );
    }
  }

  res.json({ received: true });
}

export default router;
