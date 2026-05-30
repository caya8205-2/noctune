import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import { Clock, Disc3, Heart, ListOrdered, ListPlus, Music2, Play, Radio, Search, Sparkles } from 'lucide-react';
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
    <div className="group text-left rounded-lg border border-base-600/70 bg-base-800 p-3 hover:bg-base-700 transition-colors min-w-36 sm:min-w-0">
      <button type="button" onClick={() => onPlay(track)} className="relative mb-3 block w-full text-left">
        {track.thumbnail ? (
          <img
            src={track.thumbnail}
            alt=""
            className="aspect-square w-full rounded-lg object-cover border border-base-600/60"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        ) : (
          <div className="aspect-square w-full rounded-lg bg-base-700 border border-base-600/60 flex items-center justify-center text-muted">
            <Music2 size={28} strokeWidth={1.4} />
          </div>
        )}
        <span className="absolute right-2 bottom-2 w-8 h-8 rounded-full bg-accent text-base-950 flex items-center justify-center opacity-100 sm:opacity-0 sm:translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all">
          <Play size={14} fill="currentColor" />
        </span>
      </button>
      <p className="text-sm font-semibold text-white truncate">{track.title}</p>
      <p className="text-xs text-muted truncate mt-1">{track.artist}</p>
      <div className="flex items-center justify-between gap-2 mt-3">
        <div className="flex items-center gap-1.5 text-[11px] text-muted">
          <Clock size={11} />
          <span className="font-mono">{formatDuration(track.duration)}</span>
        </div>
        <div className="flex items-center gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            className="btn-ghost p-1.5"
            title="Add to queue"
            onClick={() => onAddToQueue(track)}
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
    <div className="w-10 h-10 rounded-lg bg-base-700 border border-base-600/60 flex items-center justify-center text-accent mb-4">
      <Icon size={18} strokeWidth={2} />
    </div>
  );
}

function PlaylistCover({ playlist }: { playlist: Playlist }) {
  const isLikedPlaylist = playlist.id === 'system-liked-songs';
  return (
    <div className="aspect-square w-full rounded-lg bg-base-700 border border-base-600/60 flex items-center justify-center text-accent overflow-hidden mb-3">
      {playlist.coverDataUrl ? (
        <img src={playlist.coverDataUrl} alt="" className="w-full h-full object-cover" />
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
    <div className="flex flex-col h-full overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 lg:px-9 lg:py-8 gap-8">
      <section className="flex flex-col gap-8">
        <div className="max-w-3xl">
          <p className="section-label text-accent mb-3">Home</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight">
            Start from your library.
          </h1>
          <p className="text-sm text-muted leading-relaxed mt-3 max-w-2xl">
            Pick up what was playing, open a playlist, or discover something new.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {currentTrack && (
            <button
              onClick={() => setView('player')}
              className="surface-panel p-5 text-left hover:bg-base-700 transition-colors"
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <img
                  src={currentTrack.thumbnail}
                  alt=""
                  className="w-10 h-10 rounded-lg object-cover border border-base-600/60"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
                <Radio size={16} className="text-accent mt-1" />
              </div>
              <p className="section-label text-accent mb-2">Now playing</p>
              <p className="text-sm font-semibold text-white truncate">{currentTrack.title}</p>
              <p className="text-xs text-muted truncate mt-1">{currentTrack.artist}</p>
            </button>
          )}

        <button
          onClick={() => setView('search')}
          className="surface-panel p-5 text-left hover:bg-base-700 transition-colors"
        >
          <HomeCardIcon icon={Search} />
          <p className="text-sm font-semibold text-white">Search music</p>
          <p className="text-xs text-muted mt-1 leading-relaxed">Find a track, then build a queue from it.</p>
        </button>

        <button
          onClick={() => setView('queue')}
          className="surface-panel p-5 text-left hover:bg-base-700 transition-colors"
        >
          <HomeCardIcon icon={ListOrdered} />
          <p className="text-sm font-semibold text-white">{queue.length} queued</p>
          <p className="text-xs text-muted mt-1 leading-relaxed">Review what will play next.</p>
        </button>

        <div className="surface-panel p-5">
          <HomeCardIcon icon={Disc3} />
          <p className="text-sm font-semibold text-white">{playlists.length} playlists</p>
          <p className="text-xs text-muted mt-1 leading-relaxed">Local playlists saved on this device.</p>
        </div>
        </div>
      </section>

      {playlists.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-label">Playlists</h2>
            <button onClick={() => setView('playlist', playlists[0]?.id)} className="text-xs text-muted hover:text-white">
              Open latest
            </button>
          </div>
          <div className="-mx-4 flex gap-3 overflow-x-auto scrollbar-hidden px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 sm:overflow-visible sm:px-0 sm:pb-0">
            {playlists.slice(0, 6).map((playlist) => (
              <button
                key={playlist.id}
                onClick={() => setView('playlist', playlist.id)}
                className="surface-panel min-w-28 sm:min-w-0 p-3 text-left hover:bg-base-700 transition-colors"
              >
                <PlaylistCover playlist={playlist} />
                <p className="text-sm font-semibold text-white truncate">{playlist.name}</p>
                <p className="text-xs text-muted mt-1">{playlist.trackIds.length} tracks</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {visibleQueue.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-label">Recommended next</h2>
            <button onClick={() => setView('queue')} className="text-xs text-muted hover:text-white">
              View queue
            </button>
          </div>
          <div className="-mx-4 flex gap-3 overflow-x-auto scrollbar-hidden px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 sm:overflow-visible sm:px-0 sm:pb-0">
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
        <div className="flex items-center justify-between mb-3">
          <h2 className="section-label">Recently played</h2>
          {isLoading && <span className="text-xs text-muted">Loading</span>}
        </div>
        {recentTracks.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {recentTracks.slice(0, 8).map((track) => (
              <TrackCard key={track.id} track={track} onPlay={handlePlay} onAddToQueue={addToQueue} />
            ))}
          </div>
        ) : (
          <div className="surface-panel p-5 flex items-center gap-3 text-muted">
            <Music2 size={18} />
            <p className="text-sm">Your played tracks will appear here.</p>
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={14} className="text-accent" />
          <h2 className="section-label">New releases</h2>
        </div>
        {newReleases.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
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
