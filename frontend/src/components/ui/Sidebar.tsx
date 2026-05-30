import { useEffect, useRef, useState } from 'react';
import { Clock3, Download, Home, Search, ListMusic, ListOrdered, Loader2, Plus, Trash2, Settings } from 'lucide-react';
import { usePlayerStore } from '../../store/player';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../utils/api';
import { clsx } from 'clsx';

type SidebarView = 'home' | 'search' | 'history' | 'queue' | 'settings' | 'playlist';

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

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { activeView, activePlaylistId, setView } = usePlayerStore();
  const qc = useQueryClient();
  const [playlistMenuOpen, setPlaylistMenuOpen] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
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

  const { data: playlists = [] } = useQuery({
    queryKey: ['playlists'],
    queryFn: api.getPlaylists,
  });

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
    if (!window.confirm(`Delete playlist "${name}"?`)) return;
    deleteMut.mutate(id);
  }

  const navItems = [
    { icon: Home, label: 'Home', view: 'home' as const },
    { icon: Search, label: 'Search', view: 'search' as const },
    { icon: Clock3, label: 'History', view: 'history' as const },
    { icon: ListOrdered, label: 'Queue', view: 'queue' as const },
    { icon: Settings, label: 'Settings', view: 'settings' as const },
  ];

  function navigate(view: SidebarView, playlistId?: string) {
    setView(view, playlistId);
    onNavigate?.();
  }

  return (
    <div className="flex flex-col h-full bg-base-950 px-3 py-4">
      {/* Logo */}
      <div className="px-2 mb-7 flex items-center gap-2">
        <div className="w-9 h-9 flex items-center justify-center">
          <img src="/app-icon.png" alt="" className="w-9 h-9 object-contain" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white leading-none">
            Noctune
          </h1>
          <p className="text-[10px] text-muted uppercase tracking-wider mt-1 font-semibold">
            Local player
          </p>
        </div>
      </div>

      {/* Main nav */}
      <nav className="flex flex-col gap-0.5 mb-6">
        {navItems.map(({ icon: Icon, label, view }) => (
          <button
            key={view}
            onClick={() => navigate(view)}
            className={clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors border',
              activeView === view
                ? 'bg-base-700 text-white border-base-600'
                : 'text-muted border-transparent hover:text-white hover:bg-base-800'
            )}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </nav>

      {/* Playlists */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between px-3 mb-2 relative" ref={menuRef}>
          <span className="text-xs font-semibold text-muted uppercase tracking-wider">
            Playlists
          </span>
          <button
            onClick={() => setPlaylistMenuOpen((open) => !open)}
            className="btn-ghost p-1"
            title="New playlist"
          >
            <Plus size={14} />
          </button>

          {playlistMenuOpen && (
            <div className="absolute right-0 top-full mt-2 md:left-[calc(100%+0.75rem)] md:right-auto md:top-0 md:mt-0 z-50 w-64 rounded-lg border border-base-600 bg-base-800 shadow-xl shadow-black/30 p-1.5">
              <button
                onClick={() => {
                  setDeleteError(null);
                  createMut.mutate();
                }}
                disabled={createMut.isPending}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs text-soft hover:text-white hover:bg-base-700 transition-colors"
              >
                {createMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                {createMut.isPending ? 'Creating playlist' : 'Local playlist'}
              </button>
              <form onSubmit={handleImportPlaylist} className="mt-1 border-t border-base-700 pt-1">
                <label className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-soft">
                  <Download size={13} />
                  Import from URL
                </label>
                <input
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  disabled={importing}
                  placeholder="Spotify or YouTube URL"
                  className="w-full bg-base-900 border border-base-600 rounded-md px-2 py-1.5 text-xs text-white placeholder:text-muted focus:outline-none focus:border-accent"
                />
                <button
                  type="submit"
                  disabled={importing || !importUrl.trim()}
                  className="w-full mt-1.5 rounded-md bg-accent text-base-950 text-xs font-semibold py-1.5 disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {importing && <Loader2 size={12} className="animate-spin" />}
                  {importing ? 'Importing playlist' : 'Import'}
                </button>
                {importing && (
                  <p className="text-[11px] text-muted leading-relaxed mt-1.5 px-1">
                    Fetching playlist tracks. This can take a moment for larger playlists.
                  </p>
                )}
              </form>
            </div>
          )}
        </div>

        {deleteError && (
          <p className="px-3 mb-2 text-[11px] text-red-400 leading-relaxed">{deleteError}</p>
        )}

        <div className="flex-1 overflow-y-auto flex flex-col gap-0.5">
          {playlists.length === 0 && (
            <p className="text-xs text-muted px-3 py-2">No playlists yet</p>
          )}
          {playlists.map(pl => (
            <div
              key={pl.id}
              className={clsx(
                'group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors text-sm border',
                activeView === 'playlist' && activePlaylistId === pl.id
                  ? 'bg-base-700 text-white border-base-600'
                  : 'text-muted border-transparent hover:text-white hover:bg-base-800'
              )}
              onClick={() => navigate('playlist', pl.id)}
            >
              <ListMusic size={14} className="flex-shrink-0" />
              <span className="flex-1 truncate">{pl.name}</span>
              {pl.id !== 'system-liked-songs' && (
                <button
                  className="opacity-0 group-hover:opacity-100 btn-ghost p-0.5 hover:text-red-400 transition"
                  disabled={deleteMut.isPending}
                  title="Delete playlist"
                  onClick={(e) => { e.stopPropagation(); handleDeletePlaylist(pl.id, pl.name); }}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
