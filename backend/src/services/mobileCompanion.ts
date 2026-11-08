import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { getDataDir, getEnvConfig, saveEnvConfig } from './env.js';

export const MOBILE_BACKEND_PORT = 3130;

export type MobileCompanionState = 'stopped' | 'starting' | 'running' | 'error';

export interface MobileCompanionStatus {
  state: MobileCompanionState;
  port: number;
  backendRunning: boolean;
  backendPid: number | null;
  tunnelRunning: boolean;
  tunnelConnected: boolean;
  tunnelPid: number | null;
  publicUrl: string | null;
  lastError: string | null;
  cloudflaredInstalled: boolean;
  cloudflaredPath: string | null;
  installingCloudflared: boolean;
  separateDb: boolean;
  tunnelMode: 'quick' | 'token';
  hasTunnelToken: boolean;
  customDomain: string;
  apiKey: string;
  logs: string[];
}

let backendProc: ChildProcess | null = null;
let tunnelProc: ChildProcess | null = null;
let currentState: MobileCompanionState = 'stopped';
let tunnelConnected = false;
let detectedPublicUrl: string | null = null;
let lastError: string | null = null;
let installingCloudflared = false;
let startPromise: Promise<MobileCompanionStatus> | null = null;
let cachedCloudflaredPath: string | null = null;

const MAX_LOG_LINES = 50;
const recentLogs: string[] = [];

