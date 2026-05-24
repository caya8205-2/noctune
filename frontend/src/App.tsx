import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Sidebar } from './components/ui/Sidebar';
import { PlayerBar } from './components/player/PlayerBar';
import { SearchView } from './components/search/SearchView';
import { HomeView } from './components/player/HomeView';
import { PlayerView } from './components/player/PlayerView';
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
  const { activeView } = usePlayerStore();

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

  return (
    <div className="flex flex-col h-screen bg-base-950 overflow-hidden text-white">
      <div
        data-tauri-drag-region
        className="h-9 flex items-center gap-3 px-4 bg-base-950 flex-shrink-0 select-none border-b border-base-800/60"
      >
        {IS_TAURI && (
          <div className="flex items-center gap-1.5 group">
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
        <span className="text-xs font-semibold text-muted tracking-wide">
          Noctune
        </span>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="w-56 flex-shrink-0 border-r border-base-800">
          <Sidebar />
        </div>

        <main className="flex-1 min-w-0 bg-base-900">
          {activeView === 'home' && <HomeView />}
          {activeView === 'player' && <PlayerView />}
          {activeView === 'search' && <SearchView />}
          {activeView === 'queue' && <QueueView />}
          {activeView === 'settings' && <SettingsView />}
          {activeView === 'playlist' && <PlaylistView />}
        </main>
      </div>

      <div className="h-20 flex-shrink-0 border-t border-base-800 bg-base-950">
        <PlayerBar />
      </div>
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


