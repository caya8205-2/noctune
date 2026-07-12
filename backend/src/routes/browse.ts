import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { spotifyFetch } from '../services/spotify.js';
import { getChannelInfo, getChannelIdForVideo } from '../services/youtubei.js';

interface SpotifyArtistRaw {
  id: string;
  name: string;
  genres?: string[];
  popularity?: number;
  followers?: { total?: number };
  images?: Array<{ url: string; width: number; height: number }>;
  external_urls?: { spotify?: string };
}

interface SpotifyAlbumSimple {
  id: string;
  name: string;
  album_type?: string;
  release_date?: string;
  total_tracks?: number;
  images?: Array<{ url: string; width: number; height: number }>;
  external_urls?: { spotify?: string };
}

interface SpotifyAlbumFull extends SpotifyAlbumSimple {
  label?: string;
  popularity?: number;
  artists?: Array<{ id?: string; name: string }>;
  tracks?: {
    items: Array<{
      id: string;
      name: string;
      duration_ms: number;
      track_number: number;
      artists: Array<{ id?: string; name: string }>;
      external_urls?: { spotify?: string };
    }>;
  };
}

export async function browseRoutes(app: FastifyInstance) {

  // GET /browse/artist/:id — artist profile + top tracks + discography
  app.get<{ Params: { id: string } }>('/browse/artist/:id', async (req, reply) => {
    const parsed = z.object({ id: z.string().min(1).max(64) }).safeParse(req.params);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid artist id' });
    const { id } = parsed.data;

    try {
      const [artist, topTracksRaw, albumsRaw] = await Promise.all([
        spotifyFetch<SpotifyArtistRaw>(`/artists/${id}`),
        spotifyFetch<{ tracks: Array<{
          id: string;
          name: string;
          duration_ms: number;
          popularity?: number;
          album: { id: string; name: string; images?: Array<{ url: string }> };
          artists: Array<{ id?: string; name: string }>;
          external_urls?: { spotify?: string };
        }> }>(`/artists/${id}/top-tracks`),
        spotifyFetch<{ items: SpotifyAlbumSimple[] }>(
          `/artists/${id}/albums?include_groups=album,single&limit=20`
        ),
      ]);

      const image = artist.images?.find(i => i.width <= 640) ?? artist.images?.[0];

      return reply.send({
        id: artist.id,
        name: artist.name,
        genres: artist.genres ?? [],
        popularity: artist.popularity ?? null,
        followers: artist.followers?.total ?? null,
        image: image?.url ?? null,
        spotifyUrl: artist.external_urls?.spotify ?? null,
        topTracks: topTracksRaw.tracks.map(t => ({
          id: `spotify:${t.id}`,
          spotifyId: t.id,
          title: t.name,
          artist: t.artists.map(a => a.name).join(', '),
          artistId: t.artists[0]?.id ?? artist.id,
          album: t.album.name,
          albumId: t.album.id,
          duration: Math.round(t.duration_ms / 1000),
          thumbnail: t.album.images?.[0]?.url ?? '',
          popularity: t.popularity ?? null,
          spotifyUrl: t.external_urls?.spotify ?? null,
          query: `${t.name} ${t.artists[0]?.name ?? ''}`,
        })),
        albums: albumsRaw.items.map(a => ({
          id: a.id,
          name: a.name,
          type: a.album_type ?? 'album',
          releaseDate: a.release_date ?? null,
          totalTracks: a.total_tracks ?? 0,
          image: a.images?.find(i => i.width <= 640)?.url ?? a.images?.[0]?.url ?? null,
          spotifyUrl: a.external_urls?.spotify ?? null,
        })),
      });
    } catch (err) {
      app.log.warn({ err }, '[browse] artist fetch failed');
      return reply.status(502).send({ error: 'Artist unavailable', message: (err as Error).message });
    }
  });

  // GET /browse/album/:id — album info + full tracklist
  app.get<{ Params: { id: string } }>('/browse/album/:id', async (req, reply) => {
    const parsed = z.object({ id: z.string().min(1).max(64) }).safeParse(req.params);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid album id' });
    const { id } = parsed.data;

    try {
      const album = await spotifyFetch<SpotifyAlbumFull>(`/albums/${id}`);
      const image = album.images?.find(i => i.width <= 640) ?? album.images?.[0];

      return reply.send({
        id: album.id,
        name: album.name,
        type: album.album_type ?? 'album',
        releaseDate: album.release_date ?? null,
        totalTracks: album.total_tracks ?? 0,
        label: album.label ?? null,
        popularity: album.popularity ?? null,
        image: image?.url ?? null,
        spotifyUrl: album.external_urls?.spotify ?? null,
        artists: (album.artists ?? []).map(a => ({ id: a.id, name: a.name })),
        tracks: (album.tracks?.items ?? []).map(t => ({
          id: `spotify:${t.id}`,
          spotifyId: t.id,
          title: t.name,
          artist: t.artists.map(a => a.name).join(', '),
          artistId: t.artists[0]?.id ?? album.artists?.[0]?.id,
          album: album.name,
          albumId: album.id,
          trackNumber: t.track_number,
          duration: Math.round(t.duration_ms / 1000),
          thumbnail: image?.url ?? '',
          spotifyUrl: t.external_urls?.spotify ?? null,
          query: `${t.name} ${t.artists[0]?.name ?? ''}`,
        })),
      });
    } catch (err) {
      app.log.warn({ err }, '[browse] album fetch failed');
      return reply.status(502).send({ error: 'Album unavailable', message: (err as Error).message });
    }
  });

  // GET /browse/channel/:id — YouTube channel info + recent videos
  app.get<{ Params: { id: string } }>('/browse/channel/:id', async (req, reply) => {
    const parsed = z.object({ id: z.string().min(2).max(64) }).safeParse(req.params);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid channel id' });
    const { id } = parsed.data;

    try {
      const channel = await getChannelInfo(id);
      return reply.send(channel);
    } catch (err) {
      app.log.warn({ err }, '[browse] channel fetch failed');
      return reply.status(502).send({ error: 'Channel unavailable', message: (err as Error).message });
    }
  });

  // GET /browse/video-channel/:videoId — resolve channel ID from a video ID (lazy lookup)
  app.get<{ Params: { videoId: string } }>('/browse/video-channel/:videoId', async (req, reply) => {
    const parsed = z.object({ videoId: z.string().min(5).max(64) }).safeParse(req.params);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid video id' });
    const { videoId } = parsed.data;

    try {
      const channelId = await getChannelIdForVideo(videoId);
      return reply.send({ channelId });
    } catch (err) {
      app.log.warn({ err }, '[browse] video-channel lookup failed');
      return reply.status(502).send({ error: 'Lookup failed', message: (err as Error).message });
    }
  });
}
