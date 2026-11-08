const { readFileSync, writeFileSync, existsSync } = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const confPath = path.join(ROOT, 'src-tauri/tauri.android.conf.json');
const propPath = path.join(ROOT, 'src-tauri/gen/android/app/tauri.properties');

const conf = JSON.parse(readFileSync(confPath, 'utf-8'));

const targetVersion = process.argv[2] || conf.version || '1.0.0';
conf.version = targetVersion;

writeFileSync(confPath, JSON.stringify(conf, null, 2) + '\n');

// Parse semver for versionCode (e.g. 1.0.0 -> 1000000)
const parts = targetVersion.replace(/^v/, '').split('.').map(p => parseInt(p, 10) || 0);
const major = parts[0] || 0;
const minor = parts[1] || 0;
const patch = parts[2] || 0;
const versionCode = major * 1000000 + minor * 1000 + patch;

if (existsSync(propPath)) {
  let props = readFileSync(propPath, 'utf-8');
  props = props.replace(/tauri\.android\.versionName=.*/, `tauri.android.versionName=${targetVersion}`);
  props = props.replace(/tauri\.android\.versionCode=.*/, `tauri.android.versionCode=${versionCode}`);
  writeFileSync(propPath, props);
}

console.log(`✅ Synced mobile version to v${targetVersion} (versionCode: ${versionCode})`);
