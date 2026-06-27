import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Trash2, X } from 'lucide-react';
import { api, type ClearTrackCacheResult, type Track } from '../utils/api';

type PendingState = {
  track: Track;
  onCleared?: (result: ClearTrackCacheResult) => void;
};

export function useClearTrackCache() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingState | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function requestClearTrackCache(track: Track, onCleared?: (result: ClearTrackCacheResult) => void) {
    setMessage(null);
    setPending({ track, onCleared });
  }

  async function confirmClear() {
    if (!pending) return;
    setIsClearing(true);
    setMessage(null);
    try {
      const result = await api.clearTrackCache(pending.track);
      pending.onCleared?.(result);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['history'] }),
        queryClient.invalidateQueries({ queryKey: ['home'] }),
        queryClient.invalidateQueries({ queryKey: ['playlist'] }),
        queryClient.invalidateQueries({ queryKey: ['playlists'] }),
        queryClient.invalidateQueries({ queryKey: ['audio-cache-status'] }),
      ]);
      setPending(null);
    } catch (err) {
      setMessage((err as Error).message || 'Failed to clear track cache.');
    } finally {
      setIsClearing(false);
    }
  }

  const clearTrackCacheModal = pending ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => !isClearing && setPending(null)}
        aria-label="Cancel clear track cache"
      />
      <div className="surface-panel relative z-10 w-full max-w-md animate-slide-up p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="section-label text-accent">Track cache</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Clear cached data?</h2>
          </div>
          <button
            type="button"
            onClick={() => setPending(null)}
            disabled={isClearing}
            className="btn-ghost p-2"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>
        <p className="text-sm leading-relaxed text-soft">
          Noctune will clear cached resolver, audio, and match data for this track. The track stays in your lists and will be resolved again next time.
        </p>
        <div className="mt-4 rounded-lg border border-base-600/60 bg-base-950/70 px-3 py-2">
          <p className="truncate text-sm font-medium text-white">{pending.track.title}</p>
          <p className="mt-0.5 truncate text-xs text-muted">{pending.track.artist}</p>
        </div>
        {message && (
          <p className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {message}
          </p>
        )}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setPending(null)}
            disabled={isClearing}
            className="btn-ghost border border-base-600/40 px-4 py-2 text-xs disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              confirmClear();
            }}
            disabled={isClearing}
            className="btn-accent px-4 py-2 text-xs disabled:opacity-40"
          >
            {isClearing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            {isClearing ? 'Clearing' : 'Clear cache'}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { requestClearTrackCache, clearTrackCacheModal };
}
