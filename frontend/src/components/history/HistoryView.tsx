import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Clock3, House, ListMusic, ListOrdered, Music2, Search, Shuffle, X } from 'lucide-react';
import { clsx } from 'clsx';
import { api, type CachedTrack, type Track } from '../../utils/api';
import { formatDuration } from '../../utils/format';
import { usePlayerStore } from '../../store/player';
import { TrackActionButtons } from '../ui/TrackActionButtons';
import { TrackTitle } from '../ui/TrackTitle';

function playedLabel(value?: number): string {
  if (!value) return 'Unknown';
  const diff = Date.now() - value;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'Just now';
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < day * 7) return `${Math.floor(diff / day)}d ago`;
  return new Date(value).toLocaleDateString();
}

function historySource(track: CachedTrack): Track['originalSource'] | undefined {
  return track.queueSource !== 'history' ? track.queueSource : track.originalSource;
}

function historySourceBadge(track: CachedTrack) {
  const source = historySource(track);
  if (source === 'manual' || source === 'play-next') return { Icon: ListOrdered, label: 'Manual' };
  if (source === 'playlist') return { Icon: ListMusic, label: track.originalPlaylistName || 'Playlist' };
  if (source === 'autoqueue') return { Icon: Shuffle, label: 'Autoqueue' };
  if (source === 'recommendation') return { Icon: House, label: 'Home' };
  return { Icon: Search, label: 'Search' };
}

