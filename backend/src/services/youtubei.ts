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
    youtubeChannelId: video.author?.id ?? undefined,
  };
}

function trackFromInfo(info: any, originalQuery: string): Track {
  const basic = info.basic_info ?? {};
  const id = basic.id ?? extractVideoId(originalQuery);

  // youtubei.js exposes channel_id directly on basic_info
  const channelId = basic.channel_id ?? basic.channel?.id ?? undefined;

  return {
    id,
    title: basic.title ?? id,
    artist: basic.author ?? basic.channel?.name ?? 'Unknown',
    duration: basic.duration ?? 0,
    thumbnail: pickThumbnail(basic.thumbnail),
    query: originalQuery,
    youtubeChannelId: channelId,
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
  limit = 100
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

export interface ChannelInfo {
  id: string;
  name: string;
  avatar: string | null;
  description: string | null;
  videos: Track[];
}

export async function getChannelInfo(channelId: string): Promise<ChannelInfo> {
  const youtube = await getInnertube();
  const channel = await (youtube as any).getChannel(channelId);

  const metadata = channel.metadata ?? {};
  const header = channel.header ?? {};

  // Extract avatar — check header thumbnails
  const avatarThumbnails: Array<{ url?: string; width?: number }> =
    header.author?.thumbnails ??
    header.avatar?.thumbnails ??
    metadata.avatar?.thumbnails ??
    [];
  const avatar = pickThumbnail(avatarThumbnails) || null;

  const name: string =
    metadata.title ??
    header.author?.name ??
    channelId;

  const description: string | null = metadata.description ?? null;

  // Get videos from the channel's videos tab
  let videos: Track[] = [];
  try {
    // Try multiple approaches to get videos
    let rawVideos: any[] = [];
    
    // Approach 1: Try getVideos() method
    try {
      const videosTab = await channel.getVideos();
      rawVideos = (videosTab as any).videos ?? [];
      console.log('[getChannelInfo] approach 1 (getVideos):', rawVideos.length, 'videos');
    } catch (err1) {
      console.log('[getChannelInfo] approach 1 failed:', (err1 as Error).message);
    }
    
    // Approach 2: If approach 1 failed, try accessing tabs directly
    if (rawVideos.length === 0 && channel.tabs) {
      console.log('[getChannelInfo] trying approach 2 (tabs)');
      for (const tab of channel.tabs) {
        console.log('[getChannelInfo] tab:', tab.title ?? tab.constructor?.name);
        if (tab.title === 'Videos' || tab.endpoint?.browseId?.includes('videos')) {
          try {
            const tabContent = await tab.getPage();
            rawVideos = (tabContent as any).videos ?? (tabContent as any).content?.videos ?? [];
            console.log('[getChannelInfo] approach 2 found videos:', rawVideos.length);
            if (rawVideos.length > 0) break;
          } catch (err2) {
            console.log('[getChannelInfo] approach 2 tab failed:', (err2 as Error).message);
          }
        }
      }
    }
    
    // Approach 3: Try content property
    if (rawVideos.length === 0 && (channel as any).content) {
      console.log('[getChannelInfo] trying approach 3 (content)');
      rawVideos = (channel as any).content.videos ?? [];
      console.log('[getChannelInfo] approach 3:', rawVideos.length, 'videos');
    }
    
    console.log('[getChannelInfo] final rawVideos count:', rawVideos.length, '| types:', rawVideos.slice(0, 3).map((v: any) => v.constructor?.name ?? v.type));
    videos = rawVideos
      .map((item: any) => {
        // Video/GridVideo: item.id, item.title, item.author (string), item.duration (seconds or TimedText)
        const videoId = item.id ?? item.video_id;
        if (!videoId || !isYoutubeVideoId(videoId)) {
          console.log('[getChannelInfo] skipping invalid video:', item.id, item.video_id, item.title?.toString?.());
          return null;
        }

        const title = item.title?.toString?.() ?? item.title?.text ?? videoId;
        const duration = typeof item.duration === 'object' ? item.duration?.seconds ?? 0 : item.duration ?? 0;
        
        return {
          id: videoId,
          title,
          artist: item.author?.name ?? item.author ?? name, // Use channel name as fallback
          duration,
          thumbnail: item.best_thumbnail?.url ?? pickThumbnail(item.thumbnails),
          query: videoId, // Use video ID as query
          youtubeChannelId: channelId, // Use the channel ID we already have
        } as Track;
      })
      .filter((track: Track | null): track is Track => Boolean(track))
      .slice(0, 50);
    console.log('[getChannelInfo] mapped videos:', videos.length, '/ rawVideos:', rawVideos.length);
  } catch (err) {
    console.warn('[youtubei] getChannelInfo: failed to fetch videos tab', err);
  }

  return { id: channelId, name, avatar, description, videos };
}

export async function getChannelIdForVideo(videoId: string): Promise<string | null> {
  try {
    const { info } = await getBasicInfoWithFallback(videoId);
    const basic = info.basic_info ?? {};
    const channelId = basic.channel_id ?? basic.channel?.id ?? null;
    return channelId;
  } catch {
    return null;
  }
}
