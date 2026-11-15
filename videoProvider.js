import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const RUNWAY_BASE_URL = process.env.RUNWAY_BASE_URL || 'https://api.dev.runwayml.com/v1';
const RUNWAY_API_VERSION = process.env.RUNWAY_API_VERSION || '2024-11-06';

export function getVideoEngineStatus() {
  const connected = Boolean(process.env.RUNWAY_API_KEY && process.env.RUNWAY_API_KEY.trim().length > 10);
  return {
    connected,
    provider: 'Runway API (Gen-4 / Gen-3 Alpha Turbo)',
    supportedDurationsSeconds: [5, 10],
    supportedRatios: ['720:1280', '1280:720', '960:960', '1104:832', '832:1104'],
    supportedQualities: connected ? ['720p', '1080p (Upscale)'] : [],
    message: connected
      ? 'Moteur vidéo IA connecté (Runway API).'
      : 'Moteur IA non connecté : configurez RUNWAY_API_KEY dans le fichier .env côté serveur.',
  };
}

function mapFormatToRunwayRatio(format) {
  switch (format) {
    case '9:16':
      return '720:1280';
    case '16:9':
      return '1280:720';
    case '1:1':
      return '960:960';
    case '4:5':
      return '832:1104';
    default:
      return '720:1280';
  }
}

function fileToDataUri(localPath, mimeType) {
  const buffer = fs.readFileSync(localPath);
  const base64 = buffer.toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

async function runwayFetch(endpoint, options = {}) {
  const apiKey = process.env.RUNWAY_API_KEY;
  if (!apiKey) {
    throw new Error('Moteur IA non connecté : RUNWAY_API_KEY absente sur le serveur.');
  }

  const response = await fetch(`${RUNWAY_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'X-Runway-Version': RUNWAY_API_VERSION,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.error || data?.message || `Erreur HTTP ${response.status} de l'API Runway`;
    throw new Error(detail);
  }
  return data;
}

export async function createRunwayGenerationTask({ mode, promptText, style, format, durationSeconds, imageLocalPath, imageMime, videoLocalPath, videoMime }) {
  const ratio = mapFormatToRunwayRatio(format);
  const clipDuration = Number(durationSeconds) >= 10 ? 10 : 5;
  const fullPrompt = `[Style: ${style}] ${promptText}`.slice(0, 1000);

  if (mode === 'image_to_video') {
    if (!imageLocalPath) {
      throw new Error('Une image source est requise pour la génération Photos vers vidéo.');
    }
    const promptImage = fileToDataUri(imageLocalPath, imageMime || 'image/jpeg');
    return runwayFetch('/image_to_video', {
      method: 'POST',
      body: JSON.stringify({
        model: 'gen4_turbo',
        promptImage,
        promptText: fullPrompt,
        ratio,
        duration: clipDuration,
      }),
    });
  }

  if (mode === 'text_to_video') {
    return runwayFetch('/text_to_video', {
      method: 'POST',
      body: JSON.stringify({
        model: 'gen4_turbo',
        promptText: fullPrompt,
        ratio,
        duration: clipDuration,
      }),
    });
  }

  if (mode === 'video_to_video') {
    if (!videoLocalPath) {
      throw new Error('Une vidéo source est requise pour transformer une vidéo existante.');
    }
    const videoUri = fileToDataUri(videoLocalPath, videoMime || 'video/mp4');
    return runwayFetch('/video_to_video', {
      method: 'POST',
      body: JSON.stringify({
        model: 'gen4_aleph',
        videoUri,
        promptText: fullPrompt,
        ratio,
      }),
    });
  }

  throw new Error(`Mode de génération non pris en charge : ${mode}`);
}

export async function getRunwayTaskStatus(taskId) {
  const task = await runwayFetch(`/tasks/${encodeURIComponent(taskId)}`, {
    method: 'GET',
  });

  let mappedStatus = 'processing';
  let progress = typeof task.progress === 'number' ? Math.round(task.progress * 100) : 15;

  if (task.status === 'PENDING' || task.status === 'THROTTLED') {
    mappedStatus = 'queued';
    progress = 10;
  } else if (task.status === 'RUNNING') {
    mappedStatus = 'processing';
    progress = Math.max(20, progress);
  } else if (task.status === 'SUCCEEDED') {
    mappedStatus = 'completed';
    progress = 100;
  } else if (task.status === 'FAILED' || task.status === 'CANCELLED') {
    mappedStatus = 'failed';
    progress = 0;
  }

  const outputUrl = Array.isArray(task.output) && task.output.length > 0 ? task.output[0] : null;
  const errorMessage = task.failure || task.failureCode || null;

  return {
    rawStatus: task.status,
    status: mappedStatus,
    progress,
    outputUrl,
    errorMessage,
  };
}
