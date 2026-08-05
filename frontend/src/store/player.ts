import { create } from 'zustand';
import type { CachedTrack, PersonalMix, Track } from '../utils/api';
import { api } from '../utils/api';

export type RepeatMode = 'off' | 'all' | 'one';

const AUTOQUEUE_TOP_UP_THRESHOLD = 5;
const AUTOQUEUE_TOP_UP_LIMIT = 10;

function recordPlaybackHistory(track: Track): void {
  const now = Date.now();
  const optimisticTrack = {
    ...track,
    cachedAt: (track as CachedTrack).cachedAt ?? now,
    playCount: ((track as CachedTrack).playCount ?? 0) + 1,
    lastPlayed: now,
  } as CachedTrack;
  window.dispatchEvent(new CustomEvent('noctune:history-updated', {
    detail: { track: optimisticTrack, optimistic: true },
  }));
  void api.recordPlayed(track)
    .then(() => window.dispatchEvent(new CustomEvent('noctune:history-updated', {
      detail: { optimistic: false },
    })))
    .catch((err) => console.warn('[player] record history failed:', err));
}

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
  playbackRate: number;       // 0.5–2.0
  sleepTimerEnd: number | null; // timestamp ms
  crossfadeDuration: number;  // seconds, 0 = off

  // ── Queue
  queue: Track[];
  queueIndex: number;     // index of currentTrack in queue
  isAutoQueueLoading: boolean;

  // ── Queue History (persisted locally)
  queueHistory: Array<{ track: Track; playedAt: number }>;

  // ── UI ──────────────────────────────────────────────────────────────────────
  activeView: 'home' | 'player' | 'search' | 'history' | 'playlist' | 'queue' | 'settings' | 'artist' | 'album' | 'debug' | 'stats' | 'local-files';
  activePlaylistId: string | null;
  activePersonalMix: PersonalMix | null;
  personalMixesMap: Record<string, PersonalMix>;
  activeArtistId: string | null;
  activeAlbumId: string | null;
  showTrackDetails: boolean;
  showShortcutsHelp: boolean;
  sidebarCompact: boolean;
  playbackNotice: string | null;

  toggleSidebarCompact: () => void;

  // ── Equalizer ──────────────────────────────────────────────────────────────
  eqEnabled: boolean;
  eqBands: number[];     // 10 gains, range -6 to +6
  eqPreset: string;

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
  playNext: (track: Track) => void;
  addToQueue: (track: Track, source?: Track['queueSource']) => void;
  topUpQueue: () => Promise<void>;
  removeFromQueue: (index: number) => void;
  removePlayedTracks: () => void;
  shuffleQueue: () => void;
  markTrackUnavailable: (trackId: string, message?: string) => void;
  dismissPlaybackNotice: () => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;
  toggleTrackDetails: () => void;
  toggleShortcutsHelp: () => void;
  setPlaybackRate: (rate: number) => void;
  setSleepTimer: (minutes: number | null) => void;
  setCrossfadeDuration: (seconds: number) => void;
  setView: (view: PlayerState['activeView'], id?: string) => void;
  openPersonalMix: (mix: PersonalMix) => void;
  setLoading: (v: boolean) => void;
  setIsPlaying: (v: boolean) => void;

  // ── Equalizer Actions ──────────────────────────────────────────────────────
  setEqEnabled: (v: boolean) => void;
  setEqBand: (index: number, value: number) => void;
  setEqBands: (bands: number[], preset?: string) => void;
  resetEq: () => void;
  saveQueueState: () => void;
  restoreQueueState: () => void;
  pushQueueHistory: (track: Track) => void;

  // ── Lyrics Offset ─────────────────────────────────────────────────────────
  lyricsOffsets: Record<string, number>;
  setTrackLyricsOffset: (trackId: string, offset: number) => void;
  getTrackLyricsOffset: (trackId?: string) => number;
}

