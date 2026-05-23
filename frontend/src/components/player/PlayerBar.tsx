import { usePlayerStore } from '../../store/player';
import { seekAudio } from '../../hooks/useAudio';
import { formatDuration, clamp } from '../../utils/format';
import {
  Play, Pause, SkipBack, SkipForward,
  Volume2, VolumeX, Shuffle, Repeat, Repeat1,
  Loader2,
} from 'lucide-react';
import { clsx } from 'clsx';

export function PlayerBar() {
  const {
    currentTrack, isPlaying, isLoading,
    volume, progress, duration,
    shuffle, repeat,
    togglePlay, setVolume, next, prev,
    toggleShuffle, cycleRepeat,
  } = usePlayerStore();

  const progressPct = duration > 0 ? (progress / duration) * 100 : 0;

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    seekAudio(pct * duration);
  }

  function handleVolume(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    setVolume(pct);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Progress bar */}
      <div
        className="w-full h-1 bg-base-600 cursor-pointer group/progress relative"
        onClick={handleSeek}
      >
        <div
          className="h-full bg-accent transition-none relative"
          style={{ width: `${progressPct}%` }}
        >
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-accent
                          opacity-0 group-hover/progress:opacity-100 translate-x-1/2 transition-opacity" />
        </div>
      </div>

      <div className="flex items-center px-5 flex-1 gap-4">
        {/* Track info */}
        <div className="flex items-center gap-3 w-72 min-w-0">
          {currentTrack ? (
            <>
              <div className="relative flex-shrink-0">
                <img
                  src={currentTrack.thumbnail}
                  alt={currentTrack.title}
                  className="w-11 h-11 rounded-lg object-cover"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
                {isLoading && (
                  <div className="absolute inset-0 flex items-center justify-center
                                  bg-base-900/80 rounded-lg">
                    <Loader2 size={14} className="animate-spin text-accent" />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate leading-tight">
                  {currentTrack.title}
                </p>
                <p className="text-xs text-muted truncate mt-0.5">{currentTrack.artist}</p>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-lg bg-base-800 border border-base-600/30" />
              <span className="text-sm text-muted">Nothing playing</span>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex-1 flex items-center justify-center gap-2">
          <button
            onClick={toggleShuffle}
            className={clsx('btn-ghost', shuffle && 'text-accent')}
          >
            <Shuffle size={16} />
          </button>

          <button onClick={prev} className="btn-ghost">
            <SkipBack size={20} />
          </button>

          <button
            onClick={togglePlay}
            disabled={!currentTrack}
            className="w-10 h-10 rounded-full bg-accent text-base-950 flex items-center justify-center
                       hover:bg-accent-dim transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-accent/10"
          >
            {isLoading
              ? <Loader2 size={16} className="animate-spin" />
              : isPlaying
                ? <Pause size={16} fill="currentColor" />
                : <Play size={16} fill="currentColor" className="ml-0.5" />
            }
          </button>

          <button onClick={next} className="btn-ghost">
            <SkipForward size={20} />
          </button>

          <button
            onClick={cycleRepeat}
            className={clsx('btn-ghost', repeat !== 'off' && 'text-accent')}
          >
            {repeat === 'one' ? <Repeat1 size={16} /> : <Repeat size={16} />}
          </button>
        </div>

        {/* Time + Volume */}
        <div className="flex items-center gap-3 w-72 justify-end">
          <span className="text-xs text-muted font-mono tabular-nums">
            {formatDuration(progress)} / {formatDuration(duration)}
          </span>

          <button
            onClick={() => setVolume(volume > 0 ? 0 : 0.8)}
            className="btn-ghost"
          >
            {volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>

          <div
            className="w-20 h-1 bg-base-600 rounded-full cursor-pointer group/vol relative"
            onClick={handleVolume}
          >
            <div
              className="h-full bg-soft rounded-full group-hover/vol:bg-accent transition-colors"
              style={{ width: `${volume * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
