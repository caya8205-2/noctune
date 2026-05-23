import { useEffect, useState } from 'react';
import {
  CheckCircle,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileUp,
  Loader2,
  Settings,
  Trash2,
  XCircle,
} from 'lucide-react';

interface SettingsData {
  searchEngine: 'ytdlp' | 'spotify';
  spotify: {
    clientId: string;
    clientSecretMasked: string;
    configured: boolean;
  };
}

export function SettingsView() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [engine, setEngine] = useState<'ytdlp' | 'spotify'>('ytdlp');
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [cacheBusy, setCacheBusy] = useState(false);
  const [cacheMessage, setCacheMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d: SettingsData) => {
        setData(d);
        setClientId(d.spotify.clientId);
        setEngine(d.searchEngine);
      })
      .catch(console.error);
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);

    try {
      const body: Record<string, string> = { searchEngine: engine };
      if (clientId) body.spotifyClientId = clientId;
      if (clientSecret) body.spotifyClientSecret = clientSecret;

      const res = await fetch('/api/settings', {
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
      const res = await fetch('/api/settings/spotify/test', { method: 'POST' });
      const result = (await res.json()) as { ok: boolean; error?: string };
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
      const res = await fetch('/api/settings/cache/export');
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `muzikku-cache-${new Date().toISOString().slice(0, 10)}.json`;
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
      const res = await fetch('/api/settings/cache/import', {
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
      const res = await fetch('/api/settings/cache', { method: 'DELETE' });
      if (!res.ok) throw new Error('Clear cache failed');
      setCacheMessage({ ok: true, text: 'Cache cleared.' });
    } catch (err) {
      setCacheMessage({ ok: false, text: (err as Error).message });
    } finally {
      setCacheBusy(false);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto px-6 py-6 gap-8 max-w-xl">
      <div className="flex items-center gap-3">
        <Settings size={20} className="text-muted" />
        <h1 className="text-base font-semibold text-white">Settings</h1>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">
          Search Engine
        </h2>
        <div className="flex gap-2">
          {(['ytdlp', 'spotify'] as const).map((option) => (
            <button
              key={option}
              onClick={() => setEngine(option)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                engine === option
                  ? 'bg-accent/10 border-accent/40 text-accent'
                  : 'bg-base-800 border-base-600 text-muted hover:text-white hover:border-base-500'
              }`}
            >
              {option === 'ytdlp' ? 'yt-dlp (default)' : 'Spotify'}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted leading-relaxed">
          {engine === 'ytdlp'
            ? 'Search directly via YouTube using yt-dlp. No API key needed.'
            : 'Search via Spotify API for cleaner metadata, accurate duration, and artwork.'}
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">
            Spotify API Credentials
          </h2>
          {data?.spotify.configured && (
            <span className="text-xs text-accent flex items-center gap-1">
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
              'Save Settings'
            )}
          </button>
        </div>
      </section>

      <section className="bg-base-800/50 rounded-xl p-4 border border-base-600/20">
        <p className="text-xs text-muted leading-relaxed">
          <span className="text-soft font-medium block mb-1">Note on Spotify Premium</span>
          Spotify's free dev API supports search and metadata. Playback via Spotify SDK requires
          Premium, so audio still streams through yt-dlp.
        </p>
      </section>

      <section className="flex flex-col gap-4">
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
    </div>
  );
}
