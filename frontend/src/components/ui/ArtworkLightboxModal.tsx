import { useEffect, useState } from 'react';
import { Check, Download, Loader2, Maximize2, Minus, Plus, RotateCcw, X } from 'lucide-react';
import { api } from '../../utils/api';

interface ArtworkLightboxProps {
  imageUrl: string;
  title: string;
  artist: string;
  album?: string | null;
  onClose: () => void;
}

export function ArtworkLightboxModal({
  imageUrl,
  title,
  artist,
  album,
  onClose,
}: ArtworkLightboxProps) {
  const [downloading, setDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    setZoom(1);
  }, [imageUrl]);

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
        const res = await api.downloadArtwork(imageUrl, title, artist);
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
        const response = await fetch(imageUrl, { mode: 'cors' });
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
          img.src = imageUrl;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 lg:p-8">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/85 backdrop-blur-md transition-opacity animate-fade-in"
        onClick={onClose}
      />

      {/* Main Lightbox Content */}
      <div className="relative z-10 flex flex-col items-center max-w-4xl max-h-[90vh] w-full bg-base-950/90 border border-white/10 rounded-2xl p-4 sm:p-6 shadow-2xl overflow-hidden animate-slide-up">
        {/* Header Controls */}
        <div className="flex items-center justify-between w-full mb-3 pb-3 border-b border-white/10">
          <div className="flex items-center gap-2 text-xs font-semibold text-accent">
            <Maximize2 size={15} />
            <span>Artwork Viewport</span>
          </div>
          <div className="flex items-center gap-3">
            {downloadSuccess && savedPath && (
              <span className="text-xs font-medium text-emerald-400/90 truncate max-w-xs sm:max-w-md animate-fade-in" title={`Saved to ${savedPath}`}>
                Saved to {savedPath}
              </span>
            )}
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className={
                downloadSuccess
                  ? 'btn-ghost flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-xl border border-emerald-500/40 text-emerald-400 bg-emerald-500/10'
                  : 'btn-accent flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-xl disabled:opacity-50'
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
              className="btn-ghost p-1.5 text-muted hover:text-white rounded-lg"
              title="Close (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* High-Res Image Viewport */}
        <div
          className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden rounded-xl border border-white/5 bg-black/40 p-2"
          onWheel={(event) => {
            event.preventDefault();
            setZoom((current) => Math.min(3, Math.max(1, current - event.deltaY * 0.001)));
          }}
        >
          <img
            src={imageUrl}
            alt={title}
            className="max-h-[65vh] max-w-full select-none object-contain rounded-lg shadow-2xl transition-transform duration-200"
            style={{ transform: `scale(${zoom})` }}
            draggable={false}
          />
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-base-600/60 bg-base-950/90 p-1 shadow-xl backdrop-blur-md">
            <button
              type="button"
              onClick={() => setZoom((current) => Math.max(1, current - 0.25))}
              disabled={zoom <= 1}
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
              onClick={() => setZoom((current) => Math.min(3, current + 0.25))}
              disabled={zoom >= 3}
              className="btn-ghost p-2 disabled:opacity-30"
              title="Zoom in"
            >
              <Plus size={14} />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              disabled={zoom === 1}
              className="btn-ghost p-2 disabled:opacity-30"
              title="Reset zoom"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>

        {/* Footer Track Info */}
        <div className="mt-4 text-center">
          <h3 className="text-base sm:text-lg font-bold text-white leading-tight">{title}</h3>
          <p className="text-xs sm:text-sm text-accent mt-0.5 font-medium">{artist}</p>
          {album && <p className="text-xs text-muted mt-0.5">{album}</p>}
        </div>
      </div>
    </div>
  );
}
