import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, type Track } from '../utils/api';
import { usePlayerStore } from '../store/player';

const LYRICS_STALE_TIME = 1000 * 60 * 60;

export function lyricsQueryKey(track: Track) {
  return ['lyrics', 'romanized-v1', track.spotifyId ?? track.id, track.title, track.artist, track.duration];
}

export function lyricsQueryOptions(track: Track) {
  return {
    queryKey: lyricsQueryKey(track),
    queryFn: () => api.lyrics(track),
    staleTime: LYRICS_STALE_TIME,
    retry: false,
  };
}

export function useLyricsPrefetch() {
  const queryClient = useQueryClient();
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const queue = usePlayerStore((state) => state.queue);
  const queueIndex = usePlayerStore((state) => state.queueIndex);

  useEffect(() => {
    const tracks = [
      currentTrack,
      ...queue.slice(Math.max(0, queueIndex + 1), Math.max(0, queueIndex + 4)),
    ].filter((track): track is Track => Boolean(track));
    const seen = new Set<string>();

    tracks.forEach((track) => {
      const key = `${track.spotifyId ?? track.id}:${track.title}:${track.artist}:${track.duration}`;
      if (seen.has(key)) return;
      seen.add(key);
      void queryClient.prefetchQuery(lyricsQueryOptions(track));
    });
  }, [currentTrack, queue, queueIndex, queryClient]);
}
