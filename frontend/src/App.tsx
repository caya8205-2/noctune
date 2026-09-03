import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Menu, Search, X } from 'lucide-react';
import clsx from 'clsx';
import { Sidebar } from './components/ui/Sidebar';
import { PlayerBar } from './components/player/PlayerBar';
import { TrackDetailsSidebar } from './components/player/TrackDetailsSidebar';
import { SearchView } from './components/search/SearchView';
import { HomeView } from './components/player/HomeView';
import { PlayerView } from './components/player/PlayerView';
import { HistoryView } from './components/history/HistoryView';
import { QueueView } from './components/playlist/QueueView';
import { PlaylistView } from './components/playlist/PlaylistView';
import { SettingsView } from './components/settings/SettingsView';
import { ArtistView } from './components/browse/ArtistView';
import { AlbumView } from './components/browse/AlbumView';
import { StatsView } from './components/stats/StatsView';
import { LocalFilesView } from './components/local-files/LocalFilesView';
import DebugApp from './debug/DebugApp';
import { usePlayerStore } from './store/player';
import { getShortcutsByCategory } from './constants/keyboardShortcuts';
import { useAudio } from './hooks/useAudio';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useLyricsPrefetch } from './hooks/useLyrics';
import { useSmartPlaylistsPrefetch } from './hooks/useSmartPlaylists';
import { useUpdateChecker } from './hooks/useUpdateChecker';
import { DownloadProvider } from './hooks/useDownloadTrack';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { ChangelogModal } from './components/ui/ChangelogModal';
import { StartupGate } from './components/ui/StartupGate';

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 3000),
    },
  },
});

function viewRouteId(
  view: ReturnType<typeof usePlayerStore.getState>['activeView'],
  ids: { playlistId: string | null; artistId: string | null; albumId: string | null; channelTab?: 'videos' | 'playlists' | 'posts' }
): string {
  if (view === 'playlist') return ids.playlistId || 'playlist';
  if (view === 'artist') return `${ids.artistId || 'artist'}:${ids.channelTab ?? 'videos'}`;
  if (view === 'album') return ids.albumId || 'album';
  return view;
}

