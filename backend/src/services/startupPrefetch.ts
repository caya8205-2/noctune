import { getTopTracks } from './cache.js';
import { schedulePrefetch } from './prefetch.js';

export function scheduleStartupPrefetch(): void {
  const tracks = getTopTracks(5);
  if (tracks.length === 0) return;

  const ids = tracks
    .map((track) => track.youtubeId || (!track.id.startsWith('spotify:') ? track.id : null))
    .filter((id): id is string => Boolean(id));

  if (ids.length === 0) return;

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
