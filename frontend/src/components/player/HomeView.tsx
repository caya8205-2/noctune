import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import {
  Clock,
  Compass,
  Disc3,
  Heart,
  ListMusic,
  ListOrdered,
  Music2,
  Sparkles,
  Zap,
} from 'lucide-react';
import clsx from 'clsx';
import { api, isTrackActive, resolveYouTubeChannelId, type CachedTrack, type PersonalMix, type Playlist, type Track } from '../../utils/api';
import { formatDuration } from '../../utils/format';
import { usePlayerStore } from '../../store/player';
import { TrackActionButtons } from '../ui/TrackActionButtons';

const NIGHTLY_MIX_CACHE_KEY = 'noctune:nightly-mix:v2';
const NIGHTLY_MIX_REFRESH_INTERVAL_MS = 1000 * 60 * 60 * 5;
const NIGHTLY_MIX_LIMIT = 4;
const NIGHTLY_MIX_TRACKS = 8;

interface NightlyMixCache {
  updatedAt: number;
  data: {
    mixes: PersonalMix[];
  };
}

function readNightlyMixCache(): NightlyMixCache | null {
  try {
    const raw = localStorage.getItem(NIGHTLY_MIX_CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw) as Partial<NightlyMixCache>;
    if (!cache.updatedAt || !cache.data || !Array.isArray(cache.data.mixes)) return null;
    return cache as NightlyMixCache;
  } catch {
    return null;
  }
}

function writeNightlyMixCache(data: NightlyMixCache['data'], updatedAt: number) {
  try {
    localStorage.setItem(NIGHTLY_MIX_CACHE_KEY, JSON.stringify({ data, updatedAt }));
  } catch {
    // best-effort cache
  }
}

const HOME_LOCAL_CACHE_KEY = 'noctune:home-local:v1';
const HOME_NEW_RELEASES_CACHE_KEY = 'noctune:home-new-releases:v1';
const HOME_REFRESH_MS = 1000 * 60 * 5;

interface HomeLocalCache {
  updatedAt: number;
  data: { playlists: Playlist[]; recentTracks: CachedTrack[] };
}

interface NewReleasesCache {
  updatedAt: number;
  data: { newReleases: Track[] };
}

function readHomeLocalCache(): HomeLocalCache | null {
  try {
    const raw = localStorage.getItem(HOME_LOCAL_CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw) as Partial<HomeLocalCache>;
    if (!cache.updatedAt || !cache.data || !Array.isArray(cache.data.recentTracks)) return null;
    return cache as HomeLocalCache;
  } catch {
    return null;
  }
}

function writeHomeLocalCache(data: HomeLocalCache['data'], updatedAt: number) {
  try {
    localStorage.setItem(HOME_LOCAL_CACHE_KEY, JSON.stringify({ data, updatedAt }));
  } catch {
    // best-effort cache
  }
}

function readNewReleasesCache(): NewReleasesCache | null {
  try {
    const raw = localStorage.getItem(HOME_NEW_RELEASES_CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw) as Partial<NewReleasesCache>;
    if (!cache.updatedAt || !cache.data || !Array.isArray(cache.data.newReleases)) return null;
    return cache as NewReleasesCache;
  } catch {
    return null;
  }
}

function writeNewReleasesCache(data: NewReleasesCache['data'], updatedAt: number) {
  try {
    localStorage.setItem(HOME_NEW_RELEASES_CACHE_KEY, JSON.stringify({ data, updatedAt }));
  } catch {
    // best-effort cache
  }
}

// ── Minimalist Quick Shortcut Pill ──────────────────────────────────────────
function ShortcutPill({
  title,
  icon: Icon,
  accentColor = 'text-accent',
  onClick,
}: {
  title: string;
  icon: LucideIcon;
  accentColor?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-2.5 rounded-full border border-white/[0.08] bg-base-900/60 px-4 py-2 text-xs font-medium text-white transition-all duration-200 hover:border-accent/40 hover:bg-base-800 hover:text-accent"
    >
      <Icon size={14} className={clsx(accentColor, 'transition-transform group-hover:scale-110')} />
      <span>{title}</span>
    </button>
  );
}

