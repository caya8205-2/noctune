import { getEnvConfig } from './env.js';
import type { Track } from '../types/index.js';
import fs from 'fs';
import path from 'path';

interface SpotifyTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
}

interface SpotifyTrack {
    id: string;
    name: string;
    duration_ms: number;
    artists: Array<{ id: string; name: string; external_urls?: { spotify?: string } }>;
    album: {
        id: string;
        name: string;
        album_type?: string;
        release_date?: string;
        total_tracks?: number;
        images: Array<{ url: string; width: number; height: number }>;
        external_urls?: { spotify?: string };
    };
    external_urls: { spotify: string };
    explicit?: boolean;
    popularity?: number;
    track_number?: number;
    disc_number?: number;
    external_ids?: { isrc?: string; ean?: string; upc?: string };
}

interface SpotifyArtistDetail {
    id: string;
    name: string;
    genres?: string[];
    popularity?: number;
    followers?: { total?: number };
    images?: Array<{ url: string; width: number; height: number }>;
    external_urls?: { spotify?: string };
}

interface SpotifyAlbumDetail {
    id: string;
    name: string;
    album_type?: string;
    release_date?: string;
    total_tracks?: number;
    label?: string;
    copyrights?: Array<{ text: string; type: string }>;
    images?: Array<{ url: string; width: number; height: number }>;
    external_urls?: { spotify?: string };
}

export interface SpotifyTrackMetadata {
    id: string;
    title: string;
    artists: Array<{
        id: string;
        name: string;
        genres: string[];
        popularity?: number;
        followers?: number;
        image?: string;
        spotifyUrl?: string;
    }>;
    album: {
        id: string;
        name: string;
        type?: string;
        releaseDate?: string;
        totalTracks?: number;
        label?: string;
        image?: string;
        spotifyUrl?: string;
    };
    duration: number;
    explicit: boolean;
    popularity?: number;
    trackNumber?: number;
    discNumber?: number;
    isrc?: string;
    spotifyUrl?: string;
    cachedAt: number;
}

interface SpotifyAlbum {
    id: string;
    name: string;
    images: Array<{ url: string; width: number; height: number }>;
    artists: Array<{ id?: string; name: string }>;
}

