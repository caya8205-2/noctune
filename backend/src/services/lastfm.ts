const BASE_URL = 'https://ws.audioscrobbler.com/2.0/';

function getApiKey(): string {
  const key = process.env.LAST_FM_KEY;
  if (!key) throw new Error('LAST_FM_KEY not configured');
  return key;
}

export function isLastFmConfigured(): boolean {
  return Boolean(process.env.LAST_FM_KEY);
}

interface LastFmSimilarTrack {
  name: string;
  artist: { name: string };
  match: number; // 0–1 similarity score
}

interface LastFmSimilarResponse {
  similartracks?: {
    track?: LastFmSimilarTrack[];
  };
  error?: number;
  message?: string;
}

export interface SimilarTrack {
  title: string;
  artist: string;
  match: number;
}

export async function getSimilarTracks(
  title: string,
  artist: string,
  limit = 20
): Promise<SimilarTrack[]> {
  const params = new URLSearchParams({
    method: 'track.getSimilar',
    track: title,
    artist,
    limit: String(limit),
    autocorrect: '1',
    api_key: getApiKey(),
    format: 'json',
  });

  const res = await fetch(`${BASE_URL}?${params}`);
  if (!res.ok) throw new Error(`Last.fm HTTP ${res.status}`);

  const data = (await res.json()) as LastFmSimilarResponse;

  if (data.error) {
    // error 6 = track not found — not fatal, just return empty
    if (data.error === 6) return [];
    throw new Error(`Last.fm error ${data.error}: ${data.message}`);
  }

  return (data.similartracks?.track ?? []).map((t) => ({
    title: t.name,
    artist: t.artist.name,
    match: t.match,
  }));
}