// ── Clean Track Row (Recently Played) ──────────────────────────────────────
function OpenTrackRow({
  track,
  index,
  onPlay,
}: {
  track: Track;
  index: number;
  onPlay: (track: Track) => void;
}) {
  const { currentTrack, isPlaying, setView } = usePlayerStore();
  const active = isTrackActive(currentTrack, track);

  const needsSpotifyNavigation = Boolean(track.spotifyId && (!track.albumId || !track.artistId));
  const { data: spotifyMetadata } = useQuery({
    queryKey: ['spotify-metadata', track.spotifyId],
    queryFn: () => api.spotifyMetadata(track.spotifyId!),
    enabled: needsSpotifyNavigation,
    staleTime: 1000 * 60 * 60,
  });

  const albumViewId = track.albumId ?? spotifyMetadata?.album?.id;
  const artistViewId = track.artistId ?? spotifyMetadata?.artists[0]?.id;

  const handleTitleClick = (e: React.MouseEvent) => {
    if (albumViewId) {
      e.stopPropagation();
      setView('album', albumViewId);
    }
  };

  const handleArtistClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    let resolvedArtistId = artistViewId;
    if (!resolvedArtistId && track) resolvedArtistId = await resolveYouTubeChannelId(track);
    if (resolvedArtistId) setView('artist', resolvedArtistId);
  };

  return (
    <div
      onClick={() => onPlay(track)}
      className={clsx(
        'group flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 transition-colors duration-150 hover:bg-white/[0.05]',
        active && 'bg-accent/10'
      )}
    >
      <div className="flex items-center gap-3.5 min-w-0 flex-1">
        <div className="w-5 flex-shrink-0 flex items-center justify-center">
          {active && isPlaying ? (
            <div className="flex gap-0.5 items-end h-3 justify-center">
              <div className="w-0.5 h-3 bg-accent rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
              <div className="w-0.5 h-1.5 bg-accent rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
              <div className="w-0.5 h-2.5 bg-accent rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
            </div>
          ) : (
            <span className={clsx('text-xs font-mono', active ? 'text-accent font-semibold' : 'text-muted')}>
              {index + 1}
            </span>
          )}
        </div>

        <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-md bg-base-800">
          {track.thumbnail ? (
            <img src={track.thumbnail} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted">
              <Music2 size={16} />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p
            onClick={albumViewId ? handleTitleClick : undefined}
            className={clsx(
              'block max-w-full truncate text-sm font-medium transition-colors',
              active ? 'text-accent font-semibold' : 'text-white',
              albumViewId && 'hover:text-accent cursor-pointer'
            )}
            title={albumViewId ? `Go to album: ${track.album}` : undefined}
          >
            {track.title}
          </p>
          {track.artist ? (
            <p
              onClick={handleArtistClick}
              className="block max-w-full truncate text-xs text-muted transition-colors hover:text-accent cursor-pointer"
              title={`Go to artist: ${track.artist}`}
            >
              {track.artist}
            </p>
          ) : (
            <p className="truncate text-xs text-muted">{track.artist}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <span className="hidden font-mono text-xs tabular-nums text-muted sm:inline-block">
          {formatDuration(track.duration)}
        </span>
        <TrackActionButtons track={track} showClearCache={true} />
      </div>
    </div>
  );
}

// ── Clean Nightly Mix Card (Full Description) ──────────────────────────────
function CleanMixCard({
  mix,
  onPlay,
}: {
  mix: PersonalMix;
  onPlay: (mix: PersonalMix) => void;
}) {
  return (
    <div
      onClick={() => onPlay(mix)}
      className="group cursor-pointer text-left transition-all duration-200"
    >
      <div className="relative mb-2.5 aspect-square w-full overflow-hidden rounded-xl bg-base-800 shadow-lg border border-white/[0.06]">
        {mix.cover ? (
          <img
            src={mix.cover}
            alt=""
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-accent">
            <Sparkles size={32} strokeWidth={1.4} />
          </div>
        )}
      </div>
      <p className="truncate text-sm font-semibold text-white group-hover:text-accent transition-colors">
        {mix.name}
      </p>
      <p className="mt-1 text-xs text-muted leading-relaxed whitespace-normal break-words">
        {mix.description}
      </p>
    </div>
  );
}

// ── Clean Cover Card (With Clickable Title & Artist) ─────────────────────────
function CleanCoverCard({
  title,
  subtitle,
  cover,
  icon: Icon,
  isLiked,
  track,
  onClick,
}: {
  title: string;
  subtitle: string;
  cover?: string;
  icon?: LucideIcon;
  isLiked?: boolean;
  track?: Track;
  onClick: () => void;
}) {
  const setView = usePlayerStore((s) => s.setView);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isActive = track ? isTrackActive(currentTrack, track) : false;

  const needsSpotifyNavigation = Boolean(track?.spotifyId && (!track?.albumId || !track?.artistId));
  const { data: spotifyMetadata } = useQuery({
    queryKey: ['spotify-metadata', track?.spotifyId],
    queryFn: () => api.spotifyMetadata(track!.spotifyId!),
    enabled: needsSpotifyNavigation,
    staleTime: 1000 * 60 * 60,
  });

  const albumViewId = track?.albumId ?? spotifyMetadata?.album?.id;
  const artistViewId = track?.artistId ?? spotifyMetadata?.artists[0]?.id;

  const handleTitleClick = (e: React.MouseEvent) => {
    if (albumViewId) {
      e.stopPropagation();
      setView('album', albumViewId);
    }
  };

  const handleArtistClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    let resolvedArtistId = artistViewId;
    if (!resolvedArtistId && track) resolvedArtistId = await resolveYouTubeChannelId(track);
    if (resolvedArtistId) setView('artist', resolvedArtistId);
  };

  return (
    <div className="group text-left transition-all duration-200">
      <div
        onClick={onClick}
        className={clsx(
          'relative mb-2.5 aspect-square w-full cursor-pointer overflow-hidden rounded-xl bg-base-800 shadow-lg border transition-all duration-300 flex items-center justify-center',
          isActive
            ? 'border-accent'
            : 'border-white/[0.06]'
        )}
      >
        {cover ? (
          <img
            src={cover}
            alt=""
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : isLiked ? (
          <Heart size={36} strokeWidth={1.4} fill="currentColor" className="text-accent" />
        ) : Icon ? (
          <Icon size={32} strokeWidth={1.4} className="text-accent" />
        ) : (
          <ListOrdered size={32} strokeWidth={1.4} className="text-accent" />
        )}
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-1.5">
        <div className="min-w-0 flex-1">
          <p
            onClick={albumViewId ? handleTitleClick : onClick}
            className={clsx(
              'truncate text-sm font-semibold transition-colors cursor-pointer text-white',
              albumViewId ? 'hover:text-accent' : 'group-hover:text-accent'
            )}
            title={title}
          >
            {title}
          </p>

          {track?.artist ? (
            <p
              onClick={handleArtistClick}
              className="mt-0.5 truncate text-xs text-muted transition-colors hover:text-accent cursor-pointer"
              title={`Go to artist: ${subtitle}`}
            >
              {subtitle}
            </p>
          ) : (
            <p className="mt-0.5 truncate text-xs text-muted">{subtitle}</p>
          )}
        </div>

        {isActive && isPlaying && (
          <div className="flex gap-0.5 items-end h-3 flex-shrink-0 self-center mr-2.5">
            <div className="w-0.5 h-3 bg-accent rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
            <div className="w-0.5 h-1.5 bg-accent rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
            <div className="w-0.5 h-2.5 bg-accent rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── GPU-Accelerated Horizontal Carousel ──────────────────────────────────────
function AutoScrollCarousel({
  tracks,
  onPlay,
}: {
  tracks: Track[];
  onPlay: (track: Track) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const isHoveredRef = useRef(false);
  const offsetXRef = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    const track = trackRef.current;
    if (!container || !track) return;

    let rafId: number;
    let holdTimeout: ReturnType<typeof setTimeout> | null = null;
    let isHolding = false;
    const speed = 0.35;

    const handleWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > 0) {
        e.preventDefault();
        const maxScroll = track.scrollWidth - container.clientWidth;
        if (maxScroll > 0) {
          offsetXRef.current = Math.min(maxScroll, Math.max(0, offsetXRef.current + e.deltaY));
          track.style.transform = `translate3d(-${offsetXRef.current}px, 0, 0)`;
        }
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });

    const step = () => {
      if (!isHoveredRef.current && !isHolding) {
        const maxScroll = track.scrollWidth - container.clientWidth;
        if (maxScroll > 0) {
          if (offsetXRef.current >= maxScroll - 1) {
            isHolding = true;
            holdTimeout = setTimeout(() => {
              offsetXRef.current = 0;
              if (track) track.style.transform = `translate3d(0px, 0, 0)`;
              isHolding = false;
            }, 2500);
          } else {
            offsetXRef.current += speed;
            track.style.transform = `translate3d(-${offsetXRef.current}px, 0, 0)`;
          }
        }
      }
      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(rafId);
      if (holdTimeout) clearTimeout(holdTimeout);
      container.removeEventListener('wheel', handleWheel);
    };
  }, [tracks]);

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => (isHoveredRef.current = true)}
      onMouseLeave={() => (isHoveredRef.current = false)}
      className="w-full overflow-hidden pb-2"
    >
      <div
        ref={trackRef}
        className="flex gap-4 will-change-transform"
        style={{ transform: 'translate3d(0px, 0, 0)' }}
      >
        {tracks.map((track, idx) => (
          <div key={`${track.spotifyId ?? track.id}-${idx}`} className="w-36 flex-shrink-0 sm:w-44">
            <CleanCoverCard
              title={track.title}
              subtitle={track.artist}
              cover={track.thumbnail}
              track={track}
              onClick={() => onPlay(track)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Manual Horizontal Carousel (No Autoscroll) ─────────────────────────────
function ManualHorizontalCarousel({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  return (
    <div
      ref={containerRef}
      className="scrollbar-hidden flex gap-4 overflow-x-auto pb-2 scroll-smooth"
    >
      {children}
    </div>
  );
}

// ── Main HomeView Component ─────────────────────────────────────────────────
export function HomeView() {
  const { queue, queueIndex, playTrack, setView, openPersonalMix } = usePlayerStore();
  const queryClient = useQueryClient();
  const cachedNightlyMix = useMemo(() => readNightlyMixCache(), []);
  const cachedHomeLocal = useMemo(() => readHomeLocalCache(), []);
  const cachedNewReleases = useMemo(() => readNewReleasesCache(), []);

  const upcomingQueue = useMemo(() => {
    if (!queue || queue.length === 0) return [];
    const startIndex = Math.max(0, queueIndex);
    return queue.slice(startIndex, startIndex + 8);
  }, [queue, queueIndex]);

  const { data: homeLocalData } = useQuery({
    queryKey: ['home'],
    queryFn: api.home,
    staleTime: HOME_REFRESH_MS,
    refetchOnWindowFocus: false,
    initialData: cachedHomeLocal?.data,
    initialDataUpdatedAt: cachedHomeLocal?.updatedAt,
  });

  const { data: newReleasesData, isLoading: newReleasesLoading } = useQuery({
    queryKey: ['home-new-releases'],
    queryFn: api.homeNewReleases,
    staleTime: HOME_REFRESH_MS,
    refetchOnWindowFocus: false,
    initialData: cachedNewReleases?.data,
    initialDataUpdatedAt: cachedNewReleases?.updatedAt,
  });

  const {
    data: nightlyMixData,
    isLoading: nightlyMixLoading,
    isFetching: nightlyMixFetching,
  } = useQuery({
    queryKey: ['nightly-mix', NIGHTLY_MIX_LIMIT, NIGHTLY_MIX_TRACKS],
    queryFn: () => api.nightlyMixes(NIGHTLY_MIX_LIMIT, NIGHTLY_MIX_TRACKS),
    staleTime: NIGHTLY_MIX_REFRESH_INTERVAL_MS,
    refetchInterval: NIGHTLY_MIX_REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: false,
    initialData: cachedNightlyMix?.data,
    initialDataUpdatedAt: cachedNightlyMix?.updatedAt,
  });

  const recentTracks = homeLocalData?.recentTracks ?? [];
  const playlists = homeLocalData?.playlists ?? [];
  const newReleases = newReleasesData?.newReleases ?? [];
  const nightlyMixes = nightlyMixData?.mixes ?? [];

  useEffect(() => {
    if (nightlyMixData?.mixes.length && nightlyMixData) {
      writeNightlyMixCache(nightlyMixData, Date.now());
    }
  }, [nightlyMixData]);

  useEffect(() => {
    if (homeLocalData && (homeLocalData.recentTracks.length > 0 || homeLocalData.playlists.length > 0)) {
      writeHomeLocalCache(homeLocalData, Date.now());
    }
  }, [homeLocalData]);

  useEffect(() => {
    if (newReleasesData?.newReleases.length) {
      writeNewReleasesCache(newReleasesData, Date.now());
    }
  }, [newReleasesData]);

  useEffect(() => {
    const refreshHomeHistory = (event: Event) => {
      const detail = (event as CustomEvent<{ track?: CachedTrack; optimistic?: boolean }>).detail;
      if (detail?.optimistic && detail.track) {
        queryClient.setQueryData<{ playlists: Playlist[]; recentTracks: CachedTrack[] }>(['home'], (current) => {
          if (!current) return current;
          return {
            ...current,
            recentTracks: [detail.track!, ...current.recentTracks.filter((item) => item.id !== detail.track!.id)].slice(0, 20),
          };
        });
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ['home'] });
    };
    window.addEventListener('noctune:history-updated', refreshHomeHistory);
    return () => window.removeEventListener('noctune:history-updated', refreshHomeHistory);
  }, [queryClient]);

  function handlePlay(track: Track) {
    playTrack(track, [track], { autoQueue: true, queueSource: 'recommendation' });
  }

  return (
    <div className="flex h-full flex-col gap-9 overflow-y-auto px-4 pt-5 pb-4 sm:px-6 lg:px-9 lg:pt-8 lg:pb-5">
      {/* Home Header + Minimalist Shortcut Pills */}
      <section className="flex flex-col gap-4">
        <div>
          <p className="text-xs font-semibold tracking-wider text-accent uppercase">Home</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight mt-1">
            Welcome
          </h1>
          <p className="text-xs text-muted mt-1.5">
            Your personal music hub — recommendations, history & playlists.
          </p>
        </div>

        {/* Minimalist Shortcut Pills */}
        <div className="flex items-center gap-2 flex-wrap pt-1">
          <ShortcutPill
            title="Liked Songs"
            icon={Heart}
            accentColor="text-rose-400"
            onClick={() => setView('playlist', 'system-liked-songs')}
          />
          <ShortcutPill
            title="Top Favorites"
            icon={Zap}
            accentColor="text-amber-400"
            onClick={() => setView('playlist', 'smart:most-played')}
          />
          <ShortcutPill
            title="Discover Weekly"
            icon={Compass}
            accentColor="text-indigo-400"
            onClick={() => setView('playlist', 'smart:discover-weekly')}
          />
          <ShortcutPill
            title="Recently Played"
            icon={Clock}
            accentColor="text-emerald-400"
            onClick={() => setView('history')}
          />
          <ShortcutPill
            title="Short Tracks"
            icon={Disc3}
            accentColor="text-cyan-400"
            onClick={() => setView('playlist', 'smart:short-tracks')}
          />
        </div>
      </section>

      {/* Continue Listening Section (From Queue - Auto-scroll Carousel) */}
      {upcomingQueue.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ListOrdered size={16} className="text-accent" />
              <h2 className="text-base font-semibold text-white">Continue Listening</h2>
            </div>
            <button
              onClick={() => setView('queue')}
              className="text-xs text-muted transition-colors hover:text-accent font-medium"
            >
              View queue ({queue.length}) →
            </button>
          </div>
          <AutoScrollCarousel
            tracks={upcomingQueue}
            onPlay={(track) => playTrack(track, queue, { autoQueue: false })}
          />
        </section>
      )}

      {/* Nightly Mix Section (Full Description) */}
      {(nightlyMixLoading || nightlyMixes.length > 0) && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-accent" />
              <h2 className="text-base font-semibold text-white">Nightly Mix</h2>
            </div>
            {(nightlyMixLoading || (nightlyMixFetching && nightlyMixes.length === 0)) && (
              <span className="text-xs text-muted">Tuning mixes...</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {nightlyMixes.map((mix) => (
              <CleanMixCard key={mix.id} mix={mix} onPlay={openPersonalMix} />
            ))}
          </div>
        </section>
      )}

      {/* Recently Played Section (Clear Cache Enabled) */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-accent" />
            <h2 className="text-base font-semibold text-white">Recently Played</h2>
          </div>
          {recentTracks.length > 0 && (
            <button
              onClick={() => setView('history')}
              className="text-xs text-muted transition-colors hover:text-accent font-medium"
            >
              See full history →
            </button>
          )}
        </div>
        {recentTracks.length > 0 ? (
          <div className="flex flex-col gap-0.5">
            {recentTracks.slice(0, 6).map((track, idx) => (
              <OpenTrackRow key={track.id} track={track} index={idx} onPlay={handlePlay} />
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-3 py-4 text-muted">
            <Music2 size={18} />
            <p className="text-sm">Your played tracks will appear here.</p>
          </div>
        )}
      </section>

      {/* Saved Local Playlists (Manual Horizontal Scroll) */}
      {playlists.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ListMusic size={16} className="text-accent" />
              <h2 className="text-base font-semibold text-white">Your Playlists</h2>
            </div>
            <span className="text-xs text-muted font-medium">
              {playlists.length} {playlists.length === 1 ? 'playlist' : 'playlists'}
            </span>
          </div>
          <ManualHorizontalCarousel>
            {playlists.map((playlist) => (
              <div key={playlist.id} className="w-28 flex-shrink-0 sm:w-32">
                <CleanCoverCard
                  title={playlist.name}
                  subtitle={`${playlist.trackIds.length} tracks`}
                  cover={playlist.coverDataUrl || undefined}
                  isLiked={playlist.id === 'system-liked-songs'}
                  onClick={() => setView('playlist', playlist.id)}
                />
              </div>
            ))}
          </ManualHorizontalCarousel>
        </section>
      )}

      {/* New Releases Section (Horizontal Autoscroll) */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-accent" />
            <h2 className="text-base font-semibold text-white">New Releases</h2>
          </div>
          {newReleasesLoading && newReleases.length === 0 && <span className="text-xs text-muted">Loading...</span>}
        </div>
        {newReleases.length > 0 ? (
          <AutoScrollCarousel tracks={newReleases} onPlay={handlePlay} />
        ) : newReleasesLoading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <div key={item} className="animate-pulse">
                <div className="mb-2.5 aspect-square rounded-xl bg-base-800" />
                <div className="h-3.5 w-24 rounded bg-base-800" />
                <div className="mt-1 h-3 w-16 rounded bg-base-800/70" />
              </div>
            ))}
          </div>
        ) : (
          <p className="py-2 text-sm text-muted">
            Connect Spotify in Settings to show new releases here.
          </p>
        )}
      </section>
    </div>
  );
}
