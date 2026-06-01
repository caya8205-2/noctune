import { usePlayerStore } from '../../store/player';
import { useRef } from 'react';
import { seekAudio } from '../../hooks/useAudio';
import { formatDuration, clamp } from '../../utils/format';
import {
  Play, Pause, SkipBack, SkipForward,
  Volume2, VolumeX, Shuffle, Repeat, Repeat1,
  Loader2,
  Info,
} from 'lucide-react';
import { clsx } from 'clsx';
import { LikeButton } from './LikeButton';

export function PlayerBar() {
  const seekDragging = useRef(false);
  const volDragging = useRef(false);
  const {
    currentTrack, isPlaying, isLoading,
    volume, progress, duration,
    shuffle, repeat,
    togglePlay, setVolume, next, prev,
    toggleShuffle, cycleRepeat, setView, showTrackDetails, toggleTrackDetails,
  } = usePlayerStore();

  const seekDuration = duration > 0 ? duration : currentTrack?.duration ?? 0;
  const progressPct = seekDuration > 0 ? (progress / seekDuration) * 100 : 0;

  function handleSeekDown(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    const bar = e.currentTarget;
    const rect = bar.getBoundingClientRect();
    const pct = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    seekAudio(pct * seekDuration);
    seekDragging.current = true;

    function onMove(ev: MouseEvent) {
      const r = bar.getBoundingClientRect();
      const v = clamp((ev.clientX - r.left) / r.width, 0, 1);
      seekAudio(v * seekDuration);
    }
    function onUp(ev: MouseEvent) {
      const r = bar.getBoundingClientRect();
      const v = clamp((ev.clientX - r.left) / r.width, 0, 1);
      seekAudio(v * seekDuration);
      seekDragging.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function handleVolDown(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    const bar = e.currentTarget;
    const rect = bar.getBoundingClientRect();
    const pct = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    setVolume(pct);
    volDragging.current = true;

    function onMove(ev: MouseEvent) {
      const r = bar.getBoundingClientRect();
      const v = clamp((ev.clientX - r.left) / r.width, 0, 1);
      setVolume(v);
    }
    function onUp(ev: MouseEvent) {
      const r = bar.getBoundingClientRect();
      const v = clamp((ev.clientX - r.left) / r.width, 0, 1);
      setVolume(v);
      volDragging.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Progress bar */}
      <div
        className="w-full h-3 -mb-2 cursor-pointer group/progress relative"
        onMouseDown={handleSeekDown}
      >
        <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-0.5 bg-base-600 group-hover/progress:h-1.5 transition-all duration-150" />
        <div
          className="absolute top-1/2 -translate-y-1/2 left-0 h-0.5 bg-accent group-hover/progress:h-1.5 transition-[height] duration-150"
          style={{ width: `${progressPct}%` }}
        />
        <div
          className="absolute top-1/2 w-3.5 h-3.5 rounded-full bg-accent shadow-lg shadow-accent/20
                     opacity-0 group-hover/progress:opacity-100 transition-opacity duration-150"
          style={{
            left: `${progressPct}%`,
            transform: 'translate(-50%, -50%)',
          }}
        >
        </div>
      </div>

      <div className="flex items-center px-3 sm:px-6 flex-1 gap-2 sm:gap-4">
        {/* Track info */}
        <button
          type="button"
          onClick={() => currentTrack && setView('player')}
          disabled={!currentTrack}
          className="flex items-center gap-3 flex-1 sm:w-72 sm:flex-none min-w-0 text-left rounded-lg -ml-1 sm:-ml-2 px-1 sm:px-2 py-1.5 hover:bg-base-800 transition-colors disabled:hover:bg-transparent disabled:cursor-default"
          title={currentTrack ? 'Open full player' : undefined}
        >
          {currentTrack ? (
            <>
              <div className="relative flex-shrink-0">
                <img
                  src={currentTrack.thumbnail}
                  alt={currentTrack.title}
                  className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg object-cover border border-base-600/60"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
                {isLoading && (
                  <div className="absolute inset-0 flex items-center justify-center
                                  bg-base-900/80 rounded-lg">
                    <Loader2 size={14} className="animate-spin text-accent" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white truncate leading-tight">
                  {currentTrack.title}
                </p>
                <p className="text-xs text-muted truncate mt-0.5">{currentTrack.artist}</p>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-lg bg-base-800 border border-base-600/60" />
              <span className="text-sm text-muted">Nothing playing</span>
            </div>
          )}
        </button>

        {/* Controls */}
        <div className="hidden sm:flex flex-1 items-center justify-center gap-2">
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
            className="w-12 h-12 rounded-full bg-accent text-base-950 flex items-center justify-center
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

        <div className="sm:hidden flex items-center justify-end gap-1">
          <button onClick={prev} className="btn-ghost p-2">
            <SkipBack size={20} />
          </button>
          <button onClick={togglePlay} disabled={!currentTrack} className="w-12 h-12 rounded-full bg-accent text-base-950 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-accent/10">
            {isLoading
              ? <Loader2 size={16} className="animate-spin" />
              : isPlaying
                ? <Pause size={16} fill="currentColor" />
                : <Play size={16} fill="currentColor" className="ml-0.5" />
            }
          </button>
          <button onClick={next} className="btn-ghost p-2">
            <SkipForward size={20} />
          </button>
        </div>

        {/* Time + Volume */}
        <div className="hidden sm:flex items-center gap-3 w-72 justify-end">
          <span className="w-28 text-right text-xs text-muted font-mono tabular-nums whitespace-nowrap">
            {formatDuration(progress)} / {formatDuration(seekDuration)}
          </span>

          <button
            onClick={() => setVolume(volume > 0 ? 0 : 0.8)}
            className="btn-ghost"
          >
            {volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>

          {currentTrack && <LikeButton track={currentTrack} />}

          <button
            onClick={toggleTrackDetails}
            className={clsx('btn-ghost', showTrackDetails && 'text-accent')}
            title={showTrackDetails ? 'Hide track details' : 'Show track details'}
          >
            <Info size={16} />
          </button>

          <div
            className="w-24 h-4 cursor-pointer group/vol relative flex items-center"
            onMouseDown={handleVolDown}
          >
            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 bg-base-600 rounded-full" />
            <div
              className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-soft rounded-full group-hover/vol:bg-accent transition-colors"
              style={{ width: `${volume * 100}%` }}
            />
            <div
              className="absolute top-1/2 w-3 h-3 rounded-full bg-soft group-hover/vol:bg-accent shadow-md shadow-black/30 transition-colors"
              style={{
                left: `${volume * 100}%`,
                transform: 'translate(-50%, -50%)',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}


