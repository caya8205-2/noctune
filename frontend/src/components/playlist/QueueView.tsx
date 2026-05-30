import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, EyeOff, GripVertical, ListOrdered, Loader2, Shuffle, X } from 'lucide-react';
import { usePlayerStore } from '../../store/player';
import { formatDuration } from '../../utils/format';
import { clsx } from 'clsx';
import { LikeButton } from '../player/LikeButton';
import { api, type Track } from '../../utils/api';

function queueSourceLabel(source: Track['queueSource']): string {
  if (source === 'manual') return 'Manual';
  if (source === 'playlist') return 'Playlist';
  if (source === 'autoqueue') return 'Autoqueue';
  if (source === 'recommendation') return 'Home';
  return 'Search';
}

function isMobileViewport(): boolean {
  return window.matchMedia('(max-width: 639px)').matches;
}

export function QueueView() {
  const {
    queue,
    queueIndex,
    currentTrack,
    playbackNotice,
    playTrack,
    clearQueue,
    removePlayedTracks,
    shuffleQueue,
    reorderQueue,
    removeFromQueue,
    dismissPlaybackNotice,
  } = usePlayerStore();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [hideFailed, setHideFailed] = useState(false);
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

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-7 pb-6">
        {playbackNotice && (
          <div className="max-w-3xl mb-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 flex items-center justify-between gap-3 text-xs text-red-200">
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
                'group max-w-3xl flex items-center px-4 py-2.5 rounded-lg border border-transparent hover:bg-base-800 hover:border-base-600/60 cursor-pointer transition-colors duration-100',
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
              <div className="flex-1 min-w-0">
                <p
                  className={clsx(
                    'text-sm truncate',
                    isActive ? 'text-accent font-medium' : track.playbackError ? 'text-red-300' : 'text-white'
                  )}
                >
                  {track.title}
                </p>
                <p className="text-xs text-muted truncate">
                  {track.playbackError ? track.playbackError : track.artist}
                </p>
              </div>
              {track.playbackError ? (
                <span className="hidden md:inline-flex w-20 items-center justify-center flex-shrink-0 mr-4 rounded-full border border-red-500/30 px-1 py-0.5 text-[10px] uppercase tracking-wide text-red-300">
                  <AlertTriangle size={10} className="mr-1" />
                  Failed
                </span>
              ) : cacheStatus?.cached || cacheStatus?.inFlight ? (
                <span className="hidden md:inline-flex w-20 items-center justify-center flex-shrink-0 mr-4 rounded-full border border-accent/30 px-1 py-0.5 text-[10px] uppercase tracking-wide text-accent">
                  {cacheStatus.cached ? (
                    <CheckCircle2 size={10} className="mr-1" />
                  ) : (
                    <Loader2 size={10} className="mr-1 animate-spin" />
                  )}
                  {cacheStatus.cached ? 'Cached' : 'Caching'}
                </span>
              ) : (
              <span className="hidden md:inline-flex w-20 items-center justify-center flex-shrink-0 mr-4 rounded-full border border-base-600/60 px-1 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                {queueSourceLabel(track.queueSource)}
              </span>
              )}
              <LikeButton track={track} className="hidden sm:flex ml-2 opacity-0 group-hover:opacity-100 transition-opacity" />
              <button
                className="hidden sm:flex btn-ghost p-1.5 ml-1 text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(event) => {
                  event.stopPropagation();
                  removeFromQueue(i);
                }}
                title="Remove from queue"
              >
                <X size={13} />
              </button>
              <span className="ml-2 block w-12 text-right text-xs font-mono tabular-nums text-muted flex-shrink-0">
                {formatDuration(track.duration)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
