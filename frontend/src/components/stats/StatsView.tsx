import { useMemo, useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Clock, Headphones, Music2, User } from 'lucide-react';
import { api, type StatsDailyEntry, type StatsTopArtist, type StatsTopTrack } from '../../utils/api';
import { usePlayerStore } from '../../store/player';
import { formatDuration } from '../../utils/format';
import { clsx } from 'clsx';
import { TrackTitle } from '../ui/TrackTitle';

type Period = '7d' | '30d' | 'all';

const PERIODS: { value: Period; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'all', label: 'All time' },
];

function formatMinutes(totalMinutes: number): string {
  if (totalMinutes < 60) return `${Math.round(totalMinutes)}m`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = Math.round(totalMinutes % 60);
  if (hours < 24) return `${hours}h ${mins}m`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return `${days}d ${remHours}h`;
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: typeof Headphones;
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="surface-panel p-5">
      <div className="flex items-center gap-3">
        <div
          className={clsx(
            'flex h-10 w-10 items-center justify-center rounded-xl border',
            accent ? `border-${accent}/20 bg-${accent}/10 text-${accent}` : 'border-accent/20 bg-accent/10 text-accent'
          )}
          style={accent ? {} : {}}
        >
          <Icon size={18} strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
          <p className="mt-1 text-2xl text-white">{value}</p>
          {sub && <p className="mt-0.5 text-[11px] text-soft">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

function TopTrackRow({
  entry,
  index,
}: {
  entry: StatsTopTrack;
  index: number;
}) {
  const playTrack = usePlayerStore((s) => s.playTrack);
  const setView = usePlayerStore((s) => s.setView);
  const { track, playCount } = entry;

  return (
    <div
      onClick={() => playTrack(track, [track], { autoQueue: true, queueSource: 'recommendation' })}
      className="group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-all hover:bg-white/[0.04] cursor-pointer"
    >
      <span className="w-6 shrink-0 text-right font-mono text-xs text-muted tabular-nums">
        {index + 1}
      </span>
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-white/[0.06]">
        {track.thumbnail ? (
          <img
            src={track.thumbnail}
            alt=""
            className="h-full w-full object-cover"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-base-700 text-muted">
            <Music2 size={16} />
          </div>
        )}
      </div>
      <TrackTitle track={track} setView={setView} />
      <div className="ml-2 shrink-0 text-right">
        <p className="font-mono text-xs tabular-nums text-accent">{playCount}×</p>
        {track.duration > 0 && (
          <p className="font-mono text-[10px] tabular-nums text-muted">
            {formatDuration(track.duration)}
          </p>
        )}
      </div>
    </div>
  );
}

function TopArtistRow({
  entry,
  index,
}: {
  entry: StatsTopArtist;
  index: number;
}) {
  const setView = usePlayerStore((s) => s.setView);
  // Fetch artist metadata for the image
  const { data: artistData } = useQuery({
    queryKey: ['artist-image', entry.artistId],
    queryFn: () => api.browseArtist(entry.artistId!),
    enabled: Boolean(entry.artistId && !entry.image),
    staleTime: 1000 * 60 * 60, // 1 hour
  });
  const artistImage = entry.image ?? artistData?.image;

  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-white/[0.03]">
      <span className="w-6 shrink-0 text-right font-mono text-xs text-muted tabular-nums">
        {index + 1}
      </span>
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-white/[0.06]">
        {artistImage ? (
          <img
            src={artistImage}
            alt={entry.artist}
            className="h-full w-full object-cover"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-base-700 text-muted">
            <User size={16} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {entry.artistId ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setView('artist', entry.artistId!); }}
            className="block max-w-full truncate text-left text-sm font-medium transition-colors hover:text-accent text-white"
            title={`Go to artist: ${entry.artist}`}
          >
            {entry.artist}
          </button>
        ) : (
          <p className="truncate text-sm font-medium text-white">{entry.artist}</p>
        )}
        <p className="truncate text-xs text-muted">{entry.tracksCount} tracks</p>
      </div>
      <div className="ml-2 shrink-0 text-right">
        <p className="font-mono text-xs tabular-nums text-accent">{entry.playCount}×</p>
      </div>
    </div>
  );
}

