import { readFileSync, writeFileSync } from 'fs';

const root = JSON.parse(readFileSync('package.json', 'utf-8'));
const version = root.version;

// Sync backend package.json
const be = JSON.parse(readFileSync('backend/package.json', 'utf-8'));
be.version = version;
writeFileSync('backend/package.json', JSON.stringify(be, null, 2) + '\n');

// Sync frontend package.json
const fe = JSON.parse(readFileSync('frontend/package.json', 'utf-8'));
fe.version = version;
writeFileSync('frontend/package.json', JSON.stringify(fe, null, 2) + '\n');

// Sync Cargo.toml
let cargo = readFileSync('src-tauri/Cargo.toml', 'utf-8');
cargo = cargo.replace(/^version = ".+"/m, `version = "${version}"`);
writeFileSync('src-tauri/Cargo.toml', cargo);

// Sync tauri.conf.json
const tauri = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf-8'));
tauri.version = version;
writeFileSync('src-tauri/tauri.conf.json', JSON.stringify(tauri, null, 2) + '\n');

console.log(`✅ Synced all to v${version}`);