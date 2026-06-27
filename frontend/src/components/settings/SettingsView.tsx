import { useEffect, useState } from 'react';
import {
  CheckCircle,
  Database,
  Download,
  ExternalLink,
  HardDrive,
  Eye,
  EyeOff,
  FileUp,
  Info,
  ListMusic,
  Loader2,
  Keyboard,
  Play,
  RefreshCw,
  ShieldAlert,
  Square,
  Sparkles,
  Trash2,
  Zap,
  XCircle,
} from 'lucide-react';
import { keyboardShortcuts } from '../../constants/keyboardShortcuts';
import { api, apiUrl, type BackendStatus, type UpdateInfo } from '../../utils/api';
import { openExternalUrl } from '../../hooks/useUpdateChecker';

const APP_VERSION = __APP_VERSION__;

interface SettingsData {
  searchEngine: 'ytdlp' | 'spotify';
  audioQualityPreference: 'auto' | 'high';
  audioCacheLimitMb: number;
  discordRpcEnabled: boolean;
  cache?: {
    learning: { total: number; totalQueries: number };
    lyrics: { total: number; hits: number; misses: number };
    audio: { files: number; bytes: number };
  };
  spotify: {
    clientId: string;
    clientSecretMasked: string;
    configured: boolean;
  };
  resolver?: {
    failedIds: number;
    matchCache?: { total: number };
  };
}

const engineNotes = [
  {
    Icon: HardDrive,
    title: 'Local library',
    desc: 'Playlists, covers, liked songs, and learned playback data stay on this device.',
  },
  {
    Icon: Database,
    title: 'Local cache',
    desc: 'Tracks, lyrics, and audio files are cached locally so repeat plays can start faster.',
  },
  {
    Icon: Zap,
    title: 'Prefetch queue',
    desc: 'Upcoming tracks are prepared in the background after playback starts.',
  },
  {
    Icon: Sparkles,
    title: 'Spotify matching',
    desc: 'Spotify results provide metadata, then Noctune maps the track to a playable YouTube stream.',
  },
  {
    Icon: ListMusic,
    title: 'Auto queue',
    desc: 'Recommendations are built from the selected seed track and filtered before playback.',
  },
];

