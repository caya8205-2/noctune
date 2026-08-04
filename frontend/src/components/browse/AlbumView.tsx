import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Disc3, ExternalLink, Maximize2, Music2 } from 'lucide-react';
import { api, isTrackActive, type Track } from '../../utils/api';
import { clsx } from 'clsx';
import { formatDuration } from '../../utils/format';
import { usePlayerStore } from '../../store/player';
import { TrackActionButtons } from '../ui/TrackActionButtons';
import { ArtworkLightboxModal } from '../ui/ArtworkLightboxModal';

function AlbumTrackText({
  track,
  albumId,
  fallbackArtistId,
  isActive,
  setView,
}: {
  track: Track;
  albumId: string;
  fallbackArtistId?: string;
  isActive: boolean;
  setView: ReturnType<typeof usePlayerStore.getState>['setView'];
}) {
  const needsSpotifyNavigation = Boolean(track.spotifyId && !track.artistId);
  const { data: spotifyMetadata } = useQuery({
    queryKey: ['spotify-metadata', track.spotifyId],
    queryFn: () => api.spotifyMetadata(track.spotifyId!),
    enabled: needsSpotifyNavigation,
    staleTime: 1000 * 60 * 60,
  });
  const artistViewId = track.artistId ?? spotifyMetadata?.artists[0]?.id ?? fallbackArtistId;

  return (
    <div className="min-w-0 flex-1">
      <button
        type="button"
        className={`block max-w-full truncate text-left text-sm transition-colors hover:text-accent ${
          isActive ? 'font-medium text-accent' : 'text-white'
        }`}
        onClick={(event) => {
          event.stopPropagation();
          setView('album', albumId);
        }}
        title="Go to album"
      >
        {track.title}
      </button>
      {artistViewId ? (
        <button
          type="button"
          className="mt-0.5 block max-w-full truncate text-left text-xs text-muted transition-colors hover:text-accent"
          onClick={(event) => {
            event.stopPropagation();
            setView('artist', artistViewId);
          }}
          title={`Go to artist: ${track.artist}`}
        >
          {track.artist}
        </button>
      ) : (
        <p className="truncate text-xs text-muted">{track.artist}</p>
      )}
    </div>
  );
}

export function AlbumView({ albumId }: { albumId: string }) {
  const [showLightbox, setShowLightbox] = useState(false);
  const { playTrack, currentTrack, isPlaying, setView } = usePlayerStore();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['album', albumId],
    queryFn: () => api.browseAlbum(albumId),
    staleTime: 1000 * 60 * 10,
  });

  function handlePlayAll() {
    if (!data?.tracks.length) return;
    playTrack(data.tracks[0], data.tracks);
  }

  function handlePlayTrack(track: Track) {
    if (!data?.tracks.length) return;
    playTrack(track, data.tracks);
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted">
        <Disc3 size={36} strokeWidth={1} />
        <p className="text-sm">Album unavailable</p>
        <button onClick={() => setView('home')} className="btn-ghost text-xs gap-1.5">
          <ArrowLeft size={12} /> Go back
        </button>
      </div>
    );
  }

  const totalDuration = data.tracks.reduce((sum, t) => sum + t.duration, 0);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {showLightbox && data.image && (
        <ArtworkLightboxModal
          imageUrl={data.image}
          title={data.name}
          artist={data.artists.map(a => a.name).join(', ')}
          album={data.name}
          onClose={() => setShowLightbox(false)}
        />
      )}
      {/* Header */}
      <div className="relative flex-shrink-0 overflow-hidden">
        {data.image && (
          <div
            className="absolute inset-0 scale-110 bg-cover bg-center opacity-20 blur-xl"
            style={{ backgroundImage: `url(${data.image})` }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-base-900" />

        <div className="relative flex items-end gap-5 px-6 pb-6 pt-10">
          <button
            onClick={() => history.back()}
            className="btn-ghost absolute left-4 top-4 p-1.5"
            title="Go back"
          >
            <ArrowLeft size={16} />
          </button>

          {/* Album art */}
          {data.image ? (
            <button
              type="button"
              onClick={() => setShowLightbox(true)}
              className="group relative h-28 w-28 flex-shrink-0 rounded-lg overflow-hidden shadow-2xl ring-1 ring-white/10 text-left focus:outline-none focus:ring-2 focus:ring-accent"
              title="Click to view artwork"
            >
              <img
                src={data.image}
                alt={data.name}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-1 text-xs font-medium">
                <Maximize2 size={16} />
                <span>View Art</span>
              </div>
            </button>
          ) : (
            <div className="flex h-28 w-28 flex-shrink-0 items-center justify-center rounded-lg bg-base-800 ring-1 ring-white/10">
              <Music2 size={36} className="text-muted" />
            </div>
          )}

          <div className="min-w-0 flex-1 pb-1">
            <p className="section-label mb-1 capitalize">{data.type}</p>
            <h1 className="font-display text-2xl font-semibold text-white leading-tight">
              {data.name}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
              {/* Artist names clickable */}
              {data.artists.map((artist, i) => (
                <span key={artist.id}>
                  <button
                    className="font-display hover:text-accent transition-colors"
                    onClick={() => usePlayerStore.getState().setView('artist' as never, artist.id)}
                  >
                    {artist.name}
                  </button>
                  {i < data.artists.length - 1 && <span className="ml-1 text-base-600">,</span>}
                </span>
              ))}
              {data.releaseDate && (
                <span className="text-base-500">· {data.releaseDate.slice(0, 4)}</span>
              )}
              <span className="text-base-500">· {data.totalTracks} tracks</span>
              <span className="text-base-500">· {formatDuration(totalDuration)}</span>
              {data.label && <span className="text-base-500">· {data.label}</span>}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button onClick={handlePlayAll} className="btn-accent py-2 px-4 text-xs">
                ▶ Play all
              </button>
              {data.spotifyUrl && (
                <a
                  href={data.spotifyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-ghost gap-1.5 text-xs text-muted"
                >
                  <ExternalLink size={12} /> Spotify
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Track list */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="space-y-0.5 pt-2">
          {data.tracks.map(track => {
            const isActive = isTrackActive(currentTrack, track);
            return (
              <div
                key={track.id}
                className={`track-row group ${isActive ? 'active' : ''}`}
                onClick={() => handlePlayTrack(track)}
              >
                <div className="w-6 flex-shrink-0 flex items-center justify-center">
                  {isActive && isPlaying ? (
                    <div className="flex gap-0.5 items-end h-3 justify-center">
                      <div className="w-0.5 h-3 bg-accent rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                      <div className="w-0.5 h-1.5 bg-accent rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                      <div className="w-0.5 h-2.5 bg-accent rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                    </div>
                  ) : (
                    <span className={clsx('text-xs font-mono', isActive ? 'text-accent font-semibold' : 'text-muted')}>
                      {track.trackNumber}
                    </span>
                  )}
                </div>
                <AlbumTrackText
                  track={track}
                  albumId={albumId}
                  fallbackArtistId={data.artists[0]?.id}
                  isActive={isActive}
                  setView={setView}
                />
                <div className="flex flex-shrink-0 items-center gap-1">
                  <TrackActionButtons
                    track={track}
                    className="hidden sm:flex items-center gap-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  />
                  <span className="block w-12 flex-shrink-0 text-right font-mono text-xs tabular-nums text-muted">
                    {formatDuration(track.duration)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
