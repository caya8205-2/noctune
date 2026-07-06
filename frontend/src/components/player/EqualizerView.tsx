import { useCallback } from 'react';
import { SlidersHorizontal, Volume2, VolumeX } from 'lucide-react';
import { clsx } from 'clsx';
import { useEqualizer, EQ_BANDS, PRESET_LABELS } from '../../hooks/useEqualizer';

interface EqualizerViewProps {
  onClose?: () => void;
}

export function EqualizerView({ onClose }: EqualizerViewProps) {
  const {
    eqEnabled,
    eqBands,
    eqPreset,
    setEqEnabled,
    setEqBand,
    applyPreset,
    resetEq,
  } = useEqualizer();

  const handleBandChange = useCallback(
    (index: number, value: number) => {
      setEqBand(index, value);
    },
    [setEqBand]
  );

  const handlePreset = useCallback(
    (preset: string) => {
      applyPreset(preset);
      if (!eqEnabled) {
        setEqEnabled(true);
      }
    },
    [applyPreset, eqEnabled, setEqEnabled]
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
                <div className="relative h-24 w-6 sm:h-28 sm:w-7">
                  {/* Background track */}
                  <div className="absolute inset-x-[42%] top-0 bottom-0 rounded-full bg-base-700" />
                  {/* Center line (0dB) */}
                  <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-base-500/50" />
                  {/* Fill: above zero */}
                  <div
                    className="absolute inset-x-[35%] bottom-1/2 rounded-t-full bg-accent/40 transition-all"
                    style={{
                      height: isAboveZero ? `${(db / 6) * 50}%` : '0%',
                    }}
                  />
                  {/* Fill: below zero */}
                  <div
                    className="absolute inset-x-[35%] top-1/2 rounded-b-full bg-blue-500/40 transition-all"
                    style={{
                      height: isBelowZero ? `${(-db / 6) * 50}%` : '0%',
                    }}
                  />
                  {/* Slider thumb */}
                  <input
                    type="range"
                    min={-6}
                    max={6}
                    step={1}
                    value={db}
                    onChange={(e) =>
                      handleBandChange(index, Number(e.target.value))
                    }
                    className={clsx(
                      'eq-slider absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0',
                      eqEnabled && 'cursor-pointer'
                    )}
                    disabled={!eqEnabled}
                    aria-label={`${freq >= 1000 ? `${freq / 1000}k` : freq} Hz gain`}
                  />
                  {/* Visual thumb indicator */}
                  <div
                    className={clsx(
                      'pointer-events-none absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-all',
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
            onClick={resetEq}
            className="rounded-lg px-2.5 py-1 text-[11px] font-medium text-muted transition-colors hover:bg-base-800 hover:text-red-400"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
