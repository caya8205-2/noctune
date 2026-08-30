import type { Track } from '../types/index.js';
import { getEnvConfig } from './env.js';
import { searchSpotify } from './spotify.js';
import { searchTracks } from './audioResolver.js';
import { getPlaybackBlacklist, isPlaybackBlacklisted } from './playbackBlacklist.js';
import { getSimilarTracks, isLastFmConfigured } from './lastfm.js';
import { getRecentTracks, getTopTracks } from './cache.js';
import { predictMlRecommendations, generateMlNightlyMixes } from './mlRecommendation.js';

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

function cleanTitle(title: string): string {
  return (title || '')
    .toLowerCase()
    .replace(/\(feat\..*?\)/gi, '')
    .replace(/\[feat\..*?\]/gi, '')
    .replace(/- topic$/gi, '')
    .replace(/official video|music video|lyric video/gi, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .trim();
}

function cleanArtist(artist: string): string {
  return (artist || '')
    .toLowerCase()
    .replace(/- topic$/gi, '')
    .split(/[,&]/)[0]
    .replace(/[^\p{L}\p{N}]/gu, '')
    .trim();
}

function uniqueKey(track: Track): string {
  const cTitle = cleanTitle(track.title || '');
  const cArtist = cleanArtist(track.artist || '');
  if (cTitle && cArtist) return `${cArtist}:${cTitle}`;
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

function parseTitleMetadata(title: string): { artistOrFranchise: string; songTitle: string } | null {
  if (!title) return null;
  const cleanStr = title
    .replace(/\{.*?\}/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\(feat\..*?\)/gi, '')
    .replace(/\(w\/.*?\)/gi, '')
    .trim();

  // Pattern: "Song Title || Franchise/Artist" or "Franchise/Artist || Song Title"
  if (cleanStr.includes('||')) {
    const parts = cleanStr.split('||').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return { artistOrFranchise: parts[1], songTitle: parts[0] };
    }
  }

  // Pattern: "Song Title (From "Franchise")"
  const fromMatch = cleanStr.match(/(.*?)\s*\((?:From|OST)\s+["']?(.*?)["']?\)/i);
  if (fromMatch && fromMatch[1] && fromMatch[2]) {
    return { artistOrFranchise: fromMatch[2].trim(), songTitle: fromMatch[1].trim() };
  }

  // Pattern: "Artist / Franchise - Song Title"
  if (cleanStr.includes(' - ')) {
    const parts = cleanStr.split(' - ').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return { artistOrFranchise: parts[0], songTitle: parts[1] };
    }
  }

  return null;
}

function buildFallbackQueries(seed: Track): string[] {
  const rawArtist = primaryArtist(seed.artist);
  const compactArtist = normalize(rawArtist);
  const titleMeta = parseTitleMetadata(seed.title);
  const queries: string[] = [];

  if (titleMeta && titleMeta.artistOrFranchise.length > 2) {
    queries.push(`${titleMeta.artistOrFranchise} ${titleMeta.songTitle}`);
    queries.push(`${titleMeta.artistOrFranchise} OST`);
    queries.push(`${titleMeta.artistOrFranchise} songs`);
    queries.push(titleMeta.artistOrFranchise);
  }

  const cleanSeedTitle = seed.title
    .replace(/\{.*?\}/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\(w\/.*?\)/gi, '')
    .trim();

  const cleanArtistName = rawArtist.replace(/- topic$/gi, '').trim();
  if (cleanArtistName) {
    queries.push(`${cleanSeedTitle} ${cleanArtistName}`);
    queries.push(`${cleanArtistName} songs`);
    queries.push(cleanArtistName);
  } else {
    queries.push(cleanSeedTitle);
  }

  if (compactArtist.includes('hakos') || compactArtist.includes('hakoz')) {
    queries.push('Hakos Baelz', 'Hakos Baelz original songs', 'hololive english songs');
  }

  return [...new Set(queries.map((q) => q.trim()).filter((q) => q.length > 2))];
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

  // Pick a random seed from a candidate pool to add variety
  const pickRandom = (candidates: Track[]): Track | undefined => {
    const available = candidates.filter((t) => !usedSeedIds.has(uniqueKey(t)));
    if (available.length === 0) return undefined;
    // Weighted random — favor top items but allow variance
    const poolSize = Math.min(available.length, 8);
    return available[Math.floor(Math.random() * poolSize)];
  };

  const artistSeed = pickArtistSeed(pool, usedSeedIds);
  if (artistSeed) {
    addSeed(
      `${titleCase(primaryArtist(artistSeed.artist))} Drift`,
      `A nearby path from your ${primaryArtist(artistSeed.artist)} plays.`,
      artistSeed
    );
  }

  addSeed('Recent Drift', 'A fresh drift from what has been looping lately.', pickRandom(recent));
  addSeed('Deep Rotation', 'Built from tracks that keep coming back.', pickRandom(top));

  const alternateSeed = pickRandom(pool);
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
      const isSameArtist = artistKey(track) === seedArtist;
      let score = Math.max(1, pool.length - index);
      if (isSameArtist) {
        score += 120;
      }
      if (playback.playCount) score += playback.playCount * 6;
      if (playback.lastPlayed) {
        const ageHours = (Date.now() - playback.lastPlayed) / (1000 * 60 * 60);
        score += Math.max(0, 48 - ageHours);
      }
      // Strongly prefer tracks from the same artist or close affinity to maintain genre theme
      if (!isSameArtist) {
        score = Math.floor(score * 0.3);
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

  if (seed.genres && seed.genres.length > 0 && candidate.genres && candidate.genres.length > 0) {
    const seedGenres = new Set(seed.genres.map((g) => normalize(g)));
    const matchingGenres = candidate.genres.filter((g) => seedGenres.has(normalize(g)));
    if (matchingGenres.length > 0) {
      score += 40 + matchingGenres.length * 20;
    }
  }

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
  // Add dynamic entropy variance to top-ranked candidates so identical seeds produce fresh queues each session
  const withVariance = ranked.map((entry) => ({
    ...entry,
    score: entry.score + (Math.random() * 24 - 12),
  }));

  const sorted = withVariance.sort((a, b) => b.score - a.score);

  // Enforce a strict cap of max 3 tracks per artist to balance variety and creator collabs
  const maxPerArtist = 3;
  const artistCounts = new Map<string, number>();
  const selected: Track[] = [];
  const deferred: Track[] = [];

  for (const entry of sorted) {
    const track = entry.item.track;
    const key = artistKey(track);
    const current = artistCounts.get(key) ?? 0;

    if (current < maxPerArtist) {
      selected.push(track);
      artistCounts.set(key, current + 1);
      if (selected.length >= limit) break;
    } else {
      deferred.push(track);
    }
  }

  if (selected.length < limit) {
    for (const track of deferred) {
      if (selected.length >= limit) break;
      selected.push(track);
    }
  }

  return selected.slice(0, limit);
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
async function getCandidatesFromLastFm(seed: Track, limit: number, isSpotifyDominant = false): Promise<RecommendationCandidate[]> {
  const similar = await getSimilarTracks(seed.title, primaryArtist(seed.artist), limit);

  if (similar.length === 0) return [];

  console.log(
    `[recommend] Last.fm returned ${similar.length} similar tracks for "${seed.title} - ${seed.artist}"`
  );

  // Search top matches — higher match score = search first
  const sorted = [...similar].sort((a, b) => b.match - a.match).slice(0, limit);
  const preferSpotify = Boolean(seed.spotifyId) || seed.id.startsWith('spotify:') || isSpotifyDominant;

  const results = await Promise.allSettled(
    sorted.map(async ({ title, artist, match }) => {
      const query = `${title} ${artist}`;
      let tracks: Track[] = [];

      if (preferSpotify) {
        try {
          tracks = await searchSpotify(query, 3);
        } catch {
          tracks = [];
        }
      }

      if (tracks.length === 0) {
        tracks = await searchTracks(query, 3);
      }

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

async function getCandidatesFromSearch(
  seed: Track,
  limit: number,
  isSpotifyDominant = false
): Promise<RecommendationCandidate[]> {
  const queries = buildFallbackQueries(seed);
  const batches: RecommendationCandidate[][] = [];

  for (const query of queries) {
    try {
      let raw: Track[] = [];
      const preferSpotify = Boolean(seed.spotifyId) || seed.id.startsWith('spotify:') || isSpotifyDominant;

      if (preferSpotify) {
        try {
          raw = await searchSpotify(query, Math.min(limit, 10));
        } catch {
          raw = [];
        }
      }

      if (raw.length === 0) {
        raw = await searchTracks(query, Math.min(limit, 10));
      }

      batches.push(raw.map((track) => ({ track, source: 'search' })));
    } catch (err) {
      console.warn(
        `[recommend] query failed ${JSON.stringify({ query, message: (err as Error).message })}`
      );
    }
  }

  return batches.flat();
}

interface RecommendationOptions {
  excludeIds?: string[];
  limit?: number;
  seeds?: Track[];
}

export async function getRecommendations(
  seed: Track,
  options: RecommendationOptions = {}
): Promise<Track[]> {
  const limit = options.limit ?? 12;
  const seedsList = (options.seeds && options.seeds.length > 0) ? options.seeds : [seed];
  const excluded = new Set(
    (options.excludeIds ?? [])
      .concat(seedsList.flatMap((s) => [s.id, s.spotifyId ?? '', s.youtubeId ?? '']))
      .filter(Boolean)
  );

  const selectedEngine = getEnvConfig().recommendationEngine ?? 'hybrid-ml';
  const perSeedLimit = Math.max(3, Math.ceil(limit / seedsList.length));

  // Determine dominant source from the last 5 seed tracks
  const spotifySeedCount = seedsList.filter((s) => Boolean(s.spotifyId) || s.id.startsWith('spotify:')).length;
  const isSpotifyDominant = spotifySeedCount >= Math.ceil(seedsList.length / 2);

  // ── Tier 1: Local ML Recommendation Engine for all seeds ────────────────
  let mlCandidates: RecommendationCandidate[] = [];
  if (selectedEngine === 'hybrid-ml') {
    for (const sTrack of seedsList) {
      const mlTracks = predictMlRecommendations(sTrack, { excludeIds: excluded, limit: perSeedLimit });
      mlCandidates.push(...mlTracks.map((track) => ({
        track,
        source: 'local' as const,
        match: 0.95,
      })));
    }
  }

  // ── Tier 2 & 3: Pool & Interleave Last.fm & Search candidates across seeds ──
  const seedCandidatesList: RecommendationCandidate[][] = [];

  await Promise.allSettled(
    seedsList.map(async (sTrack) => {
      const currentSeedCandidates: RecommendationCandidate[] = [];
      if (selectedEngine === 'lastfm') {
        if (isLastFmConfigured()) {
          try {
            const lfm = await getCandidatesFromLastFm(sTrack, perSeedLimit * 2, isSpotifyDominant);
            currentSeedCandidates.push(...lfm);
          } catch (err) {
            console.warn(`[recommend] Last.fm failed for seed "${sTrack.title}": ${(err as Error).message}`);
          }
        }
      } else if (selectedEngine === 'innertube-rs' || selectedEngine === 'legacy') {
        try {
          const { getInnertubeWatchNextCandidates } = await import('./innertubeRecommendation.js');
          const ytTracks = await getInnertubeWatchNextCandidates(sTrack, perSeedLimit * 2, isSpotifyDominant);
          currentSeedCandidates.push(...ytTracks);
        } catch (err) {
          console.warn(`[recommend] innertube-rs watch_next failed for seed "${sTrack.title}": ${(err as Error).message}`);
        }
      } else if (selectedEngine === 'hybrid-ml') {
        if (isLastFmConfigured()) {
          try {
            const lfm = await getCandidatesFromLastFm(sTrack, perSeedLimit, isSpotifyDominant);
            currentSeedCandidates.push(...lfm);
          } catch {}
        }
      }
      const sc = await getCandidatesFromSearch(sTrack, perSeedLimit, isSpotifyDominant);
      currentSeedCandidates.push(...sc);
      seedCandidatesList.push(currentSeedCandidates);
    })
  );

  // Interleave candidates from each seed so no single seed dominates
  const pooledCandidates: RecommendationCandidate[] = [];
  const maxPoolLength = Math.max(...seedCandidatesList.map((c) => c.length), 0);
  for (let i = 0; i < maxPoolLength; i++) {
    for (const candList of seedCandidatesList) {
      if (candList[i]) pooledCandidates.push(candList[i]);
    }
  }

  const candidates: RecommendationCandidate[] = [
    ...mlCandidates,
    ...pooledCandidates,
  ];

  const seedArtists = new Set(seedsList.map((s) => normalize(primaryArtist(s.artist))));
  const seedTitles = seedsList.map((s) => cleanTitle(s.title)).filter((t) => t.length >= 3);
  const seen = new Set<string>();
  const ranked: Array<{ item: RecommendationCandidate; score: number }> = [];

  candidates.forEach((item, order) => {
    const candidate = item.track;
    const key = uniqueKey(candidate);
    if (!isPlayableCandidate(candidate)) return;
    if (isPlaybackBlacklisted(candidate.youtubeId ?? candidate.id)) return;
    if (!key || seen.has(key) || excluded.has(candidate.id) || excluded.has(candidate.spotifyId ?? '')) return;

    // Filter out unrelated songs that happen to share the same title name (e.g. random "Gravity" songs from unrelated artists)
    const candidateTitleNorm = cleanTitle(candidate.title);
    const candidateArtistNorm = normalize(primaryArtist(candidate.artist));
    const sharesTitleWithSeed = seedTitles.some((st) => candidateTitleNorm === st || candidateTitleNorm.includes(st));
    if (sharesTitleWithSeed && !seedArtists.has(candidateArtistNorm) && item.source === 'search') {
      return;
    }

    seen.add(key);
    let baseScore = scoreRecommendation(seed, item, order);
    ranked.push({ item, score: baseScore });
  });

  const recommendations = selectRecommendations(ranked, seed, limit, pooledCandidates.some(c => c.source === 'lastfm'));

  console.log(
    `[recommend] generated multi-seed ${JSON.stringify({
      seedsCount: seedsList.length,
      seeds: seedsList.map(s => `${s.title} - ${s.artist}`),
      source: isLastFmConfigured() ? 'lastfm+search' : 'search',
      candidateCount: candidates.length,
      returned: recommendations.length,
      top: recommendations.slice(0, 5).map((t) => `${t.title} - ${t.artist}`),
    })}`
  );

  return recommendations;
}

export async function getPersonalMixes(
  options: { mixLimit?: number; tracksPerMix?: number; excludeIds?: string[]; singleMixId?: string } = {}
): Promise<PersonalMix[]> {
  const mixLimit = options.mixLimit ?? 4;
  const tracksPerMix = options.tracksPerMix ?? 8;
  let seeds = buildPersonalMixSeeds();
  if (options.singleMixId) {
    seeds = seeds.filter((s) => s.id === options.singleMixId);
  } else {
    seeds = seeds.slice(0, mixLimit);
  }
  const globalExcluded = new Set((options.excludeIds ?? []).filter(Boolean));
  const mixes: PersonalMix[] = [];

  for (const seedInfo of seeds) {
    const seedKey = uniqueKey(seedInfo.seed);
    const excludeIds = [...globalExcluded, seedInfo.seed.id, seedInfo.seed.spotifyId ?? '', seedInfo.seed.youtubeId ?? '']
      .filter(Boolean);

    try {
      // 1. Generate live contextually-coherent recommendations from the seed track
      const onlineTracks = await getRecommendations(seedInfo.seed, {
        excludeIds,
        limit: tracksPerMix * 2,
      });

      // 2. Select strictly matching local tracks from history (same artist or closely scored)
      const localCandidates = getLocalPersonalCandidates(seedInfo.seed, new Set(excludeIds), Math.floor(tracksPerMix / 3));
      const localTracks = selectRecommendations(
        localCandidates.map((item, index) => ({
          item,
          score: scoreRecommendation(seedInfo.seed, item, index),
        })),
        seedInfo.seed,
        Math.floor(tracksPerMix / 3),
        true
      );

      // Prioritize online recommendations so each Nightly Mix maintains strong genre & artist theme coherence
      const unique = diversifyPersonalMixTracks([...onlineTracks, ...localTracks], tracksPerMix);
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
