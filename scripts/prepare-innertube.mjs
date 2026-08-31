import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resourceDir = path.join(rootDir, 'src-tauri', 'resources');
const platformMarkerPath = path.join(resourceDir, '.innertube-platform');

// Keep a consistent resource name on every platform (like yt-dlp.exe).
// The backend and Tauri resolve this exact path through INNERTUBE_PATH.
const outputBinaryName = 'innertube.exe';
const outputPath = path.join(resourceDir, outputBinaryName);

const assetByPlatform = {
  win32: { name: 'innertube-windows-x86_64.zip', type: 'zip' },
  linux: { name: 'innertube-linux-x86_64.tar.gz', type: 'tar' },
  darwin: { name: process.arch === 'arm64' ? 'innertube-macos-aarch64.tar.gz' : 'innertube-macos-x86_64.tar.gz', type: 'tar' },
};

const assetInfo = assetByPlatform[process.platform];
if (!assetInfo) {
  throw new Error(`Bundled innertube is not configured for platform: ${process.platform}`);
}

const INNERTUBE_VERSION = 'v0.8.0';
const url = process.env.INNERTUBE_DOWNLOAD_URL
  ?? `https://github.com/caya8205-2/innertube-rs/releases/download/${INNERTUBE_VERSION}/${assetInfo.name}`;

await mkdir(resourceDir, { recursive: true });

try {
  const preparedFor = (await readFile(platformMarkerPath, 'utf8')).trim();
  if (preparedFor === `${process.platform}-${INNERTUBE_VERSION}`) {
    console.log(`[prepare:innertube] reusing bundled ${outputBinaryName}`);
    process.exit(0);
  }
} catch {
  // A clean checkout has no prepared binary yet.
}

console.log(`[prepare:innertube] downloading ${assetInfo.name} from ${url}`);
const response = await fetch(url);
if (!response.ok || !response.body) {
  throw new Error(`Failed to download innertube (${response.status} ${response.statusText})`);
}

const tempArchive = path.join(resourceDir, `downloaded-innertube.${assetInfo.type === 'zip' ? 'zip' : 'tar.gz'}`);
await pipeline(Readable.fromWeb(response.body), createWriteStream(tempArchive));

// Extract without extra external npm dependencies using native tools (tar / powershell Expand-Archive)
if (assetInfo.type === 'zip') {
  await new Promise((resolve, reject) => {
    const ps = spawn('powershell', [
      '-NoProfile',
      '-Command',
      `Expand-Archive -Path "${tempArchive}" -DestinationPath "${resourceDir}" -Force`,
    ], { stdio: 'inherit' });
    ps.on('close', (code) => code === 0 ? resolve() : reject(new Error(`Expand-Archive exited with ${code}`)));
  });
} else {
  await new Promise((resolve, reject) => {
    const proc = spawn('tar', ['-xzf', tempArchive, '-C', resourceDir], { stdio: 'inherit' });
    proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`tar exited with ${code}`)));
  });
}

await rm(tempArchive, { force: true });

if (process.platform !== 'win32') {
  await chmod(outputPath, 0o755);
}

await writeFile(platformMarkerPath, `${process.platform}-${INNERTUBE_VERSION}\n`);
console.log(`[prepare:innertube] bundled ${outputPath}`);
