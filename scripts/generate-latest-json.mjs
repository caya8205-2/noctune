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

// Look for Windows NSIS zip + signature
const windowsDirCandidates = [
  'dist/windows',
  join('src-tauri', 'target', 'release', 'bundle', 'nsis'),
];

for (const dir of windowsDirCandidates) {
  if (!existsSync(dir)) continue;
  const files = readdirSync(dir);
  const zipFile = files.find((f) => f.endsWith('.nsis.zip'));
  const sigFile = files.find((f) => f.endsWith('.nsis.zip.sig') || f.endsWith('.zip.sig'));

  if (zipFile && sigFile) {
    const signature = readFileSync(join(dir, sigFile), 'utf-8').trim();
    platforms['windows-x86_64'] = {
      signature,
      url: `${releaseBaseUrl}/${zipFile}`,
    };
    console.log(`✅ Found Windows updater artifact: ${zipFile}`);
    break;
  }
}

// Look for Linux AppImage tar.gz + signature
const linuxDirCandidates = [
  'dist/linux',
  join('src-tauri', 'target', 'release', 'bundle', 'appimage'),
];

for (const dir of linuxDirCandidates) {
  if (!existsSync(dir)) continue;
  const files = readdirSync(dir);
  const tarFile = files.find((f) => f.endsWith('.AppImage.tar.gz') || f.endsWith('.appimage.tar.gz'));
  const sigFile = files.find((f) => f.endsWith('.AppImage.tar.gz.sig') || f.endsWith('.appimage.tar.gz.sig'));

  if (tarFile && sigFile) {
    const signature = readFileSync(join(dir, sigFile), 'utf-8').trim();
    platforms['linux-x86_64'] = {
      signature,
      url: `${releaseBaseUrl}/${tarFile}`,
    };
    console.log(`✅ Found Linux updater artifact: ${tarFile}`);
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
