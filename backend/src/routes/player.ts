import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import fs from 'fs';
import PQueue from 'p-queue';
import {
  clearTrackCache,
  cacheMatchesAudioQuality,
  getCachedById,
  getCachedBySpotifyId,
  isUrlFresh,
  recordPlayWithMetadata,
  refreshTrackUrl,
  setLocalAudioPath,
  upsertTrack,
} from '../services/cache.js';
import { resolveAudioUrl, resolveTrack, searchTracks } from '../services/audioResolver.js';
import { getSpotifyTrackById } from '../services/spotify.js';
import { Readable } from 'stream';
import { clearMatchCacheForSpotifyId, matchSpotifyTrackToYoutube } from '../services/youtubeMatcher.js';
import type { CachedTrack, Track } from '../types/index.js';
import {
  consumePrefetch,
  getPrefetched,
  getPrefetchStatus,
  isPrefetching,
  clearPrefetchForId,
  schedulePrefetch,
} from '../services/prefetch.js';
import {
  clearAudioCacheForId,
  commitAudioCache,
  discardAudioCache,
  enforceAudioCacheLimit,
  getAudioCachePath,
  getExistingAudioCachePath,
  getTempAudioCachePath,
  touchAudioCache,
} from '../services/audioFileCache.js';
import { getEnvConfig } from '../services/env.js';
import { clearPlaybackBlacklistForId, markPlaybackFailed } from '../services/playbackBlacklist.js';

const PlayParams = z.object({ videoId: z.string().min(5).max(64) });
const audioCacheQueue = new PQueue({ concurrency: 2 });
const audioCacheInFlight = new Set<string>();

const QueueBody = z.object({
  videoIds: z.array(z.string()).min(1).max(10).optional(),
  tracks: z.array(z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    artist: z.string().default(''),
    album: z.string().optional(),
    duration: z.number().default(0),
    thumbnail: z.string().default(''),
    query: z.string().default(''),
    spotifyId: z.string().optional(),
    spotifyUrl: z.string().optional(),
    youtubeId: z.string().optional(),
    youtubeTitle: z.string().optional(),
    youtubeArtist: z.string().optional(),
    youtubeChannelId: z.string().optional(),
  })).min(1).max(10).optional(),
}).refine((body) => body.videoIds?.length || body.tracks?.length, {
  message: 'Either videoIds or tracks is required',
});

const AudioCacheBody = z.object({
  videoIds: z.array(z.string()).max(100).optional(),
  tracks: z.array(z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    artist: z.string().default(''),
    album: z.string().optional(),
    duration: z.number().default(0),
    thumbnail: z.string().default(''),
    query: z.string().default(''),
    spotifyId: z.string().optional(),
    spotifyUrl: z.string().optional(),
    youtubeId: z.string().optional(),
    youtubeTitle: z.string().optional(),
    youtubeArtist: z.string().optional(),
    youtubeChannelId: z.string().optional(),
  })).max(100).optional(),
}).refine((body) => body.videoIds?.length || body.tracks?.length, {
  message: 'Either videoIds or tracks is required',
});

const PlayedBody = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  artist: z.string().default(''),
  album: z.string().optional(),
  duration: z.number().default(0),
  thumbnail: z.string().default(''),
  query: z.string().default(''),
  spotifyId: z.string().optional(),
  spotifyUrl: z.string().optional(),
  youtubeId: z.string().optional(),
  youtubeTitle: z.string().optional(),
  youtubeArtist: z.string().optional(),
  youtubeChannelId: z.string().optional(),
  queueSource: z.enum(['manual', 'search', 'playlist', 'autoqueue', 'recommendation', 'play-next']).optional(),
});

const ClearTrackCacheBody = PlayedBody.partial().extend({
  id: z.string().min(1),
  title: z.string().default(''),
  artist: z.string().default(''),
  query: z.string().default(''),
});

function isYoutubeVideoId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{11}$/.test(id);
}

