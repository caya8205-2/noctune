import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as fs from 'fs';
import {
  scanFile,
  scanDirectory,
  getLibrary,
  getLocalFile,
  deleteLocalFile,
  getDirectories,
  getFilesByDirectory,
} from '../services/localFiles.js';

const ScanBody = z.object({
  path: z.string().min(1),
});

const LibraryQuery = z.object({
  limit: z.coerce.number().int().positive().max(500).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

function getContentType(filePath: string): string {
  const ext = filePath.toLowerCase().split('.').pop();
  const map: Record<string, string> = {
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    flac: 'audio/flac',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    webm: 'audio/webm',
  };
  return map[ext || ''] || 'audio/mpeg';
}

export async function localFilesRoutes(app: FastifyInstance) {
  app.post('/local-files/scan', async (req, reply) => {
    const parsed = ScanBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid path', issues: parsed.error.issues });
    }

    const { path: targetPath } = parsed.data;

    if (!fs.existsSync(targetPath)) {
      return reply.status(404).send({ error: 'Path does not exist' });
    }

    const stat = fs.statSync(targetPath);
    let scanned = 0;
    let failed = 0;

    if (stat.isDirectory()) {
      const result = await scanDirectory(targetPath);
      scanned = result.scanned;
      failed = result.failed;
    } else if (stat.isFile()) {
      const file = await scanFile(targetPath);
      if (file) {
        scanned = 1;
      } else {
        failed = 1;
      }
    } else {
      return reply.status(400).send({ error: 'Path is neither a file nor a directory' });
    }

    console.log(`[localFiles] scan complete: path=${targetPath} scanned=${scanned} failed=${failed}`);
    return reply.send({ ok: true, scanned, failed });
  });

  app.get('/local-files/library', async (req, reply) => {
    const parsed = LibraryQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid query', issues: parsed.error.issues });
    }

    const { limit, offset } = parsed.data;
    const { files, total } = getLibrary(limit, offset);

    return reply.send({
      files: files.map((f) => ({
        ...f,
        id: `local:${f.id}`,
      })),
      total,
      limit,
      offset,
    });
  });

  app.get<{ Params: { id: string } }>('/local-files/:id', async (req, reply) => {
    const rawId = req.params.id.replace(/^local:/, '');
    const file = getLocalFile(rawId);
    if (!file) {
      return reply.status(404).send({ error: 'File not found' });
    }

    return reply.send({
      ...file,
      id: `local:${file.id}`,
    });
  });

  app.get<{ Params: { id: string } }>('/local-files/:id/stream', async (req, reply) => {
    const rawId = req.params.id.replace(/^local:/, '');
    const file = getLocalFile(rawId);
    if (!file) {
      return reply.status(404).send({ error: 'File not found' });
    }

    if (!fs.existsSync(file.path)) {
      return reply.status(404).send({ error: 'Audio file not found on disk' });
    }

    const stat = fs.statSync(file.path);
    const total = stat.size;
    const contentType = getContentType(file.path);

    const range = req.headers.range;
    if (range) {
      const match = range.match(/^bytes=(\d+)-(\d*)$/i);
      const start = match ? Number(match[1]) : 0;
      const end = match?.[2] ? Number(match[2]) : total - 1;
      const safeEnd = Math.min(end, total - 1);

      reply
        .status(206)
        .header('Content-Type', contentType)
        .header('Accept-Ranges', 'bytes')
        .header('Content-Length', safeEnd - start + 1)
        .header('Content-Range', `bytes ${start}-${safeEnd}/${total}`)
        .header('Cache-Control', 'public, max-age=86400');

      return reply.send(fs.createReadStream(file.path, { start, end: safeEnd }));
    }

    reply
      .header('Content-Type', contentType)
      .header('Accept-Ranges', 'bytes')
      .header('Content-Length', total)
      .header('Cache-Control', 'public, max-age=86400');

    return reply.send(fs.createReadStream(file.path));
  });

  app.delete<{ Params: { id: string } }>('/local-files/:id', async (req, reply) => {
    const rawId = req.params.id.replace(/^local:/, '');
    const deleted = deleteLocalFile(rawId);

    if (!deleted) {
      return reply.status(404).send({ error: 'File not found' });
    }

    return reply.send({ ok: true });
  });

  app.get('/local-files/directories', async (req, reply) => {
    const directories = getDirectories();
    return reply.send({ directories });
  });

  app.get<{ Params: { directory: string } }>('/local-files/directory/:directory', async (req, reply) => {
    const directory = decodeURIComponent(req.params.directory);
    const files = getFilesByDirectory(directory);
    return reply.send({
      directory,
      files: files.map((f) => ({
        ...f,
        id: `local:${f.id}`,
      })),
      total: files.length,
    });
  });
}
