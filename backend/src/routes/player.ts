import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  getCachedById,
  isUrlFresh,
  recordPlay,
  refreshTrackUrl,
  upsertTrack,
} from '../services/cache.js';
import { resolveAudioUrl, resolveTrack, searchTracks } from '../services/ytdlp.js';
import { matchSpotifyTrackToYoutube } from '../services/youtubeMatcher.js';
import type { Track } from '../types/index.js';
import {
  consumePrefetch,
  getPrefetched,
  getPrefetchStatus,
  isPrefetching,
  schedulePrefetch,
} from '../services/prefetch.js';

const PlayParams = z.object({ videoId: z.string().min(5).max(64) });

const QueueBody = z.object({
  videoIds: z.array(z.string()).min(1).max(10).optional(),
  tracks: z.array(z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    artist: z.string().default(''),
    duration: z.number().default(0),
    thumbnail: z.string().default(''),
    query: z.string().default(''),
    spotifyId: z.string().optional(),
    spotifyUrl: z.string().optional(),
    youtubeId: z.string().optional(),
    youtubeTitle: z.string().optional(),
    youtubeArtist: z.string().optional(),
  })).min(1).max(10).optional(),
}).refine((body) => body.videoIds?.length || body.tracks?.length, {
  message: 'Either videoIds or tracks is required',
});

async function resolvePlayableVideoId(videoId: string, query: string): Promise<string | null> {
  if (!videoId.startsWith('spotify:')) return videoId;
  const spotifyId = videoId.replace(/^spotify:/, '');
  const matched = await matchSpotifyTrackToYoutube({
    id: videoId,
    title: query,
    artist: '',
    duration: 0,
    thumbnail: '',
    query,
    spotifyId,
  });
  if (matched?.id) return matched.id;
  const [match] = await searchTracks(query, 1);
  return match?.id ?? null;
}

async function resolvePrefetchIds(videoIds: string[], tracks: Track[]): Promise<string[]> {
  const directIds = videoIds.filter((id) => !id.startsWith('spotify:'));
  const trackIds = await Promise.all(
    tracks.map(async (track) => {
      if (!track.id.startsWith('spotify:')) return track.id;
      const matched = await matchSpotifyTrackToYoutube(track);
      return matched?.id ?? null;
    })
  );

  return [...new Set([...directIds, ...trackIds.filter((id): id is string => Boolean(id))])];
}

export async function playerRoutes(app: FastifyInstance) {
  app.get<{ Params: { videoId: string }; Querystring: { query?: string } }>(
    '/player/resolve/:videoId',
    async (req, reply) => {
      const parsed = PlayParams.safeParse(req.params);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid videoId' });
      }

      const { videoId } = parsed.data;
      const query = req.query.query ?? videoId;
      const startedAt = Date.now();
      app.log.info({ videoId, query }, '[player] resolve requested');

      const playableVideoId = await resolvePlayableVideoId(videoId, query);

      if (!playableVideoId) {
        app.log.warn({ videoId, query }, '[player] resolve failed before playback lookup');
        return reply.status(404).send({ error: 'No playable YouTube match found' });
      }

      if (playableVideoId !== videoId) {
        app.log.info({ videoId, playableVideoId, query }, '[player] spotify mapped to youtube');
      }

      const prefetched = getPrefetched(playableVideoId);
      if (prefetched && isUrlFresh(prefetched)) {
        consumePrefetch(playableVideoId);
        recordPlay(playableVideoId);
        app.log.info(
          { videoId: playableVideoId, elapsedMs: Date.now() - startedAt },
          '[player] prefetch hit'
        );
        return reply.send({ ...prefetched, source: 'prefetch' });
      }

      app.log.info(
        {
          videoId: playableVideoId,
          inFlight: isPrefetching(playableVideoId),
          prefetch: getPrefetchStatus(),
        },
        '[player] prefetch miss'
      );

      const cached = getCachedById(playableVideoId);
      if (cached && isUrlFresh(cached)) {
        recordPlay(playableVideoId);
        app.log.info(
          { videoId: playableVideoId, elapsedMs: Date.now() - startedAt },
          '[player] cache hit fresh'
        );
        return reply.send({ ...cached, source: 'cache' });
      }

      if (cached && !isUrlFresh(cached)) {
        try {
          app.log.info({ videoId: playableVideoId }, '[player] cache hit stale, refreshing URL');
          const audio = await resolveAudioUrl(playableVideoId);
          refreshTrackUrl(playableVideoId, audio.url);
          const refreshed = getCachedById(playableVideoId)!;
          recordPlay(playableVideoId);
          app.log.info(
            { videoId: playableVideoId, elapsedMs: Date.now() - startedAt },
            '[player] cache URL refreshed'
          );
          return reply.send({ ...refreshed, source: 'cache_refreshed' });
        } catch (err) {
          app.log.warn(
            `[player] URL refresh failed for ${playableVideoId}, falling through to full resolve`
          );
        }
      }

      try {
        app.log.info({ videoId: playableVideoId }, '[player] cold resolve start');
        const { track, audio } = await resolveTrack(playableVideoId, query);
        const saved = upsertTrack(query, track, audio.url);
        recordPlay(playableVideoId);
        app.log.info(
          { videoId: playableVideoId, title: track.title, elapsedMs: Date.now() - startedAt },
          '[player] cold resolve done'
        );
        return reply.send({ ...saved, source: 'resolved' });
      } catch (err) {
        app.log.error(err, `[player] full resolve failed for ${playableVideoId}`);
        return reply
          .status(502)
          .send({ error: 'Could not resolve audio', message: (err as Error).message });
      }
    }
  );

  app.post('/player/prefetch', async (req, reply) => {
    const parsed = QueueBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', issues: parsed.error.issues });
    }

    const { videoIds = [], tracks = [] } = parsed.data;
    app.log.info(
      {
        videoIds,
        tracks: tracks.map((track) => `${track.title} - ${track.artist}`),
        statusBefore: getPrefetchStatus(),
      },
      '[player] prefetch request'
    );

    const playableIds = await resolvePrefetchIds(videoIds, tracks);
    app.log.info({ playableIds }, '[player] prefetch playable ids');

    schedulePrefetch(playableIds).catch((err) =>
      app.log.warn(err, '[player] prefetch scheduling error')
    );
    return reply.send({ scheduled: playableIds.slice(0, 5), message: 'Prefetch queued' });
  });
}
