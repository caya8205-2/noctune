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
} from '../services/playlist.js';

const CreateBody = z.object({ name: z.string().min(1).max(100) });
const RenameBody = z.object({ name: z.string().min(1).max(100) });
const TrackBody = z.object({ trackId: z.string().min(1) });

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
