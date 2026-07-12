import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, Music2, Tv2 } from 'lucide-react';
import { api, type Track } from '../../utils/api';
import { formatDuration } from '../../utils/format';
import { usePlayerStore } from '../../store/player';
import { TrackActionButtons } from '../ui/TrackActionButtons';
import { TrackTitle } from '../ui/TrackTitle';

export function ChannelView({ channelId }: { channelId: string }) {
  const { playTrack, currentTrack, isPlaying, setView } = usePlayerStore();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['channel', channelId],
    queryFn: () => api.browseChannel(channelId),
    staleTime: 1000 * 60 * 10,
  });

  function handlePlay(track: Track) {
    playTrack(track, data?.videos);
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted">
        <Tv2 size={36} strokeWidth={1} />
        <p className="text-sm">Channel unavailable</p>
        <button onClick={() => history.back()} className="btn-ghost text-xs gap-1.5">
          <ArrowLeft size={12} /> Go back
        </button>
      </div>
    );
  }

  const youtubeChannelUrl = `https://www.youtube.com/channel/${channelId}`;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="relative flex-shrink-0 overflow-hidden">
        {/* Background blur dari avatar */}
        {data.avatar && (
          <div
            className="absolute inset-0 scale-110 bg-cover bg-center opacity-20 blur-xl"
            style={{ backgroundImage: `url(${data.avatar})` }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-base-900" />

        <div className="relative flex items-end gap-5 px-6 pb-6 pt-10">
          <button
            onClick={() => history.back()}
            className="btn-ghost absolute left-4 top-4 p-1.5"
            title="Go back"
          >
            <ArrowLeft size={16} />
          </button>

          {/* Channel avatar */}
          {data.avatar ? (
            <img
              src={data.avatar}
              alt={data.name}
              className="h-28 w-28 flex-shrink-0 rounded-full object-cover shadow-2xl ring-2 ring-white/10"
            />
          ) : (
            <div className="flex h-28 w-28 flex-shrink-0 items-center justify-center rounded-full bg-base-800 ring-2 ring-white/10">
              <Tv2 size={36} className="text-muted" />
            </div>
          )}

          <div className="min-w-0 pb-1">
            <p className="section-label mb-1">YOUTUBE CHANNEL</p>
            <h1 className="font-display text-3xl font-semibold text-white leading-tight truncate">
              {data.name}
            </h1>
            {data.description && (
              <p className="mt-2 line-clamp-2 text-xs text-muted leading-relaxed max-w-md">
                {data.description}
              </p>
            )}
          </div>

          <a
            href={youtubeChannelUrl}
            target="_blank"
            rel="noreferrer"
            className="btn-ghost ml-auto flex-shrink-0 gap-1.5 text-xs text-muted"
            title="Open on YouTube"
          >
            <ExternalLink size={12} /> YouTube
          </a>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <section>
          <h2 className="section-label mb-3">
            VIDEOS
            {data.videos.length > 0 && (
              <span className="ml-2 font-mono text-[10px] text-muted/60 normal-case tracking-normal">
                {data.videos.length}
              </span>
            )}
          </h2>

          {data.videos.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted">
              <Music2 size={32} strokeWidth={1} />
              <p className="text-sm">No videos found</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {data.videos.map((track, i) => {
                const isActive = currentTrack?.id === track.id;
                return (
                  <div
                    key={track.id}
                    className={`track-row group ${isActive ? 'active' : ''}`}
                    onClick={() => handlePlay(track)}
                  >
                    <span className="w-5 flex-shrink-0 text-right text-xs text-muted">
                      {isActive && isPlaying ? (
                        <span className="text-accent">▶</span>
                      ) : (
                        i + 1
                      )}
                    </span>
                    <img
                      src={track.thumbnail}
                      alt=""
                      className="h-9 w-9 flex-shrink-0 rounded-md object-cover"
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                    <TrackTitle track={track} isActive={isActive} setView={setView} />
                    <div className="flex flex-shrink-0 items-center gap-1">
                      <TrackActionButtons
                        track={track}
                        className="hidden sm:flex items-center gap-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      />
                      <span className="block w-12 flex-shrink-0 text-right font-mono text-xs tabular-nums text-muted">
                        {formatDuration(track.duration)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
