import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock3, ListPlus, Music2, Play, X } from 'lucide-react';
import { clsx } from 'clsx';
import { api, type Track } from '../../utils/api';
import { formatDuration } from '../../utils/format';
import { usePlayerStore } from '../../store/player';
import { LikeButton } from '../player/LikeButton';

function playedLabel(value?: number): string {
  if (!value) return 'Unknown';
  const diff = Date.now() - value;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'Just now';
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < day * 7) return `${Math.floor(diff / day)}d ago`;
  return new Date(value).toLocaleDateString();
}

export function HistoryView() {
  const { currentTrack, isPlaying, playTrack, addToQueue } = usePlayerStore();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['history'],
    queryFn: api.history,
  });
  const tracks = data?.tracks ?? [];

  function handlePlay(track: Track) {
    playTrack(track, [track], { autoQueue: true, queueSource: 'recommendation' });
  }

  async function handleClearHistory() {
    await api.clearHistory();
    qc.invalidateQueries({ queryKey: ['history'] });
    qc.invalidateQueries({ queryKey: ['home'] });
  }

  async function handleRemoveHistoryItem(track: Track) {
    await api.removeHistoryItem(track.id);
    qc.invalidateQueries({ queryKey: ['history'] });
    qc.invalidateQueries({ queryKey: ['home'] });
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-9 pt-8 pb-5 flex items-end justify-between gap-4">
        <div>
          <p className="section-label text-accent">History</p>
          <h1 className="text-4xl font-bold text-white leading-tight mt-2">Recently played.</h1>
          <p className="text-xs text-muted mt-2">
            {isLoading ? 'Loading playback history' : `${tracks.length} tracks from local playback`}
          </p>
        </div>
        {tracks.length > 0 && (
          <button onClick={handleClearHistory} className="btn-ghost text-xs gap-1.5 px-2">
            <X size={12} /> Clear
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-7 pb-6">
        {!isLoading && tracks.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted">
            <div className="w-14 h-14 rounded-xl bg-base-800 border border-base-600/30 flex items-center justify-center">
              <Clock3 size={28} strokeWidth={1.2} />
            </div>
            <p className="text-sm">Played tracks will appear here.</p>
          </div>
        )}

        {tracks.map((track, i) => {
          const isActive =
            currentTrack?.id === track.id ||
            Boolean(currentTrack?.spotifyId && track.spotifyId && currentTrack.spotifyId === track.spotifyId);
          return (
            <div
              key={`${track.id}-${track.spotifyId ?? 'history'}-${i}`}
              className={clsx(
                'track-row group animate-fade-in max-w-3xl',
                isActive && 'active'
              )}
              style={{ animationDelay: `${i * 20}ms` }}
              onDoubleClick={() => handlePlay(track)}
            >
              <div className="w-6 flex-shrink-0 flex items-center justify-center">
                {isActive && isPlaying ? (
                  <div className="flex gap-0.5 items-end h-3">
                    {[0, 1, 2].map((j) => (
                      <div
                        key={j}
                        className="w-0.5 bg-accent rounded-full animate-pulse"
                        style={{ height: `${[8, 12, 6][j]}px`, animationDelay: `${j * 150}ms` }}
                      />
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-muted">{i + 1}</span>
                )}
              </div>

              {track.thumbnail ? (
                <img
                  src={track.thumbnail}
                  alt=""
                  className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-base-700 border border-base-600/60 flex items-center justify-center text-muted flex-shrink-0">
                  <Music2 size={16} />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <p className={clsx('text-sm truncate', isActive ? 'text-accent font-medium' : 'text-white')}>
                  {track.title}
                </p>
                <p className="text-xs text-muted truncate">{track.artist}</p>
              </div>

              <span className="hidden md:block text-xs text-muted flex-shrink-0 w-20 text-right">
                {playedLabel(track.lastPlayed)}
              </span>

              <div className="flex items-center gap-1 text-xs text-muted flex-shrink-0">
                <Clock3 size={10} />
                <span className="font-mono">{formatDuration(track.duration)}</span>
              </div>

              <button
                className="opacity-0 group-hover:opacity-100 btn-ghost ml-1 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  addToQueue(track, 'recommendation');
                }}
                title="Add to queue"
              >
                <ListPlus size={14} />
              </button>

              <LikeButton track={track} className="opacity-0 group-hover:opacity-100 transition-opacity" />

              <button
                className="opacity-0 group-hover:opacity-100 btn-ghost text-muted hover:text-red-400 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveHistoryItem(track);
                }}
                title="Remove from history"
              >
                <X size={14} />
              </button>

              <button
                className="opacity-0 group-hover:opacity-100 btn-ghost transition-opacity"
                onClick={() => handlePlay(track)}
                title="Play"
              >
                <Play size={14} fill="currentColor" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
