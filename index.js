import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { query, isDbConfigured } from './db.js';
import authRouter, { requireAuth } from './auth.js';
import billingRouter, { handleStripeWebhook } from './billing.js';
import {
  UPLOADS_DIR,
  EXPORTS_DIR,
  uploadMiddleware,
  classifyMediaType,
  resolveLocalUploadPath,
  resolveLocalExportPath,
} from './storage.js';
import {
  getVideoEngineStatus,
  createRunwayGenerationTask,
  getRunwayTaskStatus,
} from './videoProvider.js';
import {
  getAudioAndCopyEngineStatus,
  generateVoiceoverMp3,
  transcribeToSrt,
  generateTikTokShopCopy,
} from './aiAudioAndScripts.js';
import { checkFfmpegAvailable, renderAutoEditMp4 } from './render.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3001);

app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.FRONTEND_URL || true, credentials: true }));
app.use(express.json({ limit: '10mb' }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes. Veuillez patienter quelques instants.' },
});
app.use('/api/', apiLimiter);

app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/exports', express.static(EXPORTS_DIR));

app.get('/api/status', async (_req, res) => {
  const ffmpeg = await checkFfmpegAvailable();
  res.json({
    database: {
      connected: isDbConfigured,
      message: isDbConfigured
        ? 'Base PostgreSQL connectée.'
        : 'Base PostgreSQL non connectée (configurez DATABASE_URL).',
    },
    videoEngine: getVideoEngineStatus(),
    audioAndCopyEngine: getAudioAndCopyEngineStatus(),
    ffmpeg,
  });
});

app.use('/api/auth', authRouter);
app.use('/api/billing', billingRouter);

app.post('/api/media/upload', requireAuth, (req, res) => {
  uploadMiddleware.array('files', 10)(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Aucun fichier valide reçu.' });
    }

    try {
      const savedAssets = [];
      for (const file of req.files) {
        const mediaType = classifyMediaType(file.mimetype);
        const publicUrl = `/uploads/${file.filename}`;
        const dbRes = await query(
          `INSERT INTO media_assets (user_id, original_name, stored_filename, mime_type, size_bytes, media_type, public_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, original_name, stored_filename, mime_type, size_bytes, media_type, public_url, created_at`,
          [req.user.id, file.originalname, file.filename, file.mimetype, file.size, mediaType, publicUrl]
        );
        savedAssets.push(dbRes.rows[0]);
      }
      res.status(201).json({ assets: savedAssets });
    } catch (dbErr) {
      res.status(500).json({ error: dbErr.message });
    }
  });
});