async function resolvePlayableVideoId(videoId: string, query: string, youtubeId?: string): Promise<string | null> {
  if (!videoId.startsWith('spotify:')) return isYoutubeVideoId(videoId) ? videoId : null;
  if (youtubeId && isYoutubeVideoId(youtubeId)) return youtubeId;
  const spotifyId = videoId.replace(/^spotify:/, '');

  let trackTitle = query;
  let trackArtist = '';
  let trackDuration = 0;
  const cachedSpotify = getCachedBySpotifyId(spotifyId);
  if (cachedSpotify) {
    trackTitle = cachedSpotify.title;
    trackArtist = cachedSpotify.artist;
    trackDuration = cachedSpotify.duration;
  } else {
    try {
      const spotifyTrack = await getSpotifyTrackById(spotifyId, query);
      trackTitle = spotifyTrack.title;
      trackArtist = spotifyTrack.artist;
      trackDuration = spotifyTrack.duration;
    } catch {
      // Spotify lookup failed — fall back to query-as-title (best effort).
    }
  }

  const matched = await matchSpotifyTrackToYoutube({
    id: videoId,
    title: trackTitle,
    artist: trackArtist,
    duration: trackDuration,
    thumbnail: '',
    query,
    spotifyId,
  });
  if (matched?.id && isYoutubeVideoId(matched.id)) return matched.id;
  return null;
}

function normalizeLookup(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasLiveVersionSignal(value: string): boolean {
  const tokens = new Set(normalizeLookup(value).split(' ').filter(Boolean));
  return ['live', 'concert', 'stage', 'showcase', 'tour'].some((keyword) =>
    tokens.has(keyword)
  );
}

async function avoidUnwantedLiveVersion(
  videoId: string,
  query: string,
  trackTitle: string
): Promise<string> {
  const normalizedQuery = normalizeLookup(query);
  if (
    !normalizedQuery ||
    normalizedQuery === normalizeLookup(videoId) ||
    hasLiveVersionSignal(query) ||
    !hasLiveVersionSignal(trackTitle)
  ) {
    return videoId;
  }

  const replacement = (await searchTracks(query, 8)).find(
    (candidate) => candidate.id !== videoId && !hasLiveVersionSignal(candidate.title)
  );
  return replacement?.id ?? videoId;
}

async function resolvePrefetchIds(videoIds: string[], tracks: Track[]): Promise<string[]> {
  const directIds = videoIds.filter((id) => !id.startsWith('spotify:') && isYoutubeVideoId(id));
  const trackIds = await Promise.all(
    tracks.map(async (track) => {
      if (!track.id.startsWith('spotify:')) return isYoutubeVideoId(track.id) ? track.id : null;
      if (track.youtubeId && isYoutubeVideoId(track.youtubeId)) return track.youtubeId;
      const matched = await matchSpotifyTrackToYoutube(track);
      return matched?.id && isYoutubeVideoId(matched.id) ? matched.id : null;
    })
  );

  return [...new Set([...directIds, ...trackIds.filter((id): id is string => Boolean(id))])];
}

function isLikelyWebmStream(contentType: string | null, audioUrl: string): boolean {
  const content = contentType?.toLowerCase() ?? '';
  const url = audioUrl.toLowerCase();
  return content.includes('webm') || url.includes('audio%2fwebm') || url.includes('audio/webm');
}

function isLimitedIosStream(audioUrl: string): boolean {
  try {
    return new URL(audioUrl).searchParams.get('c')?.toUpperCase() === 'IOS';
  } catch {
    return audioUrl.includes('c=IOS');
  }
}

const STREAM_CHUNK_SIZE = 1024 * 1024;

function normalizeUpstreamRange(range: string | undefined, chunkSize = STREAM_CHUNK_SIZE): string {
  if (!range) return `bytes=0-${chunkSize - 1}`;

  const openEnded = range.match(/^bytes=(\d+)-$/i);
  if (openEnded) {
    const start = Number(openEnded[1]);
    return `bytes=${start}-${start + chunkSize - 1}`;
  }

  return range;
}

async function fetchAudioStream(
  videoId: string,
  audioUrl: string,
  range: string | undefined,
  refreshIfWebm: boolean,
  boundedRange = true
): Promise<{ res: Response; refreshed: boolean; audioUrl: string }> {
  const upstreamRange = boundedRange ? normalizeUpstreamRange(range) : (range ?? normalizeUpstreamRange(undefined));
  const headers = { Range: upstreamRange };
  const res = await fetch(audioUrl, {
    headers,
  });

  const shouldRefresh =
    !res.ok ||
    isLimitedIosStream(audioUrl) ||
    (refreshIfWebm &&
      getEnvConfig().audioQualityPreference === 'auto' &&
      isLikelyWebmStream(res.headers.get('content-type'), audioUrl));

  if (!shouldRefresh) {
    return { res, refreshed: false, audioUrl };
  }

  res.body?.cancel().catch(() => {});
  const refreshedAudio = await resolveAudioUrl(videoId);
  refreshTrackUrl(
    videoId,
    refreshedAudio.url,
    refreshedAudio.qualityPreference,
    refreshedAudio.format,
    refreshedAudio.quality
  );
  const refreshedRes = await fetch(refreshedAudio.url, {
    headers,
  });
  return { res: refreshedRes, refreshed: true, audioUrl: refreshedAudio.url };
}

function parseContentRange(value: string | null): { start: number; end: number; total: number } | null {
  const match = value?.match(/^bytes\s+(\d+)-(\d+)\/(\d+)$/i);
  if (!match) return null;
  return {
    start: Number(match[1]),
    end: Number(match[2]),
    total: Number(match[3]),
  };
}

function audioFormatFromContentType(contentType: string | null): string {
  const content = contentType?.toLowerCase() ?? '';
  return content.includes('webm') ? 'webm' : 'm4a';
}

function audioCacheLog(track: CachedTrack, preference: string) {
  return {
    preference,
    cachedPreference: track.audioQualityPreference ?? 'auto',
    format: track.audioFormat ?? 'unknown',
    quality: track.audioQuality ?? 'unknown',
    hasLocalAudio: Boolean(track.localAudioPath),
  };
}

function writeAudioChunk(writer: fs.WriteStream, chunk: Buffer | Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    writer.once('error', reject);
    if (writer.write(chunk)) {
      writer.off('error', reject);
      resolve();
      return;
    }
    writer.once('drain', () => {
      writer.off('error', reject);
      resolve();
    });
  });
}

