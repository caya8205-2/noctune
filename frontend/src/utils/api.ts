let isTauriCached: boolean | null = null;

// Enhanced Tauri detection with multiple fallback checks
function detectTauriEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  if (isTauriCached !== null) return isTauriCached;
  
  // Primary check: __TAURI_INTERNALS__
  if ('__TAURI_INTERNALS__' in window) {
    console.log('[env] Tauri detected via __TAURI_INTERNALS__');
    isTauriCached = true;
    return true;
  }
  
  // Secondary check: __TAURI__ namespace (older versions)
  if ('__TAURI__' in window) {
    console.log('[env] Tauri detected via __TAURI__');
    isTauriCached = true;
    return true;
  }
  
  // Tertiary check: Tauri-specific user agent
  if (navigator.userAgent.includes('Tauri')) {
    console.log('[env] Tauri detected via user agent');
    isTauriCached = true;
    return true;
  }
  
  console.log('[env] Tauri NOT detected - running in web mode');
  isTauriCached = false;
  return false;
}

// Detect if we're in Tauri production build (not dev mode)
// In dev mode, Vite dev server is running and we should use the proxy
function isTauriProduction(): boolean {
  // In dev mode, Vite injects import.meta.env.DEV = true
  // In production build, import.meta.env.PROD = true
  return detectTauriEnvironment() && import.meta.env.PROD;
}

// IS_TAURI is true for both dev and prod Tauri
export const IS_TAURI = detectTauriEnvironment();

// In production Tauri builds the Vite proxy doesn't exist, so we call the backend directly.
// In dev mode (even Tauri dev), we use the Vite proxy at /api
const IS_TAURI_PROD = isTauriProduction();
const WEB_API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';
const TAURI_BACKEND_HOST = import.meta.env.VITE_TAURI_BACKEND_HOST || '127.0.0.1';
const TAURI_BACKEND_PORT = Number(import.meta.env.VITE_TAURI_BACKEND_PORT || 3131);
const TAURI_BACKEND_PORT_ATTEMPTS = Number(import.meta.env.VITE_TAURI_BACKEND_PORT_ATTEMPTS || 10);
const normalizeBase = (base: string) => base.replace(/\/+$/, '');
const tauriBaseForPort = (port: number) => `http://${TAURI_BACKEND_HOST}:${port}`;
export const API_BASE = normalizeBase(IS_TAURI_PROD ? tauriBaseForPort(TAURI_BACKEND_PORT) : WEB_API_BASE);

let apiBasePromise: Promise<string | null> | null = null;

