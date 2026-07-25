import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as fs from 'fs';
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
import { clearDiscordActivity, refreshDiscordActivity } from '../services/discordRpc.js';

const UpdateBody = z.object({
    spotifyClientId: z.string().optional(),
    spotifyClientSecret: z.string().optional(),
    searchEngine: z.enum(['ytdlp', 'spotify']).optional(),
    recommendationEngine: z.enum(['hybrid-ml', 'lastfm', 'legacy']).optional(),
    audioQualityPreference: z.enum(['auto', 'high']).optional(),
    audioCacheLimitMb: z.number().min(128).max(10240).optional(),
    discordRpcEnabled: z.boolean().optional(),
    apiKey: z.string().optional(),
    allowLocalhostBypass: z.boolean().optional(),
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
            recommendationEngine: config.recommendationEngine ?? 'lastfm',
            audioQualityPreference: config.audioQualityPreference,
            audioCacheLimitMb: config.audioCacheLimitMb,
            discordRpcEnabled: config.discordRpcEnabled,
            apiKey: config.apiKey ?? '',
            allowLocalhostBypass: config.allowLocalhostBypass ?? true,
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
                clientId: '',
                clientSecretMasked: '',
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
        const previous = getEnvConfig();
        const updated = saveEnvConfig(parsed.data);

        // Invalidate Spotify token if credentials changed
        if (parsed.data.spotifyClientId || parsed.data.spotifyClientSecret) {
            invalidateToken();
        }

        if (parsed.data.discordRpcEnabled === false) {
            await clearDiscordActivity();
        } else if (parsed.data.discordRpcEnabled === true) {
            await refreshDiscordActivity();
        }

        if (
            parsed.data.audioQualityPreference &&
            parsed.data.audioQualityPreference !== previous.audioQualityPreference
        ) {
            clearPrefetchCache();
        }

        return reply.send({
            ok: true,
            searchEngine: updated.searchEngine,
            recommendationEngine: updated.recommendationEngine ?? 'hybrid-ml',
            audioQualityPreference: updated.audioQualityPreference,
            audioCacheLimitMb: updated.audioCacheLimitMb,
            discordRpcEnabled: updated.discordRpcEnabled,
            apiKey: updated.apiKey ?? '',
            allowLocalhostBypass: updated.allowLocalhostBypass ?? true,
            spotify: {
                clientId: '',
                clientSecretMasked: '',
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

    // POST /settings/cache/write-file — write base64 content to an absolute path (used by Tauri save dialog)
    const WriteFileBody = z.object({ path: z.string().min(1), base64: z.string().min(1) });
    app.post('/settings/cache/write-file', async (req, reply) => {
        const parsed = WriteFileBody.safeParse(req.body);
        if (!parsed.success) return reply.status(400).send({ error: 'Invalid body', issues: parsed.error.issues });
        const { path: targetPath, base64 } = parsed.data;
        try {
            const buf = Buffer.from(base64, 'base64');
            fs.writeFileSync(targetPath, buf);
            return reply.send({ ok: true, path: targetPath, bytes: buf.length });
        } catch (err) {
            console.error('[settings] write-file failed:', err);
            return reply.status(500).send({ error: 'Write failed', message: (err as Error).message });
        }
    });

    // DELETE /settings/cache — clear cache learning JSON
    app.delete('/settings/cache', async (_req, reply) => {
        clearCacheStore();
        clearLyricsCacheStore();
        const audio = clearAudioCache();
        const prefetch = clearPrefetchCache();
        const matchCache = clearMatchCache();
        return reply.send({ ok: true, cache: getCacheStats(), lyrics: getLyricsCacheStats(), audio, prefetch, matchCache });
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
