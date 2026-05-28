import fs from 'fs';
import path from 'path';
import type { LyricsCacheStore, LyricsResult } from '../types/index.js';

const LRCLIB_BASE = 'https://lrclib.net/api';
const USER_AGENT = 'Noctune/1.0.0-beta.2 (https://github.com/caya/noctune)';
const CACHE_VERSION = 1;
const DATA_DIR = process.env.APP_DATA_DIR
  ? path.resolve(process.env.APP_DATA_DIR)
  : path.join(process.cwd(), 'data');
const LYRICS_CACHE_FILE = path.join(DATA_DIR, 'lyrics.json');

interface LrclibLyrics {
  id: number;
  name?: string;
  trackName: string;
  artistName: string;
  albumName?: string;
  duration: number;
  instrumental: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/\[[^\]]*]/g, ' ')
    .replace(/\([^)]*(official|mv|music video|lyrics?|audio|visualizer)[^)]*\)/gi, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactTitle(value: string): string {
  return value
    .replace(/[【】]/g, ' ')
    .replace(/\[[^\]]*]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(sung|covered|performed)\s+by\b.*$/i, ' ')
    .replace(/\b(sings?|singing|cover(?:ed)?|lyrics?|official|audio|music video|mv|visualizer)\b/gi, ' ')
    .replace(/\s*[-/|]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCandidates(title: string): string[] {
  const bracketless = title
    .replace(/[ã€ã€‘]/g, ' ')
    .replace(/\[[^\]]*]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(sung|covered|performed)\s+by\b.*$/i, ' ')
    .trim();
  const compact = compactTitle(title);
  const parts = bracketless
    .split(/\s+(?:by|from)\s+|[-/|]/i)
    .map((part) => compactTitle(part))
    .filter((part) => part.length >= 3);

  return [...new Set([title, compact, ...parts])].filter(Boolean);
}

