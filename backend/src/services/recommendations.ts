import type { Track } from '../types/index.js';
import { getEnvConfig } from './env.js';
import { searchSpotify } from './spotify.js';
import { searchTracks } from './audioResolver.js';
import { getPlaybackBlacklist, isPlaybackBlacklisted } from './playbackBlacklist.js';
import { getSimilarTracks, isLastFmConfigured } from './lastfm.js';
import { getRecentTracks, getTopTracks } from './cache.js';

interface RecommendationOptions {
  excludeIds?: string[];
  limit?: number;
}

type RecommendationSource = 'lastfm' | 'search' | 'local';
type TrackWithPlayback = Track & { playCount?: number; lastPlayed?: number };

interface RecommendationCandidate {
  track: Track;
  source: RecommendationSource;
  match?: number;
  targetTitle?: string;
  targetArtist?: string;
}

export interface PersonalMix {
  id: string;
  name: string;
  description: string;
  cover: string;
  seed: Track;
  tracks: Track[];
}

const badKeywords = [
  'reaction', 'reacts', 'react', 'review', 'breakdown', 'analysis',
  'cover', 'ai cover', 'piano cover', 'piano version', 'piano arrangement',
  'piano instrumental', 'piano solo', 'instrumental cover', 'guitar cover',
  'guitar instrumental', 'drum cover', 'drums cover', 'drum cam',
  'drum playthrough', 'drum performance', 'violin cover', 'orchestra cover',
  'orchestral cover', 'acoustic cover', 'backing track', 'backtrack',
  'minus one', 'off vocal', 'no vocal', 'no vocals', 'sheet music',
  'synthesia', 'parody', 'meme', 'karaoke', 'instrumental', 'tutorial',
  'nightcore', 'sped up', 'slowed', '8d',
];

const instrumentalCoverKeywords = [
  'piano cover', 'piano version', 'piano arrangement', 'piano instrumental',
  'piano solo', 'instrumental cover', 'guitar cover', 'guitar instrumental',
  'drum cover', 'drums cover', 'drum cam', 'drum playthrough', 'drum performance',
  'violin cover', 'orchestra cover', 'orchestral cover', 'acoustic cover',
  'backing track', 'backtrack', 'minus one', 'off vocal', 'no vocal',
  'no vocals', 'sheet music', 'synthesia',
];

const liveVersionKeywords = [
  'live', 'live version', 'live performance', 'concert', 'stage', 'showcase', 'tour',
];

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isLatinTokenPhrase(value: string): boolean {
  return /^[a-z0-9\s]+$/.test(value);
}

function containsNormalizedPhrase(haystack: string, phrase: string): boolean {
  const normalizedHaystack = normalize(haystack);
  const normalizedPhrase = normalize(phrase);
  if (!normalizedHaystack || !normalizedPhrase) return false;

  if (isLatinTokenPhrase(normalizedPhrase)) {
    return new RegExp(`(^|\\s)${escapeRegExp(normalizedPhrase)}($|\\s)`).test(normalizedHaystack);
  }

  return normalizedHaystack.includes(normalizedPhrase);
}

function isShortLatinArtist(value: string): boolean {
  const normalized = normalize(value);
  return /^[a-z0-9]+$/.test(normalized) && normalized.length <= 3;
}

function primaryArtist(artist: string): string {
  return artist
    .split(',')
    .map((part) => part.trim())
    .find(Boolean) ?? artist;
}

function uniqueKey(track: Track): string {
  return track.spotifyId ?? track.youtubeId ?? track.id;
}

function artistKey(track: Track): string {
  return normalize(primaryArtist(track.artist)) || 'unknown';
}

function isPlayableCandidate(track: Track): boolean {
  if (track.spotifyId || track.id.startsWith('spotify:')) return true;
  return /^[a-zA-Z0-9_-]{11}$/.test(track.youtubeId ?? track.id);
}

function shouldUseSpotifySearch(seed: Track): boolean {
  return Boolean(seed.spotifyId) && getEnvConfig().searchEngine === 'spotify';
}

