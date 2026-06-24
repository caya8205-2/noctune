import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, Download, Loader2, Music, Search, Wrench, XCircle, Zap } from 'lucide-react';
import { api, apiUrl, type DebugMatchResult, type Track } from '../../utils/api';
import { formatDuration } from '../../utils/format';
import { usePlayerStore } from '../../store/player';
import { TrackActionButtons } from '../ui/TrackActionButtons';

interface SettingsData {
  searchEngine: 'ytdlp' | 'spotify';
}

const RECENT_SEARCHES_KEY = 'noctune:recent-searches';
const DEBUG_SEARCH_KEY = 'noctune:debug-search-scoring';
const SEARCH_RESULT_LIMIT = 25;

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
  const [debugSearch, setDebugSearch] = useState(false);
  const [debugBusyId, setDebugBusyId] = useState<string | null>(null);
  const [debugResult, setDebugResult] = useState<{ source: Track; result: DebugMatchResult } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
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
    setDebugSearch(localStorage.getItem(DEBUG_SEARCH_KEY) === '1');
  }, []);

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
      if (query.trim()) void doSearch(query);
    } catch (err) {
      console.error('Search engine save failed:', err);
      setEngine(previous);
    } finally {
      setSavingEngine(false);
    }
  }

  const doSearch = useCallback(async (q: string) => {
    const cleanQuery = q.trim();
    if (!cleanQuery) {
      setResults([]);
      setSearched(false);
      return;
    }
    setIsSearching(true);
    try {
      const res = await api.search(cleanQuery, SEARCH_RESULT_LIMIT);
      setResults(res.tracks);
      setDebugResult(null);
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
    debounceRef.current = setTimeout(() => doSearch(val), 400);
  }

  function runRecentSearch(value: string) {
    setQuery(value);
    clearTimeout(debounceRef.current);
    void doSearch(value);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      clearTimeout(debounceRef.current);
      doSearch(query);
    }
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

  async function handleDebugMatch(track: Track) {
    setDebugBusyId(track.id);
    try {
      const result = await api.debugMatch(track, 10);
      setDebugResult({ source: track, result });
    } catch (err) {
      console.error('Debug match failed:', err);
    } finally {
      setDebugBusyId(null);
    }
  }

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

        <div className="relative">
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
          {isSearching && (
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted">
              <Loader2 size={14} className="animate-spin" />
            </span>
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

        {debugSearch && (
          <div className="mt-2 rounded-lg border border-base-600/70 bg-base-900 px-3 py-2 text-xs text-muted">
            Debug mode is on. Use the debug button on Spotify results to inspect YouTube candidate scoring.
          </div>
        )}

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
        {debugSearch && debugResult && (
          <div className="mb-4 rounded-lg border border-accent/25 bg-base-900 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="section-label text-accent">Scoring debug</p>
                <p className="text-sm font-semibold text-white truncate mt-1">
                  {debugResult.source.title}
                </p>
                <p className="text-xs text-muted truncate mt-1">{debugResult.result.query}</p>
              </div>
              {debugResult.result.cached && (
                <span className="rounded-full border border-base-600 px-2 py-1 text-[10px] uppercase tracking-wide text-muted">
                  Cached {debugResult.result.cached.score}
                </span>
              )}
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {debugResult.result.candidates.slice(0, 5).map((candidate, index) => (
                <div key={candidate.track.id} className="rounded-lg border border-base-600/60 bg-base-950 px-3 py-2">
                  <div className="flex items-center gap-3">
                    <span className="w-5 text-xs text-muted">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-white truncate">{candidate.track.title}</p>
                      <p className="text-[11px] text-muted truncate">{candidate.track.artist}</p>
                    </div>
                    <span className="font-mono text-xs text-accent">{candidate.score}</span>
                  </div>
                  <p className="mt-1 pl-8 text-[11px] text-muted truncate">
                    {candidate.reasons.length > 0 ? candidate.reasons.join(', ') : 'no scoring reasons'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

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
                  trailingActions={
                    debugSearch && track.spotifyId ? (
                      <button
                        type="button"
                        className="btn-ghost p-1.5"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDebugMatch(track);
                        }}
                        title="Debug YouTube match"
                      >
                        {debugBusyId === track.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Wrench size={14} />
                        )}
                      </button>
                    ) : null
                  }
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
