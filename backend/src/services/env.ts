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
    recommendationEngine: 'hybrid-ml' | 'lastfm' | 'innertube-rs' | 'legacy' | 'spotify-radio';
    spotifyPlayback: 'youtube-match' | 'spotify-direct';
    audioQualityPreference: 'auto' | 'high';
    audioCacheLimitMb: number;
    discordRpcEnabled: boolean;
    recommendationEngineUserSelected?: boolean;
    apiKey: string;
    allowLocalhostBypass: boolean;
    downloadDir: string;
    mobileSeparateDb: boolean;
    mobileApiKey: string;
    mobileTunnelMode: 'quick' | 'token';
    mobileTunnelToken: string;
    mobileCustomDomain: string;
}

const DEFAULTS: EnvConfig = {
    spotifyClientId: '',
    spotifyClientSecret: '',
    searchEngine: 'ytdlp',
    recommendationEngine: 'innertube-rs',
    spotifyPlayback: 'youtube-match',
    audioQualityPreference: 'auto',
    audioCacheLimitMb: 1024,
    discordRpcEnabled: true,
    recommendationEngineUserSelected: false,
    apiKey: '',
    allowLocalhostBypass: true,
    downloadDir: getDefaultDownloadDir(),
    mobileSeparateDb: true,
    mobileApiKey: '',
    mobileTunnelMode: 'quick',
    mobileTunnelToken: '',
    mobileCustomDomain: '',
};

function withProcessEnv(config: EnvConfig): EnvConfig {
    const envSearchEngine = process.env.SEARCH_ENGINE;
    const envSpotifyPlayback = process.env.SPOTIFY_PLAYBACK;
    const envClientId = process.env.SPOTIFY_CLIENT_ID?.trim();
    const envClientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
    const envApiKey = process.env.NOCTUNE_API_KEY?.trim();
    const envBypass = process.env.ALLOW_LOCALHOST_BYPASS;

    // If user hasn't explicitly saved an engine choice via Settings UI, default to innertube-rs
    let recEngine = config.recommendationEngine ?? 'innertube-rs';
    if (!config.recommendationEngineUserSelected && (recEngine === 'hybrid-ml' || (recEngine as string) === 'legacy')) {
        recEngine = 'innertube-rs';
    }

    const allowLocalhostBypass =
        process.env.NOCTUNE_MOBILE_INSTANCE === '1'
            ? envBypass === 'false'
                ? false
                : envBypass === 'true'
                ? true
                : (config.allowLocalhostBypass ?? true)
            // The desktop server only listens on loopback; its client never sends a
            // key. A stale `false` on disk must not be able to lock the app out.
            : true;

    return {
        ...config,
        spotifyClientId: (envClientId || config.spotifyClientId || '').trim(),
        spotifyClientSecret: (envClientSecret || config.spotifyClientSecret || '').trim(),
        apiKey: (envApiKey || config.apiKey || '').trim(),
        allowLocalhostBypass,
        searchEngine: envSearchEngine === 'spotify' || envSearchEngine === 'ytdlp'
            ? envSearchEngine
            : config.searchEngine,
        spotifyPlayback: envSpotifyPlayback === 'spotify-direct' || envSpotifyPlayback === 'youtube-match'
            ? envSpotifyPlayback
            : (config.spotifyPlayback || 'youtube-match'),
        recommendationEngine: recEngine,
        downloadDir: config.downloadDir || getDefaultDownloadDir(),
        mobileSeparateDb: config.mobileSeparateDb ?? true,
        mobileApiKey: (config.mobileApiKey || '').trim(),
        mobileTunnelMode: config.mobileTunnelMode === 'token' ? 'token' : 'quick',
        mobileTunnelToken: (config.mobileTunnelToken || '').trim(),
        mobileCustomDomain: (config.mobileCustomDomain || '').trim(),
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

function readRawConfig(): Partial<EnvConfig> {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) as Partial<EnvConfig>;
        }
    } catch {
        // A corrupt file must not block saving a fresh config.
    }
    return {};
}

export function saveEnvConfig(partial: Partial<EnvConfig>): EnvConfig {
    const current = getEnvConfig();
    const update = { ...partial };
    if (partial.recommendationEngine) {
        update.recommendationEngineUserSelected = true;
    }
    _config = withProcessEnv({ ...current, ...update });
    ensureDataDir();

    // Persist on top of what is actually on disk, not on top of `current`:
    // `current` already carries process-level overrides (NOCTUNE_API_KEY,
    // ALLOW_LOCALHOST_BYPASS, SPOTIFY_*). The mobile worker runs with
    // ALLOW_LOCALHOST_BYPASS=false and its own API key against the shared data
    // dir, so merging `current` wrote those overrides into the desktop config —
    // silently disabling localhost bypass and replacing the desktop API key
    // every time a setting was changed from the phone.
    const raw = readRawConfig();
    const persisted: Partial<EnvConfig> = { ...raw, ...update };
    // Values forced through the environment belong to this process only. The
    // mobile worker runs with ALLOW_LOCALHOST_BYPASS=false and its own API key,
    // so writing those into the shared config disables localhost bypass and
    // replaces the desktop API key. Keep whatever the file already had.
    if (process.env.ALLOW_LOCALHOST_BYPASS) {
        if (raw.allowLocalhostBypass === undefined) delete persisted.allowLocalhostBypass;
        else persisted.allowLocalhostBypass = raw.allowLocalhostBypass;
    }
    if (process.env.NOCTUNE_API_KEY) {
        if (raw.apiKey === undefined) delete persisted.apiKey;
        else persisted.apiKey = raw.apiKey;
    }
    // The desktop surface is loopback-only and carries no credential; drop the key
    // older builds left behind so config.json stops holding a copy of it. The
    // worker never touches allowLocalhostBypass — that value describes the desktop.
    if (process.env.NOCTUNE_MOBILE_INSTANCE !== '1') {
        delete persisted.apiKey;
        persisted.allowLocalhostBypass = true;
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(persisted, null, 2), 'utf-8');
    return _config;
}

export function isSpotifyConfigured(): boolean {
    const c = getEnvConfig();
    return Boolean(c.spotifyClientId && c.spotifyClientSecret);
}