export function HistoryView() {
  const { currentTrack, isPlaying, playTrack, setView } = usePlayerStore();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['history'],
    queryFn: api.history,
  });
  const tracks = data?.tracks ?? [];

  useEffect(() => {
    const refreshHistory = () => qc.invalidateQueries({ queryKey: ['history'] });
    window.addEventListener('noctune:history-updated', refreshHistory);
    return () => window.removeEventListener('noctune:history-updated', refreshHistory);
  }, [qc]);

  async function handlePlay(track: CachedTrack) {
    const originalSource = historySource(track);
    if (originalSource === 'playlist') {
      try {
        let playlistId = track.originalPlaylistId;
        let playlistName = track.originalPlaylistName;
        let playlist = playlistId ? await api.getPlaylist(playlistId) : undefined;

        // History from before playlist context was persisted has no playlist ID.
        // Find its current playlist so it still resumes as a playlist queue.
        if (!playlist) {
          const playlists = await api.getPlaylists();
          const candidates = await Promise.all(playlists.map((item) => api.getPlaylist(item.id)));
          playlist = candidates.find((candidate) => candidate.tracks?.some((playlistTrack) =>
            playlistTrack.id === track.id ||
            Boolean(playlistTrack.spotifyId && track.spotifyId && playlistTrack.spotifyId === track.spotifyId)
          ));
          playlistId = playlist?.id;
          playlistName = playlist?.name;
        }

        if (playlist?.tracks && playlist.tracks.length > 0) {
          const playlistQueue = playlist.tracks.map((playlistTrack) => ({
            ...playlistTrack,
            queueSource: 'playlist' as const,
            originalSource: 'playlist' as const,
            originalPlaylistId: playlistId,
            originalPlaylistName: playlistName,
          }));
          const selectedTrack = playlistQueue.find((playlistTrack) =>
            playlistTrack.id === track.id ||
            Boolean(playlistTrack.spotifyId && track.spotifyId && playlistTrack.spotifyId === track.spotifyId)
          ) ?? playlistQueue[0];
          playTrack(selectedTrack, playlistQueue, { autoQueue: false, queueSource: 'playlist' });
          return;
        }
      } catch (err) {
        console.warn('[history] failed to load playlist for context:', err);
      }

      // A playlist track must never turn into an autoqueue when its playlist
      // has been removed or cannot be loaded.
      playTrack({ ...track, originalSource, queueSource: 'playlist' }, [{ ...track, queueSource: 'playlist' }], {
        autoQueue: false,
        queueSource: 'playlist',
      });
      return;
    }
    const trackWithSource = {
      ...track,
      originalSource,
      queueSource: 'history' as const,
    };
    playTrack(trackWithSource, [trackWithSource], { autoQueue: true, queueSource: 'history' });
  }

  async function handleClearHistory() {
    await api.clearHistory();
    qc.invalidateQueries({ queryKey: ['history'] });
    qc.invalidateQueries({ queryKey: ['home'] });
  }

  async function handleRemoveHistoryItem(track: Track) {
    await api.removeHistoryItem(track.id);
    qc.invalidateQueries({ queryKey: ['history'] });
    qc.invalidateQueries({ queryKey: ['home'] });
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 pt-5 pb-4 sm:px-6 lg:px-9 lg:pt-8 lg:pb-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="section-label text-accent">History</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight mt-2">Recently played.</h1>
          <p className="text-xs text-muted mt-2">
            {isLoading ? 'Loading playback history' : `${tracks.length} tracks from local playback`}
          </p>
          <div className="flex items-center gap-3 mt-2 text-[10px] text-muted">
            <span className="flex items-center gap-1"><ListMusic size={10} /> Playlist</span>
            <span className="flex items-center gap-1"><Search size={10} /> Search</span>
            <span className="flex items-center gap-1"><House size={10} /> Home</span>
            <span className="flex items-center gap-1"><Shuffle size={10} /> Autoqueue</span>
          </div>
        </div>
        {tracks.length > 0 && (
          <button onClick={handleClearHistory} className="btn-ghost text-xs gap-1.5 px-2">
            <X size={12} /> Clear
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-9 pb-6">
        {!isLoading && tracks.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted">
            <div className="w-14 h-14 rounded-xl bg-base-800 border border-base-600/30 flex items-center justify-center">
              <Clock3 size={28} strokeWidth={1.2} />
            </div>
            <p className="text-sm">Played tracks will appear here.</p>
          </div>
        )}

        {tracks.map((track, i) => {
          const isActive =
            currentTrack?.id === track.id ||
            Boolean(currentTrack?.spotifyId && track.spotifyId && currentTrack.spotifyId === track.spotifyId);
          return (
              <div
              key={`${track.id}-${track.spotifyId ?? 'history'}-${i}`}
              className={clsx(
                'track-row group animate-fade-in',
                isActive && 'active'
              )}
              style={{ animationDelay: `${i * 20}ms` }}
              onClick={() => handlePlay(track)}
            >
              <div className="w-6 flex-shrink-0 flex items-center justify-center">
                {isActive && isPlaying ? (
                  <div className="flex gap-0.5 items-end h-3">
                    {[0, 1, 2].map((j) => (
                      <div
                        key={j}
                        className="w-0.5 bg-accent rounded-full animate-pulse"
                        style={{ height: `${[8, 12, 6][j]}px`, animationDelay: `${j * 150}ms` }}
                      />
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-muted">{i + 1}</span>
                )}
              </div>

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

              <TrackTitle track={track} isActive={isActive} setView={setView} />

              {(() => {
                const { Icon, label } = historySourceBadge(track);
                return (
                  <span
                    className="hidden md:inline-flex h-5 w-5 items-center justify-center rounded-md border border-base-600/60 text-muted flex-shrink-0"
                    title={`Source: ${label}`}
                    aria-label={`Source: ${label}`}
                  >
                    <Icon size={10} />
                  </span>
                );
              })()}

              <span className="hidden md:block text-xs text-muted flex-shrink-0 w-20 text-right">
                {playedLabel(track.lastPlayed)}
              </span>

              <div className="flex flex-shrink-0 items-center gap-1">
                <TrackActionButtons
                  track={track}
                  queueSource={track.originalSource || track.queueSource}
                  showQueue={false}
                  showMenu={true}
                  className="hidden sm:flex items-center justify-end gap-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  trailingActions={
                    <button
                      type="button"
                      className="btn-ghost p-1.5 text-muted hover:text-red-400"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveHistoryItem(track);
                      }}
                      title="Remove from history"
                    >
                      <X size={14} />
                    </button>
                  }
                />

                <span className="block w-12 text-right text-xs font-mono tabular-nums text-muted flex-shrink-0">
                  {formatDuration(track.duration)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
