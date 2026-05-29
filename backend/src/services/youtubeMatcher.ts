import fs from 'fs';
import path from 'path';
import PQueue from 'p-queue';
import type { Track } from '../types/index.js';
import { searchTracks } from './audioResolver.js';
import { getDataDir } from './env.js';
import { isPlaybackBlacklisted } from './playbackBlacklist.js';

interface MatchCacheEntry {
  spotifyId: string;
  youtubeId: string;
  youtubeTitle: string;
  youtubeArtist: string;
  score: number;
  matchedAt: number;
}

interface MatchCacheStore {
  version: number;
  updatedAt: number;
  matches: Record<string, MatchCacheEntry>;
}

export interface ScoredCandidate {
  track: Track;
  score: number;
  reasons: string[];
}

const CACHE_FILE = path.join(getDataDir(), 'spotify-youtube-map.json');
const CACHE_VERSION = 3;
const matchQueue = new PQueue({ concurrency: 2 });

const positiveTitleKeywords = [
  'official audio',
  'official video',
  'official music video',
  'official lyric video',
  'lyric video',
  'audio',
];

const positiveChannelKeywords = ['official', 'vevo', 'topic'];

const negativeKeywords = [
  'reaction',
  'reacts',
  'react',
  'first time hearing',
  'first time',
  'watching',
  'review',
  'breakdown',
  'analysis',
  'commentary',
  'trailer',
  'movie',
  'film',
  'scene',
  'clip',
  'clips',
  'shorts',
  'cover',
  'ai cover',
  'piano cover',
  'piano version',
  'piano arrangement',
  'piano instrumental',
  'piano solo',
  'instrumental cover',
  'guitar cover',
  'guitar instrumental',
  'drum cover',
  'drums cover',
  'drum cam',
  'drum playthrough',
  'drum performance',
  'violin cover',
  'orchestra cover',
  'orchestral cover',
  'acoustic cover',
  'backing track',
  'backtrack',
  'minus one',
  'off vocal',
  'no vocal',
  'no vocals',
  'sheet music',
  'synthesia',
  'parody',
  'meme',
  'karaoke',
  'instrumental',
  'sped up',
  'slowed',
  'nightcore',
  'tutorial',
  'performance',
  '8d',
];

const instrumentalCoverKeywords = [
  'piano cover',
  'piano version',
  'piano arrangement',
  'piano instrumental',
  'piano solo',
  'instrumental cover',
  'guitar cover',
  'guitar instrumental',
  'drum cover',
  'drums cover',
  'drum cam',
  'drum playthrough',
  'drum performance',
  'violin cover',
  'orchestra cover',
  'orchestral cover',
  'acoustic cover',
  'backing track',
  'backtrack',
  'minus one',
  'off vocal',
  'no vocal',
  'no vocals',
  'sheet music',
  'synthesia',
];

const fanUploadKeywords = [
  'lyrics',
  'rom',
  'eng sub',
  'sub indo',
  'translation',
  'translated',
  '中文',
  '翻譯',
  '字幕',
  'sings',
  'singing',
  'sung by',
];

const liveVersionKeywords = [
  'live',
  'live version',
  'live performance',
  'concert',
  'stage',
  'showcase',
  'tour',
];

