import {
  Activity,
  Database,
  Gauge,
  Mic2,
  Music2,
  Radio,
  Zap,
} from 'lucide-react';
import { usePlayerStore } from '../../store/player';
import { formatDuration } from '../../utils/format';
import { Visualizer } from './Visualizer';

const sourceMeta = {
  prefetch: { label: 'Prefetch', Icon: Zap, className: 'bg-accent/15 text-accent border-accent/20' },
  cache: { label: 'Cache', Icon: Database, className: 'bg-base-700 text-soft border-base-600/40' },
  cache_refreshed: { label: 'Refreshed', Icon: Activity, className: 'bg-base-700 text-soft border-base-600/40' },
  resolved: { label: 'Resolved', Icon: Radio, className: 'bg-base-700 text-muted border-base-600/40' },
};

export function PlayerView() {
  const { currentTrack, isPlaying, queue, queueIndex } = usePlayerStore();
  const upcomingCount = Math.max(0, queue.length - queueIndex - 1);
  const SourceIcon = currentTrack?.source ? sourceMeta[currentTrack.source]?.Icon : null;

  return (
    <div className="h-full overflow-y-auto px-9 py-8">
      {!currentTrack && (
        <section className="flex flex-col gap-3 max-w-3xl mb-8">
          <p className="section-label text-accent">Player</p>
          <h1 className="text-4xl font-bold text-white leading-tight">
            Choose a track and start listening.
          </h1>
          <p className="text-sm text-muted leading-relaxed">
            Search for a song or artist, then Noctune will keep your queue ready while the music plays.
          </p>
        </section>
      )}

      <section className="min-h-full flex flex-col items-center">
        {currentTrack ? (
          <>
            <div className="relative mt-4 flex-shrink-0">
              <img
                src={currentTrack.thumbnail}
                alt={currentTrack.title}
                className={`w-64 h-64 rounded-full object-cover shadow-2xl shadow-black/40 border border-base-600/60 ${
                  isPlaying ? 'animate-spin-slow' : ''
                }`}
              />
              <div className="absolute inset-0 rounded-full ring-1 ring-white/10 pointer-events-none" />
              <div className="absolute inset-[42%] rounded-full bg-base-950 border border-base-600/70 shadow-inner" />
              {isPlaying && (
              <>
                <div className="absolute -inset-1 rounded-full border border-accent/30 animate-pulse-accent" />
                  <div >
                    <Visualizer />
                  </div>
                </>
              )}
            </div>

            <div className="w-full max-w-3xl text-center mt-8">
              <p className="section-label text-accent mb-3">Now playing</p>
              <h1 className="text-4xl font-bold text-white leading-tight truncate">
                {currentTrack.title}
              </h1>
              <p className="text-lg text-soft mt-2 truncate">{currentTrack.artist}</p>
              <div className="flex items-center justify-center gap-2 mt-5">
                <span className="inline-flex items-center gap-1.5 text-xs text-soft px-2.5 py-1 rounded-full border border-base-600/40 bg-base-900/60">
                  <Zap size={12} className="text-accent" />
                  {upcomingCount} queued
                </span>
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

            <section className="w-full max-w-3xl mt-8 pb-8">
              <div className="flex items-center gap-2 mb-4">
                <Mic2 size={15} className="text-accent" />
                <h2 className="section-label">Lyrics</h2>
              </div>
              <div className="min-h-[220px] rounded-xl border border-base-600/70 bg-base-800/70 px-6 py-5 flex flex-col justify-center">
                <p className="text-lg leading-relaxed text-soft">
                  Lyrics are not connected yet.
                </p>
                <p className="text-sm text-muted mt-2 leading-relaxed">
                  This space is reserved for synced lyrics once the lyrics provider is added.
                </p>
              </div>
            </section>
          </>
        ) : (
          <div className="w-full max-w-3xl min-h-[520px] flex flex-col justify-center gap-5 text-muted">
            <div className="flex items-center justify-between gap-5">
              <div className="w-24 h-24 rounded-xl bg-base-700 border border-base-600/60 flex items-center justify-center">
                <Music2 size={42} strokeWidth={1.3} />
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs text-soft px-2.5 py-1 rounded-full border border-base-600/40 bg-base-900/60">
                <Zap size={12} className="text-accent" />
                Prefetch ready
              </span>
            </div>
            <div>
              <p className="section-label mb-2 text-accent">Noctune</p>
              <h2 className="text-4xl font-bold text-white leading-tight">
                Choose a track to begin.
              </h2>
              <p className="text-sm text-muted mt-3 max-w-md leading-relaxed">
                Search for a song, start playback, and Noctune will build the queue around it.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}





