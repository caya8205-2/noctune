// Regenerates every Noctune Android/web icon asset from assets/app-icon.png
// (black rounded square + green N, 2000x2000 RGBA). Run from project root:
//   node scripts/noctune-icon-gen.js
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const ROOT = path.resolve(__dirname, '..');
const RES = path.join(ROOT, 'src-tauri/gen/android/app/src/main/res');
const SRC = path.join(ROOT, 'assets/app-icon.png');

const D = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const SAFE = 66 / 108; // adaptive-icon safe zone: mark fits inner 66dp of 108dp

const readPNG = (p) => PNG.sync.read(fs.readFileSync(p));
const writePNG = (p, png) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, PNG.sync.write(png)); };

// premultiplied area-average downscale (source always larger than target)
function downscale(src, dw, dh) {
  const out = new PNG({ width: dw, height: dh });
  const sx = src.width / dw, sy = src.height / dh;
  for (let y = 0; y < dh; y++) {
    const y0 = y * sy, y1 = (y + 1) * sy;
    for (let x = 0; x < dw; x++) {
      const x0 = x * sx, x1 = (x + 1) * sx;
      let r = 0, g = 0, b = 0, a = 0, wsum = 0;
      for (let yy = Math.floor(y0); yy < Math.ceil(y1) && yy < src.height; yy++) {
        const wy = Math.min(yy + 1, y1) - Math.max(yy, y0);
        if (wy <= 0) continue;
        for (let xx = Math.floor(x0); xx < Math.ceil(x1) && xx < src.width; xx++) {
          const wx = Math.min(xx + 1, x1) - Math.max(xx, x0);
          if (wx <= 0) continue;
          const w = wx * wy;
          const si = (yy * src.width + xx) * 4;
          const sa = src.data[si + 3] / 255;
          r += src.data[si] * sa * w; g += src.data[si + 1] * sa * w; b += src.data[si + 2] * sa * w;
          a += sa * w; wsum += w;
        }
      }
      const di = (y * dw + x) * 4;
      const oa = wsum ? a / wsum : 0;
      out.data[di + 3] = Math.round(oa * 255);
      if (oa > 0) {
        out.data[di] = Math.round(r / (a || 1)); out.data[di + 1] = Math.round(g / (a || 1)); out.data[di + 2] = Math.round(b / (a || 1));
      }
    }
  }
  return out;
}

