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
  candidates: ScoredCandidate[];
}

export interface MatchCacheEntry {
  spotifyId: string;
  youtubeId: string;
  youtubeTitle: string;
  youtubeArtist: string;
  score: number;
  matchedAt: number;
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
};
