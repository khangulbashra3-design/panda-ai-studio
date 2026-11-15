# 🐼 PANDA AI STUDIO

Application web professionnelle de création de publicités vidéo par intelligence artificielle, montage automatisé via FFmpeg et génération de scripts TikTok Shop.

## Architecture du projet

- **Frontend** : React 18, Vite, CSS moderne inspiré de l'esthétique Apple.
- **Backend** : Node.js, Express, Helmet, Rate Limiting, Multer.
- **Base de données** : PostgreSQL (`db/schema.sql`).
- **Moteur vidéo IA** : Connecteur officiel Runway API (`server/videoProvider.js`).
- **Moteur montage local** : FFmpeg (`server/render.js`).
- **Moteur voix off, transcription & TikTok Shop** : OpenAI TTS-1-HD, Whisper-1 et GPT-4o-mini (`server/aiAudioAndScripts.js`).
- **Paiements** : Stripe Checkout & Webhooks (`server/billing.js`).

## Installation & Lancement

```bash
npm install
cp .env.example .env
npm run db:init
npm run dev
```
