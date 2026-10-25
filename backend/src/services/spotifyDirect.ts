import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import net from 'net';
import { Readable } from 'stream';
import { getEnvConfig } from './env.js';
import { getCachedBySpotifyId } from './cache.js';

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
let activeSpotifyStreamKill: (() => void) | null = null;

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

  // 2. Check bundled resources or workspace relative paths
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
      pipeChildLogs(proc, 'spotstream');

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

/** Forward a child process's stdout/stderr into the backend log.
 *
 * A piped but unread stdio stream fills its OS pipe buffer (~64 KB on Windows)
 * and blocks the child on its next write. That is exactly how the spotstream
 * daemon used to wedge permanently after a few minutes of playback: it kept
 * logging to a stderr nobody drained until the write never returned.
 */
function pipeChildLogs(proc: ChildProcess, label: string) {
  const forward = (chunk: Buffer) => {
    const text = chunk.toString().trim();
    if (!text) return;
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed) console.info(`[${label}] ${trimmed}`);
    }
  };
  proc.stdout?.on('data', forward);
  proc.stderr?.on('data', forward);
  // Swallow EPIPE/stream errors so a dying child cannot crash the backend.
  proc.stdout?.on('error', () => {});
  proc.stderr?.on('error', () => {});
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

export interface SpotifyAudioStreamResult {
  stream: Readable;
  contentType: string;
  contentLength?: number;
  destroy: () => void;
}

// The daemon can end up alive-but-mute (dead AccessPoint session, wedged stream
// loop). Without a first-byte deadline the HTTP response hangs forever and the
// player sits on "Resolving audio..." with no error to recover from.
const DAEMON_FIRST_BYTE_TIMEOUT_MS = 9000;

function restartSpotifyDaemon(reason: string) {
  console.warn(`[spotifyDirect] Restarting spotstream daemon: ${reason}`);
  const proc = daemonProcess;
  isDaemonReady = false;
  daemonProcess = null;
  try {
    proc?.kill();
  } catch {}
  setTimeout(() => {
    void ensureSpotifyDaemon().catch(() => {});
  }, 700);
}

