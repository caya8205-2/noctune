import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, Clock, Download, Loader2, Music, Play, Search, XCircle, Zap } from 'lucide-react';
import { api, type Track } from '../../utils/api';
import { formatDuration } from '../../utils/format';
import { usePlayerStore } from '../../store/player';
import { API_BASE } from '../../utils/api';

interface SettingsData {
  searchEngine: 'ytdlp' | 'spotify';
}

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
  const [results, setResults] = useState<Track[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [searched, setSearched] = useState(false);
  const [engine, setEngine] = useState<'ytdlp' | 'spotify' | null>(null);
  const [savingEngine, setSavingEngine] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const playlistUrl = useMemo(() => isPlaylistUrl(query), [query]);

  const { playTrack, currentTrack, isPlaying } = usePlayerStore();

  useEffect(() => {
    fetch(API_BASE + '/settings')
      .then((r) => r.json())
      .then((data: SettingsData) => setEngine(data.searchEngine))
      .catch(console.error);
  }, []);

  async function handleEngineChange(nextEngine: 'ytdlp' | 'spotify') {
    if (nextEngine === engine || savingEngine) return;
    const previous = engine;
    setEngine(nextEngine);
    setSavingEngine(true);
    try {
      await fetch(API_BASE + '/settings', {
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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-9 pt-8 pb-5">
        <div className="flex items-end justify-between gap-4 mb-5">
          <div>
            <p className="section-label mb-2 text-accent">Search</p>
            <h1 className="text-4xl font-bold text-white leading-tight">Find a seed track.</h1>
          </div>
          {searched && (
            <span className="text-xs text-muted">
              {results.length} result{results.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        <div className="relative max-w-3xl">
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
            <Loader2
              size={14}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted animate-spin"
            />
          )}
        </div>

        <div className="flex items-center justify-between max-w-3xl mt-3 gap-3">
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
          <p className="text-xs text-muted">
            {!engine
              ? 'Loading search engine'
              : engine === 'ytdlp'
                ? 'Direct YouTube search'
                : 'Spotify metadata search'}
          </p>
        </div>

        {searched && fromCache && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-accent">
            <Zap size={11} />
            <span>Instant from cache</span>
          </div>
        )}

        {playlistUrl && (
          <div className="max-w-3xl mt-3 rounded-lg border border-base-600/70 bg-base-800 p-3 flex items-center justify-between gap-3">
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
              Import
            </button>
          </div>
        )}

        {importMessage && (
          <div
            className={`max-w-3xl mt-3 flex items-center gap-2 text-sm px-3 py-2 rounded-lg border ${
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

      <div className="flex-1 overflow-y-auto px-7 pb-6">
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
              className={`track-row group animate-fade-in max-w-3xl ${isActive ? 'active' : ''}`}
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
