import { chmod, copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { existsSync, createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resourceDir = path.join(rootDir, 'src-tauri', 'resources');
const platformMarkerPath = path.join(resourceDir, '.spotstream-platform');

// Keep a consistent resource name on every platform (like yt-dlp.exe and innertube.exe).
// The backend and Tauri resolve this exact path through SPOTSTREAM_PATH.
const outputBinaryName = 'spotstream.exe';
const outputPath = path.join(resourceDir, outputBinaryName);
const temporaryPath = `${outputPath}.download`;

const assetByPlatform = {
  win32: 'spotstream-windows-x86_64.exe',
  linux: 'spotstream-linux-x86_64',
  darwin: process.arch === 'arm64' ? 'spotstream-macos-aarch64' : 'spotstream-macos-x86_64',
};

const asset = assetByPlatform[process.platform];
if (!asset) {
  throw new Error(`Bundled spotstream is not configured for platform: ${process.platform}`);
}

async function resolveLatestVersion() {
  if (process.env.SPOTSTREAM_VERSION) {
    const v = process.env.SPOTSTREAM_VERSION.trim();
    return v.startsWith('v') ? v : `v${v}`;
  }

  try {
    const res = await fetch('https://crates.io/api/v1/crates/spotstream', {
      headers: { 'User-Agent': 'Noctune-Build-Script (github.com/caya8205-2/noctune)' },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      const latest = data?.crate?.max_version || data?.crate?.newest_version;
      if (latest) {
        return `v${latest}`;
      }
    }
  } catch (err) {
    console.warn(`[prepare:spotstream] unable to fetch latest version from crates.io (${err.message}), falling back`);
  }

  return 'v0.1.0';
}

const SPOTSTREAM_VERSION = await resolveLatestVersion();
const downloadUrl = process.env.SPOTSTREAM_DOWNLOAD_URL
  ?? `https://github.com/caya8205-2/spotstream/releases/download/${SPOTSTREAM_VERSION}/${asset}`;

await mkdir(resourceDir, { recursive: true });

let alreadyPrepared = false;
try {
  const preparedFor = (await readFile(platformMarkerPath, 'utf8')).trim();
  if (preparedFor === `${process.platform}-${SPOTSTREAM_VERSION}` && existsSync(outputPath)) {
    console.log(`[prepare:spotstream] reusing bundled ${outputBinaryName} (${SPOTSTREAM_VERSION})`);
    alreadyPrepared = true;
  }
} catch {
  // A clean checkout has no prepared binary yet.
}

if (!alreadyPrepared) {
  let downloadSuccess = false;
  await rm(temporaryPath, { force: true });

  console.log(`[prepare:spotstream] downloading ${asset} from ${downloadUrl}`);
  try {
    const response = await fetch(downloadUrl);
    if (response.ok && response.body) {
      await pipeline(Readable.fromWeb(response.body), createWriteStream(temporaryPath, { mode: 0o755 }));
      await rename(temporaryPath, outputPath);
      downloadSuccess = true;
    } else {
      console.warn(`[prepare:spotstream] download returned ${response.status} ${response.statusText}`);
    }
  } catch (err) {
    console.warn(`[prepare:spotstream] download failed: ${err.message}`);
  }

  // Fallback to local sibling repository if available (useful during local development / offline build)
  if (!downloadSuccess) {
    const localSiblingBin = path.join(
      rootDir,
      '..',
      'spotstream',
      'target',
      'release',
      process.platform === 'win32' ? 'spotstream.exe' : 'spotstream',
    );
    if (existsSync(localSiblingBin)) {
      console.log(`[prepare:spotstream] copying local build from ${localSiblingBin}`);
      await copyFile(localSiblingBin, outputPath);
      downloadSuccess = true;
    }
  }

  if (!downloadSuccess) {
    throw new Error(`Failed to obtain spotstream binary for ${process.platform}. Please ensure the release asset exists or build spotstream locally.`);
  }

  if (process.platform !== 'win32') {
    await chmod(outputPath, 0o755);
  }

  await writeFile(platformMarkerPath, `${process.platform}-${SPOTSTREAM_VERSION}\n`);
  console.log(`[prepare:spotstream] bundled ${outputPath}`);
}
