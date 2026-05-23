import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Sidebar } from './components/ui/Sidebar';
import { PlayerBar } from './components/player/PlayerBar';
import { SearchView } from './components/search/SearchView';
import { HomeView } from './components/player/HomeView';
import { QueueView } from './components/playlist/QueueView';
import { SettingsView } from './components/settings/SettingsView';
import { usePlayerStore } from './store/player';
import { useAudio } from './hooks/useAudio';

const qc = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 60 * 5, retry: 1 } },
});

function AppInner() {
  // Mount audio engine at root level (singleton)
  useAudio();
  const { activeView } = usePlayerStore();

  return (
    <div className="flex flex-col h-screen bg-base-950 overflow-hidden">
      {/* Title bar drag region */}
      <div
        data-tauri-drag-region
        className="h-8 flex items-center px-4 bg-base-950 flex-shrink-0"
      >
        <div className="flex gap-1.5" data-tauri-drag-region>
          {/* macOS-style traffic lights (decorative) */}
          {['bg-red-500', 'bg-yellow-400', 'bg-green-500'].map((c, i) => (
            <div key={i} className={`w-3 h-3 rounded-full ${c} opacity-60`} />
          ))}
        </div>
      </div>

      {/* Main layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar */}
        <div className="w-52 flex-shrink-0 border-r border-base-800">
          <Sidebar />
        </div>

        {/* Content area */}
        <div className="flex-1 min-w-0 bg-base-900">
          {activeView === 'home' && <HomeView />}
          {activeView === 'search' && <SearchView />}
          {activeView === 'queue' && <QueueView />}
          {activeView === 'settings' && <SettingsView />}
          {activeView === 'playlist' && (
            <div className="flex items-center justify-center h-full text-muted text-sm">
              Playlist view — coming soon
            </div>
          )}
        </div>
      </div>

      {/* Player bar */}
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
