import { useEffect, useRef, useState } from 'react';
import { Check, Download, Loader2, Maximize2, Minus, Plus, RotateCcw, X } from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '../../utils/api';
import { usePlayerStore } from '../../store/player';

interface ArtworkLightboxProps {
  imageUrl: string;
  title: string;
  artist: string;
  album?: string | null;
  onClose: () => void;
}

export function getHighResolutionArtworkUrl(rawUrl: string): string {
  if (!rawUrl) return rawUrl;
  const url = rawUrl.startsWith('//') ? `https:${rawUrl}` : rawUrl;

  // 1. YouTube video thumbnails -> maxresdefault.jpg
  if (url.includes('ytimg.com') || url.includes('youtube.com')) {
    const upgraded = url.replace(
      /\/((?:default|mqdefault|hqdefault|sddefault|maxresdefault))\.jpg(?:\?.*)?$/,
      '/maxresdefault.jpg'
    );
    if (upgraded !== url) return upgraded;
  }

  // 2. Google / YouTube usercontent CDN (Community posts, channel avatars, etc.)
  // Strips cropping (-c, -fcrop64) and dimension restrictions, requesting original uncropped full-resolution asset (=s0)
  if (url.includes('ggpht.com') || url.includes('googleusercontent.com')) {
    if (url.includes('=')) {
      return url.replace(/=[^/]+$/, '=s0');
    }
    return `${url}=s0`;
  }

  // 3. Spotify / generic dimension replacements
  return url.replace(/\/\d+x\d+\//, '/1200x1200/');
}

export function ArtworkLightboxModal({
  imageUrl,
  title,
  artist,
  album,
  onClose,
}: ArtworkLightboxProps) {
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const highResolutionUrl = getHighResolutionArtworkUrl(imageUrl);
  const [displayImageUrl, setDisplayImageUrl] = useState(highResolutionUrl);
  const [downloading, setDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panStartRef = useRef<{ pointerX: number; pointerY: number; panX: number; panY: number } | null>(null);
  const panMovedRef = useRef(false);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setDisplayImageUrl(highResolutionUrl);
  }, [imageUrl, highResolutionUrl]);

  function setZoomLevel(nextZoom: number) {
    const boundedZoom = Math.min(3, Math.max(0.5, nextZoom));
    setZoom(boundedZoom);
    if (boundedZoom === 1) setPan({ x: 0, y: 0 });
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  async function handleDownload() {
    if (downloading) return;
    setDownloading(true);
    setDownloadSuccess(false);

    try {
      try {
        const res = await api.downloadArtwork(displayImageUrl, title, artist);
        if (res.ok) {
          setSavedPath(res.downloadDir || res.file);
          setDownloadSuccess(true);
          setTimeout(() => setDownloadSuccess(false), 3500);
          return;
        }
      } catch (err) {
        console.warn('Backend downloadArtwork API failed, using browser blob fallback:', err);
      }

      const safeArtist = artist.replace(/[/\\?%*:|"<>]/g, '').trim() || 'Artist';
      const safeTitle = title.replace(/[/\\?%*:|"<>]/g, '').trim() || 'Artwork';
      const filename = `${safeArtist} - ${safeTitle} (Artwork).jpg`;
      setSavedPath('Downloads');

      const triggerBlobDownload = (url: string) => {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      };

      try {
        const response = await fetch(displayImageUrl, { mode: 'cors' });
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        triggerBlobDownload(blobUrl);
        URL.revokeObjectURL(blobUrl);
        setDownloadSuccess(true);
        setTimeout(() => setDownloadSuccess(false), 3500);
      } catch (err) {
        try {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = displayImageUrl;
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('Image decode failed'));
          });
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || 640;
          canvas.height = img.naturalHeight || 640;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
            triggerBlobDownload(dataUrl);
            setDownloadSuccess(true);
            setTimeout(() => setDownloadSuccess(false), 3500);
          } else {
            triggerBlobDownload(imageUrl);
            setDownloadSuccess(true);
            setTimeout(() => setDownloadSuccess(false), 3500);
          }
        } catch (canvasErr) {
          console.warn('Canvas fallback failed, triggering direct link:', canvasErr);
          const link = document.createElement('a');
          link.href = imageUrl;
          link.target = '_blank';
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setDownloadSuccess(true);
          setTimeout(() => setDownloadSuccess(false), 3500);
        }
      }
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md animate-fade-in" onClick={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div
        className="relative flex h-full w-full flex-col overflow-hidden"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        {/* Header Controls */}
        <div className="absolute left-4 right-4 top-4 z-20 flex items-start justify-between gap-3 sm:left-6 sm:right-6 sm:top-6">
          <div className="rounded-xl border border-white/10 bg-base-950/75 px-3 py-2 text-xs font-semibold text-accent shadow-xl backdrop-blur-md">
            <span className="flex items-center gap-2"><Maximize2 size={15} />Artwork Viewport</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-base-950/75 p-1.5 shadow-xl backdrop-blur-md">
            {downloadSuccess && savedPath && (
              <span className="hidden max-w-xs truncate px-2 text-xs font-medium text-emerald-400/90 sm:block" title={`Saved to ${savedPath}`}>
                Saved to {savedPath}
              </span>
            )}
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className={
                downloadSuccess
                  ? 'btn-ghost flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-emerald-500/40 text-emerald-400 bg-emerald-500/10'
                  : 'btn-accent flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg disabled:opacity-50'
              }
              title="Download full resolution artwork"
            >
              {downloading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Downloading...</span>
                </>
              ) : downloadSuccess ? (
                <>
                  <Check size={14} className="text-emerald-400" />
                  <span>Artwork Saved</span>
                </>
              ) : (
                <>
                  <Download size={14} />
                  <span>Download Artwork</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost p-2 text-muted hover:text-white rounded-lg"
              title="Close (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* High-Res Image Viewport */}
        <div
          className="relative flex h-full w-full touch-none items-center justify-center overflow-hidden p-4 sm:p-8"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              if (panMovedRef.current) {
                panMovedRef.current = false;
                return;
              }
              onClose();
            }
          }}
          onPointerDown={(event) => {
            if (zoom === 1) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            panMovedRef.current = false;
            panStartRef.current = { pointerX: event.clientX, pointerY: event.clientY, panX: pan.x, panY: pan.y };
          }}
          onPointerMove={(event) => {
            const start = panStartRef.current;
            if (!start) return;
            if (Math.abs(event.clientX - start.pointerX) > 3 || Math.abs(event.clientY - start.pointerY) > 3) {
              panMovedRef.current = true;
            }
            setPan({ x: start.panX + event.clientX - start.pointerX, y: start.panY + event.clientY - start.pointerY });
          }}
          onPointerUp={(event) => {
            panStartRef.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => { panStartRef.current = null; }}
          onWheel={(event) => {
            setZoomLevel(zoom - event.deltaY * 0.001);
          }}
        >
          <img
            src={displayImageUrl}
            alt={title}
            className={clsx('max-h-[58vh] max-w-[62vw] select-none object-contain shadow-2xl transition-none sm:max-h-[64vh] sm:max-w-[68vw]', zoom !== 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in')}
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
            onClick={() => {
              if (panMovedRef.current) {
                panMovedRef.current = false;
                return;
              }
              setZoomLevel(zoom >= 3 ? 1 : zoom + 0.5);
            }}
            draggable={false}
            onError={() => {
              if (displayImageUrl !== imageUrl) setDisplayImageUrl(imageUrl);
            }}
          />
          <div
            className={clsx(
              'absolute left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-base-600/60 bg-base-950/95 p-1 shadow-xl backdrop-blur-md',
              currentTrack ? 'bottom-20' : 'bottom-3'
            )}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setZoomLevel(zoom - 0.25)}
              disabled={zoom <= 0.5}
              className="btn-ghost p-2 disabled:opacity-30"
              title="Zoom out"
            >
              <Minus size={14} />
            </button>
            <span className="min-w-12 text-center font-mono text-[11px] tabular-nums text-soft">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoomLevel(zoom + 0.25)}
              disabled={zoom >= 3}
              className="btn-ghost p-2 disabled:opacity-30"
              title="Zoom in"
            >
              <Plus size={14} />
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel(1)}
              disabled={zoom === 1}
              className="btn-ghost p-2 disabled:opacity-30"
              title="Reset zoom"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>

        {/* Footer Track Info */}
        <div className={clsx(
          'absolute left-4 right-4 z-20 text-center pointer-events-none',
          currentTrack ? 'bottom-32' : 'bottom-14'
        )}>
          <div className="mx-auto w-fit max-w-[min(90vw,48rem)] rounded-xl border border-white/10 bg-base-950/75 px-4 py-2 shadow-xl backdrop-blur-md">
            <h3 className="text-base font-bold leading-tight text-white sm:text-lg">{title}</h3>
            <p className="mt-0.5 text-xs font-medium text-accent sm:text-sm">{artist}</p>
            {album && <p className="mt-0.5 text-xs text-muted">{album}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
