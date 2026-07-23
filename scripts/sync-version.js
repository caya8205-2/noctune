const { readFileSync, writeFileSync } = require('fs');

const root = JSON.parse(readFileSync('package.json', 'utf-8'));
const version = root.version;

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}

// Sync backend package.json
const be = JSON.parse(readFileSync('backend/package.json', 'utf-8'));
be.version = version;
writeJson('backend/package.json', be);

// Sync frontend package.json
const fe = JSON.parse(readFileSync('frontend/package.json', 'utf-8'));
fe.version = version;
writeJson('frontend/package.json', fe);

// Sync Cargo.toml
let cargo = readFileSync('src-tauri/Cargo.toml', 'utf-8');
cargo = cargo.replace(/^version = ".+"/m, `version = "${version}"`);
writeFileSync('src-tauri/Cargo.toml', cargo);

// Sync Cargo.lock
let cargoLock = readFileSync('src-tauri/Cargo.lock', 'utf-8');
cargoLock = cargoLock.replace(/(name = "noctune"\r?\nversion = ").+?"/, `$1${version}"`);
writeFileSync('src-tauri/Cargo.lock', cargoLock);

// Sync tauri.conf.json
const tauri = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf-8'));
tauri.version = version;
writeJson('src-tauri/tauri.conf.json', tauri);

// Sync npm lockfile workspace package versions without recalculating dependencies.
const lock = JSON.parse(readFileSync('package-lock.json', 'utf-8'));
lock.version = version;
if (lock.packages?.['']) lock.packages[''].version = version;
if (lock.packages?.backend) lock.packages.backend.version = version;
if (lock.packages?.frontend) lock.packages.frontend.version = version;
writeJson('package-lock.json', lock);

console.log(`✅ Synced all to v${version}`);
