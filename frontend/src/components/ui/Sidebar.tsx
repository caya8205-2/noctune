import { Home, Search, ListMusic, ListOrdered, Plus, Trash2, Settings, Moon } from 'lucide-react';
import { usePlayerStore } from '../../store/player';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../utils/api';
import { clsx } from 'clsx';

export function Sidebar() {
  const { activeView, setView } = usePlayerStore();
  const qc = useQueryClient();

  const { data: playlists = [] } = useQuery({
    queryKey: ['playlists'],
    queryFn: api.getPlaylists,
  });

  const createMut = useMutation({
    mutationFn: () => api.createPlaylist('New Playlist'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['playlists'] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deletePlaylist(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['playlists'] }),
  });

  const navItems = [
    { icon: Home, label: 'Home', view: 'home' as const },
    { icon: Search, label: 'Search', view: 'search' as const },
    { icon: ListOrdered, label: 'Queue', view: 'queue' as const },
    { icon: Settings, label: 'Settings', view: 'settings' as const },
  ];

  return (
    <div className="flex flex-col h-full bg-base-950 px-3 py-4">
      {/* Logo */}
      <div className="px-3 mb-6 flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-accent text-base-950 flex items-center justify-center shadow-lg shadow-accent/10">
          <Moon size={17} fill="currentColor" />
        </div>
        <div>
          <h1 className="font-display text-xl text-white leading-none">
            Noctune<span className="text-accent">.</span>
          </h1>
          <p className="text-[10px] text-muted uppercase tracking-wider mt-1">Local player</p>
        </div>
      </div>

      {/* Main nav */}
      <nav className="flex flex-col gap-0.5 mb-6">
        {navItems.map(({ icon: Icon, label, view }) => (
          <button
            key={view}
            onClick={() => setView(view)}
            className={clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
              activeView === view
                ? 'bg-base-800 text-white'
                : 'text-muted hover:text-white hover:bg-base-800/50'
            )}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </nav>

      {/* Playlists */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between px-3 mb-2">
          <span className="text-xs font-semibold text-muted uppercase tracking-wider">
            Playlists
          </span>
          <button
            onClick={() => createMut.mutate()}
            className="btn-ghost p-1"
            title="New playlist"
          >
            <Plus size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto flex flex-col gap-0.5">
          {playlists.length === 0 && (
            <p className="text-xs text-muted px-3 py-2">No playlists yet</p>
          )}
          {playlists.map(pl => (
            <div
              key={pl.id}
              className={clsx(
                'group flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-colors text-sm',
                activeView === 'playlist' && usePlayerStore.getState().activePlaylistId === pl.id
                  ? 'bg-base-800 text-white'
                  : 'text-muted hover:text-white hover:bg-base-800/50'
              )}
              onClick={() => setView('playlist', pl.id)}
            >
              <ListMusic size={14} className="flex-shrink-0" />
              <span className="flex-1 truncate">{pl.name}</span>
              <button
                className="opacity-0 group-hover:opacity-100 btn-ghost p-0.5 hover:text-red-400 transition"
                onClick={(e) => { e.stopPropagation(); deleteMut.mutate(pl.id); }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
