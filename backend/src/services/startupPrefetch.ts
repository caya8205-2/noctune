import { getTopTracks } from './cache.js';
import { schedulePrefetch } from './prefetch.js';

export function scheduleStartupPrefetch(): void {
  const tracks = getTopTracks(5);
  if (tracks.length === 0) return;

  const ids = tracks.map((track) => track.id).filter(Boolean);
  console.log(
    `[startup] prefetch warmup ${JSON.stringify({
      count: ids.length,
      tracks: tracks.map((track) => `${track.title} - ${track.artist}`),
    })}`
  );
  schedulePrefetch(ids).catch((err) => {
    console.warn('[startup] prefetch warmup failed:', (err as Error).message);
  });
}
