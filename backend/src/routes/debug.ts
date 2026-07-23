import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  debugSpotifyYoutubeMatch,
  getMatchCacheEntry,
  listMatchCache,
  clearMatchCache,
  clearMatchCacheForSpotifyId,
  getMatchCacheStats,
  matchSpotifyTrackToYoutube,
  saveMatchCacheEntry,
} from '../services/youtubeMatcher.js';
import { clearAudioCacheForId, getExistingAudioCachePath } from '../services/audioFileCache.js';
import { clearPlaybackBlacklistForId, isPlaybackBlacklisted, markPlaybackFailed } from '../services/playbackBlacklist.js';
import { clearPrefetchForId, getPrefetched, isPrefetching } from '../services/prefetch.js';
import { resolveTrack } from '../services/audioResolver.js';
import {
  clearTrackCache,
  getCacheStats,
  getCachedById,
  getCachedBySpotifyId,
  upsertTrack,
} from '../services/cache.js';
import {
  getLyricsSnapshot,
  searchLrclibCandidates,
  saveManualLyrics,
  deleteCachedLyricsEntry,
} from '../services/lyrics.js';
import { getEnvConfig } from '../services/env.js';
import { getAudioResolverStatus } from '../services/audioResolver.js';
import { getPrefetchStatus } from '../services/prefetch.js';
import { getPlaybackBlacklist } from '../services/playbackBlacklist.js';
import { getDiscordRpcStatus } from '../services/discordRpc.js';
import { isDemoMode } from '../services/demoMode.js';
import type { Track } from '../types/index.js';

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
    const entries = listMatchCache().map((entry) => {
      if (entry.spotifyTitle || entry.spotifyArtist) return entry;
      const learned = getCachedBySpotifyId(entry.spotifyId);
      return {
        ...entry,
        spotifyTitle: learned?.title ?? entry.spotifyTitle,
        spotifyArtist: learned?.artist ?? entry.spotifyArtist,
      };
    });
    return { entries, total: entries.length };
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

  // ── Resolver snapshot for a specific track ──────────────────────────────────
  app.get<{ Querystring: { spotifyId?: string; youtubeId?: string } }>(
    '/debug/resolver-snapshot',
    async (req) => {
      const { spotifyId, youtubeId } = req.query;
      const matchEntry = spotifyId ? getMatchCacheEntry(spotifyId) : null;
      const resolvedYoutubeId = youtubeId ?? matchEntry?.youtubeId ?? undefined;
      const preference = getEnvConfig().audioQualityPreference;
      const learned = resolvedYoutubeId
        ? getCachedById(resolvedYoutubeId)
        : spotifyId
          ? getCachedBySpotifyId(spotifyId)
          : null;
      return {
        spotifyId: spotifyId ?? null,
        youtubeId: resolvedYoutubeId ?? null,
        matchCache: matchEntry,
        learned: learned ?? null,
        audioCache: {
          cached: resolvedYoutubeId ? Boolean(getExistingAudioCachePath(resolvedYoutubeId, preference)) : false,
        },
        blacklist: {
          blacklisted: resolvedYoutubeId ? isPlaybackBlacklisted(resolvedYoutubeId) : false,
        },
        prefetch: {
          prefetched: resolvedYoutubeId ? Boolean(getPrefetched(resolvedYoutubeId)) : false,
          prefetching: resolvedYoutubeId ? isPrefetching(resolvedYoutubeId) : false,
        },
      };
    }
  );

  // ── Force a fresh re-resolve of a track (clears caches first) ────────────────
  const ResolveAgainBody = z.object({
    spotifyId: z.string().optional(),
    youtubeId: z.string().optional(),
    title: z.string().min(1),
    artist: z.string().default(''),
    duration: z.coerce.number().min(0).default(0),
    thumbnail: z.string().optional(),
  });

  app.post('/debug/resolve-again', async (req, reply) => {
    const parsed = ResolveAgainBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', issues: parsed.error.issues });
    }
    const { spotifyId, youtubeId, title, artist, duration, thumbnail = '' } = parsed.data;
    const preference = getEnvConfig().audioQualityPreference;

    // Clear every layer for the known ids so the resolve runs from scratch.
    if (spotifyId) clearMatchCacheForSpotifyId(spotifyId);
    if (youtubeId) {
      clearPrefetchForId(youtubeId);
      clearPlaybackBlacklistForId(youtubeId);
      clearAudioCacheForId(youtubeId);
    }
    clearTrackCache(youtubeId ? [youtubeId] : [], spotifyId);

    const query = `${title} ${artist}`.trim();
    const seedTrack: Track = {
      id: spotifyId ? `spotify:${spotifyId}` : (youtubeId ?? ''),
      title,
      artist,
      duration,
      thumbnail,
      query,
      spotifyId,
    };

    try {
      const matched = spotifyId ? await matchSpotifyTrackToYoutube(seedTrack) : seedTrack;
      if (!matched) {
        return reply.send({ ok: false, error: 'No acceptable YouTube match found' });
      }
      const { track, audio } = await resolveTrack(matched.id, matched.query ?? query);
      const saved = upsertTrack(
        matched.query ?? query,
        track,
        audio.url,
        undefined,
        audio.qualityPreference,
        audio.format,
        audio.quality
      );

      const newYoutubeId = saved.id;
      const matchEntry = spotifyId ? getMatchCacheEntry(spotifyId) : null;
      return reply.send({
        ok: true,
        resolved: {
          id: saved.id,
          title: saved.title,
          artist: saved.artist,
          youtubeId: saved.youtubeId,
          youtubeTitle: saved.youtubeTitle,
          youtubeArtist: saved.youtubeArtist,
        },
        snapshot: {
          spotifyId: spotifyId ?? null,
          youtubeId: newYoutubeId,
          matchCache: matchEntry,
          learned: saved,
          audioCache: { cached: Boolean(getExistingAudioCachePath(newYoutubeId, preference)) },
          blacklist: { blacklisted: isPlaybackBlacklisted(newYoutubeId) },
          prefetch: { prefetched: Boolean(getPrefetched(newYoutubeId)), prefetching: isPrefetching(newYoutubeId) },
        },
      });
    } catch (err) {
      return reply.send({ ok: false, error: (err as Error).message });
    }
  });

  // ── Blacklist match endpoint ────────────────────────────────────────────────
  app.post('/debug/blacklist', async (req, reply) => {
    const { youtubeId, spotifyId } = req.body as { youtubeId: string; spotifyId?: string };
    if (!youtubeId) return reply.status(400).send({ ok: false, error: 'youtubeId is required' });

    markPlaybackFailed(youtubeId);
    let clearedMatch = 0;
    if (spotifyId) {
      clearedMatch = clearMatchCacheForSpotifyId(spotifyId).cleared;
    }

    return reply.send({ ok: true, youtubeId, blacklisted: true, clearedMatch });
  });

  // ── Save manual YouTube match to cache ──────────────────────────────────────
  app.post('/debug/matcher/save', async (req, reply) => {
    const { spotifyId, youtubeId, youtubeTitle, youtubeArtist, spotifyTitle, spotifyArtist, score } = req.body as {
      spotifyId?: string;
      youtubeId: string;
      youtubeTitle?: string;
      youtubeArtist?: string;
      spotifyTitle?: string;
      spotifyArtist?: string;
      score?: number;
    };
    if (!youtubeId) {
      return reply.status(400).send({ ok: false, error: 'youtubeId is required' });
    }

    const key = spotifyId?.trim() || `${spotifyTitle ?? ''}-${spotifyArtist ?? ''}`.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || youtubeId;

    const matchEntry = saveMatchCacheEntry({
      spotifyId: key,
      youtubeId,
      youtubeTitle,
      youtubeArtist,
      spotifyTitle,
      spotifyArtist,
      score: score ?? 150,
    });

    const learnedTrack: Track = {
      id: spotifyId ? `spotify:${spotifyId}` : key,
      title: spotifyTitle || youtubeTitle || key,
      artist: spotifyArtist || youtubeArtist || '',
      spotifyId: spotifyId || undefined,
      youtubeId,
      youtubeTitle,
      youtubeArtist,
      duration: 0,
      thumbnail: `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`,
      query: `${spotifyTitle ?? ''} ${spotifyArtist ?? ''}`.trim(),
    };

    return reply.send({ ok: true, entry: matchEntry, track: learnedTrack });
  });

  // ── Lyrics Debug Endpoints ──────────────────────────────────────────────────
  app.get<{ Querystring: { title: string; artist?: string; duration?: string } }>(
    '/debug/lyrics/snapshot',
    async (req, reply) => {
      const { title, artist = '', duration = '0' } = req.query;
      if (!title) return reply.status(400).send({ error: 'Title is required' });
      return reply.send(getLyricsSnapshot(title, artist, Number(duration) || 0));
    }
  );

  app.get<{ Querystring: { title: string; artist?: string } }>(
    '/debug/lyrics/search',
    async (req, reply) => {
      const { title, artist = '' } = req.query;
      if (!title) return reply.status(400).send({ error: 'Title is required' });
      const candidates = await searchLrclibCandidates(title, artist);
      return reply.send({ candidates, count: candidates.length });
    }
  );

  app.post('/debug/lyrics/save', async (req, reply) => {
    const { title, artist, duration, candidate } = req.body as {
      title: string;
      artist: string;
      duration: number;
      candidate: any;
    };
    if (!title || !candidate) {
      return reply.status(400).send({ ok: false, error: 'Title and candidate are required' });
    }
    const saved = await saveManualLyrics(title, artist ?? '', duration ?? 0, candidate);
    return reply.send({ ok: true, lyrics: saved });
  });

  app.delete('/debug/lyrics/cache', async (req, reply) => {
    const { title, artist = '', duration = '0' } = req.query as { title: string; artist?: string; duration?: string };
    if (!title) return reply.status(400).send({ error: 'Title is required' });
    const cleared = deleteCachedLyricsEntry(title, artist, Number(duration) || 0);
    return reply.send({ ok: true, cleared });
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
