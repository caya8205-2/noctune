import { useState } from 'react';
import { GripVertical, ListOrdered, X } from 'lucide-react';
import { usePlayerStore } from '../../store/player';
import { formatDuration } from '../../utils/format';
import { clsx } from 'clsx';

export function QueueView() {
  const { queue, queueIndex, currentTrack, playTrack, clearQueue, reorderQueue } = usePlayerStore();
  const [dragIndex, setDragIndex] = useState<number | null>(null);

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
      <div className="flex items-center justify-between px-9 pt-8 pb-5">
        <div>
          <p className="section-label text-accent">Queue</p>
          <h1 className="text-4xl font-bold text-white leading-tight mt-2">Up next.</h1>
          <p className="text-xs text-muted mt-2">{queue.length} tracks in rotation</p>
        </div>
        <button onClick={clearQueue} className="btn-ghost text-xs gap-1.5 px-2">
          <X size={12} /> Clear
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-7 pb-6">
        {queue.map((track, i) => {
          const isActive = currentTrack?.id === track.id || currentTrack?.spotifyId === track.spotifyId;
          const isPast = i < queueIndex;

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
                isPast && 'opacity-40',
                dragIndex === i && 'opacity-50'
              )}
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
