import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { CacheStore, CachedTrack, Track } from '../types/index.js';

const CACHE_VERSION = 1;
const URL_TTL_MS = 6 * 60 * 60 * 1000;        // 6 hours — YT URL expiry
const CACHE_FILE = path.join(process.cwd(), 'data', 'songs.json');

function ensureDataDir() {
  const dir = path.dirname(CACHE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function hashQuery(query: string): string {
  return crypto
    .createHash('sha1')
    .update(query.toLowerCase().trim())
    .digest('hex')
    .slice(0, 12);
}

function loadStore(): CacheStore {
  ensureDataDir();
  if (!fs.existsSync(CACHE_FILE)) {
    return { version: CACHE_VERSION, updatedAt: Date.now(), tracks: {}, queryIndex: {} };
  }
  try {
    const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
    return JSON.parse(raw) as CacheStore;
  } catch {
    console.warn('[cache] Corrupt cache file, resetting...');
    return { version: CACHE_VERSION, updatedAt: Date.now(), tracks: {}, queryIndex: {} };
  }
}

function saveStore(store: CacheStore): void {
  ensureDataDir();
  store.updatedAt = Date.now();
  fs.writeFileSync(CACHE_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

function emptyStore(): CacheStore {
  return { version: CACHE_VERSION, updatedAt: Date.now(), tracks: {}, queryIndex: {} };
}

// Singleton in-memory store (load once, write-through)
let _store: CacheStore | null = null;

function getStore(): CacheStore {
  if (!_store) _store = loadStore();
  return _store;
}

function normalizeImportedStore(input: unknown): CacheStore {
  if (!input || typeof input !== 'object') {
    throw new Error('Cache JSON must be an object');
  }

  const raw = input as Partial<CacheStore>;
  if (!raw.tracks || typeof raw.tracks !== 'object' || Array.isArray(raw.tracks)) {
    throw new Error('Cache JSON must include a tracks object');
  }
  if (!raw.queryIndex || typeof raw.queryIndex !== 'object' || Array.isArray(raw.queryIndex)) {
    throw new Error('Cache JSON must include a queryIndex object');
  }

  return {
    version: typeof raw.version === 'number' ? raw.version : CACHE_VERSION,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
    tracks: raw.tracks,
    queryIndex: raw.queryIndex,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Look up by search query. Returns null on miss. */
export function getCachedByQuery(query: string): CachedTrack | null {
  const store = getStore();
  const hash = hashQuery(query);
  const videoId = store.queryIndex[hash];
  if (!videoId) return null;
  return store.tracks[videoId] ?? null;
}

/** Look up directly by videoId. */
export function getCachedById(videoId: string): CachedTrack | null {
  return getStore().tracks[videoId] ?? null;
}

/** Check if a cached URL is still valid (not expired). */
export function isUrlFresh(track: CachedTrack): boolean {
  return Date.now() < track.audioUrlExpiry;
}

/** Store or update a track after resolving from yt-dlp. */
export function upsertTrack(
  query: string,
  track: Track,
  audioUrl: string,
  localAudioPath?: string
): CachedTrack {
  const store = getStore();
  const hash = hashQuery(query);

  const existing = store.tracks[track.id];
  const cached: CachedTrack = {
    ...track,
    audioUrl,
    audioUrlExpiry: Date.now() + URL_TTL_MS,
    localAudioPath,
    cachedAt: existing?.cachedAt ?? Date.now(),
    playCount: existing ? existing.playCount + 1 : 1,
    lastPlayed: Date.now(),
  };

  store.tracks[track.id] = cached;
  store.queryIndex[hash] = track.id;

  // Also index by videoId as a direct query (e.g. prefetch by id)
  const idHash = hashQuery(track.id);
  store.queryIndex[idHash] = track.id;

  saveStore(store);
  return cached;
}

/** Refresh only the audio URL (called when URL expired but track is known). */
export function refreshTrackUrl(videoId: string, audioUrl: string): void {
  const store = getStore();
  const track = store.tracks[videoId];
  if (!track) return;
  track.audioUrl = audioUrl;
  track.audioUrlExpiry = Date.now() + URL_TTL_MS;
  saveStore(store);
}

/** Mark local audio file path after download. */
export function setLocalAudioPath(videoId: string, localPath: string): void {
  const store = getStore();
  const track = store.tracks[videoId];
  if (!track) return;
  track.localAudioPath = localPath;
  saveStore(store);
}

/** Increment play count without full upsert. */
export function recordPlay(videoId: string): void {
  const store = getStore();
  const track = store.tracks[videoId];
  if (!track) return;
  track.playCount = (track.playCount ?? 0) + 1;
  track.lastPlayed = Date.now();
  saveStore(store);
}

/** Get all cached tracks sorted by play count (for "frequently played" features). */
export function getTopTracks(limit = 20): CachedTrack[] {
  const store = getStore();
  return Object.values(store.tracks)
    .sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0))
    .slice(0, limit);
}

/** Total number of cached tracks. */
export function getCacheStats(): { total: number; totalQueries: number } {
  const store = getStore();
  return {
    total: Object.keys(store.tracks).length,
    totalQueries: Object.keys(store.queryIndex).length,
  };
}

/** Export the full cache store as JSON-serializable data. */
export function exportCacheStore(): CacheStore {
  return getStore();
}

/** Replace the cache store from imported JSON. */
export function importCacheStore(input: unknown): CacheStore {
  const imported = normalizeImportedStore(input);
  _store = imported;
  saveStore(imported);
  return imported;
}

/** Clear all learned cache entries. */
export function clearCacheStore(): CacheStore {
  _store = emptyStore();
  saveStore(_store);
  return _store;
}