function finishWriter(writer: fs.WriteStream): Promise<void> {
  return new Promise((resolve, reject) => {
    writer.once('error', reject);
    writer.end(resolve);
  });
}

async function cacheAudioFile(videoId: string, audioUrl: string): Promise<boolean> {
  const preference = getEnvConfig().audioQualityPreference;
  if (getExistingAudioCachePath(videoId, preference)) return true;

  const { res, audioUrl: resolvedAudioUrl } = await fetchAudioStream(videoId, audioUrl, undefined, true);
  if (!res.ok || !res.body) return false;

  const rangeInfo = parseContentRange(res.headers.get('content-range'));
  const format = audioFormatFromContentType(res.headers.get('content-type'));
  const tempPath = getTempAudioCachePath(videoId);
  const finalPath = getAudioCachePath(videoId, format, preference);
  const writer = fs.createWriteStream(tempPath);
  let completed = false;

  try {
    for await (const chunk of Readable.fromWeb(res.body as any)) {
      await writeAudioChunk(writer, chunk as Buffer | Uint8Array);
    }

    if (rangeInfo) {
      let currentAudioUrl = resolvedAudioUrl;
      for (let start = rangeInfo.end + 1; start < rangeInfo.total; start += STREAM_CHUNK_SIZE) {
        const end = Math.min(start + STREAM_CHUNK_SIZE - 1, rangeInfo.total - 1);
        let chunkRes = await fetch(currentAudioUrl, {
          headers: { Range: `bytes=${start}-${end}` },
        });
        if (!chunkRes.ok || !chunkRes.body) {
          chunkRes.body?.cancel().catch(() => {});
          const refreshedAudio = await resolveAudioUrl(videoId);
          currentAudioUrl = refreshedAudio.url;
          refreshTrackUrl(
            videoId,
            currentAudioUrl,
            refreshedAudio.qualityPreference,
            refreshedAudio.format,
            refreshedAudio.quality
          );
          chunkRes = await fetch(currentAudioUrl, {
            headers: { Range: `bytes=${start}-${end}` },
          });
        }
        if (!chunkRes.ok || !chunkRes.body) return false;
        for await (const chunk of Readable.fromWeb(chunkRes.body as any)) {
          await writeAudioChunk(writer, chunk as Buffer | Uint8Array);
        }
      }
    }

    completed = true;
    await finishWriter(writer);
    if (!commitAudioCache(tempPath, finalPath)) return false;
    setLocalAudioPath(videoId, finalPath);
    enforceAudioCacheLimit(getEnvConfig().audioCacheLimitMb * 1024 * 1024);
    return true;
  } catch {
    return false;
  } finally {
    if (!completed) {
      try {
        writer.destroy();
      } catch {}
      discardAudioCache(tempPath);
    }
  }
}

