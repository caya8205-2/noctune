import { useEffect, useRef, useState } from 'react';
import { Camera, Image as ImageIcon, Loader2, X } from 'lucide-react';
import jsQR from 'jsqr';

interface QrScannerModalProps {
  open: boolean;
  onClose: () => void;
  onScan: (rawValue: string) => void;
}

export function QrScannerModal({ open, onClose, onScan }: QrScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastScanRef = useRef<number>(0);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [processingImage, setProcessingImage] = useState(false);

  function stopCamera() {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  useEffect(() => {
    if (!open) {
      stopCamera();
      return;
    }

    let active = true;
    setCameraError(null);
    setDetecting(true);
    setProcessingImage(false);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let scanning = false;

    async function startCamera() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          if (active) {
            setCameraError('Camera access not supported on this browser or device.');
            setDetecting(false);
          }
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
        });

        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }

        if (active) {
          setDetecting(false);
        }

        const scanLoop = () => {
          if (!active) return;
          const video = videoRef.current;
          if (
            video &&
            video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
            video.videoWidth > 0 &&
            !scanning
          ) {
            const now = performance.now();
            if (now - lastScanRef.current >= 100) {
              lastScanRef.current = now;
              scanning = true;
              try {
                const width = video.videoWidth;
                const height = video.videoHeight;
                if (canvas.width !== width || canvas.height !== height) {
                  canvas.width = width;
                  canvas.height = height;
                }
                if (ctx) {
                  ctx.drawImage(video, 0, 0, width, height);
                  const imageData = ctx.getImageData(0, 0, width, height);
                  const code = jsQR(imageData.data, width, height, {
                    inversionAttempts: 'dontInvert',
                  });
                  if (code && code.data) {
                    stopCamera();
                    onScan(code.data);
                    onClose();
                    return;
                  }
                }
              } catch {
                // Ignore transient frame decoding hiccups
              } finally {
                scanning = false;
              }
            }
          }
          if (active) {
            animFrameRef.current = requestAnimationFrame(scanLoop);
          }
        };

        animFrameRef.current = requestAnimationFrame(scanLoop);
      } catch (err) {
        if (active) {
          setCameraError((err as Error).message || 'Unable to access camera.');
          setDetecting(false);
        }
      }
    }

    startCamera();

    return () => {
      active = false;
      stopCamera();
    };
  }, [open, onClose, onScan]);

  async function handleFileScan(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setProcessingImage(true);
    setCameraError(null);

    try {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load selected image.'));
        img.src = objectUrl;
      });
      URL.revokeObjectURL(objectUrl);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        setCameraError('Failed to initialize image canvas.');
        return;
      }

      // Multi-scale decoding: try multiple resolutions to handle high-res phone cameras
      const tryDecodeAtScale = (maxDim: number) => {
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if (w > maxDim || h > maxDim) {
          const scale = Math.min(maxDim / w, maxDim / h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(img, 0, 0, w, h);
        const imgData = ctx.getImageData(0, 0, w, h);
        return jsQR(imgData.data, w, h, { inversionAttempts: 'attemptBoth' });
      };

      let code = tryDecodeAtScale(1000);
      if (!code) code = tryDecodeAtScale(700);
      if (!code) code = tryDecodeAtScale(500);
      if (!code) code = tryDecodeAtScale(1400);

      if (code && code.data) {
        stopCamera();
        onScan(code.data);
        onClose();
      } else {
        setCameraError('No QR code detected in the selected image. Please try another photo or ensure the code is clear.');
      }
    } catch (err) {
      setCameraError((err as Error).message || 'Failed to parse image QR code.');
    } finally {
      setProcessingImage(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-sm rounded-2xl border border-white/[0.08] bg-base-900 p-5 shadow-2xl flex flex-col items-center">
        {/* Header */}
        <div className="flex w-full items-center justify-between pb-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2">
            <Camera size={18} className="text-accent" />
            <span className="text-sm font-semibold text-white">Scan Pairing QR</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:text-white transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Viewfinder Area */}
        <div className="relative mt-4 w-full aspect-square rounded-xl overflow-hidden bg-black flex items-center justify-center border border-white/10">
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full h-full object-cover"
          />

          {/* Scanner frame overlay - only shown while camera is active and error-free */}
          {!cameraError && (
            <div className="absolute inset-8 rounded-xl border-2 border-dashed border-accent/70 pointer-events-none shadow-[0_0_20px_rgba(234,177,76,0.3)] animate-pulse" />
          )}

          {/* Detecting / Image processing indicator */}
          {(detecting || processingImage) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60">
              <Loader2 size={24} className="animate-spin text-accent" />
              {processingImage && (
                <span className="text-xs text-soft">Scanning image...</span>
              )}
            </div>
          )}

          {/* Error Message with tap-to-dismiss */}
          {cameraError && (
            <div
              onClick={() => setCameraError(null)}
              className="absolute inset-0 z-20 flex flex-col items-center justify-center p-5 bg-black/85 text-center cursor-pointer select-none"
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCameraError(null);
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/15 text-red-400 mb-2.5 hover:bg-red-500/25 active:scale-95 transition-all touch-manipulation"
                title="Dismiss error"
                aria-label="Dismiss error"
              >
                <X size={20} />
              </button>
              <p className="text-xs text-red-300 leading-relaxed font-medium max-w-[220px]">
                {cameraError}
              </p>
              <span className="mt-3 text-[11px] text-muted underline">
                Tap to dismiss
              </span>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="mt-4 flex w-full items-center justify-between gap-2.5">
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            onChange={handleFileScan}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={processingImage}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-base-800/80 px-3.5 py-2.5 text-xs font-semibold text-soft hover:text-white hover:bg-base-800 transition-colors disabled:opacity-50"
          >
            <ImageIcon size={15} />
            <span>Choose from Gallery</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-white/10 bg-base-950 px-3.5 py-2.5 text-xs font-semibold text-muted hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>

        <p className="mt-3 text-[11px] text-muted text-center leading-relaxed">
          Point camera at the QR code displayed in Noctune Desktop Settings &rarr; Mobile Companion.
        </p>
      </div>
    </div>
  );
}
