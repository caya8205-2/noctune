import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import { Disc3, Heart, ListOrdered, Music2, Radio, Search, Sparkles } from 'lucide-react';
import { api, type PersonalMix, type Playlist, type Track } from '../../utils/api';
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
    // Cache is only a speed/rate-limit helper; failing to persist should not break Home.
  }
}

function TrackCard({
  track,
  onPlay,
}: {
  track: Track;
  onPlay: (track: Track) => void;
}) {
  return (
    <div
      className="group min-w-36 cursor-pointer rounded-2xl border border-white/[0.06] bg-base-800/60 p-3 backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-white/[0.1] hover:bg-base-700/70 sm:min-w-0"
      onClick={() => onPlay(track)}
    >
      <div className="relative mb-3 block w-full overflow-hidden rounded-xl text-left">
        {track.thumbnail ? (
          <img
            src={track.thumbnail}
            alt=""
            className="aspect-square w-full rounded-xl border border-white/[0.06] object-cover transition-transform duration-300 group-hover:scale-[1.04]"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        ) : (
          <div className="flex aspect-square w-full items-center justify-center rounded-xl border border-white/[0.06] bg-base-700 text-muted">
            <Music2 size={28} strokeWidth={1.4} />
          </div>
        )}
      </div>
      <p className="truncate text-sm font-semibold text-white">{track.title}</p>
      <p className="mt-1 truncate text-xs text-muted">{track.artist}</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] tabular-nums text-muted">{formatDuration(track.duration)}</span>
        <TrackActionButtons
          track={track}
          className="opacity-100 transition-opacity group-hover:opacity-100 sm:opacity-0"
          showClearCache={false}
        />
      </div>
    </div>
  );
}

function HomeCardIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent">
      <Icon size={18} strokeWidth={2} />
    </div>
  );
}

function PlaylistCover({ playlist }: { playlist: Playlist }) {
  const isLikedPlaylist = playlist.id === 'system-liked-songs';
  return (
    <div className="mb-3 flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border border-white/[0.06] bg-base-700 text-accent">
      {playlist.coverDataUrl ? (
        <img src={playlist.coverDataUrl} alt="" className="h-full w-full object-cover" />
      ) : isLikedPlaylist ? (
        <Heart size={30} strokeWidth={1.5} fill="currentColor" />
      ) : (
        <ListOrdered size={30} strokeWidth={1.4} />
      )}
    </div>
  );
}

