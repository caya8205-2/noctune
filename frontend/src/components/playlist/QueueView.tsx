import { ListOrdered, X } from 'lucide-react';
import { usePlayerStore } from '../../store/player';
import { formatDuration } from '../../utils/format';
import { clsx } from 'clsx';

export function QueueView() {
  const { queue, queueIndex, currentTrack, playTrack, clearQueue } = usePlayerStore();

  if (queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted px-6">
        <ListOrdered size={40} strokeWidth={1} />
        <p className="text-sm">Queue is empty</p>
        <p className="text-xs text-center">Search for songs and double-click to add them to the queue</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">
          Queue — {queue.length} tracks
        </h2>
        <button onClick={clearQueue} className="btn-ghost text-xs gap-1.5 px-2">
          <X size={12} /> Clear
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {queue.map((track, i) => {
          const isActive = currentTrack?.id === track.id;
          const isPast = i < queueIndex;

          return (
            <div
              key={`${track.id}-${i}`}
              className={clsx(
                'track-row',
                isActive && 'active',
                isPast && 'opacity-40'
              )}
              onDoubleClick={() => playTrack(track, queue)}
            >
              <span className="w-5 text-xs text-muted text-right flex-shrink-0">{i + 1}</span>
              <img
                src={track.thumbnail}
                alt=""
                className="w-8 h-8 rounded-md object-cover flex-shrink-0"
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />
              <div className="flex-1 min-w-0">
                <p className={clsx(
                  'text-sm truncate',
                  isActive ? 'text-accent font-medium' : 'text-white'
                )}>
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
