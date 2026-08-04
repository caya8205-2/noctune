import { createWriteStream } from 'node:fs';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resourceDir = path.join(rootDir, 'src-tauri', 'resources');
// Keep a consistent resource name on every platform. The backend receives this
// exact path through YT_DLP_PATH, so the filename extension is irrelevant.
const outputPath = path.join(resourceDir, 'yt-dlp.exe');
const temporaryPath = `${outputPath}.download`;
const platformMarkerPath = path.join(resourceDir, '.yt-dlp-platform');

const assetByPlatform = {
  win32: 'yt-dlp.exe',
  linux: 'yt-dlp_linux',
};

const asset = assetByPlatform[process.platform];
if (!asset) {
  throw new Error(`Bundled yt-dlp is not configured for ${process.platform}`);
}

const url = process.env.YT_DLP_DOWNLOAD_URL
  ?? `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`;

await mkdir(resourceDir, { recursive: true });
try {
  const preparedFor = (await readFile(platformMarkerPath, 'utf8')).trim();
  if (preparedFor === process.platform) {
    console.log(`[prepare:ytdlp] reusing bundled ${asset}`);
    process.exit(0);
  }
} catch {
  // A clean checkout has no prepared binary yet.
}
await rm(temporaryPath, { force: true });

console.log(`[prepare:ytdlp] downloading ${asset}`);
const response = await fetch(url);
if (!response.ok || !response.body) {
  throw new Error(`Failed to download yt-dlp (${response.status} ${response.statusText})`);
}

await pipeline(Readable.fromWeb(response.body), createWriteStream(temporaryPath, { mode: 0o755 }));
await rename(temporaryPath, outputPath);
if (process.platform !== 'win32') {
  await chmod(outputPath, 0o755);
}
await writeFile(platformMarkerPath, `${process.platform}\n`);
console.log(`[prepare:ytdlp] bundled ${outputPath}`);
