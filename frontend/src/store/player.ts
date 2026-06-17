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
  lastNonZeroVolume: number;
  progress: number;       // seconds
  duration: number;       // seconds
  shuffle: boolean;
  repeat: RepeatMode;

  // ── Queue ───────────────────────────────────────────────────────────────────
  queue: Track[];
  queueIndex: number;     // index of currentTrack in queue

  // ── UI ──────────────────────────────────────────────────────────────────────
  activeView: 'home' | 'player' | 'search' | 'history' | 'playlist' | 'queue' | 'settings' | 'artist' | 'album';
  activePlaylistId: string | null;
  activeArtistId: string | null;
  activeAlbumId: string | null;
  showTrackDetails: boolean;
  showShortcutsHelp: boolean;
  playbackNotice: string | null;

  // ── Actions ─────────────────────────────────────────────────────────────────
  playTrack: (track: Track, queue?: Track[], options?: { autoQueue?: boolean; queueSource?: Track['queueSource'] }) => Promise<void>;
  togglePlay: () => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  setProgress: (s: number) => void;
  setDuration: (s: number) => void;
  next: () => Promise<void>;
  prev: () => Promise<void>;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  addToQueue: (track: Track, source?: Track['queueSource']) => void;
  removeFromQueue: (index: number) => void;
  removePlayedTracks: () => void;
  shuffleQueue: () => void;
  markTrackUnavailable: (trackId: string, message?: string) => void;
  dismissPlaybackNotice: () => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;
  toggleTrackDetails: () => void;
  toggleShortcutsHelp: () => void;
  setView: (view: PlayerState['activeView'], id?: string) => void;
  setLoading: (v: boolean) => void;
  setIsPlaying: (v: boolean) => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  isPlaying: false,
  isLoading: false,
  volume: 0.8,
  lastNonZeroVolume: 0.8,
  progress: 0,
  duration: 0,
  shuffle: false,
  repeat: 'off',
  queue: [],
  queueIndex: -1,
  activeView: 'home',
  activePlaylistId: null,
  activeArtistId: null,
  activeAlbumId: null,
  showTrackDetails: true,
  showShortcutsHelp: false,
  playbackNotice: null,

  setLoading: (v) => set({ isLoading: v }),
  setIsPlaying: (v) => set({ isPlaying: v }),
  setVolume: (v) => set({
    volume: v,
    ...(v > 0 ? { lastNonZeroVolume: v } : {}),
  }),
  toggleMute: () => set((s) => (
    s.volume > 0
      ? { volume: 0, lastNonZeroVolume: s.volume }
      : { volume: s.lastNonZeroVolume > 0 ? s.lastNonZeroVolume : 0.8 }
  )),
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
    void api.lyrics(track).catch((err) => console.warn('[player] lyrics prefetch failed:', err));

    try {
      const resolveQuery = track.id.startsWith('spotify:')
        ? `${track.title} ${track.artist}`
        : track.query;
      const resolved = await api.resolve(track.id, resolveQuery, track.youtubeId);
      const playableTrack = {
        ...resolved,
        title: track.title,
        artist: track.artist,
        album: track.album,
        duration: track.duration,
        thumbnail: track.thumbnail,
        query: track.query,
        spotifyId: track.spotifyId,
        spotifyUrl: track.spotifyUrl,
        artistId: track.artistId,
        albumId: track.albumId,
        youtubeId: track.youtubeId ?? resolved.id,
        youtubeTitle: track.youtubeTitle,
        youtubeArtist: track.youtubeArtist,
        queueSource: track.queueSource,
      };
      const source = options?.queueSource ?? track.queueSource ?? 'search';
      playableTrack.queueSource = source;
      const seedTrack = { ...track, queueSource: source };
      const shouldAutoQueue = options?.autoQueue ?? false;
      let playbackQueue = queue.map((queuedTrack) => queuedTrack.id === track.id ? seedTrack : queuedTrack);
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
          playbackQueue = [
            seedTrack,
            ...recs.tracks.map((recommendedTrack) => ({
              ...recommendedTrack,
              queueSource: 'autoqueue' as const,
            })),
          ];
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
      set((s) => {
        const failedIndex = s.queue.findIndex((queuedTrack) => queuedTrack.id === track.id);
        return {
          isLoading: false,
          queueIndex: failedIndex >= 0 ? failedIndex : s.queueIndex,
          queue: s.queue.map((queuedTrack) =>
            queuedTrack.id === track.id
              ? { ...queuedTrack, playbackError: 'Unavailable' }
              : queuedTrack
          ),
        };
      });
      const state = get();
      const failedIndex = state.queue.findIndex((queuedTrack) => queuedTrack.id === track.id);
      const hasNext = failedIndex >= 0 && failedIndex < state.queue.length - 1;
      if (hasNext) {
        set({ playbackNotice: `Skipped "${track.title}" because it is unavailable.` });
        window.setTimeout(() => {
          get().next();
        }, 150);
      }
    }
  },

  togglePlay: () => set(s => ({ isPlaying: !s.isPlaying })),

  next: async () => {
    const { queue, queueIndex, shuffle, repeat } = get();
    if (queue.length === 0) return;
    let nextIdx: number;
    let attempts = 0;
    const pickNextIndex = () => {
      if (repeat === 'one') {
        if (queue[queueIndex]?.playbackError) {
          const candidate = queueIndex + 1;
          return candidate >= queue.length ? -1 : candidate;
        }
        return queueIndex;
      }
      if (shuffle) {
        return Math.floor(Math.random() * queue.length);
      }
      const candidate = nextIdx + 1;
      if (candidate >= queue.length) {
        return repeat === 'all' ? 0 : -1;
      }
      return candidate;
    };
    if (repeat === 'one') {
      nextIdx = queue[queueIndex]?.playbackError
        ? queueIndex + 1
        : queueIndex;
      if (nextIdx >= queue.length) return;
    } else if (shuffle) {
      nextIdx = Math.floor(Math.random() * queue.length);
    } else {
      nextIdx = queueIndex + 1;
      if (nextIdx >= queue.length) {
        if (repeat === 'all') nextIdx = 0;
        else return;
      }
    }
    while (queue[nextIdx]?.playbackError && attempts < queue.length) {
      attempts += 1;
      nextIdx = pickNextIndex();
      if (nextIdx < 0) return;
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
    const { queue, queueIndex } = get();
    if (queue.length === 0) return;
    const prevIdx = queueIndex > 0 ? queueIndex - 1 : 0;
    if (prevIdx === queueIndex) {
      set({ progress: 0 });
      window.dispatchEvent(new CustomEvent('noctune:seek', { detail: 0 }));
      return;
    }
    await get().playTrack(queue[prevIdx], queue);
  },

  toggleShuffle: () => set(s => ({ shuffle: !s.shuffle })),
  cycleRepeat: () =>
    set(s => ({ repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off' })),

  addToQueue: (track, source = 'manual') =>
    set(s => ({ queue: [...s.queue, { ...track, queueSource: source }] })),

  removeFromQueue: (index) =>
    set((s) => {
      if (index < 0 || index >= s.queue.length) return s;
      const nextQueue = s.queue.filter((_, i) => i !== index);
      let nextQueueIndex = s.queueIndex;
      if (index < s.queueIndex) nextQueueIndex = s.queueIndex - 1;
      if (index === s.queueIndex) nextQueueIndex = Math.min(index, nextQueue.length - 1);
      if (nextQueue.length === 0) nextQueueIndex = -1;
      return { queue: nextQueue, queueIndex: nextQueueIndex };
    }),

  removePlayedTracks: () =>
    set((s) => {
      if (s.queueIndex <= 0) return s;
      return {
        queue: s.queue.slice(s.queueIndex),
        queueIndex: 0,
      };
    }),

  shuffleQueue: () =>
    set((s) => {
      if (s.queue.length <= 2) return s;
      const current = s.queue[s.queueIndex];
      const upcoming = s.queue
        .filter((_, index) => index !== s.queueIndex && index > s.queueIndex)
        .sort(() => Math.random() - 0.5);
      const previous = s.queue.filter((_, index) => index < s.queueIndex);
      if (!current) return { queue: [...previous, ...upcoming], queueIndex: previous.length };
      return {
        queue: [...previous, current, ...upcoming],
        queueIndex: previous.length,
      };
    }),

  markTrackUnavailable: (trackId, message = 'Unavailable') => {
    let failedTitle = '';
    set((s) => ({
      isLoading: false,
      queue: s.queue.map((track) =>
        track.id === trackId
          ? (failedTitle = track.title, { ...track, playbackError: message })
          : track
      ),
    }));
    const state = get();
    if (state.currentTrack?.id === trackId) {
      const currentIndex = state.queue.findIndex((track) => track.id === trackId);
      if (currentIndex >= 0 && currentIndex < state.queue.length - 1) {
        set({ playbackNotice: `Skipped "${failedTitle || state.currentTrack.title}" because playback failed.` });
        window.setTimeout(() => {
          get().next();
        }, 150);
      }
    }
  },

  dismissPlaybackNotice: () => set({ playbackNotice: null }),

  reorderQueue: (fromIndex, toIndex) =>
    set((s) => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= s.queue.length ||
        toIndex >= s.queue.length
      ) {
        return s;
      }

      const nextQueue = [...s.queue];
      const [moved] = nextQueue.splice(fromIndex, 1);
      nextQueue.splice(toIndex, 0, moved);

      let nextQueueIndex = s.queueIndex;
      if (s.queueIndex === fromIndex) {
        nextQueueIndex = toIndex;
      } else if (fromIndex < s.queueIndex && toIndex >= s.queueIndex) {
        nextQueueIndex = s.queueIndex - 1;
      } else if (fromIndex > s.queueIndex && toIndex <= s.queueIndex) {
        nextQueueIndex = s.queueIndex + 1;
      }

      return { queue: nextQueue, queueIndex: nextQueueIndex };
    }),

  clearQueue: () => set({ queue: [], queueIndex: -1 }),

  toggleTrackDetails: () => set((s) => ({ showTrackDetails: !s.showTrackDetails })),

  toggleShortcutsHelp: () => set((s) => ({ showShortcutsHelp: !s.showShortcutsHelp })),

  setView: (view, id) =>
    set({
      activeView: view,
      activePlaylistId: view === 'playlist' ? (id ?? null) : null,
      activeArtistId: view === 'artist' ? (id ?? null) : null,
      activeAlbumId: view === 'album' ? (id ?? null) : null,
    }),
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
