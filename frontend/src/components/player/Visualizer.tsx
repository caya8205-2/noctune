import { useEffect, useRef, useState } from 'react';
import AudioMotionAnalyzer from 'audiomotion-analyzer';
import { usePlayerStore } from '../../store/player';

export type VisualizerMode = 'ncs' | 'wave' | 'orbit' | 'bars' | 'ambient' | 'off';

export const VISUALIZER_PRESETS: Array<{ id: VisualizerMode; name: string; desc: string }> = [
  {
    id: 'ncs',
    name: 'NCS Symmetrical Ring (Recommended)',
    desc: 'Classic NoCopyrightSounds style symmetrical spectrum ring with neon glow.',
  },
  {
    id: 'wave',
    name: 'Liquid Neon Wave',
    desc: 'Smooth continuous Bézier spline neon wave ring that pulses with the beat.',
  },
  {
    id: 'orbit',
    name: 'Orbital Particle Ring',
    desc: 'Dynamic reactive audio dots and particles orbiting around the artwork.',
  },
  {
    id: 'bars',
    name: 'Dual Radial Bars',
    desc: 'Mirrored double-sided spectrum bars projecting inside and outside the ring.',
  },
  {
    id: 'ambient',
    name: 'Ambient Halo Pulse',
    desc: 'Minimalist glowing ambient aura ring that expands with bass hits.',
  },
  {
    id: 'off',
    name: 'Disabled',
    desc: 'Turn off visualizer rendering for maximum minimalism.',
  },
];

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

