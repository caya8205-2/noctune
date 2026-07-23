import fs from 'fs';
import path from 'path';
import { getDataDir } from './env.js';

interface BlacklistStore {
  version: number;
  updatedAt: number;
  entries: Record<string, number>; // videoId -> failedAt timestamp
}

const STORE_FILE = path.join(getDataDir(), 'playback-blacklist.json');

function loadStore(): BlacklistStore {
  if (!fs.existsSync(STORE_FILE)) {
    return { version: 1, updatedAt: Date.now(), entries: {} };
  }
  try {
    const raw = fs.readFileSync(STORE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<BlacklistStore>;
    return { version: 1, updatedAt: Date.now(), entries: parsed.entries ?? {} };
  } catch {
    return { version: 1, updatedAt: Date.now(), entries: {} };
  }
}

function saveStore(store: BlacklistStore): void {
  const dir = path.dirname(STORE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  store.updatedAt = Date.now();
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

let _store: BlacklistStore | null = null;

function getStore(): BlacklistStore {
  if (!_store) _store = loadStore();
  return _store;
}

export function markPlaybackFailed(videoId: string): void {
  const store = getStore();
  store.entries[videoId] = Date.now();
  saveStore(store);
}

export function isPlaybackBlacklisted(videoId: string): boolean {
  return Boolean(getStore().entries[videoId]);
}

export function getPlaybackBlacklist(): string[] {
  return Object.keys(getStore().entries);
}

export function getPlaybackBlacklistDetailed(): Array<{ videoId: string; failedAt: number; expiresIn: number }> {
  return Object.entries(getStore().entries).map(([videoId, failedAt]) => ({
    videoId,
    failedAt,
    expiresIn: Infinity,
  }));
}

export function clearPlaybackBlacklist(): { cleared: number } {
  const store = getStore();
  const cleared = Object.keys(store.entries).length;
  store.entries = {};
  saveStore(store);
  return { cleared };
}

export function clearPlaybackBlacklistForId(videoId: string): { cleared: number } {
  const store = getStore();
  if (store.entries[videoId]) {
    delete store.entries[videoId];
    saveStore(store);
    return { cleared: 1 };
  }
  return { cleared: 0 };
}
