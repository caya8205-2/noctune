import { useCallback, useEffect, useState } from 'react';
import { Search, Trash2, RefreshCw, Activity, Database, Terminal, AlertCircle, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
import { debugApi, type DebugMatchResult, type MatchCacheEntry, type DebugStatus } from './api';

type Tab = 'matcher' | 'cache' | 'status';

function reasonColor(reason: string): string {
  if (reason.startsWith('positive')) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
  if (reason.startsWith('artist')) return 'text-sky-400 bg-sky-500/10 border-sky-500/20';
  if (reason.startsWith('duration')) return reason.includes('far') ? 'text-red-400 bg-red-500/10 border-red-500/20' : 'text-violet-400 bg-violet-500/10 border-violet-500/20';
  if (reason.startsWith('negative') || reason.startsWith('fan-upload') || reason.startsWith('live-version') || reason.startsWith('alternate-version') || reason.startsWith('date-in-title') || reason.startsWith('live-visual')) return 'text-red-400 bg-red-500/10 border-red-500/20';
  if (reason.startsWith('ignored')) return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
  return 'text-soft bg-white/[0.04] border-white/[0.08]';
}

function scoreColor(score: number): string {
  if (score >= 150) return 'text-emerald-400';
  if (score >= 100) return 'text-accent';
  if (score >= 50) return 'text-amber-400';
  if (score >= 20) return 'text-orange-400';
  return 'text-red-400';
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

function ytThumb(id: string): string {
  return `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
}

// ── Matcher Inspector ─────────────────────────────────────────────────────────

function MatcherPanel() {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [spotifyId, setSpotifyId] = useState('');
  const [duration, setDuration] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DebugMatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const runMatch = useCallback(async () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await debugApi.matcher({
        title: title.trim(),
        artist: artist.trim(),
        duration: Number(duration) || 0,
        spotifyId: spotifyId.trim() || undefined,
        limit: 12,
      });
      setResult(res);
      setExpanded(new Set([0]));
    } catch (err) {
      setError((err as Error).message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [title, artist, spotifyId, duration]);

  const toggleExpand = (idx: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="surface-panel p-5">
        <div className="mb-4 flex items-center gap-2">
          <Terminal size={16} className="text-accent" />
          <h2 className="font-display text-lg text-white">Matcher Inspector</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="section-label mb-1.5 block">Title</label>
            <input
              className="input-base"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runMatch()}
              placeholder="e.g. Show"
            />
          </div>
          <div>
            <label className="section-label mb-1.5 block">Artist</label>
            <input
              className="input-base"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runMatch()}
              placeholder="e.g. Ado"
            />
          </div>
          <div>
            <label className="section-label mb-1.5 block">Spotify ID (optional)</label>
            <input
              className="input-base"
              value={spotifyId}
              onChange={(e) => setSpotifyId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runMatch()}
              placeholder="e.g. 3K4gshVxh3IBi7XRhKZcp8"
            />
          </div>
          <div>
            <label className="section-label mb-1.5 block">Duration (seconds, optional)</label>
            <input
              className="input-base"
              type="number"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runMatch()}
              placeholder="e.g. 193"
            />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={runMatch}
            disabled={loading}
            className="btn-accent disabled:opacity-50"
          >
            {loading ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
            {loading ? 'Matching...' : 'Run Match'}
          </button>
          {error && (
            <span className="flex items-center gap-1.5 text-sm text-red-400">
              <AlertCircle size={14} /> {error}
            </span>
          )}
        </div>
      </div>

      {result && (
        <div className="surface-panel p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="section-label">Query:</span>
              <code className="rounded-md bg-base-900 px-2 py-0.5 font-mono text-xs text-soft">{result.query}</code>
            </div>
            <span className="text-xs text-muted">{result.candidates.length} candidates</span>
          </div>

          {result.cached && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm">
              <CheckCircle2 size={14} className="text-amber-400" />
              <span className="text-soft">
                Cached match: <code className="font-mono text-amber-400">{result.cached.youtubeId}</code>
                <span className="text-muted"> (score {result.cached.score}, {formatRelative(result.cached.matchedAt)})</span>
              </span>
            </div>
          )}

          <div className="space-y-2">
            {result.candidates.map((c, idx) => {
              const isOpen = expanded.has(idx);
              const isTop = idx === 0;
              return (
                <div key={c.track.id} className={`rounded-xl border ${isTop ? 'border-accent/25 bg-accent/[0.04]' : 'border-white/[0.06] bg-base-900/40'}`}>
                  <button
                    onClick={() => toggleExpand(idx)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                  >
                    <span className="flex-shrink-0 text-muted">
                      {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </span>
                    <img
                      src={ytThumb(c.track.id)}
                      alt=""
                      className="h-10 w-16 flex-shrink-0 rounded-md object-cover"
                      loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-white">{c.track.title}</div>
                      <div className="truncate text-xs text-muted">{c.track.artist} · {c.track.id}</div>
                    </div>
                    <span className={`flex-shrink-0 font-mono text-sm font-semibold ${scoreColor(c.score)}`}>
                      {c.score}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-white/[0.04] px-3 py-3">
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {c.reasons.length === 0 ? (
                          <span className="text-xs text-muted">No reasons</span>
                        ) : (
                          c.reasons.map((r, i) => (
                            <span key={i} className={`rounded-md border px-2 py-0.5 font-mono text-[11px] ${reasonColor(r)}`}>
                              {r}
                            </span>
                          ))
                        )}
                      </div>
                      <div className="text-xs text-muted">
                        Duration: {c.track.duration}s · Query: <code className="font-mono">{c.track.query}</code>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Cache Manager ─────────────────────────────────────────────────────────────

function CachePanel() {
  const [entries, setEntries] = useState<MatchCacheEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'score-low' | 'score-high'>('recent');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await debugApi.listCache();
      setEntries(res.entries);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const clearAll = async () => {
    if (!confirm(`Clear all ${entries.length} cache entries?`)) return;
    setLoading(true);
    try {
      await debugApi.clearAllCache();
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const clearOne = async (spotifyId: string) => {
    try {
      await debugApi.clearCacheEntry(spotifyId);
      setEntries((prev) => prev.filter((e) => e.spotifyId !== spotifyId));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const filtered = entries
    .filter((e) => {
      if (!filter) return true;
      const q = filter.toLowerCase();
      return (
        e.youtubeTitle?.toLowerCase().includes(q) ||
        e.youtubeArtist?.toLowerCase().includes(q) ||
        e.spotifyId.toLowerCase().includes(q) ||
        e.youtubeId.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sortBy === 'score-low') return a.score - b.score;
      if (sortBy === 'score-high') return b.score - a.score;
      return b.matchedAt - a.matchedAt;
    });

  const lowScoreCount = entries.filter((e) => e.score < 100).length;

  return (
    <div className="space-y-4">
      <div className="surface-panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database size={16} className="text-accent" />
            <h2 className="font-display text-lg text-white">Match Cache</h2>
            <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-xs text-soft">
              {entries.length} entries
              {lowScoreCount > 0 && <span className="ml-1.5 text-amber-400">({lowScoreCount} low)</span>}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={refresh} disabled={loading} className="btn-ghost" title="Refresh">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={clearAll}
              disabled={loading || entries.length === 0}
              className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-40"
            >
              <Trash2 size={13} /> Clear All
            </button>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            className="input-base flex-1"
            placeholder="Filter by title, artist, ID..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <select
            className="input-base w-auto"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          >
            <option value="recent">Most Recent</option>
            <option value="score-low">Score: Low → High</option>
            <option value="score-high">Score: High → Low</option>
          </select>
        </div>

        {error && (
          <div className="mb-3 flex items-center gap-1.5 text-sm text-red-400">
            <AlertCircle size={14} /> {error}
          </div>
        )}

        <div className="max-h-[60vh] space-y-1.5 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted">
              {entries.length === 0 ? 'No cache entries yet.' : 'No entries match filter.'}
            </div>
          ) : (
            filtered.map((e) => (
              <div
                key={e.spotifyId}
                className="group flex items-center gap-3 rounded-lg border border-white/[0.04] bg-base-900/30 px-3 py-2 transition-colors hover:border-white/[0.08]"
              >
                <img
                  src={ytThumb(e.youtubeId)}
                  alt=""
                  className="h-9 w-14 flex-shrink-0 rounded object-cover"
                  loading="lazy"
                  onError={(ev) => { (ev.target as HTMLImageElement).style.display = 'none'; }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-white">{e.youtubeTitle || '(no title)'}</div>
                  <div className="truncate text-xs text-muted">
                    {e.youtubeArtist || '—'} · <code className="font-mono">{e.youtubeId}</code>
                    <span className="ml-1.5 text-muted/60">{formatRelative(e.matchedAt)}</span>
                  </div>
                </div>
                <span className={`flex-shrink-0 font-mono text-sm font-semibold ${scoreColor(e.score)}`}>
                  {e.score}
                </span>
                <button
                  onClick={() => clearOne(e.spotifyId)}
                  className="flex-shrink-0 rounded-md p-1.5 text-muted opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                  title="Clear this entry"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Status Snapshot ───────────────────────────────────────────────────────────

function StatusPanel() {
  const [status, setStatus] = useState<DebugStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await debugApi.status());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  if (error) {
    return (
      <div className="surface-panel flex items-center gap-2 p-5 text-red-400">
        <AlertCircle size={16} /> {error}
      </div>
    );
  }

  if (!status) {
    return <div className="surface-panel p-5 text-sm text-muted">Loading...</div>;
  }

  const cards = [
    { label: 'Track Cache', value: status.cache.total, sub: `${status.cache.totalQueries} queries`, color: 'text-accent' },
    { label: 'Match Cache', value: status.matchCache.total, sub: 'spotify→youtube', color: 'text-sky-400' },
    { label: 'Prefetch Queue', value: status.prefetch.queueSize, sub: `${status.prefetch.pending} pending`, color: 'text-violet-400' },
    { label: 'Blacklisted', value: status.playbackBlacklist.failedIds, sub: 'failed IDs', color: 'text-red-400' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-accent" />
          <h2 className="font-display text-lg text-white">Backend Status</h2>
        </div>
        <button onClick={refresh} disabled={loading} className="btn-ghost" title="Refresh">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="surface-panel p-4">
            <div className="section-label mb-1.5">{c.label}</div>
            <div className={`font-display text-3xl font-semibold ${c.color}`}>{c.value}</div>
            <div className="mt-0.5 text-xs text-muted">{c.sub}</div>
          </div>
        ))}
      </div>

      <div className="surface-panel p-5">
        <h3 className="section-label mb-3">Resolver</h3>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Engine</span>
            <span className="font-mono text-soft">{status.resolver.name}</span>
          </div>
          {status.prefetch.inFlight.length > 0 && (
            <div className="flex justify-between gap-3">
              <span className="flex-shrink-0 text-muted">In-flight</span>
              <span className="truncate font-mono text-xs text-soft">{status.prefetch.inFlight.join(', ')}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted">Discord RPC</span>
            <span className={status.discordRpc.ready ? 'text-emerald-400' : 'text-muted'}>
              {status.discordRpc.enabled ? (status.discordRpc.ready ? 'Ready' : 'Connecting...') : 'Disabled'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Demo Mode</span>
            <span className={status.demoMode ? 'text-amber-400' : 'text-muted'}>
              {status.demoMode ? 'Active' : 'Off'}
            </span>
          </div>
        </div>
      </div>

      {status.prefetch.prefetched.length > 0 && (
        <div className="surface-panel p-5">
          <h3 className="section-label mb-3">Prefetched ({status.prefetch.prefetched.length})</h3>
          <div className="flex flex-wrap gap-1.5">
            {status.prefetch.prefetched.map((id) => (
              <code key={id} className="rounded-md bg-white/[0.04] px-2 py-0.5 font-mono text-[11px] text-soft">{id}</code>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function DebugApp() {
  const [tab, setTab] = useState<Tab>('matcher');
  const [backendOk, setBackendOk] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const base = await (await import('./api')).discoverBackend();
        setBackendOk(Boolean(base));
      } catch {
        setBackendOk(false);
      }
    })();
  }, []);

  const tabs: Array<{ id: Tab; label: string; icon: typeof Search }> = [
    { id: 'matcher', label: 'Matcher', icon: Terminal },
    { id: 'cache', label: 'Cache', icon: Database },
    { id: 'status', label: 'Status', icon: Activity },
  ];

  return (
    <div className="relative z-10 flex h-screen flex-col overflow-hidden text-white">
      <div className="ambient-glow -top-40 left-1/4 h-72 w-72 bg-accent/10 animate-float" aria-hidden="true" />

      {/* Header */}
      <div className="relative z-10 flex h-14 flex-shrink-0 items-center gap-3 border-b border-white/[0.06] bg-base-950/40 px-5 backdrop-blur-xl">
        <span className="font-display text-[15px] font-medium tracking-tight text-white/90">
          Noctune <span className="text-accent">Debug</span>
        </span>
        <div className="ml-2 flex items-center gap-1">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-accent/10 text-accent'
                    : 'text-muted hover:bg-white/[0.04] hover:text-soft'
                }`}
              >
                <Icon size={15} />
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {backendOk === null ? (
            <span className="text-xs text-muted">Checking backend...</span>
          ) : backendOk ? (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400">
              <CheckCircle2 size={13} /> Backend connected
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-red-400">
              <AlertCircle size={13} /> Backend not found
            </span>
          )}
          <a
            href="/"
            className="rounded-lg px-3 py-1.5 text-xs text-muted transition-colors hover:bg-white/[0.04] hover:text-soft"
          >
            ← Back to app
          </a>
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 min-h-0 flex-1 overflow-y-auto p-5">
        <div className="mx-auto max-w-4xl">
          {tab === 'matcher' && <MatcherPanel />}
          {tab === 'cache' && <CachePanel />}
          {tab === 'status' && <StatusPanel />}
        </div>
      </div>
    </div>
  );
}
