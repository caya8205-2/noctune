import { getEnvConfig } from './env.js';
import type { Track } from '../types/index.js';

interface SpotifyTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
}

interface SpotifyTrack {
    id: string;
    name: string;
    duration_ms: number;
    artists: Array<{ name: string }>;
    album: {
        name: string;
        images: Array<{ url: string; width: number; height: number }>;
    };
    external_urls: { spotify: string };
}

interface SpotifyAlbum {
    id: string;
    images: Array<{ url: string; width: number; height: number }>;
    artists: Array<{ name: string }>;
}

interface SpotifyAlbumTrack {
    id: string;
    name: string;
    duration_ms: number;
    artists: Array<{ name: string }>;
    external_urls: { spotify: string };
}

interface SpotifySearchResponse {
    tracks: {
        items: SpotifyTrack[];
        total: number;
    };
}

interface SpotifyPlaylistResponse {
    name: string;
    tracks: {
        items: Array<{ track: SpotifyTrack | null }>;
        next: string | null;
    };
}

interface SpotifyNewReleasesResponse {
    albums: {
        items: SpotifyAlbum[];
    };
}

interface SpotifyAlbumTracksResponse {
    items: SpotifyAlbumTrack[];
}

// In-memory token cache
let _token: string | null = null;
let _tokenExpiry = 0;

async function getAccessToken(): Promise<string> {
    const config = getEnvConfig();
    if (!config.spotifyClientId || !config.spotifyClientSecret) {
        throw new Error('Spotify credentials not configured');
    }

    // Return cached token if still valid (with 60s buffer)
    if (_token && Date.now() < _tokenExpiry - 60_000) {
        return _token;
    }

    const creds = Buffer.from(
        `${config.spotifyClientId}:${config.spotifyClientSecret}`
    ).toString('base64');

    const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            Authorization: `Basic ${creds}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Spotify auth failed: ${res.status} — ${err}`);
    }

    const data = (await res.json()) as SpotifyTokenResponse;
    _token = data.access_token;
    _tokenExpiry = Date.now() + data.expires_in * 1000;
    return _token;
}

/** Invalidate cached token (call after 401) */
export function invalidateToken(): void {
    _token = null;
    _tokenExpiry = 0;
}

function spotifyTrackToTrack(st: SpotifyTrack, query: string): Track {
    const image =
        st.album.images.find((i) => i.width <= 640) ??
        st.album.images[0] ??
        null;

    return {
        id: `spotify:${st.id}`, // prefixed so we know it came from Spotify
        title: st.name,
        artist: st.artists.map((a) => a.name).join(', '),
        duration: Math.round(st.duration_ms / 1000),
        thumbnail: image?.url ?? '',
        query,
        spotifyId: st.id,
        spotifyUrl: st.external_urls.spotify,
    };
}

function spotifyAlbumTrackToTrack(
    st: SpotifyAlbumTrack,
    album: SpotifyAlbum,
    query: string
): Track {
    const image =
        album.images.find((i) => i.width <= 640) ??
        album.images[0] ??
        null;

    return {
        id: `spotify:${st.id}`,
        title: st.name,
        artist: st.artists.map((a) => a.name).join(', ') || album.artists.map((a) => a.name).join(', '),
        duration: Math.round(st.duration_ms / 1000),
        thumbnail: image?.url ?? '',
        query,
        spotifyId: st.id,
        spotifyUrl: st.external_urls.spotify,
    };
}

/** Search Spotify catalog. Returns Track[] with spotify: prefixed ids. */
export async function searchSpotify(query: string, limit = 10): Promise<Track[]> {
    const token = await getAccessToken();

    const url = new URL('https://api.spotify.com/v1/search');
    url.searchParams.set('q', query);
    url.searchParams.set('type', 'track');
    url.searchParams.set('limit', String(limit));

    const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
        invalidateToken();
        throw new Error('Spotify token expired — retry');
    }

    if (!res.ok) {
        throw new Error(`Spotify search failed: ${res.status}`);
    }

    const data = (await res.json()) as SpotifySearchResponse;
    return data.tracks.items.map((t) => spotifyTrackToTrack(t, query));
}

/** Check if Spotify credentials are configured and valid */
export async function testSpotifyCredentials(): Promise<{ ok: boolean; error?: string }> {
    try {
        await getAccessToken();
        return { ok: true };
    } catch (err) {
        return { ok: false, error: (err as Error).message };
    }
}

export async function getSpotifyTrackById(id: string, query = id): Promise<Track> {
    const token = await getAccessToken();
    const res = await fetch(`https://api.spotify.com/v1/tracks/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
        invalidateToken();
        throw new Error('Spotify token expired — retry');
    }

    if (!res.ok) {
        throw new Error(`Spotify track failed: ${res.status}`);
    }

    return spotifyTrackToTrack((await res.json()) as SpotifyTrack, query);
}

export async function getSpotifyPlaylistTracks(id: string, limit = 100): Promise<{
    name: string;
    tracks: Track[];
}> {
    const token = await getAccessToken();
    const url = new URL(`https://api.spotify.com/v1/playlists/${id}`);
    url.searchParams.set('fields', 'name,tracks.items(track(id,name,duration_ms,artists(name),album(name,images),external_urls)),tracks.next');
    url.searchParams.set('limit', String(Math.min(Math.max(limit, 1), 100)));

    const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
        invalidateToken();
        throw new Error('Spotify token expired — retry');
    }

    if (!res.ok) {
        throw new Error(`Spotify playlist failed: ${res.status}`);
    }

    const data = (await res.json()) as SpotifyPlaylistResponse;
    return {
        name: data.name || 'Spotify Playlist',
        tracks: data.tracks.items
            .map((item) => item.track)
            .filter((track): track is SpotifyTrack => Boolean(track?.id))
            .slice(0, limit)
            .map((track) => spotifyTrackToTrack(track, data.name || 'Spotify playlist')),
    };
}

export async function getSpotifyNewReleaseTracks(limit = 8): Promise<Track[]> {
    const token = await getAccessToken();

    const url = new URL('https://api.spotify.com/v1/browse/new-releases');
    url.searchParams.set('limit', String(Math.min(Math.max(limit, 1), 12)));

    const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
        invalidateToken();
        throw new Error('Spotify token expired — retry');
    }

    if (!res.ok) {
        throw new Error(`Spotify new releases failed: ${res.status}`);
    }

    const data = (await res.json()) as SpotifyNewReleasesResponse;
    const tracks: Track[] = [];

    for (const album of data.albums.items) {
        if (tracks.length >= limit) break;

        const tracksUrl = new URL(`https://api.spotify.com/v1/albums/${album.id}/tracks`);
        tracksUrl.searchParams.set('limit', '1');

        const trackRes = await fetch(tracksUrl.toString(), {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!trackRes.ok) continue;

        const albumTracks = (await trackRes.json()) as SpotifyAlbumTracksResponse;
        const firstTrack = albumTracks.items[0];
        if (!firstTrack) continue;
        tracks.push(spotifyAlbumTrackToTrack(firstTrack, album, 'new releases'));
    }

    return tracks;
}
