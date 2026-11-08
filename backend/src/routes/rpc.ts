import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { clearDiscordActivity, getDiscordRpcStatus, updateDiscordActivity } from '../services/discordRpc.js';

const TrackSchema = z.object({
  id: z.string().default(''),
  title: z.string().default(''),
  artist: z.string().default(''),
  album: z.string().optional(),
  duration: z.number().optional().default(0),
  thumbnail: z.string().optional().default(''),
  query: z.string().optional().default(''),
  spotifyId: z.string().optional(),
  spotifyUrl: z.string().optional(),
  youtubeId: z.string().optional(),
  youtubeTitle: z.string().optional(),
  youtubeArtist: z.string().optional(),
  queueSource: z.string().optional(),
}).passthrough();

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

    // When running as a mobile companion instance, forward the RPC activity to the
    // main desktop backend process (which holds the active Discord IPC connection on PC).
    if (process.env.NOCTUNE_MOBILE_INSTANCE === '1') {
      const desktopPort = process.env.DESKTOP_BACKEND_PORT || '3131';
      try {
        const res = await fetch(`http://127.0.0.1:${desktopPort}/rpc/activity`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed.data),
        });
        if (res.ok) {
          const body = await res.json();
          return reply.send(body);
        }
      } catch {
        // Fall back to local handling if desktop instance is not reachable
      }
    }

    const result = await updateDiscordActivity(parsed.data as any);
    return reply.send({ ok: true, ...result });
  });

  app.delete('/rpc/activity', async () => {
    if (process.env.NOCTUNE_MOBILE_INSTANCE === '1') {
      const desktopPort = process.env.DESKTOP_BACKEND_PORT || '3131';
      try {
        await fetch(`http://127.0.0.1:${desktopPort}/rpc/activity`, { method: 'DELETE' });
      } catch {}
    }
    await clearDiscordActivity();
    return { ok: true };
  });
}