function pushLog(tag: string, rawLine: string) {
  const clean = rawLine.replace(/\x1b\[[0-9;]*m/g, '').trim();
  if (!clean) return;
  const entry = `[${new Date().toISOString().slice(11, 19)}] [${tag}] ${clean}`;
  recentLogs.push(entry);
  if (recentLogs.length > MAX_LOG_LINES) {
    recentLogs.splice(0, recentLogs.length - MAX_LOG_LINES);
  }
}

function pipeChildLogs(
  proc: ChildProcess,
  tag: string,
  onLine?: (line: string) => void
) {
  const attach = (stream: NodeJS.ReadableStream | null) => {
    if (!stream) return;
    let remainder = '';
    stream.on('data', (chunk: Buffer | string) => {
      remainder += chunk.toString();
      const lines = remainder.split(/\r?\n/);
      remainder = lines.pop() ?? '';
      for (const line of lines) {
        pushLog(tag, line);
        onLine?.(line);
      }
    });
    stream.on('end', () => {
      if (remainder.trim()) {
        pushLog(tag, remainder);
        onLine?.(remainder);
      }
      remainder = '';
    });
  };

  attach(proc.stdout);
  attach(proc.stderr);
}

export function normalizeTunnelToken(raw: string): string {
  if (!raw) return '';
  let cleaned = raw
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .replace(/^cloudflared(?:\.exe)?\s+service\s+install\s+/i, '')
    .replace(/^cloudflared(?:\.exe)?\s+tunnel\s+(?:--no-autoupdate\s+)?run\s+--token\s+/i, '')
    .trim();

  // If multiple whitespace-separated tokens remain, extract the JWT/base64 token
  if (/\s/.test(cleaned)) {
    const parts = cleaned.split(/\s+/);
    const tokenCandidate = parts.find((p) => p.startsWith('eyJ') && p.length > 40);
    if (tokenCandidate) {
      cleaned = tokenCandidate.replace(/^["']+|["']+$/g, '');
    }
  }
  return cleaned;
}

export function generateMobileApiKey(): string {
  return `noc_${crypto.randomBytes(12).toString('hex')}`;
}

export function resolveCloudflaredPath(): string | null {
  if (cachedCloudflaredPath && fs.existsSync(cachedCloudflaredPath)) {
    return cachedCloudflaredPath;
  }

  const envPath = process.env.CLOUDFLARED_PATH?.trim();
  if (envPath && fs.existsSync(envPath)) {
    cachedCloudflaredPath = envPath;
    return envPath;
  }

  const binNames = process.platform === 'win32' ? ['cloudflared.exe'] : ['cloudflared'];
  const exeDir = path.dirname(process.execPath);
  const dataBinDir = path.join(getDataDir(), 'bin');

  const candidates: string[] = [
    ...binNames.map((n) => path.join(dataBinDir, n)),
    ...binNames.map((n) => path.join(exeDir, 'resources', n)),
    ...binNames.map((n) => path.join(process.cwd(), 'src-tauri', 'resources', n)),
    ...binNames.map((n) => path.join(process.cwd(), '..', 'src-tauri', 'resources', n)),
  ];

  if (process.platform === 'win32') {
    candidates.push(
      'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
      'C:\\Program Files\\cloudflared\\cloudflared.exe'
    );
  } else {
    candidates.push('/usr/local/bin/cloudflared', '/usr/bin/cloudflared');
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      cachedCloudflaredPath = candidate;
      return candidate;
    }
  }

  // Probe system PATH
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    const target = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
    const res = spawnSync(cmd, [target], { encoding: 'utf-8', windowsHide: true, timeout: 2500 });
    if (res.status === 0 && res.stdout) {
      const firstLine = res.stdout.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
      if (firstLine && fs.existsSync(firstLine)) {
        cachedCloudflaredPath = firstLine;
        return firstLine;
      }
    }
  } catch {}

  return null;
}

export async function installCloudflaredBinary(): Promise<string> {
  const existing = resolveCloudflaredPath();
  if (existing) return existing;

  if (installingCloudflared) {
    throw new Error('cloudflared download is already in progress');
  }

  installingCloudflared = true;
  try {
    const binDir = path.join(getDataDir(), 'bin');
    fs.mkdirSync(binDir, { recursive: true });

    let downloadUrl = '';
    let fileName = 'cloudflared';
    if (process.platform === 'win32') {
      downloadUrl = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';
      fileName = 'cloudflared.exe';
    } else if (process.platform === 'linux') {
      downloadUrl =
        process.arch === 'arm64'
          ? 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64'
          : 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64';
    } else {
      throw new Error('Automatic cloudflared download is not supported on this OS; install cloudflared manually.');
    }

    const destPath = path.join(binDir, fileName);
    const tmpPath = `${destPath}.download`;
    pushLog('installer', `Downloading cloudflared from ${downloadUrl}`);

    const res = await fetch(downloadUrl, { redirect: 'follow' });
    if (!res.ok || !res.body) {
      throw new Error(`Failed to download cloudflared (HTTP ${res.status})`);
    }

    const out = fs.createWriteStream(tmpPath);
    await pipeline(Readable.fromWeb(res.body as any), out);

    if (process.platform !== 'win32') {
      fs.chmodSync(tmpPath, 0o755);
    }
    fs.renameSync(tmpPath, destPath);
    cachedCloudflaredPath = destPath;
    pushLog('installer', `Installed cloudflared to ${destPath}`);
    return destPath;
  } finally {
    installingCloudflared = false;
  }
}

function killPidTree(pid: number) {
  if (!pid || pid <= 0) return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], {
        stdio: 'ignore',
        windowsHide: true,
        timeout: 3000,
      });
    } else {
      process.kill(pid, 'SIGTERM');
    }
  } catch {}
}

function cleanupStaleMobilePidFiles() {
  const baseDir = getDataDir();
  const pidPaths = [
    path.join(baseDir, 'noctune-mobile-backend.pid'),
    path.join(baseDir, 'mobile', 'noctune-mobile-backend.pid'),
  ];
  for (const pidFile of pidPaths) {
    if (!fs.existsSync(pidFile)) continue;
    try {
      const pid = Number(fs.readFileSync(pidFile, 'utf-8').trim());
      if (Number.isInteger(pid) && pid > 0 && pid !== process.pid) {
        killPidTree(pid);
      }
    } catch {}
    try {
      fs.rmSync(pidFile, { force: true });
    } catch {}
  }
}

