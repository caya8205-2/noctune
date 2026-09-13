import { create } from 'zustand';
import { IS_TAURI } from '../utils/api';
import type { Update } from '@tauri-apps/plugin-updater';

let pendingUpdate: Update | null = null;

interface UpdaterState {
  checking: boolean;
  downloading: boolean;
  downloadProgress: number; // 0 - 100
  updateAvailable: boolean;
  updateReady: boolean;
  version: string | null;
  body: string | null;
  error: string | null;
  toastDismissed: boolean;
  lastChecked: number | null;

  checkForUpdates: (manual?: boolean) => Promise<void>;
  installUpdate: () => Promise<void>;
  dismissToast: () => void;
}

export const useUpdaterStore = create<UpdaterState>((set, get) => ({
  checking: false,
  downloading: false,
  downloadProgress: 0,
  updateAvailable: false,
  updateReady: false,
  version: null,
  body: null,
  error: null,
  toastDismissed: false,
  lastChecked: null,

  checkForUpdates: async (manual = false) => {
    if (get().checking || get().downloading) return;
    set({ checking: true, error: null });

    try {
      if (!IS_TAURI) {
        // Fallback for browser / non-Tauri dev mode
        const { api } = await import('../utils/api');
        const res = await api.checkForUpdates(manual);
        set({
          checking: false,
          updateAvailable: res.updateAvailable,
          version: res.latestVersion,
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
          lastChecked: Date.now(),
        });
        return;
      }

      pendingUpdate = update;
      set({
        checking: false,
        updateAvailable: true,
        version: update.version,
        body: update.body || null,
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
    if (!pendingUpdate) return;
    try {
      await pendingUpdate.install({ restartAfterInstall: true });
    } catch (err) {
      console.error('[updater] Install failed:', err);
      set({ error: (err as Error).message });
    }
  },

  dismissToast: () => set({ toastDismissed: true }),
}));