async function scheduleAudioCache(videoIds: string[], app: FastifyInstance) {
  const preference = getEnvConfig().audioQualityPreference;
  for (const videoId of videoIds) {
    if (audioCacheInFlight.has(videoId) || getExistingAudioCachePath(videoId, preference)) continue;
    audioCacheInFlight.add(videoId);
    audioCacheQueue.add(async () => {
      try {
        const cached = getCachedById(videoId);
        const audioUrl = cached && isUrlFresh(cached) && cacheMatchesAudioQuality(cached, preference)
          ? cached.audioUrl
          : (await resolveAudioUrl(videoId)).url;
        const ok = await cacheAudioFile(videoId, audioUrl);
        app.log.info({ videoId, ok }, '[player] audio cache job done');
      } catch (err) {
        app.log.warn({ videoId, err }, '[player] audio cache job failed');
      } finally {
        audioCacheInFlight.delete(videoId);
      }
    }).catch((err) => app.log.warn({ videoId, err }, '[player] audio cache queue error'));
  }
}

function streamLocalAudioFile(filePath: string, range: string | undefined, reply: any) {
  const stat = fs.statSync(filePath);
  const total = stat.size;
  const contentType = filePath.endsWith('.webm') ? 'audio/webm' : 'audio/mp4';

  if (range) {
    const match = range.match(/^bytes=(\d+)-(\d*)$/i);
    const start = match ? Number(match[1]) : 0;
    const end = match?.[2] ? Number(match[2]) : total - 1;
    const safeEnd = Math.min(end, total - 1);

    reply
      .status(206)
      .header('Content-Type', contentType)
      .header('Accept-Ranges', 'bytes')
      .header('Content-Length', safeEnd - start + 1)
      .header('Content-Range', `bytes ${start}-${safeEnd}/${total}`)
      .header('Cache-Control', 'public, max-age=86400');

    return reply.send(fs.createReadStream(filePath, { start, end: safeEnd }));
  }

  reply
    .header('Content-Type', contentType)
    .header('Accept-Ranges', 'bytes')
    .header('Content-Length', total)
    .header('Cache-Control', 'public, max-age=86400');

  return reply.send(fs.createReadStream(filePath));
}

