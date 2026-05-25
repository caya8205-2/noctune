import { useEffect, useRef, useState } from 'react';
import AudioMotionAnalyzer from 'audiomotion-analyzer';
import { usePlayerStore } from '../../store/player';

type Rgb = [number, number, number];

const FALLBACK_PALETTE = {
  primary: 'rgb(34 211 238)',
  secondary: 'rgb(217 70 239)',
  accent: 'rgb(200 241 53)',
};

function getAnalyser(): AnalyserNode | null {
  return (window as any).__noctune_analyser ?? null;
}

function getAudioCtx(): AudioContext | null {
  return (window as any).__noctune_audioCtx ?? null;
}

function resumeAudioCtx() {
  const ctx = getAudioCtx();
  if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
}

function colorDistance(a: Rgb, b: Rgb) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function toCss([r, g, b]: Rgb) {
  return `rgb(${r} ${g} ${b})`;
}

function enhanceColor([r, g, b]: Rgb): Rgb {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max === 0 ? 0 : (max - min) / max;
  const lift = max < 150 ? 1.18 : 1;
  const satBoost = saturation < 0.35 ? 1.18 : 1.06;
  const avg = (r + g + b) / 3;
  return [
    Math.min(255, Math.round((avg + (r - avg) * satBoost) * lift)),
    Math.min(255, Math.round((avg + (g - avg) * satBoost) * lift)),
    Math.min(255, Math.round((avg + (b - avg) * satBoost) * lift)),
  ];
}

async function extractPalette(src: string): Promise<typeof FALLBACK_PALETTE> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Album art failed to load'));
    img.src = src;
  });

  const size = 48;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return FALLBACK_PALETTE;

  ctx.drawImage(img, 0, 0, size, size);
  const pixels = ctx.getImageData(0, 0, size, size).data;
  const buckets = new Map<string, { color: Rgb; score: number; count: number }>();

  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3];
    if (alpha < 180) continue;

    const color: Rgb = [pixels[i], pixels[i + 1], pixels[i + 2]];
    const max = Math.max(...color);
    const min = Math.min(...color);
    const luminance = (color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722) / 255;
    const saturation = max === 0 ? 0 : (max - min) / max;
    if (luminance < 0.08 || luminance > 0.92 || saturation < 0.12) continue;

    const quantized: Rgb = [
      Math.round(color[0] / 24) * 24,
      Math.round(color[1] / 24) * 24,
      Math.round(color[2] / 24) * 24,
    ];
    const key = quantized.join(',');
    const vibrance = 0.55 + saturation * 0.45;
    const balance = 1 - Math.abs(luminance - 0.52) * 0.55;
    const score = vibrance * balance;
    const entry = buckets.get(key);
    if (entry) {
      entry.score += score;
      entry.count += 1;
    } else {
      buckets.set(key, { color: quantized, score, count: 1 });
    }
  }

  const ranked = [...buckets.values()].sort((a, b) => b.score - a.score);
  const primary = enhanceColor(ranked[0]?.color ?? [34, 211, 238]);
  const secondary = enhanceColor(
    ranked.find((entry) => colorDistance(entry.color, primary) > 82)?.color ??
      ranked[1]?.color ??
      [217, 70, 239]
  );
  const accent = enhanceColor(
    ranked.find((entry) => colorDistance(entry.color, primary) > 55 && colorDistance(entry.color, secondary) > 55)
      ?.color ?? [200, 241, 53]
  );

  return {
    primary: toCss(primary),
    secondary: toCss(secondary),
    accent: toCss(accent),
  };
}

