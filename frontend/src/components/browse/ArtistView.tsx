import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ExternalLink,
  ListMusic,
  Maximize2,
  MessageSquare,
  Music2,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  ThumbsUp,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, isTrackActive, type ChannelPost, type Track } from '../../utils/api';
import { clsx } from 'clsx';
import { formatDuration } from '../../utils/format';
import { usePlayerStore } from '../../store/player';
import { TrackActionButtons } from '../ui/TrackActionButtons';
import { ArtworkLightboxModal } from '../ui/ArtworkLightboxModal';

function compactNumber(n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat(undefined, { notation: 'compact' }).format(n);
}

export const channelTabByArtist = new Map<string, 'videos' | 'playlists' | 'posts'>();

function ArtistTrackText({
  track,
  isActive,
  setView,
}: {
  track: Track;
  isActive: boolean;
  setView: ReturnType<typeof usePlayerStore.getState>['setView'];
}) {
  const needsSpotifyNavigation = Boolean(track.spotifyId && !track.albumId);
  const { data: spotifyMetadata } = useQuery({
    queryKey: ['spotify-metadata', track.spotifyId],
    queryFn: () => api.spotifyMetadata(track.spotifyId!),
    enabled: needsSpotifyNavigation,
    staleTime: 1000 * 60 * 60,
  });
  const albumViewId = track.albumId ?? spotifyMetadata?.album.id;
  const albumName = track.album ?? spotifyMetadata?.album.name;

  return (
    <div className="min-w-0 flex-1">
      {albumViewId ? (
        <button
          type="button"
          className={`block max-w-full truncate text-left text-sm transition-colors hover:text-accent ${
            isActive ? 'font-medium text-accent' : 'text-white'
          }`}
          onClick={(event) => {
            event.stopPropagation();
            setView('album', albumViewId);
          }}
          title={`Go to album: ${albumName ?? track.title}`}
        >
          {track.title}
        </button>
      ) : (
        <p className={`truncate text-sm ${isActive ? 'font-medium text-accent' : 'text-white'}`}>
          {track.title}
        </p>
      )}
      {albumName && albumViewId ? (
        <button
          type="button"
          className="mt-0.5 block max-w-full truncate text-left text-xs text-muted transition-colors hover:text-accent"
          onClick={(event) => {
            event.stopPropagation();
            setView('album', albumViewId);
          }}
          title={`Go to album: ${albumName}`}
        >
          {albumName}
        </button>
      ) : albumName && albumName !== 'YouTube Release' ? (
        <p className="truncate text-xs text-muted">{albumName}</p>
      ) : track.artist ? (
        <p className="truncate text-xs text-muted">{track.artist}</p>
      ) : null}
    </div>
  );
}

