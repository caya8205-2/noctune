import { useEffect, useState } from 'react';
import { Download, ExternalLink, X } from 'lucide-react';
import { api, type UpdateInfo } from '../utils/api';

const CHECK_INTERVAL_MS = 1000 * 60 * 60 * 5;
const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export async function openExternalUrl(url: string) {
  if (!IS_TAURI) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }

  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('open_external_url', { url });
}

export function useUpdateChecker() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const result = await api.checkForUpdates();
        if (cancelled) return;
        setUpdate(result);
        if (result.updateAvailable) setVisible(true);
      } catch (err) {
        console.warn('[updates] Check failed', err);
      }
    }

    check();
    const intervalId = window.setInterval(check, CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const updateToast =
    visible && update?.updateAvailable ? (
      <div className="fixed right-4 top-16 z-50 w-[calc(100vw-2rem)] max-w-sm rounded-xl border border-accent/25 bg-base-900/95 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-accent/30 bg-accent/15 text-accent">
            <Download size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white">Update available</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Noctune {update.latestVersion} is ready. You are on {update.currentVersion}.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => openExternalUrl(update.releaseUrl).catch(console.error)}
                className="btn-accent px-3 py-2 text-xs"
              >
                <ExternalLink size={13} />
                Download
              </button>
              <button
                type="button"
                onClick={() => setVisible(false)}
                className="btn-ghost px-3 py-2 text-xs"
              >
                Later
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setVisible(false)}
            className="btn-ghost -mr-1 -mt-1 p-1.5"
            title="Dismiss"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    ) : null;

  return { update, updateToast };
}