export function Visualizer() {
  const barsRef = useRef<SVGPathElement>(null);
  const rafRef = useRef(0);
  const motionRef = useRef<AudioMotionAnalyzer | null>(null);
  const valuesRef = useRef<number[]>([]);
  const velocityRef = useRef<number[]>([]);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const thumbnail = usePlayerStore((s) => s.currentTrack?.thumbnail);
  const [palette, setPalette] = useState(FALLBACK_PALETTE);

  useEffect(() => {
    const source = getAnalyser();
    const audioCtx = getAudioCtx();
    if (!source || !audioCtx) return;

    const motion = new AudioMotionAnalyzer({
      audioCtx,
      source,
      connectSpeakers: false,
      start: true,
      useCanvas: false,
      mode: 6,
      frequencyScale: 'bark',
      minFreq: 30,
      maxFreq: 16000,
      fftSize: 2048,
      smoothing: 0.68,
      weightingFilter: 'D',
      linearAmplitude: false,
      minDecibels: -88,
      maxDecibels: -16,
    });

    motionRef.current = motion;
    return () => {
      cancelAnimationFrame(rafRef.current);
      motionRef.current = null;
      motion.destroy();
    };
  }, []);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    const path = barsRef.current;
    const motion = motionRef.current;
    if (!path || !motion) return;
    const activePath = path;
    const activeMotion = motion;

    resumeAudioCtx();
    if (isPlaying) activeMotion.start();
    else activeMotion.stop();

    const count = 128;
    const cx = 50;
    const cy = 50;
    const innerRadius = 40.5;
    const maxLength = 7.6;

    if (valuesRef.current.length !== count) {
      valuesRef.current = Array.from({ length: count }, () => 0);
      velocityRef.current = Array.from({ length: count }, () => 0);
    }

    function getInterpolatedBar(bars: ReturnType<AudioMotionAnalyzer['getBars']>, index: number) {
      if (bars.length === 0) return 0;
      const position = (index / count) * bars.length;
      const left = Math.floor(position) % bars.length;
      const right = (left + 1) % bars.length;
      const t = position - Math.floor(position);
      const leftValue = bars[left]?.value?.[0] ?? 0;
      const rightValue = bars[right]?.value?.[0] ?? leftValue;
      return leftValue * (1 - t) + rightValue * t;
    }

    function draw() {
      const bars = activeMotion.getBars();
      const bass = activeMotion.getEnergy('bass') || 0;
      const lowMid = activeMotion.getEnergy('lowMid') || 0;
      const mid = activeMotion.getEnergy('mid') || 0;
      const highMid = activeMotion.getEnergy('highMid') || 0;
      const globalEnergy = Math.min(1, bass * 0.28 + lowMid * 0.28 + mid * 0.25 + highMid * 0.12);

      const segments: string[] = [];
      for (let i = 0; i < count; i++) {
        const raw = getInterpolatedBar(bars, i);
        const target = Math.min(0.84, Math.pow(raw * 0.94 + globalEnergy * 0.08, 0.94));
        const current = valuesRef.current[i] ?? 0;
        const velocity = velocityRef.current[i] ?? 0;
        const nextVelocity = (velocity + (target - current) * 0.18) * 0.76;
        const nextValue = Math.max(0, Math.min(1, current + nextVelocity));
        velocityRef.current[i] = nextVelocity;
        valuesRef.current[i] = nextValue;

        const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
        const length = 0.55 + nextValue * maxLength;
        const outerRadius = Math.min(48.2, innerRadius + length);
        const x1 = cx + Math.cos(angle) * innerRadius;
        const y1 = cy + Math.sin(angle) * innerRadius;
        const x2 = cx + Math.cos(angle) * outerRadius;
        const y2 = cy + Math.sin(angle) * outerRadius;
        segments.push(`M ${x1.toFixed(2)} ${y1.toFixed(2)} L ${x2.toFixed(2)} ${y2.toFixed(2)}`);
      }

      activePath.setAttribute('d', segments.join(' '));
      rafRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying]);

  useEffect(() => {
    if (isPlaying) resumeAudioCtx();
  }, [isPlaying]);

  useEffect(() => {
    let cancelled = false;
    if (!thumbnail) {
      setPalette(FALLBACK_PALETTE);
      return;
    }

    extractPalette(thumbnail)
      .then((nextPalette) => {
        if (!cancelled) setPalette(nextPalette);
      })
      .catch(() => {
        if (!cancelled) setPalette(FALLBACK_PALETTE);
      });

    return () => {
      cancelled = true;
    };
  }, [thumbnail]);

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      className="absolute inset-0 w-full h-full pointer-events-none z-10"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="visualizerGradient" x1="12" y1="12" x2="88" y2="88" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={palette.primary} />
          <stop offset="52%" stopColor={palette.secondary} />
          <stop offset="100%" stopColor={palette.accent} />
        </linearGradient>
      </defs>
      <circle
        cx="50"
        cy="50"
        r="39.4"
        fill="none"
        stroke={palette.primary}
        strokeWidth="0.65"
        strokeDasharray="0.8 1.6"
        opacity="0.8"
      />
      <path
        ref={barsRef}
        d=""
        fill="none"
        stroke="url(#visualizerGradient)"
        strokeWidth="1.15"
        strokeLinecap="round"
        opacity="0.95"
      />
    </svg>
  );
}
