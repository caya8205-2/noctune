// Canvas-based image color extraction for ambient dynamic theme glow
const colorCache = new Map<string, string>();

export async function extractDominantColor(imageUrl?: string): Promise<string> {
  if (!imageUrl) return 'rgba(74, 222, 128, 0.4)';
  if (colorCache.has(imageUrl)) return colorCache.get(imageUrl)!;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = imageUrl;

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve('rgba(74, 222, 128, 0.4)');

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

        if (count === 0) return resolve('rgba(74, 222, 128, 0.4)');

        r = Math.round(r / count);
        g = Math.round(g / count);
        b = Math.round(b / count);

        const colorStr = `rgba(${r}, ${g}, ${b}, 0.45)`;
        colorCache.set(imageUrl, colorStr);
        resolve(colorStr);
      } catch {
        resolve('rgba(74, 222, 128, 0.4)');
      }
    };

    img.onerror = () => resolve('rgba(74, 222, 128, 0.4)');
  });
}
