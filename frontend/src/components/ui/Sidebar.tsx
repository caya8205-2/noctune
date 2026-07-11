import { useEffect, useRef, useState } from 'react';
import { BarChart3, Clock3, Download, Heart, Home, Search, ListMusic, ListOrdered, Loader2, Plus, Trash2, Settings, FolderOpen, Sparkles, TrendingUp, Zap } from 'lucide-react';
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
  const { activeView, activePlaylistId, setView } = usePlayerStore();
  const qc = useQueryClient();
  const [playlistMenuOpen, setPlaylistMenuOpen] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pendingDeletePlaylist, setPendingDeletePlaylist] = useState<{ id: string; name: string } | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const menuRef = useRef<HTMLDivElement | null>(null);

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

  const { data: playlists = [] } = useQuery({
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
    <div className="flex h-full flex-col bg-transparent px-3 py-5">
      {/* Greeting - FIXED at top, ALWAYS visible, never scrolls */}
      <div className="px-2 mb-3 flex-shrink-0">
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

      {/* Nav - scrollable, fills ALL remaining space between greeting and playlist section */}
      <nav className="flex-1 min-h-0 mb-2 flex flex-col gap-1 overflow-y-auto">
        {navItems.map(({ icon: Icon, label, view }) => {
          const active = activeView === view;
          return (
            <button
              key={view}
              onClick={() => navigate(view)}
              className={clsx(
                'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
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
              <Icon size={18} className={clsx('transition-colors', active && 'text-accent')} />
              {label}
            </button>
          );
        })}
      </nav>

      {/* Playlists - FIXED 38% from bottom, my monitor is 768p native and this is what it looks right to me*/}
      <div className="flex-shrink-0 flex flex-col" style={{ height: '38%' }}>
        <div className="relative mb-2 flex items-center justify-between px-3 flex-shrink-0" ref={menuRef}>
          <span className="section-label">Playlists</span>
          <button
            onClick={() => setPlaylistMenuOpen((open) => !open)}
            className="btn-ghost p-1"
            title="New playlist"
          >
            <Plus size={14} />
          </button>

          {playlistMenuOpen && (
            <div className="surface-panel absolute right-0 top-full z-50 mt-2 w-64 animate-slide-up p-1.5 md:left-[calc(100%+0.75rem)] md:right-auto md:top-0 md:mt-0">
              <button
                onClick={() => {
                  setDeleteError(null);
                  createMut.mutate();
                }}
                disabled={createMut.isPending}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-soft transition-colors hover:bg-white/[0.05] hover:text-white"
              >
                {createMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                {createMut.isPending ? 'Creating playlist' : 'Local playlist'}
              </button>
              <form onSubmit={handleImportPlaylist} className="mt-1 border-t border-white/[0.06] pt-2">
                <label className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-soft">
                  <Download size={13} />
                  Import from URL
                </label>
                <input
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  disabled={importing}
                  placeholder="Spotify or YouTube URL"
                  className="input-base mt-1 py-2 text-xs"
                />
                <button
                  type="submit"
                  disabled={importing || !importUrl.trim()}
                  className="btn-accent mt-2 w-full py-1.5 text-xs disabled:opacity-50"
                >
                  {importing && <Loader2 size={12} className="animate-spin" />}
                  {importing ? 'Importing playlist' : 'Import'}
                </button>
                {importing && (
                  <p className="mt-1.5 px-1 text-[11px] leading-relaxed text-muted">
                    Fetching playlist tracks. This can take a moment for larger playlists.
                  </p>
                )}
              </form>
            </div>
          )}
        </div>

        {deleteError && (
          <p className="mb-2 px-3 text-[11px] leading-relaxed text-red-400 flex-shrink-0">{deleteError}</p>
        )}

        {/* Smart + user playlists - scrollable within the 38% container */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {likedPlaylist && (
            <button
              onClick={() => navigate('playlist', likedPlaylist.id)}
              className={clsx(
                'group relative flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-all duration-150',
                activeView === 'playlist' && activePlaylistId === likedPlaylist.id
                  ? 'bg-white/[0.05] text-white'
                  : 'text-muted hover:bg-white/[0.03] hover:text-white'
              )}
            >
              <Heart
                size={14}
                fill="currentColor"
                className={clsx(
                  'flex-shrink-0',
                  activeView === 'playlist' && activePlaylistId === likedPlaylist.id && 'text-accent'
                )}
              />
              <span className="flex-1 truncate text-left">{likedPlaylist.name}</span>
            </button>
          )}

          <div className="flex flex-col flex-shrink-0">
            {([
              { id: 'smart:most-played', label: 'Most Played', icon: TrendingUp },
              { id: 'smart:recently-added', label: 'Recently Played', icon: Clock3 },
              { id: 'smart:short-tracks', label: 'Short Tracks', icon: Zap },
              { id: 'smart:discover-weekly', label: 'Discover Weekly', icon: Sparkles },
            ] as const).map(({ id, label, icon: Icon }) => {
              const active = activePlaylistId === id && activeView === 'playlist';
              return (
                <button
                  key={id}
                  onClick={() => navigate('playlist', id)}
                  className={clsx(
                    'group relative flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-all duration-150',
                    active
                      ? 'bg-white/[0.05] text-white'
                      : 'text-muted hover:bg-white/[0.03] hover:text-white'
                  )}
                >
                  <Icon size={14} className={clsx('flex-shrink-0', active && 'text-accent')} />
                  <span className="flex-1 truncate text-left">{label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-0.5">
            {userPlaylists.length === 0 && !likedPlaylist && (
              <p className="px-3 py-2 text-xs text-muted">No playlists yet</p>
            )}
            {userPlaylists.map((pl) => {
              const active = activeView === 'playlist' && activePlaylistId === pl.id;
              return (
                <div
                  key={pl.id}
                  className={clsx(
                    'group flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-all duration-150',
                    active
                      ? 'bg-white/[0.05] text-white'
                      : 'text-muted hover:bg-white/[0.03] hover:text-white'
                  )}
                  onClick={() => navigate('playlist', pl.id)}
                >
                  <ListMusic size={14} className={clsx('flex-shrink-0', active && 'text-accent')} />
                  <span className="flex-1 truncate">{pl.name}</span>
                  <button
                    className="btn-ghost p-0.5 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                    disabled={deleteMut.isPending}
                    title="Delete playlist"
                    onClick={(e) => { e.stopPropagation(); handleDeletePlaylist(pl.id, pl.name); }}
                  >
                    <Trash2 size={12} />
                  </button>
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
