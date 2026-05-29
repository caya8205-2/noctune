// In production Tauri builds the Vite proxy doesn't exist, so we call the backend directly.
const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const BASE = IS_TAURI ? 'http://127.0.0.1:3131' : '/api';
export const API_BASE = BASE;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  if (options?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  });
  const text = await res.text();

  if (!res.ok) {
    let err: { message?: string; error?: string } = {};
    try {
      err = text ? JSON.parse(text) : {};
    } catch {
      err = { message: text };
    }
    throw new Error(err.message ?? err.error ?? res.statusText ?? `HTTP ${res.status}`);
  }

  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export const api = {
  search: (q: string, limit = 10) =>
    request<{ fromCache: boolean; query: string; tracks: Track[] }>(
      `/search?q=${encodeURIComponent(q)}&limit=${limit}`
    ),
  debugMatch: (track: Track, limit = 10) =>
    request<DebugMatchResult>(
      `/search/debug-match?title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist)}&duration=${track.duration}&spotifyId=${encodeURIComponent(track.spotifyId ?? '')}&thumbnail=${encodeURIComponent(track.thumbnail ?? '')}&limit=${limit}`
    ),

  home: () =>
    request<{ playlists: Playlist[]; recentTracks: CachedTrack[]; newReleases: Track[] }>('/home'),
  history: () =>
    request<{ tracks: CachedTrack[] }>('/history'),
  clearHistory: () =>
    request<{ ok: boolean; history: { updated: number } }>('/history', { method: 'DELETE' }),
  removeHistoryItem: (id: string) =>
    request<{ ok: boolean; removed: boolean }>(`/history/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  status: () =>
    request<BackendStatus>('/status'),
  spotifyMetadata: (spotifyId: string) =>
    request<SpotifyTrackMetadata>(`/metadata/track/${encodeURIComponent(spotifyId)}`),

  resolve: (videoId: string, query?: string) =>
    request<CachedTrack>(`/player/resolve/${videoId}${query ? `?query=${encodeURIComponent(query)}` : ''}`),
  recordPlayed: (track: Track) =>
    request<{ ok: boolean; track: CachedTrack }>('/player/played', {
      method: 'POST',
      body: JSON.stringify(track),
    }),

  prefetch: (videoIds: string[]) =>
    request('/player/prefetch', { method: 'POST', body: JSON.stringify({ videoIds }) }),

  prefetchTracks: (tracks: Track[]) =>
    request('/player/prefetch', { method: 'POST', body: JSON.stringify({ tracks }) }),
  audioCacheStatus: (tracks: Track[]) =>
    request<AudioCacheStatus>('/player/cache-audio/status', {
      method: 'POST',
      body: JSON.stringify({ tracks }),
    }),
  cacheAudioTracks: (tracks: Track[]) =>
    request<{ scheduled: string[]; cachedIds: string[]; message: string }>('/player/cache-audio', {
      method: 'POST',
      body: JSON.stringify({ tracks }),
    }),
  clearResolverBlacklist: () =>
    request<{ ok: boolean; blacklist: { cleared: number } }>('/settings/resolver-blacklist', { method: 'DELETE' }),
  clearResolverMatchCache: () =>
    request<{ ok: boolean; matchCache: { cleared: number } }>('/settings/resolver-match-cache', { method: 'DELETE' }),

  recommend: (seed: Track, excludeIds: string[] = [], limit = 12) =>
    request<{ seed: Track; tracks: Track[] }>('/queue/recommend', {
      method: 'POST',
      body: JSON.stringify({ seed, excludeIds, limit }),
    }),

  lyrics: (track: Track) =>
    request<LyricsResult | undefined>(
      `/lyrics?title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist)}&duration=${track.duration}`
    ).then((lyrics) => lyrics ?? null),

  getPlaylists: () => request<Playlist[]>('/playlists'),
  getLiked: () => request<Playlist>('/library/liked'),
  toggleLike: (track: Track) =>
    request<{ liked: boolean; playlist: Playlist }>('/library/liked/toggle', {
      method: 'POST',
      body: JSON.stringify(track),
    }),
  createPlaylist: (name: string) =>
    request<Playlist>('/playlists', { method: 'POST', body: JSON.stringify({ name }) }),
  getPlaylist: (id: string) => request<Playlist>(`/playlists/${id}`),
  updatePlaylist: (id: string, data: { name?: string; coverDataUrl?: string | null }) =>
    request<{ ok: boolean; playlist: Playlist }>(`/playlists/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  importPlaylist: (url: string, name?: string) =>
    request<{ ok: boolean; playlist: Playlist; imported: number }>('/playlists/import', {
      method: 'POST',
      body: JSON.stringify({ url, name }),
    }),
  deletePlaylist: (id: string) =>
    request<{ ok: boolean }>(`/playlists/${id}`, { method: 'DELETE' }),
  addTrack: (playlistId: string, trackId: string) =>
    request<{ ok: boolean; added: boolean }>(`/playlists/${playlistId}/tracks`, { method: 'POST', body: JSON.stringify({ trackId }) }),
  addTrackToPlaylist: (playlistId: string, track: Track) =>
    request<{ ok: boolean; added: boolean }>(`/playlists/${playlistId}/tracks`, { method: 'POST', body: JSON.stringify(track) }),
  reorderPlaylistTracks: (playlistId: string, fromIndex: number, toIndex: number) =>
    request<{ ok: boolean }>('/playlists/' + playlistId + '/tracks/reorder', {
      method: 'PATCH',
      body: JSON.stringify({ fromIndex, toIndex }),
    }),

  removeTrack: (playlistId: string, trackId: string) =>
    request(`/playlists/${playlistId}/tracks/${trackId}`, { method: 'DELETE' }),
};