function loadInitialLyricsOffsets(): Record<string, number> {
  try {
    const raw = localStorage.getItem('noctune:lyrics-offsets');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
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
  playbackRate: 1,
  sleepTimerEnd: null,
  crossfadeDuration: 0,
  eqEnabled: false,
  eqBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  eqPreset: 'flat',
  lyricsOffsets: loadInitialLyricsOffsets(),

  setTrackLyricsOffset: (trackId: string, offset: number) => {
    set((s) => {
      const next = { ...s.lyricsOffsets, [trackId]: offset };
      try {
        localStorage.setItem('noctune:lyrics-offsets', JSON.stringify(next));
      } catch (e) {
        console.warn('[player] Failed to save lyrics offsets:', e);
      }
      return { lyricsOffsets: next };
    });
  },

  getTrackLyricsOffset: (trackId?: string) => {
    if (!trackId) return 0;
    return get().lyricsOffsets[trackId] ?? 0;
  },
  queue: [],
  queueIndex: -1,
  isAutoQueueLoading: false,
  queueHistory: [],
  activeView: 'home',
  activePlaylistId: null,
  activePersonalMix: null,
  personalMixesMap: {},
  activeArtistId: null,
  activeAlbumId: null,
  showTrackDetails: true,
  showShortcutsHelp: false,
  sidebarCompact: Boolean(localStorage.getItem('noctune:sidebar-compact') === 'true'),
  playbackNotice: null,

  toggleSidebarCompact: () =>
    set((s) => {
      const next = !s.sidebarCompact;
      try {
        localStorage.setItem('noctune:sidebar-compact', String(next));
      } catch {}
      return { sidebarCompact: next };
    }),

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

  // ── Equalizer ──────────────────────────────────────────────────────────────
  setEqEnabled: (v) => set({ eqEnabled: v }),
  setEqBand: (index, value) => set((s) => {
    const next = [...s.eqBands];
    next[index] = Math.min(6, Math.max(-6, value));
    return { eqBands: next, eqPreset: 'custom' };
  }),
  setEqBands: (bands, preset) => set({
    eqBands: bands.map((v) => Math.min(6, Math.max(-6, v))),
    eqPreset: preset ?? 'custom',
  }),
  resetEq: () => set({
    eqEnabled: false,
    eqBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    eqPreset: 'flat',
  }),

  playTrack: async (track, newQueue, options) => {
    const startedAt = performance.now();
    const queue = newQueue ?? get().queue;
    const idx = queue.findIndex(t => t.id === track.id);
    const source = options?.queueSource ?? track.queueSource ?? 'search';
    const initialTrack = {
      ...track,
      queueSource: source,
      originalSource: track.originalSource ?? (source === 'history' ? undefined : source),
    };

    // Optimistically show Mini Player immediately with loading animation
    set({
      currentTrack: initialTrack as any,
      isLoading: true,
      queue: queue.length > 0 ? queue : [initialTrack],
      queueIndex: idx >= 0 ? idx : 0,
    });
    // Record the click immediately; playback resolution must not gate history.
    recordPlaybackHistory(initialTrack);

    console.info('[player] playTrack start', {
      id: track.id,
      title: track.title,
      queueIndex: idx,
      queueLength: queue.length,
    });
    void api.lyrics(track).catch((err) => console.warn('[player] lyrics prefetch failed:', err));

    try {
      // Short-circuit resolution for local tracks to avoid network/loading
      if (track.id.startsWith('local:')) {
        const playableTrack = {
          id: track.id,
          title: track.title,
          artist: track.artist || 'Unknown Artist',
          album: track.album || '',
          duration: track.duration || 0,
          thumbnail: track.thumbnail || '',
          query: track.query || track.title,
          audioUrl: `/player/stream/${track.id}`,
          audioUrlExpiry: Date.now() + 86400000,
          audioQualityPreference: 'high',
          audioFormat: (track as any).format || undefined,
          audioQuality: 'local',
          localAudioPath: undefined,
          cachedAt: Date.now(),
          playCount: 0,
          source: 'local' as const,
          queueSource: track.queueSource,
        } as any;

        const source = options?.queueSource ?? track.queueSource ?? 'manual';
        playableTrack.queueSource = source;
        playableTrack.originalSource = track.originalSource ?? (source === 'history' ? undefined : source);
        playableTrack.originalPlaylistId = track.originalPlaylistId;
        playableTrack.originalPlaylistName = track.originalPlaylistName;

        set({
          currentTrack: playableTrack,
          isPlaying: true,
          progress: 0,
          queue: queue.map((queuedTrack) => queuedTrack.id === track.id ? ({ ...track, queueSource: source }) : queuedTrack),
          queueIndex: idx,
        });

        // Persist and push history without waiting for backend resolve
        get().saveQueueState();
        get().pushQueueHistory(playableTrack);

        // Fetch missing metadata (thumbnail) for local track in background
        (async () => {
          try {
            const meta = await api.getLocalFile(track.id);
            if (meta?.thumbnail) {
              set((s) => ({
                currentTrack: { ...(s.currentTrack as any), thumbnail: meta.thumbnail },
                queue: s.queue.map((q) => (q.id === track.id ? { ...q, thumbnail: meta.thumbnail } : q)),
              }));
            }
          } catch (err) {
            console.warn('[player] failed to fetch local metadata:', err);
          }
        })();

        // Trigger prefetch for next tracks as before
        const shouldAutoQueue = options?.autoQueue ?? false;
        if (shouldAutoQueue) {
          try {
            const excludeIds = [...queue.map(t => t.id), track.spotifyId ?? '', track.youtubeId ?? '']
              .filter(Boolean);
            const recs = await api.recommend(track, excludeIds, 12);
            const playbackQueue = [
              { ...track, queueSource: source },
              ...recs.tracks.map((recommendedTrack) => ({ ...recommendedTrack, queueSource: 'autoqueue' as const })),
            ];
            set({ queue: playbackQueue, queueIndex: 0 });
          } catch (err) {
            console.warn('[player] autoqueue failed (local track), keeping current queue:', err);
          }
        }

        // done for local track
        return;
      }

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
        artistId: track.artistId ?? resolved.artistId,
        albumId: track.albumId,
        youtubeId: track.youtubeId ?? resolved.id,
        youtubeTitle: track.youtubeTitle,
        youtubeArtist: track.youtubeArtist,
        queueSource: track.queueSource,
      };
      const source = options?.queueSource ?? track.queueSource ?? 'search';
      playableTrack.queueSource = source;
      playableTrack.originalSource = track.originalSource ?? (source === 'history' ? undefined : source);
      playableTrack.originalPlaylistId = track.originalPlaylistId;
      playableTrack.originalPlaylistName = track.originalPlaylistName;
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
        progress: 0,
        queue: playbackQueue,
        queueIndex: playbackIndex,
      });

      // Persist queue state and track history
      get().saveQueueState();
      get().pushQueueHistory(playableTrack);

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
    await get().topUpQueue();
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

  playNext: (track) => {
    set(s => {
      const insertAt = Math.max(0, s.queueIndex) + 1;
      const newQueue = [...s.queue];
      newQueue.splice(insertAt, 0, { ...track, queueSource: 'play-next' });
      return { queue: newQueue };
    });
    get().saveQueueState();
  },

  addToQueue: (track, source = 'manual') => {
    set(s => ({ queue: [...s.queue, { ...track, queueSource: source }] }));
    get().saveQueueState();
  },

  topUpQueue: async () => {
    const state = get();
    if (state.isAutoQueueLoading || !state.currentTrack || state.queue.length === 0 || state.queueIndex < 0) {
      return;
    }

    const upcomingCount = state.queue.length - state.queueIndex - 1;
    if (upcomingCount > AUTOQUEUE_TOP_UP_THRESHOLD) {
      return;
    }

    const seed = state.queue[state.queueIndex] ?? state.currentTrack;
    const existingIds = new Set(
      state.queue
        .flatMap((track) => [track.id, track.spotifyId ?? '', track.youtubeId ?? ''])
        .filter(Boolean)
    );

    set({ isAutoQueueLoading: true });
    try {
      const excludeIds = [...existingIds];
      let candidates = (await api.recommend(seed, excludeIds, AUTOQUEUE_TOP_UP_LIMIT)).tracks;

      if (candidates.length === 0) {
        const personal = await api.nightlyMixes(1, AUTOQUEUE_TOP_UP_LIMIT);
        candidates = personal.mixes[0]?.tracks ?? [];
      }

      const additions = candidates
        .filter((track) => !existingIds.has(track.id) && !existingIds.has(track.spotifyId ?? '') && !existingIds.has(track.youtubeId ?? ''))
        .slice(0, AUTOQUEUE_TOP_UP_LIMIT)
        .map((track) => ({ ...track, queueSource: 'autoqueue' as const }));

      if (additions.length === 0) return;

      set((current) => ({
        queue: [...current.queue, ...additions],
      }));

      api.prefetchTracks(additions.slice(0, 5)).catch(() => {});
      console.info('[player] autoqueue top-up done', {
        seed: `${seed.title} - ${seed.artist}`,
        added: additions.length,
        next: additions.slice(0, 5).map((track) => `${track.title} - ${track.artist}`),
      });
    } catch (err) {
      console.warn('[player] autoqueue top-up failed:', err);
    } finally {
      set({ isAutoQueueLoading: false });
    }
  },

  removeFromQueue: (index) => {
    set((s) => {
      if (index < 0 || index >= s.queue.length) return s;
      const nextQueue = s.queue.filter((_, i) => i !== index);
      let nextQueueIndex = s.queueIndex;
      if (index < s.queueIndex) nextQueueIndex = s.queueIndex - 1;
      if (index === s.queueIndex) nextQueueIndex = Math.min(index, nextQueue.length - 1);
      if (nextQueue.length === 0) nextQueueIndex = -1;
      return { queue: nextQueue, queueIndex: nextQueueIndex };
    });
    get().saveQueueState();
  },

  removePlayedTracks: () => {
    set((s) => {
      if (s.queueIndex <= 0) return s;
      return {
        queue: s.queue.slice(s.queueIndex),
        queueIndex: 0,
      };
    });
    get().saveQueueState();
  },

  shuffleQueue: () => {
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
    });
    get().saveQueueState();
  },

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

  reorderQueue: (fromIndex, toIndex) => {
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
    });
    get().saveQueueState();
  },

  clearQueue: () => {
    set({ queue: [], queueIndex: -1 });
    get().saveQueueState();
  },

  toggleTrackDetails: () => set((s) => ({ showTrackDetails: !s.showTrackDetails })),

  toggleShortcutsHelp: () => set((s) => ({ showShortcutsHelp: !s.showShortcutsHelp })),

  setPlaybackRate: (rate) => set({ playbackRate: Math.min(2, Math.max(0.5, rate)) }),
  setSleepTimer: (minutes) => set({
    sleepTimerEnd: minutes ? Date.now() + minutes * 60_000 : null,
  }),
  setCrossfadeDuration: (seconds) => set({ crossfadeDuration: Math.min(12, Math.max(0, seconds)) }),

  setView: (view, id) =>
    set((state) => {
      const isNightly = view === 'playlist' && id?.startsWith('nightly:');
      const mixId = isNightly ? id!.replace(/^nightly:/, '') : null;
      const mix = mixId
        ? (state.personalMixesMap[mixId] || (state.activePersonalMix && state.activePersonalMix.id === mixId ? state.activePersonalMix : null))
        : null;

      return {
        activeView: view,
        activePlaylistId: view === 'playlist' ? (id ?? null) : null,
        activePersonalMix: mix,
        activeArtistId: view === 'artist' ? (id ?? null) : null,
        activeAlbumId: view === 'album' ? (id ?? null) : null,
      };
    }),

  openPersonalMix: (mix) =>
    set((state) => ({
      activeView: 'playlist',
      activePlaylistId: `nightly:${mix.id}`,
      activePersonalMix: mix,
      personalMixesMap: { ...state.personalMixesMap, [mix.id]: mix },
      activeArtistId: null,
      activeAlbumId: null,
    })),

  saveQueueState: () => {
    const { queue, queueIndex } = get();
    try {
      const serializable = queue.map((t) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        album: t.album,
        duration: t.duration,
        thumbnail: t.thumbnail,
        query: t.query,
        spotifyId: t.spotifyId,
        spotifyUrl: t.spotifyUrl,
        artistId: t.artistId,
        albumId: t.albumId,
        youtubeId: t.youtubeId,
        youtubeTitle: t.youtubeTitle,
        youtubeArtist: t.youtubeArtist,
        queueSource: t.queueSource,
        originalSource: t.originalSource,
        originalPlaylistId: t.originalPlaylistId,
        originalPlaylistName: t.originalPlaylistName,
        playbackError: t.playbackError,
      }));
      localStorage.setItem('noctune:queue', JSON.stringify({ queue: serializable, queueIndex }));
    } catch (e) {
      console.warn('[player] Failed to save queue state:', e);
    }
  },

  restoreQueueState: () => {
    try {
      const saved = localStorage.getItem('noctune:queue');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.queue) && parsed.queue.length > 0) {
          set({ queue: parsed.queue, queueIndex: parsed.queueIndex ?? -1 });
        }
      }
      // Also restore queue history
      const historySaved = localStorage.getItem('noctune:queue-history');
      if (historySaved) {
        const parsed = JSON.parse(historySaved);
        if (Array.isArray(parsed)) {
          set({ queueHistory: parsed.slice(0, 50) });
        }
      }
    } catch (e) {
      console.warn('[player] Failed to restore queue state:', e);
    }
  },

  pushQueueHistory: (track) => {
    const history = get().queueHistory;
    const entry = { track, playedAt: Date.now() };
    const updated = [entry, ...history].slice(0, 50);
    set({ queueHistory: updated });
    try {
      localStorage.setItem('noctune:queue-history', JSON.stringify(updated));
    } catch (e) {
      console.warn('[player] Failed to save queue history:', e);
    }
  },

}));

// Restore persisted queue state on app boot
usePlayerStore.getState().restoreQueueState();

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
