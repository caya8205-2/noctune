import { useState, useMemo, useRef, useEffect } from 'react';
import { api, type LocalFile, type LocalFolder, type Track, IS_TAURI } from '../../utils/api';
import { usePlayerStore } from '../../store/player';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FolderOpen,
  Search,
  Grid,
  List,
  Trash2,
  Music,
  Disc,
  User,
  ChevronLeft,
  Folder,
  FileMusic,
} from 'lucide-react';
import { clsx } from 'clsx';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { noctuneSize } from '../../theme';

type ViewMode = 'grid' | 'list';
type SortMode = 'recent' | 'title' | 'artist' | 'track';

type PendingDelete =
  | { type: 'track'; file: LocalFile }
  | { type: 'folder'; folder: LocalFolder };

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatTotalDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0 min';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours} hr ${mins} min`;
  return `${mins} min`;
}

function fileToTrack(file: LocalFile): Track {
  return {
    id: file.id,
    title: file.title,
    artist: file.artist,
    album: file.album,
    duration: file.duration,
    thumbnail: file.thumbnail,
    query: file.title,
    queueSource: 'manual',
  };
}

export function LocalFilesView() {
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [searchQuery, setSearchQuery] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanSuccess, setScanSuccess] = useState<string | null>(null);
  /** null = folder browser root; string = import_root of open folder ('' = Imported Files) */
  const [openFolderPath, setOpenFolderPath] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const qc = useQueryClient();
  const { playTrack } = usePlayerStore();

  useEffect(() => {
    function handleFolderPopState(event: PopStateEvent) {
      if (event.state?.noctuneView !== 'local-files') return;
      setOpenFolderPath(typeof event.state?.noctuneLocalFolder === 'string' ? event.state.noctuneLocalFolder : null);
    }
    window.addEventListener('popstate', handleFolderPopState);
    return () => window.removeEventListener('popstate', handleFolderPopState);
  }, []);

  function openLocalFolder(path: string) {
    window.history.pushState(
      { ...window.history.state, noctuneView: 'local-files', noctuneLocalFolder: path },
      '',
      window.location.href
    );
    setOpenFolderPath(path);
  }

  const foldersQuery = useQuery({
    queryKey: ['local-files', 'folders'],
    queryFn: () => api.getLocalFolders(),
  });

  const libraryQuery = useQuery({
    queryKey: ['local-files', 'library', openFolderPath],
    queryFn: () => api.getLocalFiles(500, 0, openFolderPath as string),
    enabled: openFolderPath !== null,
  });

  const invalidateLibrary = () => {
    qc.invalidateQueries({ queryKey: ['local-files'] });
  };

  const scanMutation = useMutation({
    mutationFn: (path: string) => {
      console.log('[local-files] Mutation starting for:', path);
      return api.scanLocalFiles(path);
    },
    onSuccess: (data) => {
      console.log('[local-files] Mutation success:', data);
      if (data && typeof data === 'object' && 'failed' in data && (data.failed as number) > 0) {
        const failed = data.failed;
        const scanned = data.scanned ?? 0;
        const msg = `Scan completed: ${scanned} scanned, ${failed} failed.`;
        console.warn('[local-files] scan reported failures:', msg);
        setScanError(msg);
        setScanSuccess(null);
      } else {
        setScanError(null);
        const name = data.folderName || 'folder';
        const count = data.scanned ?? 0;
        setScanSuccess(
          count > 0
            ? `Imported ${count} track${count === 1 ? '' : 's'} into “${name}”`
            : `No new audio files found in “${name}”`
        );
      }
      invalidateLibrary();

      // Open the folder that was just imported (folder import only)
      if (data.importRoot) {
        setOpenFolderPath(data.importRoot);
      } else if (data.importRoot === '') {
        setOpenFolderPath('');
      }
    },
    onError: (error) => {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('[local-files] Mutation error:', error);
      setScanError(errorMsg);
      setScanSuccess(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteLocalFile(id),
    onSuccess: () => {
      setPendingDelete(null);
      invalidateLibrary();
    },
  });

  const deleteFolderMutation = useMutation({
    mutationFn: (folderPath: string) => api.deleteLocalFolder(folderPath),
    onSuccess: () => {
      setPendingDelete(null);
      setOpenFolderPath(null);
      invalidateLibrary();
    },
  });

  const folders = foldersQuery.data?.folders ?? [];
  const files = libraryQuery.data?.files ?? [];
  const totalTracks = folders.reduce((sum, f) => sum + f.trackCount, 0);
  const openFolder: LocalFolder | null =
    openFolderPath !== null
      ? folders.find((f) => f.path === openFolderPath) ?? {
          path: openFolderPath,
          name: openFolderPath ? openFolderPath.split(/[/\\]/).filter(Boolean).pop() || openFolderPath : 'Imported Files',
          trackCount: files.length,
          thumbnail: files.find((f) => f.thumbnail)?.thumbnail || '',
          addedAt: 0,
          totalDuration: files.reduce((s, f) => s + (f.duration || 0), 0),
          isUngrouped: !openFolderPath,
        }
      : null;

  // Clear success toast after a few seconds
  useEffect(() => {
    if (!scanSuccess) return;
    const t = window.setTimeout(() => setScanSuccess(null), 4500);
    return () => window.clearTimeout(t);
  }, [scanSuccess]);

  const filteredFolders = useMemo(() => {
    let result = folders;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (f) =>
          f.name.toLowerCase().includes(query) ||
          f.path.toLowerCase().includes(query)
      );
    }
    return [...result].sort((a, b) => {
      // Keep ungrouped last when not searching by recent
      if (sortMode === 'recent') {
        if (a.isUngrouped !== b.isUngrouped) return a.isUngrouped ? 1 : -1;
        return b.addedAt - a.addedAt;
      }
      if (sortMode === 'title') return a.name.localeCompare(b.name);
      return b.trackCount - a.trackCount;
    });
  }, [folders, searchQuery, sortMode]);

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
      }
      if (sortMode === 'title') {
        return a.title.localeCompare(b.title);
      }
      if (sortMode === 'track') {
        const ta = a.trackNumber || 9999;
        const tb = b.trackNumber || 9999;
        if (ta !== tb) return ta - tb;
        return a.title.localeCompare(b.title);
      }
      return a.artist.localeCompare(b.artist);
    });

    return result;
  }, [files, searchQuery, sortMode]);

  function handleScanClick() {
    console.log('[local-files] IS_TAURI:', IS_TAURI);
    setScanError(null);
    setScanSuccess(null);

    if (IS_TAURI) {
      console.log('[local-files] Attempting to open native folder picker...');
      import('@tauri-apps/plugin-dialog')
        .then(({ open }) => {
          console.log('[local-files] Dialog plugin loaded successfully');
          return open({
            directory: true,
            multiple: false,
          });
        })
        .then((selected) => {
          console.log('[local-files] Dialog result:', selected);
          let folderPath: string | null = null;
          if (typeof selected === 'string') {
            folderPath = selected;
          } else if (Array.isArray(selected) && selected.length > 0 && typeof selected[0] === 'string') {
            folderPath = selected[0];
          }

          if (folderPath) {
            console.log('[local-files] Starting scan for:', folderPath);
            setIsScanning(true);
            setScanError(null);
            scanMutation.mutate(folderPath, {
              onSettled: () => {
                setIsScanning(false);
              },
              onError: (err: unknown) => {
                const msg = err instanceof Error ? err.message : 'Failed to scan folder';
                setScanError(msg);
              },
            });
          } else {
            console.warn('[local-files] No folder selected or invalid result', selected);
          }
        })
        .catch((err) => {
          console.error('[local-files] Folder dialog failed:', err);
          setScanError('Failed to open folder dialog');
          fileInputRef.current?.click();
        });
    } else {
      fileInputRef.current?.click();
    }
  }

  function handleFileSelect() {
    console.log('[local-files] IS_TAURI:', IS_TAURI);
    setScanError(null);
    setScanSuccess(null);

    if (IS_TAURI) {
      console.log('[local-files] Attempting to open native file picker...');
      import('@tauri-apps/plugin-dialog')
        .then(({ open }) => {
          return open({
            directory: false,
            multiple: true,
          });
        })
        .then((selected) => {
          console.log('[local-files] File dialog result:', selected);
          if (selected && Array.isArray(selected) && selected.length > 0) {
            console.log('[local-files] Starting scan for files:', selected);
            setIsScanning(true);
            setScanError(null);

            const scanPromises = selected.map((file) =>
              scanMutation.mutateAsync(file).catch((err) => {
                console.error(`[local-files] Failed to scan ${file}:`, err);
                throw err;
              })
            );

            Promise.all(scanPromises)
              .then((results) => {
                console.log('[local-files] All files scanned successfully');
                setScanError(null);
                const total = results.reduce((s, r) => s + (r.scanned || 0), 0);
                setScanSuccess(
                  `Imported ${total} file${total === 1 ? '' : 's'} into “Imported Files”`
                );
                setOpenFolderPath('');
                invalidateLibrary();
              })
              .catch((err) => {
                const errorMsg = err instanceof Error ? err.message : 'Failed to scan files';
                console.error('[local-files] File scan failed:', err);
                setScanError(errorMsg);
              })
              .finally(() => {
                setIsScanning(false);
              });
          }
        })
        .catch((err) => {
          console.error('[local-files] File dialog failed:', err);
          setScanError('Failed to open file dialog');
          fileInputRef.current?.click();
        });
    } else {
      fileInputRef.current?.click();
    }
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!IS_TAURI) {
      alert(
        'Selecting individual files is not supported in the web version. Please use the Tauri desktop app for full local file scanning.'
      );
      e.target.value = '';
      return;
    }

    console.warn('[local-files] File input fallback triggered in Tauri - this should not happen');
    e.target.value = '';
  }

  function handlePlay(file: LocalFile, queueFiles: LocalFile[] = filteredFiles) {
    const track = fileToTrack(file);
    const libraryQueue = queueFiles.map(fileToTrack);
    playTrack(track, libraryQueue, { queueSource: 'manual' });
  }

  function handlePlayFolder(folder: LocalFolder) {
    // Load tracks then play first
    api.getLocalFiles(500, 0, folder.path).then((res) => {
      if (!res.files.length) return;
      const queue = res.files.map(fileToTrack);
      playTrack(queue[0], queue, { queueSource: 'manual' });
      setOpenFolderPath(folder.path);
    });
  }

  function requestDeleteTrack(file: LocalFile, e?: React.MouseEvent) {
    e?.stopPropagation();
    setPendingDelete({ type: 'track', file });
  }

  function requestDeleteFolder(folder: LocalFolder, e?: React.MouseEvent) {
    e?.stopPropagation();
    setPendingDelete({ type: 'folder', folder });
  }

  function confirmPendingDelete() {
    if (!pendingDelete) return;
    if (pendingDelete.type === 'track') {
      deleteMutation.mutate(pendingDelete.file.id);
      return;
    }
    deleteFolderMutation.mutate(pendingDelete.folder.path);
  }

  const isDeletePending = deleteMutation.isPending || deleteFolderMutation.isPending;

  const isLoading = foldersQuery.isLoading || (openFolderPath !== null && libraryQuery.isLoading);
  const isRoot = openFolderPath === null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-white/[0.06] bg-base-950/40 px-4 pt-5 pb-4 sm:px-6 lg:px-9 lg:pt-8 lg:pb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {isRoot ? (
              <>
                <p className="section-label text-accent">Library</p>
                <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight mt-2">
                  Your music.
                </h1>
                <p className="text-xs text-muted mt-2">
                  {folders.length} {folders.length === 1 ? 'folder' : 'folders'} · {totalTracks}{' '}
                  {totalTracks === 1 ? 'track' : 'tracks'}
                </p>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (window.history.state?.noctuneLocalFolder !== undefined) {
                      window.history.back();
                    } else {
                      setOpenFolderPath(null);
                    }
                    setSearchQuery('');
                  }}
                  className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-white transition-colors mb-2"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Back to folders
                </button>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg border border-white/[0.08] bg-base-800">
                    {openFolder?.thumbnail ? (
                      <img
                        src={openFolder.thumbnail}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        {openFolder?.isUngrouped ? (
                          <FileMusic className="h-5 w-5 text-gray-500" />
                        ) : (
                          <Folder className="h-5 w-5 text-accent/80" />
                        )}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="section-label text-accent">
                      {openFolder?.isUngrouped ? 'Loose files' : 'Folder'}
                    </p>
                    <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight truncate">
                      {openFolder?.name ?? 'Folder'}
                    </h1>
                    <p className="text-xs text-muted mt-1 truncate" title={openFolder?.path || undefined}>
                      {(openFolder?.trackCount ?? filteredFiles.length)} tracks
                      {openFolder?.totalDuration
                        ? ` · ${formatTotalDuration(openFolder.totalDuration)}`
                        : ''}
                      {openFolder?.path ? ` · ${openFolder.path}` : ''}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>

          {!isRoot && openFolder && (
            <button
              type="button"
              onClick={() => requestDeleteFolder(openFolder)}
              disabled={isDeletePending}
              className="flex-shrink-0 rounded-lg border border-white/[0.08] bg-base-900 px-3 py-2 text-xs text-gray-300 hover:border-red-500/40 hover:text-red-400 transition-colors"
              title="Remove folder from library"
            >
              <span className="inline-flex items-center gap-1.5">
                <Trash2 className="h-3.5 w-3.5" />
                Remove folder
              </span>
            </button>
          )}
        </div>

        {/* Controls */}
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder={isRoot ? 'Search folders...' : 'Search tracks...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-white/[0.08] bg-base-900 py-2 pl-10 pr-3 text-sm text-white placeholder-gray-500 focus:border-accent focus:outline-none"
            />
          </div>

          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="rounded-lg border border-white/[0.08] bg-base-900 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
          >
            {isRoot ? (
              <>
                <option value="recent">Recently Added</option>
                <option value="title">Name</option>
                <option value="artist">Track count</option>
              </>
            ) : (
              <>
                <option value="track">Track #</option>
                <option value="recent">Recently Added</option>
                <option value="title">Title</option>
                <option value="artist">Artist</option>
              </>
            )}
          </select>

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
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            multiple
            className="hidden"
            onChange={handleFileInputChange}
            {...({ webkitdirectory: 'true', mozdirectory: 'true' } as any)}
          />
          <button
            onClick={handleScanClick}
            disabled={isScanning}
            className={clsx(
              'flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-all',
              isScanning ? 'opacity-50 cursor-not-allowed' : 'hover:bg-accent/80'
            )}
          >
            {isScanning ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Scanning...
              </>
            ) : (
              <>
                <FolderOpen className="h-4 w-4" />
                Add Folder
              </>
            )}
          </button>
          <button
            onClick={handleFileSelect}
            disabled={isScanning}
            className={clsx(
              'flex items-center gap-2 rounded-lg border border-white/[0.08] bg-base-900 px-4 py-2 text-sm font-medium text-white transition-all',
              isScanning ? 'opacity-50 cursor-not-allowed' : 'hover:bg-base-800'
            )}
          >
            {isScanning ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Scanning...
              </>
            ) : (
              <>
                <Music className="h-4 w-4" />
                Add Files
              </>
            )}
          </button>
          {!scanError && isScanning && (
            <span className="text-xs text-muted">Scanning for audio files…</span>
          )}
        </div>

        {scanSuccess && (
          <div className="mt-3 rounded-lg border border-accent/20 bg-accent/10 px-4 py-2 text-sm text-accent flex items-center justify-between">
            <span>{scanSuccess}</span>
            <button
              onClick={() => setScanSuccess(null)}
              className="ml-2 text-accent/60 hover:text-accent"
            >
              ✕
            </button>
          </div>
        )}

        {scanError && (
          <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-400 flex items-center justify-between">
            <span>{scanError}</span>
            <button
              onClick={() => setScanError(null)}
              className="ml-2 text-red-400/60 hover:text-red-400"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-9 py-4 pb-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-muted">Loading library...</div>
          </div>
        ) : isRoot ? (
          filteredFolders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted px-page-x">
              <div className="flex h-track-thumb-md w-track-thumb-md items-center justify-center rounded-xl border border-base-600/30 bg-base-800">
                <FolderOpen size={noctuneSize.emptyStateIcon} strokeWidth={1.2} />
              </div>
              <p className="text-sm">
                {searchQuery ? 'No folders match your search' : 'No local files in library'}
              </p>
              <p className="text-xs text-center max-w-xs">
                {searchQuery
                  ? 'Try a different search term'
                  : 'Import a folder to create a library folder, or add individual files'}
              </p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {filteredFolders.map((folder) => (
                <div
                  key={folder.path || '__ungrouped__'}
                  className="track-card group"
                  onClick={() => {
                    setSearchQuery('');
                    setSortMode(folder.isUngrouped ? 'recent' : 'track');
                    openLocalFolder(folder.path);
                  }}
                  onDoubleClick={() => handlePlayFolder(folder)}
                >
                  <div className="track-card-cover">
                    {folder.thumbnail ? (
                      <img
                        src={folder.thumbnail}
                        alt={folder.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-base-800 to-base-900">
                        {folder.isUngrouped ? (
                          <FileMusic className="h-track-thumb w-track-thumb text-muted" />
                        ) : (
                          <Folder className="h-track-thumb w-track-thumb text-accent/70" />
                        )}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-80" />
                    <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1.5 text-[10px] font-medium text-white/90">
                      <Music className="h-3 w-3" />
                      {folder.trackCount} track{folder.trackCount === 1 ? '' : 's'}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <h3 className="truncate text-sm font-medium text-white">{folder.name}</h3>
                    <p className="truncate text-xs text-muted" title={folder.path || undefined}>
                      {folder.isUngrouped
                        ? 'Files added individually'
                        : formatTotalDuration(folder.totalDuration)}
                    </p>
                  </div>

                  <button
                    onClick={(e) => requestDeleteFolder(folder, e)}
                    className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-soft opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                    title="Remove folder from library"
                  >
                    <Trash2 size={noctuneSize.actionIcon} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredFolders.map((folder) => (
                <div
                  key={folder.path || '__ungrouped__'}
                  className="track-row group"
                  onClick={() => {
                    setSearchQuery('');
                    setSortMode(folder.isUngrouped ? 'recent' : 'track');
                    openLocalFolder(folder.path);
                  }}
                  onDoubleClick={() => handlePlayFolder(folder)}
                >
                  <div className="track-thumb track-thumb-md">
                    {folder.thumbnail ? (
                      <img
                        src={folder.thumbnail}
                        alt={folder.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        {folder.isUngrouped ? (
                          <FileMusic className="h-5 w-5 text-muted" />
                        ) : (
                          <Folder className="h-5 w-5 text-accent/70" />
                        )}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-medium text-white">{folder.name}</h3>
                    <div className="mt-1 flex items-center gap-3 text-xs text-soft">
                      <span>
                        {folder.trackCount} track{folder.trackCount === 1 ? '' : 's'}
                      </span>
                      {!folder.isUngrouped && (
                        <span>{formatTotalDuration(folder.totalDuration)}</span>
                      )}
                      {folder.path && (
                        <span className="truncate text-muted" title={folder.path}>
                          {folder.path}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={(e) => requestDeleteFolder(folder, e)}
                    className="rounded-full p-1.5 text-soft opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                    title="Remove folder from library"
                  >
                    <Trash2 size={noctuneSize.actionIconMd} />
                  </button>
                </div>
              ))}
            </div>
          )
        ) : filteredFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted px-page-x">
            <div className="flex h-track-thumb-md w-track-thumb-md items-center justify-center rounded-xl border border-base-600/30 bg-base-800">
              <Music size={noctuneSize.emptyStateIcon} strokeWidth={1.2} />
            </div>
            <p className="text-sm">
              {searchQuery ? 'No tracks match your search' : 'This folder is empty'}
            </p>
            <p className="text-xs text-center max-w-xs">
              {searchQuery ? 'Try a different search term' : 'Import more files or go back to folders'}
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {filteredFiles.map((file) => (
              <div
                key={file.id}
                className="track-card group"
                onClick={() => handlePlay(file)}
              >
                <div className="track-card-cover">
                  {file.thumbnail ? (
                    <img
                      src={file.thumbnail}
                      alt={file.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Music className="h-track-thumb w-track-thumb text-base-500" />
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <h3 className="truncate text-sm font-medium text-white">{file.title}</h3>
                  <p className="truncate text-xs text-soft">{file.artist}</p>
                  <p className="truncate text-xs text-muted">{formatDuration(file.duration)}</p>
                </div>

                <button
                  onClick={(e) => requestDeleteTrack(file, e)}
                  className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-soft opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                  title="Remove from library"
                >
                  <Trash2 size={noctuneSize.actionIcon} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredFiles.map((file, index) => (
              <div
                key={file.id}
                className="track-row group"
                onClick={() => handlePlay(file)}
              >
                <span className="w-6 flex-shrink-0 text-center text-xs text-muted tabular-nums">
                  {file.trackNumber || index + 1}
                </span>

                <div className="track-thumb track-thumb-md">
                  {file.thumbnail ? (
                    <img
                      src={file.thumbnail}
                      alt={file.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Music className="h-5 w-5 text-base-500" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-medium text-white">{file.title}</h3>
                  <div className="mt-1 flex items-center gap-3 text-xs text-soft">
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

                <button
                  onClick={(e) => requestDeleteTrack(file, e)}
                  className="rounded-full p-1.5 text-soft opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                  title="Remove from library"
                >
                  <Trash2 size={noctuneSize.actionIconMd} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete?.type === 'track'}
        eyebrow="Local library"
        title="Remove track from library?"
        description="This removes the track from your library only. The audio file on disk will not be deleted."
        detail={
          pendingDelete?.type === 'track'
            ? { title: pendingDelete.file.title, subtitle: pendingDelete.file.artist }
            : null
        }
        confirmLabel="Remove track"
        loading={deleteMutation.isPending}
        onConfirm={confirmPendingDelete}
        onCancel={() => !isDeletePending && setPendingDelete(null)}
      />

      <ConfirmDialog
        open={pendingDelete?.type === 'folder'}
        eyebrow="Local library"
        title={
          pendingDelete?.type === 'folder' && pendingDelete.folder.isUngrouped
            ? 'Remove imported files?'
            : 'Remove folder from library?'
        }
        description={
          pendingDelete?.type === 'folder' && pendingDelete.folder.isUngrouped
            ? 'All individually imported files will be removed from the library. Files on disk will not be deleted.'
            : 'All tracks in this folder will be removed from the library. Files on disk will not be deleted.'
        }
        detail={
          pendingDelete?.type === 'folder'
            ? {
                title: pendingDelete.folder.name,
                subtitle: `${pendingDelete.folder.trackCount} track${
                  pendingDelete.folder.trackCount === 1 ? '' : 's'
                }${pendingDelete.folder.path ? ` · ${pendingDelete.folder.path}` : ''}`,
              }
            : null
        }
        confirmLabel={
          pendingDelete?.type === 'folder' && pendingDelete.folder.isUngrouped
            ? 'Remove files'
            : 'Remove folder'
        }
        loading={deleteFolderMutation.isPending}
        onConfirm={confirmPendingDelete}
        onCancel={() => !isDeletePending && setPendingDelete(null)}
      />
    </div>
  );
}
