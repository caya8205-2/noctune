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

  home: () =>
    request<{ playlists: Playlist[]; recentTracks: CachedTrack[]; newReleases: Track[] }>('/home'),

  resolve: (videoId: string, query?: string) =>
    request<CachedTrack>(`/player/resolve/${videoId}${query ? `?query=${encodeURIComponent(query)}` : ''}`),

  prefetch: (videoIds: string[]) =>
    request('/player/prefetch', { method: 'POST', body: JSON.stringify({ videoIds }) }),

  prefetchTracks: (tracks: Track[]) =>
    request('/player/prefetch', { method: 'POST', body: JSON.stringify({ tracks }) }),

  recommend: (seed: Track, excludeIds: string[] = [], limit = 12) =>
    request<{ seed: Track; tracks: Track[] }>('/queue/recommend', {
      method: 'POST',
      body: JSON.stringify({ seed, excludeIds, limit }),
    }),

  getPlaylists: () => request<Playlist[]>('/playlists'),
  createPlaylist: (name: string) =>
    request<Playlist>('/playlists', { method: 'POST', body: JSON.stringify({ name }) }),
  getPlaylist: (id: string) => request<Playlist>(`/playlists/${id}`),
  importPlaylist: (url: string, name?: string) =>
    request<{ ok: boolean; playlist: Playlist; imported: number }>('/playlists/import', {
      method: 'POST',
      body: JSON.stringify({ url, name }),
    }),
  deletePlaylist: (id: string) =>
    request<{ ok: boolean }>(`/playlists/${id}`, { method: 'DELETE' }),
  addTrack: (playlistId: string, trackId: string) =>
    request(`/playlists/${playlistId}/tracks`, { method: 'POST', body: JSON.stringify({ trackId }) }),
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
  createdAt: number;
  updatedAt: number;
  trackIds: string[];
  tracks?: Track[];
}

