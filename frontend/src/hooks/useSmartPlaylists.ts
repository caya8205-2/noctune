import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api, type Track } from '../utils/api';

export interface SmartPlaylist {
  id: string; // 'smart:most-played' etc.
  name: string;
  description: string;
  cover: string;
  tracks: Track[];
}

// Helper function to get stable cover from tracks (first track with thumbnail)
function getStableCover(tracks: Track[]): string {
  if (tracks.length === 0) return '';
  const trackWithThumb = tracks.find(t => t.thumbnail);
  return trackWithThumb?.thumbnail || tracks[0]?.thumbnail || '';
}

// Hook to prefetch Discover Weekly in background on app startup
export function useSmartPlaylistsPrefetch() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Prefetch Discover Weekly in background with 7-day stale time
    void queryClient.prefetchQuery({
      queryKey: ['smart', 'discover-weekly'],
      queryFn: async (): Promise<Track[]> => {
        try {
          const res = await api.getDiscoverWeekly();
          return res.tracks;
        } catch {
          return [];
        }
      },
      staleTime: 1000 * 60 * 60 * 24 * 7, // 7 days
    });
  }, [queryClient]);
}

export function useSmartPlaylists() {
  // Top Favorites — top 20 tracks by playCount via stats endpoint
  const mostPlayedQuery = useQuery({
    queryKey: ['smart', 'most-played'],
    queryFn: async (): Promise<Track[]> => {
      try {
        const top = await api.stats.topTracks('all', 20);
        return top.map(item => item.track);
      } catch {
        // Fallback: use history sorted by playCount
        const hist = await api.history();
        return hist.tracks
          .slice()
          .sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0))
          .slice(0, 20);
      }
    },
    staleTime: 1000 * 60 * 5,
  });

  // Recently Played — last 20 tracks from history
  const recentlyAddedQuery = useQuery({
    queryKey: ['smart', 'recently-added'],
    queryFn: async (): Promise<Track[]> => {
      try {
        const hist = await api.history();
        return hist.tracks
          .slice()
          .sort((a, b) => (b.lastPlayed ?? b.cachedAt ?? 0) - (a.lastPlayed ?? a.cachedAt ?? 0))
          .slice(0, 20);
      } catch {
        return [];
      }
    },
    staleTime: 1000 * 60 * 5,
  });

  // Short Tracks — tracks under 3 minutes from history
  const shortTracksQuery = useQuery({
    queryKey: ['smart', 'short-tracks'],
    queryFn: async (): Promise<Track[]> => {
      try {
        const hist = await api.history();
        return hist.tracks
          .filter(t => t.duration < 180)
          .slice(0, 20);
      } catch {
        return [];
      }
    },
    staleTime: 1000 * 60 * 5,
  });

  // Discover Weekly — 7-day persistent cached recommendations from backend
  const discoverWeeklyQuery = useQuery({
    queryKey: ['smart', 'discover-weekly'],
    queryFn: async (): Promise<Track[]> => {
      try {
        const res = await api.getDiscoverWeekly();
        return res.tracks;
      } catch {
        return [];
      }
    },
    staleTime: 1000 * 60 * 60 * 24 * 7, // 7 days
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const smartPlaylists: SmartPlaylist[] = [
    {
      id: 'smart:most-played',
      name: 'Top Favorites',
      description: 'Your top 20 tracks',
      cover: getStableCover(mostPlayedQuery.data ?? []),
      tracks: mostPlayedQuery.data ?? [],
    },
    {
      id: 'smart:recently-added',
      name: 'Recently Played',
      description: 'Latest tracks in your history',
      cover: getStableCover(recentlyAddedQuery.data ?? []),
      tracks: recentlyAddedQuery.data ?? [],
    },
    {
      id: 'smart:short-tracks',
      name: 'Short Tracks',
      description: 'Tracks under 3 minutes',
      cover: getStableCover(shortTracksQuery.data ?? []),
      tracks: shortTracksQuery.data ?? [],
    },
    {
      id: 'smart:discover-weekly',
      name: 'Discover Weekly',
      description: 'Fresh picks based on your history',
      cover: getStableCover(discoverWeeklyQuery.data ?? []),
      tracks: discoverWeeklyQuery.data ?? [],
    },
  ];

  const isLoading =
    mostPlayedQuery.isLoading ||
    recentlyAddedQuery.isLoading ||
    shortTracksQuery.isLoading ||
    discoverWeeklyQuery.isLoading;

  return {
    smartPlaylists,
    getSmartPlaylist: (id: string): SmartPlaylist | undefined =>
      smartPlaylists.find(p => p.id === id),
    isLoading,
    isDiscoverWeeklyFetching: discoverWeeklyQuery.isLoading || discoverWeeklyQuery.isFetching,
  };
}