function DailyChart({ data }: { data: StatsDailyEntry[] }) {
  const maxPlays = useMemo(
    () => Math.max(1, ...data.map((d) => d.playCount)),
    [data]
  );
  const maxMinutes = useMemo(
    () => Math.max(1, ...data.map((d) => d.minutes)),
    [data]
  );

  // Show date labels at intervals
  const labelInterval = data.length <= 14 ? 2 : data.length <= 31 ? 5 : 7;

  // Helper function to get color based on intensity (GitHub-style gradient)
  function getIntensityColor(intensity: number): string {
    if (intensity < 0.2) {
      // Very low: light gray
      return 'rgba(148, 163, 184, 0.35)';
    } else if (intensity < 0.4) {
      // Low: light green
      return 'rgba(134, 239, 172, 0.5)';
    } else if (intensity < 0.6) {
      // Medium: green
      return 'rgba(74, 222, 128, 0.7)';
    } else if (intensity < 0.8) {
      // High: dark green
      return 'rgba(34, 197, 94, 0.85)';
    } else {
      // Very high: very dark green
      return 'rgba(22, 163, 74, 1)';
    }
  }

  return (
    <div className="surface-panel p-5">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-accent/20 bg-accent/10 text-accent">
          <BarChart3 size={16} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Daily activity</h3>
          <p className="text-[11px] text-muted">Plays per day (listening intensity by color)</p>
        </div>
      </div>
      {(() => {
        const containerRef = useRef<HTMLDivElement | null>(null);
        const [tooltip, setTooltip] = useState<{ visible: boolean; x: number; y: number; content: string }>({ visible: false, x: 0, y: 0, content: '' });

        function handleMove(e: React.MouseEvent<HTMLDivElement>) {
          const el = containerRef.current;
          if (!el) return;
          const rect = el.getBoundingClientRect();
          const localX = e.clientX - rect.left;
          const localY = e.clientY - rect.top;

          const clampedX = Math.max(8, Math.min(rect.width - 8, localX));
          const clampedY = Math.max(8, Math.min(rect.height - 8, localY));

          // Determine nearest data index for content, but position follows cursor exactly
          const barWidth = rect.width / Math.max(1, data.length);
          const idx = Math.min(data.length - 1, Math.max(0, Math.floor(localX / barWidth)));
          const d = data[idx];
          const dateLabel = new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

          setTooltip({ visible: true, x: clampedX, y: clampedY, content: `${dateLabel}: ${d.playCount} plays · ${formatMinutes(d.minutes)}` });
        }

        return (
          <div
            ref={containerRef}
            className="relative flex h-40 items-end gap-1 border-b border-l border-white/[0.06] px-2 pb-2"
            onMouseMove={handleMove}
            onMouseLeave={() => setTooltip({ visible: false, x: 0, y: 0, content: '' })}
          >
            {data.map((d, i) => {
              const heightPct = (d.playCount / maxPlays) * 100;
              const intensity = d.minutes / maxMinutes;
              const showLabel = i % labelInterval === 0 || i === data.length - 1;
              const dateLabel = new Date(d.date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              });

              return (
                <div
                  key={d.date}
                  className="relative flex min-w-0 flex-1 flex-col items-center"
                  style={{ height: '100%' }}
                >
                  <div
                    className="mt-auto w-full max-w-[18px] rounded-t transition-colors relative"
                    style={{
                      height: `${Math.max(heightPct, d.playCount > 0 ? 4 : 0)}%`,
                      backgroundColor: d.playCount === 0
                        ? 'rgba(255,255,255,0.04)'
                        : getIntensityColor(intensity),
                    }}
                  />

                  {showLabel && (
                    <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[9px] tabular-nums text-muted">
                      {dateLabel}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Cursor-following tooltip that follows both X and Y of the cursor */}
            <div
              className="pointer-events-none absolute z-10 transition-opacity"
              style={{
                left: tooltip.x,
                top: tooltip.y,
                transform: 'translate(-50%, -120%)',
                opacity: tooltip.visible ? 1 : 0,
              }}
            >
              <div className="rounded-md bg-black/80 px-2 py-1 text-xs text-white whitespace-nowrap max-w-[160px] truncate">{tooltip.content}</div>
            </div>
          </div>
        );
      })()}
      <div className="mt-6 flex items-center justify-between text-[10px] text-muted">
        <span>
          Peak:{' '}
          <span className="font-mono tabular-nums text-white">
            {Math.round(maxPlays)} plays
          </span>
        </span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: 'rgba(148, 163, 184, 0.35)' }} />
            <span className="text-[10px] text-muted">Low</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: 'rgba(74, 222, 128, 0.7)' }} />
            <span className="text-[10px] text-muted">Medium</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: 'rgba(22, 163, 74, 1)' }} />
            <span className="text-[10px] text-muted">High</span>
          </span>
        </span>
      </div>
    </div>
  );
}

