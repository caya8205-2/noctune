import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, EyeOff, GripVertical, ListOrdered, Loader2, Shuffle, X, Zap } from 'lucide-react';
import { usePlayerStore } from '../../store/player';
import { formatDuration } from '../../utils/format';
import { clsx } from 'clsx';
import { api, type Track } from '../../utils/api';
import { TrackActionButtons } from '../ui/TrackActionButtons';

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

function QueueTrackTitle({
  track,
  isActive,
  setView,
}: {
  track: Track;
  isActive: boolean;
  setView: ReturnType<typeof usePlayerStore.getState>['setView'];
}) {
  const needsSpotifyNavigation = Boolean(track.spotifyId && (!track.albumId || !track.artistId));
  const { data: spotifyMetadata } = useQuery({
    queryKey: ['spotify-metadata', track.spotifyId],
    queryFn: () => api.spotifyMetadata(track.spotifyId!),
    enabled: needsSpotifyNavigation,
    staleTime: 1000 * 60 * 60,
  });
  const albumViewId = track.albumId ?? spotifyMetadata?.album.id;
  const artistViewId = track.artistId ?? spotifyMetadata?.artists[0]?.id;

  return (
    <div className="flex min-w-0 flex-1 flex-col items-start">
      {albumViewId ? (
        <button
          type="button"
          className={clsx(
            'max-w-full truncate text-left text-sm transition-colors hover:text-accent',
            isActive ? 'font-medium text-accent' : track.playbackError ? 'text-red-300' : 'text-white'
          )}
          onClick={(event) => {
            event.stopPropagation();
            setView('album', albumViewId);
          }}
          title={`Go to album: ${track.album ?? spotifyMetadata?.album.name ?? track.title}`}
        >
          {track.title}
        </button>
      ) : (
        <p
          className={clsx(
            'max-w-full truncate text-sm',
            isActive ? 'font-medium text-accent' : track.playbackError ? 'text-red-300' : 'text-white'
          )}
        >
          {track.title}
        </p>
      )}
      {track.playbackError ? (
        <p className="max-w-full truncate text-xs text-muted">{track.playbackError}</p>
      ) : artistViewId ? (
        <button
          type="button"
          className="mt-0.5 max-w-full truncate text-left text-xs text-muted transition-colors hover:text-accent"
          onClick={(event) => {
            event.stopPropagation();
            setView('artist', artistViewId);
          }}
          title={`Go to artist: ${track.artist}`}
        >
          {track.artist}
        </button>
      ) : (
        <p className="max-w-full truncate text-xs text-muted">{track.artist}</p>
      )}
    </div>
  );
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
    setView,
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
              <QueueTrackTitle track={track} isActive={isActive} setView={setView} />
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
                <span
                  className={clsx(
                    'inline-flex w-24 items-center justify-center rounded-full border px-1 py-0.5 text-[10px] uppercase tracking-wide',
                    cacheStatus?.prefetched
                      ? 'border-accent/40 bg-accent/15 text-accent'
                      : cacheStatus?.prefetching
                        ? 'border-accent/30 text-accent'
                        : 'border-base-600/60 text-muted'
                  )}
                >
                  {cacheStatus?.prefetched ? (
                    <Zap size={10} className="mr-1" />
                  ) : cacheStatus?.prefetching ? (
                    <Loader2 size={10} className="mr-1 animate-spin" />
                  ) : null}
                  {queueSourceLabel(track.queueSource)}
                </span>
              </div>
              <div className="flex flex-shrink-0 items-center gap-1">
                <TrackActionButtons
                  track={track}
                  className="hidden sm:flex items-center justify-end gap-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  iconSize={13}
                  showQueue={false}
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
      </div>
    </div>
  );
}