export async function playerRoutes(app: FastifyInstance) {
  app.get<{ Params: { videoId: string }; Querystring: { query?: string; youtubeId?: string } }>(
    '/player/resolve/:videoId',
    async (req, reply) => {
      const parsed = PlayParams.safeParse(req.params);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid videoId' });
      }

      const { videoId } = parsed.data;

      // Handle local file playback
      if (videoId.startsWith('local:')) {
        const localId = videoId.replace(/^local:/, '');
        const { getLocalFile } = await import('../services/localFiles.js');
        const localFile = getLocalFile(localId);
        if (!localFile) {
          return reply.status(404).send({ error: 'Local file not found' });
        }

        // Build a CachedTrack-like object pointing to our stream endpoint
        const cachedLike = {
          id: videoId,
          title: localFile.title,
          artist: localFile.artist,
          album: localFile.album,
          duration: localFile.duration,
          thumbnail: localFile.thumbnail,
          query: localFile.title,
          audioUrl: `/local-files/${localId}/stream`,
          audioUrlExpiry: Date.now() + 86400000, // 24 hours
          audioQualityPreference: 'high',
          audioFormat: localFile.format,
          audioQuality: 'local',
          localAudioPath: localFile.path,
          cachedAt: Date.now(),
          playCount: 0,
          source: 'local',
        };

        // Ensure local file is upserted into the cache store so recordPlay() works
        try {
          const saved = upsertTrack(localFile.title || localFile.path, cachedLike as any, cachedLike.audioUrl, localFile.path, 'high', cachedLike.audioFormat, 'local');
          return reply.send({ ...saved, source: 'local' });
        } catch (err) {
          // If upsert fails for any reason, fall back to returning the cachedLike object
          app.log.warn({ err, localId }, '[player] upsert local cached track failed');
          return reply.send(cachedLike);
        }
      }

      const query = req.query.query ?? videoId;
      const preference = getEnvConfig().audioQualityPreference;
      const startedAt = Date.now();
      app.log.info({ videoId, query }, '[player] resolve requested');

      const playableVideoId = await resolvePlayableVideoId(videoId, query, req.query.youtubeId);

      if (!playableVideoId) {
        app.log.warn({ videoId, query }, '[player] resolve failed before playback lookup');
        return reply.status(404).send({ error: 'No playable YouTube match found' });
      }

      if (playableVideoId !== videoId) {
        app.log.info({ videoId, playableVideoId, query }, '[player] spotify mapped to youtube');
      }

      const prefetched = getPrefetched(playableVideoId);
      if (prefetched && isUrlFresh(prefetched) && cacheMatchesAudioQuality(prefetched, preference)) {
        const replacementId = await avoidUnwantedLiveVersion(playableVideoId, query, prefetched.title);
        if (replacementId !== playableVideoId) {
          consumePrefetch(playableVideoId);
          app.log.info(
            { videoId: playableVideoId, replacementId, query, title: prefetched.title },
            '[player] replacing unwanted live/tour prefetched match'
          );
          const { track, audio } = await resolveTrack(replacementId, query);
          const saved = upsertTrack(
            query,
            track,
            audio.url,
            undefined,
            audio.qualityPreference,
            audio.format,
            audio.quality
          );
          return reply.send({ ...saved, source: 'resolved' });
        }

        consumePrefetch(playableVideoId);
        app.log.info(
          {
            videoId: playableVideoId,
            elapsedMs: Date.now() - startedAt,
            ...audioCacheLog(prefetched, preference),
          },
          '[player] prefetch hit'
        );
        return reply.send({ ...prefetched, source: 'prefetch' });
      }

      const cached = getCachedById(playableVideoId);
      app.log.info(
        {
          videoId: playableVideoId,
          inFlight: isPrefetching(playableVideoId),
          prefetch: getPrefetchStatus(),
          preference,
          cachedPreference: cached?.audioQualityPreference ?? null,
        },
        '[player] prefetch miss'
      );

      if (cached && isUrlFresh(cached) && cacheMatchesAudioQuality(cached, preference)) {
        const replacementId = await avoidUnwantedLiveVersion(playableVideoId, query, cached.title);
        if (replacementId !== playableVideoId) {
          app.log.info(
            { videoId: playableVideoId, replacementId, query, title: cached.title },
            '[player] replacing unwanted live/tour cached match'
          );
          const { track, audio } = await resolveTrack(replacementId, query);
          const saved = upsertTrack(
            query,
            track,
            audio.url,
            undefined,
            audio.qualityPreference,
            audio.format,
            audio.quality
          );
          return reply.send({ ...saved, source: 'resolved' });
        }

        app.log.info(
          {
            videoId: playableVideoId,
            elapsedMs: Date.now() - startedAt,
            ...audioCacheLog(cached, preference),
          },
          '[player] cache hit fresh'
        );
        return reply.send({ ...cached, source: 'cache' });
      }

      if (cached && (!isUrlFresh(cached) || !cacheMatchesAudioQuality(cached, preference))) {
        try {
          app.log.info(
            {
              videoId: playableVideoId,
              staleUrl: !isUrlFresh(cached),
              qualityMismatch: !cacheMatchesAudioQuality(cached, preference),
              ...audioCacheLog(cached, preference),
            },
            '[player] cache hit stale, refreshing URL'
          );
          const audio = await resolveAudioUrl(playableVideoId);
          refreshTrackUrl(
            playableVideoId,
            audio.url,
            audio.qualityPreference,
            audio.format,
            audio.quality
          );
          const refreshed = getCachedById(playableVideoId)!;
          app.log.info(
            {
              videoId: playableVideoId,
              elapsedMs: Date.now() - startedAt,
              ...audioCacheLog(refreshed, preference),
            },
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
        const replacementId = await avoidUnwantedLiveVersion(playableVideoId, query, track.title);
        if (replacementId !== playableVideoId) {
          app.log.info(
            { videoId: playableVideoId, replacementId, query, title: track.title },
            '[player] replacing unwanted live/tour cold match'
          );
          const replacement = await resolveTrack(replacementId, query);
          const saved = upsertTrack(
            query,
            replacement.track,
            replacement.audio.url,
            undefined,
            replacement.audio.qualityPreference,
            replacement.audio.format,
            replacement.audio.quality
          );
          return reply.send({ ...saved, source: 'resolved' });
        }

        const saved = upsertTrack(
          query,
          track,
          audio.url,
          undefined,
          audio.qualityPreference,
          audio.format,
          audio.quality
        );
        app.log.info(
          {
            videoId: playableVideoId,
            title: track.title,
            elapsedMs: Date.now() - startedAt,
            ...audioCacheLog(saved, preference),
          },
          '[player] cold resolve done'
        );
        return reply.send({ ...saved, source: 'resolved' });
      } catch (err) {
        app.log.error(err, `[player] full resolve failed for ${playableVideoId}`);
        markPlaybackFailed(playableVideoId);
        return reply
          .status(502)
          .send({ error: 'Could not resolve audio', message: (err as Error).message });
      }
    }
  );

  app.post('/player/played', async (req, reply) => {
    const parsed = PlayedBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', issues: parsed.error.issues });
    }

    let track = recordPlayWithMetadata(parsed.data);
    if (!track) {
      // If missing and it's a local track, attempt to upsert from local_files
      const id = parsed.data.id;
      if (id && id.startsWith('local:')) {
        try {
          const localId = id.replace(/^local:/, '');
          const { getLocalFile } = await import('../services/localFiles.js');
          const localFile = getLocalFile(localId);
          if (localFile) {
            // Upsert into cache so history recording works
            const { upsertTrack } = await import('../services/cache.js');
            upsertTrack(localFile.title || localFile.path, {
              id: parsed.data.id,
              title: localFile.title,
              artist: localFile.artist,
              album: localFile.album,
              duration: localFile.duration,
              thumbnail: localFile.thumbnail,
              query: localFile.title,
            } as any, `/local-files/${localId}/stream`, localFile.path, 'high', localFile.format, 'local');

            track = recordPlayWithMetadata(parsed.data);
          }
        } catch (err) {
          app.log.warn({ err }, '[player] upsert local track for played failed');
        }
      }
    }

    if (!track) {
      return reply.status(404).send({ error: 'Track is not cached yet' });
    }
    return reply.send({ ok: true, track });
  });

  // Stream audio through backend (bypass CORS for Web Audio API)
  app.get('/player/stream/:videoId', async (req, reply) => {
    const { videoId } = req.params as { videoId: string };

    // Handle local file streaming
    if (videoId.startsWith('local:')) {
      const localId = videoId.replace(/^local:/, '');
      const { getLocalFile } = await import('../services/localFiles.js');
      const localFile = getLocalFile(localId);

      if (!localFile) {
        return reply.status(404).send({ error: 'Local file not found' });
      }

      if (!fs.existsSync(localFile.path)) {
        return reply.status(404).send({ error: 'Audio file not found on disk' });
      }

      const stat = fs.statSync(localFile.path);
      const total = stat.size;
      const ext = localFile.path.toLowerCase().split('.').pop();
      const contentType = {
        mp3: 'audio/mpeg',
        m4a: 'audio/mp4',
        flac: 'audio/flac',
        wav: 'audio/wav',
        ogg: 'audio/ogg',
        webm: 'audio/webm',
      }[ext || ''] || 'audio/mpeg';

      const range = req.headers.range;
      if (range) {
        const match = range.match(/^bytes=(\d+)-(\d*)$/i);
        const start = match ? Number(match[1]) : 0;
        const end = match?.[2] ? Number(match[2]) : total - 1;
        const safeEnd = Math.min(end, total - 1);

        reply
          .status(206)
          .header('Content-Type', contentType)
          .header('Accept-Ranges', 'bytes')
          .header('Content-Length', safeEnd - start + 1)
          .header('Content-Range', `bytes ${start}-${safeEnd}/${total}`)
          .header('Cache-Control', 'public, max-age=86400');

        return reply.send(fs.createReadStream(localFile.path, { start, end: safeEnd }));
      }

      reply
        .header('Content-Type', contentType)
        .header('Accept-Ranges', 'bytes')
        .header('Content-Length', total)
        .header('Cache-Control', 'public, max-age=86400');

      return reply.send(fs.createReadStream(localFile.path));
    }

    const preference = getEnvConfig().audioQualityPreference;
    let cached = getCachedById(videoId);
    if (!cached) {
      try {
        app.log.info({ videoId }, '[player] stream cache miss, resolving on demand');
        const { track, audio } = await resolveTrack(videoId, videoId);
        cached = upsertTrack(
          videoId,
          track,
          audio.url,
          undefined,
          audio.qualityPreference,
          audio.format,
          audio.quality
        );
      } catch (err) {
        app.log.warn(err, `[player] stream cache miss resolve failed for ${videoId}`);
        return reply
          .status(404)
          .send({ error: 'No fresh stream, resolve first', message: (err as Error).message });
      }
    } else if (!isUrlFresh(cached) || !cacheMatchesAudioQuality(cached, preference)) {
      try {
        app.log.info({ videoId }, '[player] stream cache stale, refreshing URL');
        const audio = await resolveAudioUrl(videoId);
        refreshTrackUrl(videoId, audio.url, audio.qualityPreference, audio.format, audio.quality);
        cached = getCachedById(videoId);
      } catch (err) {
        app.log.warn(err, `[player] stream stale refresh failed for ${videoId}`);
        return reply
          .status(404)
          .send({ error: 'No fresh stream, resolve first', message: (err as Error).message });
      }
    }

    if (!cached) {
      return reply.status(404).send({ error: 'No fresh stream, resolve first' });
    }

    try {
      const range = req.headers.range;
      const localAudioPath = cached.localAudioPath && fs.existsSync(cached.localAudioPath)
        ? cached.localAudioPath
        : getExistingAudioCachePath(videoId, preference);

      if (localAudioPath) {
        if (localAudioPath !== cached.localAudioPath) {
          setLocalAudioPath(videoId, localAudioPath);
        }
        touchAudioCache(localAudioPath);
        app.log.info(
          { videoId, localAudioPath, ...audioCacheLog(cached, preference) },
          '[player] streaming local audio cache'
        );
        return streamLocalAudioFile(localAudioPath, range, reply);
      }

      const { res: ytRes, refreshed } = await fetchAudioStream(
        videoId,
        cached.audioUrl,
        range,
        true
      );
      if (!ytRes.ok || !ytRes.body) {
        if (ytRes.status === 403) {
          ytRes.body?.cancel().catch(() => {});
          try {
            app.log.info({ videoId }, '[player] stream URL forbidden, resolving full track again');
            const { track, audio } = await resolveTrack(videoId, cached.query || videoId);
            const saved = upsertTrack(
              cached.query || videoId,
              {
                ...track,
                title: cached.title || track.title,
                artist: cached.artist || track.artist,
                album: cached.album ?? track.album,
                duration: cached.duration || track.duration,
                thumbnail: cached.thumbnail || track.thumbnail,
                query: cached.query || track.query,
                spotifyId: cached.spotifyId,
                spotifyUrl: cached.spotifyUrl,
                youtubeId: cached.youtubeId,
                youtubeTitle: cached.youtubeTitle,
                youtubeArtist: cached.youtubeArtist,
                queueSource: cached.queueSource,
              },
              audio.url,
              undefined,
              audio.qualityPreference,
              audio.format,
              audio.quality
            );
            const retry = await fetchAudioStream(videoId, saved.audioUrl, range, true);
            if (retry.res.ok && retry.res.body) {
              cached = saved;
              if (retry.refreshed) {
                app.log.info({ videoId }, '[player] refreshed stream URL before proxying');
              }
              const retryNodeStream = Readable.fromWeb(retry.res.body as any);
              reply
                .status(retry.res.status === 206 ? 206 : 200)
                .header('Content-Type', retry.res.headers.get('content-type') || 'audio/mp4')
                .header('Access-Control-Allow-Origin', '*')
                .header('Accept-Ranges', retry.res.headers.get('accept-ranges') ?? 'bytes')
                .header('Cache-Control', 'public, max-age=3600');
              const retryLength = retry.res.headers.get('content-length');
              const retryRange = retry.res.headers.get('content-range');
              if (retryLength) reply.header('Content-Length', retryLength);
              if (retryRange) reply.header('Content-Range', retryRange);
              return reply.send(retryNodeStream);
            }
          } catch (err) {
            app.log.warn({ videoId, err }, '[player] full stream recovery failed');
          }
        }

        markPlaybackFailed(videoId);
        app.log.warn(
          {
            videoId,
            upstreamStatus: ytRes.status,
            upstreamStatusText: ytRes.statusText,
            refreshed,
          },
          '[player] YouTube stream failed after refresh attempt'
        );
        return reply
          .status(502)
          .send({ error: 'YouTube stream failed', status: ytRes.status, refreshed });
      }

      if (refreshed) {
        app.log.info(
          { videoId, ...audioCacheLog(cached, preference) },
          '[player] refreshed stream URL before proxying'
        );
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
      app.log.warn({ videoId, err }, '[player] stream proxy failed');
      return reply
        .status(502)
        .header('Content-Type', 'application/json; charset=utf-8')
        .send(JSON.stringify({ error: 'Stream proxy failed', message: (err as Error).message }));
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

  app.post('/player/cache-audio/status', async (req, reply) => {
    const parsed = AudioCacheBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', issues: parsed.error.issues });
    }

    const { videoIds = [], tracks = [] } = parsed.data;
    const preference = getEnvConfig().audioQualityPreference;
    const trackStatuses = await Promise.all(
      tracks.map(async (track) => {
        const [playableId] = await resolvePrefetchIds([], [track]);
        return {
          id: track.id,
          playableId: playableId ?? null,
          cached: playableId ? Boolean(getExistingAudioCachePath(playableId, preference)) : false,
          inFlight: playableId ? audioCacheInFlight.has(playableId) : false,
          prefetched: playableId ? Boolean(getPrefetched(playableId)) : false,
          prefetching: playableId ? isPrefetching(playableId) : false,
        };
      })
    );
    const playableIds = await resolvePrefetchIds(videoIds, []);
    const cachedIds = playableIds.filter((id) => Boolean(getExistingAudioCachePath(id, preference)));
    return reply.send({
      playableIds,
      cachedIds,
      inFlightIds: playableIds.filter((id) => audioCacheInFlight.has(id)),
      tracks: trackStatuses,
    });
  });

  app.post('/player/cache/clear-track', async (req, reply) => {
    const parsed = ClearTrackCacheBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', issues: parsed.error.issues });
    }

    const track = parsed.data;
    const videoIds = new Set<string>();

    if (track.id && isYoutubeVideoId(track.id)) videoIds.add(track.id);
    if (track.youtubeId && isYoutubeVideoId(track.youtubeId)) videoIds.add(track.youtubeId);

    const cachedBySpotify = track.spotifyId ? getCachedBySpotifyId(track.spotifyId) : null;
    if (cachedBySpotify?.id && isYoutubeVideoId(cachedBySpotify.id)) videoIds.add(cachedBySpotify.id);
    if (cachedBySpotify?.youtubeId && isYoutubeVideoId(cachedBySpotify.youtubeId)) videoIds.add(cachedBySpotify.youtubeId);

    const matchCache = track.spotifyId ? clearMatchCacheForSpotifyId(track.spotifyId) : { cleared: 0 };
    if (matchCache.youtubeId && isYoutubeVideoId(matchCache.youtubeId)) videoIds.add(matchCache.youtubeId);

    const ids = [...videoIds];
    const audio = ids.reduce(
      (total, id) => {
        audioCacheInFlight.delete(id);
        const result = clearAudioCacheForId(id);
        total.files += result.files;
        total.bytes += result.bytes;
        return total;
      },
      { files: 0, bytes: 0 }
    );
    const prefetch = ids.reduce(
      (total, id) => {
        const result = clearPrefetchForId(id);
        total.prefetched += result.prefetched;
        total.inFlight += result.inFlight ? 1 : 0;
        return total;
      },
      { prefetched: 0, inFlight: 0 }
    );
    const blacklist = ids.reduce(
      (total, id) => total + clearPlaybackBlacklistForId(id).cleared,
      0
    );
    const learned = clearTrackCache(ids, track.spotifyId);

    return reply.send({
      ok: true,
      ids,
      learned,
      audio,
      prefetch,
      blacklist: { cleared: blacklist },
      matchCache,
    });
  });

  app.post('/player/cache-audio', async (req, reply) => {
    const parsed = AudioCacheBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', issues: parsed.error.issues });
    }

    const { videoIds = [], tracks = [] } = parsed.data;
    const playableIds = await resolvePrefetchIds(videoIds, tracks);
    await scheduleAudioCache(playableIds, app);
    const preference = getEnvConfig().audioQualityPreference;
    return reply.send({
      scheduled: playableIds.filter((id) => !getExistingAudioCachePath(id, preference)),
      cachedIds: playableIds.filter((id) => Boolean(getExistingAudioCachePath(id, preference))),
      message: 'Audio cache queued',
    });
  });
}
