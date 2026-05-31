import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getEnvConfig, saveEnvConfig } from '../services/env.js';
import { testSpotifyCredentials, invalidateToken } from '../services/spotify.js';
import {
    clearCacheStore,
    exportCacheStore,
    getCacheStats,
    importCacheStore,
} from '../services/cache.js';
import { clearLyricsCacheStore, getLyricsCacheStats } from '../services/lyrics.js';
import { clearAudioCache, getAudioCacheStats } from '../services/audioFileCache.js';
import { clearPlaybackBlacklist, getPlaybackBlacklist } from '../services/playbackBlacklist.js';
import { clearMatchCache, getMatchCacheStats } from '../services/youtubeMatcher.js';
import { clearPrefetchCache } from '../services/prefetch.js';

const UpdateBody = z.object({
    spotifyClientId: z.string().optional(),
    spotifyClientSecret: z.string().optional(),
    searchEngine: z.enum(['ytdlp', 'spotify']).optional(),
    audioCacheLimitMb: z.number().min(128).max(10240).optional(),
});

const TestBody = z.object({
    spotifyClientId: z.string().optional(),
    spotifyClientSecret: z.string().optional(),
}).optional();

export async function settingsRoutes(app: FastifyInstance) {
    // GET /settings — return current config (secrets masked)
    app.get('/settings', async (_req, reply) => {
        const config = getEnvConfig();
        return reply.send({
            searchEngine: config.searchEngine,
            audioCacheLimitMb: config.audioCacheLimitMb,
            cache: {
                learning: getCacheStats(),
                lyrics: getLyricsCacheStats(),
                audio: getAudioCacheStats(),
            },
            resolver: {
                failedIds: getPlaybackBlacklist().length,
                matchCache: getMatchCacheStats(),
            },
            spotify: {
                clientId: config.spotifyClientId,
                // Mask secret — only show last 4 chars if set
                clientSecretMasked: config.spotifyClientSecret
                    ? '••••••••' + config.spotifyClientSecret.slice(-4)
                    : '',
                configured: Boolean(config.spotifyClientId && config.spotifyClientSecret),
            },
        });
    });

    // PATCH /settings — update config
    app.patch('/settings', async (req, reply) => {
        const parsed = UpdateBody.safeParse(req.body);
        if (!parsed.success) {
            return reply.status(400).send({ error: 'Invalid body', issues: parsed.error.issues });
        }
        const updated = saveEnvConfig(parsed.data);

        // Invalidate Spotify token if credentials changed
        if (parsed.data.spotifyClientId || parsed.data.spotifyClientSecret) {
            invalidateToken();
        }

        return reply.send({
            ok: true,
            searchEngine: updated.searchEngine,
            audioCacheLimitMb: updated.audioCacheLimitMb,
            spotify: {
                clientId: updated.spotifyClientId,
                clientSecretMasked: updated.spotifyClientSecret
                    ? '••••••••' + updated.spotifyClientSecret.slice(-4)
                    : '',
                configured: Boolean(updated.spotifyClientId && updated.spotifyClientSecret),
            },
        });
    });

    // POST /settings/spotify/test — verify credentials work
    app.post('/settings/spotify/test', async (req, reply) => {
        const parsed = TestBody.safeParse(req.body);
        if (!parsed.success) {
            return reply.status(400).send({ error: 'Invalid body', issues: parsed.error.issues });
        }

        const body = parsed.data;
        const hasNewCredentials = Boolean(body?.spotifyClientId || body?.spotifyClientSecret);
        const previous = getEnvConfig();

        if (hasNewCredentials) {
            saveEnvConfig({
                spotifyClientId: body?.spotifyClientId || previous.spotifyClientId,
                spotifyClientSecret: body?.spotifyClientSecret || previous.spotifyClientSecret,
            });
            invalidateToken();
        }

        const result = await testSpotifyCredentials();

        if (!result.ok && hasNewCredentials) {
            saveEnvConfig(previous);
            invalidateToken();
        }

        return reply.send(result);
    });

    // GET /settings/cache/export — export cache learning JSON
    app.get('/settings/cache/export', async (_req, reply) => {
        reply.header('Content-Disposition', 'attachment; filename="noctune-cache.json"');
        return reply.send(exportCacheStore());
    });

    // POST /settings/cache/import — replace cache learning JSON
    app.post('/settings/cache/import', async (req, reply) => {
        try {
            const imported = importCacheStore(req.body);
            return reply.send({
                ok: true,
                cache: {
                    total: Object.keys(imported.tracks).length,
                    totalQueries: Object.keys(imported.queryIndex).length,
                },
            });
        } catch (err) {
            return reply.status(400).send({ error: 'Invalid cache JSON', message: (err as Error).message });
        }
    });

    // DELETE /settings/cache — clear cache learning JSON
    app.delete('/settings/cache', async (_req, reply) => {
        clearCacheStore();
        clearLyricsCacheStore();
        const audio = clearAudioCache();
        const prefetch = clearPrefetchCache();
        return reply.send({ ok: true, cache: getCacheStats(), lyrics: getLyricsCacheStats(), audio, prefetch });
    });

    // DELETE /settings/cache/tracks — clear only learned track metadata
    app.delete('/settings/cache/tracks', async (_req, reply) => {
        clearCacheStore();
        const prefetch = clearPrefetchCache();
        return reply.send({ ok: true, cache: getCacheStats(), prefetch });
    });

    // DELETE /settings/cache/lyrics — clear only lyrics lookup cache
    app.delete('/settings/cache/lyrics', async (_req, reply) => {
        clearLyricsCacheStore();
        return reply.send({ ok: true, lyrics: getLyricsCacheStats() });
    });

    // DELETE /settings/cache/audio — clear only local audio files
    app.delete('/settings/cache/audio', async (_req, reply) => {
        const audio = clearAudioCache();
        return reply.send({ ok: true, audio, stats: getAudioCacheStats() });
    });

    // DELETE /settings/resolver-blacklist — clear temporary failed playback IDs
    app.delete('/settings/resolver-blacklist', async (_req, reply) => {
        return reply.send({ ok: true, blacklist: clearPlaybackBlacklist() });
    });

    // DELETE /settings/resolver-match-cache — clear Spotify -> YouTube mapping cache
    app.delete('/settings/resolver-match-cache', async (_req, reply) => {
        return reply.send({ ok: true, matchCache: clearMatchCache() });
    });
}