// ── Types (shared with backend, redeclared here to avoid cross-workspace imports) ──

export interface Track {
  id: string;
  title: string;
  artist: string;
  duration: number;
  thumbnail: string;
  query: string;
  spotifyId?: string;
  spotifyUrl?: string;
  youtubeId?: string;
  youtubeTitle?: string;
  youtubeArtist?: string;
  queueSource?: 'manual' | 'search' | 'playlist' | 'autoqueue' | 'recommendation';
  playbackError?: string;
}

export interface CachedTrack extends Track {
  audioUrl: string;
  audioUrlExpiry: number;
  localAudioPath?: string;
  cachedAt: number;
  playCount: number;
  lastPlayed?: number;
  source?: 'prefetch' | 'cache' | 'cache_refreshed' | 'resolved';
}

export interface Playlist {
  id: string;
  name: string;
  coverDataUrl?: string | null;
  createdAt: number;
  updatedAt: number;
  trackIds: string[];
  tracks?: Track[];
}

export interface LyricLine {
  time: number | null;
  text: string;
}

export interface LyricsResult {
  provider: 'lrclib';
  id: number;
  title: string;
  artist: string;
  album: string;
  duration: number;
  instrumental: boolean;
  synced: boolean;
  lines: LyricLine[];
}

export interface SpotifyTrackMetadata {
  id: string;
  title: string;
  artists: Array<{
    id: string;
    name: string;
    genres: string[];
    popularity?: number;
    followers?: number;
    image?: string;
    spotifyUrl?: string;
  }>;
  album: {
    id: string;
    name: string;
    type?: string;
    releaseDate?: string;
    totalTracks?: number;
    label?: string;
    image?: string;
    spotifyUrl?: string;
  };
  duration: number;
  explicit: boolean;
  popularity?: number;
  trackNumber?: number;
  discNumber?: number;
  isrc?: string;
  spotifyUrl?: string;
  cachedAt: number;
}

export interface AudioCacheStatus {
  playableIds: string[];
  cachedIds: string[];
  inFlightIds: string[];
  tracks: Array<{
    id: string;
    playableId: string | null;
    cached: boolean;
    inFlight: boolean;
  }>;
}

export interface BackendStatus {
  ok: boolean;
  cache: { total: number; totalQueries: number };
  prefetch: { queueSize: number; pending: number; inFlight: string[]; prefetched: string[] };
  resolver: { name: string; youtubei?: unknown; ytdlp?: unknown };
  playbackBlacklist?: { failedIds: number };
  matchCache?: { total: number };
}

export interface DebugMatchResult {
  query: string;
  cached: {
    spotifyId: string;
    youtubeId: string;
    youtubeTitle: string;
    youtubeArtist: string;
    score: number;
    matchedAt: number;
  } | null;
  candidates: Array<{
    track: Track;
    score: number;
    reasons: string[];
  }>;
}



