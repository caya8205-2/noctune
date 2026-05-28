import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getSpotifyTrackMetadata } from '../services/spotify.js';

const Params = z.object({
  spotifyId: z.string().min(1).max(64),
});

export async function metadataRoutes(app: FastifyInstance) {
  app.get<{ Params: { spotifyId: string } }>('/metadata/track/:spotifyId', async (req, reply) => {
    const parsed = Params.safeParse(req.params);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid Spotify track id' });

    try {
      return reply.send(await getSpotifyTrackMetadata(parsed.data.spotifyId));
    } catch (err) {
      app.log.warn({ err }, '[metadata] Spotify track metadata unavailable');
      return reply.status(502).send({
        error: 'Spotify metadata unavailable',
        message: (err as Error).message,
      });
    }
  });
}