function resolveBackendWorkerCommand(): { command: string; args: string[]; cwd: string } {
  // Packaged Tauri sidecar binary (pkg)
  if ((process as any).pkg) {
    return {
      command: process.execPath,
      args: [],
      cwd: path.dirname(process.execPath),
    };
  }

  // Dev / Node workspace resolution
  const candidateRoots = [
    process.cwd(),
    path.join(process.cwd(), 'backend'),
    path.resolve(__dirname, '..'),
    path.resolve(__dirname, '..', '..'),
  ];

  const backendRoot =
    candidateRoots.find((dir) => fs.existsSync(path.join(dir, 'src', 'index.ts'))) ||
    candidateRoots.find((dir) => fs.existsSync(path.join(dir, 'dist', 'index.js'))) ||
    process.cwd();

  const srcEntry = path.join(backendRoot, 'src', 'index.ts');
  const distEntry = path.join(backendRoot, 'dist', 'index.js');

  const tsxCandidates = [
    path.join(backendRoot, '..', 'node_modules', 'tsx', 'dist', 'cli.mjs'),
    path.join(backendRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
    path.join(backendRoot, '..', 'node_modules', 'tsx', 'dist', 'cli.cjs'),
    path.join(backendRoot, 'node_modules', 'tsx', 'dist', 'cli.cjs'),
  ];
  const tsxCli = tsxCandidates.find((p) => fs.existsSync(p));

  if (tsxCli && fs.existsSync(srcEntry)) {
    return {
      command: process.execPath,
      args: [tsxCli, srcEntry],
      cwd: backendRoot,
    };
  }

  if (fs.existsSync(distEntry)) {
    return {
      command: process.execPath,
      args: [distEntry],
      cwd: backendRoot,
    };
  }

  throw new Error('Could not locate backend entry script (src/index.ts or dist/index.js)');
}

async function waitForMobileBackendReady(apiKey: string, timeoutMs = 9000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!backendProc || backendProc.exitCode !== null) {
      return false;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 700);
    try {
      const res = await fetch(`http://127.0.0.1:${MOBILE_BACKEND_PORT}/auth/verify`, {
        headers: { 'X-Noctune-Api-Key': apiKey },
        signal: controller.signal,
      });
      if (res.ok) return true;
    } catch {
      // Still booting
    } finally {
      clearTimeout(timer);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

function seedIsolatedMobileConfigIfNeeded(mobileDataDir: string) {
  fs.mkdirSync(mobileDataDir, { recursive: true });
  const mobileConfigFile = path.join(mobileDataDir, 'config.json');
  const desktopCfg = getEnvConfig();

  let existing: Record<string, unknown> = {};
  if (fs.existsSync(mobileConfigFile)) {
    try {
      existing = JSON.parse(fs.readFileSync(mobileConfigFile, 'utf-8'));
    } catch {}
  }

  const merged = {
    searchEngine: desktopCfg.searchEngine,
    recommendationEngine: desktopCfg.recommendationEngine,
    spotifyPlayback: desktopCfg.spotifyPlayback,
    audioQualityPreference: desktopCfg.audioQualityPreference,
    audioCacheLimitMb: desktopCfg.audioCacheLimitMb,
    discordRpcEnabled: desktopCfg.discordRpcEnabled,
    ...existing,
    // Always sync latest Spotify credentials & enforce strict mobile auth
    spotifyClientId: desktopCfg.spotifyClientId || (existing.spotifyClientId as string) || '',
    spotifyClientSecret: desktopCfg.spotifyClientSecret || (existing.spotifyClientSecret as string) || '',
    apiKey: desktopCfg.mobileApiKey,
    allowLocalhostBypass: false,
  };

  fs.writeFileSync(mobileConfigFile, JSON.stringify(merged, null, 2), 'utf-8');
}

export function getMobileCompanionStatus(): MobileCompanionStatus {
  const cfg = getEnvConfig();
  const cfPath = resolveCloudflaredPath();
  const backendRunning = Boolean(backendProc && backendProc.exitCode === null);
  const tunnelRunning = Boolean(tunnelProc && tunnelProc.exitCode === null);

  let effectiveState = currentState;
  if (currentState === 'running' && !backendRunning) {
    effectiveState = 'error';
  }

  const displayUrl =
    detectedPublicUrl ||
    (cfg.mobileTunnelMode === 'token' && cfg.mobileCustomDomain
      ? cfg.mobileCustomDomain.startsWith('http')
        ? cfg.mobileCustomDomain
        : `https://${cfg.mobileCustomDomain}`
      : null);

  return {
    state: effectiveState,
    port: MOBILE_BACKEND_PORT,
    backendRunning,
    backendPid: backendRunning ? (backendProc?.pid ?? null) : null,
    tunnelRunning,
    tunnelConnected: tunnelRunning && tunnelConnected,
    tunnelPid: tunnelRunning ? (tunnelProc?.pid ?? null) : null,
    publicUrl: backendRunning ? displayUrl : null,
    lastError,
    cloudflaredInstalled: Boolean(cfPath),
    cloudflaredPath: cfPath,
    installingCloudflared,
    separateDb: cfg.mobileSeparateDb ?? true,
    tunnelMode: cfg.mobileTunnelMode ?? 'quick',
    hasTunnelToken: Boolean(normalizeTunnelToken(cfg.mobileTunnelToken)),
    customDomain: cfg.mobileCustomDomain ?? '',
    apiKey: cfg.mobileApiKey ?? '',
    logs: [...recentLogs],
  };
}

export function stopMobileCompanionSync(): void {
  if (tunnelProc) {
    const pid = tunnelProc.pid;
    tunnelProc.removeAllListeners();
    tunnelProc = null;
    if (pid) killPidTree(pid);
  }
  if (backendProc) {
    const pid = backendProc.pid;
    backendProc.removeAllListeners();
    backendProc = null;
    if (pid) killPidTree(pid);
  }
  cleanupStaleMobilePidFiles();
  tunnelConnected = false;
  detectedPublicUrl = null;
  currentState = 'stopped';
}

export async function stopMobileCompanion(): Promise<MobileCompanionStatus> {
  stopMobileCompanionSync();
  pushLog('manager', 'Mobile companion stopped');
  return getMobileCompanionStatus();
}

export async function startMobileCompanion(overrides?: {
  separateDb?: boolean;
  apiKey?: string;
  tunnelMode?: 'quick' | 'token';
  tunnelToken?: string;
  customDomain?: string;
}): Promise<MobileCompanionStatus> {
  if (startPromise) return startPromise;

  startPromise = (async () => {
    await stopMobileCompanion();
    currentState = 'starting';
    lastError = null;
    tunnelConnected = false;
    detectedPublicUrl = null;

    try {
      const currentCfg = getEnvConfig();
      const nextApiKey = (overrides?.apiKey ?? currentCfg.mobileApiKey ?? '').trim() || generateMobileApiKey();
      const nextMode = overrides?.tunnelMode ?? currentCfg.mobileTunnelMode ?? 'quick';
      const nextSeparateDb = overrides?.separateDb ?? currentCfg.mobileSeparateDb ?? true;
      const nextToken =
        overrides?.tunnelToken !== undefined
          ? normalizeTunnelToken(overrides.tunnelToken)
          : normalizeTunnelToken(currentCfg.mobileTunnelToken);
      const nextDomain =
        overrides?.customDomain !== undefined
          ? overrides.customDomain.trim().replace(/\/+$/, '')
          : currentCfg.mobileCustomDomain;

      const cfg = saveEnvConfig({
        mobileApiKey: nextApiKey,
        mobileTunnelMode: nextMode,
        mobileSeparateDb: nextSeparateDb,
        mobileTunnelToken: nextToken,
        mobileCustomDomain: nextDomain,
      });

      if (cfg.mobileTunnelMode === 'token' && !nextToken) {
        throw new Error('Cloudflare Tunnel token is required when Custom Domain mode is selected.');
      }

      const cfPath = resolveCloudflaredPath();
      if (!cfPath) {
        throw new Error('cloudflared binary not found. Click "Install cloudflared" first.');
      }

      // 1. Spawn dedicated port 3130 backend instance
      const desktopDataDir = getDataDir();
      const mobileDataDir = cfg.mobileSeparateDb
        ? path.join(desktopDataDir, 'mobile')
        : desktopDataDir;

      if (cfg.mobileSeparateDb) {
        seedIsolatedMobileConfigIfNeeded(mobileDataDir);
      }

      const workerSpec = resolveBackendWorkerCommand();
      pushLog(
        'manager',
        `Starting mobile backend on 127.0.0.1:${MOBILE_BACKEND_PORT} (${cfg.mobileSeparateDb ? 'isolated DB' : 'synced desktop DB'})`
      );

      const childEnv: NodeJS.ProcessEnv = {
        ...process.env,
        NOCTUNE_MOBILE_INSTANCE: '1',
        PORT: String(MOBILE_BACKEND_PORT),
        HOST: '127.0.0.1',
        DESKTOP_BACKEND_PORT: String(process.env.PORT || 3131),
        APP_DATA_DIR: mobileDataDir,
        NOCTUNE_API_KEY: cfg.mobileApiKey,
        ALLOW_LOCALHOST_BYPASS: 'false',
        SPOTIFY_CLIENT_ID: cfg.spotifyClientId || process.env.SPOTIFY_CLIENT_ID || '',
        SPOTIFY_CLIENT_SECRET: cfg.spotifyClientSecret || process.env.SPOTIFY_CLIENT_SECRET || '',
      };

      const bProc = spawn(workerSpec.command, workerSpec.args, {
        cwd: workerSpec.cwd,
        env: childEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      backendProc = bProc;
      pipeChildLogs(bProc, 'mobile-api');

      bProc.on('exit', (code, sig) => {
        if (backendProc === bProc) {
          backendProc = null;
          if (currentState !== 'stopped') {
            currentState = 'error';
            lastError = `Mobile backend exited unexpectedly (code=${code ?? 'null'}, signal=${sig ?? 'none'})`;
            pushLog('manager', lastError);
          }
        }
      });

      const ready = await waitForMobileBackendReady(cfg.mobileApiKey);
      if (!ready) {
        throw new Error(`Mobile backend failed to become ready on 127.0.0.1:${MOBILE_BACKEND_PORT}`);
      }

      // 2. Spawn cloudflared tunnel
      const cfArgs =
        cfg.mobileTunnelMode === 'token'
          ? ['tunnel', '--no-autoupdate', 'run', '--token', nextToken]
          : ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${MOBILE_BACKEND_PORT}`];

      pushLog('manager', `Starting cloudflared (${cfg.mobileTunnelMode} mode)`);
      const tProc = spawn(cfPath, cfArgs, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      tunnelProc = tProc;

      pipeChildLogs(tProc, 'cloudflared', (line) => {
        // Quick Tunnel URL extraction
        const quickMatch = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
        if (quickMatch) {
          detectedPublicUrl = quickMatch[0];
          tunnelConnected = true;
        }

        // Named Tunnel remote config hostname auto-detection
        const hostMatch = line.match(/\\?"hostname\\?"\s*:\s*\\?"([^"\\]+)\\?"/);
        if (hostMatch && hostMatch[1]) {
          const detectedHost = `https://${hostMatch[1]}`;
          detectedPublicUrl = detectedHost;
          if (!getEnvConfig().mobileCustomDomain) {
            saveEnvConfig({ mobileCustomDomain: detectedHost });
          }
        }

        if (/Registered tunnel connection|Connection [a-f0-9-]+ registered/i.test(line)) {
          tunnelConnected = true;
        }

        if (/Unauthorized|invalid.*token|Provided Tunnel token is not valid/i.test(line)) {
          lastError = 'Invalid Cloudflare Tunnel token.';
        }
      });

      tProc.on('exit', (code, sig) => {
        if (tunnelProc === tProc) {
          tunnelProc = null;
          tunnelConnected = false;
          if (currentState !== 'stopped') {
            currentState = 'error';
            if (!lastError) {
              lastError = `Cloudflare tunnel exited (code=${code ?? 'null'}, signal=${sig ?? 'none'})`;
            }
            pushLog('manager', lastError);
          }
        }
      });

      // Wait briefly (up to 7s) so Quick Tunnel URL or Named Tunnel registration is captured immediately when possible
      const tunnelWaitDeadline = Date.now() + 7000;
      while (Date.now() < tunnelWaitDeadline) {
        if (!tunnelProc || tunnelProc.exitCode !== null) {
          throw new Error(lastError || 'Cloudflare tunnel process exited immediately.');
        }
        if (cfg.mobileTunnelMode === 'quick' && detectedPublicUrl) break;
        if (cfg.mobileTunnelMode === 'token' && tunnelConnected) break;
        await new Promise((r) => setTimeout(r, 200));
      }

      currentState = 'running';
      return getMobileCompanionStatus();
    } catch (err) {
      const msg = (err as Error).message || 'Failed to start Mobile Companion';
      await stopMobileCompanion();
      currentState = 'error';
      lastError = msg;
      pushLog('manager', `Error: ${msg}`);
      return getMobileCompanionStatus();
    } finally {
      startPromise = null;
    }
  })();

  return startPromise;
}
