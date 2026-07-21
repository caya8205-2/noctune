import { usePlayerStore } from '../../store/player';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { seekAudio } from '../../hooks/useAudio';
import { formatDuration, clamp } from '../../utils/format';
import { api } from '../../utils/api';
import {
  Play, Pause, SkipBack, SkipForward,
  Volume2, VolumeX, Shuffle, Repeat, Repeat1,
  Loader2, Timer,
  Info,
  SlidersHorizontal,
} from 'lucide-react';
import { clsx } from 'clsx';
import { LikeButton } from './LikeButton';
import { TrackActionButtons } from '../ui/TrackActionButtons';
import { EqualizerView } from './EqualizerView';

const PLAYER_SETTINGS_CACHE_KEY = 'noctune-player-settings';

interface PlayerSettingsCache {
  playbackRate: number;
  crossfadeDuration: number;
  updatedAt: number;
}

function readPlayerSettingsCache(): PlayerSettingsCache | null {
  try {
    const raw = localStorage.getItem(PLAYER_SETTINGS_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writePlayerSettingsCache(data: Omit<PlayerSettingsCache, 'updatedAt'>) {
  try {
    localStorage.setItem(
      PLAYER_SETTINGS_CACHE_KEY,
      JSON.stringify({ ...data, updatedAt: Date.now() })
    );
  } catch {}
}

export function PlayerBar() {
  const seekDragging = useRef(false);
  const volDragging = useRef(false);
  const {
    currentTrack, isPlaying, isLoading,
    volume, progress, duration,
    shuffle, repeat,
    playbackRate, crossfadeDuration,
    togglePlay, setVolume, next, prev,
    toggleMute, toggleShuffle, cycleRepeat, setView, showTrackDetails, toggleTrackDetails,
  } = usePlayerStore();

  // Hydrate player settings from localStorage cache on mount
  const cachedSettings = useMemo(() => readPlayerSettingsCache(), []);
  const settingsHydrated = useRef(false);
  useEffect(() => {
    if (cachedSettings && !settingsHydrated.current) {
      settingsHydrated.current = true;
      usePlayerStore.setState({
        playbackRate: cachedSettings.playbackRate,
        crossfadeDuration: cachedSettings.crossfadeDuration,
      });
    }
  }, [cachedSettings]);

  // Expose cache as TanStack Query (matching HomeView pattern)
  useQuery({
    queryKey: ['player-settings'],
    queryFn: () => readPlayerSettingsCache(),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    initialData: cachedSettings,
    initialDataUpdatedAt: cachedSettings?.updatedAt,
  });

  // Write to localStorage cache whenever settings change
  const lastSettingsCache = useRef('');
  useEffect(() => {
    const snapshot = JSON.stringify({ playbackRate, crossfadeDuration });
    if (snapshot !== lastSettingsCache.current) {
      lastSettingsCache.current = snapshot;
      writePlayerSettingsCache({ playbackRate, crossfadeDuration });
    }
  }, [playbackRate, crossfadeDuration]);

  const seekDuration = duration > 0 ? duration : currentTrack?.duration ?? 0;
  const progressPct = seekDuration > 0 ? (progress / seekDuration) * 100 : 0;

  const progressFillStyle = { width: `${progressPct}%` };
  const progressThumbStyle = { left: `${progressPct}%`, transform: 'translate(-50%, -50%)' };
  const volFillStyle = { width: `${volume * 100}%` };
  const volThumbStyle = { left: `${volume * 100}%`, transform: 'translate(-50%, -50%)' };
  const needsSpotifyNavigation = Boolean(currentTrack?.spotifyId && (!currentTrack.albumId || !currentTrack.artistId));
  const { data: spotifyMetadata } = useQuery({
    queryKey: ['spotify-metadata', currentTrack?.spotifyId],
    queryFn: () => api.spotifyMetadata(currentTrack!.spotifyId!),
    enabled: needsSpotifyNavigation,
    staleTime: 1000 * 60 * 60,
  });
  const albumViewId = currentTrack?.albumId ?? spotifyMetadata?.album.id;
  const artistViewId = currentTrack?.artistId ?? spotifyMetadata?.artists[0]?.id;

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
        <div
          role={currentTrack ? 'button' : undefined}
          tabIndex={currentTrack ? 0 : undefined}
          onClick={() => currentTrack && setView('player')}
          onKeyDown={(event) => {
            if (!currentTrack) return;
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setView('player');
            }
          }}
          className={clsx(
            '-ml-1 flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-1.5 text-left transition-colors sm:-ml-2 sm:w-72 sm:flex-none sm:px-2',
            currentTrack
              ? 'cursor-pointer hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60'
              : 'cursor-default'
          )}
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
              <div className="flex min-w-0 flex-1 flex-col items-start">
                <button
                  type="button"
                  aria-disabled={!albumViewId}
                  className={clsx(
                    'inline-block max-w-full truncate text-left text-sm font-semibold leading-tight text-white transition-colors',
                    albumViewId ? 'hover:text-accent' : 'cursor-default'
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (albumViewId) setView('album', albumViewId);
                  }}
                  title={albumViewId ? `Go to album: ${currentTrack.album ?? spotifyMetadata?.album.name ?? ''}` : undefined}
                >
                  {currentTrack.title}
                </button>
                <button
                  type="button"
                  aria-disabled={!artistViewId}
                  className={clsx(
                    'mt-0.5 inline-block max-w-full truncate text-left text-xs text-muted transition-colors',
                    artistViewId ? 'hover:text-accent' : 'cursor-default'
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (artistViewId) setView('artist', artistViewId);
                  }}
                  title={artistViewId ? `Go to artist: ${currentTrack.artist}` : undefined}
                >
                  {currentTrack.artist}
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-lg border border-white/[0.08] bg-base-800" />
              <span className="text-sm text-muted">Nothing playing</span>
            </div>
          )}
        </div>

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
        <div className="hidden w-80 items-center justify-end gap-2 sm:flex">
          <span className="w-28 whitespace-nowrap text-right font-mono text-xs tabular-nums text-muted">
            {formatDuration(progress)} / {formatDuration(seekDuration)}
          </span>

          <button onClick={toggleMute} className="btn-ghost">
            {volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>

          {currentTrack && <LikeButton track={currentTrack} />}

          {currentTrack && (
            <TrackActionButtons
              track={currentTrack}
              className="contents"
              buttonClassName="p-1.5"
              iconSize={16}
              showQueue={false}
              showLike={false}
              showClearCache={false}
              showMenu={false}
            />
          )}

          {/* More options menu — sleep timer, playback speed, crossfade, EQ */}
          {currentTrack && <MoreOptionsMenu />}

          <button
            onClick={toggleTrackDetails}
            className={clsx('btn-ghost', showTrackDetails && 'text-accent')}
            title={showTrackDetails ? 'Hide track details' : 'Show track details'}
          >
            <Info size={16} />
          </button>

          <div
            className="group/vol relative flex h-4 w-20 flex-shrink-0 cursor-pointer items-center"
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

/**
 * "More" dropdown: sleep timer, playback speed, crossfade, equalizer
 * Consolidates optional controls that don't need permanent buttons.
 */
function MoreOptionsMenu() {
  const {
    playbackRate, sleepTimerEnd, crossfadeDuration, eqEnabled,
    setPlaybackRate, setSleepTimer, setCrossfadeDuration,
  } = usePlayerStore();
  const [open, setOpen] = useState(false);
  const [eqPanelOpen, setEqPanelOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
        setEqPanelOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className={clsx('btn-ghost', open && 'text-accent')}
        title="More playback options"
      >
        <span className="text-xs font-bold leading-none tracking-wider">···</span>
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-2 z-50 flex min-w-[200px] flex-col gap-0.5 rounded-xl border border-white/[0.08] bg-base-900 p-2 shadow-xl animate-fade-in">
          {/* Sleep Timer */}
          <div className="flex items-center justify-between rounded-lg px-2.5 py-2 hover:bg-white/[0.04]">
            <span className="text-xs text-soft">Sleep timer</span>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted">
                {sleepTimerEnd ? `${Math.max(1, Math.round((sleepTimerEnd - Date.now()) / 60000))}m` : 'Off'}
              </span>
              <button
                onClick={() => {
                  if (sleepTimerEnd) {
                    setSleepTimer(null);
                  } else {
                    setSleepTimer(30);
                  }
                }}
                className="btn-ghost p-1"
                title={sleepTimerEnd ? 'Cancel' : 'Set 30m'}
              >
                <Timer size={12} />
              </button>
            </div>
          </div>

          {/* Playback Speed */}
          <div className="rounded-lg px-2.5 py-2 hover:bg-white/[0.04]">
            <div className="mb-1.5 text-xs text-soft">Speed</div>
            <div className="flex gap-1">
              {[0.75, 1, 1.25, 1.5, 2].map(r => (
                <button
                  key={r}
                  onClick={() => setPlaybackRate(r)}
                  className={clsx(
                    'rounded px-2 py-1 text-[11px] font-mono transition-colors',
                    playbackRate === r ? 'bg-accent/20 text-accent' : 'text-muted hover:text-white hover:bg-white/[0.04]'
                  )}
                >
                  {r}x
                </button>
              ))}
            </div>
          </div>

          {/* Crossfade */}
          <div className="rounded-lg px-2.5 py-2 hover:bg-white/[0.04]">
            <div className="mb-1.5 text-xs text-soft">Crossfade</div>
            <div className="flex gap-1">
              {[0, 2, 5, 8, 12].map(s => (
                <button
                  key={s}
                  onClick={() => setCrossfadeDuration(s)}
                  className={clsx(
                    'rounded px-2 py-1 text-[11px] font-mono transition-colors',
                    crossfadeDuration === s ? 'bg-accent/20 text-accent' : 'text-muted hover:text-white hover:bg-white/[0.04]'
                  )}
                >
                  {s === 0 ? 'Off' : `${s}s`}
                </button>
              ))}
            </div>
          </div>

          {/* Equalizer */}
          <div
            className={clsx(
              'flex items-center justify-between rounded-lg px-2.5 py-2 cursor-pointer hover:bg-white/[0.04]',
              eqPanelOpen && 'bg-white/[0.04]'
            )}
            onClick={() => setEqPanelOpen(!eqPanelOpen)}
          >
            <span className="text-xs text-soft">Equalizer</span>
            <SlidersHorizontal size={14} className={clsx(eqEnabled ? 'text-accent' : 'text-muted')} />
          </div>
          {eqPanelOpen && (
            <div className="px-1 pb-1">
              <EqualizerView onClose={() => setEqPanelOpen(false)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
