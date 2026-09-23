import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import net from 'net';
import { Readable } from 'stream';
import { getEnvConfig } from './env.js';

let cachedBinaryPath: string | null = null;
export const SPOTSTREAM_DAEMON_PORT = 3135;
let daemonProcess: ChildProcess | null = null;
let daemonStartingPromise: Promise<boolean> | null = null;
let isDaemonReady = false;

interface MemoryAudioBuffer {
  buffer: Buffer;
  contentType: string;
  createdAt: number;
}

const memoryAudioCache = new Map<string, MemoryAudioBuffer>();
const MAX_MEMORY_TRACKS = 3;

export function clearSpotifyMemoryCache(): void {
  memoryAudioCache.clear();
}

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

/**
 * Ensures the persistent spotstream streaming daemon is running in the background.
 * The daemon keeps the Spotify AccessPoint session warm in RAM so tracks start in ~1s.
 */
export async function ensureSpotifyDaemon(): Promise<boolean> {
  if (isDaemonReady && daemonProcess && !daemonProcess.killed) {
    return true;
  }
  if (daemonStartingPromise) {
    return daemonStartingPromise;
  }

  daemonStartingPromise = (async () => {
    const binaryPath = resolveSpotstreamBinaryPath();
    if (!binaryPath) return false;
    const cacheDir = resolveSpotifyCacheDir();

    try {
      // Check if something is already listening on the port
      const alreadyListening = await new Promise<boolean>((resolve) => {
        const client = net.connect(SPOTSTREAM_DAEMON_PORT, '127.0.0.1', () => {
          client.destroy();
          resolve(true);
        });
        client.on('error', () => resolve(false));
      });

      if (alreadyListening) {
        isDaemonReady = true;
        return true;
      }

      console.info(`[spotifyDirect] Spawning persistent spotstream daemon on port ${SPOTSTREAM_DAEMON_PORT}...`);
      const proc = spawn(binaryPath, ['--cache-dir', cacheDir, 'daemon', '--port', String(SPOTSTREAM_DAEMON_PORT)], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      daemonProcess = proc;

      proc.on('exit', (code) => {
        console.warn(`[spotifyDirect] spotstream daemon exited with code ${code}`);
        isDaemonReady = false;
        daemonProcess = null;
        // Auto restart if still enabled
        if (isSpotifyDirectEnabled()) {
          setTimeout(() => ensureSpotifyDaemon().catch(() => {}), 2000);
        }
      });

      // Wait for {"status":"ready"} from daemon stdout
      const ready = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => resolve(false), 10000);
        proc.stdout?.on('data', (data) => {
          const text = data.toString();
          if (text.includes('"status":"ready"')) {
            clearTimeout(timeout);
            resolve(true);
          }
        });
        proc.on('error', () => {
          clearTimeout(timeout);
          resolve(false);
        });
      });

      isDaemonReady = ready;
      if (ready) {
        console.info('[spotifyDirect] spotstream daemon is warm and ready for instant playback!');
      }
      return ready;
    } finally {
      daemonStartingPromise = null;
    }
  })();

  return daemonStartingPromise;
}

/**
 * Cleanly terminates the persistent spotstream daemon when switching back to YouTube Match or on shutdown.
 */
export function stopSpotifyDaemon(): void {
  if (daemonProcess) {
    console.info('[spotifyDirect] Stopping spotstream daemon...');
    try {
      daemonProcess.kill();
    } catch {}
    daemonProcess = null;
    isDaemonReady = false;
  }
}

/**
 * Prefetches a Spotify Direct track into memory in the background.
 * Buffered chunks are held in an in-memory Map so playback triggers in 0ms.
 */
