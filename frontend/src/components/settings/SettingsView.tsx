import { useEffect, useState } from 'react';
import {
  CheckCircle,
  Database,
  Download,
  ExternalLink,
  HardDrive,
  Eye,
  EyeOff,
  FileText,
  FileUp,
  FolderOpen,
  Info,
  ListMusic,
  Loader2,
  Keyboard,
  RefreshCw,
  Scale,
  ShieldAlert,
  Sparkles,
  Trash2,
  Zap,
  XCircle,
} from 'lucide-react';
import { keyboardShortcuts } from '../../constants/keyboardShortcuts';
import { api, apiUrl, type BackendStatus, type UpdateInfo, IS_TAURI } from '../../utils/api';
import { openExternalUrl } from '../../hooks/useUpdateChecker';
import { Visualizer, VISUALIZER_PRESETS, type VisualizerMode } from '../player/Visualizer';
import { usePlayerStore } from '../../store/player';
import { openChangelogModal } from '../ui/ChangelogModal';
import { ConfirmDialog } from '../ui/ConfirmDialog';
const APP_VERSION = __APP_VERSION__;

interface SettingsData {
  searchEngine: 'ytdlp' | 'spotify';
  recommendationEngine?: 'hybrid-ml' | 'lastfm' | 'legacy';
  audioQualityPreference: 'auto' | 'high';
  audioCacheLimitMb: number;
  discordRpcEnabled: boolean;
  downloadDir?: string;
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

const licenseGroups: Array<{ layer: string; items: Array<{ name: string; license: string }> }> = [
  {
    layer: 'Frontend',
    items: [
      { name: 'React', license: 'MIT' },
      { name: 'Vite', license: 'MIT' },
      { name: 'Tailwind CSS', license: 'MIT' },
      { name: 'Zustand', license: 'MIT' },
      { name: 'TanStack Query', license: 'MIT' },
      { name: 'lucide-react', license: 'ISC' },
      { name: 'clsx', license: 'MIT' },
      { name: 'audiomotion-analyzer', license: 'AGPL-3.0-or-later' },
      { name: 'Tauri API', license: 'Apache-2.0 OR MIT' },
    ],
  },
  {
    layer: 'Backend',
    items: [
      { name: 'Fastify', license: 'MIT' },
      { name: 'better-sqlite3', license: 'MIT' },
      { name: 'discord-rpc', license: 'MIT' },
      { name: 'dotenv', license: 'BSD-2-Clause' },
      { name: 'kuroshiro', license: 'MIT' },
      { name: 'kuroshiro-analyzer-kuromoji', license: 'MIT' },
      { name: 'node-cache', license: 'MIT' },
      { name: 'p-queue', license: 'MIT' },
      { name: 'pino-pretty', license: 'MIT' },
      { name: 'youtubei.js', license: 'MIT' },
      { name: 'yt-dlp-wrap', license: 'MIT' },
      { name: 'zod', license: 'MIT' },
    ],
  },
  {
    layer: 'Desktop shell',
    items: [
      { name: 'Tauri', license: 'Apache-2.0 OR MIT' },
      { name: 'Rust', license: 'MIT OR Apache-2.0' },
    ],
  },
];

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
  const [recommendationEngine, setRecommendationEngine] = useState<'hybrid-ml' | 'lastfm' | 'legacy'>('lastfm');
  const [discordRpcEnabled, setDiscordRpcEnabled] = useState(true);
  const [downloadDir, setDownloadDir] = useState('');
  const [downloadDirSaving, setDownloadDirSaving] = useState(false);
  const [downloadDirSaved, setDownloadDirSaved] = useState(false);
  const [visualizerMode, setVisualizerMode] = useState<VisualizerMode>(() => {
    return (localStorage.getItem('noctune:visualizer-mode') as VisualizerMode) || 'ncs';
  });

