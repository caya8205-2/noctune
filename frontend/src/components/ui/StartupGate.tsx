import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Eye, EyeOff, Loader2, QrCode, RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  checkBackendStatus,
  getMobileServerConfig,
  IS_TAURI_DESKTOP,
  isMobileClientMode,
  setMobileServerConfig,
  verifyRemoteServer,
} from '../../utils/api';
import { QrScannerModal } from './QrScannerModal';
import { parsePairingData } from '../../utils/qr';

interface StartupGateProps {
  children: ReactNode;
}

export function StartupGate({ children }: StartupGateProps) {
  const queryClient = useQueryClient();
  const mobileMode = isMobileClientMode();

  const [isReady, setIsReady] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [retryTrigger, setRetryTrigger] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);

  const [checkingSavedMobile, setCheckingSavedMobile] = useState(() => {
    if (!mobileMode) return false;
    return Boolean(getMobileServerConfig()?.baseUrl);
  });
  const [serverUrl, setServerUrl] = useState(() => getMobileServerConfig()?.baseUrl ?? '');
  const [accessKey, setAccessKey] = useState(() => getMobileServerConfig()?.apiKey ?? '');
  const [showKey, setShowKey] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  async function handleClose() {
    if (!IS_TAURI_DESKTOP) return;
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().close();
  }

  async function handleMinimize() {
    if (!IS_TAURI_DESKTOP) return;
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().minimize();
  }

  async function handleMaximize() {
    if (!IS_TAURI_DESKTOP) return;
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    if (await win.isMaximized()) {
      await win.unmaximize();
    } else {
      await win.maximize();
    }
  }

  useEffect(() => {
    if (!mobileMode) return;
    const onAuthChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ connected?: boolean }>).detail;
      if (detail?.connected === false) {
        const saved = getMobileServerConfig();
        setServerUrl(saved?.baseUrl ?? '');
        setAccessKey(saved?.apiKey ?? '');
        setConnectError(null);
        setCheckingSavedMobile(false);
        setIsReady(false);
      }
    };
    window.addEventListener('noctune:mobile-auth-changed', onAuthChanged);
    return () => window.removeEventListener('noctune:mobile-auth-changed', onAuthChanged);
  }, [mobileMode]);

  useEffect(() => {
    if (!mobileMode) return;
    let cancelled = false;
    const saved = getMobileServerConfig();
    if (!saved?.baseUrl) {
      setCheckingSavedMobile(false);
      return;
    }

    setCheckingSavedMobile(true);
    setConnectError(null);
    verifyRemoteServer(saved.baseUrl, saved.apiKey)
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setIsReady(true);
        } else {
          setConnectError(res.error ?? 'Could not connect to saved server.');
        }
      })
      .finally(() => {
        if (!cancelled) setCheckingSavedMobile(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mobileMode]);

  useEffect(() => {
    if (mobileMode) return;

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
  }, [mobileMode, retryTrigger]);

  function handleManualRetry() {
    setIsRetrying(true);
    setElapsedSeconds(0);
    setRetryTrigger((prev) => prev + 1);
    setTimeout(() => setIsRetrying(false), 800);
  }

  async function connectWithCredentials(url: string, key: string) {
    if (!url.trim()) {
      setConnectError('Enter your desktop server URL.');
      return;
    }

    setConnecting(true);
    setConnectError(null);
    try {
      const result = await verifyRemoteServer(url, key);
      if (!result.ok) {
        setConnectError(result.error ?? 'Connection failed.');
        return;
      }
      const saved = setMobileServerConfig(url, key);
      setServerUrl(saved.baseUrl);
      setAccessKey(saved.apiKey);
      queryClient.clear();
      setIsReady(true);
    } finally {
      setConnecting(false);
    }
  }

  function handleScan(code: string) {
    const data = parsePairingData(code);
    if (data) {
      setServerUrl(data.url);
      setAccessKey(data.key);
      void connectWithCredentials(data.url, data.key);
    } else {
      setConnectError('Invalid QR code format.');
    }
  }

  async function handleMobileConnect(e: FormEvent) {
    e.preventDefault();
    await connectWithCredentials(serverUrl, accessKey);
  }

  if (isReady) {
    return <>{children}</>;
  }

  if (mobileMode) {
    return (
      <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-base-950 px-5 py-8 text-white select-none overflow-y-auto">
        {checkingSavedMobile ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <img
              src="/app-icon.png"
              alt="Noctune"
              className="h-14 w-14 select-none drop-shadow-md"
              draggable={false}
            />
            <div className="flex items-center gap-2 font-mono text-xs text-muted">
              <Loader2 size={14} className="animate-spin text-accent" />
              <span>Connecting to server...</span>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-sm rounded-2xl border border-base-600/70 bg-base-900/95 p-6 shadow-2xl">
            <div className="flex items-center gap-3.5">
              <img
                src="/app-icon.png"
                alt="Noctune"
                className="h-11 w-11 flex-shrink-0 rounded-xl drop-shadow-md"
                draggable={false}
              />
              <div>
                <p className="section-label text-accent">Mobile Client</p>
                <h1 className="mt-0.5 text-lg font-bold tracking-tight text-white">
                  Connect to desktop
                </h1>
              </div>
            </div>

            <p className="mt-3 text-xs text-muted leading-relaxed">
              Open Noctune on your PC, start Mobile Companion in Settings, and scan the QR code or enter credentials below.
            </p>

            {/* Quick QR pairing button */}
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-accent/40 bg-accent/15 px-4 py-3 text-xs font-semibold text-accent hover:bg-accent/25 transition-all min-h-[46px] w-full touch-manipulation shadow-lg shadow-accent/10"
            >
              <QrCode size={16} />
              <span>Scan Pairing QR Code</span>
            </button>

            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-white/[0.08]" />
              <span className="text-[11px] uppercase tracking-wider text-muted">or enter manually</span>
              <div className="h-px flex-1 bg-white/[0.08]" />
            </div>

            <form onSubmit={handleMobileConnect} className="flex flex-col gap-3.5">
              <div>
                <label htmlFor="mobile-server-url" className="mb-1.5 block text-xs font-medium text-soft">
                  Server URL
                </label>
                <input
                  id="mobile-server-url"
                  type="text"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder="https://example.trycloudflare.com"
                  className="input-base font-mono text-xs min-h-[44px]"
                  required
                />
              </div>

              <div>
                <label htmlFor="mobile-access-key" className="mb-1.5 block text-xs font-medium text-soft">
                  Access Key
                </label>
                <div className="relative">
                  <input
                    id="mobile-access-key"
                    type={showKey ? 'text' : 'password'}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={accessKey}
                    onChange={(e) => setAccessKey(e.target.value)}
                    placeholder="noc_..."
                    className="input-base font-mono text-xs min-h-[44px] pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    aria-label={showKey ? 'Hide access key' : 'Show access key'}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:text-white transition-colors"
                  >
                    {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {connectError && (
                <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-xs text-red-300 leading-relaxed select-text">
                  {connectError}
                </div>
              )}

              <button
                type="submit"
                disabled={connecting}
                className="btn-accent mt-1 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {connecting ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>Connecting...</span>
                  </>
                ) : (
                  <span>Connect</span>
                )}
              </button>
            </form>
          </div>
        )}

        <QrScannerModal
          open={scannerOpen}
          onClose={() => setScannerOpen(false)}
          onScan={handleScan}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[999] flex flex-col bg-base-950 select-none">
      {/* Title bar with drag region & window controls */}
      <div
        data-tauri-drag-region
        className="relative z-10 flex h-14 items-center justify-between border-b border-white/[0.06] bg-base-950/40 px-4 md:h-10"
      >
        {IS_TAURI_DESKTOP ? (
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
