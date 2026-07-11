import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as fs from 'fs';
import path from 'path';
import {
  scanFile,
  scanDirectory,
  getLibrary,
  getLocalFile,
  deleteLocalFile,
  deleteFolder,
  getFolders,
  getFilesByImportRoot,
  UNGROUPED_IMPORT_ROOT,
} from '../services/localFiles.js';

const ScanBody = z.object({
  path: z.string().min(1),
});

const LibraryQuery = z.object({
  limit: z.coerce.number().int().positive().max(500).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
  // When provided, filter by import_root. Use empty string for ungrouped ("Imported Files").
  importRoot: z.string().optional(),
});

const DeleteFolderBody = z.object({
  path: z.string(),
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

function mapFileResponse(f: NonNullable<ReturnType<typeof getLocalFile>>) {
  return {
    ...f,
    id: `local:${f.id}`,
  };
}

export async function localFilesRoutes(app: FastifyInstance) {
  // ── Static / collection routes first (before /:id) ───────────────────────

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
    let importRoot: string | undefined;

    if (stat.isDirectory()) {
      const result = await scanDirectory(targetPath);
      scanned = result.scanned;
      failed = result.failed;
      importRoot = result.importRoot;
    } else if (stat.isFile()) {
      const file = await scanFile(targetPath);
      if (file) {
        scanned = 1;
        importRoot = file.importRoot;
      } else {
        failed = 1;
      }
    } else {
      return reply.status(400).send({ error: 'Path is neither a file nor a directory' });
    }

    console.log(
      `[localFiles] scan complete: path=${targetPath} scanned=${scanned} failed=${failed} importRoot=${importRoot ?? ''}`
    );
    return reply.send({
      ok: true,
      scanned,
      failed,
      importRoot: importRoot ?? UNGROUPED_IMPORT_ROOT,
      folderName: importRoot ? path.basename(importRoot) || importRoot : 'Imported Files',
    });
  });

  app.get('/local-files/library', async (req, reply) => {
    const parsed = LibraryQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid query', issues: parsed.error.issues });
    }

    const { limit, offset, importRoot } = parsed.data;
    const hasFolderFilter = Object.prototype.hasOwnProperty.call(req.query as object, 'importRoot');
    const { files, total } = getLibrary(
      limit,
      offset,
      hasFolderFilter ? (importRoot ?? UNGROUPED_IMPORT_ROOT) : null
    );

    return reply.send({
      files: files.map(mapFileResponse),
      total,
      limit,
      offset,
      importRoot: hasFolderFilter ? (importRoot ?? UNGROUPED_IMPORT_ROOT) : null,
    });
  });

  app.get('/local-files/folders', async (_req, reply) => {
    const folders = getFolders();
    return reply.send({ folders, total: folders.length });
  });

  app.delete('/local-files/folder', async (req, reply) => {
    const parsed = DeleteFolderBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', issues: parsed.error.issues });
    }

    const deleted = deleteFolder(parsed.data.path);
    return reply.send({ ok: true, deleted });
  });

  // Back-compat: directories list (paths only)
  app.get('/local-files/directories', async (_req, reply) => {
    const folders = getFolders().filter((f) => !f.isUngrouped);
    return reply.send({ directories: folders.map((f) => f.path) });
  });

  // Back-compat: files by path (import root preferred)
  app.get('/local-files/by-folder', async (req, reply) => {
    const q = z.object({ path: z.string() }).safeParse(req.query);
    if (!q.success) {
      return reply.status(400).send({ error: 'Missing path query' });
    }
    const files = getFilesByImportRoot(q.data.path);
    return reply.send({
      directory: q.data.path,
      files: files.map(mapFileResponse),
      total: files.length,
    });
  });

  // ── Param routes ─────────────────────────────────────────────────────────

  app.get<{ Params: { id: string } }>('/local-files/:id', async (req, reply) => {
    const rawId = req.params.id.replace(/^local:/, '');
    const file = getLocalFile(rawId);
    if (!file) {
      return reply.status(404).send({ error: 'File not found' });
    }

    return reply.send(mapFileResponse(file));
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
}
