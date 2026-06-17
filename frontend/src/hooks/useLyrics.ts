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

  useEffect(() => {
    if (!currentTrack) return;
    void queryClient.prefetchQuery(lyricsQueryOptions(currentTrack));
  }, [currentTrack?.id, currentTrack?.spotifyId, currentTrack?.title, currentTrack?.artist, currentTrack?.duration, queryClient]);
}
