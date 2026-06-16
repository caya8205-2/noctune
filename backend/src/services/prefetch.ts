import PQueue from 'p-queue';
import { getCachedById, isUrlFresh, upsertTrack } from './cache.js';
import { resolveAudioUrl, resolveTrack } from './audioResolver.js';
import type { CachedTrack } from '../types/index.js';

const prefetchQueue = new PQueue({ concurrency: 2 });
const inFlight = new Set<string>();
const prefetched = new Map<string, CachedTrack>();

function logPrefetch(message: string, details?: Record<string, unknown>) {
  const suffix = details ? ` ${JSON.stringify(details)}` : '';
  console.log(`[prefetch] ${message}${suffix}`);
}

export function getPrefetched(videoId: string): CachedTrack | undefined {
  return prefetched.get(videoId);
}

export function isPrefetching(videoId: string): boolean {
  return inFlight.has(videoId);
}

export async function schedulePrefetch(videoIds: string[]): Promise<void> {
  const targets = videoIds.slice(0, 5);
  logPrefetch('schedule requested', {
    requested: videoIds.length,
    targets,
    queueSize: prefetchQueue.size,
    pending: prefetchQueue.pending,
    inFlight: [...inFlight],
    prefetched: [...prefetched.keys()],
  });

  for (const videoId of targets) {
    if (inFlight.has(videoId)) {
      logPrefetch('skip already in-flight', { videoId });
      continue;
    }

    if (prefetched.has(videoId)) {
      logPrefetch('skip already prefetched', { videoId });
      continue;
    }

    const cached = getCachedById(videoId);
    if (cached && isUrlFresh(cached)) {
      prefetched.set(videoId, cached);
      logPrefetch('fresh cache promoted to prefetched map', {
        videoId,
        title: cached.title,
        expiresInMs: cached.audioUrlExpiry - Date.now(),
      });
      continue;
    }

    inFlight.add(videoId);
    logPrefetch('enqueue job', {
      videoId,
      mode: cached ? 'refresh-url' : 'full-resolve',
      queueSize: prefetchQueue.size,
      pending: prefetchQueue.pending,
    });

    prefetchQueue.add(async () => {
      const startedAt = Date.now();
      const mode = cached ? 'refresh-url' : 'full-resolve';
      logPrefetch('job start', { videoId, mode });

      try {
        if (cached) {
          const audio = await resolveAudioUrl(videoId);
          const refreshed = upsertTrack(cached.query, cached, audio.url);
          prefetched.set(videoId, refreshed);
          logPrefetch('job done', {
            videoId,
            mode,
            title: refreshed.title,
            elapsedMs: Date.now() - startedAt,
          });
        } else {
          const { track, audio } = await resolveTrack(videoId, videoId);
          const saved = upsertTrack(videoId, track, audio.url);
          prefetched.set(videoId, saved);
          logPrefetch('job done', {
            videoId,
            mode,
            title: track.title,
            elapsedMs: Date.now() - startedAt,
          });
        }
      } catch (err) {
        console.warn(
          `[prefetch] job failed ${JSON.stringify({
            videoId,
            mode,
            elapsedMs: Date.now() - startedAt,
            message: (err as Error).message,
          })}`
        );
      } finally {
        inFlight.delete(videoId);
        logPrefetch('job settled', {
          videoId,
          queueSize: prefetchQueue.size,
          pending: prefetchQueue.pending,
          inFlight: [...inFlight],
          prefetched: [...prefetched.keys()],
        });
      }
    });
  }
}

export function consumePrefetch(videoId: string): void {
  logPrefetch(prefetched.has(videoId) ? 'consume hit' : 'consume miss', { videoId });
  prefetched.delete(videoId);
}

export function clearPrefetchCache(): { prefetched: number; inFlight: number; queued: number } {
  const snapshot = {
    prefetched: prefetched.size,
    inFlight: inFlight.size,
    queued: prefetchQueue.size,
  };
  prefetched.clear();
  prefetchQueue.clear();
  logPrefetch('cleared memory cache', snapshot);
  return snapshot;
}

export function clearPrefetchForId(videoId: string): { prefetched: number; inFlight: boolean } {
  const hadPrefetched = prefetched.delete(videoId) ? 1 : 0;
  const wasInFlight = inFlight.delete(videoId);
  logPrefetch('cleared track memory cache', { videoId, prefetched: hadPrefetched, inFlight: wasInFlight });
  return { prefetched: hadPrefetched, inFlight: wasInFlight };
}

export function getPrefetchStatus() {
  return {
    queueSize: prefetchQueue.size,
    pending: prefetchQueue.pending,
    inFlight: [...inFlight],
    prefetched: [...prefetched.keys()],
  };
}
