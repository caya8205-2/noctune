import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, ListMusic, Maximize2, Music2, Users } from 'lucide-react';
import { useState } from 'react';
import { api, isTrackActive, type Track } from '../../utils/api';
import { clsx } from 'clsx';
import { formatDuration } from '../../utils/format';
import { usePlayerStore } from '../../store/player';
import { TrackActionButtons } from '../ui/TrackActionButtons';
import { ArtworkLightboxModal } from '../ui/ArtworkLightboxModal';

function compactNumber(n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat(undefined, { notation: 'compact' }).format(n);
}

export const channelTabByArtist = new Map<string, 'videos' | 'playlists'>();

function ArtistTrackText({
  track,
  isActive,
  setView,
}: {
  track: Track;
  isActive: boolean;
  setView: ReturnType<typeof usePlayerStore.getState>['setView'];
}) {
  const needsSpotifyNavigation = Boolean(track.spotifyId && !track.albumId);
  const { data: spotifyMetadata } = useQuery({
    queryKey: ['spotify-metadata', track.spotifyId],
    queryFn: () => api.spotifyMetadata(track.spotifyId!),
    enabled: needsSpotifyNavigation,
    staleTime: 1000 * 60 * 60,
  });
  const albumViewId = track.albumId ?? spotifyMetadata?.album.id;
  const albumName = track.album ?? spotifyMetadata?.album.name;

  return (
    <div className="min-w-0 flex-1">
      {albumViewId ? (
        <button
          type="button"
          className={`block max-w-full truncate text-left text-sm transition-colors hover:text-accent ${
            isActive ? 'font-medium text-accent' : 'text-white'
          }`}
          onClick={(event) => {
            event.stopPropagation();
            setView('album', albumViewId);
          }}
          title={`Go to album: ${albumName ?? track.title}`}
        >
          {track.title}
        </button>
      ) : (
        <p className={`truncate text-sm ${isActive ? 'font-medium text-accent' : 'text-white'}`}>
          {track.title}
        </p>
      )}
      {albumName && albumViewId ? (
        <button
          type="button"
          className="mt-0.5 block max-w-full truncate text-left text-xs text-muted transition-colors hover:text-accent"
          onClick={(event) => {
            event.stopPropagation();
            setView('album', albumViewId);
          }}
          title={`Go to album: ${albumName}`}
        >
          {albumName}
        </button>
      ) : albumName && albumName !== 'YouTube Release' ? (
        <p className="truncate text-xs text-muted">{albumName}</p>
      ) : track.artist ? (
        <p className="truncate text-xs text-muted">{track.artist}</p>
      ) : null}
    </div>
  );
}

