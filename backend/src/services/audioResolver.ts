import type { AudioQualityPreference, AudioStreamInfo, Track } from '../types/index.js';
import {
  isInnertubeCliAvailable,
  resolveAudioUrlWithInnertube,
  resolveTrackWithInnertube,
  searchTracksWithInnertube,
} from './innertubeCli.js';
import {
  getYoutubePlaylistTracks as ytdlpGetYoutubePlaylistTracks,
  getYoutubeTrack as ytdlpGetYoutubeTrack,
  getYtdlpStatus,
  resolveAudioUrl as ytdlpResolveAudioUrl,
  resolveTrack as ytdlpResolveTrack,
  searchTracks as ytdlpSearchTracks,
} from './ytdlp.js';

export type AudioResolverName = 'innertube' | 'ytdlp';

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

const innertubeResolver: AudioResolver = {
  name: 'innertube',
  searchTracks: async (query, limit) => {
    try {
      return await searchTracksWithInnertube(query, limit);
    } catch {
      return await ytdlpSearchTracks(query, limit);
    }
  },
  getYoutubeTrack: async (urlOrVideoId, originalQuery) => {
    const { track } = await resolveTrackWithInnertube(urlOrVideoId, originalQuery || urlOrVideoId);
    return track;
  },
  getYoutubePlaylistTracks: ytdlpGetYoutubePlaylistTracks,
  resolveAudioUrl: resolveAudioUrlWithInnertube,
  resolveTrack: resolveTrackWithInnertube,
};

const ytdlpResolver: AudioResolver = {
  name: 'ytdlp',
  searchTracks: ytdlpSearchTracks,
  getYoutubeTrack: ytdlpGetYoutubeTrack,
  getYoutubePlaylistTracks: ytdlpGetYoutubePlaylistTracks,
  resolveAudioUrl: ytdlpResolveAudioUrl,
  resolveTrack: ytdlpResolveTrack,
};

export function getAudioResolver(): AudioResolver {
  if (isInnertubeCliAvailable()) {
    return innertubeResolver;
  }
  return ytdlpResolver;
}

export function getAudioResolverStatus() {
  const isInnertube = isInnertubeCliAvailable();
  return {
    name: isInnertube ? 'innertube-rs' : 'ytdlp',
    innertube: { available: isInnertube },
    ytdlp: getYtdlpStatus(),
  };
}

function logResolvedStream(
  resolverName: string,
  operation: 'resolveAudioUrl' | 'resolveTrack',
  audio: AudioStreamInfo,
  durationMs: number
) {
  console.log(
    `[audio-resolver] ${resolverName} ${operation} ${JSON.stringify({
      videoId: audio.videoId,
      format: audio.format,
      quality: audio.quality,
      preference: audio.qualityPreference,
      resolverSource: audio.resolverSource,
      hasUrl: Boolean(audio.url),
      durationMs,
    })}`
  );
}

export async function searchTracks(query: string, limit = 10): Promise<Track[]> {
  try {
    if (isInnertubeCliAvailable()) {
      return await searchTracksWithInnertube(query, limit);
    }
    return await ytdlpSearchTracks(query, limit);
  } catch (err) {
    console.warn(`[audio-resolver] innertube searchTracks failed, falling back to yt-dlp: ${(err as Error).message}`);
    return await ytdlpSearchTracks(query, limit);
  }
}

export async function getYoutubeTrack(urlOrVideoId: string, originalQuery?: string): Promise<Track> {
  try {
    if (isInnertubeCliAvailable()) {
      const { track } = await resolveTrackWithInnertube(urlOrVideoId, originalQuery || urlOrVideoId);
      return track;
    }
    return await ytdlpGetYoutubeTrack(urlOrVideoId, originalQuery);
  } catch (err) {
    console.warn(`[audio-resolver] innertube getYoutubeTrack failed, falling back to yt-dlp: ${(err as Error).message}`);
    return await ytdlpGetYoutubeTrack(urlOrVideoId, originalQuery);
  }
}

export async function getYoutubePlaylistTracks(url: string, limit = 2000): Promise<PlaylistImportResult> {
  return await ytdlpGetYoutubePlaylistTracks(url, limit);
}

export async function resolveAudioUrl(
  videoId: string,
  preference: AudioQualityPreference = 'high'
): Promise<AudioStreamInfo> {
  const startedAt = Date.now();
  try {
    if (isInnertubeCliAvailable()) {
      const audio = await resolveAudioUrlWithInnertube(videoId, preference);
      logResolvedStream('innertube', 'resolveAudioUrl', audio, Date.now() - startedAt);
      return audio;
    }
    const audio = await ytdlpResolveAudioUrl(videoId, preference);
    logResolvedStream('ytdlp', 'resolveAudioUrl', audio, Date.now() - startedAt);
    return audio;
  } catch (err) {
    console.warn(`[audio-resolver] innertube resolveAudioUrl failed, falling back to yt-dlp: ${(err as Error).message}`);
    const audio = await ytdlpResolveAudioUrl(videoId, preference);
    logResolvedStream('ytdlp', 'resolveAudioUrl', audio, Date.now() - startedAt);
    return audio;
  }
}

export async function resolveTrack(
  videoId: string,
  originalQuery: string,
  preference: AudioQualityPreference = 'high'
): Promise<ResolvedTrackResult> {
  const startedAt = Date.now();
  try {
    if (isInnertubeCliAvailable()) {
      const result = await resolveTrackWithInnertube(videoId, originalQuery, preference);
      logResolvedStream('innertube', 'resolveTrack', result.audio, Date.now() - startedAt);
      return result;
    }
    const result = await ytdlpResolveTrack(videoId, originalQuery);
    logResolvedStream('ytdlp', 'resolveTrack', result.audio, Date.now() - startedAt);
    return result;
  } catch (err) {
    console.warn(`[audio-resolver] innertube resolveTrack failed, falling back to yt-dlp: ${(err as Error).message}`);
    const result = await ytdlpResolveTrack(videoId, originalQuery);
    logResolvedStream('ytdlp', 'resolveTrack', result.audio, Date.now() - startedAt);
    return result;
  }
}
