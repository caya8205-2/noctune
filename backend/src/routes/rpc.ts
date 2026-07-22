import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { clearDiscordActivity, getDiscordRpcStatus, updateDiscordActivity } from '../services/discordRpc.js';

const TrackSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  album: z.string().optional(),
  duration: z.number(),
  thumbnail: z.string().optional().default(''),
  query: z.string().optional().default(''),
  spotifyId: z.string().optional(),
  spotifyUrl: z.string().optional(),
  youtubeId: z.string().optional(),
  youtubeTitle: z.string().optional(),
  youtubeArtist: z.string().optional(),
  queueSource: z.enum(['manual', 'search', 'playlist', 'autoqueue', 'recommendation', 'play-next', 'history']).optional(),
});

const ActivityBody = z.object({
  track: TrackSchema.nullable(),
  isPlaying: z.boolean(),
  progress: z.number().default(0),
  duration: z.number().default(0),
});

export async function rpcRoutes(app: FastifyInstance) {
  app.get('/rpc/status', async () => getDiscordRpcStatus());

  app.post('/rpc/activity', async (req, reply) => {
    const parsed = ActivityBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', issues: parsed.error.issues });
    }

    const result = await updateDiscordActivity(parsed.data);
    return reply.send({ ok: true, ...result });
  });

  app.delete('/rpc/activity', async () => {
    await clearDiscordActivity();
    return { ok: true };
  });
}
