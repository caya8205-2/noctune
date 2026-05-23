import { useCallback, useRef, useState } from 'react';
import { Clock, Loader2, Music, Play, Search, Zap } from 'lucide-react';
import { api, type Track } from '../../utils/api';
import { formatDuration } from '../../utils/format';
import { usePlayerStore } from '../../store/player';

export function SearchView() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const { playTrack, currentTrack, isPlaying } = usePlayerStore();

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    setIsSearching(true);
    try {
      const res = await api.search(q.trim());
      setResults(res.tracks);
      setFromCache(res.fromCache);
      setSearched(true);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setIsSearching(false);
    }
  }, []);

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 400);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      clearTimeout(debounceRef.current);
      doSearch(query);
    }
  }

  function handlePlay(track: Track) {
    playTrack(track, results, { autoQueue: true });
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-end justify-between gap-4 mb-4">
          <div>
            <p className="section-label mb-2">Search</p>
            <h1 className="font-display text-3xl text-white leading-none">Find a seed track.</h1>
          </div>
          {searched && (
            <span className="text-xs text-muted">
              {results.length} result{results.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={query}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Search songs or artists"
            className="input-base pl-9 pr-10"
            autoFocus
          />
          {isSearching && (
            <Loader2
              size={14}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted animate-spin"
            />
          )}
        </div>

        {searched && fromCache && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-accent">
            <Zap size={11} />
            <span>Instant from cache</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {!searched && !isSearching && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted">
            <div className="w-14 h-14 rounded-xl bg-base-800 border border-base-600/30 flex items-center justify-center">
              <Music size={28} strokeWidth={1.2} />
            </div>
            <p className="text-sm">Start with a song, artist, or mood.</p>
          </div>
        )}

        {searched && results.length === 0 && !isSearching && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted">
            <p className="text-sm">No results for "{query}"</p>
          </div>
        )}

        {results.map((track, i) => {
          const isActive = currentTrack?.id === track.id || currentTrack?.spotifyId === track.spotifyId;
          return (
            <div
              key={`${track.id}-${track.spotifyId ?? 'yt'}-${i}`}
              className={`track-row group animate-fade-in ${isActive ? 'active' : ''}`}
              style={{ animationDelay: `${i * 30}ms` }}
              onDoubleClick={() => handlePlay(track)}
            >
              <div className="w-6 flex-shrink-0 flex items-center justify-center">
                {isActive && isPlaying ? (
                  <div className="flex gap-0.5 items-end h-3">
                    {[0, 1, 2].map((j) => (
                      <div
                        key={j}
                        className="w-0.5 bg-accent rounded-full animate-pulse"
                        style={{ height: `${[8, 12, 6][j]}px`, animationDelay: `${j * 150}ms` }}
                      />
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-muted">{i + 1}</span>
                )}
              </div>

              <img
                src={track.thumbnail}
                alt=""
                className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />

              <div className="flex-1 min-w-0">
                <p className={`text-sm truncate ${isActive ? 'text-accent font-medium' : 'text-white'}`}>
                  {track.title}
                </p>
                <p className="text-xs text-muted truncate">{track.artist}</p>
              </div>

              <div className="flex items-center gap-1 text-xs text-muted flex-shrink-0">
                <Clock size={10} />
                <span className="font-mono">{formatDuration(track.duration)}</span>
              </div>

              <button
                className="opacity-0 group-hover:opacity-100 btn-ghost ml-1 transition-opacity"
                onClick={() => handlePlay(track)}
                title="Play"
              >
                <Play size={14} fill="currentColor" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
