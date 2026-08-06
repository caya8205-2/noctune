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
  seed: TrackSchema.optional(),
  seeds: z.array(TrackSchema).optional(),
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
    const { seed, seeds, excludeIds, limit } = parsed.data;
    const primarySeed = seed ?? (seeds && seeds.length > 0 ? seeds[seeds.length - 1] : undefined);

    if (!primarySeed) {
      return reply.status(400).send({ error: 'Missing recommendation seed track' });
    }

    app.log.info({ seed: `${primarySeed.title} - ${primarySeed.artist}`, seedsCount: seeds?.length ?? 1, limit }, '[queue] recommend requested');

    try {
      const tracks = await getRecommendations(primarySeed, { excludeIds, limit, seeds });
      app.log.info(
        { seed: primarySeed.id, count: tracks.length, elapsedMs: Date.now() - startedAt },
        '[queue] recommend done'
      );
      return reply.send({ seed: primarySeed, tracks });
    } catch (err) {
      app.log.error(err, '[queue] recommend failed');
      return reply
        .status(502)
        .send({ error: 'Recommendation failed', message: (err as Error).message });
    }
  });
}
