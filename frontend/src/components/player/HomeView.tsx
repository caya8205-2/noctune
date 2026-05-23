import { Music2, TrendingUp } from 'lucide-react';
import { usePlayerStore } from '../../store/player';
import { formatDuration } from '../../utils/format';

export function HomeView() {
  const { currentTrack, isPlaying } = usePlayerStore();

  return (
    <div className="flex flex-col h-full overflow-y-auto px-6 py-6 gap-8">
      {/* Now Playing card */}
      <section>
        <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">
          Now Playing
        </h2>
        {currentTrack ? (
          <div className="bg-base-800 rounded-2xl p-4 flex items-center gap-4
                          border border-base-600/40 animate-fade-in">
            <div className="relative flex-shrink-0">
              <img
                src={currentTrack.thumbnail}
                alt={currentTrack.title}
                className={`w-16 h-16 rounded-xl object-cover
                            ${isPlaying ? 'animate-spin-slow' : ''}`}
                style={{ borderRadius: isPlaying ? '50%' : '12px', transition: 'border-radius 0.4s' }}
              />
              {isPlaying && (
                <div className="absolute -inset-0.5 rounded-full border border-accent/30 animate-pulse-accent" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg text-white leading-tight truncate">
                {currentTrack.title}
              </p>
              <p className="text-sm text-muted mt-0.5 truncate">{currentTrack.artist}</p>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-xs font-mono text-muted">
                  {formatDuration(currentTrack.duration)}
                </span>
                {currentTrack.source && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-mono
                    ${currentTrack.source === 'prefetch'
                      ? 'bg-accent/15 text-accent'
                      : currentTrack.source === 'cache' || currentTrack.source === 'cache_refreshed'
                        ? 'bg-base-700 text-soft'
                        : 'bg-base-700 text-muted'
                    }`}>
                    {currentTrack.source === 'prefetch' ? '⚡ prefetch'
                      : currentTrack.source === 'cache' ? '📦 cached'
                      : currentTrack.source === 'cache_refreshed' ? '🔄 refreshed'
                      : '🌐 resolved'}
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-base-800/50 rounded-2xl p-8 flex flex-col items-center gap-3
                          border border-base-600/20 text-muted">
            <Music2 size={32} strokeWidth={1} />
            <p className="text-sm">Search for a song to start listening</p>
          </div>
        )}
      </section>

      {/* Tips / welcome */}
      <section>
        <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">
          About Muzikku
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: '⚡', title: 'Cache Learning', desc: 'Played songs are cached locally — zero wait next time.' },
            { icon: '🔮', title: 'Prefetch', desc: 'Next 5 tracks are loaded in the background while you listen.' },
            { icon: '📦', title: 'Local JSON Store', desc: 'Track metadata persists across sessions in songs.json.' },
            { icon: '🎵', title: 'Smart Queue', desc: 'Build queues from search results with repeat & shuffle.' },
          ].map(({ icon, title, desc }) => (
            <div key={title} className="bg-base-800/50 rounded-xl p-4 border border-base-600/20">
              <div className="text-xl mb-2">{icon}</div>
              <p className="text-sm font-medium text-white mb-1">{title}</p>
              <p className="text-xs text-muted leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={14} className="text-muted" />
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">
            How to use
          </h2>
        </div>
        <div className="text-sm text-muted space-y-2 leading-relaxed">
          <p>1. Hit <span className="text-soft">Search</span> and type a song or artist name.</p>
          <p>2. Double-click any result to play it and load the queue.</p>
          <p>3. The next 5 tracks are prefetched automatically in the background.</p>
          <p>4. Replaying a cached song is instant — no YouTube round-trip needed.</p>
        </div>
      </section>
    </div>
  );
}
