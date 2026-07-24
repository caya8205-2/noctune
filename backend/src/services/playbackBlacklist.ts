import fs from 'fs';
import path from 'path';
import { getDataDir } from './env.js';

export interface BlacklistEntry {
  failedAt: number;
  title?: string;
  artist?: string;
  targetTitle?: string;
  targetArtist?: string;
  matchedTitle?: string;
  matchedArtist?: string;
}

interface BlacklistStore {
  version: number;
  updatedAt: number;
  entries: Record<string, BlacklistEntry | number>; // videoId -> entry or timestamp
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

function cleanId(id: string): string {
  return (id || '').replace(/^(youtube|spotify):/, '').trim();
}

export function markPlaybackFailed(
  videoId: string,
  info?: {
    title?: string;
    artist?: string;
    targetTitle?: string;
    targetArtist?: string;
    matchedTitle?: string;
    matchedArtist?: string;
  } | string,
  artistParam?: string
): void {
  const clean = cleanId(videoId);
  if (!clean) return;
  const store = getStore();
  const existing = typeof store.entries[clean] === 'object' ? (store.entries[clean] as BlacklistEntry) : null;

  let targetTitle: string | undefined;
  let targetArtist: string | undefined;
  let matchedTitle: string | undefined;
  let matchedArtist: string | undefined;

  if (typeof info === 'string') {
    targetTitle = info;
    targetArtist = artistParam;
  } else if (info && typeof info === 'object') {
    targetTitle = info.targetTitle || info.title || existing?.targetTitle || existing?.title;
    targetArtist = info.targetArtist || info.artist || existing?.targetArtist || existing?.artist;
    matchedTitle = info.matchedTitle || existing?.matchedTitle;
    matchedArtist = info.matchedArtist || existing?.matchedArtist;
  }

  store.entries[clean] = {
    failedAt: Date.now(),
    title: targetTitle || existing?.title,
    artist: targetArtist || existing?.artist,
    targetTitle,
    targetArtist,
    matchedTitle,
    matchedArtist,
  };
  saveStore(store);
}

export function isPlaybackBlacklisted(videoId: string): boolean {
  const clean = cleanId(videoId);
  if (!clean) return false;
  return Boolean(getStore().entries[clean]);
}

export function getPlaybackBlacklist(): string[] {
  return Object.keys(getStore().entries);
}

export function getPlaybackBlacklistDetailed(): Array<{
  videoId: string;
  failedAt: number;
  title?: string;
  artist?: string;
  targetTitle?: string;
  targetArtist?: string;
  matchedTitle?: string;
  matchedArtist?: string;
  expiresIn: number;
}> {
  const now = Date.now();
  let cacheStoreTracks: Record<string, any> = {};
  let matchCacheEntries: any[] = [];
  try {
    const raw = fs.readFileSync(path.join(getDataDir(), 'track-cache.json'), 'utf-8');
    cacheStoreTracks = (JSON.parse(raw) as any).tracks || {};
  } catch {}
  try {
    const raw = fs.readFileSync(path.join(getDataDir(), 'spotify-youtube-matches.json'), 'utf-8');
    const store = JSON.parse(raw) as any;
    matchCacheEntries = Object.values(store.entries || {});
  } catch {}

  return Object.entries(getStore().entries).map(([videoId, entry]) => {
    const failedAt = typeof entry === 'number' ? entry : entry.failedAt;
    const title = typeof entry === 'number' ? undefined : entry.title;
    const artist = typeof entry === 'number' ? undefined : entry.artist;
    let targetTitle = typeof entry === 'number' ? undefined : entry.targetTitle || entry.title;
    let targetArtist = typeof entry === 'number' ? undefined : entry.targetArtist || entry.artist;
    let matchedTitle = typeof entry === 'number' ? undefined : entry.matchedTitle;
    let matchedArtist = typeof entry === 'number' ? undefined : entry.matchedArtist;

    if (!matchedTitle) {
      const match = matchCacheEntries.find((m: any) => (m.youtubeId || '').replace(/^youtube:/, '') === videoId);
      if (match) {
        matchedTitle = match.youtubeTitle;
        matchedArtist = match.youtubeArtist;
        if (!targetTitle) {
          targetTitle = match.spotifyTitle;
          targetArtist = match.spotifyArtist;
        }
      } else {
        const cached = cacheStoreTracks[videoId] || cacheStoreTracks[`youtube:${videoId}`];
        if (cached && (cached.youtubeTitle || cached.title)) {
          matchedTitle = cached.youtubeTitle || cached.title;
          matchedArtist = cached.youtubeArtist || cached.artist;
        }
      }
    }

    const age = now - failedAt;
    return {
      videoId,
      failedAt,
      title,
      artist,
      targetTitle,
      targetArtist,
      matchedTitle,
      matchedArtist,
      expiresIn: Math.max(0, 86400000 - age),
    };
  });
}

export function clearPlaybackBlacklist(): { cleared: number } {
  const store = getStore();
  const cleared = Object.keys(store.entries).length;
  store.entries = {};
  saveStore(store);
  return { cleared };
}

export function clearPlaybackBlacklistForId(videoId: string): { cleared: number } {
  const clean = cleanId(videoId);
  const store = getStore();
  if (clean && store.entries[clean]) {
    delete store.entries[clean];
    saveStore(store);
    return { cleared: 1 };
  }
  return { cleared: 0 };
}