export function streamSpotifyDirectTrack(rawId: string, expectedDurationSeconds?: number): SpotifyAudioStreamResult {
  const cleanId = cleanSpotifyId(rawId);

  // Abort any currently active Spotify Direct stream before launching a new one,
  // preventing concurrent TCP connections from colliding on the spotstream daemon.
  if (activeSpotifyStreamKill) {
    try {
      activeSpotifyStreamKill();
    } catch {}
    activeSpotifyStreamKill = null;
  }

  const durationSec = expectedDurationSeconds ?? (getCachedBySpotifyId(cleanId)?.duration || 0);

  // 1. Check in-memory stream cache first for instant 0ms playback
  const cached = memoryAudioCache.get(cleanId);
  if (cached && cached.buffer.length > 64000) {
    // If expected duration is known (>10s), verify that cached buffer is reasonably complete
    // (at 160kbps WebM Opus, a track averages ~18-20 KB/sec, so minimum acceptable is duration * 10KB).
    const minAcceptableBytes = durationSec > 10 ? durationSec * 10000 : 64000;
    if (cached.buffer.length >= minAcceptableBytes) {
      console.info(`[spotifyDirect:${cleanId}] Serving INSTANTLY from in-memory RAM cache (${cached.buffer.length} bytes)`);
      const stream = Readable.from(cached.buffer);
      return {
        stream,
        contentType: cached.contentType,
        contentLength: cached.buffer.length,
        destroy: () => stream.destroy(),
      };
    } else {
      console.warn(`[spotifyDirect:${cleanId}] Evicting truncated memory cache (${cached.buffer.length} bytes, expected >= ${minAcceptableBytes})`);
      memoryAudioCache.delete(cleanId);
    }
  }

  // Calculate expected PCM bytes (44.1kHz * 2 channels * 2 bytes/sample = 176,400 bytes/sec)
  const expectedPcmBytes = durationSec > 0 ? durationSec * 176400 : 0;

  // If daemon is warm and ready, stream via high-speed TCP socket without AP reconnect overhead
  if (isDaemonReady) {
    const socket = net.connect(SPOTSTREAM_DAEMON_PORT, '127.0.0.1');
    socket.write(`STREAM ${cleanId}\n`);

    const ffmpegProc = spawn(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel', 'error',
        '-probesize', '32',
        '-analyzeduration', '0',
        '-f', 's16le',
        '-ar', '44100',
        '-ac', '2',
        '-i', 'pipe:0',
        '-c:a', 'libopus',
        '-b:a', '160k',
        '-vbr', 'on',
        '-application', 'lowdelay',
        '-frame_duration', '20',
        '-cluster_time_limit', '50',
        '-cluster_size_limit', '2048',
        '-flush_packets', '1',
        '-f', 'webm',
        'pipe:1',
      ],
      {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );
    // ffmpeg is quiet at -loglevel error, but an undrained stderr pipe would
    // still block it if it ever writes.
    ffmpegProc.stderr?.resume();

    let silenceTimer: NodeJS.Timeout | null = null;
    let totalBytesReceived = 0;
    let isCompletedCleanly = false;
    let firstByteTimer: NodeJS.Timeout | null = setTimeout(() => {
      firstByteTimer = null;
      if (totalBytesReceived > 0) return;
      console.warn(`[spotifyDirect:${cleanId}] daemon sent no audio within ${DAEMON_FIRST_BYTE_TIMEOUT_MS}ms, restarting daemon`);
      killStream();
      restartSpotifyDaemon('no first byte for stream request');
    }, DAEMON_FIRST_BYTE_TIMEOUT_MS);

    socket.on('data', (chunk: Buffer) => {
      if (firstByteTimer) {
        clearTimeout(firstByteTimer);
        firstByteTimer = null;
      }
      totalBytesReceived += chunk.length;
      if (silenceTimer) clearTimeout(silenceTimer);

      // If we know expected PCM size, check if >= 90% has been transferred.
      // If duration is unknown, require at least 1MB before applying the short silence timer.
      const hasReceivedTarget = expectedPcmBytes > 0
        ? totalBytesReceived >= expectedPcmBytes * 0.9
        : totalBytesReceived > 1024 * 1024;

      // When the song is essentially complete (>90%), a short 1500ms silence cleanly triggers EOF.
      // If the song is still mid-stream (<90%), allow up to 15s for network/CDN buffering before aborting.
      const silenceTimeoutMs = hasReceivedTarget ? 1500 : 15000;

      if (totalBytesReceived > 64000) {
        silenceTimer = setTimeout(() => {
          if (!isDestroyed) {
            isCompletedCleanly = true;
            try {
              ffmpegProc.stdin?.end();
            } catch {}
            try {
              socket.destroy();
            } catch {}
          }
        }, silenceTimeoutMs);
      }
    });

    const chunks: Buffer[] = [];
    ffmpegProc.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    const saveToMemoryCache = () => {
      // ONLY save to RAM cache if the track finished playing to EOF naturally, NEVER if aborted mid-song!
      if (!isCompletedCleanly) return;
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

    let isDestroyed = false;
    const killStream = () => {
      if (isDestroyed) return;
      isDestroyed = true;
      if (activeSpotifyStreamKill === killStream) {
        activeSpotifyStreamKill = null;
      }
      if (silenceTimer) clearTimeout(silenceTimer);
      if (firstByteTimer) clearTimeout(firstByteTimer);
      try {
        socket.destroy();
      } catch {}
      try {
        ffmpegProc.stdin?.destroy();
        ffmpegProc.stdout?.destroy();
        ffmpegProc.kill();
      } catch {}
      saveToMemoryCache();
    };

    activeSpotifyStreamKill = killStream;

    socket.pipe(ffmpegProc.stdin, { end: false });

    socket.on('error', (err) => {
      console.warn(`[spotify-socket:${cleanId}] socket error:`, err);
      killStream();
    });

    ffmpegProc.stdout.on('close', () => {
      saveToMemoryCache();
    });
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
  pipeChildLogs(spotstreamProc, 'spotstream');

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
  ffmpegProc.stderr?.resume();

  let isDestroyed = false;
  const killProcesses = () => {
    if (isDestroyed) return;
    isDestroyed = true;
    if (activeSpotifyStreamKill === killProcesses) {
      activeSpotifyStreamKill = null;
    }
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

  activeSpotifyStreamKill = killProcesses;

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