export function ArtistView({ artistId }: { artistId: string }) {
  const [showLightbox, setShowLightbox] = useState(false);
  const { playTrack, currentTrack, isPlaying, setView, activeChannelTab } = usePlayerStore();
  const cleanArtistId = artistId.replace(/:(videos|playlists)$/, '');
  const channelTab = activeChannelTab ?? 'videos';
  const isYouTubeChannelId = cleanArtistId.startsWith('ytchannel:') || cleanArtistId.startsWith('UC') || cleanArtistId.startsWith('@');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['artist', cleanArtistId],
    queryFn: () => api.browseArtist(cleanArtistId),
    staleTime: isYouTubeChannelId ? 1000 * 60 * 5 : 1000 * 60 * 10,
    refetchOnMount: true,
  });

  function changeChannelTab(tab: 'videos' | 'playlists') {
    if (!isYouTubeChannelId || tab === channelTab) return;
    setView('artist', cleanArtistId, tab);
  }

  function handlePlay(track: Track) {
    playTrack(track, data?.topTracks);
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
        <Music2 size={36} strokeWidth={1} />
        <p className="text-sm">Artist unavailable</p>
        <button onClick={() => setView('home')} className="btn-ghost text-xs gap-1.5">
          <ArrowLeft size={12} /> Go back
        </button>
      </div>
    );
  }

  const isYouTubeChannel = data.id.startsWith('ytchannel:');

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {showLightbox && data.image && (
        <ArtworkLightboxModal
          imageUrl={data.image}
          title={data.name}
          artist={isYouTubeChannel ? 'Channel Avatar' : 'Artist Profile'}
          onClose={() => setShowLightbox(false)}
        />
      )}
      {/* Header */}
      <div className="relative flex-shrink-0 overflow-hidden">
        {/* Background blur */}
        {data.image && (
          <div
            className="absolute inset-0 scale-110 bg-cover bg-center opacity-20 blur-xl"
            style={{ backgroundImage: `url(${data.image})` }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-base-900" />

        <div className="relative flex items-start gap-5 px-6 pb-4 pt-12">
          <button
            onClick={() => history.back()}
            className="btn-ghost absolute left-4 top-4 p-1.5"
            title="Go back"
          >
            <ArrowLeft size={16} />
          </button>

          {/* Artist image - anchored at top-left with self-start */}
          {data.image ? (
            <button
              type="button"
              onClick={() => setShowLightbox(true)}
              className="group relative h-28 w-28 flex-shrink-0 self-start rounded-full overflow-hidden shadow-2xl ring-2 ring-white/10 text-left focus:outline-none focus:ring-2 focus:ring-accent"
              title="Click to view artwork"
            >
              <img
                src={data.image}
                alt={data.name}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-1 text-xs font-medium">
                <Maximize2 size={16} />
              </div>
            </button>
          ) : (
            <div className="flex h-28 w-28 flex-shrink-0 self-start items-center justify-center rounded-full bg-base-800 ring-2 ring-white/10">
              <Users size={36} className="text-muted" />
            </div>
          )}

          <div className="min-w-0 flex-1 pb-1">
            <p className="section-label mb-1">{isYouTubeChannel ? 'CHANNEL' : 'ARTIST'}</p>
            <h1 className="font-display text-3xl font-semibold text-white leading-tight truncate">
              {data.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
              {data.followers != null && typeof data.followers !== 'string' && (
                <span className="flex items-center gap-1">
                  <Users size={11} />
                  {`${compactNumber(data.followers as number)} followers`}
                </span>
              )}
              {data.genres.slice(0, 3).map(g => (
                <span key={g} className="rounded-full border border-white/10 bg-base-800 px-2 py-0.5">
                  {g}
                </span>
              ))}
            </div>

            {/* Clamped long bio description for topic/official channels */}
            {data.followers != null && typeof data.followers === 'string' && (
              <p
                className="mt-2 text-xs text-muted line-clamp-2 max-w-3xl leading-relaxed"
                title={data.followers}
              >
                {data.followers}
              </p>
            )}
          </div>

          {data.spotifyUrl && (
            <a
              href={data.spotifyUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-ghost ml-auto flex-shrink-0 gap-1.5 text-xs text-muted"
            >
              <ExternalLink size={12} />
              {data.spotifyUrl.includes('youtube.com') ? 'YouTube' : 'Spotify'}
            </a>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {isYouTubeChannel && (
          <div className="sticky top-0 z-20 -mx-6 mb-5 flex items-center gap-6 border-b border-white/[0.08] bg-base-900/95 px-6 py-1 backdrop-blur-md">
            <button
              type="button"
              onClick={() => changeChannelTab('videos')}
              className={clsx(
                '-mb-px inline-flex items-center gap-2 border-b-2 px-0.5 py-2.5 text-xs font-semibold uppercase tracking-[0.13em] transition-colors',
                channelTab === 'videos'
                  ? 'border-accent text-white'
                  : 'border-transparent text-muted hover:border-white/20 hover:text-soft'
              )}
            >
              Videos
              <span className={clsx('font-mono text-[10px] tabular-nums', channelTab === 'videos' ? 'text-accent' : 'text-base-500')}>
                {data.topTracks.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => changeChannelTab('playlists')}
              className={clsx(
                '-mb-px inline-flex items-center gap-2 border-b-2 px-0.5 py-2.5 text-xs font-semibold uppercase tracking-[0.13em] transition-colors',
                channelTab === 'playlists'
                  ? 'border-accent text-white'
                  : 'border-transparent text-muted hover:border-white/20 hover:text-soft'
              )}
            >
              Playlists
              <span className={clsx('font-mono text-[10px] tabular-nums', channelTab === 'playlists' ? 'text-accent' : 'text-base-500')}>
                {data.channelPlaylists?.length ?? 0}
              </span>
            </button>
          </div>
        )}

        {/* Top tracks */}
        {(!isYouTubeChannel || channelTab === 'videos') && <section className="mb-8">
          {!isYouTubeChannel && <h2 className="section-label mb-3">TOP TRACKS</h2>}
          <div className="space-y-0.5">
            {data.topTracks.map((track, i) => {
              const isActive = isTrackActive(currentTrack, track);
              return (
                <div
                  key={track.id}
                  className={`track-row group ${isActive ? 'active' : ''}`}
                  onClick={() => handlePlay(track)}
                >
                  <div className="w-5 flex-shrink-0 flex items-center justify-center">
                    {isActive && isPlaying ? (
                      <div className="flex gap-0.5 items-end h-3 justify-center">
                        <div className="w-0.5 h-3 bg-accent rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                        <div className="w-0.5 h-1.5 bg-accent rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                        <div className="w-0.5 h-2.5 bg-accent rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                      </div>
                    ) : (
                      <span className={clsx('text-xs font-mono', isActive ? 'text-accent font-semibold' : 'text-muted')}>
                        {i + 1}
                      </span>
                    )}
                  </div>
                  <img
                    src={track.thumbnail}
                    alt=""
                    className="h-9 w-9 flex-shrink-0 rounded-md object-cover"
                    onError={e => (e.currentTarget.style.display = 'none')}
                  />
                  <ArtistTrackText track={track} isActive={isActive} setView={setView} />
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
        </section>}

        {/* Discography */}
        {data.albums.length > 0 && (
          <section>
            <h2 className="section-label mb-3">DISCOGRAPHY</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {data.albums.map(album => (
                <button
                  key={album.id}
                  className="group text-left"
                  onClick={() => usePlayerStore.getState().setView('album' as never, album.id)}
                >
                  <div className="overflow-hidden rounded-lg bg-base-800 aspect-square">
                    {album.image ? (
                      <img
                        src={album.image}
                        alt={album.name}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Music2 size={28} className="text-muted" />
                      </div>
                    )}
                  </div>
                  <p className="mt-2 truncate font-display text-sm font-medium text-white group-hover:text-accent transition-colors">
                    {album.name}
                  </p>
                  <p className="truncate text-xs text-muted capitalize">
                    {album.type}{album.releaseDate ? ` · ${album.releaseDate.slice(0, 4)}` : ''}
                  </p>
                </button>
              ))}
            </div>
          </section>
        )}

        {isYouTubeChannel && channelTab === 'playlists' && (
          data.channelPlaylists && data.channelPlaylists.length > 0 ? (
            <section>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {data.channelPlaylists.map((playlist) => (
                  <button
                    type="button"
                    key={playlist.id}
                    className="group text-left"
                    onClick={() => {
                      try {
                        sessionStorage.setItem('noctune:channel-return-tab', JSON.stringify({ artistId, tab: 'playlists' }));
                      } catch {
                        // Ignore unavailable session storage in restricted webviews.
                      }
                      channelTabByArtist.set(artistId, 'playlists');
                      setView('playlist', `ytplaylist:${playlist.id}`);
                    }}
                  >
                    <div className="relative overflow-hidden rounded-lg bg-base-800 aspect-square flex items-center justify-center">
                      <Music2 size={28} className="text-muted absolute" />
                      {playlist.image && (
                        <img
                          src={playlist.image}
                          alt={playlist.name}
                          className="relative z-10 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      )}
                    </div>
                    <p className="mt-2 truncate font-display text-sm font-medium text-white group-hover:text-accent transition-colors">{playlist.name}</p>
                    <p className="truncate text-xs text-muted">YouTube playlist</p>
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <div className="flex min-h-[18rem] flex-col items-center justify-center gap-3 text-muted">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-base-600/30 bg-base-800">
                <ListMusic size={27} strokeWidth={1.3} />
              </div>
              <p className="text-center text-sm">No public playlists found on this YouTube channel.</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
