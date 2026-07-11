import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, type ClearTrackCacheResult, type Track } from '../utils/api';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

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

  const clearTrackCacheModal = (
    <>
      <ConfirmDialog
        open={Boolean(pending)}
        eyebrow="Track cache"
        title="Clear cached data?"
        description={
          message
            ? message
            : 'Noctune will clear cached resolver, audio, and match data for this track. The track stays in your lists and will be resolved again next time.'
        }
        detail={
          pending
            ? { title: pending.track.title, subtitle: pending.track.artist }
            : null
        }
        confirmLabel="Clear cache"
        destructive={false}
        loading={isClearing}
        onConfirm={confirmClear}
        onCancel={() => !isClearing && setPending(null)}
      />
    </>
  );

  return { requestClearTrackCache, clearTrackCacheModal };
}