// green N mark cropped out of the full logo (luminance separates green from black)
function extractMark(src) {
  const png = new PNG({ width: src.width, height: src.height });
  let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
  for (let i = 0; i < src.width * src.height; i++) {
    const si = i * 4;
    const a = src.data[si + 3];
    const lum = 0.2126 * src.data[si] + 0.7152 * src.data[si + 1] + 0.0722 * src.data[si + 2];
    if (a > 40 && lum > 60) {
      png.data[si] = src.data[si]; png.data[si + 1] = src.data[si + 1]; png.data[si + 2] = src.data[si + 2]; png.data[si + 3] = a;
      const x = i % src.width, y = Math.floor(i / src.width);
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  const cw = maxX - minX + 1, ch = maxY - minY + 1;
  const crop = new PNG({ width: cw, height: ch });
  PNG.bitblt(png, crop, minX, minY, cw, ch, 0, 0);
  return crop;
}

function whiteSilhouette(mark) {
  const png = new PNG({ width: mark.width, height: mark.height });
  for (let i = 0; i < mark.width * mark.height; i++) {
    const si = i * 4;
    png.data[si] = 255; png.data[si + 1] = 255; png.data[si + 2] = 255; png.data[si + 3] = mark.data[si + 3];
  }
  return png;
}

// center `logo` (bbox-fitted) in a c x c canvas; longest side = frac * c;
// bg = optional { r, g, b, coverage(x, y, c) -> 0..1 }
function compose(c, logo, frac, bg) {
  const side = Math.round(c * frac);
  const lw = Math.max(1, logo.width >= logo.height ? side : Math.round(side * logo.width / logo.height));
  const lh = Math.max(1, logo.height >= logo.width ? side : Math.round(side * logo.height / logo.width));
  const scaled = downscale(logo, lw, lh);
  const ox = Math.round((c - lw) / 2), oy = Math.round((c - lh) / 2);
  const out = new PNG({ width: c, height: c });
  for (let y = 0; y < c; y++) {
    for (let x = 0; x < c; x++) {
      const di = (y * c + x) * 4;
      let r = 0, g = 0, b = 0, a = 0;
      if (bg) {
        const cov = bg.coverage(x, y, c);
        r = bg.r; g = bg.g; b = bg.b; a = cov;
      }
      const lx = x - ox, ly = y - oy;
      if (lx >= 0 && lx < lw && ly >= 0 && ly < lh) {
        const si = (ly * lw + lx) * 4;
        const la = scaled.data[si + 3] / 255;
        r = scaled.data[si] * la + r * (1 - la);
        g = scaled.data[si + 1] * la + g * (1 - la);
        b = scaled.data[si + 2] * la + b * (1 - la);
        a = la + a * (1 - la);
      }
      out.data[di] = Math.round(r); out.data[di + 1] = Math.round(g); out.data[di + 2] = Math.round(b); out.data[di + 3] = Math.round(a * 255);
    }
  }
  return out;
}

const circleBg = { r: 0, g: 0, b: 0, coverage: (x, y, c) => Math.min(1, Math.max(0, c / 2 - Math.hypot(x + 0.5 - c / 2, y + 0.5 - c / 2) + 0.5)) };

const full = readPNG(SRC);
const mark = extractMark(full);
const mono = whiteSilhouette(mark);
console.log('source', full.width + 'x' + full.height, '| mark bbox', mark.width + 'x' + mark.height);

const MARK = 0.45;
// Notification smallIcon silhouette ratio: 0.72 gives balanced optical weight
// and padding next to the header text, matching Spotify proportions without
// towering over the title.
const STAT_MARK = 0.72;

const squareBaseAlpha = (side) => {
  const sil = downscale(full, side, side);
  for (let i = 0; i < side * side; i++) { sil.data[i * 4] = 0; sil.data[i * 4 + 1] = 0; sil.data[i * 4 + 2] = 0; }
  return sil.data;
};

for (const [k, d] of Object.entries(D)) {
  const side = Math.round(108 * d);
  const legacy = Math.round(48 * d);
  const fgAlpha = squareBaseAlpha(side);
  const lgAlpha = squareBaseAlpha(legacy);
  // adaptive foreground: full-canvas black square silhouette (bbox stays 100% so
  // bbox-normalizing launchers apply scale 1) with the mark at MARK.
  writePNG(path.join(RES, `mipmap-${k}/ic_launcher_foreground.png`), compose(side, mark, MARK, {
    r: 0, g: 0, b: 0,
    coverage: (x, y) => fgAlpha[(y * side + x) * 4 + 3] / 255,
  }));
  // legacy launcher: same rounded-square base and mark ratio
  writePNG(path.join(RES, `mipmap-${k}/ic_launcher.png`), compose(legacy, mark, MARK, {
    r: 0, g: 0, b: 0,
    coverage: (x, y) => lgAlpha[(y * legacy + x) * 4 + 3] / 255,
  }));
  // round launcher: black circle + same mark ratio
  writePNG(path.join(RES, `mipmap-${k}/ic_launcher_round.png`), compose(legacy, mark, MARK, circleBg));
  // notification small icon: N silhouette (SystemUI tints smallIcon alpha on
  // every OEM, so a filled square would render as a solid blob)
  const stat = compose(Math.round(24 * d), mono, STAT_MARK, null);
  writePNG(path.join(RES, `drawable-${k}/ic_stat_noctune.png`), stat);
}
writePNG(path.join(RES, 'drawable/ic_stat_noctune.png'), compose(96, mono, STAT_MARK, null));
// Android 12 splash masks the icon to a 2/3 circle: keep the mark small enough
// that its bbox corners stay inside that mask.
writePNG(path.join(RES, 'drawable/ic_splash_noctune.png'), compose(480, mark, 0.42, circleBg));

// web assets: keep frontend/public in sync with the current rounded logo
const fAlpha = squareBaseAlpha(512);
writePNG(path.join(ROOT, 'frontend/public/app-icon.png'), compose(512, mark, 0.66, {
  r: 0, g: 0, b: 0,
  coverage: (x, y) => fAlpha[(y * 512 + x) * 4 + 3] / 255,
}));

console.log('all icon assets regenerated with STAT_MARK =', STAT_MARK);
