import fs from 'fs';
import path from 'path';
import PQueue from 'p-queue';
import type { Track } from '../types/index.js';
import { searchTracks } from './audioResolver.js';
import { getDataDir } from './env.js';
import { isPlaybackBlacklisted } from './playbackBlacklist.js';
import { hasJapaneseScript, toRomajiText } from './lyrics.js';

interface MatchCacheEntry {
  spotifyId: string;
  spotifyTitle?: string;
  spotifyArtist?: string;
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
const CACHE_VERSION = 8;
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
  'beat saber',
  'cover',
  'covered',
  'covers',
  'covering',
  'covered by',
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
  'カラオケ',
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
  'covered by',
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

const alternateVersionKeywords = [
  'tv version',
  'tv ver',
  'tv size',
  'television version',
  'short version',
  'anime version',
  'opening version',
  'ending version',
  'op version',
  'ed version',
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

export function listMatchCache(): MatchCacheEntry[] {
  return Object.values(getStore().matches).sort((a, b) => b.matchedAt - a.matchedAt);
}

export function clearMatchCache(): { cleared: number } {
  const cleared = Object.keys(getStore().matches).length;
  store = { version: CACHE_VERSION, updatedAt: Date.now(), matches: {} };
  saveStore(store);
  return { cleared };
}

export function clearMatchCacheForSpotifyId(spotifyId: string): { cleared: number; youtubeId?: string } {
  const current = getStore();
  const existing = current.matches[spotifyId];
  if (!existing) return { cleared: 0 };
  delete current.matches[spotifyId];
  saveStore(current);
  return { cleared: 1, youtubeId: existing.youtubeId };
}

export function saveMatchCacheEntry(entry: {
  spotifyId: string;
  youtubeId: string;
  youtubeTitle?: string;
  youtubeArtist?: string;
  spotifyTitle?: string;
  spotifyArtist?: string;
  score?: number;
}): MatchCacheEntry {
  const current = getStore();
  const matchEntry: MatchCacheEntry = {
    spotifyId: entry.spotifyId,
    youtubeId: entry.youtubeId,
    youtubeTitle: entry.youtubeTitle ?? '',
    youtubeArtist: entry.youtubeArtist ?? '',
    spotifyTitle: entry.spotifyTitle ?? '',
    spotifyArtist: entry.spotifyArtist ?? '',
    score: entry.score ?? 150,
    matchedAt: Date.now(),
  };
  current.matches[entry.spotifyId] = matchEntry;
  saveStore(current);
  return matchEntry;
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

function titleWordStats(spotifyTitle: string, candidateTitle: string): { matched: number; total: number; ratio: number } {
  const titleWords = words(spotifyTitle);
  if (titleWords.length === 0) return { matched: 0, total: 0, ratio: 0 };

  const matched = titleWords.filter((word) => candidateTitle.includes(word)).length;
  return {
    matched,
    total: titleWords.length,
    ratio: matched / titleWords.length,
  };
}

function keywordAllowed(keyword: string, spotifyTrack: Track): boolean {
  const combined = normalize(`${spotifyTrack.title} ${spotifyTrack.artist} ${spotifyTrack.query ?? ''}`);
  return hasKeyword(combined, keyword);
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

export function scoreCandidate(
  spotifyTrack: Track,
  candidate: Track,
  romajiMeta?: { title?: string; artist?: string }
): ScoredCandidate {
  const spotifyTitle = normalize(spotifyTrack.title);
  const spotifyArtist = normalize(spotifyTrack.artist);
  const candidateTitle = normalize(candidate.title);
  const candidateArtist = normalize(candidate.artist);
  const romajiTitle = romajiMeta?.title ? normalize(romajiMeta.title) : '';
  const romajiArtist = romajiMeta?.artist ? normalize(romajiMeta.artist) : '';

  const spotifyTitleCompact = spotifyTitle.replace(/\s+/g, '');
  const candidateTitleCompact = candidateTitle.replace(/\s+/g, '');
  const romajiTitleCompact = romajiTitle.replace(/\s+/g, '');
  const combined = `${candidateTitle} ${candidateArtist}`;
  const reasons: string[] = [];
  let score = 0;
  let hasArtistChannelMatch = false;

  const titleStats = titleWordStats(spotifyTrack.title, candidateTitle);
  const romajiTitleStats = romajiTitle ? titleWordStats(romajiTitle, candidateTitle) : { matched: 0, total: 0, ratio: 0 };
  const maxTitleMatched = Math.max(titleStats.matched, romajiTitleStats.matched);

  if (maxTitleMatched > 0) {
    score += maxTitleMatched * 10;
  }

  if (
    (titleStats.total > 0 && (titleStats.ratio >= 0.67 || titleStats.matched >= 3)) ||
    (romajiTitleStats.total > 0 && (romajiTitleStats.ratio >= 0.67 || romajiTitleStats.matched >= 3))
  ) {
    reasons.push(`title-word-match:${maxTitleMatched}/${Math.max(titleStats.total, romajiTitleStats.total)}`);
  }

  let hasAnyArtistMatch = false;
  const artistCandidates = [
    ...splitArtistNames(spotifyTrack.artist),
    ...(romajiArtist ? splitArtistNames(romajiArtist) : []),
  ];

  for (const artistName of artistCandidates) {
    if (artistName && candidateArtist.includes(artistName)) {
      hasArtistChannelMatch = true;
      hasAnyArtistMatch = true;
      score += 90;
      reasons.push('artist-channel-match');
    } else if (artistName && combined.includes(artistName)) {
      hasAnyArtistMatch = true;
      score += 45;
      reasons.push('artist-match');
    }
  }

  if (spotifyTrack.artist && spotifyTrack.artist.trim().length > 0 && !hasAnyArtistMatch) {
    score -= 150;
    reasons.push('artist-mismatch-penalty');
  }

  if (candidateTitle.includes(spotifyTitle) || (romajiTitle && candidateTitle.includes(romajiTitle))) {
    score += 60;
    reasons.push('title-phrase');
  }

  if (
    (spotifyTitleCompact.length >= 2 && candidateTitleCompact.includes(spotifyTitleCompact)) ||
    (romajiTitleCompact.length >= 2 && candidateTitleCompact.includes(romajiTitleCompact))
  ) {
    score += 60;
    reasons.push('title-compact');
  }

  let maxPositiveTitleBonus = 0;
  let bestPositiveKeyword = '';
  for (const keyword of positiveTitleKeywords) {
    if (hasKeyword(candidateTitle, keyword)) {
      const bonus = keyword.startsWith('official')
        ? 60
        : keyword === 'mv' || keyword === 'music video'
          ? 40
          : keyword === 'original'
            ? 30
            : 20;
      if (bonus > maxPositiveTitleBonus) {
        maxPositiveTitleBonus = bonus;
        bestPositiveKeyword = keyword;
      }
    }
  }
  if (maxPositiveTitleBonus > 0) {
    score += maxPositiveTitleBonus;
    reasons.push(`positive-title:${bestPositiveKeyword}`);
  }

  for (const keyword of positiveChannelKeywords) {
    if (hasKeyword(candidateArtist, keyword)) {
      score += keyword === 'official' ? 80 : 55;
      reasons.push(`positive-channel:${keyword}`);
    }
  }

  for (const keyword of negativeKeywords) {
    if (hasKeyword(combined, keyword) && !keywordAllowed(keyword, spotifyTrack)) {
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
    if (hasKeyword(combined, keyword) && !hasOfficialSignal && !keywordAllowed(keyword, spotifyTrack)) {
      score -= keyword.includes('sing') ? 120 : 65;
      reasons.push(`fan-upload:${keyword}`);
    }
  }

  for (const keyword of liveVersionKeywords) {
    if (hasKeyword(combined, keyword) && !keywordAllowed(keyword, spotifyTrack)) {
      score -= keyword === 'tour' ? 260 : 180;
      reasons.push(`live-version:${keyword}`);
    }
  }

  for (const keyword of alternateVersionKeywords) {
    if (hasKeyword(combined, keyword) && !keywordAllowed(keyword, spotifyTrack)) {
      score -= 220;
      reasons.push(`alternate-version:${keyword}`);
    }
  }

  const spotifyCombinedText = `${spotifyTrack.title} ${spotifyTrack.artist} ${spotifyTrack.query ?? ''}`;

  if (!hasDateLikeTitle(spotifyCombinedText) && hasDateLikeTitle(candidate.title)) {
    score -= 170;
    reasons.push('date-in-title');
  }

  if (hasLiveVisualSignal(candidate.title) && !hasLiveVisualSignal(spotifyCombinedText)) {
    score -= 210;
    reasons.push('live-visual');
  }

  const hasTitleMatch =
    reasons.includes('title-phrase') ||
    reasons.includes('title-compact') ||
    reasons.some((reason) => reason.startsWith('title-word-match:'));

  if (spotifyTrack.duration > 0 && candidate.duration > 0) {
    const diff = Math.abs(candidate.duration - spotifyTrack.duration);
    if (diff <= 5) {
      score += 90;
      reasons.push('duration-close');
    } else if (diff <= 15) {
      score += 50;
      reasons.push('duration-near');
    } else if (diff >= 45) {
      // If official channel + title match, MV has intro/outro animation; penalize mildly
      const penalty = hasArtistChannelMatch && hasTitleMatch ? 30 : diff >= 90 ? 110 : 70;
      score -= penalty;
      reasons.push('duration-far');
    }
  }

  return { track: candidate, score, reasons };
}

function hasArtistChannelMatch(candidate: ScoredCandidate): boolean {
  return candidate.reasons.includes('artist-channel-match');
}

export function hasTitleEvidence(candidate: ScoredCandidate): boolean {
  if (
    candidate.reasons.includes('artist-channel-match') &&
    (candidate.reasons.includes('duration-close') || candidate.reasons.includes('duration-near'))
  ) {
    return true;
  }
  return (
    candidate.reasons.includes('title-phrase') ||
    candidate.reasons.includes('title-compact') ||
    candidate.reasons.some((reason) => reason.startsWith('title-word-match:'))
  );
}

export function isAcceptableCandidate(candidate: ScoredCandidate | undefined): candidate is ScoredCandidate {
  return Boolean(candidate && candidate.score >= 100 && hasTitleEvidence(candidate));
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

  const rescored = scoreCandidate(spotifyTrack, {
    ...spotifyTrack,
    id: cached.youtubeId,
    youtubeId: cached.youtubeId,
    youtubeTitle: cached.youtubeTitle,
    youtubeArtist: cached.youtubeArtist,
    title: cached.youtubeTitle,
    artist: cached.youtubeArtist,
    duration: 0,
  });

  if (cached.score < 100 || !isAcceptableCandidate(rescored)) {
    console.log(
      `[matcher] cache rejected ${JSON.stringify({
        spotifyId: spotifyTrack.spotifyId,
        youtubeId: cached.youtubeId,
        score: cached.score,
        rescored: rescored.score,
        reasons: rescored.reasons,
      })}`
    );
    delete getStore().matches[spotifyTrack.spotifyId];
    saveStore(getStore());
    return null;
  }

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

export function getMatchCacheEntry(spotifyId: string): MatchCacheEntry | null {
  if (!spotifyId) return null;
  return getStore().matches[spotifyId] ?? null;
}

function writeCache(spotifyTrack: Track, candidate: ScoredCandidate) {
  if (!spotifyTrack.spotifyId) return;
  const current = getStore();
  current.matches[spotifyTrack.spotifyId] = {
    spotifyId: spotifyTrack.spotifyId,
    spotifyTitle: spotifyTrack.title,
    spotifyArtist: spotifyTrack.artist,
    youtubeId: candidate.track.id,
    youtubeTitle: candidate.track.title,
    youtubeArtist: candidate.track.artist,
    score: candidate.score,
    matchedAt: Date.now(),
  };
  saveStore(current);
}

export interface QueryAttempt {
  query: string;
  fallbackIndex: number;
  candidateCount: number;
  best: ScoredCandidate | null;
  candidates: ScoredCandidate[];
}

export interface MatcherChainResult {
  attempts: QueryAttempt[];
  accepted: ScoredCandidate | null;
  lastBest: ScoredCandidate | null;
}

export async function buildMatcherQueriesAsync(spotifyTrack: Track): Promise<{ queries: string[]; romajiMeta?: { title: string; artist: string } }> {
  const syncQueries = buildMatcherQueries(spotifyTrack);
  const hasJapanese = hasJapaneseScript(spotifyTrack.title) || hasJapaneseScript(spotifyTrack.artist);
  if (!hasJapanese) {
    return { queries: syncQueries };
  }

  try {
    const [romajiTitle, romajiArtist] = await Promise.all([
      toRomajiText(spotifyTrack.title),
      toRomajiText(spotifyTrack.artist),
    ]);

    const romajiCanonical = `${romajiTitle} - ${romajiArtist}`.trim();
    const romajiTitleOnly = romajiTitle.trim();
    const romajiArtistOnly = romajiArtist.trim();

    const queries = [...new Set([
      ...syncQueries,
      romajiCanonical,
      `${romajiTitleOnly} ${romajiArtistOnly}`,
      romajiTitleOnly,
      `${spotifyTrack.title} ${romajiArtistOnly}`,
      `${romajiTitleOnly} ${spotifyTrack.artist}`,
    ].map((q) => q.trim()))].filter((q) => q.length > 0);

    return {
      queries,
      romajiMeta: { title: romajiTitle, artist: romajiArtist },
    };
  } catch {
    return { queries: syncQueries };
  }
}

export function buildMatcherQueries(spotifyTrack: Track): string[] {
  const stripPunctuation = (value: string): string =>
    value.replace(/[!?.…]+/g, ' ').replace(/\s+/g, ' ').trim();

  const canonical = stripPunctuation(`${spotifyTrack.title} - ${spotifyTrack.artist}`);
  const titleOnly = stripPunctuation(spotifyTrack.title);
  const artistOnly = stripPunctuation(spotifyTrack.artist);

  // Strip CJK / non‑Latin characters for a pure‑ASCII fallback
  const asciiTitle = titleOnly.replace(/[^\x00-\x7F]/g, '').trim().replace(/\s+/g, ' ');
  const asciiArtist = artistOnly.replace(/[^\x00-\x7F]/g, '').trim().replace(/\s+/g, ' ');
  const asciiTitleOnly = asciiTitle.replace(/\s*[-–~|]\s*[^-–~|]+$/, '').trim();

  return [...new Set([
    canonical,
    titleOnly,
    `${asciiTitle} ${artistOnly}`,
    `${asciiTitle} ${asciiArtist}`,
    asciiTitle,
    asciiTitleOnly,
    `${asciiTitleOnly} ${artistOnly}`,
    `${asciiTitleOnly} ${asciiArtist}`,
    artistOnly,
    asciiArtist,
  ].map((q) => q.trim()))].filter((q) => q.length > 0);
}

async function runMatcherChain(
  spotifyTrack: Track,
  queries: string[],
  limit: number,
  romajiMeta?: { title?: string; artist?: string }
): Promise<MatcherChainResult> {
  const attempts: QueryAttempt[] = [];
  let accepted: ScoredCandidate | null = null;
  let lastBest: ScoredCandidate | undefined;

  for (const query of queries) {
    const candidates = await searchTracks(query, limit);
    const ranked = candidates
      .filter((candidate) => !isPlaybackBlacklisted(candidate.id))
      .map((candidate) => scoreCandidate(spotifyTrack, candidate, romajiMeta))
      .sort(compareCandidates);
    const bestAcceptable = ranked.find(isAcceptableCandidate) ?? ranked[0];
    lastBest = bestAcceptable ?? lastBest;
    attempts.push({
      query,
      fallbackIndex: queries.indexOf(query),
      candidateCount: candidates.length,
      best: bestAcceptable ?? null,
      candidates: ranked,
    });
    if (isAcceptableCandidate(bestAcceptable)) {
      accepted = bestAcceptable;
      break;
    }
  }

  return { attempts, accepted, lastBest: lastBest ?? null };
}

export async function matchSpotifyTrackToYoutube(spotifyTrack: Track): Promise<Track | null> {
  const cached = fromCache(spotifyTrack);
  if (cached) return cached;

  const { queries, romajiMeta } = await buildMatcherQueriesAsync(spotifyTrack);

  const result = await matchQueue.add<Track | null>(async () => {
    const startedAt = Date.now();
    const { attempts, accepted, lastBest } = await runMatcherChain(spotifyTrack, queries, 12, romajiMeta);
    const usedQuery = attempts.length > 0 ? attempts[attempts.length - 1].query : queries[0];

    console.log(
      `[matcher] spotify->youtube ${JSON.stringify({
        spotifyId: spotifyTrack.spotifyId,
        query: usedQuery,
        fallbackTried: attempts.length - 1,
        queriesTried: attempts.map((a) => ({
          query: a.query,
          fallbackIndex: a.fallbackIndex,
          candidateCount: a.candidateCount,
          bestId: a.best?.track.id,
          bestTitle: a.best?.track.title,
          bestScore: a.best?.score,
          bestReasons: a.best?.reasons,
          acceptable: isAcceptableCandidate(a.best ?? undefined),
        })),
        bestId: accepted?.track.id ?? lastBest?.track.id,
        bestTitle: accepted?.track.title ?? lastBest?.track.title,
        score: accepted?.score ?? lastBest?.score,
        reasons: accepted?.reasons ?? lastBest?.reasons,
        accepted: Boolean(accepted),
        elapsedMs: Date.now() - startedAt,
      })}`
    );

    if (!accepted) return null;

    writeCache(spotifyTrack, accepted);

    return {
      ...spotifyTrack,
      id: accepted.track.id,
      query: usedQuery,
      youtubeId: accepted.track.id,
      youtubeTitle: accepted.track.title,
      youtubeArtist: accepted.track.artist,
    };
  });

  return result ?? null;
}

export interface MatcherDebugResult {
  queries: string[];
  cached: MatchCacheEntry | null;
  attempts: QueryAttempt[];
  accepted: ScoredCandidate | null;
  lastBest: ScoredCandidate | null;
  candidates: ScoredCandidate[];
}

export async function debugSpotifyYoutubeMatch(
  spotifyTrack: Track,
  limit = 10
): Promise<MatcherDebugResult> {
  const queries = buildMatcherQueries(spotifyTrack);
  const { attempts, accepted, lastBest } = await runMatcherChain(spotifyTrack, queries, limit);
  const primaryAttempt = attempts.find((a) => Boolean(a.best) && isAcceptableCandidate(a.best ?? undefined)) ?? attempts[0];

  return {
    queries,
    cached: getCachedMatch(spotifyTrack),
    attempts,
    accepted,
    lastBest,
    candidates: primaryAttempt?.candidates ?? [],
  };
}

export async function matchSpotifyTracksToYoutube(tracks: Track[]): Promise<Track[]> {
  const matched = await Promise.all(tracks.map((track) => matchSpotifyTrackToYoutube(track)));
  return matched.filter((track): track is Track => Boolean(track));
}