function cacheKey(title: string, artist: string, duration: number): string {
  return `${normalize(title)}::${normalize(artist)}::${Math.round(duration || 0)}`;
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function emptyStore(): LyricsCacheStore {
  return { version: CACHE_VERSION, updatedAt: Date.now(), entries: {} };
}

function loadStore(): LyricsCacheStore {
  ensureDataDir();
  if (!fs.existsSync(LYRICS_CACHE_FILE)) return emptyStore();
  try {
    const raw = fs.readFileSync(LYRICS_CACHE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<LyricsCacheStore>;
    if (!parsed.entries || typeof parsed.entries !== 'object' || Array.isArray(parsed.entries)) {
      return emptyStore();
    }
    return {
      version: typeof parsed.version === 'number' ? parsed.version : CACHE_VERSION,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
      entries: parsed.entries,
    };
  } catch {
    console.warn('[lyrics] Corrupt lyrics cache file, resetting...');
    return emptyStore();
  }
}

function saveStore(store: LyricsCacheStore): void {
  ensureDataDir();
  store.updatedAt = Date.now();
  fs.writeFileSync(LYRICS_CACHE_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

let _store: LyricsCacheStore | null = null;

function getStore(): LyricsCacheStore {
  if (!_store) _store = loadStore();
  return _store;
}

function getCachedLyrics(key: string): LyricsResult | null | undefined {
  return getStore().entries[key]?.lyrics;
}

function setCachedLyrics(key: string, title: string, artist: string, duration: number, lyrics: LyricsResult | null) {
  const store = getStore();
  store.entries[key] = {
    query: { title, artist, duration },
    lyrics,
    cachedAt: Date.now(),
  };
  saveStore(store);
}

function parseSyncedLyrics(value: string): LyricsResult['lines'] {
  return value
    .split('\n')
    .map((line) => {
      const match = line.match(/^\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?]\s*(.*)$/);
      if (!match) return null;
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fraction = match[3] ? Number(match[3].padEnd(3, '0').slice(0, 3)) / 1000 : 0;
      const text = match[4].trim();
      return {
        time: minutes * 60 + seconds + fraction,
        text,
      };
    })
    .filter((line): line is { time: number; text: string } => Boolean(line));
}

function parsePlainLyrics(value: string): LyricsResult['lines'] {
  return value
    .split('\n')
    .map((text) => ({ time: null, text: text.trim() }))
    .filter((line) => line.text.length > 0);
}

function durationScore(candidate: LrclibLyrics, duration: number): number {
  if (!duration || !candidate.duration) return 0;
  const diff = Math.abs(candidate.duration - duration);
  if (diff <= 2) return 40;
  if (diff <= 5) return 24;
  if (diff <= 10) return 10;
  return -Math.min(30, diff);
}

function scoreCandidate(candidate: LrclibLyrics, title: string, artist: string, duration: number): number {
  const wantedTitle = normalize(title);
  const wantedArtist = normalize(artist);
  const trackName = normalize(candidate.trackName || candidate.name || '');
  const artistName = normalize(candidate.artistName || '');
  let score = durationScore(candidate, duration);

  if (trackName === wantedTitle) score += 70;
  else if (trackName.includes(wantedTitle) || wantedTitle.includes(trackName)) score += 35;

  if (artistName === wantedArtist) score += 50;
  else if (artistName.includes(wantedArtist) || wantedArtist.includes(artistName)) score += 20;

  if (candidate.syncedLyrics) score += 20;
  if (candidate.instrumental) score -= 40;
  return score;
}

function minimumAcceptableScore(title: string, artist: string, duration: number): number {
  const titleLooksNoisy = titleCandidates(title).length > 2 || title.length > 60;
  if (!duration) return titleLooksNoisy ? 85 : 70;
  if (!artist.trim()) return titleLooksNoisy ? 80 : 60;
  return titleLooksNoisy ? 75 : 55;
}

async function searchLrclib(title: string, artist: string): Promise<LrclibLyrics[]> {
  const url = new URL(`${LRCLIB_BASE}/search`);
  url.searchParams.set('track_name', title);
  if (artist) url.searchParams.set('artist_name', artist);

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (res.status === 404) return [];
  if (!res.ok) {
    throw new Error(`LRCLIB search failed: HTTP ${res.status}`);
  }
  return (await res.json()) as LrclibLyrics[];
}

export async function findLyrics(title: string, artist: string, duration: number): Promise<LyricsResult | null> {
  const key = cacheKey(title, artist, duration);
  const cached = getCachedLyrics(key);
  if (cached !== undefined) return cached;

  const seen = new Set<number>();
  const candidates: LrclibLyrics[] = [];
  for (const candidateTitle of titleCandidates(title)) {
    for (const candidateArtist of [artist, '']) {
      const results = await searchLrclib(candidateTitle, candidateArtist);
      for (const result of results) {
        if (seen.has(result.id)) continue;
        seen.add(result.id);
        candidates.push(result);
      }
      if (candidates.length > 0) break;
    }
    if (candidates.length > 0) break;
  }

  const scored = candidates
    .filter((candidate) => candidate.syncedLyrics || candidate.plainLyrics || candidate.instrumental)
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(candidate, title, artist, duration),
    }))
    .sort((a, b) => b.score - a.score);
  const bestMatch = scored[0];
  const best = bestMatch?.candidate;

  if (!best || bestMatch.score < minimumAcceptableScore(title, artist, duration)) {
    setCachedLyrics(key, title, artist, duration, null);
    return null;
  }

  const syncedLines = best.syncedLyrics ? parseSyncedLyrics(best.syncedLyrics) : [];
  const plainLines = best.plainLyrics ? parsePlainLyrics(best.plainLyrics) : [];
  const result: LyricsResult = {
    provider: 'lrclib',
    id: best.id,
    title: best.trackName || best.name || title,
    artist: best.artistName || artist,
    album: best.albumName ?? '',
    duration: best.duration,
    instrumental: best.instrumental,
    synced: syncedLines.length > 0,
    lines: syncedLines.length > 0 ? syncedLines : plainLines,
  };

  setCachedLyrics(key, title, artist, duration, result);
  return result;
}

export function getLyricsCacheStats(): { total: number; hits: number; misses: number } {
  const entries = Object.values(getStore().entries);
  return {
    total: entries.length,
    hits: entries.filter((entry) => entry.lyrics).length,
    misses: entries.filter((entry) => !entry.lyrics).length,
  };
}

export function clearLyricsCacheStore(): LyricsCacheStore {
  _store = emptyStore();
  saveStore(_store);
  return _store;
}
