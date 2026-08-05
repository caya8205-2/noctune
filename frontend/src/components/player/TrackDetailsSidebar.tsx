import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Album, Clock3, Disc3, ExternalLink, Maximize2, Music2, Radio, Sparkles, Tag, UserRound } from 'lucide-react';
import { api, isValidYouTubeChannelId, resolveYouTubeChannelId, type CachedTrack, type SpotifyTrackMetadata, IS_TAURI } from '../../utils/api';
import { formatDuration } from '../../utils/format';
import { usePlayerStore } from '../../store/player';
import { ArtworkLightboxModal } from '../ui/ArtworkLightboxModal';

async function openExternalUrl(url: string) {
  if (!IS_TAURI) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }

  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('open_external_url', { url });
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Music2;
  label: string;
  value?: string | number | null;
}) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="flex items-start gap-2 text-xs">
      <Icon size={13} className="text-muted mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-muted">{label}</p>
        <p className="text-soft mt-0.5 break-words">{value}</p>
      </div>
    </div>
  );
}

function compactNumber(value?: number): string | undefined {
  if (value === undefined) return undefined;
  return new Intl.NumberFormat(undefined, { notation: 'compact' }).format(value);
}

function SpotifyDetails({
  track,
  metadata,
  onOpenLightbox,
}: {
  track: CachedTrack;
  metadata: SpotifyTrackMetadata;
  onOpenLightbox: (url: string, title: string, artist: string, album?: string | null) => void;
}) {
  const primaryArtist = metadata.artists[0];
  const genres = metadata.artists.flatMap((artist) => artist.genres).slice(0, 5);
  const imageUrl = metadata.album.image ?? track.thumbnail;

  return (
    <>
      <div
        className="group relative shrink-0 rounded-lg border border-base-600/60 bg-base-800 overflow-hidden cursor-pointer"
        onClick={() => imageUrl && onOpenLightbox(imageUrl, metadata.title, track.artist, metadata.album.name)}
        title="Click to view full resolution artwork"
      >
        <img
          src={imageUrl}
          alt=""
          className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-105"
          onError={(event) => (event.currentTarget.style.display = 'none')}
        />
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-1.5 text-xs font-medium">
          <Maximize2 size={16} />
          <span>View Art</span>
        </div>
      </div>

      <div>
        <p className="section-label text-accent">Track details</p>
        {metadata.album.id ? (
          <button
            type="button"
            className="mt-2 block text-left text-lg font-semibold leading-tight text-white transition-colors hover:text-accent"
            onClick={() => usePlayerStore.getState().setView('album', metadata.album.id)}
            title={`Go to album: ${metadata.album.name}`}
          >
            {metadata.title}
          </button>
        ) : (
          <h2 className="text-lg font-semibold text-white mt-2 leading-tight">{metadata.title}</h2>
        )}
        <div className="mt-1 flex flex-wrap gap-1">
          {metadata.artists.map((artist, i) => (
            <span key={artist.id}>
              <button
                className="text-sm text-muted hover:text-accent transition-colors"
                onClick={() => usePlayerStore.getState().setView('artist', artist.id)}
              >
                {artist.name}
              </button>
              {i < metadata.artists.length - 1 && <span className="text-muted">,</span>}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-base-600/50 bg-base-950/40 p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted">Popularity</p>
          <p className="text-lg font-semibold text-white mt-1">{metadata.popularity ?? '-'}</p>
        </div>
        <div className="rounded-lg border border-base-600/50 bg-base-950/40 p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted">Duration</p>
          <p className="text-lg font-semibold text-white mt-1">{formatDuration(metadata.duration)}</p>
        </div>
      </div>

      {genres.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {genres.map((genre) => (
            <span key={genre} className="rounded-full border border-base-600/60 px-2 py-1 text-[11px] text-soft">
              {genre}
            </span>
          ))}
        </div>
      )}

      <div className="space-y-3 rounded-lg border border-base-600/60 bg-base-800 p-3">
        <div className="flex items-start gap-2 text-xs">
          <Album size={13} className="text-muted mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-muted">Album</p>
            <button
              className="mt-0.5 text-left text-soft hover:text-accent transition-colors break-words"
              onClick={() => metadata.album.id && usePlayerStore.getState().setView('album', metadata.album.id)}
            >
              {metadata.album.name}
            </button>
          </div>
        </div>
        <DetailRow icon={Disc3} label="Release" value={metadata.album.releaseDate} />
        <DetailRow icon={Tag} label="Label" value={metadata.album.label} />
        <DetailRow icon={Music2} label="Track" value={
          metadata.trackNumber
            ? `${metadata.trackNumber}${metadata.album.totalTracks ? ` of ${metadata.album.totalTracks}` : ''}`
            : undefined
        } />
        <DetailRow icon={UserRound} label="Artist followers" value={compactNumber(primaryArtist?.followers)} />
        <DetailRow icon={Radio} label="ISRC" value={metadata.isrc} />
      </div>

      {metadata.spotifyUrl && (
        <button
          type="button"
          onClick={() => openExternalUrl(metadata.spotifyUrl!).catch(console.error)}
          className="btn-ghost items-center justify-center gap-1.5 border border-base-600/50 px-3 py-2 text-xs"
        >
          <ExternalLink size={13} className="flex-shrink-0" />
          Open in Spotify
        </button>
      )}
    </>
  );
}

function LocalDetails({
  track,
  onOpenLightbox,
}: {
  track: CachedTrack;
  onOpenLightbox: (url: string, title: string, artist: string, album?: string | null) => void;
}) {
  return (
    <>
      <div
        className="group relative shrink-0 rounded-lg border border-base-600/60 bg-base-800 overflow-hidden cursor-pointer"
        onClick={() => track.thumbnail && onOpenLightbox(track.thumbnail, track.title, track.artist, track.album)}
        title={track.thumbnail ? 'Click to view full resolution artwork' : undefined}
      >
        {track.thumbnail ? (
          <>
            <img
              src={track.thumbnail}
              alt=""
              className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-105"
              onError={(event) => (event.currentTarget.style.display = 'none')}
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-1.5 text-xs font-medium">
              <Maximize2 size={16} />
              <span>View Art</span>
            </div>
          </>
        ) : (
          <div className="aspect-square w-full flex items-center justify-center text-muted">
            <Music2 size={34} strokeWidth={1.3} />
          </div>
        )}
      </div>

      <div>
        <p className="section-label text-accent">Track details</p>
        {track.artistId && (!track.artistId.startsWith('ytchannel:') || isValidYouTubeChannelId(track.artistId)) ? (
          <button
            type="button"
            className="mt-2 block text-left text-lg font-semibold leading-tight text-white transition-colors hover:text-accent"
            onClick={() => usePlayerStore.getState().setView('artist', track.artistId)}
            title={`Go to artist: ${track.artist}`}
          >
            {track.title}
          </button>
        ) : (
          <h2 className="text-lg font-semibold text-white mt-2 leading-tight">{track.title}</h2>
        )}
        {(() => {
          const targetArtistId = track.artistId && (!track.artistId.startsWith('ytchannel:') || isValidYouTubeChannelId(track.artistId)) ? track.artistId : undefined;
          return track.artist ? (
            <button
              type="button"
              className="mt-1 text-left text-sm leading-relaxed text-muted transition-colors hover:text-accent"
              onClick={() => void (targetArtistId ? Promise.resolve(targetArtistId) : resolveYouTubeChannelId(track)).then((resolvedId) => {
                if (resolvedId) usePlayerStore.getState().setView('artist', resolvedId);
              })}
              title={`Go to artist: ${track.artist}`}
            >
              {track.artist}
            </button>
          ) : null;
        })()}
      </div>

      <div className="space-y-3 rounded-lg border border-base-600/60 bg-base-800 p-3">
        <DetailRow icon={Clock3} label="Duration" value={formatDuration(track.duration)} />
        <DetailRow icon={Sparkles} label="Play count" value={track.playCount} />
        <DetailRow icon={Radio} label="Source" value={track.spotifyId ? 'Spotify metadata' : 'Local YouTube resolver'} />
        <DetailRow icon={Tag} label="Video ID" value={track.youtubeId ?? track.id} />
      </div>
    </>
  );
}

export function TrackDetailsContent() {
  const { currentTrack } = usePlayerStore();
  const [lightboxData, setLightboxData] = useState<{ url: string; title: string; artist: string; album?: string | null } | null>(null);
  const spotifyId = currentTrack?.spotifyId;
  const { data, isLoading, isError } = useQuery({
    queryKey: ['spotify-metadata', spotifyId],
    queryFn: () => api.spotifyMetadata(spotifyId!),
    enabled: Boolean(spotifyId),
    staleTime: 1000 * 60 * 60,
  });

  if (!currentTrack) {
    return (
      <div className="flex flex-col justify-center text-center text-muted">
        <Music2 size={28} className="mx-auto mb-3" strokeWidth={1.3} />
        <p className="text-sm">Track details will appear here.</p>
      </div>
    );
  }

  return (
    <>
      {lightboxData && (
        <ArtworkLightboxModal
          imageUrl={lightboxData.url}
          title={lightboxData.title}
          artist={lightboxData.artist}
          album={lightboxData.album}
          onClose={() => setLightboxData(null)}
        />
      )}
      {data ? (
        <SpotifyDetails
          track={currentTrack}
          metadata={data}
          onOpenLightbox={(url, title, artist, album) => setLightboxData({ url, title, artist, album })}
        />
      ) : (
        <>
          <LocalDetails
            track={currentTrack}
            onOpenLightbox={(url, title, artist, album) => setLightboxData({ url, title, artist, album })}
          />
          {spotifyId && isLoading && (
            <p className="text-xs text-muted">Loading Spotify metadata.</p>
          )}
          {spotifyId && isError && (
            <p className="text-xs text-red-400">Spotify metadata unavailable.</p>
          )}
        </>
      )}
    </>
  );
}

export function TrackDetailsSidebar() {
  const { currentTrack } = usePlayerStore();

  if (!currentTrack) {
    return (
      <aside className="hidden lg:flex w-72 flex-shrink-0 border-l border-base-800 bg-base-950/70 p-4 flex-col justify-center text-center text-muted">
        <Music2 size={28} className="mx-auto mb-3" strokeWidth={1.3} />
        <p className="text-sm">Track details will appear here.</p>
      </aside>
    );
  }

  return (
    <aside className="hidden lg:block w-72 flex-shrink-0 min-h-0 border-l border-base-800 bg-base-950/70 overflow-y-auto">
      <div className="flex flex-col gap-4 p-4">
        <TrackDetailsContent />
      </div>
    </aside>
  );
}