function searchForSeed(seed: Track, query: string, limit: number): Promise<Track[]> {
  return shouldUseSpotifySearch(seed)
    ? searchSpotify(query, limit)
    : searchTracks(query, limit);
}

function buildFallbackQueries(seed: Track): string[] {
  const artist = primaryArtist(seed.artist);
  const compactArtist = normalize(artist);
  const queries = [
    `${seed.title} ${artist}`,
    seed.query,
    `artist:"${artist}"`,
    artist,
    `${artist} songs`,
    `${artist} official`,
    `${artist} topic`,
  ];

  if (compactArtist.includes('hakos') || compactArtist.includes('hakoz')) {
    queries.push('Hakos Baelz', 'Hakos Baelz original songs', 'hololive english songs');
  }

  return [...new Set(queries.map((query) => query.trim()).filter(Boolean))];
}

function uniqueTracks(tracks: Track[]): Track[] {
  const seen = new Set<string>();
  const result: Track[] = [];
  for (const track of tracks) {
    const key = uniqueKey(track);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(track);
  }
  return result;
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function mixId(value: string): string {
  return normalize(value).replace(/\s+/g, '-').slice(0, 48) || 'nightly';
}

function pickArtistSeed(tracks: Track[], usedSeedIds: Set<string>): Track | null {
  const byArtist = new Map<string, { artist: string; tracks: Track[]; score: number }>();
  tracks.forEach((track, index) => {
    const key = artistKey(track);
    if (!key || key === 'unknown') return;
    const entry = byArtist.get(key) ?? { artist: primaryArtist(track.artist), tracks: [], score: 0 };
    entry.tracks.push(track);
    entry.score += ((track as TrackWithPlayback).playCount ?? 0) * 4 + Math.max(1, tracks.length - index);
    byArtist.set(key, entry);
  });

  const [best] = [...byArtist.values()]
    .filter((entry) => entry.tracks.length >= 2)
    .sort((a, b) => b.score - a.score);
  return best?.tracks.find((track) => !usedSeedIds.has(uniqueKey(track))) ?? null;
}

function buildPersonalMixSeeds(): Array<{ id: string; name: string; description: string; seed: Track }> {
  const recent = uniqueTracks(getRecentTracks(30));
  const top = uniqueTracks(getTopTracks(24).filter((track) => (track.playCount ?? 0) > 0));
  const pool = uniqueTracks([...recent, ...top]);
  const usedSeedIds = new Set<string>();
  const seeds: Array<{ id: string; name: string; description: string; seed: Track }> = [];

  const addSeed = (name: string, description: string, seed?: Track | null) => {
    if (!seed) return;
    const key = uniqueKey(seed);
    if (!key || usedSeedIds.has(key)) return;
    usedSeedIds.add(key);
    seeds.push({ id: mixId(name), name, description, seed });
  };

  const artistSeed = pickArtistSeed(pool, usedSeedIds);
  if (artistSeed) {
    addSeed(
      `${titleCase(primaryArtist(artistSeed.artist))} Drift`,
      `A nearby path from your ${primaryArtist(artistSeed.artist)} plays.`,
      artistSeed
    );
  }

  addSeed('Recent Drift', 'A fresh drift from what has been looping lately.', recent[0]);
  addSeed('Deep Rotation', 'Built from tracks that keep coming back.', top[0]);

  const alternateSeed = pool.find((track) => !usedSeedIds.has(uniqueKey(track)));
  addSeed('Nightly Drift', 'A wider mix from your local listening pattern.', alternateSeed);

  return seeds.slice(0, 4);
}

function getLocalPersonalCandidates(seed: Track, excludeIds: Set<string>, limit: number): RecommendationCandidate[] {
  const seedArtist = artistKey(seed);
  const pool = uniqueTracks([...getRecentTracks(60), ...getTopTracks(40)]);
  const scored = pool
    .filter((track) => {
      const key = uniqueKey(track);
      if (!key || key === uniqueKey(seed) || excludeIds.has(key)) return false;
      if (track.spotifyId && excludeIds.has(track.spotifyId)) return false;
      if (track.youtubeId && excludeIds.has(track.youtubeId)) return false;
      return isPlayableCandidate(track);
    })
    .map((track, index) => {
      const playback = track as TrackWithPlayback;
      let score = Math.max(1, pool.length - index);
      if (artistKey(track) === seedArtist) score += 90;
      if (playback.playCount) score += playback.playCount * 8;
      if (playback.lastPlayed) {
        const ageHours = (Date.now() - playback.lastPlayed) / (1000 * 60 * 60);
        score += Math.max(0, 48 - ageHours);
      }
      return { track, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(({ track }, index) => ({
    track,
    source: 'local',
    match: Math.max(0, 1 - index / Math.max(1, limit)),
    targetArtist: primaryArtist(seed.artist),
  }));
}

function scoreRecommendation(seed: Track, item: RecommendationCandidate, order: number): number {
  const candidate = item.track;
  const seedArtist = normalize(primaryArtist(seed.artist));
  const seedTitle = normalize(seed.title);
  const title = normalize(candidate.title);
  const artist = normalize(candidate.artist);
  const combined = `${title} ${artist}`;
  let score = 100 - order;
  const artistMatch =
    containsNormalizedPhrase(candidate.artist, seedArtist) ||
    containsNormalizedPhrase(combined, seedArtist);

  if (artistMatch) {
    score += 150;
  } else if (isShortLatinArtist(seedArtist) && combined.includes(seedArtist)) {
    score -= 140;
  }

  if (item.source === 'lastfm') {
    score += 110 + Math.round((item.match ?? 0) * 80);
    if (item.targetTitle && containsNormalizedPhrase(candidate.title, item.targetTitle)) score += 40;
    if (item.targetArtist && containsNormalizedPhrase(candidate.artist, item.targetArtist)) score += 40;
    if (artistKey(candidate) !== seedArtist) score += 35;
  } else if (item.source === 'local') {
    score += 90 + Math.round((item.match ?? 0) * 40);
  } else if (isLastFmConfigured()) {
    score -= 45;
  }

  if (candidate.spotifyId) score += 25;
  if (artist.includes('official')) score += 60;
  if (artist.includes('topic')) score += 50;
  if (artist.includes('vevo')) score += 45;

  if (title === seedTitle || title.includes(seedTitle)) score -= 120;

  for (const keyword of badKeywords) {
    if (combined.includes(keyword) && !seedTitle.includes(keyword)) {
      score -= instrumentalCoverKeywords.includes(keyword)
        ? 200
        : keyword.includes('react') || keyword === 'ai cover'
          ? 220
          : 100;
    }
  }

  for (const keyword of ['sings', 'singing', 'sung by']) {
    if (combined.includes(keyword) && !seedTitle.includes(keyword)) score -= 140;
  }

  for (const keyword of liveVersionKeywords) {
    if (combined.includes(keyword) && !seedTitle.includes(keyword)) {
      score -= keyword === 'tour' ? 260 : 180;
    }
  }

  if (candidate.duration > 0 && seed.duration > 0) {
    const ratio = candidate.duration / seed.duration;
    if (ratio >= 0.65 && ratio <= 1.45) score += 30;
    if (ratio < 0.4 || ratio > 2.2) score -= 60;
  }

  return score;
}

function selectRecommendations(
  ranked: Array<{ item: RecommendationCandidate; score: number }>,
  seed: Track,
  limit: number,
  preferDiversity: boolean
): Track[] {
  const sorted = ranked.sort((a, b) => b.score - a.score);
  if (!preferDiversity) {
    return sorted.slice(0, limit).map(({ item }) => item.track);
  }

  const seedArtist = normalize(primaryArtist(seed.artist));
  const maxSeedArtist = Math.max(2, Math.floor(limit * 0.35));
  const maxOtherArtist = Math.max(2, Math.floor(limit * 0.25));
  const artistCounts = new Map<string, number>();
  const selected: Array<{ item: RecommendationCandidate; score: number }> = [];
  const deferred: Array<{ item: RecommendationCandidate; score: number }> = [];

  for (const entry of sorted) {
    const key = artistKey(entry.item.track);
    const current = artistCounts.get(key) ?? 0;
    const maxForArtist = key === seedArtist ? maxSeedArtist : maxOtherArtist;

    if (current < maxForArtist) {
      selected.push(entry);
      artistCounts.set(key, current + 1);
      if (selected.length >= limit) break;
    } else {
      deferred.push(entry);
    }
  }

  if (selected.length < limit) {
    selected.push(...deferred.slice(0, limit - selected.length));
  }

  return selected.slice(0, limit).map(({ item }) => item.track);
}

function diversifyPersonalMixTracks(tracks: Track[], limit: number): Track[] {
  const unique = uniqueTracks(tracks);
  const maxPerArtist = limit >= 8 ? 2 : Math.max(1, Math.ceil(limit / 4));
  const selected: Track[] = [];
  const deferred: Track[] = [];
  const artistCounts = new Map<string, number>();

  for (const track of unique) {
    const key = artistKey(track);
    const current = artistCounts.get(key) ?? 0;
    if (current < maxPerArtist) {
      selected.push(track);
      artistCounts.set(key, current + 1);
    } else {
      deferred.push(track);
    }
  }

  if (selected.length < limit) {
    const relaxedCounts = new Map<string, number>();
    selected.forEach((track) => {
      const key = artistKey(track);
      relaxedCounts.set(key, (relaxedCounts.get(key) ?? 0) + 1);
    });

    for (const track of deferred) {
      const key = artistKey(track);
      const current = relaxedCounts.get(key) ?? 0;
      if (current >= maxPerArtist + 1) continue;
      selected.push(track);
      relaxedCounts.set(key, current + 1);
      if (selected.length >= limit) break;
    }
  }

  if (selected.length < limit) {
    selected.push(...deferred.filter((track) => !selected.includes(track)).slice(0, limit - selected.length));
  }

  return selected.slice(0, limit);
}

// Resolve Last.fm similar tracks → search each as targeted query
async function getCandidatesFromLastFm(seed: Track, limit: number): Promise<RecommendationCandidate[]> {
  const similar = await getSimilarTracks(seed.title, primaryArtist(seed.artist), limit);

  if (similar.length === 0) return [];

  console.log(
    `[recommend] Last.fm returned ${similar.length} similar tracks for "${seed.title} - ${seed.artist}"`
  );

  // Search top matches — higher match score = search first
  const sorted = [...similar].sort((a, b) => b.match - a.match).slice(0, limit);

  const results = await Promise.allSettled(
    sorted.map(async ({ title, artist, match }) => {
      const query = `${title} ${artist}`;
      const tracks = await searchForSeed(seed, query, 3);

      return tracks.map((track): RecommendationCandidate => ({
        track,
        source: 'lastfm',
        match,
        targetTitle: title,
        targetArtist: artist,
      }));
    })
  );

  return results
    .filter((r): r is PromiseFulfilledResult<RecommendationCandidate[]> => r.status === 'fulfilled')
    .flatMap((r) => r.value);
}

// Fallback: search by artist name queries (original behaviour)
async function getCandidatesFromSearch(seed: Track, limit: number): Promise<RecommendationCandidate[]> {
  const queries = buildFallbackQueries(seed);
  const batches: RecommendationCandidate[][] = [];

  for (const query of queries) {
    try {
      const raw = await searchForSeed(seed, query, Math.min(limit, 10));
      batches.push(raw.map((track) => ({ track, source: 'search' })));
    } catch (err) {
      console.warn(
        `[recommend] query failed ${JSON.stringify({ query, message: (err as Error).message })}`
      );
    }
  }

  return batches.flat();
}

export async function getRecommendations(
  seed: Track,
  options: RecommendationOptions = {}
): Promise<Track[]> {
  const limit = options.limit ?? 12;
  const excluded = new Set(
    [seed.id, seed.youtubeId, seed.spotifyId, ...(options.excludeIds ?? [])].filter(Boolean)
  );
  for (const id of getPlaybackBlacklist()) excluded.add(id);

  // Last.fm candidates first, fall back to search-based if not configured or returns empty
  let candidates: RecommendationCandidate[] = [];
  let hasLastFmCandidates = false;
  if (isLastFmConfigured()) {
    try {
      candidates = await getCandidatesFromLastFm(seed, Math.max(limit, 10));
      hasLastFmCandidates = candidates.length > 0;
    } catch (err) {
      console.warn(`[recommend] Last.fm failed, falling back to search: ${(err as Error).message}`);
    }
  }

  // Always supplement with search-based candidates (covers edge cases + fills gaps)
  const searchCandidates = await getCandidatesFromSearch(seed, Math.max(limit, 10));
  candidates = [...candidates, ...searchCandidates];

  const seen = new Set<string>();
  const ranked: Array<{ item: RecommendationCandidate; score: number }> = [];

  candidates.forEach((item, order) => {
    const candidate = item.track;
    const key = uniqueKey(candidate);
    if (!isPlayableCandidate(candidate)) return;
    if (isPlaybackBlacklisted(candidate.youtubeId ?? candidate.id)) return;
    if (!key || seen.has(key) || excluded.has(candidate.id) || excluded.has(candidate.spotifyId ?? '')) return;
    seen.add(key);
    ranked.push({ item, score: scoreRecommendation(seed, item, order) });
  });

  const recommendations = selectRecommendations(ranked, seed, limit, hasLastFmCandidates);

  console.log(
    `[recommend] generated ${JSON.stringify({
      seed: `${seed.title} - ${seed.artist}`,
      source: isLastFmConfigured() ? 'lastfm+search' : 'search',
      candidateCount: candidates.length,
      returned: recommendations.length,
      top: recommendations.slice(0, 5).map((t) => `${t.title} - ${t.artist}`),
    })}`
  );

  return recommendations;
}

export async function getPersonalMixes(
  options: { mixLimit?: number; tracksPerMix?: number; excludeIds?: string[] } = {}
): Promise<PersonalMix[]> {
  const mixLimit = options.mixLimit ?? 4;
  const tracksPerMix = options.tracksPerMix ?? 8;
  const seeds = buildPersonalMixSeeds().slice(0, mixLimit);
  const globalExcluded = new Set((options.excludeIds ?? []).filter(Boolean));
  const mixes: PersonalMix[] = [];

  for (const seedInfo of seeds) {
    const seedKey = uniqueKey(seedInfo.seed);
    const excludeIds = [...globalExcluded, seedInfo.seed.id, seedInfo.seed.spotifyId ?? '', seedInfo.seed.youtubeId ?? '']
      .filter(Boolean);

    try {
      const localCandidates = getLocalPersonalCandidates(seedInfo.seed, new Set(excludeIds), tracksPerMix);
      const localTracks = selectRecommendations(
        localCandidates.map((item, index) => ({
          item,
          score: scoreRecommendation(seedInfo.seed, item, index),
        })),
        seedInfo.seed,
        tracksPerMix,
        true
      );
      const tracks = await getRecommendations(seedInfo.seed, {
        excludeIds,
        limit: tracksPerMix * 2,
      });
      const unique = diversifyPersonalMixTracks([...localTracks, ...tracks], tracksPerMix);
      if (unique.length === 0) continue;

      unique.forEach((track) => {
        globalExcluded.add(track.id);
        if (track.spotifyId) globalExcluded.add(track.spotifyId);
        if (track.youtubeId) globalExcluded.add(track.youtubeId);
      });

      mixes.push({
        id: seedInfo.id,
        name: seedInfo.name,
        description: seedInfo.description,
        cover: seedInfo.seed.thumbnail || unique[0]?.thumbnail || '',
        seed: seedInfo.seed,
        tracks: unique.map((track) => ({ ...track, queueSource: 'recommendation' })),
      });
    } catch (err) {
      console.warn(
        `[recommend] personal mix failed ${JSON.stringify({
          seed: seedKey,
          name: seedInfo.name,
          message: (err as Error).message,
        })}`
      );
    }
  }

  console.log(
    `[recommend] personal mixes ${JSON.stringify({
      seeds: seeds.length,
      returned: mixes.length,
      names: mixes.map((mix) => mix.name),
    })}`
  );

  return mixes;
}
