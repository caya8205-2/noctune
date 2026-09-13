import { useEffect, useState } from 'react';
import { RotateCcw, Sparkles, X } from 'lucide-react';
import { useUpdaterStore } from '../store/updater';
import { IS_TAURI } from '../utils/api';

export async function openExternalUrl(url: string) {
  if (!IS_TAURI) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }

  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('open_external_url', { url });
}

const INITIAL_CHECK_DELAY_MS = 4_000;
const CHECK_INTERVAL_MS = 1000 * 60 * 60 * 5; // 5 hours

export function useUpdateChecker() {
  const {
    version,
    updateReady,
    toastDismissed,
    checkForUpdates,
    installUpdate,
    dismissToast,
  } = useUpdaterStore();
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    // Stagger check slightly after startup so audio engine and UI settle first
    const initialTimer = window.setTimeout(() => {
      checkForUpdates().catch(console.error);
    }, INITIAL_CHECK_DELAY_MS);

    const intervalId = window.setInterval(() => {
      checkForUpdates().catch(console.error);
    }, CHECK_INTERVAL_MS);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(intervalId);
    };
  }, [checkForUpdates]);

  const updateToast =
    updateReady && !toastDismissed && version ? (
      <div className="fixed right-4 top-16 z-60 w-[calc(100vw-2rem)] max-w-sm rounded-xl border border-accent/40 bg-base-950/95 p-4 shadow-2xl shadow-black/60 backdrop-blur-xl animate-fade-in transition-all">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-accent/40 bg-accent/15 text-accent">
            <Sparkles size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="section-label text-accent">Update Ready</span>
              <span className="text-xs font-mono font-semibold text-white">v{version}</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Downloaded in the background. Restart Noctune to apply the update.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  setInstalling(true);
                  await installUpdate();
                }}
                disabled={installing}
                className="btn-accent px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-accent/20"
              >
                <RotateCcw size={12} className={installing ? 'animate-spin' : ''} />
                {installing ? 'Restarting...' : 'Restart Now'}
              </button>
              <button
                type="button"
                onClick={dismissToast}
                className="btn-ghost px-3 py-1.5 text-xs text-muted hover:text-white"
              >
                Later
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={dismissToast}
            className="btn-ghost -mr-1 -mt-1 p-1 text-muted hover:text-white"
            title="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    ) : null;

  return { updateToast, updateReady, version };
}
