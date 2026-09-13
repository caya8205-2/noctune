import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

let version = process.argv[2];
if (!version) {
  try {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
    version = pkg.version;
  } catch {
    version = '';
  }
}

version = (version || '').replace(/^v/, '').trim();
if (!version) {
  console.error('❌ Version argument is required (e.g. node scripts/generate-latest-json.mjs 4.4.1)');
  process.exit(1);
}

let notes = '';
if (existsSync('RELEASE_NOTES.md')) {
  notes = readFileSync('RELEASE_NOTES.md', 'utf-8').trim();
}

const platforms = {};
const repoOwner = 'caya8205-2';
const repoName = 'noctune';
const releaseBaseUrl = `https://github.com/${repoOwner}/${repoName}/releases/download/v${version}`;

// Look for Windows NSIS zip + signature (or standalone setup exe + sig)
const windowsDirCandidates = [
  'dist/windows',
  join('src-tauri', 'target', 'release', 'bundle', 'nsis'),
];

for (const dir of windowsDirCandidates) {
  if (!existsSync(dir)) continue;
  const files = readdirSync(dir);
  const zipFile = files.find((f) => f.endsWith('.nsis.zip'));
  const zipSigFile = files.find((f) => f.endsWith('.nsis.zip.sig') || f.endsWith('.zip.sig'));

  if (zipFile && zipSigFile) {
    const signature = readFileSync(join(dir, zipSigFile), 'utf-8').trim();
    platforms['windows-x86_64'] = {
      signature,
      url: `${releaseBaseUrl}/${zipFile}`,
    };
    console.log(`✅ Found Windows updater artifact: ${zipFile}`);
    break;
  }

  const exeFile = files.find((f) => f.endsWith('-setup.exe') || f.endsWith('.exe'));
  const exeSigFile = exeFile ? files.find((f) => f === `${exeFile}.sig` || f.endsWith('.exe.sig') || f.endsWith('.sig')) : null;

  if (exeFile && exeSigFile) {
    const signature = readFileSync(join(dir, exeSigFile), 'utf-8').trim();
    platforms['windows-x86_64'] = {
      signature,
      url: `${releaseBaseUrl}/${exeFile}`,
    };
    console.log(`✅ Found Windows updater artifact: ${exeFile}`);
    break;
  }
}

// Look for Linux AppImage tar.gz + signature (or AppImage + sig)
const linuxDirCandidates = [
  'dist/linux',
  join('src-tauri', 'target', 'release', 'bundle', 'appimage'),
];

for (const dir of linuxDirCandidates) {
  if (!existsSync(dir)) continue;
  const files = readdirSync(dir);
  const tarFile = files.find((f) => f.endsWith('.AppImage.tar.gz') || f.endsWith('.appimage.tar.gz'));
  const tarSigFile = files.find((f) => f.endsWith('.AppImage.tar.gz.sig') || f.endsWith('.appimage.tar.gz.sig'));

  if (tarFile && tarSigFile) {
    const signature = readFileSync(join(dir, tarSigFile), 'utf-8').trim();
    platforms['linux-x86_64'] = {
      signature,
      url: `${releaseBaseUrl}/${tarFile}`,
    };
    console.log(`✅ Found Linux updater artifact: ${tarFile}`);
    break;
  }

  const appImageFile = files.find((f) => f.endsWith('.AppImage') || f.endsWith('.appimage'));
  const appImageSigFile = appImageFile ? files.find((f) => f === `${appImageFile}.sig` || f.endsWith('.AppImage.sig') || f.endsWith('.sig')) : null;

  if (appImageFile && appImageSigFile) {
    const signature = readFileSync(join(dir, appImageSigFile), 'utf-8').trim();
    platforms['linux-x86_64'] = {
      signature,
      url: `${releaseBaseUrl}/${appImageFile}`,
    };
    console.log(`✅ Found Linux updater artifact: ${appImageFile}`);
    break;
  }
}

const latestJson = {
  version: `v${version}`,
  notes,
  pub_date: new Date().toISOString(),
  platforms,
};

const outputPath = process.argv[3] || 'latest.json';
writeFileSync(outputPath, JSON.stringify(latestJson, null, 2), 'utf-8');
console.log(`✅ Generated ${outputPath} for v${version} with platforms: ${Object.keys(platforms).join(', ') || 'none'}`);
