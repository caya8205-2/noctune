import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  debugSpotifyYoutubeMatch,
  listMatchCache,
  clearMatchCache,
  clearMatchCacheForSpotifyId,
  getMatchCacheStats,
} from '../services/youtubeMatcher.js';
import { getCacheStats } from '../services/cache.js';
import { getPrefetchStatus } from '../services/prefetch.js';
import { getAudioResolverStatus } from '../services/audioResolver.js';
import { getPlaybackBlacklist } from '../services/playbackBlacklist.js';
import { getDiscordRpcStatus } from '../services/discordRpc.js';
import { isDemoMode } from '../services/demoMode.js';

const MatcherQuery = z.object({
  title: z.string().min(1).max(200),
  artist: z.string().max(200).default(''),
  duration: z.coerce.number().min(0).default(0),
  spotifyId: z.string().optional(),
  thumbnail: z.string().optional(),
  limit: z.coerce.number().min(1).max(20).default(12),
});

function buildStatus() {
  return {
    cache: getCacheStats(),
    prefetch: getPrefetchStatus(),
    resolver: getAudioResolverStatus(),
    playbackBlacklist: { failedIds: getPlaybackBlacklist().length },
    matchCache: getMatchCacheStats(),
    discordRpc: getDiscordRpcStatus(),
    demoMode: isDemoMode(),
  };
}

function resolveFrontendDir() {
  const executableDir = path.dirname(process.execPath);
  const candidates = [
    process.env.NOCTUNE_FRONTEND_DIR,
    path.resolve(process.cwd(), 'frontend'),
    path.resolve(process.cwd(), '..', 'frontend'),
    path.resolve(__dirname, '..', '..', '..', 'frontend'),
    path.resolve(executableDir, 'frontend'),
    path.resolve(executableDir, '..', 'frontend'),
  ];
  return candidates.find((candidate) => candidate && existsSync(path.join(candidate, 'package.json')));
}

export async function debugRoutes(app: FastifyInstance) {
  // ── Matcher inspector ───────────────────────────────────────────────────────
  app.get('/debug/matcher', async (req, reply) => {
    const parsed = MatcherQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid query', issues: parsed.error.issues });
    }

    const { title, artist, duration, spotifyId, thumbnail = '', limit } = parsed.data;
    const result = await debugSpotifyYoutubeMatch(
      {
        id: spotifyId ? `spotify:${spotifyId}` : `${title}-${artist}`,
        title,
        artist,
        duration,
        thumbnail,
        query: `${title} ${artist}`,
        spotifyId,
      },
      limit
    );

    return reply.send(result);
  });

  // ── Match cache ─────────────────────────────────────────────────────────────
  app.get('/debug/cache', async () => {
    return { entries: listMatchCache(), total: listMatchCache().length };
  });

  app.delete('/debug/cache', async () => {
    const result = clearMatchCache();
    return { ok: true, cleared: result.cleared };
  });

  app.delete('/debug/cache/:spotifyId', async (req, reply) => {
    const { spotifyId } = req.params as { spotifyId: string };
    const result = clearMatchCacheForSpotifyId(spotifyId);
    if (!result.cleared) {
      return reply.status(404).send({ ok: false, error: 'Cache entry not found' });
    }
    return { ok: true, cleared: result.cleared, youtubeId: result.youtubeId };
  });

  // ── Full status snapshot ────────────────────────────────────────────────────
  app.get('/debug/status', async () => buildStatus());

  // ── Debug preview server ────────────────────────────────────────────────────
  let previewProc: ChildProcess | null = null;

  function stopPreviewProc() {
    if (!previewProc || previewProc.exitCode !== null) {
      previewProc = null;
      return false;
    }

    if (process.platform === 'win32' && previewProc.pid) {
      const taskkill = spawn('taskkill', ['/pid', String(previewProc.pid), '/t', '/f'], {
        windowsHide: true,
        stdio: 'ignore',
      });
      taskkill.on('error', (err) => {
        console.error('[debug-preview] stop error:', err.message);
      });
    } else {
      previewProc.kill();
    }

    previewProc = null;
    return true;
  }

  app.post('/debug/preview/start', async (_req, reply) => {
    if (previewProc && previewProc.exitCode === null) {
      return reply.send({ ok: true, already: true });
    }
    const frontendDir = resolveFrontendDir();
    if (!frontendDir) {
      return reply.status(500).send({ ok: false, error: 'Frontend workspace not found' });
    }

    const isWindows = process.platform === 'win32';
    previewProc = isWindows
      ? spawn('cmd.exe', ['/d', '/s', '/c', 'npm.cmd run preview'], {
        cwd: frontendDir,
        windowsHide: true,
        stdio: 'ignore',
      })
      : spawn('npm', ['run', 'preview'], {
        cwd: frontendDir,
        stdio: 'ignore',
      });
    previewProc.on('error', (err) => {
      console.error('[debug-preview] error:', err.message);
      previewProc = null;
    });
    previewProc.on('exit', () => { previewProc = null; });
    return reply.send({ ok: true, already: false });
  });

  app.post('/debug/preview/stop', async (_req, reply) => {
    return reply.send({ ok: true, was_running: stopPreviewProc() });
  });

  app.get('/debug/preview/status', async () => {
    return { running: !!previewProc && previewProc.exitCode === null };
  });
}
