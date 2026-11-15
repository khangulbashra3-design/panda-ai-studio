import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

export const STORAGE_ROOT = path.resolve(process.env.STORAGE_DIR || './storage');
export const UPLOADS_DIR = path.join(STORAGE_ROOT, 'uploads');
export const EXPORTS_DIR = path.join(STORAGE_ROOT, 'exports');

for (const dir of [STORAGE_ROOT, UPLOADS_DIR, EXPORTS_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_VIDEO_MIMES = ['video/mp4', 'video/quicktime', 'video/webm'];
const ALLOWED_AUDIO_MIMES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/mp4'];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

function fileFilter(_req, file, cb) {
  const allowed = [...ALLOWED_IMAGE_MIMES, ...ALLOWED_VIDEO_MIMES, ...ALLOWED_AUDIO_MIMES];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Format de fichier non autorisé (${file.mimetype}). Formats acceptés : JPG, PNG, WEBP, MP4, MOV, WEBM, MP3, WAV.`));
  }
}

export const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 250 * 1024 * 1024,
    files: 10,
  },
});

export function classifyMediaType(mimeType) {
  if (ALLOWED_IMAGE_MIMES.includes(mimeType)) return 'image';
  if (ALLOWED_VIDEO_MIMES.includes(mimeType)) return 'video';
  if (ALLOWED_AUDIO_MIMES.includes(mimeType)) return 'audio';
  return 'unknown';
}

export function resolveLocalUploadPath(storedFilename) {
  const safeName = path.basename(storedFilename);
  return path.join(UPLOADS_DIR, safeName);
}

export function resolveLocalExportPath(exportFilename) {
  const safeName = path.basename(exportFilename);
  return path.join(EXPORTS_DIR, safeName);
}
