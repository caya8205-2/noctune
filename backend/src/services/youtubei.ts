import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { AudioQualityPreference, AudioStreamInfo, Track } from '../types/index.js';
import type { PlaylistImportResult, ResolvedTrackResult } from './audioResolver.js';
import { browseYoutubeChannel as browseYoutubeChannelWithYtdlp } from './ytdlp.js';

type YoutubeiModule = typeof import('youtubei.js');
type InnertubeLike = Awaited<ReturnType<YoutubeiModule['Innertube']['create']>>;

const nodeRequire = createRequire(__filename);
const YOUTUBEI_CLIENTS = ['ANDROID_VR', 'IOS', 'TV_SIMPLY', 'MWEB', 'ANDROID', 'WEB'] as const;

let youtubeiModulePromise: Promise<YoutubeiModule> | null = null;
let innertubePromise: Promise<InnertubeLike> | null = null;

function loadYoutubeiWebBundle(): YoutubeiModule {
  const bundlePath = nodeRequire.resolve('youtubei.js/web.bundle');
  const bundleSource = readFileSync(bundlePath, 'utf8').replace(
    /export\s*\{[\s\S]*?\};\s*(?:\/\/# sourceMappingURL=.*)?\s*$/,
    'return { Innertube, Platform };'
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
    innertubePromise = getYoutubeiModule().then(({ Innertube, Platform }: any) => {
      if (Platform?.shim) {
        Platform.shim.eval = async (arg: any) => {
          if (typeof arg === 'string') {
            try {
              return new Function(`return (${arg})`)();
            } catch {
              return new Function(arg)();
            }
          }
          if (typeof arg === 'object' && arg !== null) {
            const code = arg.output || arg.code;
            if (code) {
              const fn = new Function(code);
              return fn();
            }
          }
          return (0, eval)(arg);
        };
      }
      return Innertube.create();
    });
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
  const id = video.video_id ?? video.id?.value ?? video.id;
  if (!id || !isYoutubeVideoId(id)) return null;

  return {
    id,
    title: video.title?.text ?? video.title?.runs?.[0]?.text ?? (typeof video.title === 'string' ? video.title : null) ?? id,
    artist: video.author?.name ?? video.author ?? 'Unknown',
    duration: video.duration?.seconds ?? 0,
    thumbnail: video.best_thumbnail?.url ?? pickThumbnail(video.thumbnails),
    query,
  };
}

function trackFromInfo(info: any, originalQuery: string): Track {
  const basic = info.basic_info ?? {};
  const id = basic.id ?? extractVideoId(originalQuery);
  const channelId =
    basic.channel?.id ??
    basic.channel?.browse_id ??
    basic.author?.id ??
    basic.author_id ??
    basic.channel_id ??
    basic.owner?.id;

  return {
    id,
    title: basic.title ?? id,
    artist: basic.author ?? basic.channel?.name ?? 'Unknown',
    artistId: channelId && (String(channelId).startsWith('UC') || String(channelId).startsWith('@'))
      ? `ytchannel:${channelId}`
      : undefined,
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
  const anyAudio = { type: 'audio', quality: 'best', format: 'any' } as const;
  const mp4Audio = { type: 'audio', quality: 'best', format: 'mp4' } as const;
  return [anyAudio, mp4Audio];
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(url, {
      headers: { Range: 'bytes=0-1048575' },
      signal: controller.signal,
    });
    res.body?.cancel().catch(() => {});

    if (!res.ok && res.status !== 206) {
      throw new Error(`Resolved audio URL is not playable: ${res.status} ${res.statusText}`);
    }
  } finally {
    clearTimeout(timeout);
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

const CHANNEL_VIEW_CACHE_TTL_MS = 1000 * 60 * 60;
const channelViewCache = new Map<string, { expiresAt: number; view: any }>();

function extractChannelId(video: any): string | null {
  if (!video) return null;
  return (
    video.author?.id ??
    video.author?.endpoint?.payload?.browseId ??
    video.owner?.id ??
    video.channel_id ??
    null
  );
}

function pickAnyThumbnail(value: any): string {
  if (Array.isArray(value)) return pickThumbnail(value);
  if (value?.url) return String(value.url);
  if (Array.isArray(value?.thumbnails)) return pickThumbnail(value.thumbnails);
  return '';
}

function extractList(value: any): any[] {
  const asArray = (candidate: any): any[] => {
    if (Array.isArray(candidate)) return candidate;
    if (candidate && typeof candidate !== 'string' && typeof candidate[Symbol.iterator] === 'function') {
      return Array.from(candidate);
    }
    return [];
  };
  const direct = asArray(value);
  if (direct.length > 0) return direct;
  for (const candidate of [value?.videos, value?.items, value?.contents, value?.data?.items, value?.data?.contents, value?.page?.contents]) {
    const result = asArray(candidate);
    if (result.length > 0) return result;
  }
  return [];
}

export async function browseYouTubeChannel(idOrQuery: string) {
  return browseYoutubeChannelWithYtdlp(idOrQuery);
  /* Legacy Innertube implementation retained below for non-channel callers;
   * channel view must never use this path. */
  /* istanbul ignore next */
  if (false) {
    return browseYouTubeChannelInnertube(idOrQuery);
  }
}

async function browseYouTubeChannelInnertube(idOrQuery: string) {
  const youtube = await getInnertube();
  const rawId = idOrQuery.replace(/^(ytchannel|youtube|channel):/, '').trim();
  const cached = channelViewCache.get(rawId);
  if (cached && cached.expiresAt > Date.now()) return cached.view;

  let resolvedChannelId = rawId;
  let channel: any = null;

  if (!rawId.startsWith('UC') && !rawId.startsWith('@')) {
    try {
      const searchChannelRes = await youtube.search(rawId, { type: 'channel' });
      const firstChannel = searchChannelRes.results?.[0] as any;
      if (firstChannel?.id) {
        resolvedChannelId = firstChannel.id;
      }
    } catch (err) {
      console.warn('[youtubei] channel search failed for query:', rawId, err);
    }
  }

  if (resolvedChannelId.startsWith('UC') || resolvedChannelId.startsWith('@')) {
    try {
      channel = await youtube.getChannel(resolvedChannelId);
    } catch (err) {
      console.warn('[youtubei] youtube.getChannel() failed for:', resolvedChannelId, (err as Error).message);
    }
  }

  const channelTitle = channel?.header?.title?.text ?? channel?.metadata?.title ?? rawId;
  const subscriberCount = channel?.header?.subscribers?.text ?? channel?.header?.subscriber_count?.text ?? channel?.metadata?.subscriber_count ?? null;
  const avatarUrl = [
    channel?.header?.author?.thumbnails,
    channel?.metadata?.avatar,
    channel?.metadata?.avatar_thumbnails,
    channel?.metadata?.thumbnails,
  ].map(pickAnyThumbnail).find(Boolean) || null;
  const channelId = channel?.metadata?.external_id ?? channel?.header?.channel_id ?? channel?.id ?? (resolvedChannelId.startsWith('UC') ? resolvedChannelId : rawId);

  let rawNodes: any[] = [];
  try {
    if (channel) {
      const videosTab: any = await channel.getVideos();
      rawNodes = extractList(videosTab);
      if (rawNodes.length === 0) rawNodes = extractList(channel?.videos);
    }
  } catch (err) {
    console.warn('[youtubei] channel.getVideos() failed:', err);
  }

  let channelPlaylists: any[] = [];
  try {
    if (channel && typeof channel.getPlaylists === 'function') {
      const playlistsTab: any = await channel.getPlaylists();
      channelPlaylists = extractList(playlistsTab);
    }
  } catch (err) {
    console.warn('[youtubei] channel.getPlaylists() failed:', err);
  }

  let extractorFallbackTracks: any[] = [];
  if (rawNodes.length === 0 && (channelId.startsWith('UC') || channelId.startsWith('@'))) {
    try {
      const { getYoutubePlaylistTracks } = await import('./ytdlp.js');
      const channelUrl = channelId.startsWith('@')
        ? `https://www.youtube.com/${channelId}/videos`
        : `https://www.youtube.com/channel/${channelId}/videos`;
      const playlist = await getYoutubePlaylistTracks(
        channelUrl,
        100
      );
      extractorFallbackTracks = playlist.tracks.map((track) => ({
        ...track,
        id: `youtube:${track.id}`,
        youtubeId: track.id,
        artist: channelTitle,
        artistId: `ytchannel:${channelId}`,
        album: 'YouTube',
        query: `${track.title} ${channelTitle}`,
        queueSource: 'search',
      }));
    } catch (err) {
      console.warn('[youtubei] channel yt-dlp fallback failed:', err);
    }
  }

  if (rawNodes.length === 0 && extractorFallbackTracks.length === 0 && !resolvedChannelId.startsWith('UC') && !resolvedChannelId.startsWith('@')) {
    try {
      const { searchTracks } = await import('./audioResolver.js');
      const results = await searchTracks(rawId, 50);
      extractorFallbackTracks = results.map((track) => ({
        ...track,
        artistId: `ytchannel:${channelId}`,
      }));
    } catch (err) {
      console.warn('[youtubei] channel searchTracks fallback failed:', err);
    }
  }

  if (channelPlaylists.length === 0 && (channelId.startsWith('UC') || channelId.startsWith('@'))) {
    try {
      const { getYoutubeChannelPlaylists } = await import('./ytdlp.js');
      channelPlaylists = await getYoutubeChannelPlaylists(channelId, 20);
    } catch (err) {
      console.warn('[youtubei] channel playlist extraction failed:', err);
    }
  }

  let topTracks: any[] = (extractorFallbackTracks.length > 0 ? extractorFallbackTracks : rawNodes
    .map((v: any): any | null => {
      const video = v?.video ?? v?.videoRenderer ?? v;
      const vId = video?.video_id ?? video?.id?.value ?? video?.id ?? video?.videoId;
      if (!vId) return null;
      const vTitle = video.title?.text ?? video.title?.runs?.[0]?.text ?? (typeof video.title === 'string' ? video.title : null) ?? 'Unknown Title';
      const vAuthor = video.author?.name ?? video.author ?? video.artists?.[0]?.name ?? channelTitle;
      const vThumb = video.thumbnails?.[0]?.url ?? video.thumbnail?.[0]?.url ?? `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`;
      return {
        id: `youtube:${vId}`,
        youtubeId: vId,
        title: String(vTitle).trim(),
        artist: String(vAuthor).trim(),
        artistId: `ytchannel:${channelId}`,
        album: 'YouTube',
        duration: 0,
        thumbnail: vThumb,
        query: `${vTitle} ${vAuthor}`,
        queueSource: 'search',
      };
    })
    .filter((t): t is any => Boolean(t))
  ).slice(0, 100);

  // Innertube can return wrapper nodes that contain no directly mappable video.
  // Retry through yt-dlp in that case as well, instead of treating the channel
  // as genuinely empty.
  if (topTracks.length === 0 && (channelId.startsWith('UC') || channelId.startsWith('@'))) {
    try {
      const { getYoutubePlaylistTracks } = await import('./ytdlp.js');
      const channelUrl = channelId.startsWith('@')
        ? `https://www.youtube.com/${channelId}/videos`
        : `https://www.youtube.com/channel/${channelId}/videos`;
      const playlist = await getYoutubePlaylistTracks(channelUrl, 100);
      topTracks = playlist.tracks.map((track) => ({
        ...track,
        id: `youtube:${track.id}`,
        youtubeId: track.id,
        artist: channelTitle,
        artistId: `ytchannel:${channelId}`,
        album: 'YouTube',
        query: `${track.title} ${channelTitle}`,
        queueSource: 'search',
      }));
    } catch (err) {
      console.warn('[youtubei] channel video retry failed:', err);
    }
  }

  const view = {
    id: `ytchannel:${channelId}`,
    name: channelTitle,
    genres: ['YouTube Channel'],
    followers: subscriberCount,
    image: avatarUrl ?? topTracks[0]?.thumbnail ?? null,
    spotifyUrl: channelId.startsWith('UC')
      ? `https://www.youtube.com/channel/${channelId}`
      : channelId.startsWith('@') ? `https://www.youtube.com/${channelId}` : null,
    topTracks,
    albums: [],
    channelPlaylists: channelPlaylists
      .map((playlist: any) => {
        const playlistId = playlist.id?.value ?? playlist.id ?? playlist.playlist_id;
        if (!playlistId) return null;
        return {
          id: String(playlistId),
          name: String(playlist.title?.text ?? playlist.title ?? playlist.name ?? playlistId),
          totalTracks: Number(playlist.video_count ?? playlist.totalTracks ?? 0),
          image: playlist.thumbnails?.[0]?.url ?? playlist.thumbnail?.[0]?.url ?? playlist.image ?? null,
          url: `https://www.youtube.com/playlist?list=${playlistId}`,
        };
      })
      .filter(Boolean),
  };
  // Jangan meng-cache hasil kosong: Innertube/yt-dlp kadang mengembalikan
  // halaman sementara sebelum konten channel siap, dan hasil itu harus bisa
  // dicoba ulang pada akses berikutnya.
  if (view.topTracks.length > 0 || view.channelPlaylists.length > 0) {
    const entry = { expiresAt: Date.now() + CHANNEL_VIEW_CACHE_TTL_MS, view };
    channelViewCache.set(rawId, entry);
    channelViewCache.set(channelId, entry);
  }
  return view;
}
