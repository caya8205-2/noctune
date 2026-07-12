import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { api, type Track } from '../../utils/api';
import { usePlayerStore } from '../../store/player';
import { canNavigateToChannel, navigateToChannel } from '../../utils/channelNavigation';
import { useState } from 'react';

function TrackTitle({
  track,
  isActive = false,
  setView,
}: {
  track: Track;
  isActive?: boolean;
  setView: ReturnType<typeof usePlayerStore.getState>['setView'];
}) {
  const [channelPending, setChannelPending] = useState(false);
  const needsSpotifyNavigation = Boolean(track.spotifyId && (!track.albumId || !track.artistId));
  const { data: spotifyMetadata } = useQuery({
    queryKey: ['spotify-metadata', track.spotifyId],
    queryFn: () => api.spotifyMetadata(track.spotifyId!),
    enabled: needsSpotifyNavigation,
    staleTime: 1000 * 60 * 60,
  });
  const albumViewId = track.albumId ?? spotifyMetadata?.album.id;
  const artistViewId = track.artistId ?? spotifyMetadata?.artists[0]?.id;
  const showChannelLink = !artistViewId && canNavigateToChannel(track);

  async function handleChannelNav(e: React.MouseEvent) {
    e.stopPropagation();
    setChannelPending(true);
    try {
      await navigateToChannel(track, setView);
    } finally {
      setChannelPending(false);
    }
  }

  const channelLinkClass = clsx(
    'mt-0.5 max-w-full truncate text-left text-xs transition-colors',
    channelPending ? 'text-accent/60 cursor-wait' : 'text-muted hover:text-accent cursor-pointer'
  );

  return (
    <div className="flex min-w-0 flex-1 flex-col items-start">
      {/* Track title */}
      {albumViewId ? (
        <button
          type="button"
          className={clsx(
            'max-w-full truncate text-left text-sm transition-colors hover:text-accent',
            isActive ? 'font-medium text-accent' : track.playbackError ? 'text-red-300' : 'text-white'
          )}
          onClick={(event) => {
            event.stopPropagation();
            setView('album', albumViewId);
          }}
          title={`Go to album: ${track.album ?? spotifyMetadata?.album.name ?? track.title}`}
        >
          {track.title}
        </button>
      ) : showChannelLink ? (
        <button
          type="button"
          className={clsx(
            'max-w-full truncate text-left text-sm transition-colors hover:text-accent',
            isActive ? 'font-medium text-accent' : track.playbackError ? 'text-red-300' : 'text-white'
          )}
          onClick={handleChannelNav}
          title={`Go to channel: ${track.artist}`}
        >
          {track.title}
        </button>
      ) : (
        <p
          className={clsx(
            'max-w-full truncate text-sm',
            isActive ? 'font-medium text-accent' : track.playbackError ? 'text-red-300' : 'text-white'
          )}
        >
          {track.title}
        </p>
      )}

      {/* Artist / channel */}
      {track.playbackError ? (
        <p className="max-w-full truncate text-xs text-muted">{track.playbackError}</p>
      ) : artistViewId ? (
        <button
          type="button"
          className="mt-0.5 max-w-full truncate text-left text-xs text-muted transition-colors hover:text-accent"
          onClick={(event) => {
            event.stopPropagation();
            setView('artist', artistViewId);
          }}
          title={`Go to artist: ${track.artist}`}
        >
          {track.artist}
        </button>
      ) : showChannelLink ? (
        <button
          type="button"
          className={channelLinkClass}
          onClick={handleChannelNav}
          disabled={channelPending}
          title={`Go to channel: ${track.artist}`}
        >
          {channelPending ? `${track.artist}…` : track.artist}
        </button>
      ) : (
        <p className="max-w-full truncate text-xs text-muted">{track.artist}</p>
      )}
    </div>
  );
}

export { TrackTitle };
