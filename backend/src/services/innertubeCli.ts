import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { AudioQualityPreference, AudioStreamInfo, Track } from '../types/index.js';

let cachedBinaryPath: string | null = null;

export function resolveInnertubeBinaryPath(): string | undefined {
  if (cachedBinaryPath && fs.existsSync(cachedBinaryPath)) {
    return cachedBinaryPath;
  }

  const envPath = process.env.INNERTUBE_PATH;
  if (envPath) {
    try {
      if (fs.existsSync(envPath)) {
        cachedBinaryPath = envPath;
        return envPath;
      }
    } catch {}
  }

  const exeDir = path.dirname(process.execPath);
  const roots = [process.cwd(), exeDir];
  const binaryNames = process.platform === 'win32' ? ['innertube.exe', 'innertube'] : ['innertube', 'innertube_linux'];

  const candidates = roots.flatMap((root) =>
    binaryNames.flatMap((name) => [
      path.join(root, 'src-tauri', 'resources', name),
      path.join(root, '..', 'src-tauri', 'resources', name),
      path.join(root, 'resources', name),
      path.join(root, 'bin', name),
      path.join(root, name),
    ])
  );

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      cachedBinaryPath = candidate;
      return candidate;
    }
  }

  return undefined;
}

export function isInnertubeCliAvailable(): boolean {
  return Boolean(resolveInnertubeBinaryPath());
}

async function execInnertubeCli<T>(args: string[]): Promise<T> {
  const binaryPath = resolveInnertubeBinaryPath();
  if (!binaryPath) {
    throw new Error('innertube CLI binary not found on system');
  }

  return new Promise<T>((resolve, reject) => {
    const proc = spawn(binaryPath, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err) => {
      reject(err);
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`innertube CLI exited with code ${code}: ${stderr || stdout}`));
      }

      try {
        const json = JSON.parse(stdout.trim()) as T;
        resolve(json);
      } catch (err) {
        reject(new Error(`Failed to parse innertube CLI JSON output: ${(err as Error).message}\nOutput was: ${stdout}`));
      }
    });
  });
}

export async function resolveAudioUrlWithInnertube(
  videoId: string,
  _preference: AudioQualityPreference = 'high'
): Promise<AudioStreamInfo> {
  interface StreamCliOutput {
    audio?: {
      url: string;
      mimeType: string;
      bitrate: number;
      contentLength?: number;
    };
    videoId: string;
  }

  const cleanId = videoId.replace(/^(youtube|ytdlp):/, '').trim();
  const data = await execInnertubeCli<StreamCliOutput>(['stream', cleanId]);

  if (!data.audio?.url) {
    throw new Error(`innertube CLI returned no audio stream URL for ${videoId}`);
  }

  return {
    videoId: cleanId,
    url: data.audio.url,
    format: data.audio.mimeType.includes('webm') ? 'webm' : 'm4a',
    quality: 'high',
    qualityPreference: _preference,
    expiry: Date.now() + 86400000,
    resolverSource: 'innertube',
  };
}

export async function resolveTrackWithInnertube(
  videoId: string,
  originalQuery: string,
  preference: AudioQualityPreference = 'high'
): Promise<{ track: Track; audio: AudioStreamInfo }> {
  interface InfoCliOutput {
    id: string;
    title: string;
    author: string;
    channelId?: string;
    durationSeconds: number;
    thumbnailUrl?: string;
  }

  const cleanId = videoId.replace(/^(youtube|ytdlp):/, '').trim();
  const [audio, info] = await Promise.all([
    resolveAudioUrlWithInnertube(cleanId, preference),
    execInnertubeCli<InfoCliOutput>(['info', cleanId]).catch(() => null),
  ]);

  const track: Track = {
    id: cleanId,
    title: info?.title || originalQuery || 'Unknown Title',
    artist: info?.author || 'Unknown Artist',
    artistId: info?.channelId,
    album: '',
    duration: info?.durationSeconds || 0,
    thumbnail: info?.thumbnailUrl || '',
    query: originalQuery || cleanId,
    youtubeId: cleanId,
    youtubeTitle: info?.title,
    youtubeArtist: info?.author,
  };

  return { track, audio };
}

export async function searchTracksWithInnertube(query: string, limit = 10): Promise<Track[]> {
  interface SearchItemCli {
    id: string;
    title: string;
    artist?: string;
    author?: string;
    channelId?: string;
    duration?: number;
    durationSeconds?: number;
    thumbnail?: string;
    thumbnailUrl?: string;
  }

  const results = await execInnertubeCli<SearchItemCli[]>(['search', query, '--limit', String(limit)]);

  return (results || []).map((v) => ({
    id: v.id,
    title: v.title,
    artist: v.artist || v.author || 'Unknown Artist',
    artistId: v.channelId,
    album: '',
    duration: v.duration || v.durationSeconds || 0,
    thumbnail: v.thumbnail || v.thumbnailUrl || '',
    query,
    youtubeId: v.id,
    youtubeTitle: v.title,
    youtubeArtist: v.artist || v.author,
  }));
}
