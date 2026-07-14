import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { SlidersHorizontal, Volume2, VolumeX } from 'lucide-react';
import { clsx } from 'clsx';
import { useEqualizer, EQ_BANDS, PRESETS, PRESET_LABELS } from '../../hooks/useEqualizer';
import { usePlayerStore } from '../../store/player';

interface EqualizerViewProps {
  onClose?: () => void;
}

function getClientY(e: MouseEvent | TouchEvent): number {
  if ('touches' in e && e.touches.length > 0) return e.touches[0].clientY;
  return (e as MouseEvent).clientY;
}

export function EqualizerView({ onClose }: EqualizerViewProps) {
  const {
    eqEnabled,
    eqBands,
    eqPreset,
    setEqEnabled,
    setEqBand,
  } = useEqualizer();

  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const sliderDrag = useRef<{
    index: number;
    rect: DOMRect;
  } | null>(null);
  const dragValue = useRef(0);

  // Direct DOM refs for slider visual elements — bypass React during drag
  const thumbRefs = useRef<(HTMLDivElement | null)[]>([]);
  const fillAboveRefs = useRef<(HTMLDivElement | null)[]>([]);
  const fillBelowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const labelRefs = useRef<(HTMLSpanElement | null)[]>([]);

  const applyDragVisual = useCallback((index: number, db: number) => {
    const pct = ((db + 6) / 12) * 100;
    const thumb = thumbRefs.current[index];
    const fillAbove = fillAboveRefs.current[index];
    const fillBelow = fillBelowRefs.current[index];
    const vlabel = labelRefs.current[index];
    if (thumb) thumb.style.top = `${100 - pct}%`;
    if (fillAbove) fillAbove.style.height = db > 0 ? `${(db / 6) * 50}%` : '0%';
    if (fillBelow) fillBelow.style.height = db < 0 ? `${(-db / 6) * 50}%` : '0%';
    if (vlabel) vlabel.textContent = db > 0 ? `+${db}` : `${db}`;
  }, []);

  const pendingPresetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingBandsRef = useRef<number[] | null>(null);

  // Re-apply target slider positions after each React render (caused by eqPreset update)
  // so CSS transitions animate from the old (React-committed) position to the target.
  useLayoutEffect(() => {
    if (pendingBandsRef.current) {
      pendingBandsRef.current.forEach((db, i) => applyDragVisual(i, db));
    }
  });

  const animateBands = useCallback((gains: number[], presetKey: string) => {
    if (pendingPresetRef.current) {
      clearTimeout(pendingPresetRef.current);
    }
    pendingBandsRef.current = gains;
    usePlayerStore.setState({ eqPreset: presetKey });
    pendingPresetRef.current = setTimeout(() => {
      pendingPresetRef.current = null;
      pendingBandsRef.current = null;
      usePlayerStore.getState().setEqBands(gains, presetKey);
    }, 200);
  }, [applyDragVisual]);

  const handleSliderStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent, index: number) => {
      if (!eqEnabled) return;
      e.preventDefault();

      // Cancel any pending preset animation
      if (pendingPresetRef.current) {
        clearTimeout(pendingPresetRef.current);
        pendingPresetRef.current = null;
      }
      pendingBandsRef.current = null;
      const track = e.currentTarget as HTMLElement;
      const rect = track.getBoundingClientRect();

      function val(clientY: number) {
        const relY = clientY - rect.top;
        const pct = Math.max(0, Math.min(1, 1 - relY / rect.height));
        return Math.min(6, Math.max(-6, Math.round(pct * 12 - 6)));
      }

      const initial = val(getClientY(e.nativeEvent));
      dragValue.current = initial;
      applyDragVisual(index, initial);
      setDraggingIndex(index);

      sliderDrag.current = { index, rect };

      const onMove = (ev: MouseEvent | TouchEvent) => {
        ev.preventDefault();
        if (!sliderDrag.current) return;
        const db = val(getClientY(ev));
        dragValue.current = db;
        applyDragVisual(sliderDrag.current.index, db);
      };

      const onUp = () => {
        if (sliderDrag.current) {
          setEqBand(sliderDrag.current.index, dragValue.current);
        }
        sliderDrag.current = null;
        setDraggingIndex(null);
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onUp);
    },
    [eqEnabled, setEqBand, applyDragVisual]
  );

  const handlePreset = useCallback(
    (presetKey: string) => {
      const gains = PRESETS[presetKey];
      if (!gains) return;
      if (!eqEnabled) setEqEnabled(true);
      animateBands(gains, presetKey);
    },
    [eqEnabled, setEqEnabled, animateBands]
  );

  return (
    <div className="w-full rounded-xl border border-base-600/70 bg-base-900/95 p-4 shadow-2xl backdrop-blur-sm sm:p-5">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={16} className="text-accent" />
          <h3 className="text-sm font-semibold text-white">Equalizer</h3>
        </div>
        <div className="flex items-center gap-2">
          {/* Bypass toggle */}
          <button
            onClick={() => setEqEnabled(!eqEnabled)}
            className={clsx(
              'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
              eqEnabled
                ? 'bg-accent/15 text-accent hover:bg-accent/25'
                : 'bg-base-800 text-muted hover:bg-base-700 hover:text-soft'
            )}
            title={eqEnabled ? 'Disable EQ' : 'Enable EQ'}
          >
            {eqEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
            <span>{eqEnabled ? 'On' : 'Off'}</span>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted hover:bg-base-800 hover:text-white"
              title="Close equalizer"
            >
              <span className="text-xs">&times;</span>
            </button>
          )}
        </div>
      </div>

      {/* Frequency sliders */}
      <div className="mb-4 flex items-end gap-1 sm:gap-2">
        {EQ_BANDS.map((freq, index) => {
          const db = eqBands[index] ?? 0;
          const pct = ((db + 6) / 12) * 100; // -6dB = 0%, +6dB = 100%, 0dB = 50%
          const isAboveZero = db > 0;
          const isBelowZero = db < 0;
          return (
            <div
              key={freq}
              className="flex flex-1 flex-col items-center gap-1"
            >
              {/* Value label */}
              <span
                ref={el => { labelRefs.current[index] = el; }}
                className={clsx(
                  'text-[10px] font-mono tabular-nums leading-none',
                  db === 0
                    ? 'text-muted'
                    : isAboveZero
                      ? 'text-accent'
                      : 'text-blue-400'
                )}
              >
                {db > 0 ? `+${db}` : db}
              </span>

              {/* Vertical slider track */}
              <div className="relative flex flex-col items-center">
                <div
                  className={clsx(
                    'relative h-24 w-6 sm:h-28 sm:w-7',
                    eqEnabled && 'cursor-pointer'
                  )}
                  onMouseDown={(e) => handleSliderStart(e, index)}
                  onTouchStart={(e) => handleSliderStart(e, index)}
                >
                  {/* Background track */}
                  <div className="absolute inset-x-[42%] top-0 bottom-0 rounded-full bg-base-700" />
                  {/* Center line (0dB) */}
                  <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-base-500/50" />
                  {/* Fill: above zero */}
                  <div
                    ref={el => { fillAboveRefs.current[index] = el; }}
                    className={clsx(
                      'absolute inset-x-[35%] bottom-1/2 rounded-t-full bg-accent/40',
                      draggingIndex !== index ? 'transition-all' : ''
                    )}
                    style={{
                      height: isAboveZero ? `${(db / 6) * 50}%` : '0%',
                    }}
                  />
                  {/* Fill: below zero */}
                  <div
                    ref={el => { fillBelowRefs.current[index] = el; }}
                    className={clsx(
                      'absolute inset-x-[35%] top-1/2 rounded-b-full bg-blue-500/40',
                      draggingIndex !== index ? 'transition-all' : ''
                    )}
                    style={{
                      height: isBelowZero ? `${(-db / 6) * 50}%` : '0%',
                    }}
                  />
                  {/* Visual thumb indicator */}
                  <div
                    ref={el => { thumbRefs.current[index] = el; }}
                    className={clsx(
                      'pointer-events-none absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2',
                      draggingIndex !== index && 'transition-all',
                      eqEnabled
                        ? db > 0
                          ? 'border-accent bg-accent/20'
                          : db < 0
                            ? 'border-blue-400 bg-blue-400/20'
                            : 'border-muted bg-base-800'
                        : 'border-base-600 bg-base-800'
                    )}
                    style={{
                      top: `${100 - pct}%`,
                    }}
                  />
                </div>
              </div>

              {/* Frequency label */}
              <span className="text-[10px] font-medium text-muted">
                {freq >= 1000 ? `${freq / 1000}k` : freq}
              </span>
            </div>
          );
        })}
      </div>

      {/* Preset buttons */}
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(PRESET_LABELS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => handlePreset(key)}
            className={clsx(
              'rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
              eqPreset === key
                ? 'bg-accent text-base-950'
                : 'bg-base-800 text-muted hover:bg-base-700 hover:text-white'
            )}
          >
            {label as string}
          </button>
        ))}
        {eqPreset !== 'flat' && (
          <button
            onClick={() => animateBands(PRESETS.flat, 'flat')}
            className="rounded-lg px-2.5 py-1 text-[11px] font-medium text-muted transition-colors hover:bg-base-800 hover:text-red-400"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