export async function canReachBackend(base: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 600);
  try {
    const res = await fetch(`${base}/status`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!res.ok) return false;
    const status = (await res.json()) as {
      status?: string;
      features?: { updates?: boolean; lyricsRomanization?: boolean; audioQualityPreference?: boolean };
    };
    return status.status === 'ok' || Boolean(status.features);
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function getApiBase(): Promise<string> {
  // In pure web mode, use the static API_BASE (Vite proxy)
  if (!detectTauriEnvironment()) return API_BASE;

  if (!apiBasePromise) {
    apiBasePromise = (async () => {
      const preferredBase = normalizeBase(tauriBaseForPort(TAURI_BACKEND_PORT));
      const devPort = 3132;
      const devBase = normalizeBase(tauriBaseForPort(devPort));

      // In dev mode (Vite running on port 3132), try dev port and preferred port with retries
      if (!import.meta.env.PROD) {
        for (let retry = 0; retry < 8; retry++) {
          if (await canReachBackend(devBase)) return devBase;
          if (await canReachBackend(preferredBase)) return preferredBase;
          if (retry < 7) await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }

      // Try preferred production port 3131 with startup retries
      // pkg binary cold-start can take 3-5 seconds, so retry for ~6 seconds
      for (let retry = 0; retry < 15; retry++) {
        if (await canReachBackend(preferredBase)) return preferredBase;
        if (retry < 14) await new Promise((resolve) => setTimeout(resolve, 400));
      }

      // If occupied, scan ports 3131..3140
      for (let attempt = 0; attempt < TAURI_BACKEND_PORT_ATTEMPTS; attempt++) {
        const base = normalizeBase(tauriBaseForPort(TAURI_BACKEND_PORT + attempt));
        if (await canReachBackend(base)) return base;
      }

      // Fallback: check dev port 3132 if all else fails
      if (await canReachBackend(devBase)) return devBase;

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

export async function checkBackendStatus(): Promise<boolean> {
  const base = await getApiBase();
  return canReachBackend(base);
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
  nightlyMixes: (limit = 4, tracks = 20, force = false, mixId?: string) => {
    const params = new URLSearchParams({
      limit: String(limit),
      tracks: String(tracks),
    });
    if (force) params.set('force', 'true');
    if (mixId) params.set('mixId', mixId);
    return request<{ mixes: PersonalMix[] }>(`/home/nightly-mix?${params.toString()}`);
  },
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
  youtubeMetadata: async (videoId: string) => {
    const cleanId = videoId.replace(/^(youtube|ytdlp):/, '');
    if (detectTauriEnvironment()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const info = await invoke<{
          id: string;
          title: string;
          artist: string;
          artistId?: string;
          duration: number;
          thumbnail: string;
          youtubeId: string;
        }>('get_video_metadata', { videoId: cleanId });
        const channelCandidate = info.artistId?.trim();
        const artistId = channelCandidate
          ? (channelCandidate.startsWith('ytchannel:') ? channelCandidate : `ytchannel:${channelCandidate}`)
          : undefined;
        return {
          id: info.id,
          title: info.title,
          artist: info.artist,
          artistId,
          album: '',
          duration: info.duration,
          thumbnail: info.thumbnail,
          query: cleanId,
          youtubeId: info.youtubeId,
        } as Track;
      } catch (err) {
        console.warn('[api] Tauri get_video_metadata failed, falling back to server:', err);
      }
    }
    return request<Track>(`/metadata/youtube/${encodeURIComponent(cleanId)}`);
  },

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
  downloadTracks: (tracks: Track[]) =>
    request<{ ok: boolean; downloadDir: string; downloaded: Array<{ id: string; title: string; file: string }>; failed: Array<{ id: string; title: string; reason: string }>; message: string }>('/player/download-tracks', {
      method: 'POST',
      body: JSON.stringify({ tracks }),
    }),
  downloadArtwork: (imageUrl: string, title: string, artist: string) =>
    request<{ ok: boolean; file: string; downloadDir: string }>('/player/download-artwork', {
      method: 'POST',
      body: JSON.stringify({ imageUrl, title, artist }),
    }),
  getDiscoverWeekly: () =>
    request<{ generatedAt: number; tracks: Track[] }>('/player/discover-weekly'),
  refreshDiscoverWeekly: () =>
    request<{ generatedAt: number; tracks: Track[] }>('/player/discover-weekly/refresh', { method: 'POST' }),
  openDownloadDir: () =>
    request<{ ok: boolean; path: string }>('/settings/open-download-dir', { method: 'POST' }),
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

  browseArtist: async (artistId: string) => {
    const cleanId = artistId.replace(/:(videos|playlists)$/, '');
    if (detectTauriEnvironment() && (cleanId.startsWith('ytchannel:') || cleanId.startsWith('UC') || cleanId.startsWith('@'))) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<ArtistView>('get_youtube_channel', { channelId: cleanId });
      } catch (err) {
        console.warn('[api] Tauri get_youtube_channel failed, falling back to server:', err);
      }
    }
    return request<ArtistView>(`/browse/artist/${encodeURIComponent(cleanId)}`);
  },
  getChannelPosts: async (channelId: string, continuationToken?: string): Promise<ChannelPostsResult> => {
    if (detectTauriEnvironment()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<ChannelPostsResult>('get_channel_posts', {
          channelId,
          continuationToken: continuationToken ?? null,
        });
      } catch (err) {
        console.warn('[api] Tauri get_channel_posts failed:', err);
      }
    }
    return { posts: [], continuationToken: null };
  },
  browseAlbum: (albumId: string) =>
    request<AlbumView>(`/browse/album/${encodeURIComponent(albumId)}`),
  browseYoutubePlaylist: async (playlistId: string) => {
    if (detectTauriEnvironment()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<YouTubePlaylistView>('get_youtube_playlist', { playlistId });
      } catch (err) {
        console.warn('[api] Tauri get_youtube_playlist failed, falling back to server:', err);
      }
    }
    return request<YouTubePlaylistView>(`/browse/youtube-playlist/${encodeURIComponent(playlistId)}`);
  },

  recommend: (seed: Track, excludeIds: string[] = [], limit = 12, seeds?: Track[]) =>
    request<{ seed: Track; tracks: Track[] }>('/queue/recommend', {
      method: 'POST',
      body: JSON.stringify({ seed, excludeIds, limit, seeds }),
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
  reorderPlaylistTracks: (playlistId: string, fromIndex: number, toIndex: number) =>
    request<{ ok: boolean }>('/playlists/' + playlistId + '/tracks/reorder', {
      method: 'PATCH',
      body: JSON.stringify({ fromIndex, toIndex }),
    }),
  deletePlaylist: (id: string) =>
    request<{ ok: boolean }>(`/playlists/${id}`, { method: 'DELETE' }),
  addTrackToPlaylist: (playlistId: string, track: Track) =>
    request<{ ok: boolean; added: boolean }>(`/playlists/${playlistId}/tracks`, { method: 'POST', body: JSON.stringify(track) }),
  removeTrack: (playlistId: string, trackId: string) =>
    request(`/playlists/${playlistId}/tracks/${trackId}`, { method: 'DELETE' }),

  // Local files
  scanLocalFiles: async (path: string) => {
    if (detectTauriEnvironment()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const files = await invoke<LocalFile[]>('scan_local_folder', { folderPath: path });
        return {
          ok: true,
          scanned: files.length,
          failed: 0,
          importRoot: path,
          folderName: path.split(/[/\\]/).pop() || path,
        };
      } catch (err) {
        console.warn('[api] Tauri scan_local_folder failed, falling back to server:', err);
      }
    }
    return request<{
      ok: boolean;
      scanned: number;
      failed: number;
      importRoot: string;
      folderName: string;
    }>('/local-files/scan', {
      method: 'POST',
      body: JSON.stringify({ path }),
    });
  },
  getLocalFiles: async (limit = 50, offset = 0, importRoot?: string | null) => {
    if (detectTauriEnvironment()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const files = await invoke<LocalFile[]>('get_local_files', { folderPath: importRoot || undefined });
        return {
          files: files.slice(offset, offset + limit),
          total: files.length,
          limit,
          offset,
          importRoot: importRoot || null,
        };
      } catch (err) {
        console.warn('[api] Tauri get_local_files failed, falling back to server:', err);
      }
    }
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    if (importRoot !== undefined && importRoot !== null) {
      params.set('importRoot', importRoot);
    }
    return request<{
      files: LocalFile[];
      total: number;
      limit: number;
      offset: number;
      importRoot: string | null;
    }>(`/local-files/library?${params.toString()}`);
  },
  getLocalFolders: () =>
    request<{ folders: LocalFolder[]; total: number }>('/local-files/folders'),
  getLocalFile: (id: string) =>
    request<LocalFile>(`/local-files/${encodeURIComponent(id)}`),
  deleteLocalFile: (id: string) =>
    request<{ ok: boolean }>(`/local-files/${id}`, { method: 'DELETE' }),
  deleteLocalFolder: (folderPath: string) =>
    request<{ ok: boolean; deleted: number }>('/local-files/folder', {
      method: 'DELETE',
      body: JSON.stringify({ path: folderPath }),
    }),

  stats: {
    overview: (period: '7d' | '30d' | 'all' = 'all') =>
      request<StatsOverview>(`/stats/overview?period=${period}`),
    topTracks: (period: '7d' | '30d' | 'all' = 'all', limit = 20) =>
      request<StatsTopTrack[]>(`/stats/top-tracks?period=${period}&limit=${limit}`),
    topArtists: (period: '7d' | '30d' | 'all' = 'all', limit = 20) =>
      request<StatsTopArtist[]>(`/stats/top-artists?period=${period}&limit=${limit}`),
    daily: (days = 30) =>
      request<StatsDailyEntry[]>(`/stats/daily?days=${days}`),
  },

};

export async function resolveYouTubeChannelId(track: Track): Promise<string | undefined> {
  const isYouTubeTrack = Boolean(track.youtubeId || track.id.startsWith('youtube:') || track.id.startsWith('ytdlp:'));
  if (track.artistId && !track.artistId.startsWith('ytchannel:') && !isYouTubeTrack) return track.artistId;
  if (track.artistId) {
    const channelRef = track.artistId.replace(/^ytchannel:/, '').trim();
    if (/^UC[A-Za-z0-9_-]{22}$/.test(channelRef) || /^@[A-Za-z0-9._-]+$/.test(channelRef)) {
      return `ytchannel:${channelRef}`;
    }
  }
  if (track.spotifyId) {
    try {
      return (await api.spotifyMetadata(track.spotifyId)).artists[0]?.id;
    } catch (error) {
      console.warn('Spotify artist metadata unavailable:', error);
      return undefined;
    }
  }
  try {
    const youtubeId = track.youtubeId ?? track.id.replace(/^(youtube|ytdlp):/, '');
    const meta = await api.youtubeMetadata(youtubeId);
    if (!meta?.artistId) return undefined;
    const channelRef = meta.artistId.replace(/^ytchannel:/, '').trim();
    return (/^UC[A-Za-z0-9_-]{22}$/.test(channelRef) || /^@[A-Za-z0-9._-]+$/.test(channelRef))
      ? `ytchannel:${channelRef}`
      : meta.artistId;
  } catch (error) {
    console.warn('YouTube channel metadata unavailable:', error);
    return undefined;
  }
}

export function isValidYouTubeChannelId(value?: string): boolean {
  if (!value) return false;
  const channelRef = value.replace(/^ytchannel:/, '').trim();
  return /^UC[A-Za-z0-9_-]{22}$/.test(channelRef) || /^@[A-Za-z0-9._-]+$/.test(channelRef);
}

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
  queueSource?: 'manual' | 'search' | 'playlist' | 'autoqueue' | 'recommendation' | 'play-next' | 'history';
  originalSource?: 'manual' | 'search' | 'playlist' | 'autoqueue' | 'recommendation' | 'play-next';
  originalPlaylistId?: string;
  originalPlaylistName?: string;
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
    refreshed?: boolean;
    resolved?: boolean;
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
  followers: number | string | null;
  image: string | null;
  spotifyUrl: string | null;
  topTracks: Track[];
  albums: ArtistAlbum[];
  channelPlaylists?: Array<{ id: string; name: string; totalTracks: number; image: string | null; url: string }>;
}

