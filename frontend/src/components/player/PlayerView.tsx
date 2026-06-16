import { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Database,
  Gauge,
  Mic2,
  Music2,
  Pause,
  Play,
  Radio,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Zap,
  ListPlus,
  Loader2,
} from 'lucide-react';
import { usePlayerStore } from '../../store/player';
import { formatDuration } from '../../utils/format';
import { Visualizer } from './Visualizer';
import { LikeButton } from './LikeButton';
import { TrackDetailsContent } from './TrackDetailsSidebar';
import { type LyricsResult, type Track } from '../../utils/api';
import { lyricsQueryOptions } from '../../hooks/useLyrics';

const sourceMeta = {
  prefetch: { label: 'Prefetch', Icon: Zap, className: 'bg-accent/15 text-accent border-accent/20' },
  cache: { label: 'Cache', Icon: Database, className: 'bg-base-700 text-soft border-base-600/40' },
  cache_refreshed: { label: 'Refreshed', Icon: Activity, className: 'bg-base-700 text-soft border-base-600/40' },
  resolved: { label: 'Resolved', Icon: Radio, className: 'bg-base-700 text-muted border-base-600/40' },
};

function getActiveLyricIndex(lyrics: LyricsResult | null | undefined, progress: number): number {
  if (!lyrics?.synced) return -1;
  const lyricLeadSeconds = 0.3;
  let active = -1;
  for (let i = 0; i < lyrics.lines.length; i++) {
    const time = lyrics.lines[i].time;
    if (time === null || time > progress + lyricLeadSeconds) break;
    active = i;
  }
  return active;
}

