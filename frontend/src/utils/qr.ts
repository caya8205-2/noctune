import QRCode from 'qrcode';

/**
 * Standard QR Code generator using verified qrcode library.
 * Generates an SVG path or matrix for pairing strings.
 */

export function encodeQrMatrix(text: string): boolean[][] {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const data = qr.modules.data;
  const matrix: boolean[][] = [];
  for (let r = 0; r < size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c++) {
      row.push(Boolean(data[r * size + c]));
    }
    matrix.push(row);
  }
  return matrix;
}

/**
 * Returns an SVG path string `d` made of unit square modules for rendering.
 */
export function getQrSvgPath(matrix: boolean[][]): { path: string; size: number } {
  const N = matrix.length;
  let d = '';
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (matrix[r][c]) {
        // unit square at (c, r)
        d += `M${c},${r}h1v1h-1z `;
      }
    }
  }
  return { path: d.trim(), size: N };
}

export function parsePairingData(rawValue: string): { url: string; key: string } | null {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  // 1. JSON format: {"url": "...", "key": "..."} or {"u": "...", "k": "..."}
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const data = JSON.parse(trimmed);
      const url = data.url || data.u || '';
      const key = data.key || data.k || '';
      if (url) return { url: String(url), key: String(key) };
    } catch {}
  }

  // 2. noctune://pair?url=...&key=... or noctune://connect?...
  if (trimmed.startsWith('noctune://')) {
    try {
      const urlObj = new URL(trimmed);
      const url = urlObj.searchParams.get('url') || '';
      const key = urlObj.searchParams.get('key') || '';
      if (url) return { url, key };
    } catch {}
  }

  // 3. Plain URL: https://mobile.noctune.web.id
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return { url: trimmed, key: '' };
  }

  return null;
}