export async function prefetchSpotifyDirectTrack(rawId: string): Promise<void> {
  const cleanId = cleanSpotifyId(rawId);
  if (!cleanId || memoryAudioCache.has(cleanId)) return;

  const ready = await ensureSpotifyDaemon();
  if (!ready) return;

  console.info(`[spotifyDirect] Prefetching ${cleanId} into RAM in background...`);

  return new Promise<void>((resolve) => {
    let resolved = false;
    const finish = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };

    const timeout = setTimeout(() => {
      finish();
    }, 20000);

    const socket = net.connect(SPOTSTREAM_DAEMON_PORT, '127.0.0.1');
    socket.write(`STREAM ${cleanId}\n`);

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
        '-cluster_time_limit', '100',
        '-cluster_size_limit', '4096',
        '-f', 'webm',
        'pipe:1',
      ],
      {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );

    const chunks: Buffer[] = [];
    socket.pipe(ffmpegProc.stdin);

    ffmpegProc.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      // Once we have buffered 256KB (~15 seconds of audio), resolve promise so caller unblocks
      const total = chunks.reduce((acc, c) => acc + c.length, 0);
      if (total > 256000) {
        finish();
      }
    });

    const cleanup = () => {
      clearTimeout(timeout);
      try { socket.destroy(); } catch {}
      try { ffmpegProc.kill(); } catch {}
      if (chunks.length > 0) {
        const fullBuffer = Buffer.concat(chunks);
        if (fullBuffer.length > 64000) {
          if (memoryAudioCache.size >= MAX_MEMORY_TRACKS) {
            const oldestKey = memoryAudioCache.keys().next().value;
            if (oldestKey) memoryAudioCache.delete(oldestKey);
          }
          memoryAudioCache.set(cleanId, {
            buffer: fullBuffer,
            contentType: 'audio/webm',
            createdAt: Date.now(),
          });
          console.info(`[spotifyDirect] Prefetched and held ${fullBuffer.length} bytes in RAM for ${cleanId}`);
        }
      }
      finish();
    };

    socket.on('error', cleanup);
    ffmpegProc.on('error', cleanup);
    ffmpegProc.stdout.on('close', cleanup);
  });
}

export interface SpotifyAudioStreamResult {
  stream: Readable;
  contentType: string;
  destroy: () => void;
}

export function streamSpotifyDirectTrack(rawId: string): SpotifyAudioStreamResult {
  const cleanId = cleanSpotifyId(rawId);

  // 1. Check in-memory stream cache first for instant 0ms playback
  const cached = memoryAudioCache.get(cleanId);
  if (cached && cached.buffer.length > 64000) {
    console.info(`[spotifyDirect:${cleanId}] Serving INSTANTLY from in-memory RAM cache (${cached.buffer.length} bytes)`);
    const stream = Readable.from(cached.buffer);
    return {
      stream,
      contentType: cached.contentType,
      destroy: () => stream.destroy(),
    };
  }

  // If daemon is warm and ready, stream via high-speed TCP socket without AP reconnect overhead
  if (isDaemonReady) {
    const socket = net.connect(SPOTSTREAM_DAEMON_PORT, '127.0.0.1');
    socket.write(`STREAM ${cleanId}\n`);

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
        '-cluster_time_limit', '100',
        '-cluster_size_limit', '4096',
        '-f', 'webm',
        'pipe:1',
      ],
      {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );

    const chunks: Buffer[] = [];
    ffmpegProc.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    let isDestroyed = false;
    const killStream = () => {
      if (isDestroyed) return;
      isDestroyed = true;
      try {
        socket.destroy();
      } catch {}
      try {
        ffmpegProc.stdin?.destroy();
        ffmpegProc.stdout?.destroy();
        ffmpegProc.kill();
      } catch {}

      if (chunks.length > 0) {
        const fullBuffer = Buffer.concat(chunks);
        if (fullBuffer.length > 64000) {
          if (memoryAudioCache.size >= MAX_MEMORY_TRACKS) {
            const oldestKey = memoryAudioCache.keys().next().value;
            if (oldestKey) memoryAudioCache.delete(oldestKey);
          }
          memoryAudioCache.set(cleanId, {
            buffer: fullBuffer,
            contentType: 'audio/webm',
            createdAt: Date.now(),
          });
        }
      }
    };

    socket.pipe(ffmpegProc.stdin);

    socket.on('error', (err) => {
      console.warn(`[spotify-socket:${cleanId}] socket error:`, err);
      killStream();
    });

    ffmpegProc.stdout.on('close', killStream);
    ffmpegProc.stdout.on('error', killStream);

    return {
      stream: ffmpegProc.stdout,
      contentType: 'audio/webm',
      destroy: killStream,
    };
  }

  // Fallback: spawn one-shot spotstream process if daemon is not active, and kick off daemon warm-up
  ensureSpotifyDaemon().catch(() => {});

  const binaryPath = resolveSpotstreamBinaryPath();
  if (!binaryPath) {
    throw new Error('spotstream binary not found on system');
  }

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
      '-cluster_time_limit', '100',
      '-cluster_size_limit', '4096',
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
  ffmpegProc.stdout.on('close', killProcesses);
  ffmpegProc.stdout.on('error', killProcesses);

  return {
    stream: ffmpegProc.stdout,
    contentType: 'audio/webm',
    destroy: killProcesses,
  };
}
