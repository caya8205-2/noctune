import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, GripVertical, ListMusic, Music2, Play } from 'lucide-react';
import { api, type Track } from '../../utils/api';
import { formatDuration } from '../../utils/format';
import { usePlayerStore } from '../../store/player';
import { clsx } from 'clsx';

export function PlaylistView() {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const { activePlaylistId, playTrack, currentTrack } = usePlayerStore();
  const qc = useQueryClient();
  const { data: playlist, isLoading } = useQuery({
    queryKey: ['playlist', activePlaylistId],
    queryFn: () => api.getPlaylist(activePlaylistId!),
    enabled: Boolean(activePlaylistId),
  });

  const tracks = playlist?.tracks ?? [];

  function handlePlay(track: Track) {
    playTrack(track, tracks);
  }

  async function handleReorder(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    if (!activePlaylistId) return;
    try {
      await api.reorderPlaylistTracks(activePlaylistId, fromIndex, toIndex);
      qc.invalidateQueries({ queryKey: ['playlist', activePlaylistId] });
    } catch (err) {
      console.error('Reorder failed:', err);
    }
    setDragIndex(null);
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
          {isLoading ? 'Loading tracks' : tracks.length + ' tracks'}
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
              key={track.id + (track.spotifyId ?? '') + i}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null) handleReorder(dragIndex, i);
              }}
              onDragEnd={() => setDragIndex(null)}
              className={clsx(
                'group max-w-3xl flex items-center px-3 py-2.5 rounded-lg border border-transparent hover:bg-base-800 hover:border-base-600/60 cursor-pointer transition-colors duration-100',
                isActive && 'bg-base-700 ring-1 ring-accent/20 border-accent/20',
                dragIndex === i && 'opacity-50'
              )}
              onDoubleClick={() => handlePlay(track)}
            >
              <div className="w-4 mr-1 flex-shrink-0 flex items-center justify-center text-muted cursor-grab">
                <GripVertical size={14} />
              </div>
              <span className="w-5 text-xs text-muted text-center flex-shrink-0">{i + 1}</span>
              {track.thumbnail ? (
                <img
                  src={track.thumbnail}
                  alt=""
                  className="w-10 h-10 mx-2 rounded-lg object-cover flex-shrink-0"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
              ) : (
                <div className="w-10 h-10 mx-2 rounded-lg bg-base-700 border border-base-600/60 flex items-center justify-center text-muted flex-shrink-0">
                  <Music2 size={16} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className={'text-sm truncate ' + (isActive ? 'text-accent font-medium' : 'text-white')}>
                  {track.title}
                </p>
                <p className="text-xs text-muted truncate">{track.artist}</p>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted flex-shrink-0 mr-2">
                <Clock size={10} />
                <span className="font-mono">{formatDuration(track.duration)}</span>
              </div>
              <button
                className="opacity-0 group-hover:opacity-100 btn-ghost transition-opacity"
                onClick={() => handlePlay(track)}
                title="Play"
              >
                <Play size={14} fill="currentColor" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
