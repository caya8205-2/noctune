import { useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  Clock3,
  Orbit,
  Download,
  FolderOpen,
  Heart,
  Home,
  ListMusic,
  ListOrdered,
  Loader2,
  MoreVertical,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trash2,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { usePlayerStore } from '../../store/player';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../utils/api';
import { clsx } from 'clsx';
import { ConfirmDialog } from './ConfirmDialog';

type SidebarView = 'home' | 'search' | 'history' | 'queue' | 'settings' | 'playlist' | 'stats' | 'local-files';

function playlistImportErrorMessage(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('already exists')) return 'A playlist with this name already exists.';
  if (lower.includes('no tracks')) return 'No tracks found. Private or personalized playlists may not be importable.';
  if (lower.includes('spotify') && (lower.includes('401') || lower.includes('403'))) {
    return 'Spotify could not access this playlist. Public user playlists work best.';
  }
  if (lower.includes('youtube') || lower.includes('playlist')) {
    return message;
  }
  return message || 'Playlist import failed.';
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 4 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const isMobileDrawer = Boolean(onNavigate);
  const {
    activeView,
    activePlaylistId,
    setView,
    sidebarCompact,
    toggleSidebarCompact,
  } = usePlayerStore();
  const compact = isMobileDrawer ? false : sidebarCompact;
  const qc = useQueryClient();
  const [playlistMenuOpen, setPlaylistMenuOpen] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pendingDeletePlaylist, setPendingDeletePlaylist] = useState<{ id: string; name: string } | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const menuRef = useRef<HTMLDivElement | null>(null);
  const userPlaylistsRef = useRef<HTMLDivElement | null>(null);
  const [openMenuPlaylistId, setOpenMenuPlaylistId] = useState<string | null>(null);
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    function handleOpenSidebar(e: Event) {
      const detail = (e as CustomEvent<{ scrollTo?: string }>).detail;
      if (detail?.scrollTo === 'user-playlists') {
        if (!isMobileDrawer && sidebarCompact) {
          toggleSidebarCompact();
        }
        setTimeout(() => {
          userPlaylistsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
      }
    }

    window.addEventListener('noctune:open-sidebar', handleOpenSidebar);
    return () => window.removeEventListener('noctune:open-sidebar', handleOpenSidebar);
  }, [isMobileDrawer, sidebarCompact, toggleSidebarCompact]);

  useEffect(() => {
    if (!openMenuPlaylistId) return;
    function handleClickOutside(event: MouseEvent) {
      if (!(event.target as HTMLElement)?.closest('[data-playlist-menu]')) {
        setOpenMenuPlaylistId(null);
      }
    }
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [openMenuPlaylistId]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setPlaylistMenuOpen(false);
      }
    }
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const { data: playlists = [], isLoading: playlistsLoading } = useQuery({
    queryKey: ['playlists'],
    queryFn: api.getPlaylists,
  });
  const likedPlaylist = playlists.find((pl) => pl.id === 'system-liked-songs');
  const userPlaylists = playlists.filter((pl) => pl.id !== 'system-liked-songs');

  const createMut = useMutation({
    mutationFn: () => api.createPlaylist('New Playlist'),
    onSuccess: (playlist) => {
      setDeleteError(null);
      qc.invalidateQueries({ queryKey: ['playlists'] });
      setView('playlist', playlist.id);
      setPlaylistMenuOpen(false);
    },
    onError: (err) => setDeleteError((err as Error).message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deletePlaylist(id),
    onSuccess: () => {
      setDeleteError(null);
      setPendingDeletePlaylist(null);
      qc.invalidateQueries({ queryKey: ['playlists'] });
      if (activeView === 'playlist') setView('home');
    },
    onError: (err) => setDeleteError((err as Error).message),
  });

  async function handleImportPlaylist(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const url = importUrl.trim();
    if (!url) return;
    setImporting(true);
    setDeleteError(null);
    try {
      const result = await api.importPlaylist(url);
      await qc.invalidateQueries({ queryKey: ['playlists'] });
      setView('playlist', result.playlist.id);
      setPlaylistMenuOpen(false);
      setImportUrl('');
      setDeleteError(null);
    } catch (err) {
      setDeleteError(playlistImportErrorMessage((err as Error).message));
    } finally {
      setImporting(false);
    }
  }

  function handleDeletePlaylist(id: string, name: string) {
    setPendingDeletePlaylist({ id, name });
  }

  async function handleSaveRename(playlistId: string, currentName: string) {
    const newName = editName.trim();
    setEditingPlaylistId(null);
    if (!newName || newName === currentName) return;
    try {
      await api.updatePlaylist(playlistId, { name: newName });
      qc.invalidateQueries({ queryKey: ['playlists'] });
      if (activePlaylistId === playlistId) {
        qc.invalidateQueries({ queryKey: ['playlist', playlistId] });
      }
    } catch (err) {
      setDeleteError((err as Error).message);
    }
  }

  const navItems = [
    { icon: Home, label: 'Home', view: 'home' as const },
    { icon: Search, label: 'Search', view: 'search' as const },
    { icon: BarChart3, label: 'Stats', view: 'stats' as const },
    { icon: FolderOpen, label: 'Local Library', view: 'local-files' as const },
    { icon: Clock3, label: 'History', view: 'history' as const },
    { icon: ListOrdered, label: 'Queue', view: 'queue' as const },
    { icon: Settings, label: 'Settings', view: 'settings' as const },
  ];

  function navigate(view: SidebarView, playlistId?: string) {
    setView(view, playlistId);
    onNavigate?.();
  }

  return (
    <div className={clsx('flex h-full flex-col bg-transparent py-5', compact ? 'px-1.5' : 'px-3')}>
      {/* Top Header with Compact Toggle Button */}
      <div className={clsx('mb-3 flex flex-shrink-0 items-center', compact ? 'justify-center w-full' : 'justify-between px-0.5', isMobileDrawer && 'pr-12')}>
        {!compact && (
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-2">
              <span className="h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-accent" />
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">
                {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              </span>
            </div>
            <p className="mb-1.5 font-mono text-[11px] font-medium tabular-nums text-soft">
              {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
            </p>
            <h2 className="font-display text-[22px] leading-tight text-white">
              {getGreeting()}
            </h2>
          </div>
        )}

        {!isMobileDrawer && (
          <button
            type="button"
            onClick={toggleSidebarCompact}
            className={clsx(
              'flex items-center justify-center rounded-xl text-muted transition-colors hover:bg-white/[0.05] hover:text-white',
              compact ? 'w-full py-2.5' : 'h-8 w-8'
            )}
            title={compact ? 'Expand sidebar' : 'Compact sidebar'}
          >
            {compact ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={16} />}
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-shrink-0 flex flex-col gap-1">
        {navItems.map(({ icon: Icon, label, view }) => {
          const active = activeView === view;
          return (
            <button
              key={view}
              onClick={() => navigate(view)}
              title={compact ? label : undefined}
              className={clsx(
                'group relative flex items-center rounded-xl text-sm font-medium transition-all duration-200 touch-manipulation',
                compact ? 'justify-center px-0 py-2.5 w-full' : 'gap-3 px-3 py-2.5',
                isMobileDrawer && 'min-h-[44px]',
                active
                  ? 'bg-white/[0.05] text-white'
                  : 'text-muted hover:bg-white/[0.03] hover:text-white'
              )}
            >
              <span
                className={clsx(
                  'absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-accent transition-all duration-200',
                  active ? 'opacity-100 shadow-glow' : 'opacity-0'
                )}
              />
              <Icon size={18} className={clsx('transition-colors flex-shrink-0', active && 'text-accent')} />
              {!compact && <span>{label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Playlists */}
      <div className="flex-1 min-h-0 flex flex-col mt-4">
        {!compact && (
          <div className="relative mb-2 flex flex-shrink-0 items-center justify-between px-0.5" ref={menuRef}>
            <span className="section-label">Playlists</span>
            <button
              type="button"
              onClick={() => setPlaylistMenuOpen((open) => !open)}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-muted transition-colors hover:bg-white/[0.05] hover:text-white touch-manipulation"
              title="New playlist"
            >
              <Plus size={16} />
            </button>

            {playlistMenuOpen && (
              <div className={clsx(
                'dropdown-panel absolute z-50 animate-slide-up p-2',
                isMobileDrawer ? 'right-0 top-full mt-2 w-64' : 'left-full top-0 ml-2 w-60'
              )}>
                <div className="border-b border-base-600/60 pb-1.5 mb-1.5 px-2 pt-1 flex items-center justify-between">
                  <span className="text-xs font-semibold text-white">Create Playlist</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteError(null);
                    createMut.mutate();
                  }}
                  disabled={createMut.isPending}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs text-soft transition-colors hover:bg-base-800 hover:text-white disabled:opacity-50"
                >
                  {createMut.isPending ? <Loader2 size={13} className="animate-spin text-accent" /> : <Plus size={13} className="text-muted" />}
                  <span>{createMut.isPending ? 'Creating playlist...' : 'Local playlist'}</span>
                </button>
                <form onSubmit={handleImportPlaylist} className="mt-1 border-t border-base-600/60 pt-2 space-y-2">
                  <label className="flex items-center gap-2 px-2.5 text-xs text-soft font-medium">
                    <Download size={13} className="text-muted" />
                    <span>Import from URL</span>
                  </label>
                  <input
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    disabled={importing}
                    placeholder="Spotify or YouTube URL"
                    className="input-base text-xs py-2 px-3"
                  />
                  <button
                    type="submit"
                    disabled={importing || !importUrl.trim()}
                    className="btn-accent w-full py-1.5 text-xs disabled:opacity-50"
                  >
                    {importing && <Loader2 size={12} className="animate-spin" />}
                    {importing ? 'Importing...' : 'Import'}
                  </button>
                </form>
              </div>
            )}
          </div>
        )}

        {compact && (
          <div className="relative flex-shrink-0 mb-1" ref={menuRef}>
            <button
              type="button"
              onClick={() => setPlaylistMenuOpen((open) => !open)}
              title="New playlist"
              className="group relative flex w-full items-center justify-center rounded-xl py-2.5 text-muted transition-all duration-150 hover:bg-white/[0.05] hover:text-white"
            >
              <Plus size={18} className="flex-shrink-0" />
            </button>

            {playlistMenuOpen && (
              <div className="dropdown-panel absolute left-full top-0 z-50 ml-2 w-60 animate-slide-up p-2">
                <div className="border-b border-base-600/60 pb-1.5 mb-1.5 px-2 pt-1 flex items-center justify-between">
                  <span className="text-xs font-semibold text-white">Create Playlist</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteError(null);
                    createMut.mutate();
                  }}
                  disabled={createMut.isPending}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs text-soft transition-colors hover:bg-base-800 hover:text-white disabled:opacity-50"
                >
                  {createMut.isPending ? <Loader2 size={13} className="animate-spin text-accent" /> : <Plus size={13} className="text-muted" />}
                  <span>{createMut.isPending ? 'Creating playlist...' : 'Local playlist'}</span>
                </button>
                <form onSubmit={handleImportPlaylist} className="mt-1 border-t border-base-600/60 pt-2 space-y-2">
                  <label className="flex items-center gap-2 px-2.5 text-xs text-soft font-medium">
                    <Download size={13} className="text-muted" />
                    <span>Import from URL</span>
                  </label>
                  <input
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    disabled={importing}
                    placeholder="Spotify or YouTube URL"
                    className="input-base text-xs py-2 px-3"
                  />
                  <button
                    type="submit"
                    disabled={importing || !importUrl.trim()}
                    className="btn-accent w-full py-1.5 text-xs disabled:opacity-50"
                  >
                    {importing && <Loader2 size={12} className="animate-spin" />}
                    {importing ? 'Importing...' : 'Import'}
                  </button>
                </form>
              </div>
            )}
          </div>
        )}

        {deleteError && !compact && (
          <p className="mb-2 px-3 text-[11px] leading-relaxed text-red-400 flex-shrink-0">{deleteError}</p>
        )}

        {/* Playlists list */}
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1 scrollbar-hidden">
          {likedPlaylist && (
            <button
              onClick={() => navigate('playlist', likedPlaylist.id)}
              title={compact ? likedPlaylist.name : undefined}
              className={clsx(
                'group relative flex w-full items-center rounded-xl text-sm transition-all duration-150 touch-manipulation',
                compact ? 'justify-center py-2.5' : 'gap-2.5 px-3 py-2',
                isMobileDrawer && 'min-h-[40px]',
                activeView === 'playlist' && activePlaylistId === likedPlaylist.id
                  ? 'bg-white/[0.05] text-white'
                  : 'text-muted hover:bg-white/[0.03] hover:text-white'
              )}
            >
              <Heart
                size={16}
                fill="currentColor"
                className={clsx(
                  'flex-shrink-0 text-rose-400',
                  activeView === 'playlist' && activePlaylistId === likedPlaylist.id && 'text-accent'
                )}
              />
              {!compact && <span className="flex-1 truncate text-left">{likedPlaylist.name}</span>}
            </button>
          )}

          <div className="flex flex-col gap-0.5">
            {([
              { id: 'smart:most-played', label: 'Top Favorites', icon: TrendingUp },
              { id: 'smart:recently-added', label: 'In Rotation', icon: Orbit },
              { id: 'smart:short-tracks', label: 'Short Tracks', icon: Zap },
              { id: 'smart:discover-weekly', label: 'Discover Weekly', icon: Sparkles },
            ] as const).map(({ id, label, icon: Icon }) => {
              const active = activePlaylistId === id && activeView === 'playlist';
              return (
                <button
                  key={id}
                  onClick={() => navigate('playlist', id)}
                  title={compact ? label : undefined}
                  className={clsx(
                    'group relative flex w-full items-center rounded-xl text-sm transition-all duration-150 touch-manipulation',
                    compact ? 'justify-center py-2.5' : 'gap-2.5 px-3 py-2',
                    isMobileDrawer && 'min-h-[40px]',
                    active
                      ? 'bg-white/[0.05] text-white'
                      : 'text-muted hover:bg-white/[0.03] hover:text-white'
                  )}
                >
                  <Icon size={16} className={clsx('flex-shrink-0', active && 'text-accent')} />
                  {!compact && <span className="flex-1 truncate text-left">{label}</span>}
                </button>
              );
            })}
          </div>

          <div ref={userPlaylistsRef} id="user-playlists" className="flex flex-col gap-1">
            {playlistsLoading && playlists.length === 0 && (
              <div className="flex flex-col gap-2 py-1">
                {compact ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-6 w-6 rounded-lg bg-white/[0.06] animate-pulse" />
                    <div className="h-6 w-6 rounded-lg bg-white/[0.06] animate-pulse" />
                    <div className="h-6 w-6 rounded-lg bg-white/[0.06] animate-pulse" />
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 px-3">
                    <div className="h-3.5 w-3/4 rounded bg-white/[0.06] animate-pulse" />
                    <div className="h-3.5 w-1/2 rounded bg-white/[0.06] animate-pulse" />
                    <div className="h-3.5 w-2/3 rounded bg-white/[0.06] animate-pulse" />
                  </div>
                )}
              </div>
            )}
            {userPlaylists.map((pl) => {
              const active = activeView === 'playlist' && activePlaylistId === pl.id;
              const isEditing = editingPlaylistId === pl.id;
              const isMenuOpen = openMenuPlaylistId === pl.id;
              return (
                <div
                  key={pl.id}
                  title={compact ? pl.name : undefined}
                  className={clsx(
                    'group relative flex cursor-pointer items-center rounded-xl text-sm transition-all duration-150 touch-manipulation',
                    compact ? 'justify-center py-2.5' : 'gap-2.5 px-3 py-2',
                    isMobileDrawer && 'min-h-[40px]',
                    active
                      ? 'bg-white/[0.05] text-white'
                      : 'text-muted hover:bg-white/[0.03] hover:text-white'
                  )}
                  onClick={() => {
                    if (!isEditing) navigate('playlist', pl.id);
                  }}
                >
                  {pl.coverDataUrl ? (
                    <img src={pl.coverDataUrl} alt="" className="h-6 w-6 flex-shrink-0 rounded-md object-cover" />
                  ) : (
                    <ListMusic size={16} className={clsx('flex-shrink-0', active && 'text-accent')} />
                  )}
                  {!compact && (
                    <>
                      {isEditing ? (
                        <form
                          className="flex-1 min-w-0 mr-1"
                          onSubmit={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleSaveRename(pl.id, pl.name);
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="text"
                            autoFocus
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onBlur={() => handleSaveRename(pl.id, pl.name)}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                e.stopPropagation();
                                setEditingPlaylistId(null);
                              }
                            }}
                            className="w-full rounded bg-base-800 px-1.5 py-0.5 text-xs text-white outline-none ring-1 ring-accent"
                          />
                        </form>
                      ) : (
                        <span className="flex-1 truncate">{pl.name}</span>
                      )}

                      <div className="relative flex items-center" data-playlist-menu>
                        <button
                          type="button"
                          className={clsx(
                            'btn-ghost transition rounded-lg hover:text-white',
                            isMobileDrawer
                              ? 'p-1.5 opacity-70 hover:opacity-100'
                              : 'p-1 opacity-0 group-hover:opacity-100',
                            isMenuOpen && '!opacity-100 text-white bg-white/[0.08]'
                          )}
                          disabled={deleteMut.isPending}
                          title="Playlist options"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuPlaylistId(isMenuOpen ? null : pl.id);
                          }}
                        >
                          <MoreVertical size={14} />
                        </button>

                        {isMenuOpen && (
                          <div
                            className="absolute right-0 top-full mt-1 z-30 w-32 rounded-xl border border-white/[0.08] bg-base-900/95 p-1 shadow-xl backdrop-blur-xl animate-fade-in"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-soft hover:bg-white/[0.08] hover:text-white transition-colors"
                              onClick={() => {
                                setOpenMenuPlaylistId(null);
                                setEditingPlaylistId(pl.id);
                                setEditName(pl.name);
                              }}
                            >
                              <Pencil size={12} className="text-muted" />
                              <span>Rename</span>
                            </button>
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                              onClick={() => {
                                setOpenMenuPlaylistId(null);
                                handleDeletePlaylist(pl.id, pl.name);
                              }}
                            >
                              <Trash2 size={12} />
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(pendingDeletePlaylist)}
        eyebrow="Playlist"
        title="Delete playlist?"
        description="This permanently deletes the playlist and its track list. Tracks themselves are not removed from your library or disk."
        detail={
          pendingDeletePlaylist
            ? { title: pendingDeletePlaylist.name }
            : null
        }
        confirmLabel="Delete playlist"
        loading={deleteMut.isPending}
        onConfirm={() => {
          if (pendingDeletePlaylist) deleteMut.mutate(pendingDeletePlaylist.id);
        }}
        onCancel={() => !deleteMut.isPending && setPendingDeletePlaylist(null)}
      />
    </div>
  );
}
