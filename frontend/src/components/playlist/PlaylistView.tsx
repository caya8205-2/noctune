import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Grid, HardDrive, GripVertical, Heart, ImageOff, ImagePlus, List, ListMusic, Loader2, Maximize2, Music2, Pencil, Play, RefreshCw, Save, Search, Trash2, X } from 'lucide-react';
import { api, isTrackActive, resolveYouTubeChannelId, type Playlist, type Track } from '../../utils/api';
import { formatDuration } from '../../utils/format';
import { usePlayerStore } from '../../store/player';
import { clsx } from 'clsx';
import { TrackActionButtons } from '../ui/TrackActionButtons';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ArtworkLightboxModal } from '../ui/ArtworkLightboxModal';
import { useSmartPlaylists } from '../../hooks/useSmartPlaylists';

const LIKED_PLAYLIST_ID = 'system-liked-songs';
const CROP_VIEWPORT_SIZE = 320;
const COVER_OUTPUT_SIZE = 640;
type PlaylistSort = 'custom' | 'title-asc' | 'title-desc' | 'artist-asc' | 'artist-desc' | 'duration-asc' | 'duration-desc';
type PlaylistViewMode = 'list' | 'grid';

function playlistTrackId(track: Track): string {
  return track.spotifyId ? `spotify:${track.spotifyId}` : track.id;
}

type CropSource = {
  url: string;
  naturalWidth: number;
  naturalHeight: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getBaseScale(source: CropSource): number {
  return Math.max(CROP_VIEWPORT_SIZE / source.naturalWidth, CROP_VIEWPORT_SIZE / source.naturalHeight);
}

function clampCropOffset(source: CropSource, zoom: number, x: number, y: number) {
  const scale = getBaseScale(source) * zoom;
  const width = source.naturalWidth * scale;
  const height = source.naturalHeight * scale;
  const maxX = Math.max(0, (width - CROP_VIEWPORT_SIZE) / 2);
  const maxY = Math.max(0, (height - CROP_VIEWPORT_SIZE) / 2);
  return {
    x: clamp(x, -maxX, maxX),
    y: clamp(y, -maxY, maxY),
  };
}

function createCoverDataUrl(
  image: HTMLImageElement,
  source: CropSource,
  crop: { x: number; y: number; zoom: number }
): string {
  const canvas = document.createElement('canvas');
  canvas.width = COVER_OUTPUT_SIZE;
  canvas.height = COVER_OUTPUT_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is not available');

  const outputScale = COVER_OUTPUT_SIZE / CROP_VIEWPORT_SIZE;
  const imageScale = getBaseScale(source) * crop.zoom;
  const width = source.naturalWidth * imageScale;
  const height = source.naturalHeight * imageScale;
  const x = CROP_VIEWPORT_SIZE / 2 - width / 2 + crop.x;
  const y = CROP_VIEWPORT_SIZE / 2 - height / 2 + crop.y;

  context.fillStyle = '#090A0C';
  context.fillRect(0, 0, COVER_OUTPUT_SIZE, COVER_OUTPUT_SIZE);
  context.drawImage(image, x * outputScale, y * outputScale, width * outputScale, height * outputScale);

  const webpDataUrl = canvas.toDataURL('image/webp', 0.82);
  return webpDataUrl.startsWith('data:image/webp') ? webpDataUrl : canvas.toDataURL('image/jpeg', 0.84);
}

function readCropSource(file: File): Promise<CropSource> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({ url, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Cover image could not be loaded'));
    };
    image.src = url;
  });
}

