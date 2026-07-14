import { useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePlayerStore } from '../store/player';

const EQ_CACHE_KEY = 'noctune-eq-cache';

interface EqCache {
  eqEnabled: boolean;
  eqBands: number[];
  eqPreset: string;
  updatedAt: number;
}

function readEqCache(): EqCache | null {
  try {
    const raw = localStorage.getItem(EQ_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeEqCache(data: Omit<EqCache, 'updatedAt'>) {
  try {
    localStorage.setItem(
      EQ_CACHE_KEY,
      JSON.stringify({ ...data, updatedAt: Date.now() })
    );
  } catch {}
}

export const EQ_BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export type EqPreset = keyof typeof PRESETS;

export const PRESETS: Record<string, number[]> = {
  flat:      [0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
  pop:       [ 1,  2,  3,  2, -1, -1,  1,  2,  3,  2],
  rock:      [ 3,  2,  1,  1,  0, -1, -1,  1,  2,  3],
  jazz:      [ 3,  2,  1,  1,  0,  1,  2,  2,  1,  1],
  classical: [ 3,  2,  1,  0,  0,  0,  1,  2,  3,  3],
  'hip-hop': [ 3,  2,  1,  1,  0, -1, -1, -2, -1,  0],
  'bass-boost':   [ 4,  3,  2,  1,  0, -1, -2, -2, -1,  0],
  'vocal-boost':  [-1, -1,  1,  2,  2,  2,  2,  1,  0, -1],
  electronic: [ 4,  3,  2,  1,  0, -1,  1,  2,  3,  4],
};

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

export const DEFAULT_EQ_BANDS = [...PRESETS.flat];

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
  const {
    eqEnabled,
    eqBands,
    eqPreset,
    setEqEnabled,
    setEqBand,
    resetEq,
  } = usePlayerStore();

  // Hydrate store from localStorage cache on mount
  const cachedEq = useMemo(() => readEqCache(), []);
  const hydrated = useRef(false);
  useEffect(() => {
    if (cachedEq && !hydrated.current) {
      hydrated.current = true;
      usePlayerStore.setState({
        eqEnabled: cachedEq.eqEnabled,
        eqBands: cachedEq.eqBands,
        eqPreset: cachedEq.eqPreset,
      });
    }
  }, [cachedEq]);

  // Expose cache as TanStack Query (matching HomeView pattern)
  useQuery({
    queryKey: ['eq-settings'],
    queryFn: () => readEqCache(),
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
      writeEqCache({ eqEnabled, eqBands, eqPreset });
    }
  }, [eqEnabled, eqBands, eqPreset]);

  const applyPreset = useCallback((preset: string) => {
    const gains = PRESETS[preset];
    if (!gains) return;
    usePlayerStore.getState().setEqBands([...gains], preset);
  }, []);

  return {
    eqEnabled,
    eqBands,
    eqPreset,
    setEqEnabled,
    setEqBand,
    applyPreset,
    resetEq,
    bands: EQ_BANDS,
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

  // Create 10 peaking filters
  const filters: BiquadFilterNode[] = [];
  for (const freq of EQ_BANDS) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'peaking';
    filter.frequency.value = freq;
    filter.Q.value = 1.41;
    filter.gain.value = 0;
    filters.push(filter);
  }

  // Dry/wet routing nodes for bypass
  const dryGain = ctx.createGain();
  const wetGain = ctx.createGain();
  dryGain.gain.value = 1;   // Direct path active (EQ bypassed)
  wetGain.gain.value = 0;   // Filter path muted

  // Path 1: analyser -> filters -> wetGain -> destination
  analyser.connect(filters[0]);
  for (let i = 0; i < filters.length - 1; i++) {
    filters[i].connect(filters[i + 1]);
  }
  filters[filters.length - 1].connect(wetGain);
  wetGain.connect(ctx.destination);

  // Path 2: analyser -> dryGain -> destination (bypass)
  analyser.connect(dryGain);
  dryGain.connect(ctx.destination);

  // Store references on window
  (window as any).__noctune_eqFilters = filters;
  (window as any).__noctune_eqDryGain = dryGain;
  (window as any).__noctune_eqWetGain = wetGain;

  // Apply initial state if any was set before audio context was ready
  applyEqToAudioNodes();
}
