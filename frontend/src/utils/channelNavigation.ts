import { api, type Track } from './api';
import { usePlayerStore } from '../store/player';

const YT_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

/** Derive a YouTube video ID from a track (prefers youtubeId, falls back to id). */
export function getYoutubeVideoId(track: Pick<Track, 'id' | 'youtubeId'>): string | null {
  if (track.youtubeId && YT_ID_RE.test(track.youtubeId)) return track.youtubeId;
  if (YT_ID_RE.test(track.id)) return track.id;
  return null;
}

/**
 * Returns true if the track can navigate to a YouTube channel
 * (has no Spotify artistId but has a YouTube video ID or a cached channelId).
 */
export function canNavigateToChannel(
  track: Pick<Track, 'id' | 'youtubeId' | 'youtubeChannelId' | 'artistId'>
): boolean {
  if (track.artistId) return false;
  return Boolean(track.youtubeChannelId) || Boolean(getYoutubeVideoId(track));
}

/**
 * Navigate to the channel view for a track.
 * Uses the cached youtubeChannelId if available, otherwise fetches it lazily from the backend.
 */
export async function navigateToChannel(
  track: Pick<Track, 'id' | 'youtubeId' | 'youtubeChannelId' | 'artistId'>,
  setView: ReturnType<typeof usePlayerStore.getState>['setView']
): Promise<void> {
  if (track.youtubeChannelId) {
    setView('channel', track.youtubeChannelId);
    return;
  }
  const videoId = getYoutubeVideoId(track);
  if (!videoId) return;
  try {
    const { channelId } = await api.getVideoChannel(videoId);
    if (channelId) setView('channel', channelId);
  } catch {
    // silently fail
  }
}
