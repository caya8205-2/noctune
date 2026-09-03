import { useEffect, useState, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { checkBackendStatus } from '../../utils/api';

interface StartupGateProps {
  children: ReactNode;
}

export function StartupGate({ children }: StartupGateProps) {
  const [isReady, setIsReady] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [retryTrigger, setRetryTrigger] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);

  const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  async function handleClose() {
    if (!IS_TAURI) return;
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().close();
  }

  async function handleMinimize() {
    if (!IS_TAURI) return;
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().minimize();
  }

  async function handleMaximize() {
    if (!IS_TAURI) return;
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    if (await win.isMaximized()) {
      await win.unmaximize();
    } else {
      await win.maximize();
    }
  }

  useEffect(() => {
    let cancelled = false;
    let pollTimer: number;

    const startTime = Date.now();
    const intervalTimer = window.setInterval(() => {
      if (!cancelled) {
        setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
      }
    }, 500);

    async function poll() {
      if (cancelled) return;
      try {
        const ok = await checkBackendStatus();
        if (ok && !cancelled) {
          setIsReady(true);
          return;
        }
      } catch {
        // Backend not ready yet
      }

      if (!cancelled) {
        pollTimer = window.setTimeout(poll, 350);
      }
    }

    poll();

    return () => {
      cancelled = true;
      window.clearTimeout(pollTimer);
      window.clearInterval(intervalTimer);
    };
  }, [retryTrigger]);

  function handleManualRetry() {
    setIsRetrying(true);
    setElapsedSeconds(0);
    setRetryTrigger((prev) => prev + 1);
    setTimeout(() => setIsRetrying(false), 800);
  }

  if (isReady) {
    return <>{children}</>;
  }

  return (
    <div className="fixed inset-0 z-[999] flex flex-col bg-base-950 select-none">
      {/* Title bar with drag region & window controls */}
      <div
        data-tauri-drag-region
        className="relative z-10 flex h-14 items-center justify-between border-b border-white/[0.06] bg-base-950/40 px-4 md:h-10"
      >
        {IS_TAURI ? (
          <div className="group flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleClose}
              title="Close"
              className="flex h-3 w-3 items-center justify-center rounded-full bg-[#FF5F57] transition-all hover:brightness-90"
            >
              <span className="hidden text-[8px] leading-none text-[#7a0000] group-hover:block">&#10005;</span>
            </button>
            <button
              type="button"
              onClick={handleMinimize}
              title="Minimize"
              className="flex h-3 w-3 items-center justify-center rounded-full bg-[#FEBC2E] transition-all hover:brightness-90"
            >
              <span className="hidden text-[8px] leading-none text-[#7a5800] group-hover:block">&#8722;</span>
            </button>
            <button
              type="button"
              onClick={handleMaximize}
              title="Maximize"
              className="flex h-3 w-3 items-center justify-center rounded-full bg-[#28C840] transition-all hover:brightness-90"
            >
              <span className="hidden text-[7px] leading-none text-[#004d00] group-hover:block">&#10697;</span>
            </button>
          </div>
        ) : (
          <div />
        )}
      </div>

      {/* Clean, anti-slop center content */}
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4">
        <img
          src="/app-icon.png"
          alt="Noctune"
          className="h-14 w-14 select-none drop-shadow-md"
          draggable={false}
        />

        {/* Quiet status indicators (only after delay, zero marketing slop) */}
        {elapsedSeconds >= 4 && elapsedSeconds < 10 && (
          <p className="font-mono text-xs text-muted tracking-wide animate-fade-in">
            Connecting to audio engine...
          </p>
        )}

        {elapsedSeconds >= 10 && (
          <div className="flex flex-col items-center gap-2.5 animate-fade-in">
            <p className="font-mono text-xs text-muted text-center max-w-xs leading-relaxed">
              Backend engine is taking longer than usual to start.
            </p>
            <button
              type="button"
              onClick={handleManualRetry}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-base-900/60 px-3 py-1 text-xs font-medium text-soft hover:border-white/20 hover:text-white transition-colors"
            >
              <RefreshCw size={11} className={isRetrying ? 'animate-spin' : ''} />
              <span>Retry Connection</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
