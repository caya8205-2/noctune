import { useMemo } from 'react';
import { encodeQrMatrix, getQrSvgPath } from '../../utils/qr';

interface QrCodeViewProps {
  value: string;
  size?: number;
  className?: string;
  quietZone?: number;
}

export function QrCodeView({ value, size = 180, className = '', quietZone = 2 }: QrCodeViewProps) {
  const { path, moduleCount } = useMemo(() => {
    try {
      const matrix = encodeQrMatrix(value);
      const { path, size: N } = getQrSvgPath(matrix);
      return { path, moduleCount: N };
    } catch (err) {
      console.warn('QR code generation failed:', err);
      return { path: '', moduleCount: 0 };
    }
  }, [value]);

  if (!path || moduleCount === 0) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-xs text-muted ${className}`}
      >
        QR unavailable
      </div>
    );
  }

  const viewBoxSize = moduleCount + quietZone * 2;

  return (
    <div
      style={{ width: size, height: size }}
      className={`relative inline-flex items-center justify-center rounded-xl bg-white p-2 shadow-xl ${className}`}
    >
      <svg
        viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
        className="w-full h-full"
        shapeRendering="crispEdges"
      >
        <path
          d={path}
          transform={`translate(${quietZone}, ${quietZone})`}
          fill="#0a0a0c"
        />
      </svg>
    </div>
  );
}
