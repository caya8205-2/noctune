import fs from 'fs';
import path from 'path';

// APP_DATA_DIR can be set at launch (e.g. via Tauri sidecar env) so the data
// folder always ends up in a predictable location. Falls back to <cwd>/data.
const DATA_DIR = process.env.APP_DATA_DIR
  ? path.resolve(process.env.APP_DATA_DIR)
  : path.join(process.cwd(), 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

export function getDataDir(): string {
    return DATA_DIR;
}

export interface EnvConfig {
    spotifyClientId: string;
    spotifyClientSecret: string;
    searchEngine: 'ytdlp' | 'spotify'; // which engine to use for search
}

const DEFAULTS: EnvConfig = {
    spotifyClientId: '',
    spotifyClientSecret: '',
    searchEngine: 'ytdlp',
};

function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-memory config (load once)
let _config: EnvConfig | null = null;

export function getEnvConfig(): EnvConfig {
    if (_config) return _config;
    ensureDataDir();
    if (!fs.existsSync(CONFIG_FILE)) {
        _config = { ...DEFAULTS };
        return _config;
    }
    try {
        const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
        _config = { ...DEFAULTS, ...JSON.parse(raw) } as EnvConfig;
        return _config;
    } catch {
        _config = { ...DEFAULTS };
        return _config;
    }
}

export function saveEnvConfig(partial: Partial<EnvConfig>): EnvConfig {
    const current = getEnvConfig();
    _config = { ...current, ...partial };
    ensureDataDir();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(_config, null, 2), 'utf-8');
    return _config;
}

export function isSpotifyConfigured(): boolean {
    const c = getEnvConfig();
    return Boolean(c.spotifyClientId && c.spotifyClientSecret);
}

