import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { AudioQualityPreference, CacheStore, CachedTrack, Track } from '../types/index.js';
import { recordMlPlayEvent } from './mlRecommendation.js';

const CACHE_VERSION = 2;
const URL_TTL_MS = 6 * 60 * 60 * 1000;        // 6 hours — YT URL expiry
const DATA_DIR = process.env.APP_DATA_DIR
  ? path.resolve(process.env.APP_DATA_DIR)
  : path.join(process.cwd(), 'data');
const CACHE_FILE = path.join(DATA_DIR, 'songs.json');

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
    const parsed = JSON.parse(raw) as CacheStore;
    if ((parsed.version ?? 0) < CACHE_VERSION) {
      console.log(`[cache] Migrating cache store to v${CACHE_VERSION}: clearing stale pre-v4 audio URLs...`);
      for (const track of Object.values(parsed.tracks)) {
        delete (track as any).audioUrl;
        delete (track as any).audioUrlExpiry;
        delete (track as any).audioFormat;
        delete (track as any).audioQuality;
      }
      parsed.version = CACHE_VERSION;
      parsed.updatedAt = Date.now();
      saveStore(parsed);
    }
    return parsed;
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

export function getStore(): CacheStore {
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

/** Look up directly by videoId (handles prefix variations like youtube: / ytdlp:). */
export function getCachedById(videoId: string): CachedTrack | null {
  const store = getStore();
  if (store.tracks[videoId]) return store.tracks[videoId];
  const rawId = videoId.replace(/^(youtube|ytdlp):/, '').trim();
  return (
    store.tracks[rawId] ??
    store.tracks[`youtube:${rawId}`] ??
    store.tracks[`ytdlp:${rawId}`] ??
    null
  );
}

export function getCachedBySpotifyId(spotifyId: string): CachedTrack | null {
  return Object.values(getStore().tracks).find((track) => track.spotifyId === spotifyId) ?? null;
}

/** Check if a cached URL is still valid (not expired). */
export function isUrlFresh(track: CachedTrack): boolean {
  return Date.now() < track.audioUrlExpiry;
}

export function cacheMatchesAudioQuality(
  track: CachedTrack,
  preference: AudioQualityPreference
): boolean {
  return (track.audioQualityPreference ?? 'auto') === preference;
}

/** Store or update a track after resolving audio metadata. Playback history is updated only by recordPlay(). */
export function upsertTrack(
  query: string,
  track: Track,
  audioUrl: string,
  localAudioPath?: string,
  audioQualityPreference: AudioQualityPreference = 'auto',
  audioFormat?: string,
  audioQuality?: string,
  resolverSource?: 'youtubei' | 'ytdlp' | 'local'
): CachedTrack {
  const store = getStore();
  const hash = hashQuery(query);

  const existing = store.tracks[track.id];
  const cached: CachedTrack = {
    ...track,
    audioUrl,
    audioUrlExpiry: Date.now() + URL_TTL_MS,
    audioQualityPreference,
    audioFormat: audioFormat ?? existing?.audioFormat,
    audioQuality: audioQuality ?? existing?.audioQuality,
    resolverSource: resolverSource ?? existing?.resolverSource,
    localAudioPath,
    cachedAt: existing?.cachedAt ?? Date.now(),
    playCount: existing?.playCount ?? 0,
    lastPlayed: existing?.lastPlayed,
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
export function refreshTrackUrl(
  videoId: string,
  audioUrl: string,
  audioQualityPreference: AudioQualityPreference = 'auto',
  audioFormat?: string,
  audioQuality?: string,
  resolverSource?: 'youtubei' | 'ytdlp' | 'local'
): void {
  const store = getStore();
  const track = store.tracks[videoId];
  if (!track) return;
  const previousPreference = track.audioQualityPreference ?? 'auto';
  track.audioUrl = audioUrl;
  track.audioUrlExpiry = Date.now() + URL_TTL_MS;
  track.audioQualityPreference = audioQualityPreference;
  track.audioFormat = audioFormat ?? track.audioFormat;
  track.audioQuality = audioQuality ?? track.audioQuality;
  if (resolverSource) {
    track.resolverSource = resolverSource;
  }
  if (previousPreference !== audioQualityPreference) {
    track.localAudioPath = undefined;
  }
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

/** Increment play count and refresh display metadata used by history. */
export function recordPlayWithMetadata(track: Track): CachedTrack {
  const store = getStore();
  const existing = store.tracks[track.id] || ({} as Partial<CachedTrack>);

  const updated: CachedTrack = {
    ...existing,
    audioUrl: existing.audioUrl || '',
    audioUrlExpiry: existing.audioUrlExpiry || 0,
    id: track.id,
    title: track.title || existing.title || '',
    artist: track.artist || existing.artist || '',
    album: track.album ?? existing.album,
    duration: track.duration || existing.duration || 0,
    thumbnail: track.thumbnail || existing.thumbnail || '',
    query: track.query || existing.query || track.title || '',
    spotifyId: track.spotifyId ?? existing.spotifyId,
    spotifyUrl: track.spotifyUrl ?? existing.spotifyUrl,
    youtubeId: track.youtubeId ?? existing.youtubeId,
    youtubeTitle: track.youtubeTitle ?? existing.youtubeTitle,
    youtubeArtist: track.youtubeArtist ?? existing.youtubeArtist,
    queueSource: track.queueSource ?? existing.queueSource,
    originalSource: track.originalSource ?? existing.originalSource,
    originalPlaylistId: track.originalPlaylistId ?? existing.originalPlaylistId,
    originalPlaylistName: track.originalPlaylistName ?? existing.originalPlaylistName,
    playCount: (existing.playCount ?? 0) + 1,
    lastPlayed: Date.now(),
  };

  store.tracks[track.id] = updated;
  saveStore(store);
  recordMlPlayEvent(updated as Track);
  return updated;
}

/** Get all cached tracks without limits. */
export function getAllCachedTracks(): CachedTrack[] {
  return Object.values(getStore().tracks);
}

/** Get cached tracks sorted by play count. */
export function getTopTracks(limit?: number): CachedTrack[] {
  const sorted = Object.values(getStore().tracks)
    .sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0));
  return typeof limit === 'number' && limit > 0 ? sorted.slice(0, limit) : sorted;
}

/** Get cached tracks sorted by latest play time. */
export function getRecentTracks(limit = 50): CachedTrack[] {
  const store = getStore();
  const sorted = Object.values(store.tracks)
    .filter((track) => Boolean(track.lastPlayed))
    .sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0));

  const seen = new Set<string>();
  const result: CachedTrack[] = [];

  for (const track of sorted) {
    const cleanYt = (track.youtubeId || track.id).replace(/^(youtube|ytdlp):/, '').trim();
    const titleKey = `${(track.title || '').trim().toLowerCase()}|${(track.artist || '').trim().toLowerCase()}`;
    const dedupeKey = track.spotifyId ? `spotify:${track.spotifyId}` : (cleanYt || titleKey);

    if (!seen.has(dedupeKey)) {
      seen.add(dedupeKey);
      result.push(track);
      if (result.length >= limit) break;
    }
  }

  return result;
}

