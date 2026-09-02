import { useCallback, useEffect, useState, useRef, createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Search, Trash2, RefreshCw, Activity, Database, Terminal, AlertCircle, CheckCircle2,
  ChevronDown, ChevronRight, Copy, RotateCw, Music2, Ban, Save, FileText,
  Wifi, HardDrive, List, X, Brain, UploadCloud, ExternalLink
} from 'lucide-react';
import {
  debugApi, discoverBackend,
  type DebugMatchResult, type MatchCacheEntry, type DebugStatus,
  type ResolverSnapshot, type ScoredCandidate,
} from './api';
import { usePlayerStore } from '../store/player';
import type { CachedTrack } from '../utils/api';
import { openExternalUrl } from '../hooks/useUpdateChecker';

type Tab = 'resolver' | 'lyrics' | 'status' | 'tools';

export interface ConfirmConfig {
  title: string;
  message: string;
  confirmText?: string;
  variant?: 'danger' | 'warning' | 'info' | 'emerald' | 'purple';
  onConfirm: () => void | Promise<void>;
}

const ConfirmContext = createContext<(config: ConfirmConfig) => void>(() => {});

export function useConfirmAction() {
  return useContext(ConfirmContext);
}

function ConfirmModal({ config, onClose }: { config: ConfirmConfig; onClose: () => void }) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await config.onConfirm();
    } finally {
      setLoading(false);
      onClose();
    }
  };

  const getConfirmBtnStyle = () => {
    if (config.variant === 'danger') {
      return 'btn-danger';
    }
    if (config.variant === 'emerald') {
      return 'rounded-xl border border-emerald-500/30 bg-emerald-500/20 px-4 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/30 transition-colors disabled:opacity-50';
    }
    if (config.variant === 'purple') {
      return 'rounded-xl border border-purple-500/30 bg-purple-500/20 px-4 py-2 text-xs font-semibold text-purple-300 hover:bg-purple-500/30 transition-colors disabled:opacity-50';
    }
    if (config.variant === 'warning') {
      return 'rounded-xl border border-amber-500/30 bg-amber-500/20 px-4 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/30 transition-colors disabled:opacity-50';
    }
    return 'btn-accent text-xs py-2 px-4';
  };

  return (
    <div className="modal-backdrop flex items-center justify-center p-4">
      <div className="modal-panel max-w-md p-5 space-y-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className={`rounded-xl p-2.5 flex-shrink-0 ${
            config.variant === 'emerald'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : config.variant === 'purple'
              ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
              : config.variant === 'warning'
              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              : 'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}>
            <AlertCircle size={20} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">{config.title}</h3>
            <p className="text-xs text-soft mt-1 leading-relaxed">{config.message}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="btn-ghost px-4 py-2 text-xs font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className={`flex items-center gap-1.5 ${getConfirmBtnStyle()}`}
          >
            {loading && <RefreshCw size={13} className="animate-spin" />}
            {config.confirmText || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

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

function CandidateRow({
  candidate,
  rank,
  spotifyId,
  spotifyTitle,
  spotifyArtist,
  activeMatchYoutubeId,
}: {
  candidate: ScoredCandidate;
  rank: number;
  spotifyId?: string;
  spotifyTitle?: string;
  spotifyArtist?: string;
  activeMatchYoutubeId?: string;
}) {
  const [open, setOpen] = useState(rank === 0);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setBusy('save');
    setMsg(null);
    try {
      const cleanYtId = candidate.track.id.replace(/^youtube:/, '').trim();
      const res = spotifyId
        ? await debugApi.setMatch({
            spotifyId,
            youtubeId: cleanYtId,
            youtubeTitle: candidate.track.title,
            youtubeArtist: candidate.track.artist,
            spotifyTitle,
            spotifyArtist,
            score: candidate.score,
          })
        : await debugApi.saveMatcherMatch({
            spotifyId,
            youtubeId: cleanYtId,
            youtubeTitle: candidate.track.title,
            youtubeArtist: candidate.track.artist,
            spotifyTitle,
            spotifyArtist,
            score: candidate.score,
          });
      setMsg({ ok: true, text: 'Set as active match & updated cache!' });

      // If current playing track matches this, play the new match immediately
      const currentTrack = usePlayerStore.getState().currentTrack;
      if (currentTrack && res.entry) {
        const isMatch = (spotifyId && currentTrack.spotifyId === spotifyId) ||
          (currentTrack.title.toLowerCase() === (spotifyTitle || candidate.track.title).toLowerCase());
        if (isMatch) {
          usePlayerStore.getState().playTrack({
            ...currentTrack,
            youtubeId: cleanYtId,
            id: currentTrack.spotifyId ? `spotify:${currentTrack.spotifyId}` : cleanYtId,
          });
        }
      }
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const handleBlacklist = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setBusy('blacklist');
    setMsg(null);
    try {
      const cleanYtId = candidate.track.id.replace(/^youtube:/, '').trim();
      await debugApi.blacklistMatch({
        youtubeId: cleanYtId,
        spotifyId,
        title: candidate.track.title || spotifyTitle,
        artist: candidate.track.artist || spotifyArtist,
      });
      setMsg({ ok: true, text: 'Blacklisted video.' });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const cleanCandidateYtId = candidate.track.id.replace(/^youtube:/, '').trim();
  const isActiveCachedMatch = Boolean(
    activeMatchYoutubeId && cleanCandidateYtId === activeMatchYoutubeId.replace(/^youtube:/, '').trim()
  );

  return (
    <div className={`rounded-lg border ${isActiveCachedMatch ? 'border-emerald-500/40 bg-emerald-500/[0.06]' : rank === 0 ? 'border-accent/20 bg-accent/[0.03]' : 'border-white/[0.04] bg-base-900/30'}`}>
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
          <div className="flex items-center gap-2 truncate text-xs text-white">
            <span className="truncate">{candidate.track.title}</span>
            {isActiveCachedMatch && (
              <span className="flex-shrink-0 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.2 font-mono text-[10px] font-semibold text-emerald-400">
                📌 Active Cached Match
              </span>
            )}
          </div>
          <div className="truncate text-[11px] text-muted">{candidate.track.artist} · {candidate.track.id}</div>
        </div>
        <span className={`flex-shrink-0 text-xs font-semibold tabular-nums ${scoreColor(candidate.score)}`}>
          {candidate.score}
        </span>
      </button>
      {open && (
        <div className="border-t border-white/[0.04] px-2.5 py-2.5 space-y-2">
          <div className="flex flex-wrap gap-1">
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
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
            <span>Duration: {candidate.track.duration}s</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleSave}
                disabled={busy === 'save'}
                className="flex items-center gap-1 rounded bg-accent/10 border border-accent/30 px-2 py-0.5 text-[11px] font-medium text-accent hover:bg-accent/20 disabled:opacity-40"
              >
                {busy === 'save' ? <RefreshCw size={11} className="animate-spin" /> : <Save size={11} />}
                Set as Active Match & Clear Cache Old
              </button>
              <button
                type="button"
                onClick={handleBlacklist}
                disabled={busy === 'blacklist'}
                className="flex items-center gap-1 rounded bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[11px] font-medium text-amber-400 hover:bg-amber-500/20 disabled:opacity-40"
              >
                {busy === 'blacklist' ? <RefreshCw size={11} className="animate-spin" /> : <Ban size={11} />}
                Blacklist
              </button>
            </div>
          </div>
          {msg && (
            <div className={`text-[11px] ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>
              {msg.text}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Matcher result (full fallback query chain) — shared ───────────────────────

function MatcherResultView({
  result,
  spotifyId,
  spotifyTitle,
  spotifyArtist,
}: {
  result: DebugMatchResult;
  spotifyId?: string;
  spotifyTitle?: string;
  spotifyArtist?: string;
}) {
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

  const activeSpotifyId = spotifyId || result.cached?.spotifyId;
  const activeTitle = spotifyTitle || result.cached?.spotifyTitle;
  const activeArtist = spotifyArtist || result.cached?.spotifyArtist;

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
                    a.candidates.map((c, ci) => (
                      <CandidateRow
                        key={c.track.id}
                        candidate={c}
                        rank={ci}
                        spotifyId={activeSpotifyId}
                        spotifyTitle={activeTitle}
                        spotifyArtist={activeArtist}
                        activeMatchYoutubeId={result.cached?.youtubeId}
                      />
                    ))
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
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showModal, setShowModal] = useState(false);

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

  // Esc keybind to close resolve modal
  useEffect(() => {
    if (!showModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showModal]);

  const [modalBusyOption, setModalBusyOption] = useState<string | null>(null);
  const [modalMsg, setModalMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function runModalAction(optionKey: string, name: string, fn: () => Promise<any>) {
    setModalBusyOption(optionKey);
    setModalMsg(null);
    setMsg(null);
    try {
      const res = await fn();
      await refreshSnapshot();
      setModalMsg({ ok: true, text: `${name} completed!` });
      setMsg({ ok: true, text: `${name} done.` });

      if (res?.resolved && track) {
        usePlayerStore.getState().playTrack({
          ...track,
          title: track.title || res.resolved.title || '',
          artist: track.artist || res.resolved.artist || '',
          youtubeId: res.resolved.youtubeId || res.resolved.id,
          id: track.spotifyId ? `spotify:${track.spotifyId}` : (res.resolved.youtubeId || res.resolved.id),
        } as any);
      }

      setTimeout(() => {
        setShowModal(false);
        setModalMsg(null);
      }, 1000);
    } catch (e) {
      setModalMsg({ ok: false, text: (e as Error).message });
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setModalBusyOption(null);
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

  const resolverSource = snapshot?.learned?.resolverSource || ((track as any).source === 'local' || (track as any).localAudioPath ? 'local' : null);
  const resolverEngine = resolverSource === 'youtubei'
    ? { label: 'Innertube-rs', cls: 'text-emerald-400 font-semibold' }
    : resolverSource === 'ytdlp'
    ? { label: 'yt-dlp (bundled fallback)', cls: 'text-amber-400 font-semibold' }
    : resolverSource === 'local'
    ? { label: 'Local storage', cls: 'text-sky-400 font-semibold' }
    : { label: 'Innertube (primary)', cls: 'text-emerald-400/80' };

  const formatStr = snapshot?.learned?.audioFormat
    ? `${snapshot.learned.audioFormat.toUpperCase()}${snapshot.learned.audioQuality && snapshot.learned.audioQuality !== 'unknown' ? ` · ${snapshot.learned.audioQuality}` : ''}`
    : (track as any).audioFormat
    ? `${String((track as any).audioFormat).toUpperCase()}`
    : '—';

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
        <StatusRow label="Resolver engine" value={<span className={resolverEngine.cls}>{resolverEngine.label}</span>} />
        <StatusRow label="Audio format" value={formatStr} tone={formatStr !== '—' ? 'ok' : 'muted'} />
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
          onClick={() => setShowModal(true)}
          disabled={!!modalBusyOption}
          className="flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-40"
        >
          {modalBusyOption ? <RefreshCw size={13} className="animate-spin" /> : <RotateCw size={13} />}
          Resolve again
        </button>
        <button
          onClick={copyJson}
          className="flex items-center gap-1.5 rounded-lg border border-base-600 px-3 py-1.5 text-xs font-medium text-soft transition-colors hover:text-white hover:border-base-500"
        >
          <Copy size={13} />
          Copy debug JSON
        </button>
      </div>

      {/* Modal Options for Resolve Again rendered via Portal to document.body */}
      {showModal &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
            onClick={(e) => {
              if (e.target === e.currentTarget && !modalBusyOption) setShowModal(false);
            }}
          >
            <div className="w-full max-w-md rounded-xl border border-white/10 bg-base-900 p-5 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-white">Resolve Options</h3>
                <button onClick={() => setShowModal(false)} disabled={!!modalBusyOption} className="text-muted hover:text-white disabled:opacity-30">
                  <X size={18} />
                </button>
              </div>
              <p className="text-xs text-muted">
                Select resolve option for <strong className="text-white">{track.title}</strong>:
              </p>

              {modalMsg && (
                <div className={`flex items-center gap-1.5 rounded-lg border p-2.5 text-xs ${modalMsg.ok ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400' : 'border-red-500/20 bg-red-500/10 text-red-400'}`}>
                  {modalMsg.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                  {modalMsg.text}
                </div>
              )}

              <div className="space-y-2">
                {/* Option 1: Clear learned cache only */}
                <button
                  onClick={() =>
                    runModalAction('opt1', 'Clear learned cache only', () =>
                      debugApi.resolveAgain({ spotifyId, youtubeId, title: track.title, artist: track.artist, duration: track.duration, thumbnail: track.thumbnail })
                    )
                  }
                  disabled={!!modalBusyOption}
                  className="w-full flex items-center justify-between rounded-lg border border-white/10 bg-base-800 px-4 py-3 text-left transition-colors hover:bg-base-700 disabled:opacity-40"
                >
                  <div>
                    <div className="text-xs font-medium text-white">Clear learned cache only</div>
                    <div className="text-[11px] text-muted">Clear cached resolution for this track and search for the best audio stream again.</div>
                  </div>
                  {modalBusyOption === 'opt1' ? (
                    <RefreshCw size={15} className="animate-spin text-accent flex-shrink-0" />
                  ) : (
                    <Trash2 size={15} className="text-soft flex-shrink-0" />
                  )}
                </button>

                {/* Option 2: Clear match only */}
                <button
                  onClick={() =>
                    runModalAction('opt2', 'Clear match & re-resolve', async () => {
                      if (spotifyId) await debugApi.clearCacheEntry(spotifyId);
                      return debugApi.resolveAgain({ spotifyId, youtubeId, title: track.title, artist: track.artist, duration: track.duration, thumbnail: track.thumbnail });
                    })
                  }
                  disabled={!spotifyId || !!modalBusyOption}
                  className="w-full flex items-center justify-between rounded-lg border border-white/10 bg-base-800 px-4 py-3 text-left transition-colors hover:bg-base-700 disabled:opacity-40"
                >
                  <div>
                    <div className="text-xs font-medium text-white">Clear match only</div>
                    <div className="text-[11px] text-muted">Clear Spotify → YouTube match mapping and re-resolve audio stream.</div>
                  </div>
                  {modalBusyOption === 'opt2' ? (
                    <RefreshCw size={15} className="animate-spin text-accent flex-shrink-0" />
                  ) : (
                    <Trash2 size={15} className="text-soft flex-shrink-0" />
                  )}
                </button>

                {/* Option 3: Clear learned cache and match */}
                <button
                  onClick={() =>
                    runModalAction('opt3', 'Clear learned cache & match', async () => {
                      if (spotifyId) await debugApi.clearCacheEntry(spotifyId);
                      await debugApi.clearTrack({
                        id: track.id,
                        title: track.title,
                        artist: track.artist,
                        query: `${track.title} ${track.artist}`,
                        spotifyId,
                        youtubeId,
                      });
                      return debugApi.resolveAgain({
                        spotifyId,
                        youtubeId,
                        title: track.title,
                        artist: track.artist,
                        duration: track.duration,
                        thumbnail: track.thumbnail,
                      });
                    })
                  }
                  disabled={!!modalBusyOption}
                  className="w-full flex items-center justify-between rounded-lg border border-white/10 bg-base-800 px-4 py-3 text-left transition-colors hover:bg-base-700 disabled:opacity-40"
                >
                  <div>
                    <div className="text-xs font-medium text-white">Clear learned cache and match</div>
                    <div className="text-[11px] text-muted">Clear both learned resolver cache and Spotify → YouTube match mapping, then re-resolve from scratch.</div>
                  </div>
                  {modalBusyOption === 'opt3' ? (
                    <RefreshCw size={15} className="animate-spin text-accent flex-shrink-0" />
                  ) : (
                    <Trash2 size={15} className="text-soft flex-shrink-0" />
                  )}
                </button>

                {/* Option 4: Clear match, learned cache and blacklist this match */}
                <button
                  onClick={() => {
                    const activeYt = snapshot?.youtubeId ?? youtubeId;
                    runModalAction('opt4', 'Blacklist, clear cache & re-resolve', async () => {
                      if (activeYt) {
                        await debugApi.blacklistMatch({
                          youtubeId: activeYt,
                          spotifyId,
                          targetTitle: track.title,
                          targetArtist: track.artist,
                          matchedTitle: snapshot?.matchCache?.youtubeTitle || activeYt,
                          matchedArtist: snapshot?.matchCache?.youtubeArtist || '',
                        });
                      }
                      return debugApi.resolveAgain({
                        spotifyId,
                        youtubeId: activeYt,
                        title: track.title,
                        artist: track.artist,
                        duration: track.duration,
                        thumbnail: track.thumbnail,
                        keepBlacklist: true,
                      });
                    });
                  }}
                  disabled={!(snapshot?.youtubeId ?? youtubeId) || !!modalBusyOption}
                  className="w-full flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-left transition-colors hover:bg-red-500/20 disabled:opacity-40"
                >
                  <div>
                    <div className="text-xs font-medium text-red-400">Clear match, learned cache and blacklist this match</div>
                    <div className="text-[11px] text-muted">Blacklist the active YouTube video, clear match & cache, and re-resolve to find a better match.</div>
                  </div>
                  {modalBusyOption === 'opt4' ? (
                    <RefreshCw size={15} className="animate-spin text-red-400 flex-shrink-0" />
                  ) : (
                    <Ban size={15} className="text-red-400 flex-shrink-0" />
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

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
                  {snapshot?.matchCache?.youtubeTitle || snapshot?.learned?.youtubeTitle || snapshot?.learned?.title || '—'}
                </p>
                <p className="truncate text-xs text-muted">
                  {snapshot?.matchCache?.youtubeArtist || snapshot?.learned?.youtubeArtist || snapshot?.learned?.artist || '—'}
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
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const [title, setTitle] = useState(currentTrack?.title || '');
  const [artist, setArtist] = useState(currentTrack?.artist || '');
  const [spotifyId, setSpotifyId] = useState(
    currentTrack?.spotifyId || (currentTrack?.id?.startsWith('spotify:') ? currentTrack.id.replace('spotify:track:', '') : '')
  );
  const [duration, setDuration] = useState(currentTrack?.duration ? String(currentTrack.duration) : '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DebugMatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentTrack) {
      setTitle(currentTrack.title || '');
      setArtist(currentTrack.artist || '');
      setSpotifyId(
        currentTrack.spotifyId || (currentTrack.id?.startsWith('spotify:') ? currentTrack.id.replace('spotify:track:', '') : '')
      );
      setDuration(currentTrack.duration ? String(currentTrack.duration) : '');
    }
  }, [currentTrack]);

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
        <h2 className="text-base font-semibold text-white">Manual Track Search & Save to Cache</h2>
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
          <input className="input-base [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" type="number" value={duration} onChange={(e) => setDuration(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && runMatch()} placeholder="e.g. 193" />
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
      <CachePanel />
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

  const confirmAction = useConfirmAction();

  const clearAll = () => {
    confirmAction({
      title: 'Clear Learned Cache',
      message: `Clear all ${entries.length} Spotify → YouTube match entries?`,
      confirmText: 'Clear All',
      variant: 'danger',
      onConfirm: async () => {
        setLoading(true);
        try {
          await debugApi.clearAllCache();
          await refresh();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setLoading(false);
        }
      },
    });
  };

  const clearOne = (spotifyId: string) => {
    confirmAction({
      title: 'Clear Learned Match',
      message: `Clear learned match entry for Spotify track ID "${spotifyId}"?`,
      confirmText: 'Clear Match',
      variant: 'warning',
      onConfirm: async () => {
        try {
          await debugApi.clearCacheEntry(spotifyId);
          setEntries((prev) => prev.filter((e) => e.spotifyId !== spotifyId));
        } catch (err) {
          setError((err as Error).message);
        }
      },
    });
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
            <h2 className="text-base font-semibold text-white">Learned Cache</h2>
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

function CachedLyricsList() {
  const [entries, setEntries] = useState<Array<{ key: string; query: { title: string; artist: string; duration: number }; cachedAt: number; hasLyrics: boolean; synced: boolean; lineCount: number; provider: string; lyricsTitle: string; lyricsArtist: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await debugApi.listLyricsCache();
      setEntries(res.entries);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const confirmAction = useConfirmAction();

  const clearOne = (key: string) => {
    const entry = entries.find((e) => e.key === key);
    if (!entry) return;
    confirmAction({
      title: 'Clear Cached Lyrics',
      message: `Clear cached lyrics entry for "${entry.query.title}"?`,
      confirmText: 'Clear Lyrics',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await debugApi.clearLyricsCache({ title: entry.query.title, artist: entry.query.artist, duration: entry.query.duration });
          setEntries((prev) => prev.filter((e) => e.key !== key));
        } catch (err) {
          setError((err as Error).message);
        }
      },
    });
  };

  const filtered = entries.filter((e) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      e.query.title.toLowerCase().includes(q) ||
      e.query.artist.toLowerCase().includes(q) ||
      e.lyricsTitle.toLowerCase().includes(q) ||
      e.lyricsArtist.toLowerCase().includes(q)
    );
  });

  return (
    <div className="surface-panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database size={16} className="text-accent" />
          <h2 className="text-base font-semibold text-white">Cached Lyrics</h2>
          <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-xs text-soft">
            {entries.length} entries
          </span>
        </div>
        <button onClick={refresh} disabled={loading} className="btn-ghost" title="Refresh">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="mb-3">
        <input
          className="input-base"
          placeholder="Filter by title, artist..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {error && (
        <div className="mb-3 flex items-center gap-1.5 text-sm text-red-400">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <div className="max-h-[50vh] space-y-1.5 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted">
            {entries.length === 0 ? 'No lyrics cached yet.' : 'No entries match filter.'}
          </div>
        ) : (
          filtered.map((e) => (
            <div
              key={e.key}
              className="group flex items-center gap-3 rounded-lg border border-white/[0.04] bg-base-900/30 px-3 py-2 transition-colors hover:border-white/[0.08]"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-white">
                  <span className="text-soft">{e.query.title}</span>
                  {e.query.artist && <span className="text-muted"> — {e.query.artist}</span>}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                  {e.hasLyrics ? (
                    <>
                      <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${e.synced ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-white/[0.04] text-soft border-white/[0.08]'}`}>
                        {e.synced ? 'Synced' : 'Plain'}
                      </span>
                      <span>{e.lineCount} lines</span>
                      {e.provider && <span>· {e.provider}</span>}
                    </>
                  ) : (
                    <span className="rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-400">No Lyrics</span>
                  )}
                  <span>· {formatRelative(e.cachedAt)}</span>
                </div>
              </div>
              <button
                onClick={() => clearOne(e.key)}
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
  );
}

// ── Current Track Lyrics ──────────────────────────────────────────────────────

function LyricsPanel() {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const [snapshot, setSnapshot] = useState<any | null>(null);
  const [loadingSnap, setLoadingSnap] = useState(false);

  const [searchTitle, setSearchTitle] = useState(currentTrack?.title || '');
  const [searchArtist, setSearchArtist] = useState(currentTrack?.artist || '');
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (currentTrack) {
      setSearchTitle(currentTrack.title);
      setSearchArtist(currentTrack.artist);
    }
  }, [currentTrack]);

  const loadSnapshot = useCallback(async () => {
    if (!currentTrack?.title) {
      setSnapshot(null);
      return;
    }
    setLoadingSnap(true);
    try {
      const snap = await debugApi.lyricsSnapshot({
        title: currentTrack.title,
        artist: currentTrack.artist || '',
        duration: currentTrack.duration || 0,
      });
      setSnapshot(snap);
    } catch {
      setSnapshot(null);
    } finally {
      setLoadingSnap(false);
    }
  }, [currentTrack]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  async function handleSearch() {
    if (!searchTitle.trim()) return;
    setSearching(true);
    setMsg(null);
    try {
      const res = await debugApi.searchLyrics({ title: searchTitle.trim(), artist: searchArtist.trim() });
      setCandidates(res.candidates ?? []);
      if ((res.candidates ?? []).length === 0) {
        setMsg({ ok: false, text: 'No lyrics found on LRCLIB.' });
      }
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setSearching(false);
    }
  }

  async function handleSaveLyrics(cand: any) {
    setBusy(cand.id);
    setMsg(null);
    try {
      await debugApi.saveLyrics({
        title: currentTrack?.title || searchTitle,
        artist: currentTrack?.artist || searchArtist,
        duration: currentTrack?.duration || 0,
        candidate: cand,
      });
      setMsg({ ok: true, text: `Saved lyrics "${cand.trackName || cand.name || searchTitle}" to learned cache!` });
      await loadSnapshot();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const confirmAction = useConfirmAction();

  function handleClearLyrics() {
    if (!currentTrack?.title) return;
    confirmAction({
      title: 'Clear Lyrics Cache',
      message: `Clear cached lyrics for "${currentTrack.title}"?`,
      confirmText: 'Clear Lyrics',
      variant: 'danger',
      onConfirm: async () => {
        setBusy('clear');
        setMsg(null);
        try {
          await debugApi.clearLyricsCache({ title: currentTrack.title, artist: currentTrack.artist || '', duration: currentTrack.duration || 0 });
          setMsg({ ok: true, text: 'Lyrics cache cleared.' });
          await loadSnapshot();
        } catch (e) {
          setMsg({ ok: false, text: (e as Error).message });
        } finally {
          setBusy(null);
        }
      },
    });
  }

  return (
    <div className="space-y-6">
      {/* Target Track Lyrics Status Card */}
      <div className="surface-panel p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-accent" />
            <h2 className="text-base font-semibold text-white">Current Track Lyrics</h2>
          </div>
          <button onClick={() => void loadSnapshot()} disabled={loadingSnap} className="btn-ghost" title="Refresh snapshot">
            <RefreshCw size={15} className={loadingSnap ? 'animate-spin' : ''} />
          </button>
        </div>

        {currentTrack ? (
          <div className="mb-3 flex items-center gap-3">
            <img
              src={currentTrack.thumbnail}
              alt=""
              className="h-10 w-10 rounded-lg object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-white">{currentTrack.title}</div>
              <div className="truncate text-xs text-muted">{currentTrack.artist}</div>
            </div>
          </div>
        ) : null}

        {snapshot?.lyrics ? (
          <div className="space-y-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-emerald-400 font-medium text-sm">
                <CheckCircle2 size={16} />
                <span>Cached Lyrics Available</span>
              </div>
              <span className="rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] text-emerald-400">
                {snapshot.lyrics.synced ? 'Synced' : 'Plain'} · {snapshot.lyrics.provider || 'lrclib'}
              </span>
            </div>
            <div className="text-xs text-soft">
              <strong>{snapshot.lyrics.title}</strong> — {snapshot.lyrics.artist} ({snapshot.lyrics.lines?.length ?? 0} lines)
            </div>
            {snapshot.cachedAt && (
              <div className="text-[11px] text-muted">
                Cached {formatRelative(snapshot.cachedAt)}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-white/[0.06] bg-base-900/40 p-4 text-xs text-muted">
            {loadingSnap ? 'Checking lyrics cache...' : 'No lyrics cached for this track.'}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={handleClearLyrics}
            disabled={!snapshot?.cached || busy === 'clear'}
            className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-40"
          >
            {busy === 'clear' ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
            Clear lyrics cache
          </button>
        </div>
      </div>

      {/* Manual Lyrics Search & Save */}
      <div className="surface-panel p-5">
        <div className="mb-3 flex items-center gap-2">
          <Search size={16} className="text-accent" />
          <h3 className="text-sm font-semibold text-white">Manual Lyrics Search & Save to Cache</h3>
        </div>
        <p className="mb-4 text-xs text-muted">
          Cari lirik manual dari LRCLIB dan simpan kandidat pilihanmu ke learned cache agar otomatis digunakan saat lagu diputar.
        </p>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            className="input-base max-w-xs text-xs"
            value={searchTitle}
            onChange={(e) => setSearchTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleSearch()}
            placeholder="Search track title..."
          />
          <input
            className="input-base max-w-xs text-xs"
            value={searchArtist}
            onChange={(e) => setSearchArtist(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleSearch()}
            placeholder="Search artist..."
          />
          <button onClick={handleSearch} disabled={searching} className="btn-accent disabled:opacity-50 text-xs">
            {searching ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
            {searching ? 'Searching...' : 'Search LRCLIB'}
          </button>
        </div>

        {msg && (
          <div className={`mb-4 flex items-center gap-1.5 text-xs ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>
            {msg.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            {msg.text}
          </div>
        )}

        {candidates.length > 0 && (
          <div className="space-y-2">
            <span className="section-label">Found {candidates.length} candidates on LRCLIB:</span>
            {candidates.map((cand) => (
              <div key={cand.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-base-900/40 p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-white">
                    {cand.trackName || cand.name} <span className="text-muted">by {cand.artistName}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                    {cand.albumName && <span>Album: {cand.albumName}</span>}
                    {cand.duration && <span>Duration: {Math.round(cand.duration)}s</span>}
                    <span className={`rounded px-1.5 py-0.2 font-mono text-[10px] ${cand.syncedLyrics ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-white/[0.04] text-soft'}`}>
                      {cand.syncedLyrics ? 'Synced' : cand.plainLyrics ? 'Plain' : 'Instrumental'}
                    </span>
                    {cand.hasRomaji && (
                      <span className="rounded border border-purple-500/30 bg-purple-500/10 px-1.5 py-0.2 font-mono text-[10px] font-medium text-purple-300">
                        Romaji Available
                      </span>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => void handleSaveLyrics(cand)}
                  disabled={busy === cand.id}
                  className="flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-40 flex-shrink-0"
                >
                  {busy === cand.id ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
                  Save to Learned Cache
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cached Lyrics List */}
      <CachedLyricsList />
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
    { label: 'Learned Cache', value: status.matchCache.total, sub: 'spotify→youtube', color: 'text-sky-400' },
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

// ── Blacklist Manager ─────────────────────────────────────────────────────────

function BlacklistPanel() {
  const [entries, setEntries] = useState<Array<{
    videoId: string;
    failedAt: number;
    title?: string;
    artist?: string;
    targetTitle?: string;
    targetArtist?: string;
    matchedTitle?: string;
    matchedArtist?: string;
    expiresIn: number;
  }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await debugApi.listBlacklist();
      setEntries(res.entries);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const confirmAction = useConfirmAction();

  const clearOne = (videoId: string) => {
    confirmAction({
      title: 'Remove Blacklisted Entry',
      message: `Remove video ID "${videoId}" from playback blacklist?`,
      confirmText: 'Remove Entry',
      variant: 'warning',
      onConfirm: async () => {
        try {
          await debugApi.clearBlacklistEntry(videoId);
          setEntries((prev) => prev.filter((e) => e.videoId !== videoId));
        } catch (err) {
          setError((err as Error).message);
        }
      },
    });
  };

  const clearAll = () => {
    confirmAction({
      title: 'Clear Playback Blacklist',
      message: `Clear all ${entries.length} playback blacklist entries?`,
      confirmText: 'Clear All',
      variant: 'danger',
      onConfirm: async () => {
        setLoading(true);
        try {
          await debugApi.clearAllBlacklist();
          await refresh();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setLoading(false);
        }
      },
    });
  };

  return (
    <div className="surface-panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Ban size={16} className="text-amber-400" />
          <h2 className="text-base font-semibold text-white">Playback Blacklist</h2>
          <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-xs text-soft">{entries.length} entries</span>
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

      {error && (
        <div className="mb-3 flex items-center gap-1.5 text-sm text-red-400">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <div className="max-h-[40vh] space-y-1.5 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted">No blacklisted IDs.</div>
        ) : (
          entries.map((e) => {
            const targetLabel = e.targetTitle
              ? `${e.targetArtist ? `${e.targetArtist} — ` : ''}${e.targetTitle}`
              : e.title
                ? `${e.artist ? `${e.artist} — ` : ''}${e.title}`
                : null;
            const matchLabel = e.matchedTitle
              ? `${e.matchedArtist ? `${e.matchedArtist} — ` : ''}${e.matchedTitle}`
              : e.videoId;

            return (
              <div key={e.videoId} className="group flex items-center gap-3 rounded-lg border border-white/[0.04] bg-base-900/30 px-3 py-2.5 transition-colors hover:border-white/[0.08]">
                <img
                  src={ytThumb(e.videoId)}
                  alt=""
                  className="h-8 w-14 flex-shrink-0 rounded object-cover"
                  loading="lazy"
                  onError={(ev) => { (ev.target as HTMLImageElement).style.display = 'none'; }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-white">
                    <span className="font-semibold text-white">{targetLabel || 'Target Track'}</span>
                    <span className="text-muted">➔</span>
                    <span className="inline-flex items-center gap-1 rounded border border-red-500/20 bg-red-500/10 px-1.5 py-0.5 font-mono text-[11px] text-red-400">
                      <Ban size={11} className="text-red-400" />
                      {matchLabel}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted mt-1">
                    <span>YouTube ID: <code className="font-mono text-[10px] text-soft">{e.videoId}</code></span>
                    <span>· Blacklisted {formatRelative(e.failedAt)}</span>
                  </div>
                </div>
                <button
                  onClick={() => clearOne(e.videoId)}
                  className="flex-shrink-0 rounded-md p-1.5 text-muted opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                  title="Remove from blacklist"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Audio Cache Browser ───────────────────────────────────────────────────────

function AudioCachePanel() {
  const [files, setFiles] = useState<Array<{ videoId: string; filename: string; path: string; bytes: number; cachedAt: number; format: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await debugApi.listAudioCache();
      setFiles(res.files);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const confirmAction = useConfirmAction();

  const clearOne = (videoId: string) => {
    confirmAction({
      title: 'Delete Cached Audio',
      message: `Delete cached audio file for video ID "${videoId}"?`,
      confirmText: 'Delete Audio',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await debugApi.clearAudioCacheEntry(videoId);
          setFiles((prev) => prev.filter((f) => f.videoId !== videoId));
        } catch (err) {
          setError((err as Error).message);
        }
      },
    });
  };

  const totalBytes = files.reduce((sum, f) => sum + f.bytes, 0);

  const filtered = files.filter((f) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return f.videoId.toLowerCase().includes(q) || f.filename.toLowerCase().includes(q);
  });

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="surface-panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HardDrive size={16} className="text-violet-400" />
          <h2 className="text-base font-semibold text-white">Audio File Cache</h2>
          <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-xs text-soft">
            {files.length} files · {formatBytes(totalBytes)}
          </span>
        </div>
        <button onClick={refresh} disabled={loading} className="btn-ghost" title="Refresh">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="mb-3">
        <input
          className="input-base"
          placeholder="Filter by video ID or filename..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {error && (
        <div className="mb-3 flex items-center gap-1.5 text-sm text-red-400">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <div className="max-h-[50vh] space-y-1.5 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted">
            {files.length === 0 ? 'No cached audio files.' : 'No files match filter.'}
          </div>
        ) : (
          filtered.map((f) => (
            <div key={f.filename} className="group flex items-center gap-3 rounded-lg border border-white/[0.04] bg-base-900/30 px-3 py-2 transition-colors hover:border-white/[0.08]">
              <img
                src={ytThumb(f.videoId)}
                alt=""
                className="h-8 w-14 flex-shrink-0 rounded object-cover"
                loading="lazy"
                onError={(ev) => { (ev.target as HTMLImageElement).style.display = 'none'; }}
              />
              <div className="min-w-0 flex-1">
                <code className="truncate font-mono text-xs text-soft">{f.videoId}</code>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                  <span className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-soft">{f.format}</span>
                  <span>{formatBytes(f.bytes)}</span>
                  <span>· {formatRelative(f.cachedAt)}</span>
                </div>
              </div>
              <button
                onClick={() => clearOne(f.videoId)}
                className="flex-shrink-0 rounded-md p-1.5 text-muted opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                title="Delete cached file"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Request Log Viewer ────────────────────────────────────────────────────────

function RequestLogPanel() {
  const [entries, setEntries] = useState<Array<{ id: number; method: string; url: string; statusCode: number; durationMs: number; timestamp: number; error?: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [filter, setFilter] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await debugApi.getRequestLog(200);
      setEntries(res.entries);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [autoRefresh, refresh]);

  const confirmAction = useConfirmAction();

  const clearLog = () => {
    confirmAction({
      title: 'Clear Request Log',
      message: 'Clear all recorded HTTP request log entries?',
      confirmText: 'Clear Log',
      variant: 'warning',
      onConfirm: async () => {
        try {
          await debugApi.clearRequestLog();
          setEntries([]);
        } catch (err) {
          setError((err as Error).message);
        }
      },
    });
  };

  function statusColor(code: number): string {
    if (code < 300) return 'text-emerald-400';
    if (code < 400) return 'text-sky-400';
    if (code < 500) return 'text-amber-400';
    return 'text-red-400';
  }

  function methodColor(method: string): string {
    if (method === 'GET') return 'text-sky-400 bg-sky-500/10 border-sky-500/20';
    if (method === 'POST') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    if (method === 'DELETE') return 'text-red-400 bg-red-500/10 border-red-500/20';
    if (method === 'PUT' || method === 'PATCH') return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    return 'text-soft bg-white/[0.04] border-white/[0.08]';
  }

  const filtered = entries.filter((e) => {
    if (!filter) return true;
    return e.url.toLowerCase().includes(filter.toLowerCase()) || e.method.toLowerCase().includes(filter.toLowerCase());
  });

  return (
    <div className="surface-panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wifi size={16} className="text-sky-400" />
          <h2 className="text-base font-semibold text-white">Request Log</h2>
          <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-xs text-soft">{entries.length} entries</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              autoRefresh
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                : 'border-base-600 text-muted hover:text-soft'
            }`}
          >
            <Activity size={13} />
            {autoRefresh ? 'Live' : 'Paused'}
          </button>
          <button onClick={refresh} disabled={loading} className="btn-ghost" title="Refresh">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={clearLog}
            disabled={entries.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-40"
          >
            <Trash2 size={13} /> Clear
          </button>
        </div>
      </div>

      <div className="mb-3">
        <input
          className="input-base"
          placeholder="Filter by URL or method..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {error && (
        <div className="mb-3 flex items-center gap-1.5 text-sm text-red-400">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <div className="max-h-[50vh] space-y-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted">No requests logged yet.</div>
        ) : (
          filtered.map((e) => (
            <div key={e.id} className="flex items-center gap-2.5 rounded-lg border border-white/[0.04] bg-base-900/30 px-3 py-1.5 text-xs">
              <span className={`flex-shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium ${methodColor(e.method)}`}>
                {e.method}
              </span>
              <span className={`flex-shrink-0 font-mono text-[11px] font-semibold tabular-nums ${statusColor(e.statusCode)}`}>
                {e.statusCode}
              </span>
              <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-soft">{e.url}</code>
              <span className="flex-shrink-0 font-mono text-[11px] text-muted tabular-nums">{e.durationMs}ms</span>
              <span className="flex-shrink-0 text-[10px] text-muted">{formatRelative(e.timestamp)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Queue State Inspector ─────────────────────────────────────────────────────

function QueueInspector() {
  const queue = usePlayerStore((s) => s.queue);
  const queueIndex = usePlayerStore((s) => s.queueIndex);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const repeat = usePlayerStore((s) => s.repeat);
  const isAutoQueueLoading = usePlayerStore((s) => s.isAutoQueueLoading);

  const upcoming = queue.slice(queueIndex + 1, queueIndex + 21);
  const autoqueueCount = queue.filter((t) => t.queueSource === 'autoqueue').length;
  const manualCount = queue.length - autoqueueCount;

  return (
    <div className="surface-panel p-5">
      <div className="mb-4 flex items-center gap-2">
        <List size={16} className="text-accent" />
        <h2 className="text-base font-semibold text-white">Queue Inspector</h2>
      </div>

      <div className="mb-4 grid gap-x-6 gap-y-0 sm:grid-cols-2">
        <StatusRow label="Queue length" value={queue.length} />
        <StatusRow label="Current index" value={queueIndex} />
        <StatusRow label="Manual tracks" value={manualCount} />
        <StatusRow label="Autoqueue tracks" value={autoqueueCount} tone="muted" />
        <StatusRow label="Shuffle" value={shuffle ? 'On' : 'Off'} tone={shuffle ? 'ok' : 'muted'} />
        <StatusRow label="Repeat" value={repeat} tone={repeat !== 'off' ? 'ok' : 'muted'} />
        <StatusRow label="Autoqueue loading" value={isAutoQueueLoading ? 'Loading...' : 'Idle'} tone={isAutoQueueLoading ? 'warn' : 'muted'} />
      </div>

      {currentTrack && (
        <div className="mb-4">
          <div className="section-label mb-2">Now Playing</div>
          <div className="flex items-center gap-3 rounded-lg border border-accent/20 bg-accent/[0.03] px-3 py-2">
            <img
              src={currentTrack.thumbnail}
              alt=""
              className="h-9 w-9 rounded object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-white">{currentTrack.title}</div>
              <div className="truncate text-xs text-muted">{currentTrack.artist}</div>
            </div>
            {currentTrack.queueSource && (
              <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-muted">{currentTrack.queueSource}</span>
            )}
          </div>
        </div>
      )}

      {upcoming.length > 0 && (
        <div>
          <div className="section-label mb-2">Upcoming ({Math.min(upcoming.length, 20)} of {queue.length - queueIndex - 1})</div>
          <div className="max-h-[40vh] space-y-1 overflow-y-auto">
            {upcoming.map((t, i) => (
              <div key={`${t.id}-${i}`} className="flex items-center gap-2.5 rounded-lg border border-white/[0.04] bg-base-900/30 px-3 py-1.5">
                <span className="flex-shrink-0 rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-muted">#{queueIndex + i + 2}</span>
                <img
                  src={t.thumbnail}
                  alt=""
                  className="h-7 w-7 flex-shrink-0 rounded object-cover"
                  loading="lazy"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs text-white">{t.title}</div>
                  <div className="truncate text-[11px] text-muted">{t.artist}</div>
                </div>
                {t.queueSource && (
                  <span className={`flex-shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                    t.queueSource === 'autoqueue'
                      ? 'border-violet-500/20 bg-violet-500/10 text-violet-400'
                      : 'border-white/[0.08] bg-white/[0.04] text-muted'
                  }`}>{t.queueSource}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── ML Model Inspector ────────────────────────────────────────────────────────

function MlModelPanel() {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const [stats, setStats] = useState<{ playLogCount: number; uniqueTracksCount: number; transitionPairsCount: number; lastTrainedAt: number; isReady: boolean; hasSeedModel: boolean; seedTrackCount: number } | null>(null);
  const [telemetrySubmission, setTelemetrySubmission] = useState<{ key: string; deleteToken: string; submittedAt: number; tracksCount: number; transitionsCount: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingTelemetry, setDeletingTelemetry] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [predictions, setPredictions] = useState<Array<{ track: any; transitionScore: number; metadataScore: number; playCountScore: number; recencyScore: number; nightBonus: number; totalScore: number }>>([]);

  const fetchTelemetryStatus = useCallback(async () => {
    try {
      const res = await debugApi.getMlTelemetryStatus();
      if (res.hasSubmission && res.submission) {
        setTelemetrySubmission(res.submission);
      } else {
        setTelemetrySubmission(null);
      }
    } catch {}
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [mlRes] = await Promise.all([
        debugApi.getMlStatus(),
        fetchTelemetryStatus(),
      ]);
      setStats(mlRes.stats);
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }, [fetchTelemetryStatus]);

  useEffect(() => { refresh(); }, [refresh]);

  const confirmAction = useConfirmAction();

  const handleImportProd = () => {
    confirmAction({
      title: 'Import Production Dataset',
      message: 'Import tracks and play history from Noctune Prod AppData?',
      confirmText: 'Import Dataset',
      variant: 'purple',
      onConfirm: async () => {
        setImporting(true);
        setMsg(null);
        try {
          const res = await debugApi.importProdDataset();
          setMsg({ ok: true, text: `Successfully imported ${res.importedTracks} tracks and ${res.totalPlays} play events from Noctune Prod!` });
          await refresh();
        } catch (err) {
          setMsg({ ok: false, text: (err as Error).message });
        } finally {
          setImporting(false);
        }
      },
    });
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleImportTelemetryFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        setImporting(true);
        setMsg(null);
        const res = await debugApi.importMlTelemetry(parsed);
        setMsg({
          ok: true,
          text: `Successfully imported telemetry: ${res.importedTracks} tracks & ${res.importedTransitions} transition pairs (${res.totalLogEvents} total log events)!`,
        });
        await refresh();
      } catch (err) {
        setMsg({ ok: false, text: `Invalid telemetry JSON: ${(err as Error).message}` });
      } finally {
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleContributeDataset = () => {
    confirmAction({
      title: 'Submit Telemetry Contribution',
      message: "Submit anonymous listening dataset contribution to Cloudflare worker to help train Noctune's base recommendation model? A unique delete token will be saved locally so you can retract or delete your submission anytime.",
      confirmText: 'Submit Telemetry',
      variant: 'emerald',
      onConfirm: async () => {
        setSubmitting(true);
        setMsg(null);
        try {
          const res = await debugApi.submitMlTelemetry();
          setMsg({ ok: true, text: `Thank you! Successfully submitted ${res.tracksCount} tracks and ${res.transitionsCount} transition pairs to Cloudflare Worker!` });
          await fetchTelemetryStatus();
        } catch (err) {
          setMsg({ ok: false, text: (err as Error).message });
        } finally {
          setSubmitting(false);
        }
      },
    });
  };

  const handleDeleteTelemetry = () => {
    if (!telemetrySubmission) return;
    confirmAction({
      title: 'Delete Uploaded Telemetry',
      message: `Are you sure you want to permanently delete your telemetry contribution (${telemetrySubmission.key}) from the Cloudflare dataset collector? This uses your device's private delete token.`,
      confirmText: 'Delete Upload',
      variant: 'danger',
      onConfirm: async () => {
        setDeletingTelemetry(true);
        setMsg(null);
        try {
          await debugApi.deleteMlTelemetry();
          setMsg({ ok: true, text: 'Successfully deleted your telemetry submission from Cloudflare dataset collector.' });
          setTelemetrySubmission(null);
        } catch (err) {
          setMsg({ ok: false, text: (err as Error).message });
        } finally {
          setDeletingTelemetry(false);
        }
      },
    });
  };

  const handleCopyDeleteToken = () => {
    if (!telemetrySubmission?.deleteToken) return;
    navigator.clipboard.writeText(telemetrySubmission.deleteToken);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const handleClearDataset = () => {
    confirmAction({
      title: 'Clear ML Dataset',
      message: 'Are you sure you want to clear all recorded ML play log history and reset recommendation model to baseline?',
      confirmText: 'Clear Dataset',
      variant: 'danger',
      onConfirm: async () => {
        setImporting(true);
        setMsg(null);
        try {
          await debugApi.clearMlDataset();
          setMsg({ ok: true, text: 'Cleared ML play log dataset and reset recommendation model to baseline.' });
          setPredictions([]);
          await refresh();
        } catch (err) {
          setMsg({ ok: false, text: (err as Error).message });
        } finally {
          setImporting(false);
        }
      },
    });
  };

  const handleTestPredictions = async () => {
    if (!currentTrack) {
      setMsg({ ok: false, text: 'No track currently playing to use as seed.' });
      return;
    }
    setTesting(true);
    setMsg(null);
    try {
      const res = await debugApi.testMlRecommendation(currentTrack, 8);
      setPredictions(res.predictions);
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="surface-panel p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Brain size={16} className="text-purple-400" />
          <h2 className="text-base font-semibold text-white">ML Recommendation Model</h2>
          <span className={`rounded-md border px-2 py-0.5 font-mono text-xs ${stats?.isReady ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400' : 'border-amber-500/20 bg-amber-500/10 text-amber-400'}`}>
            {stats?.isReady ? 'Model Active' : 'Cold Start'}
          </span>
          {stats?.hasSeedModel && (
            <span className="rounded-md border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 font-mono text-xs text-purple-300" title="Pre-trained seed model + locally learned tracks from your listening history">
              Trained Dataset ({stats.seedTrackCount.toLocaleString()} tracks)
            </span>
          )}
          <button
            type="button"
            onClick={() => openExternalUrl('https://noctune-dataset-collector.caya8205.workers.dev').catch(console.error)}
            className="flex items-center gap-1.5 rounded-md border border-white/10 bg-base-900/60 px-2 py-0.5 text-xs font-medium text-soft hover:border-white/20 hover:text-white transition-colors"
            title="Open Cloudflare Dataset Collector Web Dashboard"
          >
            <ExternalLink size={11} className="text-muted" />
            <span>Collector Dashboard</span>
          </button>
        </div>
        <button onClick={refresh} disabled={loading} className="btn-ghost" title="Refresh ML Status">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {msg && (
        <div className={`flex items-center gap-1.5 text-xs ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>
          {msg.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {msg.text}
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-white/[0.04] bg-base-900/30 p-3">
            <span className="text-[11px] text-muted">Recorded Play Events</span>
            <div className="mt-1 font-mono text-base font-semibold text-white">{stats.playLogCount.toLocaleString()}</div>
          </div>
          <div className="rounded-lg border border-white/[0.04] bg-base-900/30 p-3">
            <span className="text-[11px] text-muted">Unique Learned Tracks</span>
            <div className="mt-1 font-mono text-base font-semibold text-white">{stats.uniqueTracksCount.toLocaleString()}</div>
          </div>
          <div className="rounded-lg border border-white/[0.04] bg-base-900/30 p-3">
            <span className="text-[11px] text-muted">Transition Pair Matrix</span>
            <div className="mt-1 font-mono text-base font-semibold text-white">{stats.transitionPairsCount.toLocaleString()}</div>
          </div>
          <div className="rounded-lg border border-white/[0.04] bg-base-900/30 p-3">
            <span className="text-[11px] text-muted">ML Approach</span>
            <div className="mt-1 font-mono text-xs font-semibold text-purple-300">Hybrid Collaborative</div>
          </div>
        </div>
      )}

      {/* Live ML Recommendation Sandbox */}
      <div className="border-t border-white/[0.06] pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <span className="text-xs font-semibold text-white flex items-center gap-2">
            <Terminal size={14} className="text-accent" /> Live ML Recommendation Sandbox
          </span>
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              accept=".json"
              onChange={handleImportTelemetryFile}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-semibold text-blue-300 transition-colors hover:bg-blue-500/20 disabled:opacity-40"
              title="Import telemetry JSON file or full seed-model.json from Cloudflare KV Collector to update persistent Roaming seed-model.json"
            >
              <FileText size={13} /> Import Telemetry JSON
            </button>
            <button
              onClick={handleContributeDataset}
              disabled={submitting || importing}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-40"
              title="Submit anonymous listening dataset to help train Noctune's next base model"
            >
              {submitting ? <RefreshCw size={13} className="animate-spin" /> : <UploadCloud size={13} />}
              {submitting ? 'Submitting...' : 'Help Improve ML Model'}
            </button>
            <button
              onClick={handleImportProd}
              disabled={importing}
              className="flex items-center gap-1.5 rounded-lg border border-purple-500/20 bg-purple-500/5 px-3 py-1.5 text-xs font-medium text-purple-300 transition-colors hover:bg-purple-500/10 disabled:opacity-40"
              title="Import tracks & play history from songs.json into play-log.json in AppData Roaming (does not alter seed-model.json)"
            >
              {importing ? <RefreshCw size={13} className="animate-spin" /> : <HardDrive size={13} />}
              {importing ? 'Importing...' : 'Import Prod Dataset'}
            </button>
            <button
              onClick={handleClearDataset}
              disabled={importing}
              className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-40"
              title="Clear all recorded play events and reset ML dataset"
            >
              <Trash2 size={13} /> Clear Dataset
            </button>
            <button
              onClick={handleTestPredictions}
              disabled={testing || !currentTrack}
              className="flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-40"
            >
              {testing ? <RefreshCw size={13} className="animate-spin" /> : <RotateCw size={13} />}
              {testing ? 'Predicting...' : 'Test ML Predictions'}
            </button>
          </div>
        </div>

        <div className="mb-3 rounded-lg border border-white/[0.04] bg-base-950/40 p-2.5 text-[11px] leading-relaxed text-muted space-y-1">
          <p><strong className="text-blue-300">• Import Telemetry JSON:</strong> Accepts telemetry export files (e.g., <code className="rounded bg-blue-500/10 px-1 py-0.5 font-mono text-blue-200 border border-blue-500/20">telemetry_xxx_xxx.json</code>) or full <code className="rounded bg-blue-500/10 px-1 py-0.5 font-mono text-blue-200 border border-blue-500/20">seed-model.json</code>. Merges transitions & saves directly to persistent Roaming <code className="rounded bg-blue-500/10 px-1 py-0.5 font-mono text-blue-200 border border-blue-500/20">seed-model.json</code>.</p>
          <p><strong className="text-purple-300">• Import Prod Dataset:</strong> Extracts track history & play counts from local <code className="rounded bg-purple-500/10 px-1 py-0.5 font-mono text-purple-200 border border-purple-500/20">songs.json</code> into <code className="rounded bg-purple-500/10 px-1 py-0.5 font-mono text-purple-200 border border-purple-500/20">play-log.json</code> in Roaming (does not generate or alter <code className="rounded bg-purple-500/10 px-1 py-0.5 font-mono text-purple-200 border border-purple-500/20">seed-model.json</code>).</p>
        </div>

        {telemetrySubmission && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <UploadCloud size={16} className="text-emerald-400 shrink-0" />
              <div className="min-w-0 text-soft">
                <div>
                  <span className="font-semibold text-white">Your Uploaded Telemetry:</span>{' '}
                  <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[11px] text-emerald-300 border border-emerald-500/20">
                    {telemetrySubmission.key}
                  </code>
                </div>
                <div className="mt-0.5 text-[11px] text-muted">
                  {telemetrySubmission.tracksCount.toLocaleString()} tracks · {telemetrySubmission.transitionsCount.toLocaleString()} transitions · Submitted {new Date(telemetrySubmission.submittedAt).toLocaleDateString()}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyDeleteToken}
                className="flex items-center gap-1 rounded-md border border-white/10 bg-base-900/60 px-2.5 py-1.5 text-xs font-medium text-soft hover:text-white transition-colors"
                title="Copy secret delete token for this submission"
              >
                <Copy size={12} /> {copiedToken ? 'Copied Token!' : 'Copy Delete Token'}
              </button>
              <button
                onClick={handleDeleteTelemetry}
                disabled={deletingTelemetry}
                className="flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/20 transition-colors disabled:opacity-40"
                title="Delete this submission from Cloudflare dataset collector using your device delete token"
              >
                <Trash2 size={12} /> {deletingTelemetry ? 'Deleting...' : 'Delete My Upload'}
              </button>
            </div>
          </div>
        )}

        {currentTrack && (
          <div className="mb-3 text-xs text-soft">
            Seed Track: <strong className="text-white">{currentTrack.title}</strong> — {currentTrack.artist}
          </div>
        )}

        {predictions.length > 0 && (
          <div className="space-y-2">
            <span className="text-[11px] text-muted">Top ML Predicted Recommendations ({predictions.length}):</span>
            {predictions.map((p, i) => (
              <div key={p.track.id || i} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-base-900/40 p-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-white">
                    {p.track.title} <span className="text-muted">— {p.track.artist}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted font-mono">
                    <span className="rounded bg-accent/10 text-accent border border-accent/20 px-1.5 py-0.5 font-bold">
                      Score: {(p.totalScore * 100).toFixed(1)}%
                    </span>
                    <span>Trans: {(p.transitionScore * 100).toFixed(0)}%</span>
                    <span>Meta: {(p.metadataScore * 100).toFixed(0)}%</span>
                    <span>Plays: {(p.playCountScore * 100).toFixed(0)}%</span>
                    {p.nightBonus > 0 && <span className="text-purple-300">Night +{(p.nightBonus * 100).toFixed(0)}%</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tools Panel (combines all tool panels) ────────────────────────────────────

function ToolsPanel() {
  return (
    <div className="space-y-4">
      <MlModelPanel />
      <BlacklistPanel />
      <AudioCachePanel />
      <RequestLogPanel />
      <QueueInspector />
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function DebugApp() {
  const [tab, setTab] = useState<Tab>('resolver');
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<ConfirmConfig | null>(null);
  const setView = usePlayerStore((state) => state.setView);

  const confirmAction = useCallback((config: ConfirmConfig) => {
    setConfirmConfig(config);
  }, []);

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
    { id: 'resolver', label: 'Resolver', icon: Terminal },
    { id: 'lyrics', label: 'Lyrics', icon: FileText },
    { id: 'status', label: 'Status', icon: Activity },
    { id: 'tools', label: 'Tools', icon: Database },
  ];

  return (
    <ConfirmContext.Provider value={confirmAction}>
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
            {tab === 'lyrics' && <LyricsPanel />}
            {tab === 'status' && <StatusPanel />}
            {tab === 'tools' && <ToolsPanel />}
          </div>
        </div>

        {confirmConfig && (
          <ConfirmModal config={confirmConfig} onClose={() => setConfirmConfig(null)} />
        )}
      </div>
    </ConfirmContext.Provider>
  );
}