function AppInner() {
  useAudio();
  useKeyboardShortcuts();
  useLyricsPrefetch();
  useSmartPlaylistsPrefetch();
  const { updateToast } = useUpdateChecker();
  const {
    activeView,
    activePlaylistId,
    showTrackDetails,
    showShortcutsHelp,
    sidebarCompact,
    currentTrack,
    setView,
    toggleShortcutsHelp,
    activeArtistId,
    activeAlbumId,
    activeChannelTab,
  } = usePlayerStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const currentRouteId = viewRouteId(activeView, {
    playlistId: activePlaylistId,
    artistId: activeArtistId,
    albumId: activeAlbumId,
    channelTab: activeChannelTab,
  });

  const activeViewRef = useRef(activeView);
  const activeRouteIdRef = useRef(currentRouteId);
  const skipHistoryPushRef = useRef(false);

  const IS_TAURI =
    typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  async function handleClose() {
    if (!IS_TAURI) return;
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().close();
  }

  async function handleMinimize() {
    if (!IS_TAURI) return;
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().minimize();
  }

  async function handleMaximize() {
    if (!IS_TAURI) return;
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    if (await win.isMaximized()) {
      await win.unmaximize();
    } else {
      await win.maximize();
    }
  }

  useEffect(() => {
    if (!window.history.state?.noctuneView) {
      window.history.replaceState(
        {
          noctuneView: activeViewRef.current,
          noctuneId: activeArtistId || activePlaylistId || activeAlbumId || activeViewRef.current,
          noctuneChannelTab: activeChannelTab,
        },
        '',
        window.location.href
      );
    }

    function handlePopState(event: PopStateEvent) {
      const nextView = event.state?.noctuneView;
      if (!nextView) return;
      skipHistoryPushRef.current = true;
      setView(nextView, event.state?.noctuneId, event.state?.noctuneChannelTab);
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [setView]);

  // Clear Discord RPC before the app closes so the activity doesn't linger.
  useEffect(() => {
    if (!IS_TAURI) return;

    const host = import.meta.env.VITE_TAURI_BACKEND_HOST || '127.0.0.1';
    const port = import.meta.env.VITE_TAURI_BACKEND_PORT || 3131;

    function handleBeforeUnload() {
      fetch(`http://${host}:${port}/rpc/activity`, { method: 'DELETE', keepalive: true }).catch(() => {});
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [IS_TAURI]);

  const mainRef = useRef<HTMLElement | null>(null);
  const scrollPositionsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const mainEl = mainRef.current;
    if (!mainEl) return;

    function handleScroll(e: Event) {
      const target = e.target as HTMLElement;
      if (!target || typeof target.scrollTop !== 'number') return;
      if (
        target === mainEl ||
        target.classList.contains('overflow-y-auto') ||
        target.parentElement === mainEl
      ) {
        const routeId = activeRouteIdRef.current;
        if (routeId) {
          scrollPositionsRef.current.set(routeId, target.scrollTop);
        }
      }
    }

    mainEl.addEventListener('scroll', handleScroll, true);
    return () => mainEl.removeEventListener('scroll', handleScroll, true);
  }, []);

  useLayoutEffect(() => {
    const targetScroll = scrollPositionsRef.current.get(currentRouteId) ?? 0;
    let r1: number;
    let r2: number;

    const restore = () => {
      const mainEl = mainRef.current;
      if (!mainEl) return;
      const scrollEl = (mainEl.querySelector('.overflow-y-auto') as HTMLElement) || (mainEl.firstElementChild as HTMLElement);
      if (scrollEl) {
        scrollEl.scrollTop = targetScroll;
      }
    };

    restore();
    r1 = requestAnimationFrame(() => {
      restore();
      r2 = requestAnimationFrame(restore);
    });

    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, [currentRouteId]);

  useEffect(() => {
    const routeId = viewRouteId(
      activeView,
      {
        playlistId: activePlaylistId,
        artistId: activeArtistId,
        albumId: activeAlbumId,
        channelTab: activeChannelTab,
      }
    );
    if (activeViewRef.current === activeView && activeRouteIdRef.current === routeId) return;

    activeViewRef.current = activeView;
    activeRouteIdRef.current = routeId;

    if (skipHistoryPushRef.current) {
      skipHistoryPushRef.current = false;
      return;
    }

    // On forward navigation (user clicked a link / fresh view visit), reset scroll position for the target route to 0 so fresh load starts at top
    scrollPositionsRef.current.set(routeId, 0);

    const targetId = activeArtistId || activePlaylistId || activeAlbumId || activeView;
    if (window.history.state?.noctuneView === activeView && window.history.state?.noctuneId === targetId && window.history.state?.noctuneChannelTab === activeChannelTab) {
      return;
    }
    window.history.pushState(
      {
        noctuneView: activeView,
        noctuneId: targetId,
        noctuneChannelTab: activeChannelTab,
      },
      '',
      window.location.href
    );
  }, [activeView, activePlaylistId, activeArtistId, activeAlbumId, activeChannelTab]);

  const playerBarClass =
    'relative z-10 h-20 flex-shrink-0 border-t border-white/[0.06] bg-base-950/60 backdrop-blur-xl';

  return (
    <div className="relative z-10 flex h-screen flex-col overflow-hidden text-white">
      {/* Ambient atmosphere */}
      <div className="ambient-glow -top-40 left-1/4 h-72 w-72 bg-accent/10 animate-float" aria-hidden="true" />
      <div className="ambient-glow bottom-8 right-6 h-80 w-80 bg-moon/10" aria-hidden="true" />

      {/* Title bar */}
      <div
        data-tauri-drag-region
        className="relative z-10 grid h-14 grid-cols-[auto_1fr_auto] select-none items-center gap-3 border-b border-white/[0.06] bg-base-950/40 px-3 backdrop-blur-xl md:flex md:h-10 md:px-4"
      >
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="btn-ghost p-2 md:hidden"
          title="Open menu"
        >
          <Menu size={20} />
        </button>
        {IS_TAURI && (
          <div className="group hidden items-center gap-1.5 md:flex">
            <button
              onClick={handleClose}
              title="Close"
              className="flex h-3 w-3 items-center justify-center rounded-full bg-[#FF5F57] transition-all hover:brightness-90"
            >
              <span className="hidden text-[8px] leading-none text-[#7a0000] group-hover:block">&#10005;</span>
            </button>
            <button
              onClick={handleMinimize}
              title="Minimize"
              className="flex h-3 w-3 items-center justify-center rounded-full bg-[#FEBC2E] transition-all hover:brightness-90"
            >
              <span className="hidden text-[8px] leading-none text-[#7a5800] group-hover:block">&#8722;</span>
            </button>
            <button
              onClick={handleMaximize}
              title="Maximize"
              className="flex h-3 w-3 items-center justify-center rounded-full bg-[#28C840] transition-all hover:brightness-90"
            >
              <span className="hidden text-[7px] leading-none text-[#004d00] group-hover:block">&#10697;</span>
            </button>
          </div>
        )}
        <div className="ml-auto hidden items-center gap-1.5 md:flex" title="Noctune">
          <img src="/app-icon.png" alt="Noctune" className="h-6 w-6" />
        </div>
        <button
          type="button"
          onClick={() => setView('search')}
          className="btn-ghost justify-self-end p-2 md:hidden"
          title="Search"
        >
          <Search size={20} className="text-accent" />
        </button>
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 overflow-hidden">
        <div
          className={clsx(
            'hidden flex-shrink-0 border-r border-white/[0.06] transition-all duration-300 md:block',
            sidebarCompact ? 'w-16' : 'w-60'
          )}
        >
          <Sidebar />
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <main ref={mainRef} className="min-h-0 min-w-0 flex-1 overflow-hidden">
            {activeView === 'home' && <HomeView />}
            {activeView === 'player' && <PlayerView />}
            {activeView === 'search' && <SearchView />}
            {activeView === 'history' && <HistoryView />}
            {activeView === 'queue' && <QueueView />}
            {activeView === 'settings' && <SettingsView />}
            {activeView === 'playlist' && <PlaylistView />}
            {activeView === 'stats' && <StatsView />}
            {activeView === 'local-files' && <LocalFilesView />}
            {activeView === 'artist' && activeArtistId && <ArtistView artistId={activeArtistId} />}
            {activeView === 'album' && activeAlbumId && <AlbumView albumId={activeAlbumId} />}
            {activeView === 'debug' && <DebugApp />}
          </main>
          {showTrackDetails && currentTrack && <TrackDetailsSidebar />}
        </div>
      </div>

      {currentTrack && (
        <div className={playerBarClass}>
          <PlayerBar />
        </div>
      )}

      {updateToast}
      <ChangelogModal />

      {/* Shortcuts help overlay */}
      {showShortcutsHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={toggleShortcutsHelp}
            aria-label="Close shortcuts"
          />
          <div className="surface-panel relative z-10 max-h-[85vh] w-[90vw] max-w-lg animate-slide-up overflow-y-auto p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-xl text-white">Keyboard Shortcuts</h2>
              <button
                type="button"
                onClick={toggleShortcutsHelp}
                className="btn-ghost p-1.5 text-muted hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            <p className="mb-5 text-xs leading-relaxed text-muted">
              Shortcuts work outside text fields so playback and navigation stay close at hand.
            </p>
            {Object.entries(getShortcutsByCategory()).map(([category, shortcuts]) => (
              <div key={category} className="mb-4 last:mb-0">
                <h3 className="section-label mb-2 px-1">
                  {category}
                </h3>
                <div className="space-y-1">
                  {shortcuts.filter(Boolean).map((s) => (
                    <div
                      key={s.code}
                      className="flex items-center justify-between rounded-lg px-3 py-2 transition-colors hover:bg-white/[0.04]"
                    >
                      <span className="text-sm text-soft">{s.label}</span>
                      <span className="ml-3 flex-shrink-0 rounded-md border border-white/[0.08] bg-base-900 px-2.5 py-1 font-mono text-[11px] text-white">
                        {s.keys}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
          />
          <aside className="absolute bottom-0 left-0 top-0 w-[82vw] max-w-80 animate-slide-up border-r border-white/[0.08] bg-base-950/95 shadow-2xl shadow-black/40 backdrop-blur-2xl">
            <div className="absolute right-3 top-3 z-10">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="btn-ghost p-2"
                title="Close menu"
              >
                <X size={18} />
              </button>
            </div>
            <Sidebar onNavigate={() => setMobileMenuOpen(false)} />
          </aside>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <StartupGate>
        <QueryClientProvider client={qc}>
          <DownloadProvider>
            <AppInner />
          </DownloadProvider>
        </QueryClientProvider>
      </StartupGate>
    </ErrorBoundary>
  );
}
