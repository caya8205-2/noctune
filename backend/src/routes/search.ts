import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getCachedByQuery } from '../services/cache.js';
import { getYoutubeTrack, searchTracks } from '../services/audioResolver.js';
import { getEnvConfig } from '../services/env.js';
import { getSpotifyTrackById, searchSpotify } from '../services/spotify.js';
import { parseMediaUrl } from '../services/urlParser.js';
import { debugSpotifyYoutubeMatch } from '../services/youtubeMatcher.js';

const SearchQuery = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().min(1).max(50).default(25),
});

const DebugMatchQuery = z.object({
  title: z.string().min(1).max(200),
  artist: z.string().max(200).default(''),
  duration: z.coerce.number().min(0).default(0),
  spotifyId: z.string().optional(),
  thumbnail: z.string().optional(),
  limit: z.coerce.number().min(1).max(20).default(10),
});

function trackDedupeKey(track: { id: string; spotifyId?: string; youtubeId?: string }) {
  return track.spotifyId ?? track.youtubeId ?? track.id;
}

function mergeCachedSearchResult<T extends { id: string; spotifyId?: string; youtubeId?: string }>(
  cached: T | null,
  tracks: T[],
  limit: number
) {
  if (!cached) return tracks.slice(0, limit);
  const seen = new Set([trackDedupeKey(cached)]);
  return [
    cached,
    ...tracks.filter((track) => {
      const key = trackDedupeKey(track);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  ].slice(0, limit);
}

export async function searchRoutes(app: FastifyInstance) {
  app.get('/search/debug-match', async (req, reply) => {
    const parsed = DebugMatchQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid query', issues: parsed.error.issues });
    }

    const { title, artist, duration, spotifyId, thumbnail = '', limit } = parsed.data;
    const result = await debugSpotifyYoutubeMatch({
      id: spotifyId ? `spotify:${spotifyId}` : `${title}-${artist}`,
      title,
      artist,
      duration,
      thumbnail,
      query: `${title} ${artist}`,
      spotifyId,
    }, limit);

    return reply.send(result);
  });

  app.get('/search', async (req, reply) => {
    const parsed = SearchQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid query', issues: parsed.error.issues });
    }
    const { q, limit } = parsed.data;
    const parsedUrl = parseMediaUrl(q);

    if (parsedUrl?.kind === 'youtube-video') {
      const track = await getYoutubeTrack(parsedUrl.url, q);
      return reply.send({ fromCache: false, query: q, tracks: [track] });
    }

    if (parsedUrl?.kind === 'spotify-track') {
      const track = await getSpotifyTrackById(parsedUrl.id, q);
      return reply.send({ fromCache: false, query: q, tracks: [track] });
    }

    if (parsedUrl?.kind === 'youtube-playlist' || parsedUrl?.kind === 'spotify-playlist') {
      return reply.send({ fromCache: false, query: q, tracks: [] });
    }

    const cached = getCachedByQuery(q);

    const { searchEngine } = getEnvConfig();

    try {
      const tracks = searchEngine === 'spotify'
        ? await searchSpotify(q, limit)
        : await searchTracks(q, limit);
      return reply.send({
        fromCache: Boolean(cached),
        query: q,
        tracks: mergeCachedSearchResult(cached, tracks, limit),
      });
    } catch (err) {
      if (cached) {
        app.log.warn(err, 'Live search failed, returning cached query hit');
        return reply.send({ fromCache: true, query: q, tracks: [cached] });
      }
      app.log.error(err, 'Search failed');
      return reply.status(502).send({ error: 'Search failed', message: (err as Error).message });
    }
  });
}
