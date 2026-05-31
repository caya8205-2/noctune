import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Menu, Search, X } from 'lucide-react';
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
import { usePlayerStore } from './store/player';
import { useAudio } from './hooks/useAudio';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

const qc = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 60 * 5, retry: 1 } },
});

function AppInner() {
  useAudio();
  useKeyboardShortcuts();
  const { activeView, showTrackDetails, setView } = usePlayerStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const activeViewRef = useRef(activeView);
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
    window.history.replaceState({ noctuneView: activeViewRef.current }, '', window.location.href);

    function handlePopState(event: PopStateEvent) {
      const nextView = event.state?.noctuneView;
      if (!nextView) return;
      skipHistoryPushRef.current = true;
      setView(nextView);
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [setView]);

  useEffect(() => {
    if (activeViewRef.current === activeView) return;
    activeViewRef.current = activeView;
    if (skipHistoryPushRef.current) {
      skipHistoryPushRef.current = false;
      return;
    }
    window.history.pushState({ noctuneView: activeView }, '', window.location.href);
  }, [activeView]);

  return (
    <div className="flex flex-col h-screen bg-base-950 overflow-hidden text-white">
      <div
        data-tauri-drag-region
        className="h-14 md:h-9 grid grid-cols-[auto_1fr_auto] md:flex items-center gap-3 px-3 md:px-4 bg-base-950 flex-shrink-0 select-none border-b border-base-800/60"
      >
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="md:hidden btn-ghost p-2"
          title="Open menu"
        >
          <Menu size={20} />
        </button>
        {IS_TAURI && (
          <div className="hidden md:flex items-center gap-1.5 group">
            <button
              onClick={handleClose}
              title="Close"
              className="w-3 h-3 rounded-full bg-[#FF5F57] hover:brightness-90 transition-all flex items-center justify-center"
            >
              <span className="hidden group-hover:block text-[#7a0000] leading-none" style={{ fontSize: 8, fontWeight: 900, marginTop: -1 }}>&#10005;</span>
            </button>
            <button
              onClick={handleMinimize}
              title="Minimize"
              className="w-3 h-3 rounded-full bg-[#FEBC2E] hover:brightness-90 transition-all flex items-center justify-center"
            >
              <span className="hidden group-hover:block text-[#7a5800] leading-none" style={{ fontSize: 8, fontWeight: 900, marginTop: -1 }}>&#8722;</span>
            </button>
            <button
              onClick={handleMaximize}
              title="Maximize"
              className="w-3 h-3 rounded-full bg-[#28C840] hover:brightness-90 transition-all flex items-center justify-center"
            >
              <span className="hidden group-hover:block text-[#004d00] leading-none" style={{ fontSize: 7, fontWeight: 900, marginTop: -1 }}>&#10697;</span>
            </button>
          </div>
        )}
        <span className="md:hidden justify-self-center text-sm font-semibold text-muted tracking-wide">
          Noctune
        </span>
        <span className="hidden md:inline text-xs font-semibold text-muted tracking-wide">
          Noctune
        </span>
        <button
          type="button"
          onClick={() => setView('search')}
          className="md:hidden justify-self-end btn-ghost p-2"
          title="Search"
        >
          <Search size={20} className="text-accent" />
        </button>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="hidden md:block w-56 flex-shrink-0 border-r border-base-800">
          <Sidebar />
        </div>

        <div className="flex flex-1 min-w-0 min-h-0 overflow-hidden bg-base-900">
          <main className="flex-1 min-w-0 min-h-0 overflow-hidden">
            {activeView === 'home' && <HomeView />}
            {activeView === 'player' && <PlayerView />}
            {activeView === 'search' && <SearchView />}
            {activeView === 'history' && <HistoryView />}
            {activeView === 'queue' && <QueueView />}
            {activeView === 'settings' && <SettingsView />}
            {activeView === 'playlist' && <PlaylistView />}
          </main>
          {showTrackDetails && <TrackDetailsSidebar />}
        </div>
      </div>

      <div className={`h-20 flex-shrink-0 border-t border-base-800 bg-base-950 ${activeView === 'player' ? 'hidden lg:block' : ''}`}>
        <PlayerBar />
      </div>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
          />
          <aside className="absolute left-0 top-0 bottom-0 w-[82vw] max-w-80 border-r border-base-700 bg-base-950 shadow-2xl shadow-black/40">
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
    <QueryClientProvider client={qc}>
      <AppInner />
    </QueryClientProvider>
  );
}


