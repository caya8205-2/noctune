import type { FastifyInstance } from 'fastify';
import { clearPlaybackHistory, getRecentTracks, removePlaybackHistoryItem } from '../services/cache.js';
import { getAllPlaylists } from '../services/playlist.js';
import { getSpotifyNewReleaseTracks } from '../services/spotify.js';
import { getPersonalMixes } from '../services/recommendations.js';
import type { Track } from '../types/index.js';

// Server-side TTL cache for home screen data — avoids hitting Spotify
// and re-sorting the full track cache on every navigation back to Home.
const HOME_CACHE_TTL_MS = 1000 * 60 * 5; // 5 minutes
const NIGHTLY_MIX_TTL_MS = 1000 * 60 * 15; // 15 minutes server-side cache for nightly mixes

let homeLocalCache: { data: { playlists: unknown; recentTracks: unknown }; expiresAt: number } | null = null;
let newReleasesCache: { data: { newReleases: Track[] }; expiresAt: number } | null = null;
let nightlyMixCache: { data: { mixes: unknown[] }; expiresAt: number } | null = null;

export async function homeRoutes(app: FastifyInstance) {
  // Local home data (playlists + recent tracks) resolves instantly from the
  // local cache/DB, so it is served from its own fast TTL without waiting on
  // Spotify. New releases are fetched separately so a slow Spotify call can
  // never block the rest of Home.
  app.get('/home', async (_req, reply) => {
    if (homeLocalCache && Date.now() < homeLocalCache.expiresAt) {
      return reply.send(homeLocalCache.data);
    }
    const data = {
      playlists: getAllPlaylists().slice(0, 6),
      recentTracks: getRecentTracks(8),
    };
    homeLocalCache = { data, expiresAt: Date.now() + HOME_CACHE_TTL_MS };
    return reply.send(data);
  });

  app.get('/home/new-releases', async (_req, reply) => {
    if (newReleasesCache && Date.now() < newReleasesCache.expiresAt) {
      return reply.send(newReleasesCache.data);
    }
    let newReleases: Track[] = [];
    try {
      newReleases = await getSpotifyNewReleaseTracks(8);
    } catch (err) {
      app.log.warn(
        { message: (err as Error).message },
        '[home] Spotify new releases unavailable'
      );
    }
    const data = { newReleases };
    newReleasesCache = { data, expiresAt: Date.now() + HOME_CACHE_TTL_MS };
    return reply.send(data);
  });

  app.get('/history', async (_req, reply) => {
    return reply.send({ tracks: getRecentTracks(100) });
  });

  app.get('/home/nightly-mix', async (req, reply) => {
    if (nightlyMixCache && Date.now() < nightlyMixCache.expiresAt) {
      return reply.send(nightlyMixCache.data);
    }

    const query = req.query as { limit?: string; tracks?: string };
    const mixLimit = Math.min(6, Math.max(1, Number(query.limit ?? 4) || 4));
    const tracksPerMix = Math.min(16, Math.max(4, Number(query.tracks ?? 8) || 8));

    try {
      const mixes = await getPersonalMixes({ mixLimit, tracksPerMix });
      const data = { mixes };
      nightlyMixCache = { data, expiresAt: Date.now() + NIGHTLY_MIX_TTL_MS };
      return reply.send(data);
    } catch (err) {
      app.log.warn({ message: (err as Error).message }, '[home] nightly mix unavailable');
      return reply.send({ mixes: [] });
    }
  });

  app.delete('/history', async (_req, reply) => {
    return reply.send({ ok: true, history: clearPlaybackHistory() });
  });

  app.delete<{ Params: { id: string } }>('/history/:id', async (req, reply) => {
    const removed = removePlaybackHistoryItem(req.params.id);
    return reply.send({ ok: true, removed });
  });
}
