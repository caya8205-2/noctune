import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Loader2,
} from 'lucide-react';
import { clsx } from 'clsx';
import { usePlayerStore } from '../../store/player';
import { formatDuration } from '../../utils/format';
import { seekAudio } from '../../hooks/useAudio';
import { Visualizer } from './Visualizer';
import { TrackActionButtons } from '../ui/TrackActionButtons';
import { TrackDetailsContent } from './TrackDetailsSidebar';
import { api, type LyricsResult, type Track } from '../../utils/api';
import { lyricsQueryOptions } from '../../hooks/useLyrics';

const sourceMeta = {
  prefetch: { label: 'Prefetch', Icon: Zap, className: 'bg-accent/15 text-accent border-accent/20' },
  cache: { label: 'Cache', Icon: Database, className: 'bg-base-700 text-soft border-base-600/40' },
  cache_refreshed: { label: 'Refreshed', Icon: Activity, className: 'bg-base-700 text-soft border-base-600/40' },
  resolved: { label: 'Resolved', Icon: Radio, className: 'bg-base-700 text-muted border-base-600/40' },
};

const JAPANESE_SCRIPT_RE = /[\u3040-\u30ff\u3400-\u9fff]/;

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
  const [lyricsMode, setLyricsMode] = useState<'original' | 'romaji'>('original');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const progress = usePlayerStore((state) => state.progress);
  const lyricsScrollRef = useRef<HTMLDivElement | null>(null);
  const activeLineRef = useRef<HTMLParagraphElement | null>(null);
  const { data: lyrics, isLoading, isError } = useQuery(lyricsQueryOptions(track));

  const activeIndex = useMemo(() => getActiveLyricIndex(lyrics, progress), [lyrics, progress]);
  const hasJapaneseLyrics = useMemo(
    () => Boolean(lyrics?.lines.some((line) => JAPANESE_SCRIPT_RE.test(line.text))),
    [lyrics]
  );
  const displayLines = useMemo(
    () =>
      lyrics?.lines.map((line) => ({
        ...line,
        text: lyricsMode === 'romaji' ? (line.romanizedText ?? line.text) : line.text,
      })) ?? [],
    [lyrics, lyricsMode]
  );

  useEffect(() => {
    if (!hasJapaneseLyrics && lyricsMode === 'romaji') {
      setLyricsMode('original');
    }
  }, [hasJapaneseLyrics, lyricsMode]);

  useEffect(() => {
    const container = lyricsScrollRef.current;
    const activeLine = activeLineRef.current;
    if (!container || !activeLine) return;

    const containerRect = container.getBoundingClientRect();
    const activeLineRect = activeLine.getBoundingClientRect();
    const targetTop =
      container.scrollTop +
      activeLineRect.top -
      containerRect.top -
      container.clientHeight / 2 +
      activeLineRect.height / 2;

    container.scrollTo({
      top: Math.max(0, targetTop),
      behavior: 'smooth',
    });
  }, [activeIndex]);

  const handleLineClick = useCallback((time: number | null) => {
    if (time !== null) seekAudio(time);
  }, []);

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
      <div className="flex items-center justify-end gap-1 border-b border-base-600/50 px-4 py-2">
        <button
          type="button"
          onClick={() => setLyricsMode('original')}
          className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
            lyricsMode === 'original'
              ? 'bg-accent text-base-950'
              : 'text-muted hover:bg-base-700/70 hover:text-white'
          }`}
        >
          Original
        </button>
        <button
          type="button"
          onClick={() => setLyricsMode('romaji')}
          disabled={!hasJapaneseLyrics}
          className={`rounded-lg px-3 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            lyricsMode === 'romaji'
              ? 'bg-accent text-base-950'
              : 'text-muted hover:bg-base-700/70 hover:text-white'
          }`}
          title={hasJapaneseLyrics ? 'Show Japanese lyrics as romaji' : 'No Japanese lyrics detected'}
        >
          Romaji
        </button>
      </div>
      <div ref={lyricsScrollRef} className="h-[calc(100%-41px)] overflow-y-auto px-6 py-5">
        <div className="min-h-full flex flex-col justify-center gap-3">
          {displayLines.map((line, index) => {
            const isActive = index === activeIndex;
            const isPassed = lyrics.synced && activeIndex > index;
            const isHovered = hoverIndex === index;
            const isClickable = lyrics.synced && line.time !== null;
            return (
              <p
                key={`${line.time ?? index}-${line.text}`}
                ref={isActive ? activeLineRef : null}
                onClick={() => handleLineClick(line.time)}
                onMouseEnter={() => setHoverIndex(index)}
                onMouseLeave={() => setHoverIndex(null)}
                className={clsx(
                  'text-xl leading-relaxed transition-all duration-200',
                  isActive
                    ? 'text-white font-semibold scale-[1.02]'
                    : isPassed
                      ? 'text-muted/60'
                      : 'text-soft',
                  isClickable && 'cursor-pointer',
                  isHovered && !isActive && 'underline decoration-white/30 underline-offset-4'
                )}
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
    togglePlay,
    prev,
    next,
    toggleShuffle,
    cycleRepeat,
    setView,
  } = usePlayerStore();
  const upcomingCount = Math.max(0, queue.length - queueIndex - 1);
  const SourceIcon = currentTrack?.source ? sourceMeta[currentTrack.source]?.Icon : null;
  const needsSpotifyNavigation = Boolean(currentTrack?.spotifyId && (!currentTrack.albumId || !currentTrack.artistId));
  const { data: spotifyMetadata } = useQuery({
    queryKey: ['spotify-metadata', currentTrack?.spotifyId],
    queryFn: () => api.spotifyMetadata(currentTrack!.spotifyId!),
    enabled: needsSpotifyNavigation,
    staleTime: 1000 * 60 * 60,
  });
  const albumViewId = currentTrack?.albumId ?? spotifyMetadata?.album.id;
  const artistViewId = currentTrack?.artistId ?? spotifyMetadata?.artists[0]?.id;

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
              {albumViewId ? (
                <button
                  type="button"
                  className="mx-auto block max-w-full text-3xl font-bold leading-tight text-white transition-colors hover:text-accent sm:truncate sm:text-4xl"
                  onClick={() => setView('album', albumViewId)}
                  title={`Go to album: ${currentTrack.album ?? spotifyMetadata?.album.name ?? currentTrack.title}`}
                >
                  {currentTrack.title}
                </button>
              ) : (
                <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight line-clamp-2 sm:truncate">
                  {currentTrack.title}
                </h1>
              )}
              {artistViewId ? (
                <button
                  type="button"
                  className="mx-auto mt-2 block max-w-full truncate text-lg text-soft transition-colors hover:text-accent"
                  onClick={() => setView('artist', artistViewId)}
                  title={`Go to artist: ${currentTrack.artist}`}
                >
                  {currentTrack.artist}
                </button>
              ) : (
                <p className="text-lg text-soft mt-2 truncate">{currentTrack.artist}</p>
              )}
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
                <TrackActionButtons
                  track={currentTrack}
                  className="contents"
                  buttonClassName="h-[30px] min-w-[42px] justify-center rounded-full px-2.5 py-1 border border-base-600/40 bg-base-900/60 gap-1.5"
                  iconSize={15}
                  showQueue={false}
                  showClearCache={false}
                  showMenu={false}
                />
              </div>

              <div className="mt-6 flex items-center justify-center gap-3 md:hidden">
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

            <section className="w-full max-w-3xl mt-8 pb-8 md:hidden">
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





