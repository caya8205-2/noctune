import { ListOrdered, X } from 'lucide-react';
import { usePlayerStore } from '../../store/player';
import { formatDuration } from '../../utils/format';
import { clsx } from 'clsx';

export function QueueView() {
  const { queue, queueIndex, currentTrack, playTrack, clearQueue } = usePlayerStore();

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
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <div>
          <p className="section-label">Queue</p>
          <p className="text-xs text-muted mt-1">{queue.length} tracks in rotation</p>
        </div>
        <button onClick={clearQueue} className="btn-ghost text-xs gap-1.5 px-2">
          <X size={12} /> Clear
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {queue.map((track, i) => {
          const isActive = currentTrack?.id === track.id || currentTrack?.spotifyId === track.spotifyId;
          const isPast = i < queueIndex;

          return (
            <div
              key={`${track.id}-${track.spotifyId ?? 'yt'}-${i}`}
              className={clsx('track-row group', isActive && 'active', isPast && 'opacity-40')}
              onDoubleClick={() => playTrack(track, queue)}
            >
              <span className="w-5 text-xs text-muted text-right flex-shrink-0">{i + 1}</span>
              <img
                src={track.thumbnail}
                alt=""
                className="w-9 h-9 rounded-lg object-cover flex-shrink-0"
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />
              <div className="flex-1 min-w-0">
                <p
                  className={clsx(
                    'text-sm truncate',
                    isActive ? 'text-accent font-medium' : 'text-white'
                  )}
                >
                  {track.title}
                </p>
                <p className="text-xs text-muted truncate">{track.artist}</p>
              </div>
              <span className="text-xs font-mono text-muted flex-shrink-0">
                {formatDuration(track.duration)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
