import { useState, useMemo, useRef } from 'react';
import { api, type LocalFile, type Track } from '../../utils/api';
import { usePlayerStore } from '../../store/player';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderOpen, Search, Grid, List, Trash2, Music, Disc, User } from 'lucide-react';
import { clsx } from 'clsx';

type ViewMode = 'grid' | 'list';
type SortMode = 'recent' | 'title' | 'artist';

export function LocalFilesView() {
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [searchQuery, setSearchQuery] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const qc = useQueryClient();
  const { playTrack } = usePlayerStore();

  const { data, isLoading } = useQuery({
    queryKey: ['local-files'],
    queryFn: () => api.getLocalFiles(1000, 0),
  });

  const scanMutation = useMutation({
    mutationFn: (path: string) => api.scanLocalFiles(path),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['local-files'] });
      setIsScanning(false);
    },
    onError: () => {
      setIsScanning(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteLocalFile(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['local-files'] });
    },
  });

  const files = data?.files ?? [];

  const filteredFiles = useMemo(() => {
    let result = files;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (f) =>
          f.title.toLowerCase().includes(query) ||
          f.artist.toLowerCase().includes(query) ||
          f.album.toLowerCase().includes(query)
      );
    }

    result = [...result].sort((a, b) => {
      if (sortMode === 'recent') {
        return b.addedAt - a.addedAt;
      } else if (sortMode === 'title') {
        return a.title.localeCompare(b.title);
      } else {
        return a.artist.localeCompare(b.artist);
      }
    });

    return result;
  }, [files, searchQuery, sortMode]);

  function handleScanClick() {
    const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

    if (IS_TAURI) {
      // Tauri: use native dialog
      import('@tauri-apps/plugin-dialog').then(({ open }) =>
        open({ directory: true, multiple: false })
      ).then((selected) => {
        if (selected && typeof selected === 'string') {
          setIsScanning(true);
          scanMutation.mutate(selected);
        }
      }).catch(() => {
        // Fallback: use web file input
        fileInputRef.current?.click();
      });
    } else {
      // Web: use hidden file input with webkitdirectory
      fileInputRef.current?.click();
    }
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // In web context we can't get the real path, show a note
    alert('Selecting individual files is not supported in the web version. Please use the Tauri desktop app for full local file scanning.');
    e.target.value = '';
  }

  function handlePlay(file: LocalFile) {
    const track: Track = {
      id: `local:${file.id}`,
      title: file.title,
      artist: file.artist,
      album: file.album,
      duration: file.duration,
      thumbnail: file.thumbnail,
      query: file.title,
    };
    playTrack(track, [track], { queueSource: 'manual' });
  }

  function handleDelete(id: string) {
    if (confirm('Remove from library? (file will not be deleted from disk)')) {
      deleteMutation.mutate(id);
    }
  }

  function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-white/[0.06] bg-base-950/40 px-6 py-5">
        <div>
          <p className="section-label text-accent">Library</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight mt-2">Your music.</h1>
          <p className="text-xs text-muted mt-2">
            {files.length} {files.length === 1 ? 'track' : 'tracks'} imported
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search library..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-white/[0.08] bg-base-900 py-2 pl-10 pr-3 text-sm text-white placeholder-gray-500 focus:border-accent focus:outline-none"
            />
          </div>

          {/* Sort */}
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="rounded-lg border border-white/[0.08] bg-base-900 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
          >
            <option value="recent">Recently Added</option>
            <option value="title">Title</option>
            <option value="artist">Artist</option>
          </select>

          {/* View Mode */}
          <div className="flex rounded-lg border border-white/[0.08] bg-base-900">
            <button
              onClick={() => setViewMode('grid')}
              className={clsx(
                'p-2 transition-colors',
                viewMode === 'grid' ? 'bg-accent/20 text-accent' : 'text-gray-400 hover:text-white'
              )}
              title="Grid view"
            >
              <Grid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={clsx(
                'p-2 transition-colors',
                viewMode === 'list' ? 'bg-accent/20 text-accent' : 'text-gray-400 hover:text-white'
              )}
              title="List view"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scan Input */}
        <div className="mt-4 flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            multiple
            className="hidden"
            onChange={handleFileInputChange}
          />
          <button
            onClick={handleScanClick}
            disabled={isScanning}
            className={clsx(
              'flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-all',
              isScanning
                ? 'opacity-50 cursor-not-allowed'
                : 'hover:bg-accent/80'
            )}
          >
            <FolderOpen className="h-4 w-4" />
            {isScanning ? 'Scanning...' : 'Add Music'}
          </button>
          {isScanning && (
            <span className="text-xs text-muted">Scanning for audio files…</span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-gray-400">Loading library...</div>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted px-6">
            <div className="w-14 h-14 rounded-xl bg-base-800 border border-base-600/30 flex items-center justify-center">
              <FolderOpen size={30} strokeWidth={1.2} />
            </div>
            <p className="text-sm">
              {searchQuery ? 'No tracks match your search' : 'No local files in library'}
            </p>
            <p className="text-xs text-center max-w-xs">
              {searchQuery ? 'Try a different search term' : 'Click "Choose Folder" to scan and import music files'}
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {filteredFiles.map((file) => (
              <div
                key={file.id}
                className="group relative cursor-pointer overflow-hidden rounded-lg border border-white/[0.08] bg-base-900 p-3 transition-all hover:border-accent/40 hover:bg-base-800"
                onClick={() => handlePlay(file)}
              >
                {/* Thumbnail */}
                <div className="relative mb-3 aspect-square overflow-hidden rounded-md bg-base-800">
                  {file.thumbnail ? (
                    <img
                      src={file.thumbnail}
                      alt={file.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Music className="h-12 w-12 text-gray-600" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="space-y-1">
                  <h3 className="truncate text-sm font-medium text-white">{file.title}</h3>
                  <p className="truncate text-xs text-gray-400">{file.artist}</p>
                  <p className="truncate text-xs text-gray-500">{formatDuration(file.duration)}</p>
                </div>

                {/* Delete button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(file.id);
                  }}
                  className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-gray-400 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                  title="Remove from library"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : viewMode === 'list' ? (
          <div className="space-y-1">
            {filteredFiles.map((file) => (
              <div
                key={file.id}
                className="group flex cursor-pointer items-center gap-4 rounded-lg border border-transparent bg-base-900/40 px-4 py-3 transition-all hover:border-accent/20 hover:bg-base-900"
                onClick={() => handlePlay(file)}
              >
                {/* Thumbnail */}
                <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-md bg-base-800">
                  {file.thumbnail ? (
                    <img
                      src={file.thumbnail}
                      alt={file.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Music className="h-5 w-5 text-gray-600" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-medium text-white">{file.title}</h3>
                  <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {file.artist}
                    </span>
                    <span className="flex items-center gap-1">
                      <Disc className="h-3 w-3" />
                      {file.album || 'Unknown Album'}
                    </span>
                    <span>{formatDuration(file.duration)}</span>
                  </div>
                </div>

                {/* Delete button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(file.id);
                  }}
                  className="rounded-full p-1.5 text-gray-400 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                  title="Remove from library"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
