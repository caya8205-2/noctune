import type { FastifyInstance } from 'fastify';
import { clearPlaybackHistory, getRecentTracks, removePlaybackHistoryItem } from '../services/cache.js';
import { getAllPlaylists } from '../services/playlist.js';
import { getSpotifyNewReleaseTracks } from '../services/spotify.js';
import { getPersonalMixes } from '../services/recommendations.js';
import type { Track } from '../types/index.js';

export async function homeRoutes(app: FastifyInstance) {
  app.get('/home', async (_req, reply) => {
    let newReleases: Track[] = [];

    try {
      newReleases = await getSpotifyNewReleaseTracks(8);
    } catch (err) {
      app.log.warn(
        { message: (err as Error).message },
        '[home] Spotify new releases unavailable'
      );
    }

    return reply.send({
      playlists: getAllPlaylists().slice(0, 6),
      recentTracks: getRecentTracks(8),
      newReleases,
    });
  });

  app.get('/history', async (_req, reply) => {
    return reply.send({ tracks: getRecentTracks(100) });
  });

  app.get('/home/nightly-mix', async (req, reply) => {
    const query = req.query as { limit?: string; tracks?: string };
    const mixLimit = Math.min(6, Math.max(1, Number(query.limit ?? 4) || 4));
    const tracksPerMix = Math.min(16, Math.max(4, Number(query.tracks ?? 8) || 8));

    try {
      const mixes = await getPersonalMixes({ mixLimit, tracksPerMix });
      return reply.send({ mixes });
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
