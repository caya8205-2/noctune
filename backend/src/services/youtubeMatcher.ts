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
const CACHE_VERSION = 6;
const matchQueue = new PQueue({ concurrency: 2 });

const positiveTitleKeywords = [
  'official',
  'official mv',
  'official audio',
  'official video',
  'official music video',
  'official lyric video',
  'music video',
  'lyric video',
  'mv',
  'original',
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
  'acoustic',
  'acoustic cover',
  'acoustic version',
  'acoustic arrangement',
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
  'acoustic',
  'acoustic cover',
  'acoustic version',
  'acoustic arrangement',
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
  return hasKeyword(normalize(spotifyTitle), keyword);
}

function splitArtistNames(value: string): string[] {
  return value
    .split(/,|&|\band\b|\bfeat\b|\bfeaturing\b|\sx\s/gi)
    .map((part) => normalize(part))
    .filter((part) => part.length > 1);
}

function hasKeyword(text: string, keyword: string): boolean {
  if (keyword.length <= 3 || !keyword.includes(' ')) {
    return text.split(' ').includes(keyword);
  }
  return text.includes(keyword);
}

function hasDateLikeTitle(value: string): boolean {
  return (
    /\b(?:19|20)\d{2}[./-]\d{1,2}(?:[./-]\d{1,2})?\b/.test(value) ||
    /\b\d{1,2}[./-]\d{1,2}[./-](?:19|20)\d{2}\b/.test(value) ||
    /(?:19|20)\d{2}年\d{1,2}月(?:\d{1,2}日)?/.test(value)
  );
}

function hasLiveVisualSignal(value: string): boolean {
  const lower = value.toLowerCase();
  return lower.includes('live映像') || lower.includes('ライブ映像') || lower.includes('ライブ') || lower.includes('公演');
}

function scoreCandidate(spotifyTrack: Track, candidate: Track): ScoredCandidate {
  const spotifyTitle = normalize(spotifyTrack.title);
  const spotifyArtist = normalize(spotifyTrack.artist);
  const candidateTitle = normalize(candidate.title);
  const candidateArtist = normalize(candidate.artist);
  const combined = `${candidateTitle} ${candidateArtist}`;
  const reasons: string[] = [];
  let score = 0;
  let hasArtistChannelMatch = false;

  for (const word of words(spotifyTrack.title)) {
    if (candidateTitle.includes(word)) {
      score += 10;
    }
  }

  for (const artistName of splitArtistNames(spotifyTrack.artist)) {
    if (candidateArtist.includes(artistName)) {
      hasArtistChannelMatch = true;
      score += 90;
      reasons.push('artist-channel-match');
    } else if (artistName && combined.includes(artistName)) {
      score += 45;
      reasons.push('artist-match');
    }
  }

  if (candidateTitle.includes(spotifyTitle)) {
    score += 60;
    reasons.push('title-phrase');
  }

  for (const keyword of positiveTitleKeywords) {
    if (hasKeyword(candidateTitle, keyword)) {
      score += keyword.startsWith('official')
        ? 110
        : keyword === 'mv' || keyword === 'music video'
          ? 60
          : keyword === 'original'
            ? 45
            : 30;
      reasons.push(`positive-title:${keyword}`);
    }
  }

  for (const keyword of positiveChannelKeywords) {
    if (hasKeyword(candidateArtist, keyword)) {
      score += keyword === 'official' ? 80 : 55;
      reasons.push(`positive-channel:${keyword}`);
    }
  }

  for (const keyword of negativeKeywords) {
    if (hasKeyword(combined, keyword) && !keywordAllowed(keyword, spotifyTrack.title)) {
      if ((keyword === 'film' || keyword === 'movie') && hasArtistChannelMatch) {
        reasons.push(`ignored-negative:${keyword}`);
        continue;
      }
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
    hasKeyword(candidateTitle, 'official') ||
    hasKeyword(candidateArtist, 'official') ||
    hasKeyword(candidateArtist, 'topic') ||
    hasKeyword(candidateArtist, 'vevo');

  for (const keyword of fanUploadKeywords) {
    if (hasKeyword(combined, keyword) && !hasOfficialSignal) {
      score -= keyword.includes('sing') ? 120 : 65;
      reasons.push(`fan-upload:${keyword}`);
    }
  }

  for (const keyword of liveVersionKeywords) {
    if (hasKeyword(combined, keyword) && !keywordAllowed(keyword, spotifyTrack.title)) {
      score -= keyword === 'tour' ? 260 : 180;
      reasons.push(`live-version:${keyword}`);
    }
  }

  if (!hasDateLikeTitle(spotifyTrack.title) && hasDateLikeTitle(candidate.title)) {
    score -= 170;
    reasons.push('date-in-title');
  }

  if (hasLiveVisualSignal(candidate.title) && !hasLiveVisualSignal(spotifyTrack.title)) {
    score -= 210;
    reasons.push('live-visual');
  }

  if (spotifyTrack.duration > 0 && candidate.duration > 0) {
    const diff = Math.abs(candidate.duration - spotifyTrack.duration);
    if (diff <= 5) {
      score += 90;
      reasons.push('duration-close');
    } else if (diff <= 15) {
      score += 50;
      reasons.push('duration-near');
    } else if (diff >= 45) {
      score -= diff >= 90 ? 110 : 70;
      reasons.push('duration-far');
    }
  }

  return { track: candidate, score, reasons };
}

function hasArtistChannelMatch(candidate: ScoredCandidate): boolean {
  return candidate.reasons.includes('artist-channel-match');
}

function compareCandidates(a: ScoredCandidate, b: ScoredCandidate): number {
  const aArtistChannelMatch = hasArtistChannelMatch(a);
  const bArtistChannelMatch = hasArtistChannelMatch(b);
  if (aArtistChannelMatch !== bArtistChannelMatch) {
    return aArtistChannelMatch ? -1 : 1;
  }
  return b.score - a.score;
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
      .sort(compareCandidates);
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
    .sort(compareCandidates);

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
