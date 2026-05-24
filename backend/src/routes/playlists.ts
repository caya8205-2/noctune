import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createPlaylist,
  getPlaylist,
  getAllPlaylists,
  renamePlaylist,
  deletePlaylist,
  addTrackToPlaylist,
  removeTrackFromPlaylist,
  importPlaylist,
} from '../services/playlist.js';
import { parseMediaUrl } from '../services/urlParser.js';
import { getSpotifyPlaylistTracks } from '../services/spotify.js';
import { getYoutubePlaylistTracks } from '../services/ytdlp.js';

const CreateBody = z.object({ name: z.string().min(1).max(100) });
const RenameBody = z.object({ name: z.string().min(1).max(100) });
const TrackBody = z.object({ trackId: z.string().min(1) });
const ImportBody = z.object({
  url: z.string().url(),
  name: z.string().min(1).max(100).optional(),
});

export async function playlistRoutes(app: FastifyInstance) {
  app.get('/playlists', async (_req, reply) => {
    return reply.send(getAllPlaylists());
  });

  app.post('/playlists', async (req, reply) => {
    const parsed = CreateBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid body' });
    const playlist = createPlaylist(parsed.data.name);
    return reply.status(201).send(playlist);
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
        ? await getSpotifyPlaylistTracks(parsedUrl.id, 100)
        : await getYoutubePlaylistTracks(parsedUrl.url, 100);

      if (imported.tracks.length === 0) {
        return reply.status(404).send({ error: 'No tracks found in playlist' });
      }

      const playlist = importPlaylist(parsed.data.name ?? imported.name, imported.tracks);
      return reply.status(201).send({ ok: true, playlist, imported: imported.tracks.length });
    } catch (err) {
      return reply.status(502).send({
        error: 'Playlist import failed',
        message: (err as Error).message,
      });
    }
  });

  app.get<{ Params: { id: string } }>('/playlists/:id', async (req, reply) => {
    const playlist = getPlaylist(req.params.id);
    if (!playlist) return reply.status(404).send({ error: 'Playlist not found' });
    return reply.send(playlist);
  });

  app.patch<{ Params: { id: string } }>('/playlists/:id', async (req, reply) => {
    const parsed = RenameBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid body' });
    renamePlaylist(req.params.id, parsed.data.name);
    return reply.send({ ok: true });
  });

  app.delete<{ Params: { id: string } }>('/playlists/:id', async (req, reply) => {
    deletePlaylist(req.params.id);
    return reply.send({ ok: true });
  });

  app.post<{ Params: { id: string } }>('/playlists/:id/tracks', async (req, reply) => {
    const parsed = TrackBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid body' });
    addTrackToPlaylist(req.params.id, parsed.data.trackId);
    return reply.status(201).send({ ok: true });
  });

  app.delete<{ Params: { id: string; trackId: string } }>(
    '/playlists/:id/tracks/:trackId',
    async (req, reply) => {
      removeTrackFromPlaylist(req.params.id, req.params.trackId);
      return reply.send({ ok: true });
    }
  );
}