function PersonalMixCard({
  mix,
  onPlay,
}: {
  mix: PersonalMix;
  onPlay: (mix: PersonalMix) => void;
}) {
  const preview = mix.tracks.slice(0, 3).map((track) => track.artist).join(', ');

  return (
    <button
      type="button"
      onClick={() => onPlay(mix)}
      className="surface-panel group min-w-44 overflow-hidden p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:bg-base-700/70 sm:min-w-0"
    >
      <div className="relative mb-3 aspect-square overflow-hidden rounded-xl border border-white/[0.06] bg-base-700">
        {mix.cover ? (
          <img
            src={mix.cover}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-accent">
            <Sparkles size={30} strokeWidth={1.4} />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-base-950/85 to-transparent p-3">
          <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-base-950/70 px-2 py-0.5 text-[10px] uppercase tracking-wide text-accent">
            <Sparkles size={10} />
            {mix.tracks.length} tracks
          </span>
        </div>
      </div>
      <p className="truncate text-sm font-semibold text-white">{mix.name}</p>
      <p className="mt-1 line-clamp-2 min-h-8 text-xs leading-4 text-muted">{mix.description}</p>
      {preview && <p className="mt-3 truncate text-[11px] text-soft">{preview}</p>}
    </button>
  );
}

export function HomeView() {
  const { currentTrack, queue, playTrack, setView, openPersonalMix } = usePlayerStore();
  const cachedNightlyMix = useMemo(() => readNightlyMixCache(), []);
  const { data, isLoading } = useQuery({
    queryKey: ['home'],
    queryFn: api.home,
  });
  const {
    data: nightlyMixData,
    dataUpdatedAt: nightlyMixUpdatedAt,
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

  const recentTracks = data?.recentTracks ?? [];
  const newReleases = data?.newReleases ?? [];
  const playlists = data?.playlists ?? [];
  const nightlyMixes = nightlyMixData?.mixes ?? [];

  useEffect(() => {
    if (nightlyMixData?.mixes.length && nightlyMixUpdatedAt) {
      writeNightlyMixCache(nightlyMixData, nightlyMixUpdatedAt);
    }
  }, [nightlyMixData, nightlyMixUpdatedAt]);

  function handlePlay(track: Track) {
    playTrack(track, [track], { autoQueue: true, queueSource: 'recommendation' });
  }

  return (
    <div className="flex h-full flex-col gap-10 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <section className="flex flex-col gap-8">
        <div className="relative max-w-3xl animate-rise">
          <div className="ambient-glow -left-10 -top-16 h-40 w-40 bg-accent/15" aria-hidden="true" />
          <p className="section-label mb-3 text-accent">Home</p>
          <h1 className="font-display text-4xl font-light leading-[1.05] text-white sm:text-5xl">
            Your night,<br />
            <span className="italic text-accent">scored.</span>
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-soft">
            Pick up where the music left off, open a playlist, or chase down something new.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {currentTrack && (
            <button
              onClick={() => setView('player')}
              className="surface-panel group relative overflow-hidden p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:bg-base-700/70"
            >
              <div className="ambient-glow -right-6 -top-6 h-24 w-24 bg-accent/20" aria-hidden="true" />
              <div className="mb-4 flex items-start justify-between gap-3">
                <img
                  src={currentTrack.thumbnail}
                  alt=""
                  className="h-10 w-10 rounded-lg border border-white/[0.08] object-cover"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
                <Radio size={16} className="mt-1 animate-pulse text-accent" />
              </div>
              <p className="section-label mb-2 text-accent">Now playing</p>
              <p className="truncate text-sm font-semibold text-white">{currentTrack.title}</p>
              <p className="mt-1 truncate text-xs text-muted">{currentTrack.artist}</p>
            </button>
          )}

          <button
            onClick={() => setView('search')}
            className="surface-panel p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:bg-base-700/70"
          >
            <HomeCardIcon icon={Search} />
            <p className="text-sm font-semibold text-white">Search music</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">Find a track, then build a queue from it.</p>
          </button>

          <button
            onClick={() => setView('queue')}
            className="surface-panel p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:bg-base-700/70"
          >
            <HomeCardIcon icon={ListOrdered} />
            <p className="text-sm font-semibold text-white">{queue.length} queued</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">Review what will play next.</p>
          </button>

          <div className="surface-panel p-5">
            <HomeCardIcon icon={Disc3} />
            <p className="text-sm font-semibold text-white">{playlists.length} playlists</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">Local playlists saved on this device.</p>
          </div>
        </div>
      </section>

      {playlists.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-label">Playlists</h2>
            <button onClick={() => setView('playlist', playlists[0]?.id)} className="text-xs text-muted transition-colors hover:text-accent">
              Open latest
            </button>
          </div>
          <div className="scrollbar-hidden -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4 xl:grid-cols-6">
            {playlists.slice(0, 6).map((playlist) => (
              <button
                key={playlist.id}
                onClick={() => setView('playlist', playlist.id)}
                className="surface-panel min-w-28 p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:bg-base-700/70 sm:min-w-0"
              >
                <PlaylistCover playlist={playlist} />
                <p className="truncate text-sm font-semibold text-white">{playlist.name}</p>
                <p className="mt-1 text-xs text-muted">{playlist.trackIds.length} tracks</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {(nightlyMixLoading || nightlyMixes.length > 0) && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="section-label">Nightly Mix</h2>
              <p className="mt-1 text-xs text-muted">A fresh drift from your recent plays.</p>
            </div>
            {(nightlyMixLoading || (nightlyMixFetching && nightlyMixes.length === 0)) && (
              <span className="text-xs text-muted">Tuning</span>
            )}
          </div>
          <div className="scrollbar-hidden -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4">
            {nightlyMixes.map((mix) => (
              <PersonalMixCard key={mix.id} mix={mix} onPlay={openPersonalMix} />
            ))}
            {nightlyMixLoading && nightlyMixes.length === 0 && [0, 1, 2, 3].map((item) => (
              <div key={item} className="surface-panel min-w-44 animate-pulse p-3 sm:min-w-0">
                <div className="mb-3 aspect-square rounded-xl bg-base-700/70" />
                <div className="h-4 w-24 rounded bg-base-700" />
                <div className="mt-2 h-3 w-full rounded bg-base-700/70" />
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-label">Recently played</h2>
          {isLoading && <span className="text-xs text-muted">Loading</span>}
        </div>
        {recentTracks.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {recentTracks.slice(0, 8).map((track) => (
              <TrackCard key={track.id} track={track} onPlay={handlePlay} />
            ))}
          </div>
        ) : (
          <div className="surface-panel flex items-center gap-3 p-5 text-muted">
            <Music2 size={18} />
            <p className="text-sm">Your played tracks will appear here.</p>
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Sparkles size={14} className="text-accent" />
          <h2 className="section-label">New releases</h2>
        </div>
        {newReleases.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {newReleases.map((track) => (
              <TrackCard key={track.spotifyId ?? track.id} track={track} onPlay={handlePlay} />
            ))}
          </div>
        ) : (
          <div className="surface-panel p-5 text-sm text-muted">
            Connect Spotify in Settings to show new releases here.
          </div>
        )}
      </section>
    </div>
  );
}
