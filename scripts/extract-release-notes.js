const { readFileSync, writeFileSync, existsSync } = require('fs');

const changelogPath = 'CHANGELOG.md';
const outputPath = process.argv[3] || 'RELEASE_NOTES.md';

let version = process.argv[2];
if (!version) {
  try {
    const root = JSON.parse(readFileSync('package.json', 'utf-8'));
    version = root.version;
  } catch {
    version = '';
  }
}

version = (version || '').replace(/^v/, '').trim();

if (!existsSync(changelogPath)) {
  console.warn(`⚠️ ${changelogPath} not found.`);
  writeFileSync(outputPath, '', 'utf-8');
  process.exit(0);
}

const content = readFileSync(changelogPath, 'utf-8').replace(/\r\n/g, '\n');
const escapedVersion = version.replace(/\./g, '\\.');
const regex = new RegExp(`##\\s+v?${escapedVersion}[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s+v|$)`, 'i');
const match = content.match(regex);

if (match && match[1].trim()) {
  const notes = match[1].trim() + '\n';
  writeFileSync(outputPath, notes, 'utf-8');
  console.log(`✅ Extracted release notes for v${version} -> ${outputPath}`);
} else {
  console.warn(`⚠️ No changelog section found for v${version}`);
  writeFileSync(outputPath, '', 'utf-8');
}
