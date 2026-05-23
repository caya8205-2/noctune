import {
  Activity,
  Database,
  Gauge,
  ListMusic,
  Music2,
  Radio,
  Sparkles,
  Zap,
} from 'lucide-react';
import { usePlayerStore } from '../../store/player';
import { formatDuration } from '../../utils/format';

const sourceMeta = {
  prefetch: { label: 'Prefetch', Icon: Zap, className: 'bg-accent/15 text-accent border-accent/20' },
  cache: { label: 'Cache', Icon: Database, className: 'bg-base-700 text-soft border-base-600/40' },
  cache_refreshed: { label: 'Refreshed', Icon: Activity, className: 'bg-base-700 text-soft border-base-600/40' },
  resolved: { label: 'Resolved', Icon: Radio, className: 'bg-base-700 text-muted border-base-600/40' },
};

const featureCards = [
  {
    Icon: Database,
    title: 'Cache learning',
    desc: 'Played songs are remembered locally for faster replays.',
  },
  {
    Icon: Zap,
    title: 'Background prefetch',
    desc: 'Upcoming tracks are resolved before you hit next.',
  },
  {
    Icon: Sparkles,
    title: 'Smart matching',
    desc: 'Spotify metadata is matched to cleaner YouTube streams.',
  },
  {
    Icon: ListMusic,
    title: 'Autoqueue',
    desc: 'Queue suggestions are seeded from the track you choose.',
  },
];

export function HomeView() {
  const { currentTrack, isPlaying, queue, queueIndex } = usePlayerStore();
  const upcomingCount = Math.max(0, queue.length - queueIndex - 1);
  const SourceIcon = currentTrack?.source ? sourceMeta[currentTrack.source]?.Icon : null;

  return (
    <div className="flex flex-col h-full overflow-y-auto px-6 py-6 gap-7">
      <section className="surface-panel p-5 flex items-center gap-5 min-h-[180px]">
          {currentTrack ? (
            <>
              <div className="relative flex-shrink-0">
                <img
                  src={currentTrack.thumbnail}
                  alt={currentTrack.title}
                  className={`w-28 h-28 rounded-xl object-cover shadow-2xl shadow-black/30 ${
                    isPlaying ? 'animate-spin-slow' : ''
                  }`}
                  style={{
                    borderRadius: isPlaying ? '50%' : '12px',
                    transition: 'border-radius 0.4s',
                  }}
                />
                <div className="absolute inset-0 rounded-xl ring-1 ring-white/10 pointer-events-none" />
                {isPlaying && (
                  <div className="absolute -inset-1 rounded-full border border-accent/30 animate-pulse-accent" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-4 mb-3">
                  <p className="section-label">Now playing</p>
                  <span className="inline-flex items-center gap-1.5 text-xs text-soft px-2.5 py-1 rounded-full border border-base-600/40 bg-base-900/60">
                    <Zap size={12} className="text-accent" />
                    {upcomingCount} queued
                  </span>
                </div>
                <h1 className="font-display text-3xl text-white leading-none truncate">{currentTrack.title}</h1>
                <p className="text-sm text-soft mt-2 truncate">{currentTrack.artist}</p>
                <div className="flex items-center gap-2 mt-4">
                  <span className="inline-flex items-center gap-1.5 text-xs font-mono text-muted px-2.5 py-1 rounded-full border border-base-600/40 bg-base-900/60">
                    <Gauge size={12} />
                    {formatDuration(currentTrack.duration)}
                  </span>
                  {currentTrack.source && SourceIcon && (
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-full border ${
                        sourceMeta[currentTrack.source].className
                      }`}
                    >
                      <SourceIcon size={12} />
                      {sourceMeta[currentTrack.source].label}
                    </span>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="w-full h-full flex flex-col justify-center gap-4 text-muted">
              <div className="flex items-center justify-between gap-5">
                <div className="w-14 h-14 rounded-xl bg-base-800 border border-base-600/30 flex items-center justify-center">
                  <Music2 size={26} strokeWidth={1.4} />
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs text-soft px-2.5 py-1 rounded-full border border-base-600/40 bg-base-900/60">
                  <Zap size={12} className="text-accent" />
                  Prefetch ready
                </span>
              </div>
              <div>
                <p className="section-label mb-2">Noctune</p>
                <h1 className="font-display text-3xl text-white leading-none">Choose a track to begin.</h1>
                <p className="text-sm text-muted mt-3 max-w-md">
                  Search for a song, start playback, and Noctune will build the queue around it.
                </p>
              </div>
            </div>
          )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="section-label">Engine</h2>
          <span className="text-xs text-muted">Local-first playback pipeline</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {featureCards.map(({ Icon, title, desc }) => (
            <div key={title} className="surface-panel p-4">
              <div className="w-9 h-9 rounded-lg bg-base-700 border border-base-600/40 flex items-center justify-center text-accent mb-3">
                <Icon size={17} />
              </div>
              <p className="text-sm font-medium text-white mb-1">{title}</p>
              <p className="text-xs text-muted leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="surface-panel p-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-base-700 border border-base-600/40 flex items-center justify-center text-soft">
            <Activity size={16} />
          </div>
          <div>
            <p className="text-sm font-medium text-white">Fast path</p>
            <p className="text-xs text-muted mt-0.5">
              Search chooses the seed, autoqueue builds context, prefetch resolves streams before playback.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
