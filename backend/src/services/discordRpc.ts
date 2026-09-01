import { Client, register } from 'discord-rpc';
import type { Track } from '../types/index.js';
import { getEnvConfig } from './env.js';

type RpcActivity = {
  track: Track | null;
  isPlaying: boolean;
  progress: number;
  duration: number;
};

let client: Client | null = null;
let ready = false;
let connecting: Promise<void> | null = null;
let lastActivity: RpcActivity | null = null;
let lastSentAt = 0;
let lastSentTrackId: string | null = null;

const DISCORD_ACTIVITY_LISTENING = 2;

function getAssetImage(value?: string): string | undefined {
  const image = value?.trim();
  if (!image) return undefined;
  return image;
}

function getClientId(): string | null {
  const clientId = process.env.DISCORD_CLIENT_ID?.trim();
  if (!clientId) return null;
  if (process.env.DISCORD_RPC_ENABLED === 'false') return null;

  const config = getEnvConfig();
  if (config.discordRpcEnabled === false) return null;

  return clientId;
}

export function getDiscordRpcStatus() {
  return {
    enabled: Boolean(getClientId()),
    ready,
  };
}

async function connect() {
  const clientId = getClientId();
  if (!clientId) return;
  if (ready) return;
  if (connecting) return connecting;

  connecting = (async () => {
    try {
      register(clientId);
      client = new Client({ transport: 'ipc' });
      client.on('ready', () => {
        ready = true;
      });
      client.on('disconnected', () => {
        ready = false;
        client = null;
      });
      client.on('error', () => {
        ready = false;
      });
      await client.login({ clientId });
      ready = true;
    } catch {
      ready = false;
      client = null;
    } finally {
      connecting = null;
    }
  })();

  return connecting;
}

function toDiscordActivity(activity: RpcActivity) {
  const { track, isPlaying, progress, duration } = activity;
  if (!track) return null;

  const now = Date.now();
  const clampedProgress = Math.max(0, Math.min(progress, duration || progress));
  const timestamps = isPlaying
    ? {
      start: now - clampedProgress * 1000,
      end: duration > 0 ? now + Math.max(0, duration - clampedProgress) * 1000 : undefined,
    }
    : undefined;

  const discordActivity: Record<string, unknown> = {
    name: track.artist || 'Noctune',
    type: DISCORD_ACTIVITY_LISTENING,
    details: track.title,
    state: track.artist,
    timestamps,
    instance: false,
  };

  const largeImage = getAssetImage(track.thumbnail) ?? getAssetImage(process.env.DISCORD_RPC_LARGE_IMAGE_KEY);
  const smallImage = getAssetImage(process.env.DISCORD_RPC_SMALL_IMAGE_KEY);
  if (largeImage || smallImage) {
    discordActivity.assets = {
      large_image: largeImage,
      large_text: track.album,
      small_image: smallImage,
      small_text: smallImage ? 'Noctune' : undefined,
    };
  }

  return discordActivity;
}

async function setDiscordActivity(activity: Record<string, unknown>) {
  if (!client) return;

  await client.request('SET_ACTIVITY', {
    pid: process.pid,
    activity,
  });
}

export async function updateDiscordActivity(activity: RpcActivity) {
  lastActivity = activity;
  const clientId = getClientId();
  if (!clientId) return { enabled: false, ready: false };

  await connect();
  if (!client || !ready) return { enabled: true, ready: false };

  if (!activity.isPlaying) {
    lastSentAt = 0;
    lastSentTrackId = null;
    await client.clearActivity().catch(() => { });
    return { enabled: true, ready };
  }

  const discordActivity = toDiscordActivity(activity);
  if (!discordActivity) {
    await client.clearActivity().catch(() => { });
    return { enabled: true, ready };
  }

  const now = Date.now();
  const trackChanged = activity.track?.id !== lastSentTrackId;
  if (!trackChanged && now - lastSentAt < 4_000) {
    return { enabled: true, ready };
  }

  lastSentAt = now;
  lastSentTrackId = activity.track?.id ?? null;
  await setDiscordActivity(discordActivity).catch(() => {
    ready = false;
  });
  return { enabled: true, ready };
}

async function destroyClient() {
  if (!client) return;
  try {
    if (ready) await client.clearActivity().catch(() => {});
    await client.destroy();
  } catch {}
  client = null;
  ready = false;
  lastActivity = null;
  lastSentAt = 0;
  lastSentTrackId = null;
}

process.on('exit', () => { if (client) try { client.destroy(); } catch {} });
// Do NOT call process.exit() here — when running as a Tauri sidecar, the
// process lifecycle is managed by Tauri.  Calling exit on SIGINT/SIGTERM
// causes the backend to die prematurely when child processes (innertube.exe,
// yt-dlp.exe) terminate and propagate signals to the parent.
process.on('SIGINT', () => { destroyClient(); });
process.on('SIGTERM', () => { destroyClient(); });

export async function clearDiscordActivity() {
  await destroyClient();
}

export async function refreshDiscordActivity() {
  if (lastActivity) {
    await updateDiscordActivity(lastActivity);
  }
}
