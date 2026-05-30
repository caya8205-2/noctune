import { clearAudioCache } from './audioFileCache.js';
import { clearCacheStore, getCacheStats } from './cache.js';
import { clearPlaybackBlacklist } from './playbackBlacklist.js';
import { clearPlaylistStore } from './playlist.js';
import { clearMatchCache } from './youtubeMatcher.js';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const DEFAULT_RESET_MINUTES = 30;

export interface DemoResetResult {
  cache: { total: number; totalQueries: number };
  playlists: { playlists: number; tracks: number };
  audio: { files: number; bytes: number };
  blacklist: { cleared: number };
  matchCache: { cleared: number };
}

export function isDemoMode(): boolean {
  return TRUE_VALUES.has((process.env.NOCTUNE_DEMO_MODE ?? '').toLowerCase());
}

export function getDemoResetIntervalMs(): number {
  const minutes = Number(process.env.NOCTUNE_DEMO_RESET_MINUTES ?? DEFAULT_RESET_MINUTES);
  const safeMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_RESET_MINUTES;
  return safeMinutes * 60 * 1000;
}

export function resetDemoState(): DemoResetResult {
  clearCacheStore();
  return {
    cache: getCacheStats(),
    playlists: clearPlaylistStore(),
    audio: clearAudioCache(),
    blacklist: clearPlaybackBlacklist(),
    matchCache: clearMatchCache(),
  };
}

export function scheduleDemoStateReset(log: (result: DemoResetResult, message: string) => void): void {
  if (!isDemoMode()) return;

  const intervalMs = getDemoResetIntervalMs();
  log(resetDemoState(), '[demo] state reset on startup');

  const timer = setInterval(() => {
    log(resetDemoState(), '[demo] state reset on interval');
  }, intervalMs);
  timer.unref?.();
}
