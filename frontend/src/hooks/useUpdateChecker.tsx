import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, RotateCcw, X } from 'lucide-react';
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
    currentVersion,
    version,
    urgency,
    updateReady,
    updateAvailable,
    releaseUrl,
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

  const shouldShow = (updateReady || (!IS_TAURI && updateAvailable)) && !toastDismissed && Boolean(version);

  const urgencyLabel =
    urgency === 'major'
      ? (IS_TAURI ? 'Major Update Ready' : 'Major Update Available')
      : urgency === 'patch'
      ? (IS_TAURI ? 'Small Patch Ready' : 'Small Patch Available')
      : (IS_TAURI ? 'Update Ready' : 'Update Available');

  const urgencyDescription =
    urgency === 'major'
      ? `Noctune v${version} is ready with major features & fixes. You are on v${currentVersion}. ${IS_TAURI ? 'Restart to apply.' : ''}`
      : urgency === 'patch'
      ? `Noctune v${version} patch is ready. You are on v${currentVersion}. ${IS_TAURI ? 'Restart whenever you\'re ready.' : ''}`
      : `Noctune v${version} is ready. You are on v${currentVersion}. ${IS_TAURI ? 'Restart Noctune to apply.' : ''}`;

  const borderClass =
    urgency === 'major'
      ? 'border-amber-500/50 shadow-amber-500/10 ring-1 ring-amber-500/30'
      : urgency === 'patch'
      ? 'border-white/10 shadow-black/20'
      : 'border-accent/40 shadow-black/80';

  const updateToast = shouldShow && typeof document !== 'undefined'
    ? createPortal(
        <aside
          data-tauri-drag-region="false"
          style={{ zIndex: 9999999, ...({ WebkitAppRegion: 'no-drag' } as Record<string, string>) }}
          className={`fixed right-4 top-16 z-[9999999] w-[calc(100vw-2rem)] max-w-sm rounded-xl border ${borderClass} bg-base-950/95 p-4 shadow-2xl backdrop-blur-2xl animate-fade-in transition-all pointer-events-auto select-none`}
          aria-live="polite"
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={`section-label ${urgency === 'major' ? 'text-amber-400' : urgency === 'patch' ? 'text-soft' : 'text-accent'}`}>
                  {urgencyLabel}
                </span>
                <span className="text-xs font-mono font-semibold text-white">v{version}</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                {urgencyDescription}
              </p>
              <div className="mt-3 flex items-center gap-2">
                {IS_TAURI ? (
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        setInstalling(true);
                        await installUpdate();
                      } catch (err) {
                        console.error('Failed to trigger update restart:', err);
                        setInstalling(false);
                      }
                    }}
                    disabled={installing}
                    className={`px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 shadow-md cursor-pointer pointer-events-auto ${
                      urgency === 'major'
                        ? 'rounded-full bg-amber-500 hover:bg-amber-400 text-base-950 shadow-amber-500/20'
                        : 'btn-accent shadow-accent/20'
                    }`}
                  >
                    <RotateCcw size={12} className={installing ? 'animate-spin' : ''} />
                    {installing ? 'Restarting...' : 'Restart Now'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openExternalUrl(releaseUrl).catch(console.error);
                    }}
                    className="btn-accent px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 cursor-pointer pointer-events-auto"
                  >
                    <ExternalLink size={12} />
                    Download
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    dismissToast();
                  }}
                  className="btn-ghost px-3 py-1.5 text-xs text-muted hover:text-white cursor-pointer pointer-events-auto"
                >
                  Later
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                dismissToast();
              }}
              className="btn-ghost -mr-1 -mt-1 p-1 text-muted hover:text-white cursor-pointer pointer-events-auto"
              title="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        </aside>,
        document.body
      )
    : null;

  return { updateToast, updateReady, version };
}
