import { useQuery } from '@tanstack/react-query';
import { Clock, ListMusic, Music2, Play } from 'lucide-react';
import { api, type Track } from '../../utils/api';
import { formatDuration } from '../../utils/format';
import { usePlayerStore } from '../../store/player';

export function PlaylistView() {
  const { activePlaylistId, playTrack, currentTrack, isPlaying } = usePlayerStore();
  const { data: playlist, isLoading } = useQuery({
    queryKey: ['playlist', activePlaylistId],
    queryFn: () => api.getPlaylist(activePlaylistId!),
    enabled: Boolean(activePlaylistId),
  });

  const tracks = playlist?.tracks ?? [];

  function handlePlay(track: Track) {
    playTrack(track, tracks);
  }

  if (!activePlaylistId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted px-6">
        <ListMusic size={30} strokeWidth={1.2} />
        <p className="text-sm">Select a playlist from the sidebar.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-9 pt-8 pb-5">
        <p className="section-label text-accent">Playlist</p>
        <h1 className="text-4xl font-bold text-white leading-tight mt-2">
          {playlist?.name ?? 'Playlist'}
        </h1>
        <p className="text-xs text-muted mt-2">
          {isLoading ? 'Loading tracks' : `${tracks.length} tracks`}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-7 pb-6">
        {!isLoading && tracks.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted">
            <div className="w-14 h-14 rounded-xl bg-base-800 border border-base-600/30 flex items-center justify-center">
              <Music2 size={28} strokeWidth={1.2} />
            </div>
            <p className="text-sm">No tracks saved in this playlist yet.</p>
          </div>
        )}

        {tracks.map((track, i) => {
          const isActive = currentTrack?.id === track.id || currentTrack?.spotifyId === track.spotifyId;
          return (
            <div
              key={`${track.id}-${track.spotifyId ?? 'playlist'}-${i}`}
              className={`track-row group max-w-3xl ${isActive ? 'active' : ''}`}
              onDoubleClick={() => handlePlay(track)}
            >
              <span className="w-5 text-xs text-muted text-right flex-shrink-0">{i + 1}</span>
              {track.thumbnail ? (
                <img
                  src={track.thumbnail}
                  alt=""
                  className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-base-700 border border-base-600/60 flex items-center justify-center text-muted flex-shrink-0">
                  <Music2 size={16} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className={`text-sm truncate ${isActive ? 'text-accent font-medium' : 'text-white'}`}>
                  {track.title}
                </p>
                <p className="text-xs text-muted truncate">{track.artist}</p>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted flex-shrink-0">
                <Clock size={10} />
                <span className="font-mono">{formatDuration(track.duration)}</span>
              </div>
              <button
                className="opacity-0 group-hover:opacity-100 btn-ghost ml-1 transition-opacity"
                onClick={() => handlePlay(track)}
                title="Play"
              >
                <Play size={14} fill="currentColor" />
              </button>
              {isActive && isPlaying && <span className="text-xs text-accent">Playing</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