function formatBytes(bytes = 0): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const DEBUG_SEARCH_KEY = 'noctune:debug-search-scoring';
const DEBUG_DASHBOARD_URL = 'http://localhost:4173/debug.html';
const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function SettingsView() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [cacheBusy, setCacheBusy] = useState(false);
  const [audioCacheLimitMb, setAudioCacheLimitMb] = useState(1024);
  const [audioQualityPreference, setAudioQualityPreference] = useState<'auto' | 'high'>('auto');
  const [discordRpcEnabled, setDiscordRpcEnabled] = useState(true);
  const [cacheMessage, setCacheMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [diagnostics, setDiagnostics] = useState<BackendStatus | null>(null);
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false);
  const [debugSearch, setDebugSearch] = useState(false);
  const [previewRunning, setPreviewRunning] = useState(false);
  const [previewBusy, setPreviewBusy] = useState<'start' | 'stop' | 'open' | null>(null);
  const [previewMessage, setPreviewMessage] = useState<string | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);

  async function loadSettings() {
    const res = await fetch(await apiUrl('/settings'));
    const d = (await res.json()) as SettingsData;
    setData(d);
    setClientId(d.spotify.clientId);
    setAudioCacheLimitMb(d.audioCacheLimitMb ?? 1024);
    setAudioQualityPreference(d.audioQualityPreference ?? 'auto');
    setDiscordRpcEnabled(d.discordRpcEnabled ?? true);
  }

  useEffect(() => {
    loadSettings().catch(console.error);
    api.status().then(setDiagnostics).catch(console.error);
    api.checkForUpdates().then(setUpdateInfo).catch(console.error);
    if (!IS_TAURI) {
      api.debugPreviewStatus().then((status) => setPreviewRunning(status.running)).catch(console.error);
    }
    setDebugSearch(localStorage.getItem(DEBUG_SEARCH_KEY) === '1');
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);

    try {
      const body: Record<string, string> = {};
      if (clientId) body.spotifyClientId = clientId;
      if (clientSecret) body.spotifyClientSecret = clientSecret;

      const res = await fetch(await apiUrl('/settings'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const updated = (await res.json()) as SettingsData;
      setData(updated);
      setClientSecret('');
      setTestResult(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);

    try {
      const body: Record<string, string> = {};
      if (clientId) body.spotifyClientId = clientId;
      if (clientSecret) body.spotifyClientSecret = clientSecret;

      const res = await fetch(await apiUrl('/settings/spotify/test'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = (await res.json()) as { ok: boolean; error?: string };
      if (result.ok) {
        setData((current) =>
          current
            ? {
              ...current,
              spotify: {
                ...current.spotify,
                clientId: clientId || current.spotify.clientId,
                configured: true,
              },
            }
            : current
        );
        setClientSecret('');
      }
      setTestResult(result);
    } catch {
      setTestResult({ ok: false, error: 'Request failed' });
    } finally {
      setTesting(false);
    }
  }

  async function handleExportCache() {
    setCacheBusy(true);
    setCacheMessage(null);

    try {
      const res = await fetch(await apiUrl('/settings/cache/export'));
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `noctune-cache-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setCacheMessage({ ok: true, text: 'Cache exported.' });
    } catch (err) {
      setCacheMessage({ ok: false, text: (err as Error).message });
    } finally {
      setCacheBusy(false);
    }
  }

  async function handleImportCache(file: File | null) {
    if (!file) return;
    setCacheBusy(true);
    setCacheMessage(null);

    try {
      const json = JSON.parse(await file.text());
      const res = await fetch(await apiUrl('/settings/cache/import'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(json),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.message ?? 'Import failed');
      await loadSettings();
      setCacheMessage({ ok: true, text: 'Cache imported.' });
    } catch (err) {
      setCacheMessage({ ok: false, text: (err as Error).message });
    } finally {
      setCacheBusy(false);
    }
  }

  async function handleClearCache() {
    if (!window.confirm('Clear all cache data?')) return;
    setCacheBusy(true);
    setCacheMessage(null);

    try {
      const res = await fetch(await apiUrl('/settings/cache'), { method: 'DELETE' });
      if (!res.ok) throw new Error('Clear cache failed');
      await loadSettings();
      setCacheMessage({ ok: true, text: 'All cache cleared.' });
    } catch (err) {
      setCacheMessage({ ok: false, text: (err as Error).message });
    } finally {
      setCacheBusy(false);
    }
  }

  async function handleClearTrackCache() {
    if (!window.confirm('Clear cached track metadata?')) return;
    setCacheBusy(true);
    setCacheMessage(null);

    try {
      const res = await fetch(await apiUrl('/settings/cache/tracks'), { method: 'DELETE' });
      if (!res.ok) throw new Error('Clear track cache failed');
      await loadSettings();
      setCacheMessage({ ok: true, text: 'Track cache cleared.' });
    } catch (err) {
      setCacheMessage({ ok: false, text: (err as Error).message });
    } finally {
      setCacheBusy(false);
    }
  }

  async function handleClearLyricsCache() {
    if (!window.confirm('Clear cached lyrics?')) return;
    setCacheBusy(true);
    setCacheMessage(null);

    try {
      const res = await fetch(await apiUrl('/settings/cache/lyrics'), { method: 'DELETE' });
      if (!res.ok) throw new Error('Clear lyrics cache failed');
      await loadSettings();
      setCacheMessage({ ok: true, text: 'Lyrics cache cleared.' });
    } catch (err) {
      setCacheMessage({ ok: false, text: (err as Error).message });
    } finally {
      setCacheBusy(false);
    }
  }

  async function handleClearAudioCache() {
    if (!window.confirm('Clear downloaded audio cache?')) return;
    setCacheBusy(true);
    setCacheMessage(null);

    try {
      const res = await fetch(await apiUrl('/settings/cache/audio'), { method: 'DELETE' });
      if (!res.ok) throw new Error('Clear audio cache failed');
      await loadSettings();
      setCacheMessage({ ok: true, text: 'Audio cache cleared.' });
    } catch (err) {
      setCacheMessage({ ok: false, text: (err as Error).message });
    } finally {
      setCacheBusy(false);
    }
  }

  async function handleSaveAudioCacheLimit() {
    setCacheBusy(true);
    setCacheMessage(null);

    try {
      const res = await fetch(await apiUrl('/settings'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioCacheLimitMb }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.message ?? 'Save cache limit failed');
      await loadSettings();
      setCacheMessage({ ok: true, text: 'Audio cache limit saved.' });
    } catch (err) {
      setCacheMessage({ ok: false, text: (err as Error).message });
    } finally {
      setCacheBusy(false);
    }
  }

  async function handleAudioQualityChange(preference: 'auto' | 'high') {
    if (preference === audioQualityPreference) return;
    const previous = audioQualityPreference;
    setAudioQualityPreference(preference);
    setCacheMessage(null);

    try {
      const res = await fetch(await apiUrl('/settings'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioQualityPreference: preference }),
      });
      const updated = (await res.json()) as SettingsData;
      if (!res.ok) throw new Error('Save audio quality failed');
      setData(updated);
      setAudioQualityPreference(updated.audioQualityPreference ?? preference);
      setCacheMessage({ ok: true, text: 'Preferred stream quality saved.' });
    } catch (err) {
      setAudioQualityPreference(previous);
      setCacheMessage({ ok: false, text: (err as Error).message });
    }
  }

  async function handleRefreshDiagnostics() {
    setDiagnosticsBusy(true);
    try {
      const status = await api.status();
      setDiagnostics(status);
      await loadSettings();
    } catch (err) {
      setCacheMessage({ ok: false, text: (err as Error).message });
    } finally {
      setDiagnosticsBusy(false);
    }
  }

  async function handleClearResolverBlacklist() {
    setDiagnosticsBusy(true);
    setCacheMessage(null);
    try {
      const result = await api.clearResolverBlacklist();
      await handleRefreshDiagnostics();
      setCacheMessage({ ok: true, text: `Cleared ${result.blacklist.cleared} failed resolver entr${result.blacklist.cleared === 1 ? 'y' : 'ies'}.` });
    } catch (err) {
      setCacheMessage({ ok: false, text: (err as Error).message });
    } finally {
      setDiagnosticsBusy(false);
    }
  }

  async function handleClearResolverMatchCache() {
    setDiagnosticsBusy(true);
    setCacheMessage(null);
    try {
      const result = await api.clearResolverMatchCache();
      await handleRefreshDiagnostics();
      setCacheMessage({ ok: true, text: `Cleared ${result.matchCache.cleared} Spotify match entr${result.matchCache.cleared === 1 ? 'y' : 'ies'}.` });
    } catch (err) {
      setCacheMessage({ ok: false, text: (err as Error).message });
    } finally {
      setDiagnosticsBusy(false);
    }
  }

  function handleDebugSearchChange(enabled: boolean) {
    setDebugSearch(enabled);
    localStorage.setItem(DEBUG_SEARCH_KEY, enabled ? '1' : '0');
  }

  async function waitForDebugDashboard() {
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        const res = await fetch(DEBUG_DASHBOARD_URL, { mode: 'no-cors' });
        if (res.type === 'opaque' || res.ok) return true;
      } catch {
        // still starting
      }
    }
    return false;
  }

  async function handleStartDebugPreview() {
    setPreviewBusy('start');
    setPreviewMessage(null);
    try {
      const result = await api.startDebugPreview();
      const ready = await waitForDebugDashboard();
      setPreviewRunning(true);
      setPreviewMessage(
        ready
          ? result.already ? 'Preview server is already running.' : 'Preview server started.'
          : 'Preview server started, but the dashboard did not respond yet.'
      );
    } catch (err) {
      console.error('Failed to start debug preview:', err);
      setPreviewMessage((err as Error).message);
    } finally {
      setPreviewBusy(null);
    }
  }

  async function handleOpenDebugDashboard() {
    setPreviewBusy('open');
    try {
      if (IS_TAURI) {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('open_debug_dashboard');
      } else {
        await openExternalUrl(DEBUG_DASHBOARD_URL);
      }
    } catch (err) {
      console.error('Failed to open debug dashboard:', err);
      setPreviewMessage((err as Error).message);
    } finally {
      setPreviewBusy(null);
    }
  }

  async function handleStopDebugPreview() {
    setPreviewBusy('stop');
    setPreviewMessage(null);
    try {
      const result = await api.stopDebugPreview();
      setPreviewRunning(false);
      setPreviewMessage(result.was_running ? 'Preview server stopped.' : 'Preview server was not running.');
    } catch (err) {
      console.error('Failed to stop debug preview:', err);
      setPreviewMessage((err as Error).message);
    } finally {
      setPreviewBusy(null);
    }
  }

  async function handleDiscordRpcToggle(enabled: boolean) {
    setDiscordRpcEnabled(enabled);
    try {
      const res = await fetch(await apiUrl('/settings'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discordRpcEnabled: enabled }),
      });
      const updated = (await res.json()) as SettingsData;
      setData(updated);
      setDiscordRpcEnabled(updated.discordRpcEnabled ?? enabled);
    } catch (err) {
      console.error('Failed to toggle Discord RPC:', err);
    }
  }

  async function handleCheckForUpdates() {
    setUpdateBusy(true);
    try {
      setUpdateInfo(await api.checkForUpdates(true));
    } catch (err) {
      setUpdateInfo({
        ok: false,
        currentVersion: APP_VERSION,
        latestVersion: null,
        updateAvailable: false,
        releaseName: null,
        releaseUrl: 'https://github.com/caya8205-2/noctune/releases/latest',
        publishedAt: null,
        checkedAt: Date.now(),
        error: (err as Error).message,
      });
    } finally {
      setUpdateBusy(false);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 lg:px-9 lg:py-8 gap-8">
      <div className="flex flex-col gap-2 max-w-3xl">
        <div className="flex items-center gap-3">
          <p className="section-label text-accent">Settings</p>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight">
          Make global choices feel immediate.
        </h1>
      </div>

      {/* Updates */}
      <section className="surface-panel flex flex-col gap-4 max-w-3xl p-5">
        <div>
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">
            Updates
          </h2>
          <p className="text-xs text-muted leading-relaxed mt-2">
            Noctune checks GitHub Releases on startup and then every 5 hours while the app is open.
          </p>
        </div>

        <div className="rounded-lg border border-base-600/70 bg-base-900 p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-white">
                {updateInfo?.ok === false
                  ? 'Update check failed'
                  : updateInfo?.updateAvailable
                  ? `Noctune ${updateInfo.latestVersion} is available`
                  : 'Noctune is up to date'}
              </p>
              <p className="mt-1 text-xs text-muted">
                Current version: {APP_VERSION}
                {updateInfo?.error ? ` · ${updateInfo.error}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleCheckForUpdates}
                disabled={updateBusy}
                className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm border border-base-600 text-soft hover:text-white hover:border-base-500 transition-all disabled:opacity-40"
              >
                {updateBusy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Check
              </button>
              <button
                type="button"
                onClick={() => openExternalUrl(updateInfo?.releaseUrl ?? 'https://github.com/caya8205-2/noctune/releases/latest').catch(console.error)}
                className="btn-accent px-3 py-2 rounded-xl text-sm"
              >
                <ExternalLink size={14} />
                Update
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Spotify API Credentials */}
      {IS_TAURI && (
        <section className="surface-panel flex flex-col gap-4 max-w-3xl p-5">
          <div>
            <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">
              Spotify API Credentials
            </h2>
            {data?.spotify.configured && (
              <span className="text-xs text-accent flex items-center gap-1 mt-2">
                <CheckCircle size={11} /> Configured
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => openExternalUrl('https://developer.spotify.com/dashboard').catch(console.error)}
            className="inline-flex self-start items-center gap-2 text-xs text-muted transition-colors hover:text-white"
          >
            <ExternalLink size={12} className="flex-shrink-0" />
            Get credentials at developer.spotify.com/dashboard
          </button>

          <p className="text-xs text-muted leading-relaxed">
            Spotify credentials are used for metadata search, playlist import, and release discovery.
            Playback still uses Noctune's local YouTube resolver.
          </p>

          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs text-muted mb-1.5 block">Client ID</label>
              <input
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder={data?.spotify.clientId || 'Paste your Client ID'}
                className="input-base font-mono text-xs"
              />
            </div>

            <div>
              <label className="text-xs text-muted mb-1.5 block">
                Client Secret
                {data?.spotify.clientSecretMasked && (
                  <span className="ml-2 text-base-500 font-mono">
                    (saved: {data.spotify.clientSecretMasked})
                  </span>
                )}
              </label>
              <div className="relative">
                <input
                  type={showSecret ? 'text' : 'password'}
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="Paste new secret to update"
                  className="input-base font-mono text-xs pr-10"
                />
                <button
                  onClick={() => setShowSecret((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-white transition-colors"
                >
                  {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          </div>

          {testResult && (
            <div
              className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${testResult.ok
                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}
            >
              {testResult.ok ? (
                <>
                  <CheckCircle size={14} /> Connected successfully!
                </>
              ) : (
                <>
                  <XCircle size={14} /> {testResult.error ?? 'Connection failed'}
                </>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleTest}
              disabled={testing || (!data?.spotify.configured && !clientId)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm border border-base-600 text-soft hover:text-white hover:border-base-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {testing ? <Loader2 size={14} className="animate-spin" /> : null}
              Test Connection
            </button>

            <button onClick={handleSave} disabled={saving} className="btn-accent flex-1">
              {saving ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Saving...
                </>
              ) : saved ? (
                <>
                  <CheckCircle size={14} /> Saved!
                </>
              ) : (
                'Save Credentials'
              )}
            </button>
          </div>
        </section>
      )}

      {/* Playback */}
      <section className="surface-panel flex flex-col gap-4 max-w-3xl p-5">
        <div>
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">
            Playback
          </h2>
          <p className="text-xs text-muted leading-relaxed mt-2">
            Choose how aggressively the local YouTube resolver should prefer audio stream quality.
            Spotify is still used only for metadata.
          </p>
        </div>

        <div className="rounded-lg border border-base-600/70 bg-base-900 p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-white">Preferred stream quality</p>
              <p className="mt-1 text-xs text-muted">
                High may use larger streams when available, then falls back automatically if a format fails.
              </p>
            </div>
            <div className="flex shrink-0 rounded-xl border border-base-600/70 bg-base-950 p-1">
              {(['auto', 'high'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleAudioQualityChange(option)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    audioQualityPreference === option
                      ? 'bg-accent text-base-950'
                      : 'text-muted hover:bg-base-800 hover:text-white'
                  }`}
                >
                  {option === 'auto' ? 'Auto' : 'High'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Discord Rich Presence */}
      {IS_TAURI && (
        <section className="surface-panel flex flex-col gap-4 max-w-3xl p-5">
          <div>
            <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">
              Discord Rich Presence
            </h2>
            <p className="text-xs text-muted leading-relaxed mt-2">
              Show music that you're listening to on your Discord profile
            </p>
          </div>

          <button
            type="button"
            onClick={() => handleDiscordRpcToggle(!discordRpcEnabled)}
            className="flex items-center justify-between gap-3 rounded-lg border border-base-600/70 bg-base-900 p-3 text-left hover:border-base-500 transition-colors"
          >
            <span>
              <span className="block text-sm font-medium text-white">Enable Discord RPC</span>
            </span>
            <span
              className={`relative h-6 w-11 flex-shrink-0 rounded-full border transition-colors ${discordRpcEnabled
                ? 'border-accent/50 bg-accent/25'
                : 'border-base-600 bg-base-800'
                }`}
              aria-hidden="true"
            >
              <span
                className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full transition-transform ${discordRpcEnabled
                  ? 'translate-x-5 bg-accent shadow-[0_0_12px_rgba(190,255,32,0.35)]'
                  : 'translate-x-1 bg-muted'
                  }`}
              />
            </span>
          </button>
        </section>
      )}

      {/* Diagnostics */}
      <section className="surface-panel flex flex-col gap-4 max-w-3xl p-5">
        <div>
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">
            Diagnostics
          </h2>
          <p className="text-xs text-muted leading-relaxed mt-2">
            Quick local health snapshot for resolver, prefetch, and temporary failed-stream blacklist.
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <div className="rounded-lg border border-base-600/70 bg-base-900 p-3">
            <p className="text-xs text-muted">Resolver</p>
            <p className="text-sm font-semibold text-white mt-1">
              {diagnostics?.resolver?.name ?? 'Unknown'}
            </p>
          </div>
          <div className="rounded-lg border border-base-600/70 bg-base-900 p-3">
            <p className="text-xs text-muted">Prefetched</p>
            <p className="text-sm font-semibold text-white mt-1">
              {diagnostics?.prefetch?.prefetched?.length ?? 0}
            </p>
          </div>
          <div className="rounded-lg border border-base-600/70 bg-base-900 p-3">
            <p className="text-xs text-muted">Failed IDs</p>
            <p className="text-sm font-semibold text-white mt-1">
              {diagnostics?.playbackBlacklist?.failedIds ?? data?.resolver?.failedIds ?? 0}
            </p>
          </div>
          <div className="rounded-lg border border-base-600/70 bg-base-900 p-3">
            <p className="text-xs text-muted">Matches</p>
            <p className="text-sm font-semibold text-white mt-1">
              {diagnostics?.matchCache?.total ?? data?.resolver?.matchCache?.total ?? 0}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button
            type="button"
            onClick={handleRefreshDiagnostics}
            disabled={diagnosticsBusy}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm border border-base-600 text-soft hover:text-white hover:border-base-500 transition-all disabled:opacity-40"
          >
            {diagnosticsBusy ? <Loader2 size={14} className="animate-spin" /> : <Info size={14} />}
            Refresh
          </button>
          <button
            type="button"
            onClick={handleClearResolverBlacklist}
            disabled={diagnosticsBusy}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm border border-base-600 text-soft hover:text-white hover:border-base-500 transition-all disabled:opacity-40"
          >
            <ShieldAlert size={14} />
            Clear failed IDs
          </button>
          <button
            type="button"
            onClick={handleClearResolverMatchCache}
            disabled={diagnosticsBusy}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm border border-base-600 text-soft hover:text-white hover:border-base-500 transition-all disabled:opacity-40"
          >
            <Trash2 size={14} />
            Clear matches
          </button>
        </div>

        <button
          type="button"
          onClick={() => handleDebugSearchChange(!debugSearch)}
          className="flex items-center justify-between gap-3 rounded-lg border border-base-600/70 bg-base-900 p-3 text-left hover:border-base-500 transition-colors"
        >
          <span>
            <span className="block text-sm font-medium text-white">Search scoring debug</span>
            <span className="block text-xs text-muted mt-1">Show candidate score and reasons in Search while tuning resolver matches.</span>
          </span>
          <span
            className={`relative h-6 w-11 flex-shrink-0 rounded-full border transition-colors ${debugSearch
              ? 'border-accent/50 bg-accent/25'
              : 'border-base-600 bg-base-800'
              }`}
            aria-hidden="true"
          >
            <span
              className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full transition-transform ${debugSearch
                ? 'translate-x-5 bg-accent shadow-[0_0_12px_rgba(190,255,32,0.35)]'
                : 'translate-x-1 bg-muted'
                }`}
            />
          </span>
        </button>

        <div className="rounded-lg border border-base-600/70 bg-base-900 p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${IS_TAURI || previewRunning ? 'bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.45)]' : 'bg-base-500'}`}
                  aria-hidden="true"
                />
                <span className="text-sm font-medium text-white">Debug Dashboard</span>
              </div>
              <span className="block text-xs text-muted mt-1">
                {IS_TAURI
                  ? 'Opens the bundled debug dashboard in a separate app window.'
                  : previewRunning ? 'Server running on localhost:4173.' : 'Preview server is stopped.'}
                {previewMessage ? ` ${previewMessage}` : ''}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {!IS_TAURI && (
                <button
                  type="button"
                  onClick={() => void handleStartDebugPreview()}
                  disabled={!!previewBusy || previewRunning}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-base-600 text-soft hover:text-white hover:border-base-500 transition-all disabled:opacity-40"
                >
                  {previewBusy === 'start'
                    ? <><Loader2 size={12} className="animate-spin" /> Starting</>
                    : <><Play size={12} /> Start</>
                  }
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleOpenDebugDashboard()}
                disabled={!!previewBusy}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-base-600 text-soft hover:text-white hover:border-base-500 transition-all disabled:opacity-40"
              >
                {previewBusy === 'open'
                  ? <><Loader2 size={12} className="animate-spin" /> Opening</>
                  : <><ExternalLink size={12} /> Open</>
                }
              </button>
              {!IS_TAURI && (
                <button
                  type="button"
                  onClick={() => void handleStopDebugPreview()}
                  disabled={!!previewBusy || !previewRunning}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-500/30 text-red-400 hover:text-red-300 hover:border-red-500/60 transition-all disabled:opacity-40"
                >
                  {previewBusy === 'stop'
                    ? <><Loader2 size={12} className="animate-spin" /> Stopping</>
                    : <><Square size={12} /> Stop</>
                  }
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Cache */}
      <section className="surface-panel flex flex-col gap-4 max-w-3xl p-5">
        <div>
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">
            Cache
          </h2>
          <p className="text-xs text-muted leading-relaxed mt-2">
            Export learned metadata, manage lyrics cache, and keep local audio storage under control.
          </p>
        </div>

        {cacheMessage && (
          <div
            className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${cacheMessage.ok
              ? 'bg-green-500/10 text-green-400 border border-green-500/20'
              : 'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}
          >
            {cacheMessage.ok ? <CheckCircle size={14} /> : <XCircle size={14} />}
            {cacheMessage.text}
          </div>
        )}

        {data?.cache && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="rounded-lg border border-base-600/70 bg-base-900 p-3">
              <p className="text-xs text-muted">Tracks</p>
              <p className="text-sm font-semibold text-white mt-1">{data.cache.learning.total} cached</p>
              <p className="text-[11px] text-muted mt-1">{data.cache.learning.totalQueries} queries</p>
            </div>
            <div className="rounded-lg border border-base-600/70 bg-base-900 p-3">
              <p className="text-xs text-muted">Lyrics</p>
              <p className="text-sm font-semibold text-white mt-1">{data.cache.lyrics.total} cached</p>
              <p className="text-[11px] text-muted mt-1">{data.cache.lyrics.hits} hits / {data.cache.lyrics.misses} misses</p>
            </div>
            <div className="rounded-lg border border-base-600/70 bg-base-900 p-3">
              <p className="text-xs text-muted">Audio</p>
              <p className="text-sm font-semibold text-white mt-1">
                {data.cache.audio.files} files
              </p>
              <p className="text-[11px] text-muted mt-1">{formatBytes(data.cache.audio.bytes)}</p>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-base-600/70 bg-base-900 p-3 flex items-end gap-3">
          <div className="flex-1">
            <label className="text-xs text-muted mb-1.5 block">Audio cache limit</label>
            <input
              type="number"
              min={128}
              max={10240}
              step={128}
              value={audioCacheLimitMb}
              onChange={(e) => setAudioCacheLimitMb(Number(e.target.value))}
              className="input-base font-mono text-xs"
            />
          </div>
          <span className="text-xs text-muted pb-2">MB</span>
          <button
            onClick={handleSaveAudioCacheLimit}
            disabled={cacheBusy}
            className="btn-accent px-4 py-2 rounded-xl text-sm disabled:opacity-40"
          >
            Save
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            onClick={handleExportCache}
            disabled={cacheBusy}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm border border-base-600 text-soft hover:text-white hover:border-base-500 transition-all disabled:opacity-40"
          >
            <Download size={14} />
            Export
          </button>

          <label className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm border border-base-600 text-soft hover:text-white hover:border-base-500 transition-all cursor-pointer">
            <FileUp size={14} />
            Import
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              disabled={cacheBusy}
              onChange={(e) => {
                handleImportCache(e.target.files?.[0] ?? null);
                e.currentTarget.value = '';
              }}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <button
            onClick={handleClearTrackCache}
            disabled={cacheBusy}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm border border-base-600 text-soft hover:text-white hover:border-base-500 transition-all disabled:opacity-40"
          >
            <Trash2 size={14} />
            Tracks
          </button>

          <button
            onClick={handleClearLyricsCache}
            disabled={cacheBusy}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm border border-base-600 text-soft hover:text-white hover:border-base-500 transition-all disabled:opacity-40"
          >
            <Trash2 size={14} />
            Lyrics
          </button>

          <button
            onClick={handleClearAudioCache}
            disabled={cacheBusy}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm border border-base-600 text-soft hover:text-white hover:border-base-500 transition-all disabled:opacity-40"
          >
            <Trash2 size={14} />
            Audio
          </button>

          <button
            onClick={handleClearCache}
            disabled={cacheBusy}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm border border-red-500/30 text-red-400 hover:text-red-300 hover:border-red-500/60 transition-all disabled:opacity-40"
          >
            <Trash2 size={14} />
            Clear all
          </button>
        </div>
      </section>

      {/* Keyboard Shortcuts */}
      <section className="surface-panel flex flex-col gap-4 max-w-3xl p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-base-700 border border-base-600/60 flex items-center justify-center text-accent flex-shrink-0">
            <Keyboard size={18} />
          </div>
          <div>
            <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">
              Keyboard shortcuts
            </h2>
            <p className="text-xs text-muted leading-relaxed mt-2">
              These shortcuts work outside text fields so playback and navigation stay close at hand.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {keyboardShortcuts.map((shortcut) => (
            <div key={shortcut.code} className="rounded-lg border border-base-600/70 bg-base-900 p-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-white">{shortcut.key}</p>
                <p className="text-xs text-muted mt-1">{shortcut.label}</p>
              </div>
              <span className="rounded-md border border-base-600 bg-base-800 px-2 py-1 font-mono text-[11px] text-soft">
                {shortcut.keys}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* About */}
      <section className="surface-panel flex flex-col gap-5 max-w-3xl p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-base-700 border border-base-600/60 flex items-center justify-center text-accent flex-shrink-0">
            <Info size={18} />
          </div>
          <div>
            <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">
              About
            </h2>
            <p className="text-xs text-muted leading-relaxed mt-2">
              Noctune is a local-first music player that uses metadata search, cached stream resolution, and queue prefetching to keep playback responsive.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {engineNotes.map(({ Icon, title, desc }) => (
            <div key={title} className="rounded-lg border border-base-600/70 bg-base-900 p-4">
              <div className="w-9 h-9 rounded-lg bg-base-700 border border-base-600/60 flex items-center justify-center text-accent mb-3">
                <Icon size={17} />
              </div>
              <p className="text-sm font-medium text-white mb-1">{title}</p>
              <p className="text-xs text-muted leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Version */}
      <section className="max-w-3xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-t border-base-600/50 pt-4 pb-2 text-xs text-muted">
        <span>Noctune</span>
        <span className="font-mono">{APP_VERSION}-Stable</span>
      </section>
    </div>
  );
}
