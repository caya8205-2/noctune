import Fastify from 'fastify';
import cors from '@fastify/cors';
import { searchRoutes } from './routes/search.js';
import { playerRoutes } from './routes/player.js';
import { playlistRoutes } from './routes/playlists.js';
import { settingsRoutes } from './routes/settings.js';
import { queueRoutes } from './routes/queue.js';
import { homeRoutes } from './routes/home.js';
import { lyricsRoutes } from './routes/lyrics.js';
import { metadataRoutes } from './routes/metadata.js';
import { initDb } from './services/playlist.js';
import { getCacheStats } from './services/cache.js';
import { getEnvConfig } from './services/env.js';
import { getPrefetchStatus } from './services/prefetch.js';
import { scheduleStartupPrefetch } from './services/startupPrefetch.js';
import { getAudioResolverStatus } from './services/audioResolver.js';
import { getPlaybackBlacklist } from './services/playbackBlacklist.js';
import { getMatchCacheStats } from './services/youtubeMatcher.js';
import { isDemoMode, scheduleDemoStateReset } from './services/demoMode.js';

const PORT = Number(process.env.PORT ?? 3131);
const HOST = process.env.HOST ?? '127.0.0.1';

async function bootstrap() {
  const app = Fastify({
    logger: {
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss' },
      },
    },
  });

  // CORS — allow Tauri WebView and dev server
  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  });

  // Parse JSON bodies
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    try {
      const text = (body as string).trim();
      done(null, text ? JSON.parse(text) : {});
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // Routes
  await app.register(searchRoutes);
  await app.register(playerRoutes);
  await app.register(playlistRoutes);
  await app.register(settingsRoutes);
  await app.register(queueRoutes);
  await app.register(homeRoutes);
  await app.register(lyricsRoutes);
  await app.register(metadataRoutes);

  // Health / debug endpoint
  app.get('/status', async () => ({
    ok: true,
    cache: getCacheStats(),
    prefetch: getPrefetchStatus(),
    resolver: getAudioResolverStatus(),
    playbackBlacklist: {
      failedIds: getPlaybackBlacklist().length,
    },
    matchCache: getMatchCacheStats(),
    demoMode: isDemoMode(),
  }));

  // Init SQLite schema
  initDb();
  scheduleDemoStateReset((result, message) => app.log.info(result, message));
  scheduleStartupPrefetch();

  await app.listen({ port: PORT, host: HOST });
  console.log(`\n🎵 Muzikku backend running at http://${HOST}:${PORT}\n`);
}

bootstrap().catch(err => {
  console.error('[fatal]', err);
  process.exit(1);
});

