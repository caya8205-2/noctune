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

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/\bbaels\b/g, 'baelz')
    .replace(/\bhakoz\b/g, 'hakos')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(value: string): string[] {
  return normalize(value)
    .split(' ')
    .filter((word) => word.length > 1);
}

function parseSearchQuery(query: string): { title: string; artist: string; searchQuery: string } {
  const parts = query.split(/\s+-\s+|\s+by\s+/i).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const [title, artist] = parts;
    const searchTitle = title.replace(/\bhakoz\b/gi, 'Hakos').replace(/\bbaels\b/gi, 'Baelz');
    const searchArtist = artist.replace(/\bhakoz\b/gi, 'Hakos').replace(/\bbaels\b/gi, 'Baelz');
    return {
      title,
      artist,
      searchQuery: `${searchArtist} ${searchTitle} official audio`,
    };
  }

  const searchQuery = query.replace(/\bhakoz\b/gi, 'Hakos').replace(/\bbaels\b/gi, 'Baelz');

  return {
    title: query,
    artist: '',
    searchQuery: `${searchQuery} official audio`,
  };
}

const positiveTitleKeywords = [
  'official audio',
  'official video',
  'official music video',
  'official lyric video',
  'lyric video',
  'audio',
];

const positiveChannelKeywords = ['official', 'vevo', 'topic'];

const negativeKeywords = [
  'reaction',
  'reacts',
  'react',
  'first time hearing',
  'first time',
  'watching',
  'review',
  'breakdown',
  'analysis',
  'commentary',
  'trailer',
  'movie',
  'film',
  'scene',
  'clip',
  'clips',
  'shorts',
  'cover',
  'karaoke',
  'instrumental',
  'sped up',
  'slowed',
  'nightcore',
  'tutorial',
  'performance',
  '8d',
];

const liveVersionKeywords = [
  'live',
  'live version',
  'live performance',
  'concert',
  'stage',
  'showcase',
];

function keywordAllowed(keyword: string, queryTitle: string): boolean {
  return normalize(queryTitle).includes(keyword);
}

function scoreSearchCandidate(
  candidate: Track,
  profile: { title: string; artist: string; query: string }
): number {
  const queryTitle = normalize(profile.title);
  const queryArtist = normalize(profile.artist);
  const queryWords = words(profile.query);
  const candidateTitle = normalize(candidate.title);
  const candidateArtist = normalize(candidate.artist);
  const combined = `${candidateTitle} ${candidateArtist}`;
  let score = 0;

  for (const word of queryWords) {
    if (candidateTitle.includes(word)) score += 12;
    if (candidateArtist.includes(word)) score += 8;
  }

  if (queryTitle && candidateTitle.includes(queryTitle)) score += 80;
  if (queryArtist && combined.includes(queryArtist)) score += 90;

  for (const word of words(profile.title)) {
    if (candidateTitle.includes(word)) score += 18;
  }

  for (const word of words(profile.artist)) {
    if (combined.includes(word)) score += 22;
  }

  for (const keyword of positiveTitleKeywords) {
    if (candidateTitle.includes(keyword)) score += keyword.startsWith('official') ? 90 : 25;
  }

  for (const keyword of positiveChannelKeywords) {
    if (candidateArtist.includes(keyword)) score += keyword === 'official' ? 75 : 60;
  }

  for (const keyword of negativeKeywords) {
    if (combined.includes(keyword) && !keywordAllowed(keyword, profile.title)) {
      score -= keyword.includes('react') || keyword === 'reaction' ? 250 : 120;
    }
  }

  for (const keyword of liveVersionKeywords) {
    if (combined.includes(keyword) && !keywordAllowed(keyword, profile.title)) {
      score -= 140;
    }
  }

  return score;
}

/** Search YouTube and return top results as Track objects. */
export async function searchTracks(query: string, limit = 10): Promise<Track[]> {
  const profile = parseSearchQuery(query);
  const searchLimit = Math.min(Math.max(limit * 3, 15), 30);
  const rawResults = await ytDlp.execPromise([
    `ytsearch${searchLimit}:${profile.searchQuery}`,
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

  const ranked = tracks
    .map((track) => ({
      track,
      score: scoreSearchCandidate(track, { ...profile, query }),
    }))
    .sort((a, b) => b.score - a.score);

  console.log(
    `[search:ytdlp] ${JSON.stringify({
      query,
      searchQuery: profile.searchQuery,
      top: ranked.slice(0, 5).map((item) => ({
        id: item.track.id,
        title: item.track.title,
        artist: item.track.artist,
        score: item.score,
      })),
    })}`
  );

  return ranked.slice(0, limit).map((item) => item.track);
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
