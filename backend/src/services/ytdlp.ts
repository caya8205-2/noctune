import YTDlpWrap from 'yt-dlp-wrap';
import fs from 'fs';
import path from 'path';
import { Track, AudioStreamInfo } from '../types/index.js';

function firstExistingPath(paths: string[]): string | undefined {
  return paths.find((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch {
      return false;
    }
  });
}

function resolveYtdlpBinaryPath(): string | undefined {
  if (process.env.YT_DLP_PATH && fs.existsSync(process.env.YT_DLP_PATH)) {
    return process.env.YT_DLP_PATH;
  }

  const exeDir = path.dirname(process.execPath);
  return firstExistingPath([
    path.join(process.cwd(), 'bin', 'yt-dlp'),          // <── Linux binary
    path.join(process.cwd(), 'yt-dlp'),
    path.join(process.cwd(), 'bin', 'yt-dlp.exe'),     // keep Windows fallback just in case
    path.join(process.cwd(), 'yt-dlp.exe'),
    path.join(process.cwd(), 'yt-dlp-x86_64-pc-windows-msvc.exe'),
    path.join(exeDir, 'yt-dlp'),
    path.join(exeDir, 'bin', 'yt-dlp'),
    path.join(exeDir, 'yt-dlp.exe'),
    path.join(exeDir, 'bin', 'yt-dlp.exe'),
    path.join(exeDir, 'yt-dlp-x86_64-pc-windows-msvc.exe'),
  ]);
}

const resolvedBinaryPath = resolveYtdlpBinaryPath();
const ytDlp = new YTDlpWrap(resolvedBinaryPath);

if (resolvedBinaryPath) {
  console.log(`[ytdlp] using bundled binary at ${resolvedBinaryPath}`);
} else {
  console.warn('[ytdlp] no bundled binary found, falling back to yt-dlp from PATH');
}

export function getYtdlpStatus() {
  return {
    binaryPath: resolvedBinaryPath ?? null,
    source: resolvedBinaryPath ? 'bundled' : 'path',
  };
}

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

interface YTPlaylistInfo {
  id: string;
  title?: string;
  entries?: YTInfo[];
}

function pickBestAudioFormat(info: YTInfo): { url: string; format: string; quality: string } {
  const formats = info.formats ?? [];
  const audioOnly = formats
    .filter(f => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'))
    .sort((a, b) => (b.abr ?? 0) - (a.abr ?? 0));

  // Desktop WebView2 is more reliable with MP4/M4A/AAC than WebM/Opus.
  const compatible = audioOnly.find((f) => {
    const ext = f.ext?.toLowerCase();
    const codec = f.acodec?.toLowerCase() ?? '';
    return ext === 'm4a' || ext === 'mp4' || codec.includes('aac') || codec.includes('mp4a');
  });

  const best = compatible ?? audioOnly[0] ?? formats[0];
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

  console.log(
    `[search:ytdlp] ${JSON.stringify({
      query,
      returned: tracks.length,
      top: tracks.slice(0, 5).map((track) => ({
        id: track.id,
        title: track.title,
        artist: track.artist,
      })),
    })}`
  );

  return tracks;
}

export async function getYoutubeTrack(urlOrVideoId: string, originalQuery = urlOrVideoId): Promise<Track> {
  const info = await ytDlp.getVideoInfo(urlOrVideoId) as YTInfo;
  return {
    id: info.id,
    title: info.title,
    artist: info.uploader ?? info.channel ?? 'Unknown',
    duration: info.duration ?? 0,
    thumbnail: pickThumbnail(info),
    query: originalQuery,
  };
}

export async function getYoutubePlaylistTracks(url: string, limit = 100): Promise<{
  name: string;
  tracks: Track[];
}> {
  const raw = await ytDlp.execPromise([
    url,
    '--dump-single-json',
    '--flat-playlist',
    '--no-warnings',
    '--playlist-end',
    String(limit),
  ]);
  const playlist = JSON.parse(raw) as YTPlaylistInfo;
  const entries = playlist.entries ?? [];
  return {
    name: playlist.title ?? 'YouTube Playlist',
    tracks: entries
      .filter((entry) => entry.id)
      .map((entry) => ({
        id: entry.id,
        title: entry.title ?? entry.id,
        artist: entry.uploader ?? entry.channel ?? 'YouTube',
        duration: entry.duration ?? 0,
        thumbnail: pickThumbnail(entry),
        query: entry.title ?? entry.id,
      })),
  };
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
