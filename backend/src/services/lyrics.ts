import fs from 'fs';
import path from 'path';
import Kuroshiro from 'kuroshiro';
import KuromojiAnalyzer from 'kuroshiro-analyzer-kuromoji';
import type { LyricsCacheStore, LyricsResult } from '../types/index.js';

const LRCLIB_BASE = 'https://lrclib.net/api';
const USER_AGENT = 'Noctune (https://github.com/caya8205-2/Noctune)';
const CACHE_VERSION = 3;
const DATA_DIR = process.env.APP_DATA_DIR
  ? path.resolve(process.env.APP_DATA_DIR)
  : path.join(process.cwd(), 'data');
const LYRICS_CACHE_FILE = path.join(DATA_DIR, 'lyrics.json');
const JAPANESE_SCRIPT_RE = /[\u3040-\u30ff\u3400-\u9fff]/;

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

  return [...new Set([compact, title, ...parts])].filter(Boolean);
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
let romanizerPromise: Promise<Kuroshiro> | null = null;

function getStore(): LyricsCacheStore {
  if (!_store) _store = loadStore();
  return _store;
}

async function getRomanizer(): Promise<Kuroshiro> {
  if (!romanizerPromise) {
    romanizerPromise = (async () => {
      const kuroshiro = new Kuroshiro();
      await kuroshiro.init(new KuromojiAnalyzer());
      return kuroshiro;
    })();
  }
  return romanizerPromise;
}

export function hasJapaneseScript(value: string): boolean {
  return JAPANESE_SCRIPT_RE.test(value);
}

export async function toRomajiText(text: string): Promise<string> {
  if (!text || !hasJapaneseScript(text)) return text;
  try {
    const romanizer = await getRomanizer();
    const result = await romanizer.convert(text, {
      to: 'romaji',
      mode: 'spaced',
      romajiSystem: 'hepburn',
    });
    return result.replace(/\s+/g, ' ').trim();
  } catch {
    return text;
  }
}

async function addRomanizedLines(lyrics: LyricsResult): Promise<LyricsResult> {
  if (!lyrics.lines.some((line) => hasJapaneseScript(line.text))) {
    return lyrics;
  }

  try {
    const romanizer = await getRomanizer();
    const lines = await Promise.all(
      lyrics.lines.map(async (line) => {
        if (!hasJapaneseScript(line.text)) return line;
        const romanizedText = await romanizer.convert(line.text, {
          to: 'romaji',
          mode: 'spaced',
          romajiSystem: 'hepburn',
        });
        return {
          ...line,
          romanizedText: romanizedText.replace(/\s+/g, ' ').trim(),
        };
      })
    );
    return { ...lyrics, lines };
  } catch (err) {
    console.warn('[lyrics] Japanese romanization failed:', (err as Error).message);
    return lyrics;
  }
}

