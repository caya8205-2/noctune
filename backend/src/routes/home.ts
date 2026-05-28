import type { FastifyInstance } from 'fastify';
import { getRecentTracks } from '../services/cache.js';
import { getAllPlaylists } from '../services/playlist.js';
import { getSpotifyNewReleaseTracks } from '../services/spotify.js';
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
}
