import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Search, Trash2, RefreshCw, Activity, Database, Terminal, AlertCircle, CheckCircle2,
  ChevronDown, ChevronRight, Copy, RotateCw, Eraser, Music2,
} from 'lucide-react';
import {
  debugApi, discoverBackend,
  type DebugMatchResult, type MatchCacheEntry, type DebugStatus,
  type ResolverSnapshot, type ScoredCandidate,
} from './api';
import { usePlayerStore } from '../store/player';
import type { CachedTrack } from '../utils/api';

type Tab = 'resolver' | 'cache' | 'status';

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

const sourceMeta: Record<string, { label: string; cls: string }> = {
  prefetch: { label: 'Prefetch', cls: 'text-accent' },
  cache: { label: 'Cache', cls: 'text-sky-400' },
  cache_refreshed: { label: 'Refreshed', cls: 'text-violet-400' },
  resolved: { label: 'Resolved', cls: 'text-emerald-400' },
};

// ── Candidate row (shared by matcher views) ──────────────────────────────────

function CandidateRow({ candidate, rank }: { candidate: ScoredCandidate; rank: number }) {
  const [open, setOpen] = useState(rank === 0);
  return (
    <div className={`rounded-lg border ${rank === 0 ? 'border-accent/20 bg-accent/[0.03]' : 'border-white/[0.04] bg-base-900/30'}`}>
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left">
        <span className="flex-shrink-0 text-muted">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <img
          src={ytThumb(candidate.track.id)}
          alt=""
          className="h-8 w-14 flex-shrink-0 rounded object-cover"
          loading="lazy"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs text-white">{candidate.track.title}</div>
          <div className="truncate text-[11px] text-muted">{candidate.track.artist} · {candidate.track.id}</div>
        </div>
        <span className={`flex-shrink-0 text-xs font-semibold tabular-nums ${scoreColor(candidate.score)}`}>
          {candidate.score}
        </span>
      </button>
      {open && (
        <div className="border-t border-white/[0.04] px-2.5 py-2.5">
          <div className="mb-2 flex flex-wrap gap-1">
            {candidate.reasons.length === 0 ? (
              <span className="text-[11px] text-muted">No reasons</span>
            ) : (
              candidate.reasons.map((r, i) => (
                <span key={i} className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${reasonColor(r)}`}>
                  {r}
                </span>
              ))
            )}
          </div>
          <div className="text-[11px] text-muted">
            Duration: {candidate.track.duration}s
          </div>
        </div>
      )}
    </div>
  );
}

// ── Matcher result (full fallback query chain) — shared ───────────────────────

function MatcherResultView({ result }: { result: DebugMatchResult }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set([0]));

  useEffect(() => {
    const acceptedIdx = result.accepted
      ? result.attempts.findIndex((a) => a.best?.track.id === result.accepted!.track.id)
      : -1;
    setExpanded(new Set([0, acceptedIdx].filter((i) => i >= 0)));
  }, [result]);

  const toggleExpand = (idx: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {result.cached && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm">
          <CheckCircle2 size={14} className="text-amber-400" />
          <span className="text-soft">
            Cached match: <code className="font-mono text-amber-400">{result.cached.youtubeId}</code>
            <span className="text-muted"> (score {result.cached.score}, {formatRelative(result.cached.matchedAt)})</span>
          </span>
        </div>
      )}

      {!result.accepted && result.lastBest && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm text-soft">
          No acceptable match. Best fallback:{' '}
          <span className="text-white">{result.lastBest.track.title}</span>{' '}
          <span className="text-muted">·</span>{' '}
          <span className={scoreColor(result.lastBest.score)}>{result.lastBest.score}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="section-label">Queries tried ({result.attempts.length}/{result.queries.length}):</span>
      </div>

      <div className="space-y-2">
        {result.attempts.map((a, idx) => {
          const isAccepted = Boolean(result.accepted && a.best?.track.id === result.accepted.track.id);
          const isOpen = expanded.has(idx);
          return (
            <div key={idx} className={`rounded-xl border ${isAccepted ? 'border-accent/30 bg-accent/[0.04]' : 'border-white/[0.06] bg-base-900/40'}`}>
              <button onClick={() => toggleExpand(idx)} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left">
                <span className="flex-shrink-0 text-muted">
                  {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </span>
                <span className="flex-shrink-0 rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-muted">#{a.fallbackIndex}</span>
                <code className="min-w-0 flex-1 truncate font-mono text-xs text-soft">{a.query}</code>
                <span className="flex-shrink-0 text-[11px] text-muted">{a.candidateCount} cand</span>
                {a.best ? (
                  <span className={`flex-shrink-0 text-sm font-semibold tabular-nums ${scoreColor(a.best.score)}`}>{a.best.score}</span>
                ) : (
                  <span className="flex-shrink-0 text-xs text-muted">none</span>
                )}
                {isAccepted && (
                  <span className="flex flex-shrink-0 items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                    <CheckCircle2 size={10} /> accepted
                  </span>
                )}
              </button>
              {isOpen && (
                <div className="space-y-1.5 border-t border-white/[0.04] px-3 py-3">
                  {a.candidates.length === 0 ? (
                    <div className="py-2 text-center text-xs text-muted">No candidates</div>
                  ) : (
                    a.candidates.map((c, ci) => <CandidateRow key={c.track.id} candidate={c} rank={ci} />)
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Current track resolver snapshot ───────────────────────────────────────────

function StatusRow({ label, value, tone }: { label: string; value: ReactNode; tone?: 'ok' | 'warn' | 'bad' | 'muted' }) {
  const color = tone === 'ok' ? 'text-emerald-400' : tone === 'warn' ? 'text-amber-400' : tone === 'bad' ? 'text-red-400' : tone === 'muted' ? 'text-muted' : 'text-soft';
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-sm text-muted">{label}</span>
      <span className={`truncate text-sm font-mono ${color}`}>{value}</span>
    </div>
  );
}

function CurrentTrackSnapshot({ track }: { track: CachedTrack | null }) {
  const [snapshot, setSnapshot] = useState<ResolverSnapshot | null>(null);
  const [snapLoading, setSnapLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const spotifyId = track?.spotifyId;
  const youtubeId = track ? (track.youtubeId ?? (track.id.startsWith('spotify:') ? undefined : track.id)) : undefined;

  const refreshSnapshot = useCallback(async () => {
    if (!youtubeId && !spotifyId) return;
    setSnapLoading(true);
    try {
      setSnapshot(await debugApi.resolverSnapshot({ spotifyId, youtubeId }));
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setSnapLoading(false);
    }
  }, [spotifyId, youtubeId]);

  // Snapshot only — no live matcher run. The active match (chosen query +
  // candidate) is read from cache state, so switching tracks stays instant.
  useEffect(() => {
    if (!track) {
      setSnapshot(null);
      return;
    }
    void refreshSnapshot();
  }, [track, refreshSnapshot]);

  async function runAction(name: string, fn: () => Promise<unknown>) {
    setBusy(name);
    setMsg(null);
    try {
      await fn();
      await refreshSnapshot();
      setMsg({ ok: true, text: `${name} done.` });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const copyJson = () => {
    const payload = {
      track: track && {
        id: track.id,
        title: track.title,
        artist: track.artist,
        spotifyId,
        youtubeId,
        source: track.source,
        queueSource: track.queueSource,
      },
      snapshot,
    };
    navigator.clipboard?.writeText(JSON.stringify(payload, null, 2)).then(
      () => setMsg({ ok: true, text: 'Debug JSON copied to clipboard.' }),
      () => setMsg({ ok: false, text: 'Clipboard unavailable.' })
    );
  };

  // Empty state — always render the card so the tab is never blank.
  if (!track) {
    return (
      <div className="surface-panel p-5">
        <div className="mb-4 flex items-center gap-2">
          <Music2 size={16} className="text-accent" />
          <h2 className="text-base font-semibold text-white">Current Track</h2>
        </div>
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-base-600/40 bg-base-800 text-muted">
            <Music2 size={24} strokeWidth={1.3} />
          </div>
          <p className="text-sm text-muted">No track is currently playing.</p>
          <p className="max-w-xs text-xs text-muted">
            Play a track to inspect its resolver state and the matcher query chain.
          </p>
        </div>
      </div>
    );
  }

  const urlFresh = snapshot?.learned?.audioUrlExpiry
    ? snapshot.learned.audioUrlExpiry > Date.now()
    : null;
  const src = track.source ? sourceMeta[track.source] ?? { label: track.source, cls: 'text-soft' } : null;

  return (
    <div className="surface-panel p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Music2 size={16} className="text-accent" />
          <h2 className="text-base font-semibold text-white">Current Track</h2>
        </div>
        <button onClick={() => void refreshSnapshot()} disabled={snapLoading} className="btn-ghost" title="Refresh snapshot">
          <RefreshCw size={15} className={snapLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="mb-3 flex items-center gap-3">
        <img
          src={track.thumbnail}
          alt=""
          className="h-11 w-11 rounded-lg object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-white">{track.title}</div>
          <div className="truncate text-xs text-muted">{track.artist}</div>
        </div>
      </div>

      <div className="grid gap-x-6 gap-y-0 sm:grid-cols-2">
        <StatusRow label="Playback source" value={src ? <span className={src.cls}>{src.label}</span> : '—'} />
        <StatusRow label="Queue source" value={track.queueSource ?? '—'} />
        <StatusRow label="Spotify ID" value={spotifyId ?? '—'} tone="muted" />
        <StatusRow label="Active YouTube ID" value={snapshot?.youtubeId ?? youtubeId ?? '—'} />
        <StatusRow
          label="Match cache"
          value={snapshot?.matchCache ? `hit · score ${snapshot.matchCache.score}` : (snapshot ? 'miss' : '—')}
          tone={snapshot?.matchCache ? 'ok' : 'muted'}
        />
        <StatusRow
          label="Learned cache"
          value={snapshot?.learned ? `cached · ${snapshot.learned.cachedAt ? formatRelative(snapshot.learned.cachedAt) : ''}` : (snapshot ? 'miss' : '—')}
          tone={snapshot?.learned ? 'ok' : 'muted'}
        />
        <StatusRow
          label="Stream URL"
          value={urlFresh === null ? '—' : urlFresh ? `fresh · ${Math.round((snapshot!.learned!.audioUrlExpiry! - Date.now()) / 60000)}m left` : 'stale'}
          tone={urlFresh === null ? 'muted' : urlFresh ? 'ok' : 'warn'}
        />
        <StatusRow
          label="Audio file cache"
          value={snapshot?.audioCache.cached ? 'cached' : (snapshot ? 'none' : '—')}
          tone={snapshot?.audioCache.cached ? 'ok' : 'muted'}
        />
        <StatusRow
          label="Blacklist"
          value={snapshot?.blacklist.blacklisted ? 'BLACKLISTED' : (snapshot ? 'clean' : '—')}
          tone={snapshot?.blacklist.blacklisted ? 'bad' : 'muted'}
        />
        <StatusRow
          label="Prefetch"
          value={snapshot?.prefetch.prefetched ? 'prefetched' : snapshot?.prefetch.prefetching ? 'in-flight' : (snapshot ? '—' : '—')}
          tone={snapshot?.prefetch.prefetched ? 'ok' : 'muted'}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => runAction('Resolve again', () => debugApi.resolveAgain({ spotifyId, youtubeId, title: track.title, artist: track.artist, duration: track.duration, thumbnail: track.thumbnail }))}
          disabled={!!busy}
          className="flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-40"
        >
          {busy === 'Resolve again' ? <RefreshCw size={13} className="animate-spin" /> : <RotateCw size={13} />}
          Resolve again
        </button>
        <button
          onClick={() => runAction('Clear this track', () => debugApi.clearTrack({ id: track.id, title: track.title, artist: track.artist, query: track.query, spotifyId, youtubeId }))}
          disabled={!!busy}
          className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-40"
        >
          {busy === 'Clear this track' ? <RefreshCw size={13} className="animate-spin" /> : <Eraser size={13} />}
          Clear this track
        </button>
        <button
          onClick={() => spotifyId && runAction('Clear match only', () => debugApi.clearCacheEntry(spotifyId))}
          disabled={!!busy || !spotifyId}
          className="flex items-center gap-1.5 rounded-lg border border-base-600 px-3 py-1.5 text-xs font-medium text-soft transition-colors hover:text-white hover:border-base-500 disabled:opacity-40"
        >
          {busy === 'Clear match only' ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
          Clear match only
        </button>
        <button
          onClick={copyJson}
          className="flex items-center gap-1.5 rounded-lg border border-base-600 px-3 py-1.5 text-xs font-medium text-soft transition-colors hover:text-white hover:border-base-500"
        >
          <Copy size={13} />
          Copy debug JSON
        </button>
      </div>

      {msg && (
        <div className={`mt-3 flex items-center gap-1.5 text-xs ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>
          {msg.ok ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
          {msg.text}
        </div>
      )}

      {/* Active match — the query + candidate currently in playback (read from cache, no live search) */}
      <div className="mt-5 border-t border-white/[0.06] pt-4">
        <div className="mb-3 flex items-center gap-2">
          <Terminal size={15} className="text-accent" />
          <h3 className="text-sm font-semibold text-white">Active match</h3>
        </div>
        {snapshot?.matchCache || snapshot?.learned ? (
          <div className="space-y-2.5 rounded-lg border border-white/[0.06] bg-base-900/40 p-3">
            <div>
              <p className="mb-0.5 text-[11px] text-muted">Query used</p>
              <code className="break-all font-mono text-xs text-soft">
                {snapshot?.learned?.query || '—'}
              </code>
            </div>
            <div className="flex items-center gap-2.5">
              {snapshot?.youtubeId && (
                <img
                  src={ytThumb(snapshot.youtubeId)}
                  alt=""
                  className="h-9 w-14 flex-shrink-0 rounded object-cover"
                  loading="lazy"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-white">
                  {snapshot?.matchCache?.youtubeTitle || snapshot?.learned?.youtubeTitle || '—'}
                </p>
                <p className="truncate text-xs text-muted">
                  {snapshot?.matchCache?.youtubeArtist || snapshot?.learned?.youtubeArtist || '—'}
                </p>
              </div>
              {snapshot?.matchCache && (
                <span className={`flex-shrink-0 text-sm font-semibold tabular-nums ${scoreColor(snapshot.matchCache.score)}`}>
                  {snapshot.matchCache.score}
                </span>
              )}
            </div>
            <div className="text-[11px] text-muted">
              <code className="font-mono">{snapshot?.youtubeId ?? '—'}</code>
              {snapshot?.matchCache?.matchedAt && (
                <span className="ml-1.5">· matched {formatRelative(snapshot.matchCache.matchedAt)}</span>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted">No active match recorded for this track.</p>
        )}
        <p className="mt-2 text-[11px] text-muted">
          Inspect the full fallback query chain in the Matcher Inspector below.
        </p>
      </div>
    </div>
  );
}

// ── Matcher inspector (manual) ────────────────────────────────────────────────

function MatcherInspector() {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [spotifyId, setSpotifyId] = useState('');
  const [duration, setDuration] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DebugMatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    } catch (err) {
      setError((err as Error).message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [title, artist, spotifyId, duration]);

  return (
    <div className="surface-panel p-5">
      <div className="mb-4 flex items-center gap-2">
        <Terminal size={16} className="text-accent" />
        <h2 className="text-base font-semibold text-white">Matcher Inspector</h2>
      </div>
      <p className="mb-3 text-xs text-muted">
        Run the full Spotify→YouTube fallback query chain for any track and inspect the best candidate per query.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="section-label mb-1.5 block">Title</label>
          <input className="input-base" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && runMatch()} placeholder="e.g. Show" />
        </div>
        <div>
          <label className="section-label mb-1.5 block">Artist</label>
          <input className="input-base" value={artist} onChange={(e) => setArtist(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && runMatch()} placeholder="e.g. Ado" />
        </div>
        <div>
          <label className="section-label mb-1.5 block">Spotify ID (optional)</label>
          <input className="input-base" value={spotifyId} onChange={(e) => setSpotifyId(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && runMatch()} placeholder="e.g. 3K4gshVxh3IBi7XRhKZcp8" />
        </div>
        <div>
          <label className="section-label mb-1.5 block">Duration (seconds, optional)</label>
          <input className="input-base" type="number" value={duration} onChange={(e) => setDuration(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && runMatch()} placeholder="e.g. 193" />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button onClick={runMatch} disabled={loading} className="btn-accent disabled:opacity-50">
          {loading ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
          {loading ? 'Matching...' : 'Run Match'}
        </button>
        {error && (
          <span className="flex items-center gap-1.5 text-sm text-red-400">
            <AlertCircle size={14} /> {error}
          </span>
        )}
      </div>

      {result && <div className="mt-5"><MatcherResultView result={result} /></div>}
    </div>
  );
}

// ── Resolver Match panel ──────────────────────────────────────────────────────

function ResolverPanel() {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  return (
    <div className="space-y-4">
      <CurrentTrackSnapshot track={currentTrack} />
      <MatcherInspector />
    </div>
  );
}

// ── Match Cache manager ───────────────────────────────────────────────────────

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
        e.spotifyTitle?.toLowerCase().includes(q) ||
        e.spotifyArtist?.toLowerCase().includes(q) ||
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
            <h2 className="text-base font-semibold text-white">Match Cache</h2>
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
          <select className="input-base w-auto" value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
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
                  <div className="truncate text-sm text-white">
                    <span className="text-soft">{e.spotifyTitle || '(unknown)'}</span>
                    {e.spotifyArtist ? <span className="text-muted"> - {e.spotifyArtist}</span> : null}
                    <span className="mx-1.5 text-accent">→</span>
                    <span>{e.youtubeTitle || '(no title)'}</span>
                    {e.youtubeArtist ? <span className="text-muted"> · {e.youtubeArtist}</span> : null}
                  </div>
                  <div className="truncate text-[11px] text-muted">
                    <code className="font-mono">{e.spotifyId}</code>
                    <span className="mx-1 text-muted/60">→</span>
                    <code className="font-mono">{e.youtubeId}</code>
                    <span className="ml-1.5 text-muted/60">{formatRelative(e.matchedAt)}</span>
                  </div>
                </div>
                <span className={`flex-shrink-0 text-sm font-semibold tabular-nums ${scoreColor(e.score)}`}>
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

// ── Status snapshot ───────────────────────────────────────────────────────────

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
    { label: 'Prefetched', value: status.prefetch.prefetched.length, sub: `${status.prefetch.inFlight.length} in-flight · ${status.prefetch.pending} pending`, color: 'text-violet-400' },
    { label: 'Blacklisted', value: status.playbackBlacklist.failedIds, sub: 'failed IDs', color: 'text-red-400' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-accent" />
          <h2 className="text-base font-semibold text-white">Backend Status</h2>
        </div>
        <button onClick={refresh} disabled={loading} className="btn-ghost" title="Refresh">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="surface-panel p-4">
            <div className="section-label mb-1.5">{c.label}</div>
            <div className={`text-3xl font-semibold tabular-nums ${c.color}`}>{c.value}</div>
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

      <div className="surface-panel p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="section-label">Prefetch</h3>
          <span className="text-xs text-muted">{status.prefetch.queueSize} queued · {status.prefetch.pending} pending</span>
        </div>

        <div className="mb-3">
          <div className="mb-1.5 text-xs text-muted">Ready ({status.prefetch.prefetched.length})</div>
          {status.prefetch.prefetched.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {status.prefetch.prefetched.map((id) => (
                <code key={id} className="rounded-md bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] text-emerald-300">{id}</code>
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted">No tracks prefetched right now.</div>
          )}
        </div>

        <div>
          <div className="mb-1.5 text-xs text-muted">In-flight ({status.prefetch.inFlight.length})</div>
          {status.prefetch.inFlight.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {status.prefetch.inFlight.map((id) => (
                <code key={id} className="rounded-md bg-amber-500/10 px-2 py-0.5 font-mono text-[11px] text-amber-300">{id}</code>
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted">Nothing resolving right now.</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function DebugApp() {
  const [tab, setTab] = useState<Tab>('resolver');
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const setView = usePlayerStore((state) => state.setView);

  useEffect(() => {
    (async () => {
      try {
        const base = await discoverBackend();
        setBackendOk(Boolean(base));
      } catch {
        setBackendOk(false);
      }
    })();
  }, []);

  const tabs: Array<{ id: Tab; label: string; icon: typeof Search }> = [
    { id: 'resolver', label: 'Resolver Match', icon: Terminal },
    { id: 'cache', label: 'Match Cache', icon: Database },
    { id: 'status', label: 'Status', icon: Activity },
  ];

  return (
    <div className="relative z-10 flex h-full flex-col overflow-hidden text-white">
      <div className="ambient-glow -top-40 left-1/4 h-72 w-72 bg-accent/10 animate-float" aria-hidden="true" />

      {/* Header */}
      <div className="relative z-10 flex h-14 flex-shrink-0 items-center gap-3 border-b border-white/[0.06] bg-base-950/40 px-5 backdrop-blur-xl">
        <span className="text-sm font-semibold text-white/90">Debug Dashboard</span>
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
          <button
            type="button"
            onClick={() => setView('settings')}
            className="rounded-lg px-3 py-1.5 text-xs text-muted transition-colors hover:bg-white/[0.04] hover:text-soft"
          >
            Back to settings
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 min-h-0 flex-1 overflow-y-auto p-5">
        <div className="mx-auto max-w-4xl">
          {tab === 'resolver' && <ResolverPanel />}
          {tab === 'cache' && <CachePanel />}
          {tab === 'status' && <StatusPanel />}
        </div>
      </div>
    </div>
  );
}
