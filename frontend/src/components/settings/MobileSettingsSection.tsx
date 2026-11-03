import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle, Eye, EyeOff, Loader2, QrCode } from 'lucide-react';
import {
  api,
  apiUrl,
  clearMobileServerConfig,
  getMobileServerConfig,
  type MobileCompanionStatus,
  setMobileServerConfig,
  verifyRemoteServer,
} from '../../utils/api';
import { usePlayerStore } from '../../store/player';
import { QrCodeView } from '../ui/QrCodeView';
import { QrScannerModal } from '../ui/QrScannerModal';
import { parsePairingData } from '../../utils/qr';

function generateRandomAccessKey(): string {
  const bytes = new Uint8Array(12);
  window.crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `noc_${hex}`;
}

export function MobileCompanionSection() {
  const [status, setStatus] = useState<MobileCompanionStatus | null>(null);
  const [separateDb, setSeparateDb] = useState(true);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [tunnelMode, setTunnelMode] = useState<'quick' | 'token'>('quick');
  const [tunnelToken, setTunnelToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [customDomain, setCustomDomain] = useState('');

  const [busyAction, setBusyAction] = useState<'start' | 'stop' | 'save' | 'install' | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [copiedField, setCopiedField] = useState<'url' | 'key' | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  async function refreshStatus(syncForm = false) {
    try {
      const s = await api.getMobileHostStatus();
      setStatus(s);
      if (syncForm) {
        setSeparateDb(s.separateDb ?? true);
        setApiKey(s.apiKey || generateRandomAccessKey());
        setTunnelMode(s.tunnelMode ?? 'quick');
        setCustomDomain(s.customDomain ?? '');
        setInitialized(true);
      } else if (s.publicUrl && s.tunnelMode === 'token' && !customDomain && s.customDomain) {
        setCustomDomain(s.customDomain);
      }
    } catch {
      // Host endpoint unavailable
    }
  }

  useEffect(() => {
    refreshStatus(true);
  }, []);

  useEffect(() => {
    if (!status || (status.state !== 'starting' && status.state !== 'running')) return;
    const timer = window.setInterval(() => {
      refreshStatus(false);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [status?.state]);

  async function copyText(value: string, field: 'url' | 'key') {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField((prev) => (prev === field ? null : prev)), 2000);
    } catch {}
  }

  async function handleSaveConfig() {
    setBusyAction('save');
    setActionError(null);
    setSavedNotice(false);
    try {
      const keyToSave = apiKey.trim() || generateRandomAccessKey();
      setApiKey(keyToSave);
      const body: Record<string, unknown> = {
        mobileSeparateDb: separateDb,
        mobileApiKey: keyToSave,
        mobileTunnelMode: tunnelMode,
        mobileCustomDomain: customDomain.trim(),
      };
      if (tunnelToken.trim()) {
        body.mobileTunnelToken = tunnelToken.trim();
      }

      const res = await fetch(await apiUrl('/settings'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to save mobile settings');
      }
      setTunnelToken('');
      await refreshStatus(false);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2500);
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleStart() {
    setBusyAction('start');
    setActionError(null);
    try {
      const keyToUse = apiKey.trim() || generateRandomAccessKey();
      setApiKey(keyToUse);
      const payload: {
        separateDb: boolean;
        apiKey: string;
        tunnelMode: 'quick' | 'token';
        tunnelToken?: string;
        customDomain: string;
      } = {
        separateDb,
        apiKey: keyToUse,
        tunnelMode,
        customDomain: customDomain.trim(),
      };
      if (tunnelToken.trim()) {
        payload.tunnelToken = tunnelToken.trim();
      }
      const next = await api.startMobileHost(payload);
      setTunnelToken('');
      setStatus(next);
      if (next.customDomain && !customDomain) {
        setCustomDomain(next.customDomain);
      }
    } catch (err) {
      setActionError((err as Error).message);
      await refreshStatus(false);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleStop() {
    setBusyAction('stop');
    setActionError(null);
    try {
      const next = await api.stopMobileHost();
      setStatus(next);
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleInstallCloudflared() {
    setBusyAction('install');
    setActionError(null);
    try {
      const next = await api.installCloudflared();
      setStatus(next);
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setBusyAction(null);
    }
  }

  const isRunning = status?.state === 'running';
  const isStarting = status?.state === 'starting' || busyAction === 'start';
  const settingsChangedWhileRunning =
    isRunning &&
    initialized &&
    (separateDb !== status.separateDb ||
      tunnelMode !== status.tunnelMode ||
      apiKey.trim() !== status.apiKey ||
      Boolean(tunnelToken.trim()));

  return (
    <section className="surface-panel flex flex-col gap-4 p-5">
      <div>
        <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">
          Mobile Companion
        </h2>
        <p className="text-xs text-muted leading-relaxed mt-2">
          Run an on-demand server on port 3130 with a Cloudflare Tunnel so Noctune Mobile can stream from this PC anywhere.
        </p>
      </div>

      {/* Live Status & Start/Stop Control */}
      <div className="rounded-lg border border-base-600/70 bg-base-900 p-3.5 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${
                  isRunning
                    ? 'bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.45)]'
                    : isStarting
                    ? 'bg-amber-400 animate-pulse'
                    : status?.state === 'error'
                    ? 'bg-red-400'
                    : 'bg-base-600'
                }`}
                aria-hidden="true"
              />
              <span className="text-sm font-medium text-white">
                {isRunning
                  ? `Running on 127.0.0.1:${status?.port ?? 3130}`
                  : isStarting
                  ? 'Starting server and tunnel...'
                  : status?.state === 'error'
                  ? 'Server stopped with an error'
                  : 'Mobile server is offline'}
              </span>
            </div>
            <p className="text-xs text-muted mt-1">
              {isRunning
                ? `${status?.separateDb ? 'Isolated mobile database' : 'Synced with desktop database'} · ${
                    status?.tunnelConnected ? 'Cloudflare Tunnel connected' : 'Connecting Cloudflare Tunnel...'
                  }`
                : 'Starts only when you turn it on and stops automatically when Noctune exits.'}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {isRunning ? (
              <>
                {settingsChangedWhileRunning && (
                  <button
                    type="button"
                    onClick={handleStart}
                    disabled={busyAction !== null}
                    className="btn-accent px-3.5 py-2 rounded-xl text-xs font-semibold min-h-[40px] disabled:opacity-50"
                  >
                    Apply & Restart
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleStop}
                  disabled={busyAction !== null}
                  className="btn-danger px-4 py-2 rounded-xl text-xs font-semibold min-h-[40px] disabled:opacity-50"
                >
                  {busyAction === 'stop' ? 'Stopping...' : 'Stop Server'}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleStart}
                disabled={busyAction !== null}
                className="btn-accent flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold min-h-[40px] disabled:opacity-50"
              >
                {isStarting ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Starting...</span>
                  </>
                ) : (
                  <span>Start Server</span>
                )}
              </button>
            )}
          </div>
        </div>

        {isRunning && status?.publicUrl && (
          <div className="flex flex-col gap-2 rounded-lg border border-base-600/60 bg-base-950 p-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="block text-[10px] uppercase tracking-wider text-muted">Tunnel URL</span>
                <span className="block truncate font-mono text-xs text-accent select-all mt-0.5">
                  {status.publicUrl}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setShowQr((v) => !v)}
                  className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/20 transition-colors"
                >
                  <QrCode size={13} />
                  <span>{showQr ? 'Hide QR' : 'Pairing QR'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => copyText(status.publicUrl || '', 'url')}
                  className="rounded-lg border border-base-600 bg-base-800 px-3 py-1.5 text-xs font-medium text-soft hover:text-white hover:border-base-500 transition-colors"
                >
                  {copiedField === 'url' ? 'Copied!' : 'Copy URL'}
                </button>
              </div>
            </div>

            {showQr && (
              <div className="mt-2 pt-3 border-t border-white/[0.08] flex flex-col sm:flex-row items-center gap-4">
                <QrCodeView
                  value={JSON.stringify({
                    url: status.publicUrl,
                    key: status.apiKey || apiKey,
                  })}
                  size={160}
                />
                <div className="text-center sm:text-left text-xs text-muted leading-relaxed max-w-sm">
                  <p className="font-semibold text-white mb-1">Instant Mobile Pairing</p>
                  <p>Open Noctune on your phone and tap <strong className="text-accent">Scan Pairing QR</strong> to connect immediately without typing.</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cloudflared missing callout */}
      {status && !status.cloudflaredInstalled && (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs text-amber-200/90 leading-relaxed">
            Cloudflare Tunnel binary (cloudflared) was not found on this PC. Download it once to enable remote mobile access.
          </p>
          <button
            type="button"
            onClick={handleInstallCloudflared}
            disabled={busyAction !== null || status.installingCloudflared}
            className="btn-accent px-3.5 py-2 rounded-xl text-xs font-semibold shrink-0 disabled:opacity-50"
          >
            {busyAction === 'install' || status.installingCloudflared ? 'Downloading...' : 'Install cloudflared'}
          </button>
        </div>
      )}

      {(actionError || status?.lastError) && (
        <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300 leading-relaxed">
          {actionError || status?.lastError}
        </div>
      )}

      {/* Separate Database Toggle */}
      <button
        type="button"
        onClick={() => setSeparateDb((v) => !v)}
        className="flex items-center justify-between gap-3 rounded-lg border border-base-600/70 bg-base-900 p-3 text-left hover:border-base-500 transition-colors"
      >
        <span>
          <span className="block text-sm font-medium text-white">Separate Mobile Database</span>
          <span className="block text-xs text-muted mt-1">
            Keep mobile playlists, liked tracks, and listening history isolated. Turn off to sync directly with your desktop library.
          </span>
        </span>
        <span
          className={`relative h-6 w-11 flex-shrink-0 rounded-full border transition-colors ${
            separateDb ? 'border-accent/50 bg-accent/25' : 'border-base-600 bg-base-800'
          }`}
          aria-hidden="true"
        >
          <span
            className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full transition-transform ${
              separateDb
                ? 'translate-x-5 bg-accent shadow-[0_0_12px_rgba(190,255,32,0.35)]'
                : 'translate-x-1 bg-muted'
            }`}
          />
        </span>
      </button>

      {/* Access Key */}
      <div>
        <label className="text-xs text-muted mb-1.5 block">Access Key</label>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter custom key or click Generate"
              className="input-base font-mono text-xs pr-10"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              aria-label={showKey ? 'Hide access key' : 'Show access key'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-white transition-colors"
            >
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setApiKey(generateRandomAccessKey())}
              className="px-3 py-2 rounded-xl text-xs font-medium border border-base-600 text-soft hover:text-white hover:border-base-500 transition-colors"
            >
              Generate
            </button>
            <button
              type="button"
              onClick={() => copyText(apiKey, 'key')}
              disabled={!apiKey}
              className="px-3 py-2 rounded-xl text-xs font-medium border border-base-600 text-soft hover:text-white hover:border-base-500 transition-colors disabled:opacity-40"
            >
              {copiedField === 'key' ? 'Copied!' : 'Copy Key'}
            </button>
          </div>
        </div>
      </div>

      {/* Tunnel Mode */}
      <div className="rounded-lg border border-base-600/70 bg-base-900 p-3 flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-white">Cloudflare Tunnel Mode</p>
            <p className="mt-1 text-xs text-muted">
              {tunnelMode === 'quick'
                ? 'Generates a temporary trycloudflare.com URL automatically with zero setup.'
                : 'Connects your own Cloudflare Zero Trust tunnel token and custom domain.'}
            </p>
          </div>
          <select
            value={tunnelMode}
            onChange={(e) => setTunnelMode(e.target.value as 'quick' | 'token')}
            className="rounded-xl border border-base-600/80 bg-base-800 px-3.5 py-2 text-xs font-medium text-white hover:border-accent/40 focus:border-accent focus:outline-none shrink-0 cursor-pointer transition-colors"
          >
            <option value="quick" className="bg-base-900 text-white">
              Quick Tunnel (Random URL)
            </option>
            <option value="token" className="bg-base-900 text-white">
              Custom Domain (Tunnel Token)
            </option>
          </select>
        </div>

        {tunnelMode === 'token' && (
          <div className="flex flex-col gap-3 border-t border-base-600/50 pt-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-muted">Cloudflare Tunnel Token</label>
                {status?.hasTunnelToken && !tunnelToken && (
                  <span className="text-[11px] text-accent flex items-center gap-1">
                    <CheckCircle size={11} /> Token saved
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={tunnelToken}
                  onChange={(e) => setTunnelToken(e.target.value)}
                  placeholder={
                    status?.hasTunnelToken
                      ? 'Token saved (paste a new token or install command to replace)'
                      : 'Paste eyJh... token or cloudflared service install command'
                  }
                  className="input-base font-mono text-xs pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  aria-label={showToken ? 'Hide tunnel token' : 'Show tunnel token'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-white transition-colors"
                >
                  {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs text-muted mb-1.5 block">
                Public Domain (Optional, auto-detected when tunnel connects)
              </label>
              <input
                type="text"
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value)}
                placeholder="https://mobile.yourdomain.com"
                className="input-base font-mono text-xs"
              />
              <p className="text-[11px] text-muted mt-1.5">
                Ensure your tunnel public hostname in Cloudflare Zero Trust points to http://127.0.0.1:3130.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSaveConfig}
          disabled={busyAction !== null}
          className="btn-accent flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold disabled:opacity-50"
        >
          {busyAction === 'save' ? (
            <>
              <Loader2 size={13} className="animate-spin" /> Saving...
            </>
          ) : savedNotice ? (
            <>
              <CheckCircle size={13} /> Saved!
            </>
          ) : (
            'Save Mobile Settings'
          )}
        </button>
      </div>
    </section>
  );
}

export function MobileServerConnectionSection({ onReconnected }: { onReconnected?: () => void }) {
  const queryClient = useQueryClient();
  const setIsPlaying = usePlayerStore((state) => state.setIsPlaying);

  const initial = getMobileServerConfig();
  const [serverUrl, setServerUrl] = useState(initial?.baseUrl ?? '');
  const [accessKey, setAccessKey] = useState(initial?.apiKey ?? '');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  async function applyConnection(url: string, key: string) {
    if (!url.trim()) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const check = await verifyRemoteServer(url, key);
      if (!check.ok) {
        setError(check.error ?? 'Failed to verify server.');
        return;
      }
      const next = setMobileServerConfig(url, key);
      setServerUrl(next.baseUrl);
      setAccessKey(next.apiKey);
      await queryClient.invalidateQueries();
      onReconnected?.();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  function handleScan(code: string) {
    const data = parsePairingData(code);
    if (data) {
      setServerUrl(data.url);
      setAccessKey(data.key);
      void applyConnection(data.url, data.key);
    } else {
      setError('Invalid pairing QR code.');
    }
  }

  async function handleReconnect() {
    await applyConnection(serverUrl, accessKey);
  }

  function handleDisconnect() {
    setIsPlaying(false);
    queryClient.clear();
    clearMobileServerConfig();
  }

  return (
    <section className="surface-panel flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">
            Server Connection
          </h2>
          <p className="text-xs text-muted leading-relaxed mt-2">
            Connected to your Noctune Desktop companion server.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-1 text-[11px] font-medium text-green-300 shrink-0">
          <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
          Connected
        </span>
      </div>

      <button
        type="button"
        onClick={() => setScannerOpen(true)}
        className="flex items-center justify-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-xs font-semibold text-accent hover:bg-accent/20 transition-all min-h-[42px] w-full"
      >
        <QrCode size={15} />
        <span>Scan QR to Re-Pair</span>
      </button>

      <div className="flex flex-col gap-3">
        <div>
          <label className="text-xs text-muted mb-1.5 block">Server URL</label>
          <input
            type="text"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="https://example.trycloudflare.com"
            className="input-base font-mono text-xs min-h-[44px]"
          />
        </div>

        <div>
          <label className="text-xs text-muted mb-1.5 block">Access Key</label>
          <div className="relative">
            <input
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
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300 leading-relaxed">
          {error}
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
        <button
          type="button"
          onClick={handleDisconnect}
          className="btn-danger rounded-xl px-4 py-2.5 text-xs font-semibold min-h-[44px]"
        >
          Disconnect Server
        </button>

        <button
          type="button"
          onClick={handleReconnect}
          disabled={saving}
          className="btn-accent flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-xs font-semibold min-h-[44px] disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 size={14} className="animate-spin" /> Verifying...
            </>
          ) : saved ? (
            <>
              <CheckCircle size={14} /> Connected!
            </>
          ) : (
            'Save & Reconnect'
          )}
        </button>
      </div>

      <QrScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScan}
      />
    </section>
  );
}
