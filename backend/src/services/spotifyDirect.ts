import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Readable } from 'stream';
import { getEnvConfig } from './env.js';

let cachedBinaryPath: string | null = null;

export function cleanSpotifyId(id: string): string {
  return (id || '')
    .trim()
    .replace(/^spotify:(track:)?/, '')
    .split('?')[0];
}

export function resolveSpotifyCacheDir(): string {
  if (process.env.SPOTSTREAM_CACHE_DIR) {
    return process.env.SPOTSTREAM_CACHE_DIR;
  }

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(localAppData, 'spotstream', 'cache');
  } else if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'spotstream', 'cache');
  } else {
    const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
    return path.join(dataHome, 'spotstream', 'cache');
  }
}

export function hasSpotifyCredentials(): boolean {
  const cacheDir = resolveSpotifyCacheDir();
  const credPath = path.join(cacheDir, 'credentials.json');
  try {
    return fs.existsSync(credPath) && fs.statSync(credPath).size > 10;
  } catch {
    return false;
  }
}

export function resolveSpotstreamBinaryPath(): string | undefined {
  if (cachedBinaryPath && fs.existsSync(cachedBinaryPath)) {
    return cachedBinaryPath;
  }

  // 1. Check explicit environment variable
  const envPath = process.env.SPOTSTREAM_PATH;
  if (envPath && fs.existsSync(envPath)) {
    cachedBinaryPath = envPath;
    return envPath;
  }

  // 2. Check %LOCALAPPDATA%/avpull/spotstream.exe (User convention)
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    const avpullPath = path.join(localAppData, 'avpull', 'spotstream.exe');
    if (fs.existsSync(avpullPath)) {
      cachedBinaryPath = avpullPath;
      return avpullPath;
    }
  }

  // 3. Check bundled resources or workspace relative paths
  const exeDir = path.dirname(process.execPath);
  const roots = [process.cwd(), exeDir];
  const binaryNames = process.platform === 'win32' ? ['spotstream.exe', 'spotstream'] : ['spotstream'];

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

  // 4. Check if spotstream is in system PATH
  const pathExt = (process.env.PATHEXT || '').split(';');
  const pathDirs = (process.env.PATH || '').split(path.delimiter);
  for (const dir of pathDirs) {
    for (const name of binaryNames) {
      if (process.platform === 'win32') {
        for (const ext of pathExt) {
          const full = path.join(dir, name.endsWith('.exe') ? name : `${name}${ext}`);
          if (fs.existsSync(full)) {
            cachedBinaryPath = full;
            return full;
          }
        }
      } else {
        const full = path.join(dir, name);
        if (fs.existsSync(full)) {
          cachedBinaryPath = full;
          return full;
        }
      }
    }
  }

  return undefined;
}

export function isSpotstreamAvailable(): boolean {
  return Boolean(resolveSpotstreamBinaryPath()) && hasSpotifyCredentials();
}

export function isSpotifyDirectEnabled(): boolean {
  const config = getEnvConfig();
  return config.spotifyPlayback === 'spotify-direct' && isSpotstreamAvailable();
}

export interface SpotifyAudioStreamResult {
  stream: Readable;
  contentType: string;
  destroy: () => void;
}

export function streamSpotifyDirectTrack(rawId: string): SpotifyAudioStreamResult {
  const binaryPath = resolveSpotstreamBinaryPath();
  if (!binaryPath) {
    throw new Error('spotstream binary not found on system');
  }

  const cleanId = cleanSpotifyId(rawId);
  const cacheDir = resolveSpotifyCacheDir();

  const spotstreamProc = spawn(binaryPath, ['--cache-dir', cacheDir, 'stream', cleanId], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const ffmpegProc = spawn(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel', 'error',
      '-f', 's16le',
      '-ar', '44100',
      '-ac', '2',
      '-i', 'pipe:0',
      '-c:a', 'libopus',
      '-b:a', '160k',
      '-vbr', 'on',
      '-f', 'webm',
      'pipe:1',
    ],
    {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    }
  );

  let isDestroyed = false;
  const killProcesses = () => {
    if (isDestroyed) return;
    isDestroyed = true;
    try {
      spotstreamProc.stdout?.destroy();
      spotstreamProc.kill();
    } catch {}
    try {
      ffmpegProc.stdin?.destroy();
      ffmpegProc.stdout?.destroy();
      ffmpegProc.kill();
    } catch {}
  };

  spotstreamProc.stderr?.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg.includes('ERROR') || msg.includes('Error') || msg.includes('Failed')) {
      console.warn(`[spotstream:${cleanId}] ${msg}`);
    }
  });

  spotstreamProc.on('error', (err) => {
    console.warn(`[spotstream:${cleanId}] process error:`, err);
    killProcesses();
  });

  spotstreamProc.on('close', (code) => {
    if (code !== 0 && code !== null) {
      console.warn(`[spotstream:${cleanId}] exited with code ${code}`);
    }
  });

  ffmpegProc.stderr?.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) {
      console.warn(`[ffmpeg-spotify:${cleanId}] ${msg}`);
    }
  });

  ffmpegProc.on('error', (err) => {
    console.warn(`[ffmpeg-spotify:${cleanId}] process error:`, err);
    killProcesses();
  });

  spotstreamProc.stdout.pipe(ffmpegProc.stdin);

  ffmpegProc.stdout.on('close', () => {
    killProcesses();
  });

  ffmpegProc.stdout.on('error', () => {
    killProcesses();
  });

  return {
    stream: ffmpegProc.stdout,
    contentType: 'audio/webm',
    destroy: killProcesses,
  };
}
