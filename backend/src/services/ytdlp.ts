import YTDlpWrap from 'yt-dlp-wrap';
import fs from 'fs';
import path from 'path';
import { Track, AudioStreamInfo, AudioQualityPreference } from '../types/index.js';

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
  const envPath = process.env.YT_DLP_PATH;
  if (envPath) {
    try {
      if (fs.existsSync(envPath)) return envPath;
    } catch {
      // Ignore invalid env paths and continue with bundled candidates.
    }
  }

  const exeDir = path.dirname(process.execPath);
  const roots = [process.cwd(), exeDir];
  const binaryNamesByPlatform: Partial<Record<NodeJS.Platform, string[]>> = {
    win32: [
      'yt-dlp.exe',
      'yt-dlp-x86_64-pc-windows-msvc.exe',
      'yt-dlp_x86.exe',
    ],
    linux: [
      'yt-dlp',
      'yt-dlp_linux',
      'yt-dlp_linux_aarch64',
      'yt-dlp_x86_64-unknown-linux-gnu',
    ],
    darwin: [
      'yt-dlp',
      'yt-dlp_macos',
      'yt-dlp_macos_legacy',
    ],
    aix: ['yt-dlp'],
    android: ['yt-dlp'],
    freebsd: ['yt-dlp'],
    haiku: ['yt-dlp'],
    openbsd: ['yt-dlp'],
    sunos: ['yt-dlp'],
    cygwin: ['yt-dlp.exe', 'yt-dlp'],
    netbsd: ['yt-dlp'],
  };
  const binaryNames = binaryNamesByPlatform[process.platform] ?? ['yt-dlp'];
  const candidates = roots.flatMap((root) =>
    binaryNames.flatMap((name) => [
      path.join(root, 'bin', name),
      path.join(root, name),
    ])
  );

  return firstExistingPath(candidates);
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
  _type?: string;
  title: string;
  uploader?: string;
  uploader_id?: string;
  channel?: string;
  channel_id?: string;
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
  thumbnail?: string;
  thumbnails?: Array<{ url: string; width?: number }>;
  entries?: YTInfo[];
}

function pickBestAudioFormat(
  info: YTInfo,
  preference: AudioQualityPreference = 'auto'
): { url: string; format: string; quality: string; qualityPreference: AudioQualityPreference } {
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

  const best = preference === 'high'
    ? audioOnly[0] ?? compatible ?? formats[0]
    : compatible ?? audioOnly[0] ?? formats[0];
  if (!best?.url && !info.url) {
    throw new Error(`No playable format found for ${info.id}`);
  }

  return {
    url: best?.url ?? info.url!,
    format: best?.ext ?? 'webm',
    quality: best?.abr ? `${best.abr}kbps` : 'unknown',
    qualityPreference: preference,
  };
}