app.get('/api/media', requireAuth, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, original_name, stored_filename, mime_type, size_bytes, media_type, public_url, created_at FROM media_assets WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json({ assets: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/projects', requireAuth, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM projects WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json({ projects: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/video/generate', requireAuth, async (req, res) => {
  try {
    const engine = getVideoEngineStatus();
    if (!engine.connected) {
      return res.status(503).json({ error: engine.message });
    }

    const { mode, title, promptText, style, format, durationSeconds, quality, assetIds } = req.body;
    if (!promptText || !promptText.trim()) {
      return res.status(400).json({ error: 'Veuillez décrire votre publicité.' });
    }

    const creditCost = Number(durationSeconds) >= 10 ? 5 : 3;

    const userRes = await query('SELECT credits FROM users WHERE id = $1', [req.user.id]);
    const currentCredits = userRes.rows[0]?.credits ?? 0;
    if (currentCredits < creditCost) {
      return res.status(402).json({
        error: `Crédits insuffisants (${currentCredits} disponibles, ${creditCost} requis).`,
      });
    }

    let sourceAsset = null;
    if (Array.isArray(assetIds) && assetIds.length > 0) {
      const assetRes = await query(
        'SELECT * FROM media_assets WHERE id = $1 AND user_id = $2',
        [assetIds[0], req.user.id]
      );
      sourceAsset = assetRes.rows[0] || null;
    }

    const runwayTask = await createRunwayGenerationTask({
      mode,
      promptText: promptText.trim(),
      style: style || 'Premium / Apple',
      format: format || '9:16',
      durationSeconds: Number(durationSeconds) || 5,
      imageLocalPath: sourceAsset?.media_type === 'image' ? resolveLocalUploadPath(sourceAsset.stored_filename) : null,
      imageMime: sourceAsset?.mime_type,
      videoLocalPath: sourceAsset?.media_type === 'video' ? resolveLocalUploadPath(sourceAsset.stored_filename) : null,
      videoMime: sourceAsset?.mime_type,
    });

    await query('UPDATE users SET credits = credits - $1, updated_at = NOW() WHERE id = $2', [
      creditCost,
      req.user.id,
    ]);

    const projectRes = await query(
      `INSERT INTO projects (user_id, title, tool_type, status, progress, provider, external_task_id, config, credits_charged)
       VALUES ($1, $2, $3, 'queued', 10, 'Runway API', $4, $5, $6)
       RETURNING *`,
      [
        req.user.id,
        title?.trim() || `Publicité IA (${style || 'Studio'})`,
        mode,
        runwayTask.id,
        JSON.stringify({ promptText, style, format, durationSeconds, quality, assetIds }),
        creditCost,
      ]
    );

    const project = projectRes.rows[0];
    await query(
      'INSERT INTO credit_transactions (user_id, project_id, amount, reason) VALUES ($1, $2, $3, $4)',
      [req.user.id, project.id, -creditCost, `Génération IA (${mode}) acceptée par Runway`]
    );

    res.status(201).json({ project });
  } catch (err) {
    console.error('[VIDEO GENERATE]', err);
    res.status(500).json({ error: err.message || 'Erreur lors de la génération vidéo IA.' });
  }
});

app.get('/api/video/tasks/:projectId', requireAuth, async (req, res) => {
  try {
    const projRes = await query(
      'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
      [req.params.projectId, req.user.id]
    );
    if (projRes.rows.length === 0) {
      return res.status(404).json({ error: 'Projet introuvable.' });
    }

    const project = projRes.rows[0];
    if (!project.external_task_id || project.status === 'completed' || project.status === 'failed') {
      return res.json({ project });
    }

    const liveStatus = await getRunwayTaskStatus(project.external_task_id);
    const updatedRes = await query(
      `UPDATE projects
       SET status = $1, progress = $2, output_url = COALESCE($3, output_url), error_message = $4, updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [liveStatus.status, liveStatus.progress, liveStatus.outputUrl, liveStatus.errorMessage, project.id]
    );

    res.json({ project: updatedRes.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/editor/render', requireAuth, async (req, res) => {
  try {
    const {
      title,
      clips,
      aspectRatio,
      transition,
      zoomEffect,
      overlayText,
      textPosition,
      musicAssetId,
      voiceoverText,
      voiceGender,
      language,
      originalVolume,
      musicVolume,
      generateAutoSubtitles,
    } = req.body;

    if (!Array.isArray(clips) || clips.length === 0) {
      return res.status(400).json({ error: 'Ajoutez au moins une scène dans la timeline.' });
    }

    const resolvedClips = [];
    for (const clip of clips) {
      const assetRes = await query(
        'SELECT * FROM media_assets WHERE id = $1 AND user_id = $2',
        [clip.assetId, req.user.id]
      );
      if (assetRes.rows.length === 0) {
        return res.status(404).json({ error: 'Un des médias sélectionnés est introuvable.' });
      }
      const asset = assetRes.rows[0];
      resolvedClips.push({
        localPath: resolveLocalUploadPath(asset.stored_filename),
        mediaType: asset.media_type,
        trimStart: clip.trimStart || 0,
        duration: clip.duration || 4,
      });
    }

    let musicLocalPath = null;
    if (musicAssetId) {
      const mRes = await query('SELECT * FROM media_assets WHERE id = $1 AND user_id = $2', [
        musicAssetId,
        req.user.id,
      ]);
      if (mRes.rows[0]) {
        musicLocalPath = resolveLocalUploadPath(mRes.rows[0].stored_filename);
      }
    }

    let voiceoverLocalPath = null;
    let srtLocalPath = null;
    if (voiceGender && voiceGender !== 'none' && voiceoverText && voiceoverText.trim()) {
      const vo = await generateVoiceoverMp3({
        text: voiceoverText,
        voiceGender,
        language: language || 'fr',
      });
      if (vo) {
        voiceoverLocalPath = vo.localPath;
        if (generateAutoSubtitles) {
          const srt = await transcribeToSrt({
            mediaLocalPath: vo.localPath,
            language: language || 'fr',
          });
          srtLocalPath = srt.srtPath;
        }
      }
    } else if (generateAutoSubtitles && resolvedClips[0]?.mediaType === 'video') {
      const srt = await transcribeToSrt({
        mediaLocalPath: resolvedClips[0].localPath,
        language: language || 'fr',
      });
      srtLocalPath = srt.srtPath;
    }

    const exported = await renderAutoEditMp4({
      clips: resolvedClips,
      aspectRatio: aspectRatio || '9:16',
      transition: transition || 'fade',
      zoomEffect: Boolean(zoomEffect),
      overlayText,
      textPosition,
      musicLocalPath,
      voiceoverLocalPath,
      originalVolume: originalVolume ?? 1.0,
      musicVolume: musicVolume ?? 0.25,
      srtLocalPath,
    });

    const projectRes = await query(
      `INSERT INTO projects (user_id, title, tool_type, status, progress, provider, config, output_url, credits_charged)
       VALUES ($1, $2, 'auto_edit', 'completed', 100, 'FFmpeg Local Engine', $3, $4, 0)
       RETURNING *`,
      [
        req.user.id,
        title?.trim() || 'Montage FFmpeg Studio',
        JSON.stringify({ aspectRatio, transition, zoomEffect, overlayText, language }),
        exported.publicUrl,
      ]
    );

    res.status(201).json({ project: projectRes.rows[0] });
  } catch (err) {
    console.error('[EDITOR RENDER]', err);
    res.status(500).json({ error: err.message || 'Erreur lors du rendu FFmpeg.' });
  }
});

app.post('/api/audio/tts', requireAuth, async (req, res) => {
  try {
    const { text, voiceGender, language } = req.body;
    const vo = await generateVoiceoverMp3({ text, voiceGender, language });
    res.json({ voiceover: vo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/audio/transcribe', requireAuth, async (req, res) => {
  try {
    const { assetId, language } = req.body;
    const assetRes = await query('SELECT * FROM media_assets WHERE id = $1 AND user_id = $2', [
      assetId,
      req.user.id,
    ]);
    if (assetRes.rows.length === 0) {
      return res.status(404).json({ error: 'Média introuvable.' });
    }
    const localPath = resolveLocalUploadPath(assetRes.rows[0].stored_filename);
    const srt = await transcribeToSrt({ mediaLocalPath: localPath, language });
    res.json({ subtitles: srt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tiktok-shop/generate', requireAuth, async (req, res) => {
  try {
    const { category, productName, verifiedFeatures, targetAudience, offerDetails } = req.body;
    if (!productName || !verifiedFeatures) {
      return res.status(400).json({
        error: 'Le nom du produit et ses caractéristiques vérifiées sont obligatoires.',
      });
    }
    const result = await generateTikTokShopCopy({
      category: category || 'Électronique',
      productName,
      verifiedFeatures,
      targetAudience,
      offerDetails,
    });
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/download/:filename', (req, res) => {
  const filePath = resolveLocalExportPath(req.params.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Fichier introuvable.' });
  }
  res.download(filePath);
});

const distDir = path.resolve(__dirname, '../dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`🐼 PANDA AI STUDIO serveur opérationnel sur http://localhost:${PORT}`);
});