function LyricsPanel({ track }: { track: Track }) {
  const progress = usePlayerStore((state) => state.progress);
  const activeLineRef = useRef<HTMLParagraphElement | null>(null);
  const { data: lyrics, isLoading, isError } = useQuery(lyricsQueryOptions(track));

  const activeIndex = useMemo(() => getActiveLyricIndex(lyrics, progress), [lyrics, progress]);

  useEffect(() => {
    activeLineRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeIndex]);

  if (isLoading) {
    return (
      <div className="min-h-[220px] rounded-xl border border-base-600/70 bg-base-800/70 px-6 py-5 flex items-center justify-center text-sm text-muted">
        Loading lyrics from LRCLIB.
      </div>
    );
  }

  if (isError || !lyrics || lyrics.lines.length === 0) {
    return (
      <div className="min-h-[220px] rounded-xl border border-base-600/70 bg-base-800/70 px-6 py-5 flex flex-col justify-center">
        <p className="text-lg leading-relaxed text-soft">Lyrics not found.</p>
        <p className="text-sm text-muted mt-2 leading-relaxed">
          LRCLIB does not have synced lyrics for this track yet.
        </p>
      </div>
    );
  }

  if (lyrics.instrumental) {
    return (
      <div className="min-h-[220px] rounded-xl border border-base-600/70 bg-base-800/70 px-6 py-5 flex flex-col justify-center">
        <p className="text-lg leading-relaxed text-soft">Instrumental track.</p>
        <p className="text-sm text-muted mt-2 leading-relaxed">
          LRCLIB marks this track as instrumental.
        </p>
      </div>
    );
  }

  return (
    <div className="h-[280px] rounded-xl border border-base-600/70 bg-base-800/70 overflow-hidden">
      <div className="h-full overflow-y-auto px-6 py-5">
        <div className="min-h-full flex flex-col justify-center gap-3">
          {lyrics.lines.map((line, index) => {
            const isActive = index === activeIndex;
            const isPassed = lyrics.synced && activeIndex > index;
            return (
              <p
                key={`${line.time ?? index}-${line.text}`}
                ref={isActive ? activeLineRef : null}
                className={`text-xl leading-relaxed transition-all duration-200 ${
                  isActive
                    ? 'text-white font-semibold scale-[1.02]'
                    : isPassed
                      ? 'text-muted/60'
                      : 'text-soft'
                }`}
              >
                {line.text || '...'}
              </p>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function PlayerView() {
  const {
    currentTrack,
    isPlaying,
    isLoading,
    queue,
    queueIndex,
    shuffle,
    repeat,
    addToQueue,
    togglePlay,
    prev,
    next,
    toggleShuffle,
    cycleRepeat,
  } = usePlayerStore();
  const upcomingCount = Math.max(0, queue.length - queueIndex - 1);
  const SourceIcon = currentTrack?.source ? sourceMeta[currentTrack.source]?.Icon : null;

  return (
    <div className="h-full overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 lg:px-9 lg:py-8">
      {!currentTrack && (
        <section className="flex flex-col gap-3 max-w-3xl mb-8">
          <p className="section-label text-accent">Player</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight">
            Choose a track and start listening.
          </h1>
          <p className="text-sm text-muted leading-relaxed">
            Search for a song or artist, then Noctune will keep your queue ready while the music plays.
          </p>
        </section>
      )}

      <section className="min-h-full flex flex-col items-center">
        {currentTrack ? (
          <>
            <div className="relative mt-2 sm:mt-4 w-72 h-72 sm:w-80 sm:h-80 flex items-center justify-center flex-shrink-0">
              <div
                className="absolute inset-0 flex items-center justify-center animate-spin-slow"
                style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}
              >
                <img
                  src={currentTrack.thumbnail}
                  alt={currentTrack.title}
                  className="w-56 h-56 sm:w-64 sm:h-64 rounded-full object-cover shadow-2xl shadow-black/40 border border-base-600/60"
                />
                <Visualizer />
              </div>
              <div className="absolute inset-4 rounded-full ring-1 ring-white/10 pointer-events-none" />
              <div className="absolute inset-[42%] rounded-full bg-base-950 border border-base-600/70 shadow-inner z-20" />
              {isPlaying && (
                <div className="absolute inset-7 rounded-full border border-accent/30 animate-pulse-accent pointer-events-none" />
              )}
            </div>

            <div className="w-full max-w-3xl text-center mt-6 sm:mt-8">
              <p className="section-label text-accent mb-3">Now playing</p>
              <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight line-clamp-2 sm:truncate">
                {currentTrack.title}
              </h1>
              <p className="text-lg text-soft mt-2 truncate">{currentTrack.artist}</p>
              <div className="flex items-center justify-center gap-2 mt-5 flex-wrap">
                <span className="inline-flex items-center gap-1.5 text-xs text-soft px-2.5 py-1 rounded-full border border-base-600/40 bg-base-900/60">
                  <Zap size={12} className="text-accent" />
                  {upcomingCount} queued
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs font-mono text-muted px-2.5 py-1 rounded-full border border-base-600/40 bg-base-900/60">
                  <Gauge size={12} />
                  {formatDuration(currentTrack.duration)}
                </span>
                {currentTrack.source && SourceIcon && (
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-full border ${
                      sourceMeta[currentTrack.source].className
                    }`}
                  >
                    <SourceIcon size={12} />
                    {sourceMeta[currentTrack.source].label}
                  </span>
                )}
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 text-xs text-soft px-2.5 py-1 rounded-full border border-base-600/40 bg-base-900/60 hover:text-white hover:border-base-500 transition-colors"
                  onClick={() => addToQueue(currentTrack)}
                >
                  <ListPlus size={12} />
                  Queue
                </button>
                <LikeButton track={currentTrack} className="rounded-full px-2.5 py-1 border border-base-600/40 bg-base-900/60" />
              </div>

              <div className="mt-6 flex items-center justify-center gap-3 lg:hidden">
                <button
                  type="button"
                  onClick={toggleShuffle}
                  className={`btn-ghost p-3 ${shuffle ? 'text-accent' : ''}`}
                  title="Shuffle"
                >
                  <Shuffle size={18} />
                </button>
                <button type="button" onClick={prev} className="btn-ghost p-3" title="Previous track">
                  <SkipBack size={22} />
                </button>
                <button
                  type="button"
                  onClick={togglePlay}
                  disabled={!currentTrack}
                  className="w-14 h-14 rounded-full bg-accent text-base-950 flex items-center justify-center hover:bg-accent-dim transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-accent/10"
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isLoading ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : isPlaying ? (
                    <Pause size={18} fill="currentColor" />
                  ) : (
                    <Play size={18} fill="currentColor" className="ml-0.5" />
                  )}
                </button>
                <button type="button" onClick={next} className="btn-ghost p-3" title="Next track">
                  <SkipForward size={22} />
                </button>
                <button
                  type="button"
                  onClick={cycleRepeat}
                  className={`btn-ghost p-3 ${repeat !== 'off' ? 'text-accent' : ''}`}
                  title={repeat === 'one' ? 'Repeat one' : repeat === 'all' ? 'Repeat all' : 'Repeat off'}
                >
                  {repeat === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
                </button>
              </div>
            </div>

            <section className="w-full max-w-3xl mt-8">
              <div className="flex items-center gap-2 mb-4">
                <Mic2 size={15} className="text-accent" />
                <h2 className="section-label">Lyrics</h2>
              </div>
              <LyricsPanel track={currentTrack} />
            </section>

            <section className="w-full max-w-3xl mt-8 pb-8 lg:hidden">
              <div className="flex items-center gap-2 mb-4">
                <Radio size={15} className="text-accent" />
                <h2 className="section-label">Details</h2>
              </div>
              <div className="rounded-xl border border-base-600/70 bg-base-900/70 p-4 flex flex-col gap-4">
                <TrackDetailsContent />
              </div>
            </section>
          </>
        ) : (
          <div className="w-full max-w-3xl min-h-[420px] sm:min-h-[520px] flex flex-col justify-center gap-5 text-muted">
            <div className="flex items-center justify-between gap-5">
              <div className="w-24 h-24 rounded-xl bg-base-700 border border-base-600/60 flex items-center justify-center">
                <Music2 size={42} strokeWidth={1.3} />
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs text-soft px-2.5 py-1 rounded-full border border-base-600/40 bg-base-900/60">
                <Zap size={12} className="text-accent" />
                Prefetch ready
              </span>
            </div>
            <div>
              <p className="section-label mb-2 text-accent">Noctune</p>
              <h2 className="text-3xl sm:text-4xl font-bold text-white leading-tight">
                Choose a track to begin.
              </h2>
              <p className="text-sm text-muted mt-3 max-w-md leading-relaxed">
                Search for a song, start playback, and Noctune will build the queue around it.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}





