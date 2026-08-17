// Core domain types for Noctune backend

export type AudioQualityPreference = 'auto' | 'high';

export interface Track {
  id: string;           // playable YouTube videoId
  title: string;
  artist: string;
  album?: string;
  duration: number;     // seconds
  thumbnail: string;
  query: string;        // original search query that found this track
  spotifyId?: string;   // Spotify track ID (present when found via Spotify search)
  spotifyUrl?: string;  // Spotify track URL
  artistId?: string;    // Spotify artist ID or canonical YouTube channel reference
  albumId?: string;     // Spotify album ID
  youtubeId?: string;   // matched YouTube videoId for Spotify-backed results
  youtubeTitle?: string;
  youtubeArtist?: string;
  queueSource?: 'manual' | 'search' | 'playlist' | 'autoqueue' | 'recommendation' | 'play-next' | 'history';
  originalSource?: 'manual' | 'search' | 'playlist' | 'autoqueue' | 'recommendation' | 'play-next';
  originalPlaylistId?: string;
  originalPlaylistName?: string;
  genres?: string[];
}

export interface CachedTrack extends Track {
  audioUrl: string;
  audioUrlExpiry: number;   // unix timestamp (ms) — YT URLs expire ~6h
  audioQualityPreference?: AudioQualityPreference;
  audioFormat?: string;
  audioQuality?: string;
  resolverSource?: 'youtubei' | 'ytdlp' | 'local';
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
  qualityPreference: AudioQualityPreference;
  resolverSource?: 'youtubei' | 'ytdlp' | 'local';
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

export interface LyricsCacheEntry {
  query: {
    title: string;
    artist: string;
    duration: number;
  };
  lyrics: LyricsResult | null;
  cachedAt: number;
}

export interface LyricsCacheStore {
  version: number;
  updatedAt: number;
  entries: Record<string, LyricsCacheEntry>;
}
