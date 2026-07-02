// In production Tauri builds the Vite proxy doesn't exist, so we call the backend directly.
const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const WEB_API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';
const TAURI_BACKEND_HOST = import.meta.env.VITE_TAURI_BACKEND_HOST || '127.0.0.1';
const TAURI_BACKEND_PORT = Number(import.meta.env.VITE_TAURI_BACKEND_PORT || 3131);
const TAURI_BACKEND_PORT_ATTEMPTS = Number(import.meta.env.VITE_TAURI_BACKEND_PORT_ATTEMPTS || 10);
const normalizeBase = (base: string) => base.replace(/\/+$/, '');
const tauriBaseForPort = (port: number) => `http://${TAURI_BACKEND_HOST}:${port}`;
export const API_BASE = normalizeBase(IS_TAURI ? tauriBaseForPort(TAURI_BACKEND_PORT) : WEB_API_BASE);

let apiBasePromise: Promise<string | null> | null = null;

async function canReachBackend(base: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 450);
  try {
    const res = await fetch(`${base}/status`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!res.ok) return false;
    const status = (await res.json()) as {
      features?: { updates?: boolean; lyricsRomanization?: boolean; audioQualityPreference?: boolean };
    };
    return (
      status.features?.updates === true &&
      status.features?.lyricsRomanization === true &&
      status.features?.audioQualityPreference === true
    );
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function getApiBase(): Promise<string> {
  if (!IS_TAURI) return API_BASE;

  if (!apiBasePromise) {
    apiBasePromise = (async () => {
      for (let attempt = 0; attempt < TAURI_BACKEND_PORT_ATTEMPTS; attempt++) {
        const base = normalizeBase(tauriBaseForPort(TAURI_BACKEND_PORT + attempt));
        if (await canReachBackend(base)) return base;
      }
      return null;
    })();
  }

  const resolvedBase = await apiBasePromise;
  if (!resolvedBase) {
    apiBasePromise = null;
    return API_BASE;
  }

  return resolvedBase;
}

export async function apiUrl(path: string): Promise<string> {
  return `${await getApiBase()}${path}`;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  if (options?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${await getApiBase()}${path}`, {
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
  search: (q: string, limit = 25) =>
    request<{ fromCache: boolean; query: string; tracks: Track[] }>(
      `/search?q=${encodeURIComponent(q)}&limit=${limit}`
    ),

  home: () =>
    request<{ playlists: Playlist[]; recentTracks: CachedTrack[] }>('/home'),
  homeNewReleases: () =>
    request<{ newReleases: Track[] }>('/home/new-releases'),
  nightlyMixes: (limit = 4, tracks = 8) =>
    request<{ mixes: PersonalMix[] }>(`/home/nightly-mix?limit=${limit}&tracks=${tracks}`),
  history: () =>
    request<{ tracks: CachedTrack[] }>('/history'),
  clearHistory: () =>
    request<{ ok: boolean; history: { updated: number } }>('/history', { method: 'DELETE' }),
  removeHistoryItem: (id: string) =>
    request<{ ok: boolean; removed: boolean }>(`/history/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  status: () =>
    request<BackendStatus>('/status'),
  updateDiscordActivity: (activity: {
    track: Track | null;
    isPlaying: boolean;
    progress: number;
    duration: number;
  }) =>
    request<{ ok: boolean; enabled: boolean; ready: boolean }>('/rpc/activity', {
      method: 'POST',
      body: JSON.stringify(activity),
    }),
  clearDiscordActivity: () =>
    request<{ ok: boolean }>('/rpc/activity', { method: 'DELETE' }),
  spotifyMetadata: (spotifyId: string) =>
    request<SpotifyTrackMetadata>(`/metadata/track/${encodeURIComponent(spotifyId)}`),

  resolve: (videoId: string, query?: string, youtubeId?: string) => {
    const params = new URLSearchParams();
    if (query) params.set('query', query);
    if (youtubeId) params.set('youtubeId', youtubeId);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return request<CachedTrack>(`/player/resolve/${videoId}${suffix}`);
  },
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
  clearTrackCache: (track: Track) =>
    request<ClearTrackCacheResult>('/player/cache/clear-track', {
      method: 'POST',
      body: JSON.stringify(track),
    }),
  clearResolverBlacklist: () =>
    request<{ ok: boolean; blacklist: { cleared: number } }>('/settings/resolver-blacklist', { method: 'DELETE' }),
  clearResolverMatchCache: () =>
    request<{ ok: boolean; matchCache: { cleared: number } }>('/settings/resolver-match-cache', { method: 'DELETE' }),
  startDebugPreview: () =>
    request<{ ok: boolean; already: boolean }>('/debug/preview/start', { method: 'POST' }),
  stopDebugPreview: () =>
    request<{ ok: boolean; was_running: boolean }>('/debug/preview/stop', { method: 'POST' }),
  debugPreviewStatus: () =>
    request<{ running: boolean }>('/debug/preview/status'),
  checkForUpdates: (force = false) =>
    request<UpdateInfo>(`/updates/latest${force ? '?force=true' : ''}`),

  browseArtist: (artistId: string) =>
    request<ArtistView>(`/browse/artist/${encodeURIComponent(artistId)}`),
  browseAlbum: (albumId: string) =>
    request<AlbumView>(`/browse/album/${encodeURIComponent(albumId)}`),

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
  album?: string;
  duration: number;
  thumbnail: string;
  query: string;
  spotifyId?: string;
  spotifyUrl?: string;
  artistId?: string;   // Spotify artist ID for artist view navigation
  albumId?: string;    // Spotify album ID for album view navigation
  youtubeId?: string;
  youtubeTitle?: string;
  youtubeArtist?: string;
  queueSource?: 'manual' | 'search' | 'playlist' | 'autoqueue' | 'recommendation';
  playbackError?: string;
}

export interface CachedTrack extends Track {
  audioUrl: string;
  audioUrlExpiry: number;
  audioQualityPreference?: 'auto' | 'high';
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

export interface PersonalMix {
  id: string;
  name: string;
  description: string;
  cover: string;
  seed: Track;
  tracks: Track[];
}

export interface LyricLine {
  time: number | null;
  text: string;
  romanizedText?: string;
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
    prefetched: boolean;
    prefetching: boolean;
  }>;
}

export interface ClearTrackCacheResult {
  ok: boolean;
  ids: string[];
  learned: { tracks: number; queries: number };
  audio: { files: number; bytes: number };
  prefetch: { prefetched: number; inFlight: number };
  blacklist: { cleared: number };
  matchCache: { cleared: number; youtubeId?: string };
}

export interface UpdateInfo {
  ok: boolean;
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseName: string | null;
  releaseUrl: string;
  publishedAt: string | null;
  checkedAt: number;
  error?: string;
}

export interface BackendStatus {
  ok: boolean;
  cache: { total: number; totalQueries: number };
  prefetch: { queueSize: number; pending: number; inFlight: string[]; prefetched: string[] };
  resolver: { name: string; youtubei?: unknown; ytdlp?: unknown };
  playbackBlacklist?: { failedIds: number };
  matchCache?: { total: number };
  discordRpc?: { enabled: boolean; ready: boolean };
  features?: { updates?: boolean; lyricsRomanization?: boolean; audioQualityPreference?: boolean };
}

// ── Browse types ─────────────────────────────────────────────────────────────

export interface ArtistAlbum {
  id: string;
  name: string;
  type: string;
  releaseDate: string | null;
  totalTracks: number;
  image: string | null;
  spotifyUrl: string | null;
}

export interface ArtistView {
  id: string;
  name: string;
  genres: string[];
  popularity: number | null;
  followers: number | null;
  image: string | null;
  spotifyUrl: string | null;
  topTracks: Track[];
  albums: ArtistAlbum[];
}

export interface AlbumTrack extends Track {
  trackNumber: number;
  albumId: string;
}

export interface AlbumView {
  id: string;
  name: string;
  type: string;
  releaseDate: string | null;
  totalTracks: number;
  label: string | null;
  popularity: number | null;
  image: string | null;
  spotifyUrl: string | null;
  artists: Array<{ id: string; name: string }>;
  tracks: AlbumTrack[];
}