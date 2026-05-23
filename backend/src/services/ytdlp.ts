import YTDlpWrap from 'yt-dlp-wrap';
import { Track, AudioStreamInfo } from '../types/index.js';

const ytDlp = new YTDlpWrap();

// yt-dlp raw info shape (partial — only what we need)
interface YTInfo {
  id: string;
  title: string;
  uploader?: string;
  channel?: string;
  duration: number;
  thumbnail?: string;
  thumbnails?: Array<{ url: string; width?: number }>;
  formats?: Array<{
    format_id: string;
    url: string;
    acodec?: string;
    vcodec?: string;
    abr?: number;
    ext?: string;
    quality?: number;
  }>;
  url?: string;  // present in single-format extractions
}

function pickBestAudioFormat(info: YTInfo): { url: string; format: string; quality: string } {
  const formats = info.formats ?? [];
  // Prefer: audio-only webm/opus > audio-only m4a > any
  const audioOnly = formats
    .filter(f => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'))
    .sort((a, b) => (b.abr ?? 0) - (a.abr ?? 0));

  const best = audioOnly[0] ?? formats[0];
  if (!best?.url && !info.url) {
    throw new Error(`No playable format found for ${info.id}`);
  }

  return {
    url: best?.url ?? info.url!,
    format: best?.ext ?? 'webm',
    quality: best?.abr ? `${best.abr}kbps` : 'unknown',
  };
}

function pickThumbnail(info: YTInfo): string {
  if (info.thumbnails?.length) {
    // Prefer medium quality thumbnail (mqdefault ~320px)
    const sorted = [...info.thumbnails].sort(
      (a, b) => (b.width ?? 0) - (a.width ?? 0)
    );
    const medium = sorted.find(t => (t.width ?? 0) <= 480);
    return medium?.url ?? sorted[0]?.url ?? info.thumbnail ?? '';
  }
  return info.thumbnail ?? '';
}

/** Search YouTube and return top results as Track objects. */
export async function searchTracks(query: string, limit = 10): Promise<Track[]> {
  const rawResults = await ytDlp.execPromise([
    `ytsearch${limit}:${query}`,
    '--dump-json',
    '--no-playlist',
    '--flat-playlist',
    '--no-warnings',
  ]);

  const lines = rawResults.trim().split('\n').filter(Boolean);
  const tracks: Track[] = [];

  for (const line of lines) {
    try {
      const info = JSON.parse(line) as YTInfo;
      tracks.push({
        id: info.id,
        title: info.title,
        artist: info.uploader ?? info.channel ?? 'Unknown',
        duration: info.duration ?? 0,
        thumbnail: pickThumbnail(info),
        query,
      });
    } catch {
      // skip malformed entries
    }
  }

  return tracks;
}

/** Resolve a full audio stream URL for a videoId. */
export async function resolveAudioUrl(videoId: string): Promise<AudioStreamInfo> {
  const info = await ytDlp.getVideoInfo(`https://www.youtube.com/watch?v=${videoId}`) as YTInfo;
  const { url, format, quality } = pickBestAudioFormat(info);

  // YT URLs are typically valid for ~6h; we conservatively expire at 5h45m
  const expiry = Date.now() + (5 * 60 + 45) * 60 * 1000;

  return { videoId, url, expiry, format, quality };
}

/** Get Track metadata + audio URL in one call (used on first play). */
export async function resolveTrack(videoId: string, originalQuery: string): Promise<{
  track: Track;
  audio: AudioStreamInfo;
}> {
  const info = await ytDlp.getVideoInfo(`https://www.youtube.com/watch?v=${videoId}`) as YTInfo;
  const { url, format, quality } = pickBestAudioFormat(info);

  const track: Track = {
    id: info.id,
    title: info.title,
    artist: info.uploader ?? info.channel ?? 'Unknown',
    duration: info.duration ?? 0,
    thumbnail: pickThumbnail(info),
    query: originalQuery,
  };

  const audio: AudioStreamInfo = {
    videoId,
    url,
    expiry: Date.now() + (5 * 60 + 45) * 60 * 1000,
    format,
    quality,
  };

  return { track, audio };
}
