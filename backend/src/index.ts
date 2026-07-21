import Fastify from 'fastify';
import cors from '@fastify/cors';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import pretty from 'pino-pretty';
import { searchRoutes } from './routes/search.js';
import { playerRoutes } from './routes/player.js';
import { playlistRoutes } from './routes/playlists.js';
import { settingsRoutes } from './routes/settings.js';
import { queueRoutes } from './routes/queue.js';
import { homeRoutes } from './routes/home.js';
import { lyricsRoutes } from './routes/lyrics.js';
import { metadataRoutes } from './routes/metadata.js';
import { rpcRoutes } from './routes/rpc.js';
import { browseRoutes } from './routes/browse.js';
import { updateRoutes } from './routes/updates.js';
import { debugRoutes } from './routes/debug.js';
import { statsRoutes } from './routes/stats.js';
import { localFilesRoutes } from './routes/localFiles.js';
import { initDb } from './services/playlist.js';
import { initLocalFilesDb } from './services/localFiles.js';
import { getCacheStats } from './services/cache.js';
import { getEnvConfig } from './services/env.js';
import { getPrefetchStatus } from './services/prefetch.js';
import { scheduleStartupPrefetch } from './services/startupPrefetch.js';
import { getAudioResolverStatus } from './services/audioResolver.js';
import { getPlaybackBlacklist } from './services/playbackBlacklist.js';
import { getMatchCacheStats } from './services/youtubeMatcher.js';
import { isDemoMode, scheduleDemoStateReset } from './services/demoMode.js';
import { getDiscordRpcStatus } from './services/discordRpc.js';
const rootPkg = require('../../package.json');
export const APP_VERSION: string = rootPkg.version;

for (const envPath of [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'backend/.env'),
  path.resolve(process.cwd(), '..', '.env'),
]) {
  if (existsSync(envPath)) {
    loadEnv({ path: envPath, override: false });
  }
}

const PREFERRED_PORT = Number(process.env.PORT ?? 3131);
const MAX_PORT_ATTEMPTS = 10;
const HOST = process.env.HOST ?? '127.0.0.1';

function decodeFormValue(value: string): string {
  const withSpaces = value.replace(/\+/g, ' ');
  const latin1 = withSpaces.replace(/%([0-9A-Fa-f]{2})/g, (_: string, hex: string) =>
    String.fromCharCode(parseInt(hex, 16))
  );
  return Buffer.from(latin1, 'latin1').toString('utf8');
}

function querystringParser(value: string): Record<string, string> {
  const params: Record<string, string> = {};
  if (!value) return params;
  for (const pair of value.split('&')) {
    const eq = pair.indexOf('=');
    if (eq === -1) {
      params[decodeFormValue(pair)] = '';
    } else {
      params[decodeFormValue(pair.slice(0, eq))] = decodeFormValue(pair.slice(eq + 1));
    }
  }
  return params;
}

async function bootstrap() {
  const app = Fastify({
    querystringParser,
    logger: {
      level: 'info',
      stream: pretty({
        colorize: true,
        translateTime: 'HH:MM:ss',
        destination: process.stdout,
      }),
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
  await app.register(rpcRoutes);
  await app.register(browseRoutes);
  await app.register(updateRoutes);
  await app.register(debugRoutes);
  await app.register(statsRoutes);
  await app.register(localFilesRoutes);

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
    discordRpc: getDiscordRpcStatus(),
    demoMode: isDemoMode(),
    features: {
      updates: true,
      lyricsRomanization: true,
      audioQualityPreference: true,
    },
  }));

  // Init SQLite schema
  initDb();
  initLocalFilesDb();
  scheduleDemoStateReset((result, message) => app.log.info(result, message));
  scheduleStartupPrefetch();

  // Try preferred port, fall back to next available ports
  for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt++) {
    const port = PREFERRED_PORT + attempt;
    try {
      await app.listen({ port, host: HOST });
      if (attempt > 0) {
        console.warn(`\n Port ${PREFERRED_PORT} was busy, using port ${port} instead.`);
      }
      console.log(`\n Noctune backend running at http://${HOST}:${port}\n`);
      return;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        console.warn(`[boot] Port ${port} is already in use, trying ${port + 1}...`);
        continue;
      }
      throw err;
    }
  }

  throw new Error(`Could not find an available port in range ${PREFERRED_PORT}-${PREFERRED_PORT + MAX_PORT_ATTEMPTS - 1}`);
}

bootstrap().catch(err => {
  console.error('[fatal]', err);
  process.exit(1);
});
