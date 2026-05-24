import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../../store/player';

function getAnalyser(): AnalyserNode | null {
  return (window as any).__noctune_analyser ?? null;
}

function resumeAudioCtx() {
  const ctx = (window as any).__noctune_audioCtx as AudioContext | undefined;
  if (ctx?.state === 'suspended') ctx.resume().catch(() => { });
}

const W = 300;

export function Visualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    const canvas = canvasRef.current;
    const a = getAnalyser();
    const ctx = canvas?.getContext('2d');
    if (!canvas || !a || !ctx) return;

    const _a = a!;
    const _ctx = ctx!;

    resumeAudioCtx();
    const dataArray = new Uint8Array(a.frequencyBinCount);
    a.smoothingTimeConstant = 0.85;
    const cx = W / 2;
    const cy = W / 2;
    const innerR = 127;
    const maxLen = 24;
    const count = 80;
    const step = (Math.PI * 2) / count;

    function draw() {
      _a.getByteFrequencyData(dataArray);
      _ctx.clearRect(0, 0, W, W);
      _ctx.lineWidth = 4;
      _ctx.lineCap = 'round';

      for (let i = 0; i < count; i++) {
        const val = dataArray[i] / 255;
        const boosted = Math.min(1, Math.pow(val, 0.65) * 1.3);
        const len = Math.max(0.5, boosted * maxLen);
        const angle = step * i - Math.PI / 2;

        const x1 = cx + Math.cos(angle) * innerR;
        const y1 = cy + Math.sin(angle) * innerR;
        const x2 = cx + Math.cos(angle) * (innerR + len);
        const y2 = cy + Math.sin(angle) * (innerR + len);

        _ctx.strokeStyle = 'rgba(200, 241, 53, ' + (0.2 + boosted * 0.8) + ')';
        _ctx.beginPath();
        _ctx.moveTo(x1, y1);
        _ctx.lineTo(x2, y2);
        _ctx.stroke();
      }

      rafRef.current = requestAnimationFrame(draw);
    }
    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying]);

  useEffect(() => { if (isPlaying) resumeAudioCtx(); }, [isPlaying]);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={W}
      className="absolute -inset-5 w-[300px] h-[300px] pointer-events-none z-10"
    />
  );
}