function CoverCropModal({
  source,
  saving,
  onCancel,
  onApply,
}: {
  source: CropSource;
  saving: boolean;
  onCancel: () => void;
  onApply: (image: HTMLImageElement, crop: { x: number; y: number; zoom: number }) => void;
}) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0, zoom: 1 });
  const scale = getBaseScale(source) * crop.zoom;
  const width = source.naturalWidth * scale;
  const height = source.naturalHeight * scale;

  useEffect(() => {
    setCrop({ x: 0, y: 0, zoom: 1 });
  }, [source.url]);

  function updateZoom(nextZoom: number) {
    setCrop((current) => {
      const zoom = clamp(nextZoom, 1, 3);
      const offset = clampCropOffset(source, zoom, current.x, current.y);
      return { ...offset, zoom };
    });
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const nextX = drag.originX + event.clientX - drag.startX;
    const nextY = drag.originY + event.clientY - drag.startY;
    const offset = clampCropOffset(source, crop.zoom, nextX, nextY);
    setCrop((current) => ({ ...current, ...offset }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5">
      <div className="w-full max-w-md rounded-xl border border-base-600 bg-base-900 shadow-2xl shadow-black/40 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="section-label text-accent">Cover</p>
            <h2 className="text-xl font-semibold text-white mt-1">Crop playlist cover</h2>
          </div>
          <button type="button" onClick={onCancel} className="btn-ghost p-2" title="Close">
            <X size={16} />
          </button>
        </div>

        <div
          className="relative mx-auto rounded-xl overflow-hidden border border-base-600 bg-base-950 cursor-grab active:cursor-grabbing"
          style={{ width: CROP_VIEWPORT_SIZE, height: CROP_VIEWPORT_SIZE }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            dragRef.current = {
              pointerId: event.pointerId,
              startX: event.clientX,
              startY: event.clientY,
              originX: crop.x,
              originY: crop.y,
            };
          }}
          onPointerMove={handlePointerMove}
          onPointerUp={(event) => {
            event.currentTarget.releasePointerCapture(event.pointerId);
            dragRef.current = null;
          }}
          onPointerCancel={() => {
            dragRef.current = null;
          }}
        >
          <img
            ref={imageRef}
            src={source.url}
            alt=""
            draggable={false}
            className="absolute max-w-none select-none"
            style={{
              width,
              height,
              left: CROP_VIEWPORT_SIZE / 2 - width / 2 + crop.x,
              top: CROP_VIEWPORT_SIZE / 2 - height / 2 + crop.y,
            }}
          />
          <div className="absolute inset-0 ring-1 ring-inset ring-white/15 pointer-events-none" />
          <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3">
            {Array.from({ length: 9 }).map((_, index) => (
              <div key={index} className="border border-white/25" />
            ))}
          </div>
        </div>

        <label className="block mt-4">
          <span className="section-label">Zoom</span>
          <input
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={crop.zoom}
            onChange={(event) => updateZoom(Number(event.target.value))}
            className="mt-2 w-full accent-lime-400"
          />
        </label>

        <div className="flex items-center justify-end gap-2 mt-5">
          <button type="button" onClick={onCancel} disabled={saving} className="btn-ghost px-4 py-2 text-xs border border-base-600/40 disabled:opacity-40">
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              if (imageRef.current) onApply(imageRef.current, crop);
            }}
            className="btn-accent px-4 py-2 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Check size={14} />
            {saving ? 'Saving' : 'Apply cover'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PlaylistTrackTitle({
  track,
  isActive,
  setView,
}: {
  track: Track;
  isActive: boolean;
  setView: ReturnType<typeof usePlayerStore.getState>['setView'];
}) {
  const needsSpotifyNavigation = Boolean(track.spotifyId && (!track.albumId || !track.artistId));
  const { data: spotifyMetadata } = useQuery({
    queryKey: ['spotify-metadata', track.spotifyId],
    queryFn: () => api.spotifyMetadata(track.spotifyId!),
    enabled: needsSpotifyNavigation,
    staleTime: 1000 * 60 * 60,
  });
  const albumViewId = track.albumId ?? spotifyMetadata?.album.id;
  const artistViewId = track.artistId ?? spotifyMetadata?.artists[0]?.id;

  async function handleArtistClick(event: React.MouseEvent) {
    event.stopPropagation();
    const resolvedArtistId = artistViewId ?? await resolveYouTubeChannelId(track);
    if (resolvedArtistId) setView('artist', resolvedArtistId);
  }

  return (
    <div className="flex min-w-0 flex-col items-start">
      {albumViewId ? (
        <button
          type="button"
          className={clsx(
            'max-w-full truncate text-left text-sm transition-colors hover:text-accent',
            isActive ? 'font-medium text-accent' : 'text-white'
          )}
          onClick={(event) => {
            event.stopPropagation();
            setView('album', albumViewId);
          }}
          title={`Go to album: ${track.album ?? spotifyMetadata?.album.name ?? track.title}`}
        >
          {track.title}
        </button>
      ) : (
        <p className={'max-w-full truncate text-sm ' + (isActive ? 'text-accent font-medium' : 'text-white')}>
          {track.title}
        </p>
      )}
      {track.artist ? (
        <button
          type="button"
          className="mt-0.5 max-w-full cursor-pointer truncate text-left text-xs text-muted transition-colors hover:text-accent"
          onClick={(event) => { void handleArtistClick(event); }}
          title={`Go to artist: ${track.artist}`}
        >
          {track.artist}
        </button>
      ) : (
        <p className="max-w-full truncate text-xs text-muted">{track.artist}</p>
      )}
    </div>
  );
}

const NIGHTLY_MIX_CACHE_KEY = 'noctune:nightly-mix:v2';

export function PlaylistView() {
  const [draggedTrackId, setDraggedTrackId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragFromIndexRef = useRef<number | null>(null);
  const dragCurrentIndexRef = useRef<number | null>(null);
  const dragLastHoverTrackIdRef = useRef<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);
  const [cropSource, setCropSource] = useState<CropSource | null>(null);
  const [cachingAudio, setCachingAudio] = useState(false);
  const [cacheMessage, setCacheMessage] = useState<string | null>(null);
  const [trackFilter, setTrackFilter] = useState('');
  const [sortMode, setSortMode] = useState<PlaylistSort>('custom');
  const [viewMode, setViewMode] = useState<PlaylistViewMode>('list');
  const [editSnapshot, setEditSnapshot] = useState<Playlist | null>(null);
  const [pendingReorders, setPendingReorders] = useState<Array<{ fromIndex: number; toIndex: number }>>([]);
  const [pendingRemoveTrack, setPendingRemoveTrack] = useState<Track | null>(null);
  const [removingTrack, setRemovingTrack] = useState(false);
  const [refreshingDiscover, setRefreshingDiscover] = useState(false);
  const [showArtwork, setShowArtwork] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { activePlaylistId, activePersonalMix, playTrack, currentTrack, isPlaying, setView } = usePlayerStore();
  const qc = useQueryClient();
  const isSmartPlaylist = Boolean(activePlaylistId?.startsWith('smart:'));
  const hasVirtualPlaylistId = Boolean(activePlaylistId?.startsWith('nightly:'));
  const isYoutubePlaylist = Boolean(activePlaylistId?.startsWith('ytplaylist:'));

  // Smart playlists hook — only used when a smart playlist id is active
  const {
    getSmartPlaylist,
    isLoading: smartPlaylistsLoading,
    isDiscoverWeeklyFetching,
  } = useSmartPlaylists();
  const smartPlaylist = isSmartPlaylist ? getSmartPlaylist(activePlaylistId!) : undefined;
  const isDiscoverWeekly = activePlaylistId === 'smart:discover-weekly';

  async function handleRefreshMixOrSmartPlaylist() {
    setRefreshingDiscover(true);
    try {
      if (isDiscoverWeekly) {
        await api.refreshDiscoverWeekly();
        qc.invalidateQueries({ queryKey: ['smart', 'discover-weekly'] });
      } else if (isSmartPlaylist) {
        qc.invalidateQueries({ queryKey: ['smart'] });
        qc.invalidateQueries({ queryKey: ['history'] });
        qc.invalidateQueries({ queryKey: ['stats'] });
      } else if (isNightlyMix && activePersonalMix) {
        const res = await api.nightlyMixes(4, 20, true);
        const updatedMix = res.mixes?.find((m: { id: string }) => m.id === activePersonalMix.id) || res.mixes?.[0];
        if (updatedMix) {
          usePlayerStore.getState().openPersonalMix(updatedMix);
        }
        localStorage.removeItem(NIGHTLY_MIX_CACHE_KEY);
        qc.invalidateQueries({ queryKey: ['home'] });
        qc.invalidateQueries({ queryKey: ['nightly-mix'] });
      }
    } catch (err) {
      console.error('Failed to refresh mix or smart playlist:', err);
    } finally {
      setRefreshingDiscover(false);
    }
  }

  const { data: playlist, isLoading } = useQuery({
    queryKey: ['playlist', activePlaylistId],
    queryFn: () => api.getPlaylist(activePlaylistId!),
    enabled: Boolean(activePlaylistId) && !activePersonalMix && !hasVirtualPlaylistId && !isSmartPlaylist && !isYoutubePlaylist,
  });

  const { data: youtubePlaylist, isLoading: isYoutubePlaylistLoading } = useQuery({
    queryKey: ['youtube-playlist', activePlaylistId],
    queryFn: () => api.browseYoutubePlaylist(activePlaylistId!.replace(/^ytplaylist:/, '')),
    enabled: isYoutubePlaylist,
  });

  const isNightlyMix = Boolean(activePersonalMix);
  const tracks = smartPlaylist?.tracks ?? activePersonalMix?.tracks ?? youtubePlaylist?.tracks ?? playlist?.tracks ?? [];
  const isLikedPlaylist = activePlaylistId === LIKED_PLAYLIST_ID;
  const playlistName = smartPlaylist?.name ?? activePersonalMix?.name ?? youtubePlaylist?.name ?? playlist?.name ?? 'Playlist';
  const playlistDescription = smartPlaylist?.description ?? activePersonalMix?.description;
  const playlistCover = smartPlaylist?.cover ?? activePersonalMix?.cover ?? youtubePlaylist?.image ?? playlist?.coverDataUrl ?? '';
  const playlistLabel = isSmartPlaylist ? 'Smart Playlist' : isNightlyMix ? 'Nightly Mix' : isYoutubePlaylist ? 'YouTube Playlist' : 'Playlist';
  const queueSource = isSmartPlaylist ? 'playlist' : isNightlyMix ? 'recommendation' : 'playlist';
  const isSmartPlaylistLoading = isDiscoverWeekly ? isDiscoverWeeklyFetching : (isSmartPlaylist ? smartPlaylistsLoading : false);
  const isPlaylistLoading = isSmartPlaylist
    ? isSmartPlaylistLoading && tracks.length === 0
    : isYoutubePlaylist
      ? isYoutubePlaylistLoading
      : !isNightlyMix && isLoading;
  const canEditPlaylist = !isLikedPlaylist && !isNightlyMix && !isSmartPlaylist && !isYoutubePlaylist;
  const visibleTracks = tracks
    .map((track, originalIndex) => ({ track, originalIndex }))
    .filter(({ track }) => {
      const keyword = trackFilter.trim().toLowerCase();
      if (!keyword) return true;
      return `${track.title} ${track.artist}`.toLowerCase().includes(keyword);
    })
    .sort((a, b) => {
      if (sortMode === 'title-asc') return a.track.title.localeCompare(b.track.title);
      if (sortMode === 'title-desc') return b.track.title.localeCompare(a.track.title);
      if (sortMode === 'artist-asc') return a.track.artist.localeCompare(b.track.artist);
      if (sortMode === 'artist-desc') return b.track.artist.localeCompare(a.track.artist);
      if (sortMode === 'duration-asc') return a.track.duration - b.track.duration;
      if (sortMode === 'duration-desc') return b.track.duration - a.track.duration;
      return a.originalIndex - b.originalIndex;
    });

  useEffect(() => {
    setDraftName(playlistName);
    setTrackFilter('');
    setSortMode('custom');
    setEditSnapshot(null);
    setPendingReorders([]);
    setPendingRemoveTrack(null);
  }, [activePlaylistId, playlistName]);

  useEffect(() => {
    return () => {
      if (cropSource) URL.revokeObjectURL(cropSource.url);
    };
  }, [cropSource]);

  function movePlaylistPreview(fromIndex: number, toIndex: number) {
    if (!activePlaylistId) return;
    qc.setQueryData<Playlist>(['playlist', activePlaylistId], (current) => {
      if (!current?.tracks) return current;
      const nextTracks = [...current.tracks];
      const [moved] = nextTracks.splice(fromIndex, 1);
      if (!moved) return current;
      nextTracks.splice(toIndex, 0, moved);
      return { ...current, tracks: nextTracks, trackIds: nextTracks.map(playlistTrackId) };
    });
  }

  useEffect(() => {
    if (draggedTrackId === null) return;

    function getTrackAtPointer(event: PointerEvent): { index: number; id: string } | null {
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const row = target?.closest<HTMLElement>('[data-playlist-track-index]');
      const index = row?.dataset.playlistTrackIndex === undefined
        ? NaN
        : Number(row.dataset.playlistTrackIndex);
      const id = row?.dataset.playlistTrackId;
      return Number.isInteger(index) && id ? { index, id } : null;
    }

    function handlePointerMove(event: PointerEvent) {
      const target = getTrackAtPointer(event);
      setDragOverIndex(target?.index ?? null);
      const currentIndex = dragCurrentIndexRef.current;
      if (!target || currentIndex === null || target.id === dragLastHoverTrackIdRef.current) return;

      dragLastHoverTrackIdRef.current = target.id;
      if (target.index !== currentIndex) {
        movePlaylistPreview(currentIndex, target.index);
        dragCurrentIndexRef.current = target.index;
      }
    }

    function handlePointerUp() {
      const fromIndex = dragFromIndexRef.current;
      const toIndex = dragCurrentIndexRef.current;
      dragFromIndexRef.current = null;
      dragCurrentIndexRef.current = null;
      dragLastHoverTrackIdRef.current = null;
      setDraggedTrackId(null);
      setDragOverIndex(null);
      if (fromIndex !== null && toIndex !== null && fromIndex !== toIndex) {
        handleReorder(fromIndex, toIndex);
      }
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [draggedTrackId]);

  function handlePlay(track: Track) {
    playTrack(
      { ...track, queueSource, originalPlaylistId: activePlaylistId ?? undefined, originalPlaylistName: playlistName },
      tracks.map((playlistTrack) => ({ ...playlistTrack, queueSource, originalPlaylistId: activePlaylistId ?? undefined, originalPlaylistName: playlistName })),
      { queueSource }
    );
  }

  function handlePlayAll() {
    if (tracks.length === 0) return;
    playTrack(
      { ...tracks[0], queueSource, originalPlaylistId: activePlaylistId ?? undefined, originalPlaylistName: playlistName },
      tracks.map((track) => ({ ...track, queueSource, originalPlaylistId: activePlaylistId ?? undefined, originalPlaylistName: playlistName })),
      { queueSource }
    );
  }

  async function handleCachePlaylist() {
    if (tracks.length === 0) return;
    setCachingAudio(true);
    setCacheMessage(null);
    try {
      const result = await api.cacheAudioTracks(tracks);
      setCacheMessage(
        result.scheduled.length > 0
          ? `Caching ${result.scheduled.length} tracks in background.`
          : 'All playable tracks are already cached.'
      );
    } catch (err) {
      setCacheMessage((err as Error).message);
    } finally {
      setCachingAudio(false);
    }
  }

  function handleReorder(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    if (!activePlaylistId || isNightlyMix || !editing) return;
    setPendingReorders((current) => [...current, { fromIndex, toIndex }]);
    setDraggedTrackId(null);
  }

  function startEditing() {
    setViewMode('list');
    setEditSnapshot(
      playlist
        ? { ...playlist, trackIds: [...playlist.trackIds], tracks: playlist.tracks ? [...playlist.tracks] : [] }
        : null
    );
    setPendingReorders([]);
    setEditing(true);
  }

  function cancelEditing() {
    if (activePlaylistId && editSnapshot) {
      qc.setQueryData(['playlist', activePlaylistId], editSnapshot);
    }
    setPendingReorders([]);
    setEditSnapshot(null);
    setDraftName(playlistName);
    setEditing(false);
  }

  async function saveEditing() {
    if (!activePlaylistId || !playlist || pendingReorders.length === 0) {
      setEditing(false);
      setEditSnapshot(null);
      return;
    }
    setSavingDetails(true);
    try {
      for (const reorder of pendingReorders) {
        await api.reorderPlaylistTracks(activePlaylistId, reorder.fromIndex, reorder.toIndex);
      }
      await qc.invalidateQueries({ queryKey: ['playlist', activePlaylistId] });
      await qc.invalidateQueries({ queryKey: ['playlists'] });
      setPendingReorders([]);
      setEditSnapshot(null);
      setEditing(false);
    } catch (err) {
      await qc.invalidateQueries({ queryKey: ['playlist', activePlaylistId] });
      setPendingReorders([]);
      setEditSnapshot(null);
      setEditing(false);
      console.error('Reorder failed:', err);
    } finally {
      setSavingDetails(false);
    }
  }

  function requestRemoveTrack(track: Track) {
    if (!activePlaylistId || isLikedPlaylist || isNightlyMix) return;
    setPendingRemoveTrack(track);
  }

  async function confirmRemoveTrack() {
    if (!pendingRemoveTrack || !activePlaylistId || isLikedPlaylist || isNightlyMix) return;
    setRemovingTrack(true);
    try {
      await api.removeTrack(activePlaylistId, playlistTrackId(pendingRemoveTrack));
      qc.invalidateQueries({ queryKey: ['playlist', activePlaylistId] });
      qc.invalidateQueries({ queryKey: ['playlists'] });
      setPendingRemoveTrack(null);
    } catch (err) {
      console.error('Remove track failed:', err);
    } finally {
      setRemovingTrack(false);
    }
  }

  async function handleRename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activePlaylistId || isLikedPlaylist || isNightlyMix || !playlist) return;
    const name = draftName.trim();
    if (!name || name === playlist.name) return;
    setSavingDetails(true);
    try {
      await api.updatePlaylist(activePlaylistId, { name });
      qc.invalidateQueries({ queryKey: ['playlist', activePlaylistId] });
      qc.invalidateQueries({ queryKey: ['playlists'] });
      qc.invalidateQueries({ queryKey: ['home'] });
    } catch (err) {
      console.error('Rename playlist failed:', err);
    } finally {
      setSavingDetails(false);
    }
  }

  async function handleCoverFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !activePlaylistId || isLikedPlaylist || isNightlyMix) return;
    if (!file.type.startsWith('image/')) return;
    try {
      const source = await readCropSource(file);
      setCropSource((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return source;
      });
    } catch (err) {
      console.error('Open playlist cover failed:', err);
    }
  }

  async function handleApplyCover(image: HTMLImageElement, crop: { x: number; y: number; zoom: number }) {
    if (!activePlaylistId || isLikedPlaylist || isNightlyMix || !cropSource) return;
    setSavingDetails(true);
    try {
      const coverDataUrl = createCoverDataUrl(image, cropSource, crop);
      await api.updatePlaylist(activePlaylistId, { coverDataUrl });
      qc.invalidateQueries({ queryKey: ['playlist', activePlaylistId] });
      qc.invalidateQueries({ queryKey: ['playlists'] });
      qc.invalidateQueries({ queryKey: ['home'] });
      URL.revokeObjectURL(cropSource.url);
      setCropSource(null);
    } catch (err) {
      console.error('Update playlist cover failed:', err);
    } finally {
      setSavingDetails(false);
    }
  }

  async function handleRemoveCover() {
    if (!activePlaylistId || isLikedPlaylist || isNightlyMix) return;
    setSavingDetails(true);
    try {
      await api.updatePlaylist(activePlaylistId, { coverDataUrl: null });
      qc.invalidateQueries({ queryKey: ['playlist', activePlaylistId] });
      qc.invalidateQueries({ queryKey: ['playlists'] });
      qc.invalidateQueries({ queryKey: ['home'] });
    } catch (err) {
      console.error('Remove playlist cover failed:', err);
    } finally {
      setSavingDetails(false);
    }
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
      {showArtwork && playlistCover && (
        <ArtworkLightboxModal
          imageUrl={playlistCover}
          title={playlistName}
          artist={playlistLabel}
          onClose={() => setShowArtwork(false)}
        />
      )}
      {cropSource && (
        <CoverCropModal
          source={cropSource}
          saving={savingDetails}
          onCancel={() => {
            URL.revokeObjectURL(cropSource.url);
            setCropSource(null);
          }}
          onApply={handleApplyCover}
        />
      )}
      <div className="relative px-4 pt-5 pb-4 sm:px-6 lg:px-9 lg:pt-8 lg:pb-5 flex flex-col gap-5">
        {isYoutubePlaylist && (
          <button
            type="button"
            onClick={() => history.back()}
            className="btn-ghost absolute left-4 top-4 p-1.5 z-20 sm:left-6 lg:left-9"
            title="Go back"
          >
            <ArrowLeft size={16} />
          </button>
        )}
        {/* Top: Cover + Details */}
        <div className={clsx('flex items-end gap-5 min-w-0', isYoutubePlaylist && 'pt-6 sm:pt-4')}>
          <button
            type="button"
            onClick={() => playlistCover && setShowArtwork(true)}
            disabled={!playlistCover}
            title={playlistCover ? 'Click to view artwork' : undefined}
            className="group relative flex h-28 w-28 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-base-600/60 bg-base-800 text-muted sm:h-32 sm:w-32 disabled:cursor-default"
          >
            {playlistCover ? (
              <>
                <img src={playlistCover} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                <span className="absolute inset-0 flex items-center justify-center gap-1 bg-black/45 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                  <Maximize2 size={15} /> View Art
                </span>
              </>
            ) : isYoutubePlaylist && isYoutubePlaylistLoading ? (
              <Loader2 size={34} strokeWidth={1.3} className="animate-spin text-accent" />
            ) : isLikedPlaylist ? (
              <Heart size={36} strokeWidth={1.4} fill="currentColor" className="text-accent" />
            ) : (
              <ListMusic size={34} strokeWidth={1.3} />
            )}
          </button>
          <div className="min-w-0 flex-1">
            <p className="section-label text-accent">{playlistLabel}</p>
            {editing && canEditPlaylist ? (
              <form onSubmit={handleRename} className="mt-2 flex items-center gap-2">
                <input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  className="min-w-0 max-w-xl bg-base-900 border border-base-600 rounded-lg px-3 py-2 text-2xl sm:text-3xl font-bold text-white focus:outline-none focus:border-accent"
                  placeholder="Playlist name"
                />
                <button
                  type="submit"
                  disabled={savingDetails || !draftName.trim() || draftName.trim() === playlist?.name}
                  className="btn-accent p-2.5 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                  title="Save name"
                >
                  <Save size={16} />
                </button>
              </form>
            ) : (
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight mt-1.5 truncate max-w-full" title={playlistName}>
                {playlistName}
              </h1>
            )}
            <p className="text-xs text-muted mt-2">
              {isPlaylistLoading ? 'Loading tracks' : tracks.length + ' tracks'}
            </p>
            {playlistDescription && (
              <p className="text-xs text-muted/90 mt-1.5 leading-relaxed max-w-2xl">
                {playlistDescription}
              </p>
            )}
            {editing && canEditPlaylist && (
              <div className="flex items-center gap-2 mt-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleCoverFile}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={savingDetails}
                  className="btn-ghost px-3 py-1.5 text-xs gap-1.5 border border-base-600/40 disabled:opacity-40 whitespace-nowrap"
                >
                  <ImagePlus size={14} />
                  Upload cover
                </button>
                {playlistCover && (
                  <button
                    type="button"
                    onClick={handleRemoveCover}
                    disabled={savingDetails}
                    className="btn-ghost px-3 py-1.5 text-xs gap-1.5 border border-base-600/40 text-muted hover:text-red-400 disabled:opacity-40 whitespace-nowrap"
                  >
                    <ImageOff size={14} />
                    Remove cover
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Bottom: Action bar */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={handlePlayAll}
            disabled={tracks.length === 0}
            className="btn-accent whitespace-nowrap px-5 py-2.5 text-xs gap-2 rounded-full shadow-lg shadow-accent/15 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
          >
            <Play size={14} fill="currentColor" />
            Play all
          </button>
          {(isSmartPlaylist || isNightlyMix) && (
            <button
              type="button"
              onClick={handleRefreshMixOrSmartPlaylist}
              disabled={refreshingDiscover || isSmartPlaylistLoading}
              className="btn-ghost whitespace-nowrap px-3.5 py-2 text-xs gap-1.5 border border-base-600/40 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
              title={isNightlyMix ? 'Refresh mix' : 'Refresh playlist'}
            >
              {refreshingDiscover ? <Loader2 size={14} className="animate-spin text-accent" /> : <RefreshCw size={14} />}
              {isNightlyMix ? 'Refresh mix' : 'Refresh playlist'}
            </button>
          )}
          <button
            type="button"
            onClick={handleCachePlaylist}
            disabled={tracks.length === 0 || cachingAudio}
            className="btn-ghost whitespace-nowrap px-3.5 py-2 text-xs gap-1.5 border border-base-600/40 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {cachingAudio ? <Loader2 size={14} className="animate-spin" /> : <HardDrive size={14} />}
            {isNightlyMix ? 'Cache mix' : 'Cache playlist'}
          </button>
          {canEditPlaylist && (
            editing ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={saveEditing}
                  disabled={savingDetails}
                  className="btn-accent whitespace-nowrap px-3.5 py-2 text-xs gap-1.5 rounded-xl shadow-md font-medium"
                >
                  <Check size={14} />
                  Done
                </button>
                <button
                  type="button"
                  onClick={cancelEditing}
                  disabled={savingDetails}
                  className="btn-ghost whitespace-nowrap px-3.5 py-2 text-xs gap-1.5 border border-base-600/40 rounded-xl text-muted hover:text-white"
                >
                  <X size={14} />
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={startEditing}
                className="btn-ghost whitespace-nowrap px-3.5 py-2 text-xs gap-1.5 border border-base-600/40 rounded-xl"
              >
                <Pencil size={14} />
                Edit playlist
              </button>
            )
          )}
        </div>
      </div>

      {cacheMessage && (
        <div className="px-4 sm:px-6 lg:px-9 pb-3 -mt-2">
          <p className="rounded-lg border border-base-600/60 bg-base-800 px-3 py-2 text-xs text-muted">
            {cacheMessage}
          </p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-9 pb-6">
        {isPlaylistLoading && (
          <div className="flex min-h-[18rem] h-full flex-col items-center justify-center gap-3 text-muted">
            <Loader2 size={28} strokeWidth={1.5} className="animate-spin text-accent" />
            <p className="text-sm">Loading playlist tracks…</p>
          </div>
        )}
        {!isPlaylistLoading && tracks.length === 0 && (
          <div className="flex min-h-[18rem] h-full flex-col items-center justify-center gap-3 text-muted">
            <div className="w-14 h-14 rounded-xl bg-base-800 border border-base-600/30 flex items-center justify-center">
              <Music2 size={28} strokeWidth={1.2} />
            </div>
            <p className="text-sm">No tracks saved in this playlist yet.</p>
          </div>
        )}

        {tracks.length > 0 && (
          <div className="sticky top-0 z-20 -mx-4 mb-3 flex flex-col gap-2 bg-base-950/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:flex-row sm:px-6 lg:-mx-9 lg:px-9">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                value={trackFilter}
                onChange={(event) => setTrackFilter(event.target.value)}
                placeholder="Filter this playlist"
                className="input-base h-10 pl-8 text-xs"
              />
            </div>
            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as PlaylistSort)}
              className="input-base h-10 sm:w-44 text-xs"
            >
              <option value="custom">Custom order</option>
              <option value="title-asc">Title A-Z</option>
              <option value="title-desc">Title Z-A</option>
              <option value="artist-asc">Artist A-Z</option>
              <option value="artist-desc">Artist Z-A</option>
              <option value="duration-asc">Duration (Shortest-Longest)</option>
              <option value="duration-desc">Duration (Longest-Shortest)</option>
            </select>
            <div className="flex shrink-0 rounded-lg border border-base-600/50 bg-base-900 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={clsx('rounded-md p-2 transition-colors', viewMode === 'grid' ? 'bg-accent/20 text-accent' : 'text-muted hover:text-white')}
                title="Grid view"
                aria-label="Grid view"
              >
                <Grid size={15} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={clsx('rounded-md p-2 transition-colors', viewMode === 'list' ? 'bg-accent/20 text-accent' : 'text-muted hover:text-white')}
                title="List view"
                aria-label="List view"
              >
                <List size={15} />
              </button>
            </div>
          </div>
        )}

        {tracks.length > 0 && visibleTracks.length === 0 && (
          <div className="rounded-lg border border-base-600/50 bg-base-900 px-4 py-3 text-sm text-muted">
            No tracks match "{trackFilter}".
          </div>
        )}

        {viewMode === 'grid' && visibleTracks.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {visibleTracks.map(({ track, originalIndex }) => {
              const isActive = isTrackActive(currentTrack, track);
              return (
                <div
                  role="button"
                  tabIndex={0}
                  key={track.id + (track.spotifyId ?? '') + originalIndex}
                  onClick={() => handlePlay(track)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handlePlay(track);
                    }
                  }}
                  className={clsx('group min-w-0 rounded-xl border border-base-600/50 bg-base-900/70 p-2.5 text-left transition-colors hover:border-base-500 hover:bg-base-800', isActive && 'border-accent/60 bg-accent/10')}
                >
                  <div className="aspect-square w-full overflow-hidden rounded-lg bg-base-800">
                    {track.thumbnail ? (
                      <img src={track.thumbnail} alt="" className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted"><Music2 size={24} /></div>
                    )}
                  </div>
                  <div className="mt-2 min-w-0">
                    <PlaylistTrackTitle track={track} isActive={isActive} setView={setView} />
                    <p className="mt-1 text-[11px] text-muted">{formatDuration(track.duration)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {viewMode === 'list' && visibleTracks.map(({ track, originalIndex }, visibleIndex) => {
          const isActive = isTrackActive(currentTrack, track);
          const canReorder = editing && sortMode === 'custom' && !trackFilter.trim();
          return (
            <div
              key={track.id + (track.spotifyId ?? '') + originalIndex}
              data-playlist-track-index={originalIndex}
              data-playlist-track-id={playlistTrackId(track)}
              className={clsx(
                'group flex items-center px-3 py-2.5 rounded-lg border border-transparent hover:bg-base-800 hover:border-base-600/60 transition-colors duration-100',
                canReorder ? 'cursor-default hover:border-accent/40' : 'cursor-pointer',
                isActive && 'bg-accent/10',
                draggedTrackId === playlistTrackId(track) && 'opacity-50 scale-[0.98]',
                dragOverIndex === originalIndex && draggedTrackId !== playlistTrackId(track) && 'border-accent/70 bg-accent/10'
              )}
              onClick={() => {
                if (!editing) handlePlay(track);
              }}
            >
              <div
                className={clsx(
                  'w-4 mr-1 flex-shrink-0 flex items-center justify-center text-muted transition-opacity',
                  canReorder ? 'opacity-100 cursor-grab active:cursor-grabbing' : 'opacity-30'
                )}
                onPointerDown={(event) => {
                  if (!canReorder || event.button !== 0) return;
                  event.preventDefault();
                  dragFromIndexRef.current = originalIndex;
                  dragCurrentIndexRef.current = originalIndex;
                  dragLastHoverTrackIdRef.current = playlistTrackId(track);
                  setDraggedTrackId(playlistTrackId(track));
                  setDragOverIndex(originalIndex);
                }}
                title={canReorder ? 'Drag to reorder track' : undefined}
              >
                <GripVertical size={14} />
              </div>
              <div className="w-5 flex-shrink-0 flex items-center justify-center">
                {isActive && isPlaying ? (
                  <div className="flex gap-0.5 items-end h-3 justify-center">
                    <div className="w-0.5 h-3 bg-accent rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                    <div className="w-0.5 h-1.5 bg-accent rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                    <div className="w-0.5 h-2.5 bg-accent rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                  </div>
                ) : (
                  <span className={clsx('text-xs font-mono', isActive ? 'text-accent font-semibold' : 'text-muted')}>
                    {visibleIndex + 1}
                  </span>
                )}
              </div>
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
                <PlaylistTrackTitle track={track} isActive={isActive} setView={setView} />
              </div>
              <div className="flex flex-shrink-0 items-center gap-1">
                <TrackActionButtons
                  track={track}
                  queueSource={queueSource}
                  className="hidden sm:flex items-center justify-end gap-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  trailingActions={
                    editing && canEditPlaylist ? (
                      <button
                        type="button"
                        className="btn-ghost p-1.5 text-muted hover:text-red-400"
                        onClick={(e) => {
                          e.stopPropagation();
                          requestRemoveTrack(track);
                        }}
                        title="Remove from playlist"
                      >
                        <Trash2 size={14} />
                      </button>
                    ) : null
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

      <ConfirmDialog
        open={Boolean(pendingRemoveTrack)}
        eyebrow="Playlist"
        title="Remove track from playlist?"
        description="This removes the track from this playlist only. It will not delete the track from your library or disk."
        detail={
          pendingRemoveTrack
            ? { title: pendingRemoveTrack.title, subtitle: pendingRemoveTrack.artist }
            : null
        }
        confirmLabel="Remove track"
        loading={removingTrack}
        onConfirm={confirmRemoveTrack}
        onCancel={() => !removingTrack && setPendingRemoveTrack(null)}
      />
    </div>
  );
}
