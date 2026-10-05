import { chmod, copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { existsSync, createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

import { spawn } from 'node:child_process';

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

  return 'v0.2.0';
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
      console.warn(`[prepare:spotstream] direct binary download returned ${response.status} ${response.statusText}`);
    }
  } catch (err) {
    console.warn(`[prepare:spotstream] direct binary download failed: ${err.message}`);
  }

  // Fallback 1: If direct raw binary is not available (e.g. v0.2.0 is pending and v0.1.0 used archive bundling),
  // extract from v0.1.0 archive release asset (.zip on Windows, .tar.gz on Unix)
  if (!downloadSuccess) {
    const archiveInfo = {
      win32: { name: 'spotstream-windows-x86_64.zip', type: 'zip' },
      linux: { name: 'spotstream-linux-x86_64.tar.gz', type: 'tar' },
      darwin: { name: process.arch === 'arm64' ? 'spotstream-macos-aarch64.tar.gz' : 'spotstream-macos-x86_64.tar.gz', type: 'tar' },
    }[process.platform];

    if (archiveInfo) {
      const archiveUrl = `https://github.com/caya8205-2/spotstream/releases/download/v0.1.0/${archiveInfo.name}`;
      console.log(`[prepare:spotstream] attempting archive fallback from ${archiveUrl}`);
      try {
        const archRes = await fetch(archiveUrl);
        if (archRes.ok && archRes.body) {
          const tempArchive = path.join(resourceDir, `spotstream-archive.${archiveInfo.type === 'zip' ? 'zip' : 'tar.gz'}`);
          await pipeline(Readable.fromWeb(archRes.body), createWriteStream(tempArchive));

          if (archiveInfo.type === 'zip') {
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
              proc.on('close', async (code) => {
                if (code !== 0) return reject(new Error(`tar exited with ${code}`));
                try {
                  const extracted = path.join(resourceDir, 'spotstream');
                  if (outputPath !== extracted && existsSync(extracted)) {
                    await rename(extracted, outputPath).catch(() => {});
                  }
                  resolve();
                } catch (e) {
                  reject(e);
                }
              });
            });
          }
          await rm(tempArchive, { force: true });
          if (existsSync(outputPath)) {
            console.log(`[prepare:spotstream] successfully extracted fallback binary from ${archiveInfo.name}`);
            downloadSuccess = true;
          }
        }
      } catch (err) {
        console.warn(`[prepare:spotstream] archive fallback failed: ${err.message}`);
      }
    }
  }

  // Fallback 2: Local sibling repository (useful during local development / offline build)
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
