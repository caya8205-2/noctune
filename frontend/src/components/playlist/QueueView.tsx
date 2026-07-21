import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock, EyeOff, GripVertical, House, ListMusic, ListOrdered, Loader2, Search, Shuffle, X } from 'lucide-react';
import { usePlayerStore } from '../../store/player';
import { formatDuration } from '../../utils/format';
import { clsx } from 'clsx';
import { api, type Track } from '../../utils/api';
import { TrackActionButtons } from '../ui/TrackActionButtons';
import { TrackTitle } from '../ui/TrackTitle';

function queueSourceBadge(source: Track['queueSource'], originalSource?: Track['originalSource']) {
  const effectiveSource = source === 'history' ? originalSource : source;
  if (effectiveSource === 'manual' || effectiveSource === 'play-next') return { Icon: ListOrdered, label: 'Manual' };
  if (effectiveSource === 'playlist') return { Icon: ListMusic, label: 'Playlist' };
  if (effectiveSource === 'autoqueue') return { Icon: Shuffle, label: 'Autoqueue' };
  if (effectiveSource === 'recommendation') return { Icon: House, label: 'Home' };
  if (source === 'history') return { Icon: Clock, label: 'History' };
  return { Icon: Search, label: 'Search' };
}

function isMobileViewport(): boolean {
  return window.matchMedia('(max-width: 639px)').matches;
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function QueueView() {
  const {
    queue,
    queueIndex,
    currentTrack,
    queueHistory,
    playbackNotice,
    playTrack,
    clearQueue,
    removePlayedTracks,
    shuffleQueue,
    reorderQueue,
    removeFromQueue,
    dismissPlaybackNotice,
    setView,
  } = usePlayerStore();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [hideFailed, setHideFailed] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const { data: audioCache } = useQuery({
    queryKey: ['audio-cache-status', queue.map((track) => track.id).join('|')],
    queryFn: () => api.audioCacheStatus(queue),
    enabled: queue.length > 0,
    refetchInterval: 10_000,
  });
  const cacheByTrackId = new Map((audioCache?.tracks ?? []).map((status) => [status.id, status]));

  if (queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted px-6">
        <div className="w-14 h-14 rounded-xl bg-base-800 border border-base-600/30 flex items-center justify-center">
          <ListOrdered size={30} strokeWidth={1.2} />
        </div>
        <p className="text-sm">Queue is empty</p>
        <p className="text-xs text-center max-w-xs">
          Choose a seed track from Search and Noctune will build the queue around it.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 pt-5 pb-4 sm:px-6 lg:px-9 lg:pt-8 lg:pb-5 gap-4">
        <div>
          <p className="section-label text-accent">Queue</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight mt-2">Up next.</h1>
          <p className="text-xs text-muted mt-2">
            {queue.length} tracks in rotation
            {queueIndex > 0 ? `, ${queueIndex} played` : ''}
          </p>
          <div className="flex items-center gap-3 mt-2 text-[10px] text-muted">
            <span className="flex items-center gap-1"><ListMusic size={10} /> Playlist</span>
            <span className="flex items-center gap-1"><Search size={10} /> Search</span>
            <span className="flex items-center gap-1"><House size={10} /> Home</span>
            <span className="flex items-center gap-1"><Shuffle size={10} /> Autoqueue</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={shuffleQueue} className="btn-ghost text-xs gap-1.5 px-2" title="Shuffle upcoming tracks">
            <Shuffle size={12} /> Shuffle
          </button>
          <button
            onClick={() => setHideFailed((value) => !value)}
            className={clsx('btn-ghost text-xs gap-1.5 px-2', hideFailed && 'text-accent')}
            title="Hide failed tracks"
          >
            <EyeOff size={12} /> Failed
          </button>
          <button
            onClick={removePlayedTracks}
            disabled={queueIndex <= 0}
            className="btn-ghost text-xs gap-1.5 px-2 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Remove tracks that already played"
          >
            <X size={12} /> Played
          </button>
          <button onClick={clearQueue} className="btn-ghost text-xs gap-1.5 px-2">
            <X size={12} /> Clear
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-9 pb-6">
        {playbackNotice && (
          <div className="mb-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 flex items-center justify-between gap-3 text-xs text-red-200">
            <span>{playbackNotice}</span>
            <button className="btn-ghost p-1 hover:text-white" onClick={dismissPlaybackNotice} title="Dismiss">
              <X size={12} />
            </button>
          </div>
        )}

        {queue.map((track, i) => {
          if (hideFailed && track.playbackError) return null;
          const isActive =
            currentTrack?.id === track.id ||
            Boolean(currentTrack?.spotifyId && track.spotifyId && currentTrack.spotifyId === track.spotifyId);
          const isPast = i < queueIndex;
          const cacheStatus = cacheByTrackId.get(track.id);

          return (
            <div
              key={`${track.id}-${track.spotifyId ?? 'yt'}-${i}`}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null) reorderQueue(dragIndex, i);
                setDragIndex(null);
              }}
              onDragEnd={() => setDragIndex(null)}
              className={clsx(
                'group flex items-center px-4 py-2.5 rounded-lg border border-transparent hover:bg-base-800 hover:border-base-600/60 cursor-pointer transition-colors duration-100',
                isActive && 'bg-base-700 ring-1 ring-accent/20 border-accent/20',
                track.playbackError && 'border-red-500/20 bg-red-500/5',
                isPast && 'opacity-40',
                dragIndex === i && 'opacity-50'
              )}
              onClick={() => {
                if (isMobileViewport()) playTrack(track, queue);
              }}
              onDoubleClick={() => playTrack(track, queue)}
            >
              <div
                className="w-4 mr-1 flex-shrink-0 flex items-center justify-center text-muted cursor-grab"
                title="Drag to reorder"
              >
                <GripVertical size={14} />
              </div>
              <span className="w-6 mr-3 text-xs text-muted text-center font-mono tabular-nums flex-shrink-0">
                {i + 1}
              </span>
              <img
                src={track.thumbnail}
                alt=""
                className="w-9 h-9 mr-3 rounded-lg object-cover flex-shrink-0"
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />
              <TrackTitle track={track} isActive={isActive} setView={setView} />
              <div className="hidden md:flex items-center justify-end gap-1.5 flex-shrink-0 mr-4">
                {track.playbackError ? (
                  <span className="inline-flex w-20 items-center justify-center rounded-full border border-red-500/30 px-1 py-0.5 text-[10px] uppercase tracking-wide text-red-300">
                    <AlertTriangle size={10} className="mr-1" />
                    Failed
                  </span>
                ) : cacheStatus?.cached || cacheStatus?.inFlight ? (
                  <span className="inline-flex w-20 items-center justify-center rounded-full border border-accent/30 px-1 py-0.5 text-[10px] uppercase tracking-wide text-accent">
                    {cacheStatus.cached ? (
                      <CheckCircle2 size={10} className="mr-1" />
                    ) : (
                      <Loader2 size={10} className="mr-1 animate-spin" />
                    )}
                    {cacheStatus.cached ? 'Cached' : 'Caching'}
                  </span>
                ) : null}
                {(() => {
                  const { Icon, label } = queueSourceBadge(track.queueSource, track.originalSource);
                  return (
                    <span
                      title={label}
                      aria-label={label}
                      className={clsx(
                        'inline-flex h-5 w-5 items-center justify-center rounded-md border',
                        cacheStatus?.prefetched
                          ? 'border-accent/40 bg-accent/15 text-accent'
                          : cacheStatus?.prefetching
                            ? 'border-accent/30 text-accent'
                            : 'border-base-600/60 text-muted'
                      )}
                    >
                      <Icon size={10} />
                    </span>
                  );
                })()}
              </div>
              <div className="flex flex-shrink-0 items-center gap-1">
                <TrackActionButtons
                  track={track}
                  className="hidden sm:flex items-center justify-end gap-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  iconSize={13}
                  showQueue={false}
                  showMenu={false}
                  trailingActions={
                    <button
                      type="button"
                      className="btn-ghost p-1.5 text-muted hover:text-red-400"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeFromQueue(i);
                      }}
                      title="Remove from queue"
                    >
                      <X size={13} />
                    </button>
                  }
                />
                <span className="block w-12 text-right text-xs font-mono tabular-nums text-muted flex-shrink-0">
                  {formatDuration(track.duration)}
                </span>
              </div>
            </div>
          );
        })}

        {/* ── Recently Played ────────────────────────────────────────── */}
        {queueHistory.length > 0 && (
          <div className="mt-8 border-t border-base-700/50 pt-4">
            <button
              onClick={() => setShowHistory((v) => !v)}
              className="flex items-center gap-2 text-xs text-muted hover:text-white transition-colors"
            >
              <Clock size={14} />
              <span>Recently Played ({queueHistory.length})</span>
              <span className="text-[10px]">{showHistory ? '▲' : '▼'}</span>
            </button>
            {showHistory && (
              <div className="mt-3 space-y-1">
                {queueHistory.slice(0, 10).map((entry, i) => (
                  <div
                    key={`${entry.track.id}-${entry.playedAt}`}
                    className="group flex items-center px-3 py-2 rounded-lg border border-transparent hover:bg-base-800 hover:border-base-600/60 cursor-pointer transition-colors duration-100"
                    onClick={() => playTrack(entry.track, queue, { queueSource: entry.track.queueSource })}
                  >
                    <span className="w-5 mr-2 text-xs text-muted text-center font-mono tabular-nums flex-shrink-0">
                      {i + 1}
                    </span>
                    {entry.track.thumbnail ? (
                      <img
                        src={entry.track.thumbnail}
                        alt=""
                        className="w-8 h-8 mr-2.5 rounded object-cover flex-shrink-0"
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                      />
                    ) : (
                      <div className="w-8 h-8 mr-2.5 rounded bg-base-700 border border-base-600/60 flex items-center justify-center text-muted flex-shrink-0">
                        <Clock size={12} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm text-soft">{entry.track.title}</p>
                      <p className="truncate text-xs text-muted">{entry.track.artist}</p>
                    </div>
                    <span className="text-[10px] text-muted flex-shrink-0 ml-2">
                      {formatTimeAgo(entry.playedAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