export function StatsView() {
  const [period, setPeriod] = useState<Period>('30d');

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['stats-overview', period],
    queryFn: () => api.stats.overview(period),
    staleTime: 1000 * 60 * 2,
  });

  const { data: topTracks = [], isLoading: tracksLoading } = useQuery({
    queryKey: ['stats-top-tracks', period],
    queryFn: () => api.stats.topTracks(period, 20),
    staleTime: 1000 * 60 * 2,
  });

  const { data: topArtists = [], isLoading: artistsLoading } = useQuery({
    queryKey: ['stats-top-artists', period],
    queryFn: () => api.stats.topArtists(period, 20),
    staleTime: 1000 * 60 * 2,
  });

  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const { data: daily = [], isLoading: dailyLoading } = useQuery({
    queryKey: ['stats-daily', days],
    queryFn: () => api.stats.daily(days),
    staleTime: 1000 * 60 * 2,
  });

  const hours = overview ? overview.totalMinutes / 60 : 0;
  const hoursLabel = hours < 1 ? formatMinutes(overview?.totalMinutes ?? 0) : `${hours.toFixed(1)}h`;

  return (
    <div className="flex h-full flex-col gap-8 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="section-label mb-2 text-accent">Wrapped</p>
          <h1 className="font-display text-3xl font-light leading-tight text-white sm:text-4xl">
            Your listening<br />
            <span className="italic text-accent">stats.</span>
          </h1>
          <p className="mt-3 max-w-lg text-sm text-soft">
            See what you've been spinning — tracks, artists, and hours lost to the night.
          </p>
        </div>

        <div className="flex gap-1 rounded-xl border border-white/[0.06] bg-base-800/60 p-1 backdrop-blur-md">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={clsx(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
                period === p.value
                  ? 'bg-accent text-white shadow-glow'
                  : 'text-muted hover:text-white'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Overview cards */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={Headphones}
          label="Plays"
          value={overviewLoading ? '—' : (overview?.totalPlays ?? 0).toLocaleString()}
          sub="total plays"
        />
        <StatCard
          icon={Clock}
          label="Listened"
          value={overviewLoading ? '—' : hoursLabel}
          sub={`${(overview?.totalMinutes ?? 0).toLocaleString()} min`}
        />
        <StatCard
          icon={User}
          label="Artists"
          value={overviewLoading ? '—' : overview?.uniqueArtists ?? 0}
          sub="unique artists"
        />
        <StatCard
          icon={Music2}
          label="Tracks"
          value={overviewLoading ? '—' : overview?.uniqueTracks ?? 0}
          sub="unique tracks"
        />
      </section>

      {/* Daily activity chart */}
      <section>
        {dailyLoading || !daily || daily.length === 0 ? (
          <div className="surface-panel flex h-48 items-center justify-center text-sm text-muted">
            {dailyLoading ? 'Loading activity…' : 'No listening data yet.'}
          </div>
        ) : (
          <DailyChart data={daily} />
        )}
      </section>

      {/* Top tracks + Top artists */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="surface-panel">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
            <div className="flex items-center gap-2">
              <Music2 size={16} className="text-accent" />
              <h2 className="text-sm font-semibold text-white">Top tracks</h2>
            </div>
            {tracksLoading && <span className="text-[11px] text-muted">Loading…</span>}
          </div>
          <div className="max-h-96 overflow-y-auto py-2">
            {topTracks.length === 0 && !tracksLoading && (
              <p className="px-5 py-6 text-center text-sm text-muted">Nothing here yet.</p>
            )}
            {topTracks.map((entry, i) => (
              <TopTrackRow key={entry.track.id} entry={entry} index={i} />
            ))}
          </div>
        </div>

        <div className="surface-panel">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
            <div className="flex items-center gap-2">
              <User size={16} className="text-accent" />
              <h2 className="text-sm font-semibold text-white">Top artists</h2>
            </div>
            {artistsLoading && <span className="text-[11px] text-muted">Loading…</span>}
          </div>
          <div className="max-h-96 overflow-y-auto py-2">
            {topArtists.length === 0 && !artistsLoading && (
              <p className="px-5 py-6 text-center text-sm text-muted">Nothing here yet.</p>
            )}
            {topArtists.map((entry, i) => (
              <TopArtistRow key={entry.artist} entry={entry} index={i} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
