import type { Track } from '../types/index.js';
import { getEnvConfig } from './env.js';
import { searchSpotify } from './spotify.js';
import { searchTracks } from './audioResolver.js';

interface RecommendationOptions {
  excludeIds?: string[];
  limit?: number;
}

const badKeywords = [
  'reaction',
  'reacts',
  'review',
  'cover',
  'karaoke',
  'instrumental',
  'tutorial',
  'nightcore',
  'sped up',
  'slowed',
  '8d',
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

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

function isPlayableCandidate(track: Track): boolean {
  if (track.spotifyId || track.id.startsWith('spotify:')) return true;
  return /^[a-zA-Z0-9_-]{11}$/.test(track.youtubeId ?? track.id);
}

function buildQueries(seed: Track): string[] {
  const artist = primaryArtist(seed.artist);
  const compactArtist = normalize(artist);
  const queries = [
    `artist:"${artist}"`,
    artist,
    `${artist} songs`,
    `${artist} official`,
    `${artist} topic`,
  ];

  if (compactArtist.includes('hakos') || compactArtist.includes('hakoz')) {
    queries.push('Hakos Baelz', 'Hakos Baelz original songs', 'hololive english songs');
  }

  return [...new Set(queries)];
}

function scoreRecommendation(seed: Track, candidate: Track, order: number): number {
  const seedArtist = normalize(primaryArtist(seed.artist));
  const seedTitle = normalize(seed.title);
  const title = normalize(candidate.title);
  const artist = normalize(candidate.artist);
  const combined = `${title} ${artist}`;
  let score = 100 - order;

  if (artist.includes(seedArtist) || combined.includes(seedArtist)) score += 150;
  if (candidate.spotifyId) score += 25;
  if (artist.includes('official')) score += 60;
  if (artist.includes('topic')) score += 50;
  if (artist.includes('vevo')) score += 45;

  if (title === seedTitle || title.includes(seedTitle)) score -= 120;

  for (const keyword of badKeywords) {
    if (combined.includes(keyword) && !seedTitle.includes(keyword)) score -= 100;
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

async function searchRecommendationCandidates(seed: Track, limit: number): Promise<Track[]> {
  const { searchEngine } = getEnvConfig();
  const queries = buildQueries(seed);
  const batches: Track[][] = [];

  for (const query of queries) {
    try {
      const raw = searchEngine === 'spotify'
        ? await searchSpotify(query, Math.min(limit, 10))
        : await searchTracks(query, Math.min(limit, 10));
      batches.push(raw);
    } catch (err) {
      console.warn(
        `[recommend] query failed ${JSON.stringify({
          query,
          message: (err as Error).message,
        })}`
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
  const excluded = new Set([seed.id, seed.youtubeId, seed.spotifyId, ...(options.excludeIds ?? [])].filter(Boolean));
  const candidates = await searchRecommendationCandidates(seed, Math.max(limit, 10));
  const seen = new Set<string>();
  const ranked: Array<{ track: Track; score: number }> = [];

  candidates.forEach((candidate, order) => {
    const key = uniqueKey(candidate);
    if (!isPlayableCandidate(candidate)) return;
    if (!key || seen.has(key) || excluded.has(candidate.id) || excluded.has(candidate.spotifyId ?? '')) return;
    seen.add(key);
    ranked.push({ track: candidate, score: scoreRecommendation(seed, candidate, order) });
  });

  const recommendations = ranked
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ track }) => track);

  console.log(
    `[recommend] generated ${JSON.stringify({
      seed: `${seed.title} - ${seed.artist}`,
      candidateCount: candidates.length,
      returned: recommendations.length,
      top: recommendations.slice(0, 5).map((track) => `${track.title} - ${track.artist}`),
    })}`
  );

  return recommendations;
}
