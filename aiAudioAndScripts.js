import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import { EXPORTS_DIR } from './storage.js';

dotenv.config();

export function getAudioAndCopyEngineStatus() {
  const connected = Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 10);
  return {
    connected,
    provider: 'OpenAI API (TTS-1-HD, Whisper-1, GPT-4o-mini)',
    voices: connected
      ? [
          { id: 'female', label: 'Voix féminine (Nova)', openaiVoice: 'nova' },
          { id: 'male', label: 'Voix masculine (Onyx)', openaiVoice: 'onyx' },
          { id: 'none', label: 'Sans voix', openaiVoice: null },
        ]
      : [{ id: 'none', label: 'Sans voix (Moteur TTS non connecté)', openaiVoice: null }],
    languages: [
      { code: 'fr', label: 'Français' },
      { code: 'en', label: 'Anglais' },
      { code: 'ar', label: 'Arabe' },
      { code: 'es', label: 'Espagnol' },
    ],
    message: connected
      ? 'Moteur Voix Off TTS, Transcription Sous-titres et Scripts IA connecté.'
      : 'Moteur Voix Off / Transcription / Scripts non connecté : configurez OPENAI_API_KEY dans .env.',
  };
}

export async function generateVoiceoverMp3({ text, voiceGender, language }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Voix off indisponible : OPENAI_API_KEY non configurée côté serveur.');
  }
  if (!text || !text.trim()) {
    throw new Error('Le texte de la voix off est vide.');
  }
  if (voiceGender === 'none') {
    return null;
  }

  const openaiVoice = voiceGender === 'male' ? 'onyx' : 'nova';

  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1-hd',
      voice: openaiVoice,
      input: text.trim().slice(0, 4000),
      response_format: 'mp3',
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Erreur TTS OpenAI (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const filename = `voiceover-${language}-${uuidv4()}.mp3`;
  const outputPath = path.join(EXPORTS_DIR, filename);
  fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));

  return {
    filename,
    localPath: outputPath,
    publicUrl: `/exports/${filename}`,
  };
}

export async function transcribeToSrt({ mediaLocalPath, language }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Transcription indisponible : OPENAI_API_KEY non configurée côté serveur.');
  }
  if (!fs.existsSync(mediaLocalPath)) {
    throw new Error('Fichier média introuvable pour la transcription.');
  }

  const formData = new FormData();
  const fileBuffer = fs.readFileSync(mediaLocalPath);
  const blob = new Blob([fileBuffer]);
  formData.append('file', blob, path.basename(mediaLocalPath));
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'srt');
  if (language && ['fr', 'en', 'ar', 'es'].includes(language)) {
    formData.append('language', language);
  }

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Erreur transcription Whisper (${response.status}) : ${errText}`);
  }

  const srtContent = await response.text();
  const srtFilename = `subtitles-${uuidv4()}.srt`;
  const srtPath = path.join(EXPORTS_DIR, srtFilename);
  fs.writeFileSync(srtPath, srtContent, 'utf-8');

  return {
    srtFilename,
    srtPath,
    srtContent,
    publicUrl: `/exports/${srtFilename}`,
  };
}

export async function generateTikTokShopCopy({ category, productName, verifiedFeatures, targetAudience, offerDetails }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Générateur TikTok Shop indisponible : OPENAI_API_KEY non configurée côté serveur.');
  }

  const systemPrompt = `Tu es un expert en création de publicités TikTok Shop haute conversion en français.
RÈGLE ABSOLUE : N'INVENTE JAMAIS aucune caractéristique technique, certification, chiffre ou promesse qui ne figure pas explicitement dans les données fournies par l'utilisateur. Utilise uniquement les faits fournis.
Réponds strictement au format JSON valide avec les clés suivantes :
{
  "hooks_3s": ["accroche 1", "accroche 2", "accroche 3"],
  "benefits": ["avantage factuel 1", "avantage factuel 2", "avantage factuel 3"],
  "ctas": ["appel à l'action 1", "appel à l'action 2"],
  "description": "description TikTok Shop optimisée",
  "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5"],
  "variants": [
    { "title": "Variante 1 - Problème / Solution", "script": "texte complet avec minutage [0-3s], [3-12s], [12-15s]" },
    { "title": "Variante 2 - Démonstration directe", "script": "texte complet avec minutage [0-3s], [3-12s], [12-15s]" },
    { "title": "Variante 3 - Avis client authentique (UGC)", "script": "texte complet avec minutage [0-3s], [3-12s], [12-15s]" }
  ]
}`;

  const userPrompt = `Catégorie : ${category}
Nom du produit : ${productName}
Caractéristiques vérifiées fournies par le vendeur : ${verifiedFeatures}
Public cible : ${targetAudience || 'Grand public'}
Offre / Prix indiqué : ${offerDetails || 'Non précisé'}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0.4,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Erreur OpenAI (${response.status})`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  return JSON.parse(content);
}
