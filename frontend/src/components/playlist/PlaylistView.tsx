import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, HardDrive, GripVertical, Heart, ImageOff, ImagePlus, ListMusic, ListPlus, Loader2, Music2, Pencil, Play, Save, Search, Trash2, X } from 'lucide-react';
import { api, type Track } from '../../utils/api';
import { formatDuration } from '../../utils/format';
import { usePlayerStore } from '../../store/player';
import { clsx } from 'clsx';
import { LikeButton } from '../player/LikeButton';
import { useClearTrackCache } from '../../hooks/useClearTrackCache';

const LIKED_PLAYLIST_ID = 'system-liked-songs';
const CROP_VIEWPORT_SIZE = 320;
const COVER_OUTPUT_SIZE = 640;
type PlaylistSort = 'custom' | 'title' | 'artist' | 'duration';

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
      {artistViewId ? (
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
      ) : (
        <p className="max-w-full truncate text-xs text-muted">{track.artist}</p>
      )}
    </div>
  );
}

export function PlaylistView() {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);
  const [cropSource, setCropSource] = useState<CropSource | null>(null);
  const [cachingAudio, setCachingAudio] = useState(false);
  const [cacheMessage, setCacheMessage] = useState<string | null>(null);
  const [trackFilter, setTrackFilter] = useState('');
  const [sortMode, setSortMode] = useState<PlaylistSort>('custom');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { activePlaylistId, playTrack, currentTrack, addToQueue, setView } = usePlayerStore();
  const { requestClearTrackCache, clearTrackCacheModal } = useClearTrackCache();
  const qc = useQueryClient();
  const { data: playlist, isLoading } = useQuery({
    queryKey: ['playlist', activePlaylistId],
    queryFn: () => api.getPlaylist(activePlaylistId!),
    enabled: Boolean(activePlaylistId),
  });

  const tracks = playlist?.tracks ?? [];
  const isLikedPlaylist = activePlaylistId === LIKED_PLAYLIST_ID;
  const visibleTracks = tracks
    .map((track, originalIndex) => ({ track, originalIndex }))
    .filter(({ track }) => {
      const keyword = trackFilter.trim().toLowerCase();
      if (!keyword) return true;
      return `${track.title} ${track.artist}`.toLowerCase().includes(keyword);
    })
    .sort((a, b) => {
      if (sortMode === 'title') return a.track.title.localeCompare(b.track.title);
      if (sortMode === 'artist') return a.track.artist.localeCompare(b.track.artist);
      if (sortMode === 'duration') return a.track.duration - b.track.duration;
      return a.originalIndex - b.originalIndex;
    });

  useEffect(() => {
    setDraftName(playlist?.name ?? '');
    setTrackFilter('');
    setSortMode('custom');
  }, [playlist?.id, playlist?.name]);

  useEffect(() => {
    return () => {
      if (cropSource) URL.revokeObjectURL(cropSource.url);
    };
  }, [cropSource]);

  function handlePlay(track: Track) {
    playTrack(
      { ...track, queueSource: 'playlist' },
      tracks.map((playlistTrack) => ({ ...playlistTrack, queueSource: 'playlist' })),
      { queueSource: 'playlist' }
    );
  }

  function handlePlayAll() {
    if (tracks.length === 0) return;
    playTrack(
      { ...tracks[0], queueSource: 'playlist' },
      tracks.map((track) => ({ ...track, queueSource: 'playlist' }))
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

  async function handleRemove(track: Track) {
    if (!activePlaylistId || isLikedPlaylist) return;
    try {
      await api.removeTrack(activePlaylistId, playlistTrackId(track));
      qc.invalidateQueries({ queryKey: ['playlist', activePlaylistId] });
      qc.invalidateQueries({ queryKey: ['playlists'] });
    } catch (err) {
      console.error('Remove track failed:', err);
    }
  }

  async function handleRename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activePlaylistId || isLikedPlaylist || !playlist) return;
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
    if (!file || !activePlaylistId || isLikedPlaylist) return;
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
    if (!activePlaylistId || isLikedPlaylist || !cropSource) return;
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
    if (!activePlaylistId || isLikedPlaylist) return;
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
      {clearTrackCacheModal}
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
      <div className="px-4 pt-5 pb-4 sm:px-6 lg:px-9 lg:pt-8 lg:pb-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="flex items-end gap-5 min-w-0">
          <div className="w-28 h-28 rounded-xl bg-base-800 border border-base-600/60 flex items-center justify-center text-muted overflow-hidden flex-shrink-0">
            {playlist?.coverDataUrl ? (
              <img src={playlist.coverDataUrl} alt="" className="w-full h-full object-cover" />
            ) : isLikedPlaylist ? (
              <Heart size={36} strokeWidth={1.4} fill="currentColor" className="text-accent" />
            ) : (
              <ListMusic size={34} strokeWidth={1.3} />
            )}
          </div>
          <div className="min-w-0">
            <p className="section-label text-accent">Playlist</p>
            {editing && !isLikedPlaylist ? (
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
                  className="btn-accent p-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Save name"
                >
                  <Save size={16} />
                </button>
              </form>
            ) : (
              <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight mt-2 truncate">
                {playlist?.name ?? 'Playlist'}
              </h1>
            )}
            <p className="text-xs text-muted mt-2">
              {isLoading ? 'Loading tracks' : tracks.length + ' tracks'}
            </p>
            {editing && !isLikedPlaylist && (
              <div className="flex items-center gap-2 mt-4">
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
                  className="btn-ghost px-3 py-2 text-xs gap-1.5 border border-base-600/40 disabled:opacity-40"
                >
                  <ImagePlus size={14} />
                  Upload cover
                </button>
                {playlist?.coverDataUrl && (
                  <button
                    type="button"
                    onClick={handleRemoveCover}
                    disabled={savingDetails}
                    className="btn-ghost px-3 py-2 text-xs gap-1.5 border border-base-600/40 text-muted hover:text-red-400 disabled:opacity-40"
                  >
                    <ImageOff size={14} />
                    Remove cover
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCachePlaylist}
            disabled={tracks.length === 0 || cachingAudio}
            className="btn-ghost px-3 py-2 text-xs gap-1.5 border border-base-600/40 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {cachingAudio ? <Loader2 size={14} className="animate-spin" /> : <HardDrive size={14} />}
            Cache playlist
          </button>
          <button
            type="button"
            onClick={() => setEditing((value) => !value)}
            className={clsx(
              'btn-ghost px-3 py-2 text-xs gap-1.5 border border-base-600/40',
              editing && 'text-accent border-accent/30 bg-accent/10'
            )}
          >
            {editing ? <X size={14} /> : <Pencil size={14} />}
            {editing ? 'Done' : 'Edit playlist'}
          </button>
          <button
            type="button"
            onClick={handlePlayAll}
            disabled={tracks.length === 0}
            className="btn-accent px-4 py-2 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play size={14} fill="currentColor" />
            Play all
          </button>
        </div>
      </div>

      {cacheMessage && (
        <div className="px-4 sm:px-6 lg:px-9 pb-3 -mt-2">
          <p className="max-w-3xl rounded-lg border border-base-600/60 bg-base-800 px-3 py-2 text-xs text-muted">
            {cacheMessage}
          </p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-7 pb-6">
        {!isLoading && tracks.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted">
            <div className="w-14 h-14 rounded-xl bg-base-800 border border-base-600/30 flex items-center justify-center">
              <Music2 size={28} strokeWidth={1.2} />
            </div>
            <p className="text-sm">No tracks saved in this playlist yet.</p>
          </div>
        )}

        {tracks.length > 0 && (
          <div className="max-w-3xl mb-3 flex flex-col sm:flex-row gap-2">
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
              <option value="title">Title</option>
              <option value="artist">Artist</option>
              <option value="duration">Duration</option>
            </select>
          </div>
        )}

        {tracks.length > 0 && visibleTracks.length === 0 && (
          <div className="max-w-3xl rounded-lg border border-base-600/50 bg-base-900 px-4 py-3 text-sm text-muted">
            No tracks match "{trackFilter}".
          </div>
        )}

        {visibleTracks.map(({ track, originalIndex }, visibleIndex) => {
          const isActive =
            currentTrack?.id === track.id ||
            Boolean(currentTrack?.spotifyId && track.spotifyId && currentTrack.spotifyId === track.spotifyId);
          const canReorder = editing && sortMode === 'custom' && !trackFilter.trim();
          return (
            <div
              key={track.id + (track.spotifyId ?? '') + originalIndex}
              draggable={canReorder}
              onDragStart={() => setDragIndex(originalIndex)}
              onDragOver={(e) => {
                if (canReorder) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (canReorder && dragIndex !== null) handleReorder(dragIndex, originalIndex);
              }}
              onDragEnd={() => setDragIndex(null)}
              className={clsx(
                'group max-w-3xl flex items-center px-3 py-2.5 rounded-lg border border-transparent hover:bg-base-800 hover:border-base-600/60 transition-colors duration-100',
                canReorder ? 'cursor-grab' : 'cursor-pointer',
                isActive && 'bg-base-700 ring-1 ring-accent/20 border-accent/20',
                dragIndex === originalIndex && 'opacity-50'
              )}
              onClick={() => {
                if (!editing) handlePlay(track);
              }}
            >
              <div className={clsx(
                'w-4 mr-1 flex-shrink-0 flex items-center justify-center text-muted transition-opacity',
                canReorder ? 'opacity-100 cursor-grab' : 'opacity-30'
              )}>
                <GripVertical size={14} />
              </div>
              <span className="w-5 text-xs text-muted text-center flex-shrink-0">{visibleIndex + 1}</span>
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
                <div className="hidden sm:flex items-center justify-end gap-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    className="btn-ghost p-1.5"
                    onClick={(e) => {
                      e.stopPropagation();
                      addToQueue(track, 'playlist');
                    }}
                    title="Add to queue"
                  >
                    <ListPlus size={14} />
                  </button>
                  <LikeButton track={track} className="p-1.5" />
                  <button
                    className="btn-ghost p-1.5"
                    onClick={(e) => {
                      e.stopPropagation();
                      requestClearTrackCache(track);
                    }}
                    title="Clear track cache"
                  >
                    <HardDrive size={14} />
                  </button>
                  {editing && !isLikedPlaylist && (
                    <button
                      className="btn-ghost p-1.5 text-muted hover:text-red-400"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemove(track);
                      }}
                      title="Remove from playlist"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
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
