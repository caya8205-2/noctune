import { useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { api, type ClearTrackCacheResult, type Track } from '../utils/api';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

type PendingState = {
  track: Track;
  onCleared?: (result: ClearTrackCacheResult) => void;
};

type ToastState = {
  title: string;
  message: string;
};

export function useClearTrackCache() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingState | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  function requestClearTrackCache(track: Track, onCleared?: (result: ClearTrackCacheResult) => void) {
    setMessage(null);
    setPending({ track, onCleared });
  }

  async function confirmClear() {
    if (!pending) return;
    const currentTrack = pending.track;
    setIsClearing(true);
    setMessage(null);
    try {
      const result = await api.clearTrackCache(currentTrack);
      pending.onCleared?.(result);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['history'] }),
        queryClient.invalidateQueries({ queryKey: ['home'] }),
        queryClient.invalidateQueries({ queryKey: ['playlist'] }),
        queryClient.invalidateQueries({ queryKey: ['playlists'] }),
        queryClient.invalidateQueries({ queryKey: ['audio-cache-status'] }),
      ]);
      setPending(null);
      setToast({
        title: 'Cache Cleared',
        message: `Cleared resolver, match, and audio cache for "${currentTrack.title}"`,
      });
      setTimeout(() => setToast(null), 3500);
    } catch (err) {
      setMessage((err as Error).message || 'Failed to clear track cache.');
    } finally {
      setIsClearing(false);
    }
  }

  const clearTrackCacheModal = (
    <>
      {pending && createPortal(
        <ConfirmDialog
          open={Boolean(pending)}
          eyebrow="Track cache"
          title="Clear cached data?"
          description={
            message
              ? message
              : 'Noctune will clear cached resolver, audio, and match data for this track. The track stays in your lists and will be resolved again next time.'
          }
          detail={{ title: pending.track.title, subtitle: pending.track.artist }}
          confirmLabel="Clear cache"
          destructive={false}
          loading={isClearing}
          onConfirm={confirmClear}
          onCancel={() => !isClearing && setPending(null)}
        />,
        document.body
      )}

      {toast && createPortal(
        <div className="fixed bottom-20 right-6 z-[9999] flex w-80 items-center gap-3 rounded-xl border border-white/10 bg-base-900/95 p-4 shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-5 duration-200">
          <div className="flex-shrink-0">
            <CheckCircle2 size={20} className="text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <span className="truncate text-xs font-semibold text-white">{toast.title}</span>
              <button onClick={() => setToast(null)} className="text-muted hover:text-white">
                <X size={14} />
              </button>
            </div>
            <p className="mt-0.5 truncate text-xs text-soft">{toast.message}</p>
          </div>
        </div>,
        document.body
      )}
    </>
  );

  return { requestClearTrackCache, clearTrackCacheModal };
}
