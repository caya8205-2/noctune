// Core domain types for Muzikku backend

export interface Track {
  id: string;           // playable YouTube videoId
  title: string;
  artist: string;
  duration: number;     // seconds
  thumbnail: string;
  query: string;        // original search query that found this track
  spotifyId?: string;   // Spotify track ID (present when found via Spotify search)
  spotifyUrl?: string;  // Spotify track URL
  youtubeId?: string;   // matched YouTube videoId for Spotify-backed results
  youtubeTitle?: string;
  youtubeArtist?: string;
}

export interface CachedTrack extends Track {
  audioUrl: string;
  audioUrlExpiry: number;   // unix timestamp (ms) — YT URLs expire ~6h
  localAudioPath?: string;  // if downloaded locally
  cachedAt: number;
  playCount: number;
  lastPlayed?: number;
}

export interface CacheStore {
  version: number;
  updatedAt: number;
  tracks: Record<string, CachedTrack>;   // keyed by videoId
  queryIndex: Record<string, string>;     // query hash -> videoId
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

export interface QueueItem {
  track: Track;
  position: number;
  prefetched: boolean;
  prefetchedAt?: number;
}

export interface SearchResult {
  tracks: Track[];
  fromCache: boolean;
  query: string;
}

export interface PlaybackSession {
  currentTrack: CachedTrack | null;
  queue: QueueItem[];
  prefetchQueue: string[];  // videoIds being prefetched
}

export interface AudioStreamInfo {
  videoId: string;
  url: string;
  expiry: number;
  format: string;
  quality: string;
}