export function ArtistView({ artistId }: { artistId: string }) {
  const [lightboxImage, setLightboxImage] = useState<{
    url: string;
    title: string;
    artist: string;
    album?: string;
  } | null>(null);
  const {
    playTrack,
    currentTrack,
    isPlaying,
    setView,
    activeChannelTab,
    shuffle,
    repeat,
    cyclePlaybackMode,
  } = usePlayerStore();
  const cleanArtistId = artistId.replace(/:(videos|playlists|posts)$/, '');
  const channelTab = activeChannelTab ?? 'videos';
  const isYouTubeChannelId = cleanArtistId.startsWith('ytchannel:') || cleanArtistId.startsWith('UC') || cleanArtistId.startsWith('@');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    setIsScrolled(false);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [cleanArtistId]);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const next = e.currentTarget.scrollTop > 120;
    if (next !== isScrolled) setIsScrolled(next);
  }

  const modeTitle = shuffle
    ? 'Playback mode: Shuffle on (click for Repeat all)'
    : repeat === 'all'
    ? 'Playback mode: Repeat all (click for Repeat one)'
    : repeat === 'one'
    ? 'Playback mode: Repeat one (click to turn off)'
    : 'Playback mode: Normal (click for Shuffle)';

  const { data, isLoading, isError } = useQuery({
    queryKey: ['artist', cleanArtistId],
    queryFn: () => api.browseArtist(cleanArtistId),
    staleTime: isYouTubeChannelId ? 1000 * 60 * 5 : 1000 * 60 * 10,
    refetchOnMount: true,
  });

  function handlePlayAll() {
    if (!data?.topTracks || data.topTracks.length === 0) return;
    const startIndex = shuffle ? Math.floor(Math.random() * data.topTracks.length) : 0;
    playTrack(data.topTracks[startIndex], data.topTracks);
  }

  // ── Posts lazy-fetch state ──
  const [posts, setPosts] = useState<ChannelPost[]>([]);
  const [postsContinuation, setPostsContinuation] = useState<string | null>(null);
  const [postsLoadingMore, setPostsLoadingMore] = useState(false);

  const { isLoading: postsLoading } = useQuery({
    queryKey: ['channel-posts', cleanArtistId],
    queryFn: async () => {
      const result = await api.getChannelPosts(cleanArtistId);
      setPosts(result.posts);
      setPostsContinuation(result.continuationToken);
      return result;
    },
    enabled: isYouTubeChannelId && channelTab === 'posts',
    staleTime: 1000 * 60 * 5,
  });

  // Reset posts state when channel changes
  useEffect(() => {
    setPosts([]);
    setPostsContinuation(null);
  }, [cleanArtistId]);

  const handleLoadMorePosts = useCallback(async () => {
    if (!postsContinuation || postsLoadingMore) return;
    setPostsLoadingMore(true);
    try {
      const result = await api.getChannelPosts(cleanArtistId, postsContinuation);
      setPosts((prev) => {
        const existingIds = new Set(prev.map((p) => p.id));
        const newPosts = result.posts.filter((p) => !existingIds.has(p.id));
        return [...prev, ...newPosts];
      });
      setPostsContinuation(result.continuationToken);
    } finally {
      setPostsLoadingMore(false);
    }
  }, [cleanArtistId, postsContinuation, postsLoadingMore]);

  function changeChannelTab(tab: 'videos' | 'playlists' | 'posts') {
    if (!isYouTubeChannelId || tab === channelTab) return;
    setView('artist', cleanArtistId, tab);
  }

  function handlePlay(track: Track) {
    playTrack(track, data?.topTracks);
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
        <Music2 size={36} strokeWidth={1} />
        <p className="text-sm">Artist unavailable</p>
        <button onClick={() => setView('home')} className="btn-ghost text-xs gap-1.5">
          <ArrowLeft size={12} /> Go back
        </button>
      </div>
    );
  }

  const isYouTubeChannel = data.id.startsWith('ytchannel:');

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {lightboxImage && (
        <ArtworkLightboxModal
          imageUrl={lightboxImage.url}
          title={lightboxImage.title}
          artist={lightboxImage.artist}
          album={lightboxImage.album}
          onClose={() => setLightboxImage(null)}
        />
      )}
      {/* Unified single scroll container */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="relative flex-1 overflow-y-auto px-4 sm:px-6 lg:px-9 pb-8"
      >
        {/* Compact Sticky Header Bar - transitions in when scrolled */}
        <div
          className={clsx(
            'sticky top-0 z-30 -mx-4 sm:-mx-6 lg:-mx-9 px-4 sm:px-6 lg:px-9 flex items-center justify-between transition-all duration-200 border-b',
            isScrolled
              ? 'h-14 opacity-100 translate-y-0 border-white/[0.08] bg-base-950/92 backdrop-blur-xl'
              : 'h-0 opacity-0 -translate-y-2 border-transparent overflow-hidden pointer-events-none'
          )}
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-3">
            <button
              type="button"
              onClick={() => history.back()}
              className="btn-ghost p-1.5 shrink-0"
              title="Go back"
            >
              <ArrowLeft size={16} />
            </button>
            {data.image ? (
              <img src={data.image} alt="" className="h-8 w-8 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="h-8 w-8 rounded-full bg-base-800 border border-base-600/60 flex items-center justify-center shrink-0">
                <Users size={16} className="text-muted" />
              </div>
            )}
            <span className="truncate text-sm sm:text-base font-bold text-white leading-tight">
              {data.name}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handlePlayAll}
              disabled={!data.topTracks || data.topTracks.length === 0}
              className="btn-accent h-9 w-9 rounded-full p-0 flex items-center justify-center shadow-md shadow-accent/15 disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation"
              title="Play all"
              aria-label="Play all"
            >
              <Play size={15} fill="currentColor" className="ml-0.5" />
            </button>
            <button
              type="button"
              onClick={cyclePlaybackMode}
              className={clsx(
                'h-9 w-9 rounded-full border p-0 flex items-center justify-center transition-all touch-manipulation',
                shuffle
                  ? 'border-accent/60 bg-accent/15 text-accent shadow-[0_0_10px_rgba(234,177,76,0.2)]'
                  : repeat !== 'off'
                  ? 'border-accent/60 bg-accent/15 text-accent shadow-[0_0_10px_rgba(234,177,76,0.2)]'
                  : 'border-base-600/70 bg-base-900/80 text-muted hover:text-white'
              )}
              title={modeTitle}
              aria-label={modeTitle}
            >
              {shuffle ? <Shuffle size={15} /> : repeat === 'one' ? <Repeat1 size={15} /> : <Repeat size={15} />}
            </button>
          </div>
        </div>

        {/* Normal in-flow Hero Header */}
        <div className="relative -mx-4 sm:-mx-6 lg:-mx-9 overflow-hidden mb-6">
          {/* Background blur */}
          {data.image && (
            <div
              className="absolute inset-0 scale-110 bg-cover bg-center opacity-20 blur-xl"
              style={{ backgroundImage: `url(${data.image})` }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-base-900" />

          <div className="relative flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left gap-4 sm:gap-5 px-4 sm:px-6 lg:px-9 pb-4 pt-10 sm:pt-12">
            <button
              type="button"
              onClick={() => history.back()}
              className="btn-ghost absolute left-4 top-4 p-1.5"
              title="Go back"
            >
              <ArrowLeft size={16} />
            </button>

            {/* Artist image */}
            {data.image ? (
              <button
                type="button"
                onClick={() => setLightboxImage({
                  url: data.image!,
                  title: data.name,
                  artist: isYouTubeChannel ? 'Channel Avatar' : 'Artist Profile',
                })}
                className="group relative h-28 w-28 flex-shrink-0 rounded-full overflow-hidden shadow-2xl ring-2 ring-white/10 text-left focus:outline-none focus:ring-2 focus:ring-accent"
                title="Click to view artwork"
              >
                <img
                  src={data.image}
                  alt={data.name}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-1 text-xs font-medium">
                  <Maximize2 size={16} />
                </div>
              </button>
            ) : (
              <div className="flex h-28 w-28 flex-shrink-0 items-center justify-center rounded-full bg-base-800 ring-2 ring-white/10">
                <Users size={36} className="text-muted" />
              </div>
            )}

            <div className="min-w-0 flex-1 pb-1">
              <p className="section-label mb-1">{isYouTubeChannel ? 'CHANNEL' : 'ARTIST'}</p>
              <h1 className="font-display text-2xl sm:text-3xl font-semibold text-white leading-tight truncate">
                {data.name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center justify-center sm:justify-start gap-2.5 sm:gap-3 text-xs text-muted">
                {data.followers != null && typeof data.followers !== 'string' && (
                  <span className="flex items-center gap-1">
                    <Users size={11} />
                    {`${compactNumber(data.followers as number)} followers`}
                  </span>
                )}
                {data.genres.slice(0, 3).map(g => (
                  <span key={g} className="rounded-full border border-white/10 bg-base-800 px-2 py-0.5">
                    {g}
                  </span>
                ))}
              </div>

              {/* Clamped long bio description for topic/official channels */}
              {data.followers != null && typeof data.followers === 'string' && (
                <p
                  className="mt-2 text-xs text-muted line-clamp-2 max-w-3xl leading-relaxed text-center sm:text-left"
                  title={data.followers}
                >
                  {data.followers}
                </p>
              )}

              {/* Action Buttons: Play All + Mode Switcher */}
              <div className="mt-4 flex items-center justify-center sm:justify-start gap-2.5">
                <button
                  type="button"
                  onClick={handlePlayAll}
                  disabled={!data.topTracks || data.topTracks.length === 0}
                  aria-label="Play all"
                  title="Play all"
                  className="btn-accent h-11 w-11 rounded-full p-0 flex items-center justify-center shadow-lg shadow-accent/15 disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation"
                >
                  <Play size={18} fill="currentColor" className="ml-0.5" />
                </button>

                <button
                  type="button"
                  onClick={cyclePlaybackMode}
                  aria-label={modeTitle}
                  title={modeTitle}
                  className={clsx(
                    'h-11 w-11 rounded-full border p-0 flex items-center justify-center transition-all touch-manipulation',
                    shuffle
                      ? 'border-accent/60 bg-accent/15 text-accent shadow-[0_0_12px_rgba(234,177,76,0.25)]'
                      : repeat !== 'off'
                      ? 'border-accent/60 bg-accent/15 text-accent shadow-[0_0_12px_rgba(234,177,76,0.25)]'
                      : 'border-base-600/70 bg-base-900/80 text-muted hover:text-white'
                  )}
                >
                  {shuffle ? <Shuffle size={17} /> : repeat === 'one' ? <Repeat1 size={17} /> : <Repeat size={17} />}
                </button>

                {data.spotifyUrl && (
                  <a
                    href={data.spotifyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-ghost flex-shrink-0 gap-1.5 text-xs text-muted ml-1"
                  >
                    <ExternalLink size={12} />
                    {data.spotifyUrl.includes('youtube.com') ? 'YouTube' : 'Spotify'}
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {isYouTubeChannel && (
          <div
            className={clsx(
              'sticky z-20 -mx-4 sm:-mx-6 lg:-mx-9 mb-5 flex items-center gap-6 border-b border-white/[0.08] bg-base-900/95 px-4 sm:px-6 lg:px-9 py-1 backdrop-blur-md transition-[top] duration-200',
              isScrolled ? 'top-14' : 'top-0'
            )}
          >
            <button
              type="button"
              onClick={() => changeChannelTab('videos')}
              className={clsx(
                '-mb-px inline-flex items-center gap-2 border-b-2 px-0.5 py-2.5 text-xs font-semibold uppercase tracking-[0.13em] transition-colors',
                channelTab === 'videos'
                  ? 'border-accent text-white'
                  : 'border-transparent text-muted hover:border-white/20 hover:text-soft'
              )}
            >
              Videos
              <span className={clsx('font-mono text-[10px] tabular-nums', channelTab === 'videos' ? 'text-accent' : 'text-base-500')}>
                {data.topTracks.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => changeChannelTab('playlists')}
              className={clsx(
                '-mb-px inline-flex items-center gap-2 border-b-2 px-0.5 py-2.5 text-xs font-semibold uppercase tracking-[0.13em] transition-colors',
                channelTab === 'playlists'
                  ? 'border-accent text-white'
                  : 'border-transparent text-muted hover:border-white/20 hover:text-soft'
              )}
            >
              Playlists
              <span className={clsx('font-mono text-[10px] tabular-nums', channelTab === 'playlists' ? 'text-accent' : 'text-base-500')}>
                {data.channelPlaylists?.length ?? 0}
              </span>
            </button>
            <button
              type="button"
              onClick={() => changeChannelTab('posts')}
              className={clsx(
                '-mb-px inline-flex items-center gap-2 border-b-2 px-0.5 py-2.5 text-xs font-semibold uppercase tracking-[0.13em] transition-colors',
                channelTab === 'posts'
                  ? 'border-accent text-white'
                  : 'border-transparent text-muted hover:border-white/20 hover:text-soft'
              )}
            >
              Posts
            </button>
          </div>
        )}

        {/* Top tracks */}
        {(!isYouTubeChannel || channelTab === 'videos') && <section className="mb-8">
          {!isYouTubeChannel && <h2 className="section-label mb-3">TOP TRACKS</h2>}
          <div className="space-y-0.5">
            {data.topTracks.map((track, i) => {
              const isActive = isTrackActive(currentTrack, track);
              return (
                <div
                  key={track.id}
                  className={`track-row group ${isActive ? 'active' : ''}`}
                  onClick={() => handlePlay(track)}
                >
                  <div className="w-5 flex-shrink-0 flex items-center justify-center">
                    {isActive && isPlaying ? (
                      <div className="flex gap-0.5 items-end h-3 justify-center">
                        <div className="w-0.5 h-3 bg-accent rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                        <div className="w-0.5 h-1.5 bg-accent rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                        <div className="w-0.5 h-2.5 bg-accent rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                      </div>
                    ) : (
                      <span className={clsx('text-xs font-mono', isActive ? 'text-accent font-semibold' : 'text-muted')}>
                        {i + 1}
                      </span>
                    )}
                  </div>
                  <img
                    src={track.thumbnail}
                    alt=""
                    className="h-9 w-9 flex-shrink-0 rounded-md object-cover"
                    onError={e => (e.currentTarget.style.display = 'none')}
                  />
                  <ArtistTrackText track={track} isActive={isActive} setView={setView} />
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
        </section>}

        {/* Discography */}
        {data.albums.length > 0 && (
          <section>
            <h2 className="section-label mb-3">DISCOGRAPHY</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {data.albums.map(album => (
                <button
                  key={album.id}
                  className="group text-left"
                  onClick={() => usePlayerStore.getState().setView('album' as never, album.id)}
                >
                  <div className="overflow-hidden rounded-lg bg-base-800 aspect-square">
                    {album.image ? (
                      <img
                        src={album.image}
                        alt={album.name}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Music2 size={28} className="text-muted" />
                      </div>
                    )}
                  </div>
                  <p className="mt-2 truncate font-display text-sm font-medium text-white group-hover:text-accent transition-colors">
                    {album.name}
                  </p>
                  <p className="truncate text-xs text-muted capitalize">
                    {album.type}{album.releaseDate ? ` · ${album.releaseDate.slice(0, 4)}` : ''}
                  </p>
                </button>
              ))}
            </div>
          </section>
        )}

        {isYouTubeChannel && channelTab === 'playlists' && (
          data.channelPlaylists && data.channelPlaylists.length > 0 ? (
            <section>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {data.channelPlaylists.map((playlist) => (
                  <button
                    type="button"
                    key={playlist.id}
                    className="group text-left"
                    onClick={() => {
                      try {
                        sessionStorage.setItem('noctune:channel-return-tab', JSON.stringify({ artistId, tab: 'playlists' }));
                      } catch {
                        // Ignore unavailable session storage in restricted webviews.
                      }
                      channelTabByArtist.set(artistId, 'playlists');
                      setView('playlist', `ytplaylist:${playlist.id}`);
                    }}
                  >
                    <div className="relative overflow-hidden rounded-lg bg-base-800 aspect-square flex items-center justify-center">
                      <Music2 size={28} className="text-muted absolute" />
                      {playlist.image && (
                        <img
                          src={playlist.image}
                          alt={playlist.name}
                          className="relative z-10 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      )}
                    </div>
                    <p className="mt-2 truncate font-display text-sm font-medium text-white group-hover:text-accent transition-colors">{playlist.name}</p>
                    <p className="truncate text-xs text-muted">YouTube playlist</p>
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <div className="flex min-h-[18rem] flex-col items-center justify-center gap-3 text-muted">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-base-600/30 bg-base-800">
                <ListMusic size={27} strokeWidth={1.3} />
              </div>
              <p className="text-center text-sm">No public playlists found on this YouTube channel.</p>
            </div>
          )
        )}

        {isYouTubeChannel && channelTab === 'posts' && (
          postsLoading ? (
            <div className="flex min-h-[18rem] items-center justify-center">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            </div>
          ) : posts.length > 0 ? (
            <section className="space-y-4">
              {posts.map((post) => (
                <article
                  key={post.id}
                  className="rounded-xl border border-white/[0.06] bg-base-800/50 p-4"
                >
                  {/* Author + time */}
                  <div className="mb-2.5 flex items-center gap-2.5">
                    {post.authorAvatar ? (
                      <img
                        src={post.authorAvatar}
                        alt=""
                        className="h-8 w-8 flex-shrink-0 rounded-full object-cover"
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                      />
                    ) : (
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-base-700">
                        <Users size={14} className="text-muted" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      {post.authorName && (
                        <p className="truncate text-sm font-medium text-white">{post.authorName}</p>
                      )}
                      {post.publishedTime && (
                        <p className="text-[11px] text-muted">{post.publishedTime}</p>
                      )}
                    </div>
                  </div>

                  {/* Content text */}
                  {post.contentText && (
                    <p className="mb-3 whitespace-pre-line text-sm leading-relaxed text-soft">
                      {post.contentText}
                    </p>
                  )}

                  {/* Images */}
                  {post.images.length > 0 && (
                    <div
                      className={clsx(
                        'mb-3 gap-1.5 overflow-hidden rounded-lg',
                        post.images.length === 1 ? 'grid grid-cols-1' : 'grid grid-cols-2',
                      )}
                    >
                      {post.images.map((url, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setLightboxImage({
                            url,
                            title: post.contentText
                              ? (post.contentText.length > 60 ? `${post.contentText.slice(0, 60)}…` : post.contentText)
                              : (post.authorName ? `${post.authorName} Post` : 'Community Post'),
                            artist: post.authorName ?? data.name,
                            album: 'YouTube Community',
                          })}
                          className="group relative block w-full overflow-hidden bg-base-700 text-left focus:outline-none focus:ring-2 focus:ring-accent"
                          title="Click to view artwork"
                        >
                          <img
                            src={url}
                            alt=""
                            className={clsx(
                              'w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]',
                              post.images.length === 1 ? 'max-h-96' : 'aspect-square',
                            )}
                            onError={(e) => (e.currentTarget.style.display = 'none')}
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-1 text-xs font-medium">
                            <Maximize2 size={16} />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Video embed thumbnail */}
                  {post.videoId && (
                    <div className="mb-3 overflow-hidden rounded-lg bg-base-700">
                      <div className="relative aspect-video">
                        <img
                          src={`https://i.ytimg.com/vi/${post.videoId}/hqdefault.jpg`}
                          alt=""
                          className="h-full w-full object-cover"
                          onError={(e) => (e.currentTarget.style.display = 'none')}
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
                            <div className="ml-0.5 h-0 w-0 border-l-[10px] border-t-[6px] border-b-[6px] border-l-white border-t-transparent border-b-transparent" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Counts */}
                  {(post.voteCount || post.commentCount) && (
                    <div className="flex items-center gap-4 text-[11px] text-muted">
                      {post.voteCount && (
                        <span className="flex items-center gap-1">
                          <ThumbsUp size={12} />
                          {post.voteCount}
                        </span>
                      )}
                      {post.commentCount && (
                        <span className="flex items-center gap-1">
                          <MessageSquare size={12} />
                          {post.commentCount}
                        </span>
                      )}
                    </div>
                  )}
                </article>
              ))}

              {/* Load More */}
              {postsContinuation && (
                <div className="flex justify-center pt-2 pb-4">
                  <button
                    type="button"
                    onClick={handleLoadMorePosts}
                    disabled={postsLoadingMore}
                    className="btn-ghost gap-2 rounded-lg border border-white/10 px-5 py-2 text-xs font-medium text-soft transition-colors hover:border-white/20 hover:text-white disabled:opacity-50"
                  >
                    {postsLoadingMore ? (
                      <>
                        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                        Loading…
                      </>
                    ) : (
                      'Load More'
                    )}
                  </button>
                </div>
              )}
            </section>
          ) : (
            <div className="flex min-h-[18rem] flex-col items-center justify-center gap-3 text-muted">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-base-600/30 bg-base-800">
                <MessageSquare size={27} strokeWidth={1.3} />
              </div>
              <p className="text-center text-sm">No community posts found on this YouTube channel.</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