  const handleVisualizerModeChange = (mode: VisualizerMode) => {
    setVisualizerMode(mode);
    localStorage.setItem('noctune:visualizer-mode', mode);
    window.dispatchEvent(new Event('noctune:visualizer-mode-updated'));
  };
  const [cacheMessage, setCacheMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [cacheConfirmation, setCacheConfirmation] = useState<{
    title: string;
    description: string;
    action: () => Promise<void>;
  } | null>(null);
  const [diagnostics, setDiagnostics] = useState<BackendStatus | null>(null);
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState<'start' | 'stop' | 'open' | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const setView = usePlayerStore((state) => state.setView);

  async function loadSettings() {
    const res = await fetch(await apiUrl('/settings'));
    const d = (await res.json()) as SettingsData;
    setData(d);
    setClientId(d.spotify.clientId);
    setAudioCacheLimitMb(d.audioCacheLimitMb ?? 1024);
    setAudioQualityPreference(d.audioQualityPreference ?? 'auto');
    setRecommendationEngine(d.recommendationEngine ?? 'lastfm');
    setDiscordRpcEnabled(d.discordRpcEnabled ?? true);
    if (d.downloadDir) setDownloadDir(d.downloadDir);
  }

  async function handleOpenDownloadDir() {
    try {
      await api.openDownloadDir();
    } catch (err) {
      console.error('Failed to open download dir:', err);
    }
  }

  async function handleSaveDownloadDir() {
    setDownloadDirSaving(true);
    setDownloadDirSaved(false);
    try {
      const res = await fetch(await apiUrl('/settings'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ downloadDir }),
      });
      const updated = (await res.json()) as SettingsData;
      if (updated.downloadDir) setDownloadDir(updated.downloadDir);
      setDownloadDirSaved(true);
      setTimeout(() => setDownloadDirSaved(false), 2500);
    } catch (err) {
      console.error('Failed to save download dir:', err);
    } finally {
      setDownloadDirSaving(false);
    }
  }

  const [engineSaving, setEngineSaving] = useState(false);
  const [engineSaved, setEngineSaved] = useState(false);

  async function handleRecommendationEngineSave() {
    setEngineSaving(true);
    setEngineSaved(false);
    try {
      const res = await fetch(await apiUrl('/settings'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recommendationEngine }),
      });
      const updated = (await res.json()) as SettingsData;
      if (updated.recommendationEngine) setRecommendationEngine(updated.recommendationEngine);
      setEngineSaved(true);
      setTimeout(() => setEngineSaved(false), 2500);
    } catch (err) {
      console.error('Failed to save recommendation engine:', err);
    } finally {
      setEngineSaving(false);
    }
  }

  useEffect(() => {
    loadSettings().catch(console.error);
    api.status().then(setDiagnostics).catch(console.error);
    api.checkForUpdates().then(setUpdateInfo).catch(console.error);
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
      const filename = `noctune-cache-${new Date().toISOString().slice(0, 10)}.json`;

      if (IS_TAURI) {
        try {
          // Ask user where to save
          const dialog = await import('@tauri-apps/plugin-dialog') as any;
          const save = dialog.save || dialog.default?.save;
          const savePath = await save?.({ defaultPath: filename });
          if (!savePath) {
            setCacheMessage({ ok: false, text: 'Save cancelled.' });
            return;
          }

          // Send file contents to backend to write to the chosen path (safer cross-platform)
          const buffer = await blob.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          // convert to base64 for JSON transport
          let binary = '';
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          const base64 = btoa(binary);

          const writeRes = await fetch(await apiUrl('/settings/cache/write-file'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: savePath, base64 }),
          });
          if (!writeRes.ok) throw new Error('Failed to write file');

          setCacheMessage({ ok: true, text: `Cache exported to ${savePath}` });
        } catch (err) {
          console.error('[settings] Tauri save failed:', err);
          setCacheMessage({ ok: false, text: (err as Error).message });
        }
      } else {
        // Web fallback: download to browser
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        setCacheMessage({ ok: true, text: 'Cache exported.' });
      }
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
  function requestCacheClear(title: string, description: string, action: () => Promise<void>) {
    setCacheConfirmation({ title, description, action });
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

  async function handleOpenDebugDashboard() {
    setPreviewBusy('open');
    try {
      if (IS_TAURI) {
        setView('debug');
      } else {
        setView('debug');
      }
    } catch (err) {
      console.error('Failed to open debug dashboard:', err);
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
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <p className="section-label text-accent">Settings</p>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight">
          Make global choices feel immediate.
        </h1>
      </div>

      {/* Updates */}
      <section className="surface-panel flex flex-col gap-4 p-5">
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
                onClick={() => openChangelogModal()}
                className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm border border-base-600 text-soft hover:text-white hover:border-base-500 transition-all"
                title="View release notes & changelog"
              >
                <FileText size={14} />
                Changelog
              </button>
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

      {/* Download Location */}
      <section className="surface-panel flex flex-col gap-4 p-5">
        <div>
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">
            Download Location
          </h2>
          <p className="text-xs text-muted leading-relaxed mt-2">
            Downloaded tracks are saved to this directory on your computer with formatted filenames (Artist - Title).
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
            <input
              type="text"
              value={downloadDir}
              onChange={(e) => setDownloadDir(e.target.value)}
              placeholder="e.g. C:\Users\Username\Downloads\Noctune"
              className="input-base font-mono text-xs flex-1"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSaveDownloadDir}
                disabled={downloadDirSaving}
                className="px-3 py-2 rounded-xl text-sm btn-accent disabled:opacity-50"
              >
                {downloadDirSaving ? 'Saving...' : downloadDirSaved ? 'Saved!' : 'Save'}
              </button>
              <button
                type="button"
                onClick={handleOpenDownloadDir}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm border border-base-600 text-soft hover:text-white hover:border-base-500 transition-all"
              >
                <FolderOpen size={14} />
                Open Folder
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Spotify API Credentials */}
      {IS_TAURI && (
        <section className="surface-panel flex flex-col gap-4 p-5">
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
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/90 leading-relaxed">
            <Info size={13} className="mr-1 inline-block align-text-bottom" />
            These fields are optional — Spotify metadata works without entering credentials here.
            The Spotify Web API requires a <span className="font-medium text-amber-200">Premium</span> account, so any custom credentials you enter must belong to a Premium account.
          </div>

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
              <label className="text-xs text-muted mb-1.5 block">Client Secret</label>
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

      {/* Playback & Presence */}
      <section className="surface-panel flex flex-col gap-4 p-5">
        <div>
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">
            Playback & presence
          </h2>
          <p className="text-xs text-muted leading-relaxed mt-2">
            Tune playback resolver behavior{IS_TAURI ? ' and what Noctune shares outside the app.' : '.'}
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

        {IS_TAURI && (
          <button
            type="button"
            onClick={() => handleDiscordRpcToggle(!discordRpcEnabled)}
            className="flex items-center justify-between gap-3 rounded-lg border border-base-600/70 bg-base-900 p-3 text-left hover:border-base-500 transition-colors"
          >
            <span>
              <span className="block text-sm font-medium text-white">Discord Rich Presence</span>
              <span className="block text-xs text-muted mt-1">Show what you're listening to on your Discord profile.</span>
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
        )}
      </section>

      {/* Recommendation Engine */}
      <section className="surface-panel flex flex-col gap-4 p-5">
        <div>
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">
            Recommendation Engine
          </h2>
          <p className="text-xs text-muted leading-relaxed mt-2">
            Select which algorithm powers your autoqueue recommendations and Nightly Mix playlists.
          </p>
        </div>

        <div className="rounded-lg border border-base-600/70 bg-base-900 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1 pr-4">
              <label htmlFor="rec-engine-select" className="block text-sm font-medium text-white">
                Active Engine
              </label>
              <p className="mt-1 text-xs text-muted leading-relaxed">
                {recommendationEngine === 'hybrid-ml'
                  ? 'ML Hybrid Collaborative: Combines local Markov chain transitions, metadata similarity, and play history.'
                  : recommendationEngine === 'lastfm'
                  ? 'Last.fm Similar Tracks: Uses Last.fm online graph API to suggest similar tracks.'
                  : 'Legacy Noctune Search: Original query-based search engine fallback.'}
              </p>
            </div>
            <select
              id="rec-engine-select"
              value={recommendationEngine}
              onChange={(e) => setRecommendationEngine(e.target.value as any)}
              className="rounded-xl border border-base-600/80 bg-base-800 px-3.5 py-2 text-xs font-medium text-white hover:border-accent/40 focus:border-accent focus:outline-none shrink-0 cursor-pointer shadow-sm transition-colors"
            >
              <option value="hybrid-ml" className="bg-base-900 text-white">
                ML Hybrid Collaborative (Recommended)
              </option>
              <option value="lastfm" className="bg-base-900 text-white">
                Last.fm Similar Tracks
              </option>
              <option value="legacy" className="bg-base-900 text-white">
                Legacy Noctune Search
              </option>
            </select>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleRecommendationEngineSave}
            disabled={engineSaving}
            className="btn-accent flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold"
          >
            {engineSaving ? (
              <>
                <Loader2 size={13} className="animate-spin" /> Saving...
              </>
            ) : engineSaved ? (
              <>
                <CheckCircle size={13} /> Saved!
              </>
            ) : (
              'Save Engine'
            )}
          </button>
        </div>

        <div className="flex items-start gap-2.5 rounded-lg border border-white/10 bg-base-950/60 p-3.5 text-xs text-muted">
          <Info size={16} className="text-accent flex-shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong className="text-white">Note:</strong> Changing this option only affects which engine calculates your active autoqueue, recommendations, and Nightly Mixes. On-the-go ML background training will continue logging your listening habits seamlessly in the background so your model keeps learning.
          </p>
        </div>
      </section>

      {/* Audio Visualizer */}
      <section className="surface-panel flex flex-col gap-4 p-5">
        <div>
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">
            Audio Visualizer Presets
          </h2>
          <p className="text-xs text-muted leading-relaxed mt-2">
            Select the visualizer animation style displayed around the album art CD disc in Player View.
          </p>
        </div>

        <div className="rounded-lg border border-base-600/70 bg-base-900 p-5 flex flex-col items-center sm:flex-row sm:items-start gap-6">
          {/* Live Visualizer Preview Box (Vinyl disc with live visualizer preview) */}
          <div className="relative w-48 h-48 sm:w-52 sm:h-52 flex items-center justify-center rounded-2xl border border-white/10 bg-base-950/90 shadow-2xl overflow-hidden p-2 shrink-0">
            {/* Vinyl Disc Body (No album art) */}
            <div className="absolute inset-[10%] rounded-full bg-base-900 border border-base-700/80 shadow-2xl flex items-center justify-center">
              {/* Vinyl Grooves */}
              <div className="absolute inset-3 rounded-full border border-white/[0.04]" />
              <div className="absolute inset-7 rounded-full border border-white/[0.04]" />
              <div className="absolute inset-11 rounded-full border border-white/[0.04]" />
            </div>

            {/* Live Animated Visualizer */}
            <Visualizer mode={visualizerMode} preview={true} />

            {/* Vinyl Center Hole */}
            <div className="absolute inset-[42%] rounded-full bg-base-950 border border-base-600/70 shadow-inner z-20 flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full bg-base-800" />
            </div>
          </div>

          <div className="flex-1 space-y-4">
            <div>
              <label htmlFor="visualizer-preset-select" className="block text-sm font-semibold text-white">
                Active Preset Style
              </label>
              <p className="mt-1.5 text-xs text-muted leading-relaxed">
                {VISUALIZER_PRESETS.find((p) => p.id === visualizerMode)?.desc ?? ''}
              </p>
            </div>

            <select
              id="visualizer-preset-select"
              value={visualizerMode}
              onChange={(e) => handleVisualizerModeChange(e.target.value as VisualizerMode)}
              className="w-full sm:w-auto rounded-xl border border-base-600/80 bg-base-800 px-4 py-2.5 text-xs font-medium text-white hover:border-accent/40 focus:border-accent focus:outline-none shrink-0 cursor-pointer shadow-sm transition-colors"
            >
              {VISUALIZER_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id} className="bg-base-900 text-white">
                  {preset.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Diagnostics */}
      <section className="surface-panel flex flex-col gap-4 p-5">
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
            onClick={() => requestCacheClear('Clear failed resolver IDs?', 'Failed resolver IDs will be removed so Noctune can try resolving those tracks again.', handleClearResolverBlacklist)}
            disabled={diagnosticsBusy}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm border border-base-600 text-soft hover:text-white hover:border-base-500 transition-all disabled:opacity-40"
          >
            <ShieldAlert size={14} />
            Clear failed IDs
          </button>
          <button
            type="button"
            onClick={() => requestCacheClear('Clear resolver matches?', 'Cached Spotify-to-YouTube match results will be removed and rebuilt when needed.', handleClearResolverMatchCache)}
            disabled={diagnosticsBusy}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm border border-base-600 text-soft hover:text-white hover:border-base-500 transition-all disabled:opacity-40"
          >
            <Trash2 size={14} />
            Clear matches
          </button>
        </div>

        <div className="rounded-lg border border-base-600/70 bg-base-900 p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${IS_TAURI ? 'bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.45)]' : 'bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.45)]'}`}
                  aria-hidden="true"
                />
                <span className="text-sm font-medium text-white">Debug Dashboard</span>
              </div>
              <span className="block text-xs text-muted mt-1">
                {IS_TAURI
                  ? 'Opens the bundled debug dashboard in a separate app window.'
                  : 'Opens the bundled debug dashboard in a separate app window.'}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
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
            </div>
          </div>
        </div>
      </section>

      {/* Cache */}
      <section className="surface-panel flex flex-col gap-4 p-5">
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
            onClick={() => requestCacheClear('Clear track cache?', 'Cached track metadata will be removed from this device.', handleClearTrackCache)}
            disabled={cacheBusy}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm border border-base-600 text-soft hover:text-white hover:border-base-500 transition-all disabled:opacity-40"
          >
            <Trash2 size={14} />
            Tracks
          </button>

          <button
            onClick={() => requestCacheClear('Clear lyrics cache?', 'Cached lyrics will be removed and fetched again when needed.', handleClearLyricsCache)}
            disabled={cacheBusy}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm border border-base-600 text-soft hover:text-white hover:border-base-500 transition-all disabled:opacity-40"
          >
            <Trash2 size={14} />
            Lyrics
          </button>

          <button
            onClick={() => requestCacheClear('Clear audio cache?', 'Downloaded audio files will be removed from the local cache.', handleClearAudioCache)}
            disabled={cacheBusy}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm border border-base-600 text-soft hover:text-white hover:border-base-500 transition-all disabled:opacity-40"
          >
            <Trash2 size={14} />
            Audio
          </button>

          <button
            onClick={() => requestCacheClear('Clear all cache?', 'All cached tracks, lyrics, audio, and resolver data will be removed.', handleClearCache)}
            disabled={cacheBusy}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm border border-red-500/30 text-red-400 hover:text-red-300 hover:border-red-500/60 transition-all disabled:opacity-40"
          >
            <Trash2 size={14} />
            Clear all
          </button>
        </div>
      </section>

      {/* Keyboard Shortcuts */}
      <section className="surface-panel flex flex-col gap-4 p-5">
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
      <section className="surface-panel flex flex-col gap-5 p-5">
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

      {/* Licenses */}
      <section className="surface-panel flex flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-base-700 border border-base-600/60 flex items-center justify-center text-accent flex-shrink-0">
            <Scale size={18} />
          </div>
          <div>
            <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">
              Licenses
            </h2>
            <p className="text-xs text-muted leading-relaxed mt-2">
              Noctune is MIT-licensed and bundles these third-party open source components.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {licenseGroups.map((group) => (
            <div key={group.layer} className="rounded-lg border border-base-600/70 bg-base-900 p-3">
              <p className="section-label mb-2">{group.layer}</p>
              <div className="flex flex-col gap-1">
                {group.items.map((item) => (
                  <div key={item.name} className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-soft">{item.name}</span>
                    <span className="flex-shrink-0 rounded border border-base-600/60 bg-base-800 px-1.5 py-0.5 font-mono text-[10px] text-muted">
                      {item.license}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200 leading-relaxed">
          The audio visualizer uses <span className="font-mono">audiomotion-analyzer</span> (AGPL-3.0-or-later), a copyleft license — redistributors must preserve its source-availability obligations.
        </div>

        <p className="text-xs text-muted leading-relaxed">
          Metadata, lyrics, and streams come from external services — Spotify Web API, Last.fm, LRCLIB, and YouTube — each governed by their own terms. Noctune is an independent project and is not affiliated with or endorsed by these services.
        </p>
      </section>

      {/* Version */}
      <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-t border-base-600/50 pt-4 pb-2 text-xs text-muted">
        <span>Noctune</span>
        <span className="font-mono">{APP_VERSION}-Stable</span>
      </section>

      <ConfirmDialog
        open={Boolean(cacheConfirmation)}
        eyebrow="Local data"
        title={cacheConfirmation?.title ?? ''}
        description={cacheConfirmation?.description ?? ''}
        confirmLabel="Clear"
        loading={cacheBusy || diagnosticsBusy}
        onConfirm={() => {
          if (!cacheConfirmation) return;
          void (async () => {
            await cacheConfirmation.action();
            setCacheConfirmation(null);
          })();
        }}
        onCancel={() => !(cacheBusy || diagnosticsBusy) && setCacheConfirmation(null)}
      />
    </div>
  );
}