export function clearPlaybackHistory(): { updated: number } {
  const store = getStore();
  let updated = 0;
  for (const track of Object.values(store.tracks)) {
    if (track.lastPlayed || track.playCount) {
      track.lastPlayed = undefined;
      track.playCount = 0;
      updated += 1;
    }
  }
  saveStore(store);
  return { updated };
}

export function removePlaybackHistoryItem(videoId: string): boolean {
  const store = getStore();
  const track = store.tracks[videoId];
  if (!track || (!track.lastPlayed && !track.playCount)) return false;
  track.lastPlayed = undefined;
  track.playCount = 0;
  saveStore(store);
  return true;
}

export function clearTrackCache(videoIds: string[], spotifyId?: string): { tracks: number; queries: number } {
  const store = getStore();
  const ids = new Set(videoIds.filter(Boolean));
  if (spotifyId) {
    for (const [id, track] of Object.entries(store.tracks)) {
      if (track.spotifyId === spotifyId) ids.add(id);
    }
  }

  let tracks = 0;
  for (const id of ids) {
    if (store.tracks[id]) {
      const track = store.tracks[id] as any;
      delete track.audioUrl;
      delete track.audioUrlExpiry;
      delete track.localAudioPath;
      delete track.audioFormat;
      delete track.audioQuality;
      tracks += 1;
    }
  }

  let queries = 0;
  for (const [hash, id] of Object.entries(store.queryIndex)) {
    if (ids.has(id)) {
      delete store.queryIndex[hash];
      queries += 1;
    }
  }

  if (tracks > 0 || queries > 0) saveStore(store);
  return { tracks, queries };
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
