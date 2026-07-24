// Self-contained backend discovery + fetch helpers for the debug dashboard.
// Runs via `vite preview` (no dev proxy) so it must locate the backend itself.

const HOST = '127.0.0.1';
const PREFERRED_PORT = Number(import.meta.env.VITE_BACKEND_PORT ?? 3131);
const MAX_PORT_ATTEMPTS = Number(import.meta.env.VITE_BACKEND_PORT_ATTEMPTS ?? 10);

let cachedBase: string | null = null;

export async function discoverBackend(): Promise<string | null> {
  if (cachedBase) return cachedBase;
  for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt++) {
    const origin = `http://${HOST}:${PREFERRED_PORT + attempt}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 600);
    try {
      const res = await fetch(`${origin}/status`, { cache: 'no-store', signal: controller.signal });
      if (res.ok) {
        cachedBase = origin;
        return origin;
      }
    } catch {
      // try next port
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
}

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const base = await discoverBackend();
  if (!base) throw new Error('Backend not found on 127.0.0.1:3131-3140');
  const res = await fetch(`${base}${path}`, options);
  const text = await res.text();
  if (!res.ok) {
    let err: { message?: string; error?: string } = {};
    try { err = text ? JSON.parse(text) : {}; } catch { err = { message: text }; }
    throw new Error(err.message ?? err.error ?? `HTTP ${res.status}`);
  }
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DebugTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration: number;
  thumbnail: string;
  query: string;
  spotifyId?: string;
  youtubeId?: string;
  youtubeTitle?: string;
  youtubeArtist?: string;
}

export interface ScoredCandidate {
  track: DebugTrack;
  score: number;
  reasons: string[];
}

export interface MatchCacheEntry {
  spotifyId: string;
  spotifyTitle?: string;
  spotifyArtist?: string;
  youtubeId: string;
  youtubeTitle: string;
  youtubeArtist: string;
  score: number;
  matchedAt: number;
}

export interface QueryAttempt {
  query: string;
  fallbackIndex: number;
  candidateCount: number;
  best: ScoredCandidate | null;
  candidates: ScoredCandidate[];
}

export interface DebugMatchResult {
  queries: string[];
  cached: MatchCacheEntry | null;
  attempts: QueryAttempt[];
  accepted: ScoredCandidate | null;
  lastBest: ScoredCandidate | null;
  candidates: ScoredCandidate[];
}

export interface LearnedTrack extends DebugTrack {
  audioUrl?: string;
  audioUrlExpiry?: number;
  cachedAt?: number;
  playCount?: number;
  lastPlayed?: number;
  localAudioPath?: string | null;
  audioFormat?: string;
  audioQuality?: string;
  audioQualityPreference?: string;
  source?: string;
}

export interface ResolverSnapshot {
  spotifyId: string | null;
  youtubeId: string | null;
  matchCache: MatchCacheEntry | null;
  learned: LearnedTrack | null;
  audioCache: { cached: boolean };
  blacklist: { blacklisted: boolean };
  prefetch: { prefetched: boolean; prefetching: boolean };
}

export interface DebugStatus {
  cache: { total: number; totalQueries: number };
  prefetch: { queueSize: number; pending: number; inFlight: string[]; prefetched: string[] };
  resolver: { name: string; youtubei?: unknown; ytdlp?: unknown };
  playbackBlacklist: { failedIds: number };
  matchCache: { total: number };
  discordRpc: { enabled: boolean; ready: boolean };
  demoMode: boolean;
}

// ── API ───────────────────────────────────────────────────────────────────────

export const debugApi = {
  matcher: (params: { title: string; artist: string; duration: number; spotifyId?: string; limit?: number }) => {
    const q = new URLSearchParams({
      title: params.title,
      artist: params.artist,
      duration: String(params.duration),
      limit: String(params.limit ?? 12),
    });
    if (params.spotifyId) q.set('spotifyId', params.spotifyId);
    return req<DebugMatchResult>(`/debug/matcher?${q.toString()}`);
  },
  listCache: () => req<{ entries: MatchCacheEntry[]; total: number }>('/debug/cache'),
  clearAllCache: () => req<{ ok: boolean; cleared: number }>('/debug/cache', { method: 'DELETE' }),
  clearCacheEntry: (spotifyId: string) =>
    req<{ ok: boolean; cleared: number; youtubeId?: string }>(`/debug/cache/${encodeURIComponent(spotifyId)}`, { method: 'DELETE' }),
  status: () => req<DebugStatus>('/debug/status'),
  resolverSnapshot: (params: { spotifyId?: string; youtubeId?: string }) => {
    const q = new URLSearchParams();
    if (params.spotifyId) q.set('spotifyId', params.spotifyId);
    if (params.youtubeId) q.set('youtubeId', params.youtubeId);
    return req<ResolverSnapshot>(`/debug/resolver-snapshot?${q.toString()}`);
  },
  resolveAgain: (body: {
    spotifyId?: string;
    youtubeId?: string;
    title: string;
    artist: string;
    duration: number;
    thumbnail?: string;
    keepBlacklist?: boolean;
  }) =>
    req<{ ok: boolean; error?: string; resolved?: any; snapshot?: ResolverSnapshot }>(`/debug/resolve-again`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  clearTrack: (track: {
    id: string;
    title: string;
    artist: string;
    query: string;
    spotifyId?: string;
    youtubeId?: string;
  }) =>
    req<{ ok: boolean }>('/player/cache/clear-track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(track),
    }),
  blacklistMatch: (body: {
    youtubeId: string;
    spotifyId?: string;
    title?: string;
    artist?: string;
    targetTitle?: string;
    targetArtist?: string;
    matchedTitle?: string;
    matchedArtist?: string;
  }) =>
    req<{ ok: boolean; youtubeId: string; blacklisted: boolean; clearedMatch: number }>('/debug/blacklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  saveMatcherMatch: (body: {
    spotifyId?: string;
    youtubeId: string;
    youtubeTitle?: string;
    youtubeArtist?: string;
    spotifyTitle?: string;
    spotifyArtist?: string;
    score?: number;
  }) =>
    req<{ ok: boolean; entry: MatchCacheEntry; track: unknown }>('/debug/matcher/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  lyricsSnapshot: (params: { title: string; artist?: string; duration?: number }) => {
    const q = new URLSearchParams({ title: params.title });
    if (params.artist) q.set('artist', params.artist);
    if (params.duration) q.set('duration', String(params.duration));
    return req<{ key: string; query: { title: string; artist: string; duration: number }; cached: boolean; cachedAt: number | null; lyrics: any }>(
      `/debug/lyrics/snapshot?${q.toString()}`
    );
  },
  searchLyrics: (params: { title: string; artist?: string }) => {
    const q = new URLSearchParams({ title: params.title });
    if (params.artist) q.set('artist', params.artist);
    return req<{ candidates: any[]; count: number }>(`/debug/lyrics/search?${q.toString()}`);
  },
  saveLyrics: (body: { title: string; artist: string; duration: number; candidate: any }) =>
    req<{ ok: boolean; lyrics: any }>('/debug/lyrics/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  clearLyricsCache: (params: { title: string; artist?: string; duration?: number }) => {
    const q = new URLSearchParams({ title: params.title });
    if (params.artist) q.set('artist', params.artist);
    if (params.duration) q.set('duration', String(params.duration));
    return req<{ ok: boolean; cleared: boolean }>(`/debug/lyrics/cache?${q.toString()}`, { method: 'DELETE' });
  },
  listLyricsCache: () =>
    req<{ entries: Array<{ key: string; query: { title: string; artist: string; duration: number }; cachedAt: number; hasLyrics: boolean; synced: boolean; lineCount: number; provider: string; lyricsTitle: string; lyricsArtist: string }>; total: number }>('/debug/lyrics/cache/list'),
  listBlacklist: () =>
    req<{ entries: Array<{ videoId: string; failedAt: number; title?: string; artist?: string; targetTitle?: string; targetArtist?: string; matchedTitle?: string; matchedArtist?: string; expiresIn: number }>; total: number }>('/debug/blacklist/list'),
  clearBlacklistEntry: (videoId: string) =>
    req<{ ok: boolean; cleared: number }>(`/debug/blacklist/${encodeURIComponent(videoId)}`, { method: 'DELETE' }),
  clearAllBlacklist: () =>
    req<{ ok: boolean; cleared: number }>('/debug/blacklist', { method: 'DELETE' }),
  listAudioCache: () =>
    req<{ files: Array<{ videoId: string; filename: string; path: string; bytes: number; cachedAt: number; format: string }>; total: number }>('/debug/audio-cache/list'),
  clearAudioCacheEntry: (videoId: string) =>
    req<{ ok: boolean }>(`/debug/audio-cache/${encodeURIComponent(videoId)}`, { method: 'DELETE' }),
  getRequestLog: (limit = 100) =>
    req<{ entries: Array<{ id: number; method: string; url: string; statusCode: number; durationMs: number; timestamp: number; error?: string }>; total: number }>(`/debug/request-log?limit=${limit}`),
  clearRequestLog: () =>
    req<{ ok: boolean }>('/debug/request-log', { method: 'DELETE' }),
  getMlStatus: () =>
    req<{ ok: boolean; stats: { playLogCount: number; uniqueTracksCount: number; transitionPairsCount: number; lastTrainedAt: number; isReady: boolean; hasSeedModel: boolean; seedTrackCount: number } }>('/debug/ml/status'),
  importProdDataset: () =>
    req<{ ok: boolean; importedTracks: number; totalPlays: number; pathUsed: string }>('/debug/ml/import-prod', { method: 'POST' }),
  clearMlDataset: () =>
    req<{ ok: boolean; cleared: boolean; playLogCount: number }>('/debug/ml/dataset', { method: 'DELETE' }),
  submitMlTelemetry: (customUrl?: string) =>
    req<{ ok: boolean; id?: string; tracksCount: number; transitionsCount: number }>('/debug/ml/submit-telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customUrl }),
    }),
  importMlTelemetry: (payload: any) =>
    req<{ ok: boolean; importedTracks: number; importedTransitions: number; totalLogEvents: number }>('/debug/ml/import-telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload }),
    }),
  testMlRecommendation: (seed: any, limit = 10) =>
    req<{ ok: boolean; predictions: Array<{ track: any; transitionScore: number; metadataScore: number; playCountScore: number; recencyScore: number; nightBonus: number; totalScore: number }>; total: number }>('/debug/ml/test-recommendation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed, limit }),
    }),
};
