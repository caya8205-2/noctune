import { useQuery } from '@tanstack/react-query';
import { api, type Track } from '../utils/api';

export interface SmartPlaylist {
  id: string; // 'smart:most-played' etc.
  name: string;
  description: string;
  tracks: Track[];
}

export function useSmartPlaylists() {
  // Most Played — top 20 tracks by playCount via stats endpoint
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

  // Recently Added — last 20 tracks by cachedAt from history
  const recentlyAddedQuery = useQuery({
    queryKey: ['smart', 'recently-added'],
    queryFn: async (): Promise<Track[]> => {
      try {
        const hist = await api.history();
        return hist.tracks
          .slice()
          .sort((a, b) => (b.cachedAt ?? 0) - (a.cachedAt ?? 0))
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

  // Discover Weekly — recommendations based on recent history, excluding already-played tracks
  const discoverWeeklyQuery = useQuery({
    queryKey: ['smart', 'discover-weekly'],
    queryFn: async (): Promise<Track[]> => {
      try {
        const hist = await api.history();
        const recentTracks = hist.tracks.slice(0, 5);
        if (recentTracks.length === 0) return [];

        // Use the most recent track as seed
        const seed = recentTracks[0];
        const excludeIds = recentTracks.map(t => t.id);
        const recs = await api.recommend(seed, excludeIds, 20);
        return recs.tracks;
      } catch {
        return [];
      }
    },
    staleTime: 1000 * 60 * 15,
    refetchOnMount: 'always',
  });

  const smartPlaylists: SmartPlaylist[] = [
    {
      id: 'smart:most-played',
      name: 'Most Played',
      description: 'Your top 20 tracks',
      tracks: mostPlayedQuery.data ?? [],
    },
    {
      id: 'smart:recently-added',
      name: 'Recently Added',
      description: 'Latest tracks in your history',
      tracks: recentlyAddedQuery.data ?? [],
    },
    {
      id: 'smart:short-tracks',
      name: 'Short Tracks',
      description: 'Tracks under 3 minutes',
      tracks: shortTracksQuery.data ?? [],
    },
    {
      id: 'smart:discover-weekly',
      name: 'Discover Weekly',
      description: 'Fresh picks based on your history',
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
    refetchDiscoverWeekly: discoverWeeklyQuery.refetch,
  };
}
