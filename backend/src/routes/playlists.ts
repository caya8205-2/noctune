import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createPlaylist,
  getPlaylist,
  getAllPlaylists,
  updatePlaylist,
  deletePlaylist,
  addTrackToPlaylist,
  removeTrackFromPlaylist,
  reorderPlaylistTracks,
  importPlaylist,
  getOrCreateLikedPlaylist,
  toggleLikedTrack,
  playlistNameExists,
} from '../services/playlist.js';
import { parseMediaUrl } from '../services/urlParser.js';
import { getSpotifyPlaylistTracks } from '../services/spotify.js';
import { getYoutubePlaylistTracks } from '../services/audioResolver.js';

const CreateBody = z.object({ name: z.string().min(1).max(100) });
const UpdateBody = z.object({
  name: z.string().min(1).max(100).optional(),
  coverDataUrl: z
    .union([
      z
        .string()
        .max(2_500_000)
        .refine((value) => /^data:image\/(png|jpe?g|webp);base64,/i.test(value), 'Invalid image data'),
      z.null(),
    ])
    .optional(),
}).refine((value) => value.name !== undefined || value.coverDataUrl !== undefined);
const TrackBody = z.object({ trackId: z.string().min(1) });
const TrackMetadataBody = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  artist: z.string().default(''),
  duration: z.number().default(0),
  thumbnail: z.string().default(''),
  query: z.string().default(''),
  spotifyId: z.string().optional(),
  spotifyUrl: z.string().optional(),
  youtubeId: z.string().optional(),
  youtubeTitle: z.string().optional(),
  youtubeArtist: z.string().optional(),
});
const ImportBody = z.object({
  url: z.string().url(),
  name: z.string().min(1).max(100).optional(),
});

export async function playlistRoutes(app: FastifyInstance) {
  app.get('/library/liked', async (_req, reply) => {
    return reply.send(getOrCreateLikedPlaylist());
  });

  app.post('/library/liked/toggle', async (req, reply) => {
    const parsed = TrackMetadataBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid body' });
    const result = toggleLikedTrack(parsed.data);
    return reply.send(result);
  });

  app.get('/playlists', async (_req, reply) => {
    getOrCreateLikedPlaylist();
    return reply.send(getAllPlaylists());
  });

  app.post('/playlists', async (req, reply) => {
    const parsed = CreateBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid body' });
    try {
      const playlist = createPlaylist(parsed.data.name);
      return reply.status(201).send(playlist);
    } catch (err) {
      return reply.status(409).send({ error: (err as Error).message });
    }
  });

  app.post('/playlists/import', async (req, reply) => {
    const parsed = ImportBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid body' });

    const parsedUrl = parseMediaUrl(parsed.data.url);
    const isYoutubePlaylistUrl = parsed.data.url.includes('list=');
    if (
      !parsedUrl ||
      (parsedUrl.kind !== 'youtube-playlist' &&
        parsedUrl.kind !== 'spotify-playlist' &&
        !(parsedUrl.kind === 'youtube-video' && isYoutubePlaylistUrl))
    ) {
      return reply.status(400).send({ error: 'Paste a YouTube or Spotify playlist URL' });
    }

    try {
      const imported = parsedUrl.kind === 'spotify-playlist'
        ? await getSpotifyPlaylistTracks(parsedUrl.id)
        : await getYoutubePlaylistTracks(parsedUrl.url);

      if (imported.tracks.length === 0) {
        return reply.status(404).send({ error: 'No tracks found in playlist' });
      }

      const playlistName = parsed.data.name ?? imported.name;
      if (playlistNameExists(playlistName)) {
        return reply.status(409).send({ error: 'Playlist already exists' });
      }

      const result = importPlaylist(playlistName, imported.tracks);
      return reply.status(201).send({ ok: true, playlist: result.playlist, imported: result.imported });
    } catch (err) {
      return reply.status(502).send({
        error: 'Playlist import failed',
        message: (err as Error).message,
      });
    }
  });

  app.get<{ Params: { id: string } }>('/playlists/:id', async (req, reply) => {
    if (req.params.id.startsWith('ytplaylist:')) {
      try {
        const ytId = req.params.id.replace(/^ytplaylist:/, '');
        const data = await getYoutubePlaylistTracks(`https://www.youtube.com/playlist?list=${ytId}`, 2000);
        return reply.send({
          id: req.params.id,
          name: data.name,
          tracks: data.tracks,
          itemCount: data.tracks.length,
          coverUrl: (data as any).image ?? null,
        });
      } catch (err) {
        return reply.status(404).send({ error: 'YouTube playlist not found', message: (err as Error).message });
      }
    }
    const playlist = getPlaylist(req.params.id);
    if (!playlist) return reply.status(404).send({ error: 'Playlist not found' });
    return reply.send(playlist);
  });

  app.patch<{ Params: { id: string } }>('/playlists/:id', async (req, reply) => {
    const parsed = UpdateBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid body' });
    if (req.params.id === 'system-liked-songs') {
      return reply.status(403).send({ error: 'System playlists cannot be edited' });
    }
    updatePlaylist(req.params.id, parsed.data);
    const playlist = getPlaylist(req.params.id);
    if (!playlist) return reply.status(404).send({ error: 'Playlist not found' });
    return reply.send({ ok: true, playlist });
  });

  app.delete<{ Params: { id: string } }>('/playlists/:id', async (req, reply) => {
    deletePlaylist(req.params.id);
    return reply.send({ ok: true });
  });

  app.post<{ Params: { id: string } }>('/playlists/:id/tracks', async (req, reply) => {
    const parsed = z.union([TrackBody, TrackMetadataBody]).safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid body' });
    if ('trackId' in parsed.data) {
      const added = addTrackToPlaylist(req.params.id, parsed.data.trackId);
      return reply.status(added ? 201 : 200).send({ ok: true, added });
    } else {
      const added = addTrackToPlaylist(req.params.id, parsed.data.spotifyId ? `spotify:${parsed.data.spotifyId}` : parsed.data.id, parsed.data);
      return reply.status(added ? 201 : 200).send({ ok: true, added });
    }
  });

  app.patch<{ Params: { id: string } }>('/playlists/:id/tracks/reorder', async (req, reply) => {
    const { fromIndex, toIndex } = req.body as { fromIndex: number; toIndex: number };
    if (typeof fromIndex !== 'number' || typeof toIndex !== 'number') {
      return reply.status(400).send({ error: 'fromIndex and toIndex are required' });
    }
    reorderPlaylistTracks(req.params.id, fromIndex, toIndex);
    return reply.send({ ok: true });
  });

  app.delete<{ Params: { id: string; trackId: string } }>(
    '/playlists/:id/tracks/:trackId',
    async (req, reply) => {
      removeTrackFromPlaylist(req.params.id, req.params.trackId);
      return reply.send({ ok: true });
    }
  );
}

