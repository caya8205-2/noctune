import { useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePlayerStore } from '../store/player';
import { isMobileClientMode } from '../utils/api';

const EQ_CACHE_KEY_DESKTOP = 'noctune-eq-cache';
const EQ_CACHE_KEY_MOBILE = 'noctune-eq-cache-mobile';

interface EqCache {
  eqEnabled: boolean;
  eqBands: number[];
  eqPreset: string;
  updatedAt: number;
}

function getEqCacheKey(isMobile: boolean): string {
  return isMobile ? EQ_CACHE_KEY_MOBILE : EQ_CACHE_KEY_DESKTOP;
}

function readEqCache(isMobile: boolean): EqCache | null {
  try {
    const raw = localStorage.getItem(getEqCacheKey(isMobile));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EqCache;
    const expectedLen = isMobile ? EQ_BANDS_5.length : EQ_BANDS_10.length;
    if (!Array.isArray(parsed.eqBands) || parsed.eqBands.length !== expectedLen) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeEqCache(data: Omit<EqCache, 'updatedAt'>, isMobile: boolean) {
  try {
    localStorage.setItem(
      getEqCacheKey(isMobile),
      JSON.stringify({ ...data, updatedAt: Date.now() })
    );
  } catch {}
}

export const EQ_BANDS_10 = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const EQ_BANDS_5 = [60, 250, 1000, 4000, 14000];

// Legacy export for backward compatibility
export const EQ_BANDS = EQ_BANDS_10;

export type EqPreset = keyof typeof PRESETS_10;

export const PRESETS_10: Record<string, number[]> = {
  flat:        [0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
  pop:         [1,  2,  3,  2, -1, -1,  1,  2,  3,  2],
  rock:        [3,  2,  1,  1,  0, -1, -1,  1,  2,  3],
  jazz:        [3,  2,  1,  1,  0,  1,  2,  2,  1,  1],
  classical:   [3,  2,  1,  0,  0,  0,  1,  2,  3,  3],
  'hip-hop':   [3,  2,  1,  1,  0, -1, -1, -2, -1,  0],
  'bass-boost': [4,  3,  2,  1,  0, -1, -2, -2, -1,  0],
  'vocal-boost':[-1, -1, 1,  2,  2,  2,  2,  1,  0, -1],
  electronic:  [4,  3,  2,  1,  0, -1,  1,  2,  3,  4],
};

export const PRESETS_5: Record<string, number[]> = {
  flat:        [0,  0,  0,  0,  0],
  pop:         [2,  3, -1,  2,  2],
  rock:        [3,  1,  0,  1,  3],
  jazz:        [3,  1,  1,  2,  1],
  classical:   [3,  1,  0,  1,  3],
  'hip-hop':   [4,  2,  0, -1,  1],
  'bass-boost': [5,  3,  0, -1, -1],
  'vocal-boost':[-1, 1,  3,  2,  0],
  electronic:  [4,  2,  0,  2,  4],
};

// Legacy export for backward compatibility
export const PRESETS = PRESETS_10;

export const PRESET_LABELS: Record<string, string> = {
  flat: 'Flat',
  pop: 'Pop',
  rock: 'Rock',
  jazz: 'Jazz',
  classical: 'Classical',
  'hip-hop': 'Hip-Hop',
  'bass-boost': 'Bass Boost',
  'vocal-boost': 'Vocal Boost',
  electronic: 'Electronic',
};

export const DEFAULT_EQ_BANDS_10 = [...PRESETS_10.flat];
export const DEFAULT_EQ_BANDS_5 = [...PRESETS_5.flat];
export const DEFAULT_EQ_BANDS = DEFAULT_EQ_BANDS_10;

/**
 * Applies current EQ state (enabled, band gains) to the Web Audio filter nodes
 * stored on the window object. Called internally by useEqualizer on state changes.
 */
function applyEqToAudioNodes() {
  const state = usePlayerStore.getState();
  const filters = (window as any).__noctune_eqFilters as BiquadFilterNode[] | undefined;
  const dryGain = (window as any).__noctune_eqDryGain as GainNode | undefined;
  const wetGain = (window as any).__noctune_eqWetGain as GainNode | undefined;
  if (!filters || !dryGain || !wetGain) return;

  // Set per-band gains
  for (let i = 0; i < filters.length; i++) {
    filters[i].gain.value = state.eqBands[i] ?? 0;
  }

  // Toggle dry/wet routing
  if (state.eqEnabled) {
    dryGain.gain.value = 0;
    wetGain.gain.value = 1;
  } else {
    dryGain.gain.value = 1;
    wetGain.gain.value = 0;
  }
}

/**
 * React hook that bridges EQ zustand state with Web Audio filter nodes.
 * Call once from any component that needs EQ reactivity (e.g., EqualizerView).
 */
export function useEqualizer() {
  const isMobile = isMobileClientMode();
  const bands = isMobile ? EQ_BANDS_5 : EQ_BANDS_10;
  const presets = isMobile ? PRESETS_5 : PRESETS_10;

  const {
    eqEnabled,
    eqBands,
    eqPreset,
    setEqEnabled,
    setEqBand,
    resetEq,
  } = usePlayerStore();

  // Hydrate store from localStorage cache on mount
  const cachedEq = useMemo(() => readEqCache(isMobile), [isMobile]);
  const hydrated = useRef(false);
  useEffect(() => {
    if (cachedEq && !hydrated.current) {
      hydrated.current = true;
      usePlayerStore.setState({
        eqEnabled: cachedEq.eqEnabled,
        eqBands: cachedEq.eqBands,
        eqPreset: cachedEq.eqPreset,
      });
    } else if (!hydrated.current) {
      // Ensure store eqBands array length matches active environment (5 on mobile, 10 on desktop)
      const currentBands = usePlayerStore.getState().eqBands;
      if (currentBands.length !== bands.length) {
        usePlayerStore.setState({
          eqBands: isMobile ? [...DEFAULT_EQ_BANDS_5] : [...DEFAULT_EQ_BANDS_10],
          eqPreset: 'flat',
        });
      }
      hydrated.current = true;
    }
  }, [cachedEq, isMobile, bands.length]);

  // Expose cache as TanStack Query (matching HomeView pattern)
  useQuery({
    queryKey: ['eq-settings', isMobile ? 'mobile' : 'desktop'],
    queryFn: () => readEqCache(isMobile),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    initialData: cachedEq,
    initialDataUpdatedAt: cachedEq?.updatedAt,
  });

  // Sync store → audio nodes whenever state changes
  useEffect(() => {
    applyEqToAudioNodes();
  }, [eqEnabled, eqBands]);

  // Write to localStorage cache whenever EQ state changes
  const lastCache = useRef('');
  useEffect(() => {
    const snapshot = JSON.stringify({ eqEnabled, eqBands, eqPreset });
    if (snapshot !== lastCache.current) {
      lastCache.current = snapshot;
      writeEqCache({ eqEnabled, eqBands, eqPreset }, isMobile);
    }
  }, [eqEnabled, eqBands, eqPreset, isMobile]);

  const applyPreset = useCallback((preset: string) => {
    const gains = presets[preset];
    if (!gains) return;
    usePlayerStore.getState().setEqBands([...gains], preset);
  }, [presets]);

  return {
    eqEnabled,
    eqBands,
    eqPreset,
    setEqEnabled,
    setEqBand,
    applyPreset,
    resetEq,
    bands,
    presets,
    isMobile,
  };
}

/**
 * Creates EQ BiquadFilter nodes and wires them into the audio graph.
 * Called imperatively from useAudio during AudioContext setup.
 * Stores references on window for later access by useEqualizer.
 */
export function createEqualizerNodes(ctx: AudioContext, analyser: AnalyserNode) {
  // Disconnect the existing analyser → destination link
  try { analyser.disconnect(ctx.destination); } catch { /* not connected */ }

  const isMobile = isMobileClientMode();
  const bands = isMobile ? EQ_BANDS_5 : EQ_BANDS_10;

  // Create peaking filters: 5 bands on mobile (Q=1.0 for smooth 2-octave curves),
  // 10 bands on desktop (Q=1.41 for 1-octave precision).
  const filters: BiquadFilterNode[] = [];
  for (const freq of bands) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'peaking';
    filter.frequency.value = freq;
    filter.Q.value = isMobile ? 1.0 : 1.41;
    filter.gain.value = 0;
    filters.push(filter);
  }

  // Dry/wet routing nodes for bypass
  const dryGain = ctx.createGain();
  const wetGain = ctx.createGain();
  dryGain.gain.value = 1;   // Direct path active (EQ bypassed)
  wetGain.gain.value = 0;   // Filter path muted

  // Master gate after the analyser: silencing it keeps the analyser (and thus
  // the visualizer) live while the speakers stay quiet during native handback.
  const masterGain = ctx.createGain();
  masterGain.gain.value = 1;
  (window as any).__noctune_masterGain = masterGain;

  // Path 1: analyser -> masterGain -> filters -> wetGain -> destination
  analyser.connect(masterGain);
  masterGain.connect(filters[0]);
  for (let i = 0; i < filters.length - 1; i++) {
    filters[i].connect(filters[i + 1]);
  }
  filters[filters.length - 1].connect(wetGain);
  wetGain.connect(ctx.destination);

  // Path 2: analyser -> masterGain -> dryGain -> destination (bypass)
  masterGain.connect(dryGain);
  dryGain.connect(ctx.destination);

  // Store references on window
  (window as any).__noctune_eqFilters = filters;
  (window as any).__noctune_eqDryGain = dryGain;
  (window as any).__noctune_eqWetGain = wetGain;

  // Apply initial state if any was set before audio context was ready
  applyEqToAudioNodes();
}
