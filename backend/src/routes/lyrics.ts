import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { findLyrics } from '../services/lyrics.js';

const LyricsQuery = z.object({
  title: z.string().min(1).max(240),
  artist: z.string().max(180).default(''),
  duration: z.coerce.number().min(0).max(60 * 60).default(0),
});

export async function lyricsRoutes(app: FastifyInstance) {
  app.get('/lyrics', async (req, reply) => {
    const parsed = LyricsQuery.safeParse(req.query);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid lyrics query' });

    try {
      const lyrics = await findLyrics(parsed.data.title, parsed.data.artist, parsed.data.duration);
      if (!lyrics || lyrics.lines.length === 0) {
        return reply.status(404).send({ error: 'Lyrics not found' });
      }
      return reply.send(lyrics);
    } catch (err) {
      app.log.warn({ err }, '[lyrics] LRCLIB request failed');
      return reply.status(502).send({ error: 'Lyrics provider failed', message: (err as Error).message });
    }
  });
}
