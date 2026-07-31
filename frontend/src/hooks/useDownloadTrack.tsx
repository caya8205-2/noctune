import { useState, useCallback, createContext, useContext, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { api, type Track } from '../utils/api';

interface DownloadToastState {
  id: string;
  title: string;
  artist: string;
  status: 'downloading' | 'completed' | 'error';
  message: string;
}

interface DownloadContextType {
  downloadTrack: (track: Track) => Promise<void>;
  downloadingIds: Set<string>;
  downloadedIds: Set<string>;
}

const DownloadContext = createContext<DownloadContextType | null>(null);

export function DownloadProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<DownloadToastState | null>(null);
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());

  const downloadTrack = useCallback(async (track: Track) => {
    const trackId = track.id;
    if (downloadingIds.has(trackId)) return;

    setDownloadingIds((prev) => new Set(prev).add(trackId));
    setToast({
      id: trackId,
      title: track.title,
      artist: track.artist,
      status: 'downloading',
      message: `Downloading "${track.title}" to Downloads folder...`,
    });

    try {
      const res = await api.downloadTracks([track]);
      if (res.failed && res.failed.length > 0) {
        throw new Error(res.failed[0]?.reason || 'Download failed');
      }

      setDownloadedIds((prev) => new Set(prev).add(trackId));
      setTimeout(() => {
        setDownloadedIds((prev) => {
          const next = new Set(prev);
          next.delete(trackId);
          return next;
        });
      }, 3000);

      setToast({
        id: trackId,
        title: track.title,
        artist: track.artist,
        status: 'completed',
        message: `Saved "${track.title}" to Downloads folder!`,
      });

      // Auto dismiss completed toast after 3.5s
      setTimeout(() => {
        setToast((current) => (current?.id === trackId ? null : current));
      }, 3500);

    } catch (err) {
      setToast({
        id: trackId,
        title: track.title,
        artist: track.artist,
        status: 'error',
        message: `Failed to download "${track.title}": ${(err as Error).message}`,
      });
      setTimeout(() => {
        setToast((current) => (current?.id === trackId ? null : current));
      }, 4000);
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(trackId);
        return next;
      });
    }
  }, [downloadingIds]);

  return (
    <DownloadContext.Provider value={{ downloadTrack, downloadingIds, downloadedIds }}>
      {children}
      {toast && createPortal(
        <div className="fixed bottom-20 right-6 z-[9999] flex w-80 items-center gap-3 rounded-xl border border-white/10 bg-base-900/95 p-4 shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-5 duration-200">
          <div className="flex-shrink-0">
            {toast.status === 'downloading' && (
              <Loader2 size={20} className="animate-spin text-accent" />
            )}
            {toast.status === 'completed' && (
              <CheckCircle2 size={20} className="text-emerald-400" />
            )}
            {toast.status === 'error' && (
              <AlertCircle size={20} className="text-red-400" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <span className="truncate text-xs font-semibold text-white">
                {toast.status === 'downloading'
                  ? 'Downloading Audio Cache'
                  : toast.status === 'completed'
                  ? 'Download Completed'
                  : 'Download Failed'}
              </span>
              <button onClick={() => setToast(null)} className="text-muted hover:text-white">
                <X size={14} />
              </button>
            </div>
            <p className="mt-0.5 truncate text-xs text-soft">{toast.message}</p>
          </div>
        </div>,
        document.body
      )}
    </DownloadContext.Provider>
  );
}

export function useDownloadTrack() {
  const ctx = useContext(DownloadContext);
  if (!ctx) {
    throw new Error('useDownloadTrack must be used within a DownloadProvider');
  }
  return ctx;
}
