import { create } from 'zustand';
import { IS_TAURI } from '../utils/api';
import type { Update } from '@tauri-apps/plugin-updater';

let pendingUpdate: Update | null = null;

export type UpdateUrgency = 'major' | 'minor' | 'patch';

export function normalizeVersion(v: string): string {
  return (v || '').trim().replace(/^v/i, '');
}

export function parseSemVer(v: string) {
  const clean = normalizeVersion(v);
  const parts = clean.split(/[.-]/).map((p) => parseInt(p, 10) || 0);
  return { major: parts[0] ?? 0, minor: parts[1] ?? 0, patch: parts[2] ?? 0 };
}

export function compareVersions(a: string, b: string): number {
  const left = parseSemVer(a);
  const right = parseSemVer(b);

  if (left.major !== right.major) return left.major > right.major ? 1 : -1;
  if (left.minor !== right.minor) return left.minor > right.minor ? 1 : -1;
  if (left.patch !== right.patch) return left.patch > right.patch ? 1 : -1;
  return 0;
}

export function getUpdateUrgency(currentVersion: string, latestVersion: string): UpdateUrgency {
  const curr = parseSemVer(currentVersion);
  const late = parseSemVer(latestVersion);
  if (late.major > curr.major) return 'major';
  if (late.minor > curr.minor) return 'minor';
  return 'patch';
}

interface UpdaterState {
  checking: boolean;
  downloading: boolean;
  downloadProgress: number; // 0 - 100
  updateAvailable: boolean;
  updateReady: boolean;
  currentVersion: string;
  version: string | null; // latest remote version
  urgency: UpdateUrgency;
  body: string | null;
  releaseUrl: string;
  error: string | null;
  toastDismissed: boolean;
  lastChecked: number | null;

  checkForUpdates: (manual?: boolean) => Promise<void>;
  installUpdate: () => Promise<void>;
  dismissToast: () => void;
}

const DEFAULT_REPO_URL = 'https://github.com/caya8205-2/noctune/releases/latest';

async function terminateBackendBeforeInstall() {
  if (!IS_TAURI) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('kill_backend');
  } catch (e) {
    console.warn('[updater] kill_backend invoke failed:', e);
  }
}

export const useUpdaterStore = create<UpdaterState>((set, get) => ({
  checking: false,
  downloading: false,
  downloadProgress: 0,
  updateAvailable: false,
  updateReady: false,
  currentVersion: normalizeVersion(__APP_VERSION__),
  version: null,
  urgency: 'minor',
  body: null,
  releaseUrl: DEFAULT_REPO_URL,
  error: null,
  toastDismissed: false,
  lastChecked: null,

  checkForUpdates: async (manual = false) => {
    if (get().checking || get().downloading) return;
    if (get().updateReady && pendingUpdate) {
      // An update has already been downloaded and verified, waiting for restart
      return;
    }

    const localVersion = normalizeVersion(__APP_VERSION__);
    set({ checking: true, error: null, currentVersion: localVersion });

    try {
      if (!IS_TAURI) {
        // Fallback for browser / web mode
        const { api } = await import('../utils/api');
        const res = await api.checkForUpdates(manual);
        const remoteVersion = normalizeVersion(res.latestVersion || '');
        const isNewer = remoteVersion ? compareVersions(remoteVersion, localVersion) > 0 : false;
        const urgency = isNewer ? getUpdateUrgency(localVersion, remoteVersion) : 'minor';

        set({
          checking: false,
          updateAvailable: isNewer,
          currentVersion: localVersion,
          version: remoteVersion || null,
          urgency,
          releaseUrl: res.releaseUrl || DEFAULT_REPO_URL,
          lastChecked: Date.now(),
        });
        return;
      }

      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();

      if (!update) {
        set({
          checking: false,
          updateAvailable: false,
          currentVersion: localVersion,
          lastChecked: Date.now(),
        });
        return;
      }

      const remoteVersion = normalizeVersion(update.version);
      const isNewer = compareVersions(remoteVersion, localVersion) > 0;

      if (!isNewer) {
        // Strict guard: the remote release is older than or equal to our local app version.
        // Never download or prompt for downgrades / same versions!
        console.info(`[updater] Remote v${remoteVersion} <= local v${localVersion}. App is up to date.`);
        set({
          checking: false,
          updateAvailable: false,
          currentVersion: localVersion,
          version: remoteVersion,
          downloading: false,
          updateReady: false,
          lastChecked: Date.now(),
        });
        return;
      }

      const urgency = getUpdateUrgency(localVersion, remoteVersion);
      pendingUpdate = update;
      set({
        checking: false,
        updateAvailable: true,
        currentVersion: localVersion,
        version: remoteVersion,
        urgency,
        body: update.body || null,
        releaseUrl: `https://github.com/caya8205-2/noctune/releases/tag/v${remoteVersion}`,
        downloading: true,
        downloadProgress: 0,
        lastChecked: Date.now(),
      });

      let downloaded = 0;
      let total = 0;

      await update.download((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? 0;
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          if (total > 0) {
            set({ downloadProgress: Math.min(100, Math.round((downloaded / total) * 100)) });
          }
        }
      });

      set({
        downloading: false,
        updateReady: true,
        toastDismissed: false,
      });
    } catch (err) {
      console.warn('[updater] Check or download failed:', err);
      set({
        checking: false,
        downloading: false,
        error: (err as Error).message,
        lastChecked: Date.now(),
      });
    }
  },

  installUpdate: async () => {
    if (!IS_TAURI) return;

    if (!pendingUpdate) {
      try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const update = await check();
        if (update) {
          const localVersion = normalizeVersion(__APP_VERSION__);
          const remoteVersion = normalizeVersion(update.version);
          if (compareVersions(remoteVersion, localVersion) > 0) {
            pendingUpdate = update;
            await terminateBackendBeforeInstall();
            await update.downloadAndInstall(undefined, { restartAfterInstall: true });
          }
        }
      } catch (err) {
        console.error('[updater] Fallback downloadAndInstall failed:', err);
        set({ error: (err as Error).message });
      }
      return;
    }

    try {
      await terminateBackendBeforeInstall();
      await pendingUpdate.install({ restartAfterInstall: true });
    } catch (err) {
      console.warn('[updater] install() failed, falling back to downloadAndInstall():', err);
      try {
        await terminateBackendBeforeInstall();
        await pendingUpdate.downloadAndInstall(undefined, { restartAfterInstall: true });
      } catch (err2) {
        console.error('[updater] downloadAndInstall() also failed:', err2);
        set({ error: (err2 as Error).message });
        throw err2;
      }
    }
  },

  dismissToast: () => set({ toastDismissed: true }),
}));