interface SpotifyAlbumTrack {
    id: string;
    name: string;
    duration_ms: number;
    artists: Array<{ id?: string; name: string }>;
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

interface SpotifyMetadataStore {
    version: number;
    updatedAt: number;
    tracks: Record<string, SpotifyTrackMetadata>;
}

const CACHE_VERSION = 1;
const DATA_DIR = process.env.APP_DATA_DIR
    ? path.resolve(process.env.APP_DATA_DIR)
    : path.join(process.cwd(), 'data');
const METADATA_CACHE_FILE = path.join(DATA_DIR, 'spotify-metadata.json');
const METADATA_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// In-memory token cache
let _token: string | null = null;
let _tokenExpiry = 0;
let _metadataStore: SpotifyMetadataStore | null = null;

function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function emptyMetadataStore(): SpotifyMetadataStore {
    return { version: CACHE_VERSION, updatedAt: Date.now(), tracks: {} };
}

function loadMetadataStore(): SpotifyMetadataStore {
    ensureDataDir();
    if (!fs.existsSync(METADATA_CACHE_FILE)) return emptyMetadataStore();
    try {
        const parsed = JSON.parse(fs.readFileSync(METADATA_CACHE_FILE, 'utf-8')) as Partial<SpotifyMetadataStore>;
        if (!parsed.tracks || typeof parsed.tracks !== 'object' || Array.isArray(parsed.tracks)) {
            return emptyMetadataStore();
        }
        return {
            version: typeof parsed.version === 'number' ? parsed.version : CACHE_VERSION,
            updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
            tracks: parsed.tracks,
        };
    } catch {
        return emptyMetadataStore();
    }
}

function getMetadataStore(): SpotifyMetadataStore {
    _metadataStore ??= loadMetadataStore();
    return _metadataStore;
}

function saveMetadataStore(store: SpotifyMetadataStore) {
    ensureDataDir();
    store.updatedAt = Date.now();
    fs.writeFileSync(METADATA_CACHE_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

function pickImage(images: Array<{ url: string; width: number; height: number }> | undefined): string | undefined {
    if (!images?.length) return undefined;
    const sorted = [...images].sort((a, b) => b.width - a.width);
    return (sorted.find((image) => image.width <= 640) ?? sorted[0])?.url;
}

async function getAccessToken(): Promise<string> {
    const config = getEnvConfig();
    const clientId = config.spotifyClientId.trim();
    const clientSecret = config.spotifyClientSecret.trim();

    if (!clientId || !clientSecret) {
        throw new Error('Spotify credentials not configured');
    }

    // Return cached token if still valid (with 60s buffer)
    if (_token && Date.now() < _tokenExpiry - 60_000) {
        return _token;
    }

    const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

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

/** Robust Spotify API fetch helper with automatic 401 token refresh & 1-step retry */
export async function spotifyApiFetch<T>(urlInput: string | URL, retryCount = 0): Promise<T> {
    const token = await getAccessToken();
    const url = typeof urlInput === 'string'
        ? (urlInput.startsWith('http') ? urlInput : `https://api.spotify.com/v1${urlInput}`)
        : urlInput.toString();

    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401 && retryCount === 0) {
        invalidateToken();
        return spotifyApiFetch<T>(urlInput, 1);
    }

    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Spotify API failed (${res.status}): ${errText || res.statusText}`);
    }

    return res.json() as Promise<T>;
}

/** Exported fetch helper for other modules that need Spotify API access */
export async function spotifyFetch<T>(path: string): Promise<T> {
    return spotifyApiFetch<T>(path);
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
        album: st.album.name,
        duration: Math.round(st.duration_ms / 1000),
        thumbnail: image?.url ?? '',
        query,
        spotifyId: st.id,
        spotifyUrl: st.external_urls.spotify,
        artistId: st.artists[0]?.id,
        albumId: st.album.id,
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
        album: album.name,
        duration: Math.round(st.duration_ms / 1000),
        thumbnail: image?.url ?? '',
        query,
        spotifyId: st.id,
        spotifyUrl: st.external_urls.spotify,
        artistId: st.artists[0]?.id ?? album.artists[0]?.id,
        albumId: album.id,
    };
}

/** Search Spotify catalog. Returns Track[] with spotify: prefixed ids. */
export async function searchSpotify(query: string, limit = 10): Promise<Track[]> {
    const url = new URL('https://api.spotify.com/v1/search');
    url.searchParams.set('q', query);
    url.searchParams.set('type', 'track');
    url.searchParams.set('limit', String(limit));

    const data = await spotifyApiFetch<SpotifySearchResponse>(url);
    return data.tracks.items.map((t) => spotifyTrackToTrack(t, query));
}

/** Check if Spotify credentials are configured and valid by calling Spotify API */
export async function testSpotifyCredentials(): Promise<{ ok: boolean; error?: string }> {
    try {
        invalidateToken();
        await spotifyApiFetch<SpotifySearchResponse>('/search?q=test&type=track&limit=1');
        return { ok: true };
    } catch (err) {
        return { ok: false, error: (err as Error).message };
    }
}

export async function getSpotifyTrackById(id: string, query = id): Promise<Track> {
    const data = await spotifyApiFetch<SpotifyTrack>(`/tracks/${id}`);
    return spotifyTrackToTrack(data, query);
}

export async function getSpotifyTrackMetadata(id: string): Promise<SpotifyTrackMetadata> {
    const cached = getMetadataStore().tracks[id];
    if (cached && Date.now() - cached.cachedAt < METADATA_TTL_MS) return cached;

    const track = await spotifyApiFetch<SpotifyTrack>(`/tracks/${id}`);
    const artistIds = track.artists.map((artist) => artist.id).filter(Boolean);

    const [artists, album] = await Promise.all([
        artistIds.length
            ? Promise.all(artistIds.map((artistId) => spotifyApiFetch<SpotifyArtistDetail>(`/artists/${artistId}`)))
            : Promise.resolve([]),
        track.album.id
            ? spotifyApiFetch<SpotifyAlbumDetail>(`/albums/${track.album.id}`)
            : Promise.resolve(null),
    ]);

    const metadata: SpotifyTrackMetadata = {
        id: track.id,
        title: track.name,
        artists: track.artists.map((artist) => {
            const detail = artists.find((item) => item.id === artist.id);
            return {
                id: artist.id,
                name: artist.name,
                genres: detail?.genres ?? [],
                popularity: detail?.popularity,
                followers: detail?.followers?.total,
                image: pickImage(detail?.images),
                spotifyUrl: detail?.external_urls?.spotify ?? artist.external_urls?.spotify,
            };
        }),
        album: {
            id: track.album.id,
            name: album?.name ?? track.album.name,
            type: album?.album_type ?? track.album.album_type,
            releaseDate: album?.release_date ?? track.album.release_date,
            totalTracks: album?.total_tracks ?? track.album.total_tracks,
            label: album?.label,
            image: pickImage(album?.images ?? track.album.images),
            spotifyUrl: album?.external_urls?.spotify ?? track.album.external_urls?.spotify,
        },
        duration: Math.round(track.duration_ms / 1000),
        explicit: Boolean(track.explicit),
        popularity: track.popularity,
        trackNumber: track.track_number,
        discNumber: track.disc_number,
        isrc: track.external_ids?.isrc,
        spotifyUrl: track.external_urls.spotify,
        cachedAt: Date.now(),
    };

    const store = getMetadataStore();
    store.tracks[id] = metadata;
    saveMetadataStore(store);
    return metadata;
}

export async function getSpotifyPlaylistTracks(id: string, limit = 2000): Promise<{
    name: string;
    tracks: Track[];
}> {
    const firstUrl = new URL(`https://api.spotify.com/v1/playlists/${id}`);
    firstUrl.searchParams.set('fields', 'name,tracks.items(track(id,name,duration_ms,artists(id,name),album(id,name,images),external_urls)),tracks.next');
    firstUrl.searchParams.set('limit', '100');

    const firstData = await spotifyApiFetch<SpotifyPlaylistResponse>(firstUrl);
    const playlistName = firstData.name || 'Spotify Playlist';
    const allItems = [...firstData.tracks.items];
    let nextUrl: string | null = firstData.tracks.next;

    while (nextUrl && allItems.length < limit) {
        try {
            const pageData = await spotifyApiFetch<SpotifyPlaylistResponse['tracks']>(nextUrl);
            allItems.push(...pageData.items);
            nextUrl = pageData.next;
        } catch {
            break;
        }
    }

    return {
        name: playlistName,
        tracks: allItems
            .map((item) => item.track)
            .filter((track): track is SpotifyTrack => Boolean(track?.id))
            .slice(0, limit)
            .map((track) => spotifyTrackToTrack(track, playlistName)),
    };
}

export async function getSpotifyNewReleaseTracks(limit = 8): Promise<Track[]> {
    const url = new URL('https://api.spotify.com/v1/browse/new-releases');
    url.searchParams.set('limit', String(Math.min(Math.max(limit, 1), 12)));

    const data = await spotifyApiFetch<SpotifyNewReleasesResponse>(url);
    const tracks: Track[] = [];

    for (const album of data.albums.items) {
        if (tracks.length >= limit) break;

        const tracksUrl = new URL(`https://api.spotify.com/v1/albums/${album.id}/tracks`);
        tracksUrl.searchParams.set('limit', '1');

        try {
            const albumTracks = await spotifyApiFetch<SpotifyAlbumTracksResponse>(tracksUrl);
            const firstTrack = albumTracks.items[0];
            if (firstTrack) {
                tracks.push(spotifyAlbumTrackToTrack(firstTrack, album, 'new releases'));
            }
        } catch {
            continue;
        }
    }

    return tracks;
}
