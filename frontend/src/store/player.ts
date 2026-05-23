import { create } from 'zustand';
import type { CachedTrack, Track } from '../utils/api';
import { api } from '../utils/api';

export type RepeatMode = 'off' | 'all' | 'one';

interface PlayerState {
  // ── Playback ────────────────────────────────────────────────────────────────
  currentTrack: CachedTrack | null;
  isPlaying: boolean;
  isLoading: boolean;
  volume: number;         // 0–1
  progress: number;       // seconds
  duration: number;       // seconds
  shuffle: boolean;
  repeat: RepeatMode;

  // ── Queue ───────────────────────────────────────────────────────────────────
  queue: Track[];
  queueIndex: number;     // index of currentTrack in queue

  // ── UI ──────────────────────────────────────────────────────────────────────
  activeView: 'home' | 'search' | 'playlist' | 'queue' | 'settings';
  activePlaylistId: string | null;

  // ── Actions ─────────────────────────────────────────────────────────────────
  playTrack: (track: Track, queue?: Track[], options?: { autoQueue?: boolean }) => Promise<void>;
  togglePlay: () => void;
  setVolume: (v: number) => void;
  setProgress: (s: number) => void;
  setDuration: (s: number) => void;
  next: () => Promise<void>;
  prev: () => Promise<void>;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  addToQueue: (track: Track) => void;
  clearQueue: () => void;
  setView: (view: PlayerState['activeView'], playlistId?: string) => void;
  setLoading: (v: boolean) => void;
  setIsPlaying: (v: boolean) => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  isPlaying: false,
  isLoading: false,
  volume: 0.8,
  progress: 0,
  duration: 0,
  shuffle: false,
  repeat: 'off',
  queue: [],
  queueIndex: -1,
  activeView: 'home',
  activePlaylistId: null,

  setLoading: (v) => set({ isLoading: v }),
  setIsPlaying: (v) => set({ isPlaying: v }),
  setVolume: (v) => set({ volume: v }),
  setProgress: (s) => set({ progress: s }),
  setDuration: (s) => set({ duration: s }),

  playTrack: async (track, newQueue, options) => {
    set({ isLoading: true });
    const startedAt = performance.now();
    const queue = newQueue ?? get().queue;
    const idx = queue.findIndex(t => t.id === track.id);
    console.info('[player] playTrack start', {
      id: track.id,
      title: track.title,
      queueIndex: idx,
      queueLength: queue.length,
    });

    try {
      const resolveQuery = track.id.startsWith('spotify:')
        ? `${track.title} ${track.artist}`
        : track.query;
      const resolved = await api.resolve(track.id, resolveQuery);
      const playableTrack = {
        ...resolved,
        title: track.title,
        artist: track.artist,
        duration: track.duration,
        thumbnail: track.thumbnail,
        query: track.query,
        spotifyId: track.spotifyId,
        spotifyUrl: track.spotifyUrl,
        youtubeId: track.youtubeId ?? resolved.id,
        youtubeTitle: track.youtubeTitle,
        youtubeArtist: track.youtubeArtist,
      };
      const shouldAutoQueue = options?.autoQueue ?? false;
      let playbackQueue = queue;
      let playbackIndex = idx;

      if (shouldAutoQueue) {
        try {
          const excludeIds = [...queue.map(t => t.id), track.spotifyId ?? '', track.youtubeId ?? '']
            .filter(Boolean);
          console.info('[player] autoqueue request', {
            seed: `${track.title} - ${track.artist}`,
            excludeIds,
          });
          const recs = await api.recommend(track, excludeIds, 12);
          playbackQueue = [track, ...recs.tracks];
          playbackIndex = 0;
          console.info('[player] autoqueue done', {
            seed: track.id,
            count: recs.tracks.length,
            next: recs.tracks.slice(0, 5).map(t => `${t.title} - ${t.artist}`),
          });
        } catch (err) {
          console.warn('[player] autoqueue failed, keeping current queue:', err);
        }
      }

      console.info('[player] resolve done', {
        requestedId: track.id,
        resolvedId: resolved.id,
        source: resolved.source,
        elapsedMs: Math.round(performance.now() - startedAt),
      });

      set({
        currentTrack: playableTrack,
        isPlaying: true,
        isLoading: false,
        progress: 0,
        queue: playbackQueue,
        queueIndex: playbackIndex,
      });

      // Trigger prefetch for next 5 tracks
      if (playbackQueue.length > 0 && playbackIndex >= 0) {
        const nextTracks = getNextCandidateTracks(playbackQueue, playbackIndex, get().shuffle, 5);
        const nextIds = nextTracks.map(t => t.id);

        console.info('[player] prefetch plan', {
          currentId: track.id,
          nextIds,
        });

        if (nextTracks.length > 0) {
          api.prefetchTracks(nextTracks).catch(() => {});
        }
      }
    } catch (err) {
      console.error('[player] playTrack failed:', err);
      set({ isLoading: false });
    }
  },

  togglePlay: () => set(s => ({ isPlaying: !s.isPlaying })),

  next: async () => {
    const { queue, queueIndex, shuffle, repeat } = get();
    if (queue.length === 0) return;
    let nextIdx: number;
    if (repeat === 'one') {
      nextIdx = queueIndex;
    } else if (shuffle) {
      nextIdx = Math.floor(Math.random() * queue.length);
    } else {
      nextIdx = queueIndex + 1;
      if (nextIdx >= queue.length) {
        if (repeat === 'all') nextIdx = 0;
        else return;
      }
    }
    console.info('[player] next selected', {
      fromIndex: queueIndex,
      toIndex: nextIdx,
      id: queue[nextIdx]?.id,
      title: queue[nextIdx]?.title,
      shuffle,
      repeat,
    });
    await get().playTrack(queue[nextIdx], queue);
  },

  prev: async () => {
    const { queue, queueIndex, progress } = get();
    // If > 3s in, restart current track
    if (progress > 3) {
      set({ progress: 0 });
      return;
    }
    if (queue.length === 0) return;
    const prevIdx = Math.max(0, queueIndex - 1);
    await get().playTrack(queue[prevIdx], queue);
  },

  toggleShuffle: () => set(s => ({ shuffle: !s.shuffle })),
  cycleRepeat: () =>
    set(s => ({ repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off' })),

  addToQueue: (track) =>
    set(s => ({ queue: [...s.queue, track] })),

  clearQueue: () => set({ queue: [], queueIndex: -1 }),

  setView: (view, playlistId) =>
    set({ activeView: view, activePlaylistId: playlistId ?? null }),
}));

function getNextCandidateTracks(
  queue: Track[],
  currentIdx: number,
  shuffle: boolean,
  count: number
): Track[] {
  if (shuffle) {
    return queue
      .filter((_, i) => i !== currentIdx)
      .sort(() => Math.random() - 0.5)
      .slice(0, count);
  }
  return queue
    .slice(currentIdx + 1, currentIdx + 1 + count);
}