function hasMissingRomanizedLines(lyrics: LyricsResult): boolean {
  return lyrics.lines.some((line) => hasJapaneseScript(line.text) && !line.romanizedText);
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
  const wantedTitles = titleCandidates(title).map(normalize).filter(Boolean);
  const wantedArtist = normalize(artist);
  const trackName = normalize(candidate.trackName || candidate.name || '');
  const artistName = normalize(candidate.artistName || '');
  let score = durationScore(candidate, duration);

  if (wantedTitles.includes(trackName)) {
    score += 85;
  } else if (wantedTitles.some((candidateTitle) => trackName.includes(candidateTitle) || candidateTitle.includes(trackName))) {
    score += 35;
  } else {
    score -= 45;
  }

  if (artistName === wantedArtist) score += 50;
  else if (artistName.includes(wantedArtist) || wantedArtist.includes(artistName)) score += 20;
  else if (wantedArtist && artistName) score -= 35;

  if (candidate.syncedLyrics) score += 35;
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
  if (cached !== undefined) {
    if (cached && hasMissingRomanizedLines(cached)) {
      const updated = await addRomanizedLines(cached);
      setCachedLyrics(key, title, artist, duration, updated);
      return updated;
    }
    return cached;
  }

  const seen = new Set<number>();
  const candidates: LrclibLyrics[] = [];
  const artistCandidates = [...new Set([artist, ''])];
  for (const candidateTitle of titleCandidates(title)) {
    for (const candidateArtist of artistCandidates) {
      const results = await searchLrclib(candidateTitle, candidateArtist);
      for (const result of results) {
        if (seen.has(result.id)) continue;
        seen.add(result.id);
        candidates.push(result);
      }
    }
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
  const result = await addRomanizedLines({
    provider: 'lrclib',
    id: best.id,
    title: best.trackName || best.name || title,
    artist: best.artistName || artist,
    album: best.albumName ?? '',
    duration: best.duration,
    instrumental: best.instrumental,
    synced: syncedLines.length > 0,
    lines: syncedLines.length > 0 ? syncedLines : plainLines,
  });

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

export function listLyricsCacheEntries(): Array<{ key: string; query: { title: string; artist: string; duration: number }; cachedAt: number; hasLyrics: boolean; synced: boolean; lineCount: number; provider: string; lyricsTitle: string; lyricsArtist: string }> {
  const store = getStore();
  return Object.entries(store.entries).map(([key, entry]) => ({
    key,
    query: entry.query,
    cachedAt: entry.cachedAt,
    hasLyrics: Boolean(entry.lyrics),
    synced: entry.lyrics?.synced ?? false,
    lineCount: entry.lyrics?.lines?.length ?? 0,
    provider: entry.lyrics?.provider ?? '',
    lyricsTitle: entry.lyrics?.title ?? '',
    lyricsArtist: entry.lyrics?.artist ?? '',
  }));
}

export function clearLyricsCacheStore(): LyricsCacheStore {
  _store = emptyStore();
  saveStore(_store);
  return _store;
}

export function deleteCachedLyricsEntry(title: string, artist: string, duration: number): boolean {
  const key = cacheKey(title, artist, duration);
  const store = getStore();
  if (store.entries[key]) {
    delete store.entries[key];
    saveStore(store);
    return true;
  }
  return false;
}

export function hasRomajiContent(cand: LrclibLyrics): boolean {
  const text = `${cand.syncedLyrics ?? ''}\n${cand.plainLyrics ?? ''}`;
  if (!text.trim()) return false;

  const lowerText = text.toLowerCase();
  const lowerMeta = `${cand.trackName ?? ''} ${cand.name ?? ''} ${cand.artistName ?? ''} ${cand.albumName ?? ''}`.toLowerCase();

  if (lowerMeta.includes('romaji') || lowerMeta.includes('romanized') || lowerText.includes('romaji') || lowerText.includes('romanized')) {
    return true;
  }

  const hasJapanese = JAPANESE_SCRIPT_RE.test(text) || JAPANESE_SCRIPT_RE.test(lowerMeta);
  const latinMatches = text.match(/[a-zA-Z]/g);
  const latinCount = latinMatches ? latinMatches.length : 0;

  if (hasJapanese && latinCount > 30) {
    return true;
  }

  if (hasJapanese && latinCount > text.length * 0.25) {
    return true;
  }

  return false;
}

export async function searchLrclibCandidates(title: string, artist: string): Promise<Array<LrclibLyrics & { hasRomaji: boolean }>> {
  const seen = new Set<number>();
  const candidates: Array<LrclibLyrics & { hasRomaji: boolean }> = [];
  const artistCandidates = [...new Set([artist, ''])];
  for (const candidateTitle of titleCandidates(title)) {
    for (const candidateArtist of artistCandidates) {
      const results = await searchLrclib(candidateTitle, candidateArtist).catch(() => []);
      for (const result of results) {
        if (seen.has(result.id)) continue;
        seen.add(result.id);
        candidates.push({
          ...result,
          hasRomaji: hasRomajiContent(result),
        });
      }
    }
  }
  return candidates;
}

export async function saveManualLyrics(
  title: string,
  artist: string,
  duration: number,
  candidate: LrclibLyrics
): Promise<LyricsResult> {
  const key = cacheKey(title, artist, duration);
  const syncedLines = candidate.syncedLyrics ? parseSyncedLyrics(candidate.syncedLyrics) : [];
  const plainLines = candidate.plainLyrics ? parsePlainLyrics(candidate.plainLyrics) : [];
  const result = await addRomanizedLines({
    provider: 'lrclib',
    id: candidate.id,
    title: candidate.trackName || candidate.name || title,
    artist: candidate.artistName || artist,
    album: candidate.albumName ?? '',
    duration: candidate.duration,
    instrumental: candidate.instrumental,
    synced: syncedLines.length > 0,
    lines: syncedLines.length > 0 ? syncedLines : plainLines,
  });

  setCachedLyrics(key, title, artist, duration, result);
  return result;
}

export function getLyricsSnapshot(title: string, artist: string, duration: number) {
  const key = cacheKey(title, artist, duration);
  const entry = getStore().entries[key];
  return {
    key,
    query: { title, artist, duration },
    cached: Boolean(entry),
    cachedAt: entry?.cachedAt ?? null,
    lyrics: entry?.lyrics ?? null,
  };
}
