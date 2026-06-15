import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import { Disc3, Heart, ListOrdered, ListPlus, Music2, Radio, Search, Sparkles } from 'lucide-react';
import { api, type Playlist, type Track } from '../../utils/api';
import { formatDuration } from '../../utils/format';
import { usePlayerStore } from '../../store/player';
import { LikeButton } from './LikeButton';

function TrackCard({
  track,
  onPlay,
  onAddToQueue,
}: {
  track: Track;
  onPlay: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
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
        <div className="flex items-center gap-1 opacity-100 transition-opacity group-hover:opacity-100 sm:opacity-0">
          <button
            type="button"
            className="btn-ghost p-1.5"
            title="Add to queue"
            onClick={(event) => {
              event.stopPropagation();
              onAddToQueue(track);
            }}
          >
            <ListPlus size={14} />
          </button>
          <LikeButton track={track} className="p-1.5" />
        </div>
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

export function HomeView() {
  const { currentTrack, queue, playTrack, setView, addToQueue } = usePlayerStore();
  const { data, isLoading } = useQuery({
    queryKey: ['home'],
    queryFn: api.home,
  });

  const recentTracks = data?.recentTracks ?? [];
  const newReleases = data?.newReleases ?? [];
  const playlists = data?.playlists ?? [];
  const visibleQueue = useMemo(() => queue.slice(0, 5), [queue]);

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

      {visibleQueue.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-label">Recommended next</h2>
            <button onClick={() => setView('queue')} className="text-xs text-muted transition-colors hover:text-accent">
              View queue
            </button>
          </div>
          <div className="scrollbar-hidden -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4 xl:grid-cols-5">
            {visibleQueue.map((track) => (
              <TrackCard
                key={`${track.id}-${track.spotifyId ?? 'track'}`}
                track={track}
                onPlay={handlePlay}
                onAddToQueue={addToQueue}
              />
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
              <TrackCard key={track.id} track={track} onPlay={handlePlay} onAddToQueue={addToQueue} />
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
              <TrackCard key={track.spotifyId ?? track.id} track={track} onPlay={handlePlay} onAddToQueue={addToQueue} />
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
