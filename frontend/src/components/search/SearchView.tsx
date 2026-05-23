import { useState, useRef, useCallback } from 'react';
import { Search, Loader2, Music, Clock, Zap } from 'lucide-react';
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
    if (!q.trim()) { setResults([]); setSearched(false); return; }
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
      {/* Search input */}
      <div className="px-6 pt-6 pb-4">
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={query}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Search songs, artists..."
            className="input-base pl-9 pr-10"
            autoFocus
          />
          {isSearching && (
            <Loader2 size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2
                                          text-muted animate-spin" />
          )}
        </div>

        {/* Cache badge */}
        {searched && fromCache && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-accent">
            <Zap size={11} />
            <span>Instant — served from cache</span>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {!searched && !isSearching && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted">
            <Music size={40} strokeWidth={1} />
            <p className="text-sm">Type to search YouTube</p>
          </div>
        )}

        {searched && results.length === 0 && !isSearching && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted">
            <p className="text-sm">No results for "{query}"</p>
          </div>
        )}

        {results.map((track, i) => {
          const isActive = currentTrack?.id === track.id;
          return (
            <div
              key={track.id}
              className={`track-row animate-fade-in ${isActive ? 'active' : ''}`}
              style={{ animationDelay: `${i * 30}ms` }}
              onDoubleClick={() => handlePlay(track)}
            >
              {/* Index / playing indicator */}
              <div className="w-6 flex-shrink-0 flex items-center justify-center">
                {isActive && isPlaying
                  ? <div className="flex gap-0.5 items-end h-3">
                      {[0,1,2].map(j => (
                        <div key={j} className="w-0.5 bg-accent rounded-full animate-pulse"
                             style={{ height: `${[8,12,6][j]}px`, animationDelay: `${j*150}ms` }} />
                      ))}
                    </div>
                  : <span className="text-xs text-muted">{i + 1}</span>
                }
              </div>

              {/* Thumbnail */}
              <img
                src={track.thumbnail}
                alt=""
                className="w-9 h-9 rounded-md object-cover flex-shrink-0"
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm truncate ${isActive ? 'text-accent font-medium' : 'text-white'}`}>
                  {track.title}
                </p>
                <p className="text-xs text-muted truncate">{track.artist}</p>
              </div>

              {/* Duration */}
              <div className="flex items-center gap-1 text-xs text-muted flex-shrink-0">
                <Clock size={10} />
                <span className="font-mono">{formatDuration(track.duration)}</span>
              </div>

              {/* Play button on hover */}
              <button
                className="opacity-0 group-hover:opacity-100 btn-ghost ml-1 transition-opacity"
                onClick={() => handlePlay(track)}
              >
                ▶
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
