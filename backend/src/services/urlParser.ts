export type ParsedMediaUrl =
  | { kind: 'youtube-video'; id: string; url: string }
  | { kind: 'youtube-playlist'; id: string; url: string }
  | { kind: 'spotify-track'; id: string; url: string }
  | { kind: 'spotify-playlist'; id: string; url: string };

export function parseMediaUrl(input: string): ParsedMediaUrl | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase();

  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0];
    return id ? { kind: 'youtube-video', id, url: url.toString() } : null;
  }

  if (host.endsWith('youtube.com') || host === 'music.youtube.com') {
    const playlistId = url.searchParams.get('list');
    if (playlistId && !url.searchParams.get('v')) {
      return { kind: 'youtube-playlist', id: playlistId, url: url.toString() };
    }

    const videoId = url.searchParams.get('v') || url.pathname.match(/\/shorts\/([^/?]+)/)?.[1];
    if (videoId) return { kind: 'youtube-video', id: videoId, url: url.toString() };
    if (playlistId) return { kind: 'youtube-playlist', id: playlistId, url: url.toString() };
  }

  if (host === 'open.spotify.com') {
    const [type, id] = url.pathname.split('/').filter(Boolean);
    if (type === 'track' && id) return { kind: 'spotify-track', id, url: url.toString() };
    if (type === 'playlist' && id) return { kind: 'spotify-playlist', id, url: url.toString() };
  }

  return null;
}
