import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { AudioQualityPreference, AudioStreamInfo, Track } from '../types/index.js';
import type { PlaylistImportResult, ResolvedTrackResult } from './audioResolver.js';

type YoutubeiModule = typeof import('youtubei.js');
type InnertubeLike = Awaited<ReturnType<YoutubeiModule['Innertube']['create']>>;

const nodeRequire = createRequire(__filename);
const YOUTUBEI_CLIENTS = ['ANDROID', 'IOS', 'WEB', 'MWEB', 'TV_SIMPLY', 'ANDROID_VR'] as const;

let youtubeiModulePromise: Promise<YoutubeiModule> | null = null;
let innertubePromise: Promise<InnertubeLike> | null = null;

function loadYoutubeiWebBundle(): YoutubeiModule {
  const bundlePath = nodeRequire.resolve('youtubei.js/web.bundle');
  const bundleSource = readFileSync(bundlePath, 'utf8').replace(
    /export\s*\{[\s\S]*?\};\s*(?:\/\/# sourceMappingURL=.*)?\s*$/,
    'return { Innertube };'
  );
  const loadBundle = new Function(bundleSource) as () => YoutubeiModule;
  return loadBundle();
}

async function getYoutubeiModule(): Promise<YoutubeiModule> {
  youtubeiModulePromise ??= Promise.resolve(loadYoutubeiWebBundle());
  return youtubeiModulePromise;
}

async function getInnertube(): Promise<InnertubeLike> {
  if (!innertubePromise) {
    innertubePromise = getYoutubeiModule().then(({ Innertube }) => Innertube.create());
  }
  return innertubePromise;
}

function extractVideoId(urlOrVideoId: string): string {
  try {
    const url = new URL(urlOrVideoId);
    if (url.hostname.includes('youtu.be')) {
      return url.pathname.replace(/^\//, '').split('/')[0] || urlOrVideoId;
    }
    if (url.pathname.startsWith('/shorts/')) {
      return url.pathname.split('/')[2] || urlOrVideoId;
    }
    return url.searchParams.get('v') || urlOrVideoId;
  } catch {
    return urlOrVideoId;
  }
}

function extractPlaylistId(url: string): string {
  try {
    return new URL(url).searchParams.get('list') || url;
  } catch {
    return url;
  }
}

function pickThumbnail(thumbnails: Array<{ url?: string; width?: number }> | undefined): string {
  if (!thumbnails?.length) return '';
  const sorted = [...thumbnails].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  const medium = sorted.find((thumbnail) => (thumbnail.width ?? 0) <= 480);
  return medium?.url ?? sorted[0]?.url ?? '';
}

function isYoutubeVideoId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{11}$/.test(id);
}

function toTrack(video: any, query: string): Track | null {
  const id = video.video_id ?? video.id;
  if (!id || !isYoutubeVideoId(id)) return null;

  return {
    id,
    title: video.title?.toString?.() ?? video.title?.text ?? id,
    artist: video.author?.name ?? video.author ?? 'Unknown',
    duration: video.duration?.seconds ?? 0,
    thumbnail: video.best_thumbnail?.url ?? pickThumbnail(video.thumbnails),
    query,
  };
}

function trackFromInfo(info: any, originalQuery: string): Track {
  const basic = info.basic_info ?? {};
  const id = basic.id ?? extractVideoId(originalQuery);

  return {
    id,
    title: basic.title ?? id,
    artist: basic.author ?? basic.channel?.name ?? 'Unknown',
    duration: basic.duration ?? 0,
    thumbnail: pickThumbnail(basic.thumbnail),
    query: originalQuery,
  };
}

function parseAudioFormat(mimeType: string | undefined): string {
  const mime = mimeType?.toLowerCase() ?? '';
  if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a';
  if (mime.includes('webm')) return 'webm';
  return 'audio';
}

export function getYoutubeiStatus() {
  return {
    available: true,
    primaryClient: YOUTUBEI_CLIENTS[0],
    fallbackClients: YOUTUBEI_CLIENTS.slice(1),
  };
}

async function getBasicInfoWithFallback(videoId: string) {
  const youtube = await getInnertube();
  const failures: string[] = [];

  for (const client of YOUTUBEI_CLIENTS) {
    try {
      const info = await youtube.getBasicInfo(videoId, { client: client as any });
      return { info, client };
    } catch (err) {
      failures.push(`${client}: ${(err as Error).message}`);
    }
  }

  throw new Error(`No YouTube.js client could load metadata for ${videoId}. ${failures.join(' | ')}`);
}

function streamingOptionSets(preference: AudioQualityPreference) {
  const stable = { type: 'audio', quality: 'best', format: 'mp4' } as const;
  if (preference === 'high') {
    return [
      { type: 'audio', quality: 'best', format: 'any' } as const,
      stable,
    ];
  }
  return [stable];
}

async function getStreamingDataWithFallback(
  videoId: string,
  preference: AudioQualityPreference = 'auto'
) {
  const youtube = await getInnertube();
  const failures: string[] = [];

  for (const client of YOUTUBEI_CLIENTS) {
    for (const options of streamingOptionSets(preference)) {
      try {
        const format = await youtube.getStreamingData(videoId, {
          ...options,
          client: client as any,
        });

        if (!format.url) {
          throw new Error('No playable URL returned');
        }

        if (isLimitedIosStream(format.url)) {
          throw new Error('Skipping limited iOS stream URL');
        }

        await validateStreamingUrl(format.url);

        return { format: { ...format, url: format.url }, client, qualityPreference: preference };
      } catch (err) {
        failures.push(`${client}/${options.format}: ${(err as Error).message}`);
      }
    }
  }

  throw new Error(`No YouTube.js client could resolve audio for ${videoId}. ${failures.join(' | ')}`);
}

function isLimitedIosStream(url: string): boolean {
  try {
    return new URL(url).searchParams.get('c')?.toUpperCase() === 'IOS';
  } catch {
    return url.includes('c=IOS');
  }
}

async function validateStreamingUrl(url: string): Promise<void> {
  const res = await fetch(url, {
    headers: { Range: 'bytes=0-1048575' },
  });
  res.body?.cancel().catch(() => {});

  if (!res.ok && res.status !== 206) {
    throw new Error(`Resolved audio URL is not playable: ${res.status} ${res.statusText}`);
  }
}

export async function searchTracks(query: string, limit = 10): Promise<Track[]> {
  const youtube = await getInnertube();
  const search = await youtube.search(query);
  const results = Array.from((search as any).results ?? []);
  const tracks = results
    .map((result) => toTrack(result, query))
    .filter((track): track is Track => Boolean(track))
    .slice(0, limit);

  console.log(
    `[search:youtubei] ${JSON.stringify({
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

export async function getYoutubeTrack(
  urlOrVideoId: string,
  originalQuery = urlOrVideoId
): Promise<Track> {
  const videoId = extractVideoId(urlOrVideoId);
  const { info } = await getBasicInfoWithFallback(videoId);
  return trackFromInfo(info, originalQuery);
}

export async function getYoutubePlaylistTracks(
  url: string,
  limit = Number.MAX_SAFE_INTEGER
): Promise<PlaylistImportResult> {
  const youtube = await getInnertube();
  let playlist = await youtube.getPlaylist(extractPlaylistId(url));
  const tracks: Track[] = [];

  while (tracks.length < limit) {
    for (const item of Array.from((playlist as any).items ?? [])) {
      const track = toTrack(item, (item as any).title?.toString?.() ?? url);
      if (track) tracks.push(track);
      if (tracks.length >= limit) break;
    }

    if (tracks.length >= limit || !(playlist as any).has_continuation) break;
    playlist = await playlist.getContinuation();
  }

  return {
    name: (playlist as any).info?.title ?? 'YouTube Playlist',
    tracks,
  };
}

export async function resolveAudioUrl(
  videoId: string,
  preference: AudioQualityPreference = 'auto'
): Promise<AudioStreamInfo> {
  const { format, qualityPreference } = await getStreamingDataWithFallback(videoId, preference);

  return {
    videoId,
    url: format.url,
    expiry: Date.now() + (5 * 60 + 45) * 60 * 1000,
    format: parseAudioFormat(format.mime_type),
    quality: format.average_bitrate
      ? `${Math.round(format.average_bitrate / 1000)}kbps`
      : format.bitrate
        ? `${Math.round(format.bitrate / 1000)}kbps`
        : 'unknown',
    qualityPreference,
  };
}

export async function resolveTrack(
  videoId: string,
  originalQuery: string,
  preference: AudioQualityPreference = 'auto'
): Promise<ResolvedTrackResult> {
  const [{ info }, audio] = await Promise.all([
    getBasicInfoWithFallback(videoId),
    resolveAudioUrl(videoId, preference),
  ]);

  return {
    track: trackFromInfo(info, originalQuery),
    audio,
  };
}
