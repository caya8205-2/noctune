import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, Download, Loader2, Music, Search, X, XCircle, Zap } from 'lucide-react';
import { api, apiUrl, type Track } from '../../utils/api';
import { formatDuration } from '../../utils/format';
import { usePlayerStore } from '../../store/player';
import { TrackActionButtons } from '../ui/TrackActionButtons';
import { canNavigateToChannel, navigateToChannel } from '../../utils/channelNavigation';

interface SettingsData {
  searchEngine: 'ytdlp' | 'spotify';
}

const RECENT_SEARCHES_KEY = 'noctune:recent-searches';
const SEARCH_RESULT_LIMIT = 25;
const MINI_RESULT_LIMIT = 6;
const MINI_DEBOUNCE_MS = 250;
const MINI_MIN_QUERY = 2;

function isPlaylistUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return (
      (url.hostname.includes('spotify.com') && url.pathname.includes('/playlist/')) ||
      ((url.hostname.includes('youtube.com') || url.hostname.includes('youtu.be')) && url.searchParams.has('list'))
    );
  } catch {
    return false;
  }
}

export function SearchView() {
  const [query, setQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [results, setResults] = useState<Track[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [searched, setSearched] = useState(false);
  const [engine, setEngine] = useState<'ytdlp' | 'spotify' | null>(null);
  const [savingEngine, setSavingEngine] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [miniResults, setMiniResults] = useState<Track[]>([]);
  const [miniSearching, setMiniSearching] = useState(false);
  const [miniOpen, setMiniOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);
  const playlistUrl = useMemo(() => isPlaylistUrl(query), [query]);
  const { playTrack, currentTrack, isPlaying, setView } = usePlayerStore();

  useEffect(() => {
    apiUrl('/settings')
      .then((url) => fetch(url))
      .then((r) => r.json())
      .then((data: SettingsData) => setEngine(data.searchEngine))
      .catch(console.error);
    try {
      setRecentSearches(JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) ?? '[]'));
    } catch {
      setRecentSearches([]);
    }
  }, []);

  // Close mini dropdown when clicking outside the search container.
  useEffect(() => {
    if (!miniOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setMiniOpen(false);
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [miniOpen]);

  async function handleEngineChange(nextEngine: 'ytdlp' | 'spotify') {
    if (nextEngine === engine || savingEngine) return;
    const previous = engine;
    setEngine(nextEngine);
    setSavingEngine(true);
    try {
      await fetch(await apiUrl('/settings'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchEngine: nextEngine }),
      });
      if (query.trim()) void doFullSearch(query);
    } catch (err) {
      console.error('Search engine save failed:', err);
      setEngine(previous);
    } finally {
      setSavingEngine(false);
    }
  }

  const runMiniSearch = useCallback(async (q: string) => {
    const cleanQuery = q.trim();
    if (cleanQuery.length < MINI_MIN_QUERY || isPlaylistUrl(cleanQuery)) {
      setMiniResults([]);
      setMiniSearching(false);
      setMiniOpen(false);
      return;
    }
    setMiniSearching(true);
    setMiniOpen(true);
    try {
      const res = await api.search(cleanQuery, MINI_RESULT_LIMIT);
      setMiniResults(res.tracks);
    } catch (err) {
      console.error('Mini search error:', err);
    } finally {
      setMiniSearching(false);
    }
  }, []);

  const doFullSearch = useCallback(async (q: string) => {
    const cleanQuery = q.trim();
    if (!cleanQuery) {
      setResults([]);
      setSearched(false);
      setMiniOpen(false);
      return;
    }
    setIsSearching(true);
    setMiniOpen(false);
    try {
      const res = await api.search(cleanQuery, SEARCH_RESULT_LIMIT);
      setResults(res.tracks);
      setFromCache(res.fromCache);
      setSearched(true);
      setRecentSearches((current) => {
        const next = [cleanQuery, ...current.filter((item) => item.toLowerCase() !== cleanQuery.toLowerCase())].slice(0, 6);
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
        return next;
      });
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
    if (!val.trim()) {
      setMiniResults([]);
      setMiniSearching(false);
      setMiniOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => void runMiniSearch(val), MINI_DEBOUNCE_MS);
  }

  function clearQuery() {
    clearTimeout(debounceRef.current);
    setQuery('');
    setMiniResults([]);
    setMiniSearching(false);
    setMiniOpen(false);
    setResults([]);
    setSearched(false);
    setImportMessage(null);
  }

  function runRecentSearch(value: string) {
    setQuery(value);
    clearTimeout(debounceRef.current);
    setMiniOpen(false);
    void doFullSearch(value);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(debounceRef.current);
      void doFullSearch(query);
    } else if (e.key === 'Escape' && miniOpen) {
      setMiniOpen(false);
    }
  }

  function handleMiniPick(track: Track) {
    setMiniOpen(false);
    playTrack(track, [track], { autoQueue: true, queueSource: 'search' });
  }

  function handlePlay(track: Track) {
    playTrack(track, results, { autoQueue: true, queueSource: 'search' });
  }

  async function handleImportPlaylist() {
    if (!playlistUrl) return;
    setImporting(true);
    setImportMessage(null);
    try {
      const result = await api.importPlaylist(query.trim());
      setImportMessage({
        ok: true,
        text: `Imported ${result.imported} tracks to "${result.playlist.name}".`,
      });
    } catch (err) {
      setImportMessage({
        ok: false,
        text: (err as Error).message,
      });
    } finally {
      setImporting(false);
    }
  }

  const rightSlotBusy = isSearching || miniSearching;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 pt-5 pb-4 sm:px-6 lg:px-9 lg:pt-8 lg:pb-5">
        <div className="flex items-end justify-between gap-4 mb-5">
          <div>
            <p className="section-label mb-2 text-accent">Search</p>
            <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight">Find a seed track.</h1>
          </div>
          {searched && (
            <span className="text-xs text-muted">
              {results.length} result{results.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        <div className="relative" ref={containerRef}>
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={query}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Search songs or artists"
            className="input-base pl-9 pr-10 h-12"
            autoFocus
          />
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted">
            {rightSlotBusy ? (
              <Loader2 size={14} className="animate-spin" />
            ) : query ? (
              <button
                type="button"
                onClick={clearQuery}
                className="text-muted hover:text-white transition-colors"
                title="Clear search"
                aria-label="Clear search"
              >
                <X size={15} />
              </button>
            ) : null}
          </span>

          {miniOpen && (miniSearching || miniResults.length > 0) && (
            <div className="absolute left-0 right-0 top-full mt-2 z-30 max-h-80 overflow-y-auto rounded-xl border border-base-600/70 bg-base-900 shadow-2xl shadow-black/40">
              {miniSearching && miniResults.length === 0 ? (
                <div className="flex items-center justify-center gap-2 px-4 py-3 text-xs text-muted">
                  <Loader2 size={13} className="animate-spin" /> Searching
                </div>
              ) : (
                <>
                  {miniResults.map((track, i) => {
                    const isActive =
                      currentTrack?.id === track.id ||
                      Boolean(currentTrack?.spotifyId && track.spotifyId && currentTrack.spotifyId === track.spotifyId);
                    return (
                      <button
                        key={`${track.id}-${track.spotifyId ?? 'yt'}-${i}`}
                        type="button"
                        onClick={() => handleMiniPick(track)}
                        className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-base-800 ${
                          isActive ? 'bg-base-800' : ''
                        }`}
                      >
                        <img
                          src={track.thumbnail}
                          alt=""
                          className="w-8 h-8 rounded-md object-cover flex-shrink-0"
                          onError={(e) => (e.currentTarget.style.display = 'none')}
                        />
                        <div className="min-w-0 flex-1">
                          <p className={`text-xs truncate ${isActive ? 'text-accent font-medium' : 'text-white'}`}>
                            {track.title}
                          </p>
                          <p className="text-[11px] text-muted truncate">{track.artist}</p>
                        </div>
                        <span className="text-[11px] font-mono tabular-nums text-muted flex-shrink-0">
                          {formatDuration(track.duration)}
                        </span>
                      </button>
                    );
                  })}
                  <div className="border-t border-base-700/60 px-3 py-2 text-[11px] text-muted">
                    Press <span className="font-mono text-soft">Enter</span> for all results
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            {(['ytdlp', 'spotify'] as const).map((option) => (
              <button
                key={option}
                onClick={() => handleEngineChange(option)}
                disabled={savingEngine || !engine}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  engine === option
                    ? 'bg-accent/10 border-accent/40 text-accent'
                    : 'bg-base-800 border-base-600 text-muted hover:text-white'
                } disabled:opacity-60`}
              >
                {!engine ? 'Loading' : option === 'ytdlp' ? 'YouTube' : 'Spotify'}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted sm:text-right">
            {!engine
              ? 'Loading search engine'
              : engine === 'ytdlp'
                ? 'Direct YouTube search'
                : 'Spotify metadata search'}
          </p>
        </div>

        <div className="mt-2 min-h-5">
          {searched && fromCache ? (
            <div className="flex items-center gap-1.5 text-xs text-accent">
              <Zap size={11} />
              <span>Cached match included</span>
            </div>
          ) : recentSearches.length > 0 && !searched && !query.trim() ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">Recent</span>
              {recentSearches.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => runRecentSearch(item)}
                  className="rounded-lg border border-base-600 bg-base-800 px-2.5 py-1 text-xs text-muted hover:text-white hover:border-base-500 transition-colors"
                >
                  {item}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {playlistUrl && (
          <div className="mt-3 flex flex-col gap-3 rounded-lg border border-base-600/70 bg-base-800 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Playlist URL detected</p>
              <p className="text-xs text-muted mt-0.5">Import it into a local Noctune playlist.</p>
            </div>
            <button
              onClick={handleImportPlaylist}
              disabled={importing}
              className="btn-accent px-4 py-2 text-xs"
            >
              {importing ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              {importing ? 'Importing' : 'Import'}
            </button>
          </div>
        )}

        {importMessage && (
          <div
            className={`mt-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              importMessage.ok
                ? 'bg-green-500/10 text-green-400 border-green-500/20'
                : 'bg-red-500/10 text-red-400 border-red-500/20'
            }`}
          >
            {importMessage.ok ? <CheckCircle size={14} /> : <XCircle size={14} />}
            {importMessage.text}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6 sm:px-6 lg:px-9">
        {!searched && !isSearching && (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-muted">
            <div className="w-14 h-14 rounded-xl bg-base-800 border border-base-600/30 flex items-center justify-center">
              <Music size={28} strokeWidth={1.2} />
            </div>
            <p className="text-sm">Start with a song, artist, or mood.</p>
          </div>
        )}

        {searched && results.length === 0 && !isSearching && (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-muted">
            <p className="text-sm">No results for "{query}"</p>
            {engine && (
              <button
                type="button"
                onClick={() => handleEngineChange(engine === 'ytdlp' ? 'spotify' : 'ytdlp')}
                className="btn-accent px-4 py-2 text-xs"
              >
                Try {engine === 'ytdlp' ? 'Spotify' : 'YouTube'} search
              </button>
            )}
          </div>
        )}

        {results.map((track, i) => {
          const isActive =
            currentTrack?.id === track.id ||
            Boolean(currentTrack?.spotifyId && track.spotifyId && currentTrack.spotifyId === track.spotifyId);
          return (
            <div
              key={`${track.id}-${track.spotifyId ?? 'yt'}-${i}`}
              className={`track-row group animate-fade-in ${isActive ? 'active' : ''}`}
              style={{ animationDelay: `${i * 30}ms` }}
              onClick={() => handlePlay(track)}
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
                <div className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted">
                  {track.artistId ? (
                    <button
                      type="button"
                      className="truncate text-left transition-colors hover:text-accent"
                      onClick={(event) => {
                        event.stopPropagation();
                        setView('artist', track.artistId);
                      }}
                      title={`Go to artist: ${track.artist}`}
                    >
                      {track.artist}
                    </button>
                  ) : canNavigateToChannel(track) ? (
                    <button
                      type="button"
                      className="truncate text-left transition-colors hover:text-accent"
                      onClick={(event) => {
                        event.stopPropagation();
                        navigateToChannel(track, setView);
                      }}
                      title={`Go to channel: ${track.artist}`}
                    >
                      {track.artist}
                    </button>
                  ) : (
                    <span className="truncate">{track.artist}</span>
                  )}
                  {track.album && (
                    <>
                      <span className="text-base-600">•</span>
                      {track.albumId ? (
                        <button
                          type="button"
                          className="truncate text-left transition-colors hover:text-accent"
                          onClick={(event) => {
                            event.stopPropagation();
                            setView('album', track.albumId);
                          }}
                          title={`Go to album: ${track.album}`}
                        >
                          {track.album}
                        </button>
                      ) : (
                        <span className="truncate">{track.album}</span>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-shrink-0 items-center gap-1">
                <TrackActionButtons
                  track={track}
                  className="hidden sm:flex items-center justify-end gap-0 opacity-0 group-hover:opacity-100 transition-opacity"
                />

                <span className="block w-12 text-right text-xs font-mono tabular-nums text-muted flex-shrink-0">
                  {formatDuration(track.duration)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
