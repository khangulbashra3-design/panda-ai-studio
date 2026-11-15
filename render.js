import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import { EXPORTS_DIR } from './storage.js';

const execFileAsync = promisify(execFile);

export async function checkFfmpegAvailable() {
  try {
    const { stdout } = await execFileAsync('ffmpeg', ['-version']);
    const firstLine = stdout.split('\n')[0] || 'FFmpeg installé';
    return { available: true, version: firstLine };
  } catch {
    return {
      available: false,
      version: null,
      message: 'FFmpeg introuvable sur le serveur. Installez FFmpeg (ex: sudo apt install ffmpeg ou brew install ffmpeg).',
    };
  }
}

function getTargetResolution(aspectRatio) {
  switch (aspectRatio) {
    case '9:16':
      return { width: 1080, height: 1920 };
    case '16:9':
      return { width: 1920, height: 1080 };
    case '1:1':
      return { width: 1080, height: 1080 };
    case '4:5':
      return { width: 1080, height: 1350 };
    default:
      return { width: 1080, height: 1920 };
  }
}

function escapeDrawtext(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/\n/g, ' ');
}

export async function renderAutoEditMp4({
  clips,
  aspectRatio = '9:16',
  transition = 'fade',
  zoomEffect = false,
  overlayText = '',
  textPosition = 'bottom',
  musicLocalPath = null,
  voiceoverLocalPath = null,
  originalVolume = 1.0,
  musicVolume = 0.25,
  srtLocalPath = null,
}) {
  const ffmpegStatus = await checkFfmpegAvailable();
  if (!ffmpegStatus.available) {
    throw new Error(ffmpegStatus.message);
  }

  if (!Array.isArray(clips) || clips.length === 0) {
    throw new Error('Aucun clip sélectionné pour le montage.');
  }

  const { width, height } = getTargetResolution(aspectRatio);
  const jobId = uuidv4();
  const tempFiles = [];
  const normalizedClipPaths = [];

  try {
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      if (!clip.localPath || !fs.existsSync(clip.localPath)) {
        throw new Error(`Fichier introuvable pour la scène ${i + 1}.`);
      }

      const segPath = path.join(EXPORTS_DIR, `tmp_${jobId}_seg_${i}.mp4`);
      tempFiles.push(segPath);

      const start = Math.max(0, Number(clip.trimStart) || 0);
      const duration = Math.max(1, Number(clip.duration) || 4);

      const scalePadFilter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30`;
      const zoomFilter = zoomEffect
        ? `,zoompan=z='min(zoom+0.0008,1.12)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}`
        : '';
      const fadeFilter =
        transition === 'fade'
          ? `,fade=t=in:st=0:d=0.35,fade=t=out:st=${Math.max(0.4, duration - 0.35)}:d=0.35`
          : '';

      if (clip.mediaType === 'image') {
        const args = [
          '-y',
          '-loop', '1',
          '-t', String(duration),
          '-i', clip.localPath,
          '-f', 'lavfi',
          '-t', String(duration),
          '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
          '-vf', `${scalePadFilter}${zoomFilter}${fadeFilter}`,
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-shortest',
          segPath,
        ];
        await execFileAsync('ffmpeg', args);
      } else {
        const args = [
          '-y',
          '-ss', String(start),
          '-t', String(duration),
          '-i', clip.localPath,
          '-f', 'lavfi',
          '-t', String(duration),
          '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
          '-vf', `${scalePadFilter}${fadeFilter}`,
          '-filter_complex', `[0:a?]volume=${Number(originalVolume).toFixed(2)}[a0];[a0][1:a]amix=inputs=2:duration=first:dropout_transition=0[aout]`,
          '-map', '0:v',
          '-map', '[aout]',
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-ar', '44100',
          '-ac', '2',
          segPath,
        ];
        try {
          await execFileAsync('ffmpeg', args);
        } catch {
          const fallbackArgs = [
            '-y',
            '-ss', String(start),
            '-t', String(duration),
            '-i', clip.localPath,
            '-f', 'lavfi',
            '-t', String(duration),
            '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
            '-vf', `${scalePadFilter}${fadeFilter}`,
            '-map', '0:v',
            '-map', '1:a',
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-ar', '44100',
            '-ac', '2',
            segPath,
          ];
          await execFileAsync('ffmpeg', fallbackArgs);
        }
      }

      normalizedClipPaths.push(segPath);
    }

    const concatListPath = path.join(EXPORTS_DIR, `tmp_${jobId}_list.txt`);
    tempFiles.push(concatListPath);
    const listContent = normalizedClipPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
    fs.writeFileSync(concatListPath, listContent, 'utf-8');

    const concatenatedPath = path.join(EXPORTS_DIR, `tmp_${jobId}_concat.mp4`);
    tempFiles.push(concatenatedPath);

    await execFileAsync('ffmpeg', [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListPath,
      '-c', 'copy',
      concatenatedPath,
    ]);

    const finalFilename = `panda-export-${jobId}.mp4`;
    const finalExportPath = path.join(EXPORTS_DIR, finalFilename);

    const videoFilters = [];
    if (overlayText && overlayText.trim()) {
      const safeTxt = escapeDrawtext(overlayText.trim());
      const yExpr =
        textPosition === 'top'
          ? 'h*0.12'
          : textPosition === 'center'
          ? '(h-text_h)/2'
          : 'h*0.80';
      videoFilters.push(
        `drawtext=text='${safeTxt}':fontcolor=white:fontsize=${Math.round(width * 0.045)}:box=1:boxcolor=black@0.55:boxborderw=18:x=(w-text_w)/2:y=${yExpr}:alpha='if(lt(t,0.5),t/0.5,1)'`
      );
    }

    if (srtLocalPath && fs.existsSync(srtLocalPath)) {
      const escapedSrt = srtLocalPath.replace(/\\/g, '/').replace(/:/g, '\\:');
      videoFilters.push(`subtitles='${escapedSrt}':force_style='FontSize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3'`);
    }

    const inputs = ['-y', '-i', concatenatedPath];
    let audioMixFilter = '[0:a]anull[aout]';
    let nextInputIdx = 1;

    const hasMusic = musicLocalPath && fs.existsSync(musicLocalPath);
    const hasVoice = voiceoverLocalPath && fs.existsSync(voiceoverLocalPath);

    if (hasMusic && hasVoice) {
      inputs.push('-stream_loop', '-1', '-i', musicLocalPath);
      const musicIdx = nextInputIdx++;
      inputs.push('-i', voiceoverLocalPath);
      const voiceIdx = nextInputIdx++;
      audioMixFilter = `[${musicIdx}:a]volume=${Number(musicVolume).toFixed(2)}[m];[${voiceIdx}:a]volume=1.0[v];[0:a][m][v]amix=inputs=3:duration=first:dropout_transition=2[aout]`;
    } else if (hasMusic) {
      inputs.push('-stream_loop', '-1', '-i', musicLocalPath);
      const musicIdx = nextInputIdx++;
      audioMixFilter = `[${musicIdx}:a]volume=${Number(musicVolume).toFixed(2)}[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=2[aout]`;
    } else if (hasVoice) {
      inputs.push('-i', voiceoverLocalPath);
      const voiceIdx = nextInputIdx++;
      audioMixFilter = `[${voiceIdx}:a]volume=1.0[v];[0:a][v]amix=inputs=2:duration=first:dropout_transition=2[aout]`;
    }

    const finalArgs = [...inputs];
    if (videoFilters.length > 0) {
      finalArgs.push('-vf', videoFilters.join(','));
    }
    finalArgs.push(
      '-filter_complex', audioMixFilter,
      '-map', '0:v',
      '-map', '[aout]',
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '21',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', '+faststart',
      finalExportPath
    );

    await execFileAsync('ffmpeg', finalArgs);

    return {
      filename: finalFilename,
      publicUrl: `/exports/${finalFilename}`,
    };
  } finally {
    for (const tmp of tempFiles) {
      if (fs.existsSync(tmp)) {
        fs.unlinkSync(tmp);
      }
    }
  }
}
