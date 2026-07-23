import fs from 'fs';
import path from 'path';
import { getDataDir } from './env.js';
import type { AudioQualityPreference } from '../types/index.js';

const AUDIO_CACHE_DIR = path.join(getDataDir(), 'audio-cache');
const TEMP_EXT = '.tmp';

function ensureAudioCacheDir() {
  if (!fs.existsSync(AUDIO_CACHE_DIR)) fs.mkdirSync(AUDIO_CACHE_DIR, { recursive: true });
}

function safeName(videoId: string): string {
  return videoId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function qualitySuffix(preference: AudioQualityPreference): string {
  return preference === 'high' ? '-high' : '';
}

export function getAudioCachePath(
  videoId: string,
  format = 'm4a',
  preference: AudioQualityPreference = 'auto'
): string {
  ensureAudioCacheDir();
  const ext = format === 'webm' ? 'webm' : 'm4a';
  return path.join(AUDIO_CACHE_DIR, `${safeName(videoId)}${qualitySuffix(preference)}.${ext}`);
}

export function getExistingAudioCachePath(
  videoId: string,
  preference: AudioQualityPreference = 'auto'
): string | null {
  ensureAudioCacheDir();
  const base = `${safeName(videoId)}${qualitySuffix(preference)}`;
  for (const ext of ['m4a', 'webm']) {
    const candidate = path.join(AUDIO_CACHE_DIR, `${base}.${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function getTempAudioCachePath(videoId: string): string {
  ensureAudioCacheDir();
  return path.join(AUDIO_CACHE_DIR, `${safeName(videoId)}-${Date.now()}${TEMP_EXT}`);
}

export function commitAudioCache(tempPath: string, finalPath: string): boolean {
  try {
    if (!fs.existsSync(tempPath)) return false;
    const stat = fs.statSync(tempPath);
    if (stat.size <= 0) {
      fs.rmSync(tempPath, { force: true });
      return false;
    }
    fs.renameSync(tempPath, finalPath);
    return true;
  } catch {
    try {
      fs.rmSync(tempPath, { force: true });
    } catch {}
    return false;
  }
}

export function discardAudioCache(tempPath: string) {
  try {
    fs.rmSync(tempPath, { force: true });
  } catch {}
}

export function getAudioCacheStats(): { files: number; bytes: number } {
  ensureAudioCacheDir();
  const files = fs
    .readdirSync(AUDIO_CACHE_DIR)
    .filter((file) => !file.endsWith(TEMP_EXT))
    .map((file) => path.join(AUDIO_CACHE_DIR, file));

  return {
    files: files.length,
    bytes: files.reduce((total, file) => total + fs.statSync(file).size, 0),
  };
}

export function touchAudioCache(filePath: string) {
  try {
    const now = new Date();
    fs.utimesSync(filePath, now, now);
  } catch {}
}

export function enforceAudioCacheLimit(maxBytes: number): { removed: number; bytesRemoved: number } {
  ensureAudioCacheDir();
  if (maxBytes <= 0) return { removed: 0, bytesRemoved: 0 };

  const files = fs
    .readdirSync(AUDIO_CACHE_DIR)
    .filter((file) => !file.endsWith(TEMP_EXT))
    .map((file) => {
      const fullPath = path.join(AUDIO_CACHE_DIR, file);
      const stat = fs.statSync(fullPath);
      return { fullPath, size: stat.size, mtimeMs: stat.mtimeMs };
    })
    .sort((a, b) => a.mtimeMs - b.mtimeMs);

  let total = files.reduce((sum, file) => sum + file.size, 0);
  let removed = 0;
  let bytesRemoved = 0;

  for (const file of files) {
    if (total <= maxBytes) break;
    fs.rmSync(file.fullPath, { force: true });
    total -= file.size;
    removed += 1;
    bytesRemoved += file.size;
  }

  return { removed, bytesRemoved };
}

export function clearAudioCache(): { files: number; bytes: number } {
  const before = getAudioCacheStats();
  for (const file of fs.readdirSync(AUDIO_CACHE_DIR)) {
    fs.rmSync(path.join(AUDIO_CACHE_DIR, file), { force: true });
  }
  return before;
}

export function clearAudioCacheForId(videoId: string): { files: number; bytes: number } {
  ensureAudioCacheDir();
  const base = safeName(videoId);
  let files = 0;
  let bytes = 0;

  for (const file of fs.readdirSync(AUDIO_CACHE_DIR)) {
    if (!file.startsWith(`${base}.`) && !file.startsWith(`${base}-`)) continue;
    const fullPath = path.join(AUDIO_CACHE_DIR, file);
    try {
      const stat = fs.statSync(fullPath);
      fs.rmSync(fullPath, { force: true });
      files += 1;
      bytes += stat.size;
    } catch {}
  }

  return { files, bytes };
}

export function listAudioCacheDetailed(): Array<{ videoId: string; filename: string; path: string; bytes: number; cachedAt: number; format: string }> {
  ensureAudioCacheDir();
  const files = fs.readdirSync(AUDIO_CACHE_DIR).filter((file) => !file.endsWith(TEMP_EXT));
  return files.map((file) => {
    const fullPath = path.join(AUDIO_CACHE_DIR, file);
    const stat = fs.statSync(fullPath);
    const ext = path.extname(file);
    const basename = path.basename(file, ext);
    let videoId = basename;
    if (basename.endsWith('-high')) {
      videoId = basename.slice(0, -5);
    }
    return {
      videoId,
      filename: file,
      path: fullPath,
      bytes: stat.size,
      cachedAt: stat.mtimeMs,
      format: ext.slice(1)
    };
  });
}
