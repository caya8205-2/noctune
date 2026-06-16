import { useQuery } from '@tanstack/react-query';
import { Album, Clock3, Disc3, ExternalLink, Music2, Radio, Sparkles, Tag, UserRound } from 'lucide-react';
import { api, type CachedTrack, type SpotifyTrackMetadata } from '../../utils/api';
import { formatDuration } from '../../utils/format';
import { usePlayerStore } from '../../store/player';

const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

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

function SpotifyDetails({ track, metadata }: { track: CachedTrack; metadata: SpotifyTrackMetadata }) {
  const primaryArtist = metadata.artists[0];
  const genres = metadata.artists.flatMap((artist) => artist.genres).slice(0, 5);

  return (
    <>
      <div className="shrink-0 rounded-lg border border-base-600/60 bg-base-800 overflow-hidden">
        <img
          src={metadata.album.image ?? track.thumbnail}
          alt=""
          className="aspect-square w-full object-cover"
          onError={(event) => (event.currentTarget.style.display = 'none')}
        />
      </div>

      <div>
        <p className="section-label text-accent">Track details</p>
        <h2 className="text-lg font-semibold text-white mt-2 leading-tight">{metadata.title}</h2>
        <p className="text-sm text-muted mt-1 leading-relaxed">
          {metadata.artists.map((artist) => artist.name).join(', ')}
        </p>
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
        <DetailRow icon={Album} label="Album" value={metadata.album.name} />
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
          className="btn-ghost border border-base-600/50 px-3 py-2 text-xs justify-center"
        >
          <ExternalLink size={13} />
          Open in Spotify
        </button>
      )}
    </>
  );
}

function LocalDetails({ track }: { track: CachedTrack }) {
  return (
    <>
      <div className="shrink-0 rounded-lg border border-base-600/60 bg-base-800 overflow-hidden">
        {track.thumbnail ? (
          <img
            src={track.thumbnail}
            alt=""
            className="aspect-square w-full object-cover"
            onError={(event) => (event.currentTarget.style.display = 'none')}
          />
        ) : (
          <div className="aspect-square w-full flex items-center justify-center text-muted">
            <Music2 size={34} strokeWidth={1.3} />
          </div>
        )}
      </div>

      <div>
        <p className="section-label text-accent">Local track</p>
        <h2 className="text-lg font-semibold text-white mt-2 leading-tight">{track.title}</h2>
        <p className="text-sm text-muted mt-1 leading-relaxed">{track.artist}</p>
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
      {data ? (
        <SpotifyDetails track={currentTrack} metadata={data} />
      ) : (
        <>
          <LocalDetails track={currentTrack} />
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