function ensureDataDir() {
  const dir = path.dirname(CACHE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadStore(): MatchCacheStore {
  ensureDataDir();
  if (!fs.existsSync(CACHE_FILE)) {
    return { version: CACHE_VERSION, updatedAt: Date.now(), matches: {} };
  }

  try {
    const loaded = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8')) as MatchCacheStore;
    if (loaded.version !== CACHE_VERSION) {
      return { version: CACHE_VERSION, updatedAt: Date.now(), matches: {} };
    }
    return loaded;
  } catch {
    return { version: CACHE_VERSION, updatedAt: Date.now(), matches: {} };
  }
}

function saveStore(store: MatchCacheStore) {
  ensureDataDir();
  store.updatedAt = Date.now();
  fs.writeFileSync(CACHE_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

let store: MatchCacheStore | null = null;

function getStore(): MatchCacheStore {
  store ??= loadStore();
  return store;
}

export function getMatchCacheStats(): { total: number } {
  return { total: Object.keys(getStore().matches).length };
}

export function clearMatchCache(): { cleared: number } {
  const cleared = Object.keys(getStore().matches).length;
  store = { version: CACHE_VERSION, updatedAt: Date.now(), matches: {} };
  saveStore(store);
  return { cleared };
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(value: string): string[] {
  return normalize(value)
    .split(' ')
    .filter((word) => word.length > 1);
}

function keywordAllowed(keyword: string, spotifyTitle: string): boolean {
  return normalize(spotifyTitle).includes(keyword);
}

function scoreCandidate(spotifyTrack: Track, candidate: Track): ScoredCandidate {
  const spotifyTitle = normalize(spotifyTrack.title);
  const spotifyArtist = normalize(spotifyTrack.artist);
  const candidateTitle = normalize(candidate.title);
  const candidateArtist = normalize(candidate.artist);
  const combined = `${candidateTitle} ${candidateArtist}`;
  const reasons: string[] = [];
  let score = 0;

  for (const word of words(spotifyTrack.title)) {
    if (candidateTitle.includes(word)) {
      score += 10;
    }
  }

  for (const artistName of spotifyArtist.split(',').map((part) => part.trim())) {
    if (artistName && combined.includes(artistName)) {
      score += 45;
      reasons.push('artist-match');
    }
  }

  if (candidateTitle.includes(spotifyTitle)) {
    score += 60;
    reasons.push('title-phrase');
  }

  for (const keyword of positiveTitleKeywords) {
    if (candidateTitle.includes(keyword)) {
      score += keyword.startsWith('official') ? 100 : 30;
      reasons.push(`positive-title:${keyword}`);
    }
  }

  for (const keyword of positiveChannelKeywords) {
    if (candidateArtist.includes(keyword)) {
      score += keyword === 'official' ? 80 : 55;
      reasons.push(`positive-channel:${keyword}`);
    }
  }

  for (const keyword of negativeKeywords) {
    if (combined.includes(keyword) && !keywordAllowed(keyword, spotifyTrack.title)) {
      const penalty = instrumentalCoverKeywords.includes(keyword)
        ? 240
        : keyword.includes('react') || keyword === 'reaction'
          ? 250
          : 120;
      score -= penalty;
      reasons.push(`negative:${keyword}`);
    }
  }

  const hasOfficialSignal =
    candidateTitle.includes('official') ||
    candidateArtist.includes('official') ||
    candidateArtist.includes('topic') ||
    candidateArtist.includes('vevo');

  for (const keyword of fanUploadKeywords) {
    if (combined.includes(keyword) && !hasOfficialSignal) {
      score -= keyword.includes('sing') ? 120 : 65;
      reasons.push(`fan-upload:${keyword}`);
    }
  }

  for (const keyword of liveVersionKeywords) {
    if (combined.includes(keyword) && !keywordAllowed(keyword, spotifyTrack.title)) {
      score -= keyword === 'tour' ? 260 : 180;
      reasons.push(`live-version:${keyword}`);
    }
  }

  if (spotifyTrack.duration > 0 && candidate.duration > 0) {
    const diff = Math.abs(candidate.duration - spotifyTrack.duration);
    if (diff <= 5) {
      score += 70;
      reasons.push('duration-close');
    } else if (diff <= 15) {
      score += 35;
      reasons.push('duration-near');
    } else if (diff >= 45) {
      score -= 55;
      reasons.push('duration-far');
    }
  }

  return { track: candidate, score, reasons };
}

function fromCache(spotifyTrack: Track): Track | null {
  if (!spotifyTrack.spotifyId) return null;
  const cached = getStore().matches[spotifyTrack.spotifyId];
  if (!cached) return null;
  if (isPlaybackBlacklisted(cached.youtubeId)) return null;

  console.log(
    `[matcher] cache hit ${JSON.stringify({
      spotifyId: spotifyTrack.spotifyId,
      youtubeId: cached.youtubeId,
      score: cached.score,
    })}`
  );

  return {
    ...spotifyTrack,
    id: cached.youtubeId,
    youtubeId: cached.youtubeId,
    youtubeTitle: cached.youtubeTitle,
    youtubeArtist: cached.youtubeArtist,
  };
}

function getCachedMatch(spotifyTrack: Track): MatchCacheEntry | null {
  if (!spotifyTrack.spotifyId) return null;
  return getStore().matches[spotifyTrack.spotifyId] ?? null;
}

function writeCache(spotifyTrack: Track, candidate: ScoredCandidate) {
  if (!spotifyTrack.spotifyId) return;
  const current = getStore();
  current.matches[spotifyTrack.spotifyId] = {
    spotifyId: spotifyTrack.spotifyId,
    youtubeId: candidate.track.id,
    youtubeTitle: candidate.track.title,
    youtubeArtist: candidate.track.artist,
    score: candidate.score,
    matchedAt: Date.now(),
  };
  saveStore(current);
}

export async function matchSpotifyTrackToYoutube(spotifyTrack: Track): Promise<Track | null> {
  const cached = fromCache(spotifyTrack);
  if (cached) return cached;

  const query = `${spotifyTrack.title} - ${spotifyTrack.artist}`;

  const result = await matchQueue.add<Track | null>(async () => {
    const startedAt = Date.now();
    const candidates = await searchTracks(query, 12);
    const ranked = candidates
      .filter((candidate) => !isPlaybackBlacklisted(candidate.id))
      .map((candidate) => scoreCandidate(spotifyTrack, candidate))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];

    console.log(
      `[matcher] spotify->youtube ${JSON.stringify({
        spotifyId: spotifyTrack.spotifyId,
        query,
        bestId: best?.track.id,
        bestTitle: best?.track.title,
        score: best?.score,
        reasons: best?.reasons,
        elapsedMs: Date.now() - startedAt,
      })}`
    );

    if (!best || best.score < 20) return null;

    writeCache(spotifyTrack, best);

    return {
      ...spotifyTrack,
      id: best.track.id,
      query,
      youtubeId: best.track.id,
      youtubeTitle: best.track.title,
      youtubeArtist: best.track.artist,
    };
  });

  return result ?? null;
}

export async function debugSpotifyYoutubeMatch(
  spotifyTrack: Track,
  limit = 10
): Promise<{
  query: string;
  cached: MatchCacheEntry | null;
  candidates: ScoredCandidate[];
}> {
  const query = `${spotifyTrack.title} - ${spotifyTrack.artist}`;
  const candidates = await searchTracks(query, limit);
  const ranked = candidates
    .filter((candidate) => !isPlaybackBlacklisted(candidate.id))
    .map((candidate) => scoreCandidate(spotifyTrack, candidate))
    .sort((a, b) => b.score - a.score);

  return {
    query,
    cached: getCachedMatch(spotifyTrack),
    candidates: ranked,
  };
}

export async function matchSpotifyTracksToYoutube(tracks: Track[]): Promise<Track[]> {
  const matched = await Promise.all(tracks.map((track) => matchSpotifyTrackToYoutube(track)));
  return matched.filter((track): track is Track => Boolean(track));
}
