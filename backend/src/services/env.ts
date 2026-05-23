import fs from 'fs';
import path from 'path';

const CONFIG_FILE = path.join(process.cwd(), 'data', 'config.json');

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
    const dir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
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