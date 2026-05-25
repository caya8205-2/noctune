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
import { Readable } from 'stream';
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

function isLikelyWebmStream(contentType: string | null, audioUrl: string): boolean {
  const content = contentType?.toLowerCase() ?? '';
  const url = audioUrl.toLowerCase();
  return content.includes('webm') || url.includes('audio%2fwebm') || url.includes('audio/webm');
}

async function fetchAudioStream(
  videoId: string,
  audioUrl: string,
  range: string | undefined,
  refreshIfWebm: boolean
): Promise<{ res: Response; refreshed: boolean }> {
  const res = await fetch(audioUrl, {
    headers: range ? { Range: range } : undefined,
  });

  if (!refreshIfWebm || !isLikelyWebmStream(res.headers.get('content-type'), audioUrl)) {
    return { res, refreshed: false };
  }

  res.body?.cancel().catch(() => {});
  const refreshedAudio = await resolveAudioUrl(videoId);
  refreshTrackUrl(videoId, refreshedAudio.url);
  const refreshedRes = await fetch(refreshedAudio.url, {
    headers: range ? { Range: range } : undefined,
  });
  return { res: refreshedRes, refreshed: true };
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

  // Stream audio through backend (bypass CORS for Web Audio API)
  app.get('/player/stream/:videoId', async (req, reply) => {
    const { videoId } = req.params as { videoId: string };
    const cached = getCachedById(videoId);
    if (!cached || !isUrlFresh(cached)) {
      return reply.status(404).send({ error: 'No fresh stream, resolve first' });
    }
    try {
      const range = req.headers.range;
      const { res: ytRes, refreshed } = await fetchAudioStream(videoId, cached.audioUrl, range, true);
      if (!ytRes.ok || !ytRes.body) {
        return reply.status(502).send({ error: 'YouTube stream failed' });
      }

      if (refreshed) {
        app.log.info({ videoId }, '[player] refreshed WebM stream to compatible audio');
      }

      const contentLength = ytRes.headers.get('content-length');
      const contentRange = ytRes.headers.get('content-range');
      const acceptRanges = ytRes.headers.get('accept-ranges') ?? 'bytes';

      if (ytRes.status === 206) reply.status(206);
      reply
        .header('Content-Type', ytRes.headers.get('content-type') || 'audio/webm')
        .header('Access-Control-Allow-Origin', '*')
        .header('Accept-Ranges', acceptRanges)
        .header('Cache-Control', 'public, max-age=3600');
      if (contentLength) reply.header('Content-Length', contentLength);
      if (contentRange) reply.header('Content-Range', contentRange);

      const nodeStream = Readable.fromWeb(ytRes.body as any);
      nodeStream.on('error', (err) => {
        app.log.warn({ videoId, err }, '[player] upstream stream closed');
      });
      return reply.send(nodeStream);
    } catch (err) {
      return reply.status(502).send({ error: 'Stream proxy failed', message: (err as Error).message });
    }
  });
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