export async function extractPalette(src: string): Promise<typeof FALLBACK_PALETTE> {
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

interface VisualizerProps {
  mode?: VisualizerMode;
  onBassEnergy?: (energy: number) => void;
  preview?: boolean;
}

export function Visualizer({ mode = 'ncs', onBassEnergy, preview = false }: VisualizerProps) {
  const pathRef = useRef<SVGPathElement>(null);
  const wavePathRef = useRef<SVGPathElement>(null);
  const orbitGroupRef = useRef<SVGGElement>(null);
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
    if (mode === 'off') return;

    const motion = motionRef.current;
    const activeMotion = motion;

    if (activeMotion) {
      resumeAudioCtx();
      if (isPlaying || preview) activeMotion.start();
      else activeMotion.stop();
    }

    const count = mode === 'wave' ? 64 : mode === 'orbit' ? 48 : 80;
    const cx = 50;
    const cy = 50;
    const innerRadius = 40.0;
    const maxLength = mode === 'wave' ? 6.5 : mode === 'bars' ? 5.8 : 8.2;

    if (valuesRef.current.length !== count) {
      valuesRef.current = Array.from({ length: count }, () => 0);
      velocityRef.current = Array.from({ length: count }, () => 0);
    }

    function getSymmetricalBar(bars: ReturnType<AudioMotionAnalyzer['getBars']>, index: number) {
      if (bars.length === 0) return 0;
      const half = count / 2;
      const mirroredIdx = index < half ? index : count - 1 - index;
      const normalizedPos = Math.pow(mirroredIdx / half, 0.85);
      const barPos = Math.floor(normalizedPos * bars.length);
      const safeIdx = Math.max(0, Math.min(bars.length - 1, barPos));
      return bars[safeIdx]?.value?.[0] ?? 0;
    }

    function draw() {
      const bars = activeMotion ? activeMotion.getBars() : [];
      const bass = activeMotion ? activeMotion.getEnergy('bass') || 0 : 0;
      const lowMid = activeMotion ? activeMotion.getEnergy('lowMid') || 0 : 0;
      const mid = activeMotion ? activeMotion.getEnergy('mid') || 0 : 0;
      const highMid = activeMotion ? activeMotion.getEnergy('highMid') || 0 : 0;
      const globalEnergy = Math.min(1, bass * 0.35 + lowMid * 0.25 + mid * 0.22 + highMid * 0.12);

      const active = isPlaying || preview;

      if (onBassEnergy && active) {
        onBassEnergy(bass);
      }

      let hasNonZero = false;

      if ((mode === 'ncs' || mode === 'bars') && pathRef.current) {
        const segments: string[] = [];
        for (let i = 0; i < count; i++) {
          let target = 0;
          if (preview) {
            const t = Date.now() / 320;
            const half = count / 2;
            const mirrorIdx = i < half ? i : count - 1 - i;
            target = 0.25 + Math.sin(t + mirrorIdx * 0.18) * 0.28 + Math.cos(t * 1.6 + mirrorIdx * 0.12) * 0.15;
          } else if (isPlaying) {
            const raw = getSymmetricalBar(bars, i);
            target = Math.min(0.88, Math.pow(raw * 0.92 + globalEnergy * 0.08, 0.92));
          }

          const current = valuesRef.current[i] ?? 0;
          const velocity = velocityRef.current[i] ?? 0;
          const nextVelocity = (velocity + (target - current) * 0.22) * 0.74;
          const nextValue = Math.max(0, Math.min(1, current + nextVelocity));
          velocityRef.current[i] = nextVelocity;
          valuesRef.current[i] = nextValue;

          if (nextValue > 0.001) hasNonZero = true;

          const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
          if (mode === 'bars') {
            const inner = innerRadius - 0.4 - nextValue * 1.8;
            const outer = innerRadius + 0.4 + nextValue * maxLength;
            const x1 = cx + Math.cos(angle) * inner;
            const y1 = cy + Math.sin(angle) * inner;
            const x2 = cx + Math.cos(angle) * outer;
            const y2 = cy + Math.sin(angle) * outer;
            segments.push(`M ${x1.toFixed(2)} ${y1.toFixed(2)} L ${x2.toFixed(2)} ${y2.toFixed(2)}`);
          } else {
            const length = 0.6 + nextValue * maxLength;
            const outerRadius = Math.min(48.5, innerRadius + length);
            const x1 = cx + Math.cos(angle) * innerRadius;
            const y1 = cy + Math.sin(angle) * innerRadius;
            const x2 = cx + Math.cos(angle) * outerRadius;
            const y2 = cy + Math.sin(angle) * outerRadius;
            segments.push(`M ${x1.toFixed(2)} ${y1.toFixed(2)} L ${x2.toFixed(2)} ${y2.toFixed(2)}`);
          }
        }
        pathRef.current.setAttribute('d', segments.join(' '));
      } else if (mode === 'wave' && wavePathRef.current) {
        const points: Array<{ x: number; y: number }> = [];
        for (let i = 0; i < count; i++) {
          let target = 0;
          if (preview) {
            const t = Date.now() / 320;
            const half = count / 2;
            const mirrorIdx = i < half ? i : count - 1 - i;
            target = 0.22 + Math.sin(t + mirrorIdx * 0.16) * 0.26 + Math.cos(t * 1.4 + mirrorIdx * 0.1) * 0.14;
          } else if (isPlaying) {
            const raw = getSymmetricalBar(bars, i);
            target = Math.min(0.85, Math.pow(raw * 0.95 + globalEnergy * 0.08, 0.92));
          }

          const current = valuesRef.current[i] ?? 0;
          const velocity = velocityRef.current[i] ?? 0;
          const nextVelocity = (velocity + (target - current) * 0.20) * 0.76;
          const nextValue = Math.max(0, Math.min(1, current + nextVelocity));
          velocityRef.current[i] = nextVelocity;
          valuesRef.current[i] = nextValue;

          if (nextValue > 0.001) hasNonZero = true;

          const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
          const radius = innerRadius + 1.2 + nextValue * maxLength;
          const px = cx + Math.cos(angle) * radius;
          const py = cy + Math.sin(angle) * radius;
          points.push({ x: px, y: py });
        }

        if (points.length > 0) {
          let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
          for (let i = 0; i < points.length; i++) {
            const p0 = points[(i - 1 + points.length) % points.length];
            const p1 = points[i];
            const p2 = points[(i + 1) % points.length];
            const p3 = points[(i + 2) % points.length];

            const cp1x = p1.x + (p2.x - p0.x) * 0.18;
            const cp1y = p1.y + (p2.y - p0.y) * 0.18;
            const cp2x = p2.x - (p3.x - p1.x) * 0.18;
            const cp2y = p2.y - (p3.y - p1.y) * 0.18;

            d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
          }
          d += ' Z';
          wavePathRef.current.setAttribute('d', d);
        }
      } else if (mode === 'orbit' && orbitGroupRef.current) {
        const circles = orbitGroupRef.current.children;
        for (let i = 0; i < count && i < circles.length; i++) {
          let target = 0;
          if (preview) {
            const t = Date.now() / 320;
            const half = count / 2;
            const mirrorIdx = i < half ? i : count - 1 - i;
            target = 0.25 + Math.sin(t + mirrorIdx * 0.2) * 0.3;
          } else if (isPlaying) {
            const raw = getSymmetricalBar(bars, i);
            target = Math.min(0.85, Math.pow(raw * 0.95 + globalEnergy * 0.1, 0.92));
          }

          const current = valuesRef.current[i] ?? 0;
          const velocity = velocityRef.current[i] ?? 0;
          const nextVelocity = (velocity + (target - current) * 0.22) * 0.74;
          const nextValue = Math.max(0, Math.min(1, current + nextVelocity));
          velocityRef.current[i] = nextVelocity;
          valuesRef.current[i] = nextValue;

          if (nextValue > 0.001) hasNonZero = true;

          const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
          const radius = innerRadius + 1.5 + nextValue * 7.2;
          const px = cx + Math.cos(angle) * radius;
          const py = cy + Math.sin(angle) * radius;
          const circle = circles[i] as SVGCircleElement;
          circle.setAttribute('cx', px.toFixed(2));
          circle.setAttribute('cy', py.toFixed(2));
          circle.setAttribute('r', (0.5 + nextValue * 1.3).toFixed(2));
          circle.setAttribute('opacity', (0.45 + nextValue * 0.55).toFixed(2));
        }
      }

      if (!active && !hasNonZero) {
        return; // Stop animation loop completely once bars decay to 0!
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, mode, onBassEnergy, preview]);;

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

  if (mode === 'off') return null;

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
          <stop offset="50%" stopColor={palette.secondary} />
          <stop offset="100%" stopColor={palette.accent} />
        </linearGradient>
        <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <circle
        cx="50"
        cy="50"
        r="39.4"
        fill="none"
        stroke={palette.primary}
        strokeWidth="0.65"
        strokeDasharray="0.8 1.6"
        opacity="0.7"
      />

      {(mode === 'ncs' || mode === 'bars') && (
        <path
          ref={pathRef}
          d=""
          fill="none"
          stroke="url(#visualizerGradient)"
          strokeWidth={mode === 'bars' ? '1.4' : '1.25'}
          strokeLinecap="round"
          opacity="0.95"
          filter="url(#neonGlow)"
        />
      )}

      {mode === 'wave' && (
        <path
          ref={wavePathRef}
          d=""
          fill="none"
          stroke="url(#visualizerGradient)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.95"
          filter="url(#neonGlow)"
        />
      )}

      {mode === 'orbit' && (
        <g ref={orbitGroupRef} filter="url(#neonGlow)">
          {Array.from({ length: 48 }).map((_, i) => (
            <circle
              key={i}
              cx="50"
              cy="50"
              r="1"
              fill={i % 2 === 0 ? palette.primary : palette.secondary}
              opacity="0.6"
            />
          ))}
        </g>
      )}

      {mode === 'ambient' && (
        <circle
          cx="50"
          cy="50"
          r="41"
          fill="none"
          stroke="url(#visualizerGradient)"
          strokeWidth="1.5"
          opacity="0.5"
          filter="url(#neonGlow)"
          className="animate-pulse"
        />
      )}
    </svg>
  );
}