export interface ChannelPost {
  id: string;
  authorName: string | null;
  authorAvatar: string | null;
  contentText: string;
  publishedTime: string | null;
  voteCount: string | null;
  commentCount: string | null;
  images: string[];
  videoId: string | null;
}

export interface ChannelPostsResult {
  posts: ChannelPost[];
  continuationToken: string | null;
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

export interface YouTubePlaylistView {
  id: string;
  name: string;
  image: string | null;
  tracks: Track[];
}

// ── Stats types ─────────────────────────────────────────────────────────────

export interface StatsOverview {
  totalPlays: number;
  totalMinutes: number;
  uniqueArtists: number;
  uniqueTracks: number;
}

export interface StatsTopTrack {
  track: Track;
  playCount: number;
  lastPlayed: number | undefined;
}

export interface StatsTopArtist {
  artist: string;
  artistId: string | null;
  image?: string | null;
  playCount: number;
  tracksCount: number;
}

export interface StatsDailyEntry {
  date: string; // YYYY-MM-DD
  playCount: number;
  minutes: number;
}

// ── Local Files types ────────────────────────────────────────────────────────

export interface LocalFile {
  id: string;
  path: string;
  directory: string;
  importRoot: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  thumbnail: string;
  trackNumber: number;
  year: number;
  genre: string;
  format: string;
  fileSize: number;
  addedAt: number;
  lastScanned: number;
}

export interface LocalFolder {
  path: string;
  name: string;
  trackCount: number;
  thumbnail: string;
  addedAt: number;
  totalDuration: number;
  isUngrouped: boolean;
}

/**
 * Robust check if a track matches the currently playing track.
 * Disambiguates YouTube video IDs so two different YouTube videos sharing
 * the same Spotify metadata ID are never both marked as active.
 */
export function isTrackActive(currentTrack: Track | null | undefined, track: Track): boolean {
  if (!currentTrack || !track) return false;

  const cleanCurrentId = (currentTrack.id || '').replace(/^(youtube|spotify|ytdlp|local):/, '').trim();
  const cleanTrackId = (track.id || '').replace(/^(youtube|spotify|ytdlp|local):/, '').trim();

  // 1. Direct ID match
  if (currentTrack.id === track.id || (cleanCurrentId && cleanCurrentId === cleanTrackId)) {
    return true;
  }

  // 2. Explicit YouTube Video ID comparison
  const currentYt = (
    currentTrack.youtubeId ||
    (currentTrack.id.startsWith('ytdlp:') || currentTrack.id.startsWith('youtube:') ? cleanCurrentId : '')
  ).trim();
  const trackYt = (
    track.youtubeId ||
    (track.id.startsWith('ytdlp:') || track.id.startsWith('youtube:') ? cleanTrackId : '')
  ).trim();

  if (currentYt && trackYt) {
    return currentYt === trackYt;
  }

  // 3. Spotify ID comparison (only if YouTube IDs didn't conflict)
  if (currentTrack.spotifyId && track.spotifyId && currentTrack.spotifyId === track.spotifyId) {
    return true;
  }

  return false;
}
