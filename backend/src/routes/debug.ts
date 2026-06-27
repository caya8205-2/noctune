import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  debugSpotifyYoutubeMatch,
  listMatchCache,
  clearMatchCache,
  clearMatchCacheForSpotifyId,
  getMatchCacheStats,
} from '../services/youtubeMatcher.js';
import { getCacheStats } from '../services/cache.js';
import { getPrefetchStatus } from '../services/prefetch.js';
import { getAudioResolverStatus } from '../services/audioResolver.js';
import { getPlaybackBlacklist } from '../services/playbackBlacklist.js';
import { getDiscordRpcStatus } from '../services/discordRpc.js';
import { isDemoMode } from '../services/demoMode.js';

const MatcherQuery = z.object({
  title: z.string().min(1).max(200),
  artist: z.string().max(200).default(''),
  duration: z.coerce.number().min(0).default(0),
  spotifyId: z.string().optional(),
  thumbnail: z.string().optional(),
  limit: z.coerce.number().min(1).max(20).default(12),
});

function buildStatus() {
  return {
    cache: getCacheStats(),
    prefetch: getPrefetchStatus(),
    resolver: getAudioResolverStatus(),
    playbackBlacklist: { failedIds: getPlaybackBlacklist().length },
    matchCache: getMatchCacheStats(),
    discordRpc: getDiscordRpcStatus(),
    demoMode: isDemoMode(),
  };
}

export async function debugRoutes(app: FastifyInstance) {
  // ── Matcher inspector ───────────────────────────────────────────────────────
  app.get('/debug/matcher', async (req, reply) => {
    const parsed = MatcherQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid query', issues: parsed.error.issues });
    }

    const { title, artist, duration, spotifyId, thumbnail = '', limit } = parsed.data;
    const result = await debugSpotifyYoutubeMatch(
      {
        id: spotifyId ? `spotify:${spotifyId}` : `${title}-${artist}`,
        title,
        artist,
        duration,
        thumbnail,
        query: `${title} ${artist}`,
        spotifyId,
      },
      limit
    );

    return reply.send(result);
  });

  // ── Match cache ─────────────────────────────────────────────────────────────
  app.get('/debug/cache', async () => {
    return { entries: listMatchCache(), total: listMatchCache().length };
  });

  app.delete('/debug/cache', async () => {
    const result = clearMatchCache();
    return { ok: true, cleared: result.cleared };
  });

  app.delete('/debug/cache/:spotifyId', async (req, reply) => {
    const { spotifyId } = req.params as { spotifyId: string };
    const result = clearMatchCacheForSpotifyId(spotifyId);
    if (!result.cleared) {
      return reply.status(404).send({ ok: false, error: 'Cache entry not found' });
    }
    return { ok: true, cleared: result.cleared, youtubeId: result.youtubeId };
  });

  // ── Full status snapshot ────────────────────────────────────────────────────
  app.get('/debug/status', async () => buildStatus());
}
