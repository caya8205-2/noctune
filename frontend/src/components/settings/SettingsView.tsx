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
  Settings,
  Sparkles,
  Trash2,
  Zap,
  XCircle,
} from 'lucide-react';
import { API_BASE } from '../../utils/api';

const APP_VERSION = 'v1.0.0-beta.2';

interface SettingsData {
  searchEngine: 'ytdlp' | 'spotify';
  spotify: {
    clientId: string;
    clientSecretMasked: string;
    configured: boolean;
  };
}

const engineNotes = [
  {
    Icon: Database,
    title: 'Local cache',
    desc: 'Tracks and resolved audio URLs are kept locally so repeat plays can start faster.',
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
  const [cacheMessage, setCacheMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch(API_BASE + '/settings')
      .then((r) => r.json())
      .then((d: SettingsData) => {
        setData(d);
        setClientId(d.spotify.clientId);
      })
      .catch(console.error);
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);

    try {
      const body: Record<string, string> = {};
      if (clientId) body.spotifyClientId = clientId;
      if (clientSecret) body.spotifyClientSecret = clientSecret;

      const res = await fetch(API_BASE + '/settings', {
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

      const res = await fetch(API_BASE + '/settings/spotify/test', {
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
      const res = await fetch(API_BASE + '/settings/cache/export');
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
      const res = await fetch(API_BASE + '/settings/cache/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(json),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.message ?? 'Import failed');
      setCacheMessage({ ok: true, text: 'Cache imported.' });
    } catch (err) {
      setCacheMessage({ ok: false, text: (err as Error).message });
    } finally {
      setCacheBusy(false);
    }
  }

  async function handleClearCache() {
    if (!window.confirm('Clear all learned song cache?')) return;
    setCacheBusy(true);
    setCacheMessage(null);

    try {
      const res = await fetch(API_BASE + '/settings/cache', { method: 'DELETE' });
      if (!res.ok) throw new Error('Clear cache failed');
      setCacheMessage({ ok: true, text: 'Cache cleared.' });
    } catch (err) {
      setCacheMessage({ ok: false, text: (err as Error).message });
    } finally {
      setCacheBusy(false);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto px-9 py-8 gap-8">
      <div className="flex flex-col gap-2 max-w-3xl">
        <div className="flex items-center gap-3">
          <Settings size={18} className="text-accent" />
          <p className="section-label text-accent">Settings</p>
        </div>
        <h1 className="text-4xl font-bold text-white leading-tight">
          Make global choices feel immediate.
        </h1>
      </div>

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

        <a
          href="https://developer.spotify.com/dashboard"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 text-xs text-muted hover:text-accent transition-colors"
        >
          <ExternalLink size={12} />
          Get credentials at developer.spotify.com/dashboard
        </a>

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
            className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
              testResult.ok
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

      <section className="surface-panel flex flex-col gap-4 max-w-3xl p-5">
        <div>
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">
            Cache Learning
          </h2>
          <p className="text-xs text-muted leading-relaxed mt-2">
            Export, import, or clear learned song metadata and audio URL cache.
          </p>
        </div>

        {cacheMessage && (
          <div
            className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
              cacheMessage.ok
                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}
          >
            {cacheMessage.ok ? <CheckCircle size={14} /> : <XCircle size={14} />}
            {cacheMessage.text}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
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

          <button
            onClick={handleClearCache}
            disabled={cacheBusy}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm border border-red-500/30 text-red-400 hover:text-red-300 hover:border-red-500/60 transition-all disabled:opacity-40"
          >
            <Trash2 size={14} />
            Clear
          </button>
        </div>
      </section>

      <section className="surface-panel flex flex-col gap-4 max-w-3xl p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-base-700 border border-base-600/60 flex items-center justify-center text-accent flex-shrink-0">
            <HardDrive size={18} />
          </div>
          <div>
            <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">
              Library Storage
            </h2>
            <p className="text-xs text-muted leading-relaxed mt-2">
              Playlists, covers, liked songs, and learned cache stay on this device.
            </p>
          </div>
        </div>
      </section>

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

        <div className="rounded-lg border border-base-600/70 bg-base-900 p-4">
          <p className="text-xs text-muted leading-relaxed">
            <span className="text-soft font-medium block mb-1">Spotify playback note</span>
            Spotify's public dev API supports search and metadata here. Noctune still resolves playable audio through yt-dlp for local playback.
          </p>
        </div>
      </section>

      <section className="max-w-3xl flex items-center justify-between border-t border-base-600/50 pt-4 pb-2 text-xs text-muted">
        <span>Noctune</span>
        <span className="font-mono">Pre-release {APP_VERSION}</span>
      </section>
    </div>
  );
}
