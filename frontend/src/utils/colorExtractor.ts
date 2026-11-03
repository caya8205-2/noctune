import { apiUrl } from './api';

// Canvas-based image color extraction for ambient dynamic theme glow
const colorCache = new Map<string, string>();
const DEFAULT_COLOR = 'rgba(234, 177, 76, 0.35)';

export async function extractDominantColor(imageUrl?: string): Promise<string> {
  if (!imageUrl) return DEFAULT_COLOR;
  if (colorCache.has(imageUrl)) return colorCache.get(imageUrl)!;

  let blobUrl: string | null = null;
  try {
    let sourceUrl = imageUrl;
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      const proxyUrl = await apiUrl(`/image/proxy?url=${encodeURIComponent(imageUrl)}`);
      const res = await fetch(proxyUrl);
      if (res.ok) {
        const blob = await res.blob();
        blobUrl = URL.createObjectURL(blob);
        sourceUrl = blobUrl;
      }
    }

    const color = await new Promise<string>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = sourceUrl;

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) return resolve(DEFAULT_COLOR);

          canvas.width = 40;
          canvas.height = 40;
          ctx.drawImage(img, 0, 0, 40, 40);

          const imageData = ctx.getImageData(0, 0, 40, 40);
          const data = imageData.data;

          let r = 0, g = 0, b = 0, count = 0;
          for (let i = 0; i < data.length; i += 16) {
            const pr = data[i];
            const pg = data[i + 1];
            const pb = data[i + 2];
            // Skip pure black / pure white
            if ((pr < 20 && pg < 20 && pb < 20) || (pr > 240 && pg > 240 && pb > 240)) continue;
            r += pr;
            g += pg;
            b += pb;
            count++;
          }

          if (count === 0) return resolve(DEFAULT_COLOR);

          r = Math.round(r / count);
          g = Math.round(g / count);
          b = Math.round(b / count);

          resolve(`rgba(${r}, ${g}, ${b}, 0.45)`);
        } catch {
          resolve(DEFAULT_COLOR);
        }
      };

      img.onerror = () => resolve(DEFAULT_COLOR);
    });

    colorCache.set(imageUrl, color);
    return color;
  } catch {
    return DEFAULT_COLOR;
  } finally {
    if (blobUrl) {
      try {
        URL.revokeObjectURL(blobUrl);
      } catch {}
    }
  }
}
