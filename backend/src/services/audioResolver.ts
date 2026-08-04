import type { AudioQualityPreference, AudioStreamInfo, Track } from '../types/index.js';
import { getEnvConfig } from './env.js';
import {
  getYoutubePlaylistTracks as youtubeiGetYoutubePlaylistTracks,
  getYoutubeTrack as youtubeiGetYoutubeTrack,
  getYoutubeiStatus,
  resolveAudioUrl as youtubeiResolveAudioUrl,
  resolveTrack as youtubeiResolveTrack,
  searchTracks as youtubeiSearchTracks,
} from './youtubei.js';

export type AudioResolverName = 'youtubei' | 'ytdlp';

export interface PlaylistImportResult {
  name: string;
  tracks: Track[];
}

export interface ResolvedTrackResult {
  track: Track;
  audio: AudioStreamInfo;
}

export interface AudioResolver {
  name: AudioResolverName;
  searchTracks(query: string, limit?: number): Promise<Track[]>;
  getYoutubeTrack(urlOrVideoId: string, originalQuery?: string): Promise<Track>;
  getYoutubePlaylistTracks(url: string, limit?: number): Promise<PlaylistImportResult>;
  resolveAudioUrl(videoId: string, preference?: AudioQualityPreference): Promise<AudioStreamInfo>;
  resolveTrack(videoId: string, originalQuery: string, preference?: AudioQualityPreference): Promise<ResolvedTrackResult>;
}

const youtubeiResolver: AudioResolver = {
  name: 'youtubei',
  searchTracks: youtubeiSearchTracks,
  getYoutubeTrack: youtubeiGetYoutubeTrack,
  getYoutubePlaylistTracks: youtubeiGetYoutubePlaylistTracks,
  resolveAudioUrl: youtubeiResolveAudioUrl,
  resolveTrack: youtubeiResolveTrack,
};

let ytdlpResolverPromise: Promise<AudioResolver> | null = null;
let ytdlpStatus: (() => unknown) | null = null;

async function getYtdlpResolver(): Promise<AudioResolver> {
  if (!ytdlpResolverPromise) {
    ytdlpResolverPromise = import('./ytdlp.js').then((module) => {
      ytdlpStatus = module.getYtdlpStatus;
      return {
        name: 'ytdlp',
        searchTracks: module.searchTracks,
        getYoutubeTrack: module.getYoutubeTrack,
        getYoutubePlaylistTracks: module.getYoutubePlaylistTracks,
        resolveAudioUrl: module.resolveAudioUrl,
        resolveTrack: module.resolveTrack,
      };
    });
  }
  return ytdlpResolverPromise;
}

export function getAudioResolver(): AudioResolver {
  return youtubeiResolver;
}

export function getAudioResolverStatus() {
  const resolver = getAudioResolver();
  return {
    name: resolver.name,
    youtubei: getYoutubeiStatus(),
    ytdlp: ytdlpStatus ? ytdlpStatus() : { fallback: true, loaded: false },
  };
}

async function withYtdlpFallback<T>(
  operation: keyof AudioResolver,
  runPrimary: () => Promise<T>,
  runFallback: () => Promise<T>
): Promise<T> {
  try {
    return await runPrimary();
  } catch (err) {
    console.warn(
      `[audio-resolver] youtubei ${String(operation)} failed, falling back to yt-dlp: ${
        (err as Error).message
      }`
    );
    try {
      return await runFallback();
    } catch (fallbackErr) {
      throw new Error(
        `youtubei ${String(operation)} failed: ${(err as Error).message}; yt-dlp fallback failed: ${
          (fallbackErr as Error).message
        }`
      );
    }
  }
}

function logResolvedStream(
  source: AudioResolverName,
  operation: 'resolveAudioUrl' | 'resolveTrack',
  audio: AudioStreamInfo,
  elapsedMs: number
) {
  console.log(
    `[audio] resolved stream ${JSON.stringify({
      source,
      operation,
      videoId: audio.videoId,
      preference: audio.qualityPreference,
      format: audio.format,
      quality: audio.quality,
      elapsedMs,
    })}`
  );
}

export async function searchTracks(query: string, limit = 10): Promise<Track[]> {
  return withYtdlpFallback(
    'searchTracks',
    () => getAudioResolver().searchTracks(query, limit),
    async () => (await getYtdlpResolver()).searchTracks(query, limit)
  );
}

export async function getYoutubeTrack(urlOrVideoId: string, originalQuery = urlOrVideoId): Promise<Track> {
  return withYtdlpFallback(
    'getYoutubeTrack',
    () => getAudioResolver().getYoutubeTrack(urlOrVideoId, originalQuery),
    async () => (await getYtdlpResolver()).getYoutubeTrack(urlOrVideoId, originalQuery)
  );
}

export async function getYoutubePlaylistTracks(url: string, limit = 2000): Promise<PlaylistImportResult> {
  try {
    const primary = await getAudioResolver().getYoutubePlaylistTracks(url, limit);
    if (primary.tracks.length > 0) return primary;
    console.warn('[audio-resolver] youtubei playlist returned no tracks, falling back to yt-dlp');
  } catch (err) {
    console.warn(`[audio-resolver] youtubei getYoutubePlaylistTracks failed, falling back to yt-dlp: ${(err as Error).message}`);
  }
  return (await getYtdlpResolver()).getYoutubePlaylistTracks(url, limit);
}

export async function resolveAudioUrl(
  videoId: string,
  preference: AudioQualityPreference = getEnvConfig().audioQualityPreference
): Promise<AudioStreamInfo> {
  const startedAt = Date.now();
  try {
    const audio = await getAudioResolver().resolveAudioUrl(videoId, preference);
    logResolvedStream('youtubei', 'resolveAudioUrl', audio, Date.now() - startedAt);
    return audio;
  } catch (err) {
    console.warn(
      `[audio-resolver] youtubei resolveAudioUrl failed, falling back to yt-dlp: ${
        (err as Error).message
      }`
    );
    try {
      const audio = await (await getYtdlpResolver()).resolveAudioUrl(videoId, preference);
      logResolvedStream('ytdlp', 'resolveAudioUrl', audio, Date.now() - startedAt);
      return audio;
    } catch (fallbackErr) {
      throw new Error(
        `youtubei resolveAudioUrl failed: ${(err as Error).message}; yt-dlp fallback failed: ${
          (fallbackErr as Error).message
        }`
      );
    }
  }
}

export async function resolveTrack(
  videoId: string,
  originalQuery: string,
  preference: AudioQualityPreference = getEnvConfig().audioQualityPreference
): Promise<ResolvedTrackResult> {
  const startedAt = Date.now();
  try {
    const result = await getAudioResolver().resolveTrack(videoId, originalQuery, preference);
    logResolvedStream('youtubei', 'resolveTrack', result.audio, Date.now() - startedAt);
    return result;
  } catch (err) {
    console.warn(
      `[audio-resolver] youtubei resolveTrack failed, falling back to yt-dlp: ${
        (err as Error).message
      }`
    );
    try {
      const result = await (await getYtdlpResolver()).resolveTrack(videoId, originalQuery, preference);
      logResolvedStream('ytdlp', 'resolveTrack', result.audio, Date.now() - startedAt);
      return result;
    } catch (fallbackErr) {
      throw new Error(
        `youtubei resolveTrack failed: ${(err as Error).message}; yt-dlp fallback failed: ${
          (fallbackErr as Error).message
        }`
      );
    }
  }
}
