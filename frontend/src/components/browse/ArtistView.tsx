import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, Music2, Users } from 'lucide-react';
import { api, type Track } from '../../utils/api';
import { formatDuration } from '../../utils/format';
import { usePlayerStore } from '../../store/player';

function compactNumber(n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat(undefined, { notation: 'compact' }).format(n);
}

export function ArtistView({ artistId }: { artistId: string }) {
  const { playTrack, currentTrack, isPlaying, setView } = usePlayerStore();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['artist', artistId],
    queryFn: () => api.browseArtist(artistId),
    staleTime: 1000 * 60 * 10,
  });

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

  return (
    <div className="flex h-full flex-col overflow-hidden">
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

        <div className="relative flex items-end gap-5 px-6 pb-6 pt-10">
          <button
            onClick={() => history.back()}
            className="btn-ghost absolute left-4 top-4 p-1.5"
            title="Go back"
          >
            <ArrowLeft size={16} />
          </button>

          {/* Artist image */}
          {data.image ? (
            <img
              src={data.image}
              alt={data.name}
              className="h-28 w-28 flex-shrink-0 rounded-full object-cover shadow-2xl ring-2 ring-white/10"
            />
          ) : (
            <div className="flex h-28 w-28 flex-shrink-0 items-center justify-center rounded-full bg-base-800 ring-2 ring-white/10">
              <Users size={36} className="text-muted" />
            </div>
          )}

          <div className="min-w-0 pb-1">
            <p className="section-label mb-1">ARTIST</p>
            <h1 className="font-display text-3xl font-semibold text-white leading-tight truncate">
              {data.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
              {data.followers != null && (
                <span className="flex items-center gap-1">
                  <Users size={11} />
                  {compactNumber(data.followers)} followers
                </span>
              )}
              {data.genres.slice(0, 3).map(g => (
                <span key={g} className="rounded-full border border-white/10 bg-base-800 px-2 py-0.5">
                  {g}
                </span>
              ))}
            </div>
          </div>

          {data.spotifyUrl && (
            <a
              href={data.spotifyUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-ghost ml-auto flex-shrink-0 gap-1.5 text-xs text-muted"
            >
              <ExternalLink size={12} /> Spotify
            </a>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">

        {/* Top tracks */}
        <section className="mb-8">
          <h2 className="section-label mb-3">TOP TRACKS</h2>
          <div className="space-y-0.5">
            {data.topTracks.map((track, i) => {
              const isActive = currentTrack?.id === track.id;
              return (
                <div
                  key={track.id}
                  className={`track-row group ${isActive ? 'active' : ''}`}
                  onClick={() => handlePlay(track)}
                >
                  <span className="w-5 flex-shrink-0 text-right text-xs text-muted">
                    {isActive && isPlaying
                      ? <span className="text-accent">▶</span>
                      : i + 1
                    }
                  </span>
                  <img
                    src={track.thumbnail}
                    alt=""
                    className="h-9 w-9 flex-shrink-0 rounded-md object-cover"
                    onError={e => (e.currentTarget.style.display = 'none')}
                  />
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm ${isActive ? 'font-medium text-accent' : 'text-white'}`}>
                      {track.title}
                    </p>
                    {/* Album name clickable */}
                    {track.album && (
                      <button
                        className="truncate text-xs text-muted hover:text-accent transition-colors"
                        onClick={e => {
                          e.stopPropagation();
                          if ((track as Track & { albumId?: string }).albumId) {
                            usePlayerStore.getState().setView('album' as never, (track as Track & { albumId?: string }).albumId);
                          }
                        }}
                      >
                        {track.album}
                      </button>
                    )}
                  </div>
                  <span className="flex-shrink-0 font-mono text-xs text-muted">
                    {formatDuration(track.duration)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

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
      </div>
    </div>
  );
}
