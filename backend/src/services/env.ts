import fs from 'fs';
import path from 'path';

import os from 'os';

// APP_DATA_DIR can be set at launch (e.g. via Tauri sidecar env) so the data
// folder always ends up in a predictable location. Falls back to <cwd>/data.
const DATA_DIR = process.env.APP_DATA_DIR
  ? path.resolve(process.env.APP_DATA_DIR)
  : path.join(process.cwd(), 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

export function getDataDir(): string {
    return DATA_DIR;
}

export function getDefaultDownloadDir(): string {
    return path.join(process.env.USERPROFILE || os.homedir(), 'Downloads', 'Noctune');
}

export interface EnvConfig {
    spotifyClientId: string;
    spotifyClientSecret: string;
    searchEngine: 'ytdlp' | 'spotify'; // which engine to use for search
    recommendationEngine: 'hybrid-ml' | 'lastfm' | 'innertube-rs' | 'legacy';
    audioQualityPreference: 'auto' | 'high';
    audioCacheLimitMb: number;
    discordRpcEnabled: boolean;
    recommendationEngineUserSelected?: boolean;
    apiKey: string;
    allowLocalhostBypass: boolean;
    downloadDir: string;
}

const DEFAULTS: EnvConfig = {
    spotifyClientId: '',
    spotifyClientSecret: '',
    searchEngine: 'ytdlp',
    recommendationEngine: 'innertube-rs',
    audioQualityPreference: 'auto',
    audioCacheLimitMb: 1024,
    discordRpcEnabled: true,
    recommendationEngineUserSelected: false,
    apiKey: '',
    allowLocalhostBypass: true,
    downloadDir: getDefaultDownloadDir(),
};

function withProcessEnv(config: EnvConfig): EnvConfig {
    const envSearchEngine = process.env.SEARCH_ENGINE;
    const envClientId = process.env.SPOTIFY_CLIENT_ID?.trim();
    const envClientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
    const envApiKey = process.env.NOCTUNE_API_KEY?.trim();

    // If user hasn't explicitly saved an engine choice via Settings UI, default to innertube-rs
    let recEngine = config.recommendationEngine ?? 'innertube-rs';
    if (!config.recommendationEngineUserSelected && (recEngine === 'hybrid-ml' || (recEngine as string) === 'legacy')) {
        recEngine = 'innertube-rs';
    }

    return {
        ...config,
        spotifyClientId: (envClientId || config.spotifyClientId || '').trim(),
        spotifyClientSecret: (envClientSecret || config.spotifyClientSecret || '').trim(),
        apiKey: (envApiKey || config.apiKey || '').trim(),
        allowLocalhostBypass: config.allowLocalhostBypass ?? true,
        searchEngine: envSearchEngine === 'spotify' || envSearchEngine === 'ytdlp'
            ? envSearchEngine
            : config.searchEngine,
        recommendationEngine: recEngine,
        downloadDir: config.downloadDir || getDefaultDownloadDir(),
    };
}

function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-memory config (load once)
let _config: EnvConfig | null = null;

export function getEnvConfig(): EnvConfig {
    if (_config) return _config;
    ensureDataDir();
    if (!fs.existsSync(CONFIG_FILE)) {
        _config = withProcessEnv({ ...DEFAULTS });
        return _config;
    }
    try {
        const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<EnvConfig>;
        _config = withProcessEnv({ ...DEFAULTS, ...parsed });
        // If config on disk was stale hybrid-ml, update disk file to lastfm
        if (parsed.recommendationEngine === 'hybrid-ml' && !parsed.recommendationEngineUserSelected) {
            parsed.recommendationEngine = 'innertube-rs';
        }
        return _config;
    } catch {
        _config = withProcessEnv({ ...DEFAULTS });
        return _config;
    }
}

export function saveEnvConfig(partial: Partial<EnvConfig>): EnvConfig {
    const current = getEnvConfig();
    const update = { ...partial };
    if (partial.recommendationEngine) {
        update.recommendationEngineUserSelected = true;
    }
    _config = withProcessEnv({ ...current, ...update });
    ensureDataDir();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...current, ...update }, null, 2), 'utf-8');
    return _config;
}

export function isSpotifyConfigured(): boolean {
    const c = getEnvConfig();
    return Boolean(c.spotifyClientId && c.spotifyClientSecret);
}

