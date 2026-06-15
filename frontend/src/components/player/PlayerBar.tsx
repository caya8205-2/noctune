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

  const progressFillStyle = { width: `${progressPct}%` };
  const progressThumbStyle = { left: `${progressPct}%`, transform: 'translate(-50%, -50%)' };
  const volFillStyle = { width: `${volume * 100}%` };
  const volThumbStyle = { left: `${volume * 100}%`, transform: 'translate(-50%, -50%)' };

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
    <div className="flex h-full flex-col">
      {/* Progress bar */}
      <div
        className="group/progress relative -mb-2 h-3 w-full cursor-pointer"
        onMouseDown={handleSeekDown}
      >
        <div className="absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 bg-white/10 transition-all duration-150 group-hover/progress:h-1.5" />
        <div
          className="absolute left-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-gradient-to-r from-accent-dim to-accent transition-[height] duration-150 group-hover/progress:h-1.5"
          style={progressFillStyle}
        />
        <div
          className="absolute top-1/2 h-3.5 w-3.5 rounded-full bg-accent opacity-0 shadow-glow transition-opacity duration-150 group-hover/progress:opacity-100"
          style={progressThumbStyle}
        />
      </div>

      <div className="flex flex-1 items-center gap-2 px-3 sm:gap-4 sm:px-6">
        {/* Track info */}
        <button
          type="button"
          onClick={() => currentTrack && setView('player')}
          disabled={!currentTrack}
          className="-ml-1 flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-1.5 text-left transition-colors hover:bg-white/[0.05] disabled:cursor-default disabled:hover:bg-transparent sm:-ml-2 sm:w-72 sm:flex-none sm:px-2"
          title={currentTrack ? 'Open full player' : undefined}
        >
          {currentTrack ? (
            <>
              <div className="relative flex-shrink-0">
                <img
                  src={currentTrack.thumbnail}
                  alt={currentTrack.title}
                  className="h-10 w-10 rounded-lg border border-white/[0.08] object-cover sm:h-11 sm:w-11"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
                {isLoading && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-base-950/80">
                    <Loader2 size={14} className="animate-spin text-accent" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold leading-tight text-white">
                  {currentTrack.title}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted">{currentTrack.artist}</p>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-lg border border-white/[0.08] bg-base-800" />
              <span className="text-sm text-muted">Nothing playing</span>
            </div>
          )}
        </button>

        {/* Controls */}
        <div className="hidden flex-1 items-center justify-center gap-2 sm:flex">
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
            className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#F4C76A] via-accent to-[#D69A36] text-base-950 shadow-glow transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
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

        <div className="flex items-center justify-end gap-1 sm:hidden">
          <button onClick={prev} className="btn-ghost p-2">
            <SkipBack size={20} />
          </button>
          <button onClick={togglePlay} disabled={!currentTrack} className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#F4C76A] via-accent to-[#D69A36] text-base-950 shadow-glow transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40">
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
        <div className="hidden w-72 items-center justify-end gap-3 sm:flex">
          <span className="w-28 whitespace-nowrap text-right font-mono text-xs tabular-nums text-muted">
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
            className="group/vol relative flex h-4 w-24 cursor-pointer items-center"
            onMouseDown={handleVolDown}
          >
            <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/10" />
            <div
              className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-soft transition-colors group-hover/vol:bg-accent"
              style={volFillStyle}
            />
            <div
              className="absolute top-1/2 h-3 w-3 rounded-full bg-soft shadow-md shadow-black/30 transition-colors group-hover/vol:bg-accent"
              style={volThumbStyle}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
