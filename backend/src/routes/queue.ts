import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getRecommendations } from '../services/recommendations.js';

const TrackSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  artist: z.string().min(1),
  duration: z.number().default(0),
  thumbnail: z.string().default(''),
  query: z.string().default(''),
  spotifyId: z.string().optional(),
  spotifyUrl: z.string().optional(),
  youtubeId: z.string().optional(),
  youtubeTitle: z.string().optional(),
  youtubeArtist: z.string().optional(),
});

const RecommendBody = z.object({
  seed: TrackSchema,
  excludeIds: z.array(z.string()).default([]),
  limit: z.number().min(1).max(25).default(12),
});

export async function queueRoutes(app: FastifyInstance) {
  app.post('/queue/recommend', async (req, reply) => {
    const parsed = RecommendBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', issues: parsed.error.issues });
    }

    const startedAt = Date.now();
    const { seed, excludeIds, limit } = parsed.data;
    app.log.info({ seed: `${seed.title} - ${seed.artist}`, limit }, '[queue] recommend requested');

    try {
      const tracks = await getRecommendations(seed, { excludeIds, limit });
      app.log.info(
        { seed: seed.id, count: tracks.length, elapsedMs: Date.now() - startedAt },
        '[queue] recommend done'
      );
      return reply.send({ seed, tracks });
    } catch (err) {
      app.log.error(err, '[queue] recommend failed');
      return reply
        .status(502)
        .send({ error: 'Recommendation failed', message: (err as Error).message });
    }
  });
}