function pickThumbnail(info: Pick<YTInfo, 'thumbnail' | 'thumbnails'>): string {
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

export interface YouTubePlaylistSummary {
  id: string;
  name: string;
  totalTracks: number;
  image: string | null;
  url: string;
}

function youtubeChannelReference(info: YTInfo): string | undefined {
  const candidate = info.channel_id ?? info.uploader_id;
  return candidate && (candidate.startsWith('UC') || candidate.startsWith('@'))
    ? `ytchannel:${candidate}`
    : undefined;
}

/** Sanitize query to remove characters that can break yt-dlp argument parsing. */
function sanitizeSearchQuery(query: string): string {
  return query
    .replace(/[\x00-\x1F\x7F]/g, '')   // strip control characters
    .replace(/[`$\\]/g, '')              // strip shell-like metacharacters
    .trim();
}

/** Search YouTube and return top results as Track objects. */
export async function searchTracks(query: string, limit = 10): Promise<Track[]> {
  const sanitized = sanitizeSearchQuery(query);
  if (!sanitized) {
    console.warn('[search:ytdlp] empty query after sanitization, skipping');
    return [];
  }

  let rawResults: string;
  try {
    rawResults = await ytDlp.execPromise([
      `ytsearch${limit}:${sanitized}`,
      '--dump-json',
      '--no-playlist',
      '--flat-playlist',
      '--no-warnings',
    ]);
  } catch (err) {
    console.error(
      `[search:ytdlp] yt-dlp process failed for query "${sanitized}":`,
      (err as Error).message ?? err
    );
    return [];
  }

  const lines = rawResults.trim().split('\n').filter(Boolean);
  const tracks: Track[] = [];

  for (const line of lines) {
    try {
      const info = JSON.parse(line) as YTInfo;
      tracks.push({
        id: info.id,
        title: info.title,
        artist: info.uploader ?? info.channel ?? 'Unknown',
        artistId: youtubeChannelReference(info),
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
      query: sanitized,
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
    artistId: youtubeChannelReference(info),
    duration: info.duration ?? 0,
    thumbnail: pickThumbnail(info),
    query: originalQuery,
  };
}

export async function getYoutubePlaylistTracks(url: string, limit = 2000): Promise<{
  name: string;
  image: string | null;
  tracks: Track[];
}> {
  const args = [
    url,
    '--dump-single-json',
    '--flat-playlist',
    '--no-warnings',
  ];
  if (Number.isFinite(limit) && limit < 10_000) args.push('--playlist-end', String(limit));
  const raw = await ytDlp.execPromise(args);
  const playlist = JSON.parse(raw) as YTPlaylistInfo;
  const entries = playlist.entries ?? [];
  return {
    name: playlist.title ?? 'YouTube Playlist',
    image: pickThumbnail(playlist) || null,
    tracks: entries
      .filter((entry) => entry.id)
      .map((entry) => ({
        id: entry.id,
        title: entry.title ?? entry.id,
        artist: entry.uploader ?? entry.channel ?? 'YouTube',
        duration: entry.duration ?? 0,
        thumbnail: pickThumbnail(entry),
        query: entry.title ?? entry.id,
      }))
      .slice(0, limit),
  };
}

export async function getYoutubeChannelPlaylists(channelId: string, limit = 20): Promise<YouTubePlaylistSummary[]> {
  const channelUrl = channelId.startsWith('@')
    ? `https://www.youtube.com/${channelId}/playlists`
    : `https://www.youtube.com/channel/${channelId}/playlists`;
  try {
    const raw = await ytDlp.execPromise([
      channelUrl,
      '--dump-single-json',
      '--flat-playlist',
      '--no-warnings',
      '--playlist-end', String(limit),
    ]);
    const playlist = JSON.parse(raw) as YTPlaylistInfo;
    return (playlist.entries ?? [])
      .filter((entry) => entry.id)
      .map((entry) => ({
        id: entry.id,
        name: entry.title ?? entry.id,
        totalTracks: 0,
        image: pickThumbnail(entry) || null,
        url: `https://www.youtube.com/playlist?list=${entry.id}`,
      }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/does not have a playlists tab|no playlists tab/i.test(message)) return [];
    throw error;
  }
}

/**
 * Dedicated channel browse path. Channel pages are intentionally handled by
 * yt-dlp rather than Innertube: yt-dlp consistently exposes uploads,
 * playlists, and channel metadata across Topic, creator, and handle pages.
 */
export async function browseYoutubeChannel(channelRef: string, videoLimit = 100) {
  const channelId = channelRef.replace(/^(ytchannel|youtube|channel):/, '').trim();
  if (!/^UC[A-Za-z0-9_-]{22}$/.test(channelId) && !/^@[A-Za-z0-9._-]+$/.test(channelId)) {
    throw new Error('Invalid YouTube channel id');
  }
  const baseUrl = channelId.startsWith('@')
    ? `https://www.youtube.com/${channelId}`
    : `https://www.youtube.com/channel/${channelId}`;
  const videosRaw = await ytDlp.execPromise([
    // Some Topic channels do not expose a `/videos` tab to yt-dlp. Their
    // root channel URL still resolves to the uploads playlist (`UU...`).
    baseUrl,
    '--dump-single-json',
    '--flat-playlist',
    '--no-warnings',
    '--playlist-end', String(videoLimit),
  ]);
  const videosPage = JSON.parse(videosRaw) as YTPlaylistInfo & {
    channel?: string;
    channel_id?: string;
    uploader?: string;
    thumbnail?: string;
    thumbnails?: Array<{ url: string; width?: number }>;
  };
  let tracks = (videosPage.entries ?? [])
    // The root channel page can expose tab links as playlist-like entries
    // (for example "Videos", "Live", and "Shorts"). They are navigation
    // placeholders, not playable videos, so keep only real 11-character IDs.
    .filter((entry) => entry.id && entry._type !== 'playlist' && /^[A-Za-z0-9_-]{11}$/.test(entry.id))
    .map((entry) => ({
      id: `youtube:${entry.id}`,
      youtubeId: entry.id,
      title: entry.title ?? entry.id,
      artist: entry.uploader ?? entry.channel ?? videosPage.uploader ?? videosPage.channel ?? 'YouTube',
      artistId: `ytchannel:${videosPage.channel_id ?? channelId}`,
      album: 'YouTube',
      duration: entry.duration ?? 0,
      thumbnail: pickThumbnail(entry) || `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg`,
      query: entry.title ?? entry.id,
      queueSource: 'search',
    } satisfies Track));

  // Topic channels often expose playlists but return no entries from their
  // root page. Their uploads playlist follows YouTube's UU + channel suffix
  // convention, so retry that canonical feed before reporting an empty tab.
  if (tracks.length === 0 && /^UC[A-Za-z0-9_-]{22}$/.test(videosPage.channel_id ?? channelId)) {
    const uploadsId = `UU${(videosPage.channel_id ?? channelId).slice(2)}`;
    try {
      const uploads = await getYoutubePlaylistTracks(
        `https://www.youtube.com/playlist?list=${uploadsId}`,
        videoLimit
      );
      tracks = uploads.tracks.map((track) => ({
        ...track,
        id: `youtube:${track.id}`,
        youtubeId: track.id,
        artist: videosPage.channel ?? videosPage.uploader ?? track.artist,
        artistId: `ytchannel:${videosPage.channel_id ?? channelId}`,
        album: 'YouTube',
        queueSource: 'search',
      } satisfies Track));
    } catch (error) {
      console.warn('[ytdlp] channel uploads playlist fallback failed:', (error as Error).message);
    }
  }
  const playlists = await getYoutubeChannelPlaylists(videosPage.channel_id ?? channelId, 20);
  return {
    id: `ytchannel:${videosPage.channel_id ?? channelId}`,
    name: videosPage.channel ?? videosPage.uploader ?? channelId,
    genres: ['YouTube Channel'],
    followers: null,
    image: pickThumbnail(videosPage) || tracks[0]?.thumbnail || null,
    spotifyUrl: baseUrl,
    topTracks: tracks,
    albums: [],
    channelPlaylists: playlists,
  };
}

/** Resolve a full audio stream URL for a videoId. */
export async function resolveAudioUrl(
  videoId: string,
  preference: AudioQualityPreference = 'auto'
): Promise<AudioStreamInfo> {
  const info = await ytDlp.getVideoInfo(`https://www.youtube.com/watch?v=${videoId}`) as YTInfo;
  const { url, format, quality, qualityPreference } = pickBestAudioFormat(info, preference);

  // YT URLs are typically valid for ~6h; we conservatively expire at 5h45m
  const expiry = Date.now() + (5 * 60 + 45) * 60 * 1000;

  return { videoId, url, expiry, format, quality, qualityPreference };
}

/** Get Track metadata + audio URL in one call (used on first play). */
export async function resolveTrack(videoId: string, originalQuery: string): Promise<{
  track: Track;
  audio: AudioStreamInfo;
}>;
export async function resolveTrack(
  videoId: string,
  originalQuery: string,
  preference: AudioQualityPreference = 'auto'
): Promise<{
  track: Track;
  audio: AudioStreamInfo;
}> {
  const info = await ytDlp.getVideoInfo(`https://www.youtube.com/watch?v=${videoId}`) as YTInfo;
  const { url, format, quality, qualityPreference } = pickBestAudioFormat(info, preference);

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
    qualityPreference,
  };

  return { track, audio };
}
