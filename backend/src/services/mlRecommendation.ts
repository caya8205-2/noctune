import fs from 'fs';
import path from 'path';
import { getDataDir } from './env.js';
import { getStore } from './cache.js';
import type { CachedTrack, Track } from '../types/index.js';

// ── Types & Data Structures ──────────────────────────────────────────────────

export interface PlayLogEvent {
  trackId: string;
  artist: string;
  title: string;
  album?: string;
  timestamp: number;
  hourOfDay: number;
  dayOfWeek: number;
}

export interface TransitionStats {
  fromId: string;
  toId: string;
  count: number;
}

export interface MlModelStats {
  playLogCount: number;
  uniqueTracksCount: number;
  transitionPairsCount: number;
  lastTrainedAt: number;
  isReady: boolean;
  hasSeedModel: boolean;
  seedTrackCount: number;
}

const PLAY_LOG_FILE = path.join(getDataDir(), 'play-log.json');

// In-memory model cache
let playLogCache: PlayLogEvent[] | null = null;
let transitionMatrixCache: Map<string, Map<string, number>> | null = null;
let lastModelTrainTime = 0;

// ── Persistence Helpers ───────────────────────────────────────────────────────

function ensureDataDir() {
  const dir = getDataDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadPlayLog(): PlayLogEvent[] {
  if (playLogCache) return playLogCache;
  ensureDataDir();
  if (!fs.existsSync(PLAY_LOG_FILE)) {
    playLogCache = [];
    return playLogCache;
  }
  try {
    const raw = fs.readFileSync(PLAY_LOG_FILE, 'utf-8');
    playLogCache = JSON.parse(raw);
    return playLogCache || [];
  } catch {
    playLogCache = [];
    return playLogCache;
  }
}

function savePlayLog(log: PlayLogEvent[]): void {
  ensureDataDir();
  playLogCache = log;
  try {
    fs.writeFileSync(PLAY_LOG_FILE, JSON.stringify(log, null, 2), 'utf-8');
  } catch (err) {
    console.error('[ml] Failed to save play log:', err);
  }
}

// ── Log Event Recording ───────────────────────────────────────────────────────

let lastRecordedTrackId: string | null = null;

export function recordMlPlayEvent(track: Track): void {
  const log = loadPlayLog();
  const date = new Date();
  const event: PlayLogEvent = {
    trackId: track.id,
    artist: track.artist || '',
    title: track.title || '',
    album: track.album,
    timestamp: Date.now(),
    hourOfDay: date.getHours(),
    dayOfWeek: date.getDay(),
  };

  log.push(event);
  if (log.length > 5000) {
    log.splice(0, log.length - 5000);
  }
  savePlayLog(log);

  // Update in-memory transition matrix
  if (lastRecordedTrackId && lastRecordedTrackId !== track.id) {
    updateTransition(lastRecordedTrackId, track.id);
  }
  lastRecordedTrackId = track.id;

  // Invalidate transition matrix cache so it rebuilds on demand
  transitionMatrixCache = null;
}

// ── Seed Model Loader ─────────────────────────────────────────────────────────

interface SeedModelData {
  version: number;
  trainedAt?: number;
  generatedAt?: number;
  trackCount?: number;
  tracks?: Record<string, any>;
  transitions: Record<string, Record<string, number>>;
}

let seedModelCache: SeedModelData | null = null;
let seedModelFileMtime = 0;

function loadSeedModel(): SeedModelData | null {
  try {
    const execDir = path.dirname(process.execPath);
    const candidatePaths = [
      path.join(getDataDir(), 'seed-model.json'),
      path.join(process.cwd(), 'src/data/seed-model.json'),
      path.join(process.cwd(), 'dist/data/seed-model.json'),
      path.join(__dirname, '../data/seed-model.json'),
      path.join(__dirname, '../../src/data/seed-model.json'),
      path.join(execDir, 'seed-model.json'),
      path.join(execDir, 'resources', 'seed-model.json'),
      path.join(execDir, '..', 'resources', 'seed-model.json'),
      path.join(execDir, '..', 'resources', 'backend', 'src', 'data', 'seed-model.json'),
    ];
    for (const p of candidatePaths) {
      if (p && fs.existsSync(p)) {
        const stat = fs.statSync(p);
        if (seedModelCache && stat.mtimeMs === seedModelFileMtime) {
          return seedModelCache;
        }
        const raw = fs.readFileSync(p, 'utf-8');
        seedModelCache = JSON.parse(raw);
        seedModelFileMtime = stat.mtimeMs;
        transitionMatrixCache = null;
        return seedModelCache;
      }
    }
  } catch {
    // If seed model file is missing or unparseable, ignore
  }
  return null;
}

function buildTransitionMatrix(): Map<string, Map<string, number>> {
  if (transitionMatrixCache) return transitionMatrixCache;
  const matrix = new Map<string, Map<string, number>>();

  // 1. Hydrate pre-trained seed model weights (Base Model)
  const seedModel = loadSeedModel();
  if (seedModel && seedModel.transitions) {
    for (const [fromId, targetMap] of Object.entries(seedModel.transitions)) {
      if (!matrix.has(fromId)) matrix.set(fromId, new Map());
      const currentMap = matrix.get(fromId)!;
      for (const [toId, weight] of Object.entries(targetMap)) {
        currentMap.set(toId, (currentMap.get(toId) ?? 0) + weight);
      }
    }
  }

  // 2. Overlay local user play logs (On-the-go Adaptation)
  const log = loadPlayLog();

  for (let i = 0; i < log.length - 1; i++) {
    const fromId = log[i].trackId;
    const toId = log[i + 1].trackId;
    const timeDiff = log[i + 1].timestamp - log[i].timestamp;

    if (timeDiff > 0 && timeDiff <= 30 * 60 * 1000 && fromId !== toId) {
      if (!matrix.has(fromId)) matrix.set(fromId, new Map());
      const targetMap = matrix.get(fromId)!;
      targetMap.set(toId, (targetMap.get(toId) ?? 0) + 1);
    }
  }

  transitionMatrixCache = matrix;
  lastModelTrainTime = Date.now();
  return matrix;
}

function updateTransition(fromId: string, toId: string) {
  const matrix = buildTransitionMatrix();
  if (!matrix.has(fromId)) matrix.set(fromId, new Map());
  const targetMap = matrix.get(fromId)!;
  targetMap.set(toId, (targetMap.get(toId) ?? 0) + 1);
}

// ── Text Token Similarity (Metadata TF-IDF approximation) ────────────────────

function normalizeText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 1);
}

function parseArtistList(artistStr: string): string[] {
  return (artistStr || '')
    .toLowerCase()
    .replace(/- topic$/gi, '')
    .split(/[,&\/\\|]|\bfeat\b|\bft\b/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

function computeMetadataSimilarity(trackA: Track, trackB: CachedTrack): number {
  if (!trackA || !trackB) return 0;

  const artistsA = parseArtistList(trackA.artist || '');
  const artistsB = parseArtistList(trackB.artist || '');

  let artistScore = 0;
  if (artistsA.length > 0 && artistsB.length > 0) {
    const setA = new Set(artistsA);
    const hasMatch = artistsB.some((b) => setA.has(b) || artistsA.some((a) => a.includes(b) || b.includes(a)));
    if (hasMatch) artistScore = 1.0;
  }

  // Token Jaccard similarity for title + album
  const tokensA = new Set([...normalizeText(trackA.title || ''), ...normalizeText(trackA.album || '')]);
  const tokensB = new Set([...normalizeText(trackB.title || ''), ...normalizeText(trackB.album || '')]);

  if (tokensA.size === 0 || tokensB.size === 0) return artistScore * 0.7;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }
  const tokenJaccard = intersection / Math.max(1, tokensA.size + tokensB.size - intersection);

  return artistScore * 0.65 + tokenJaccard * 0.35;
}

export interface ScoredMlPrediction {
  track: Track;
  transitionScore: number;
  metadataScore: number;
  playCountScore: number;
  recencyScore: number;
  nightBonus: number;
  totalScore: number;
}

// ── ML Prediction Engine ─────────────────────────────────────────────────────

export function predictMlRecommendationsWithScores(
  seedTrack: Track,
  options: { excludeIds?: Set<string>; limit?: number; nightOnly?: boolean } = {}
): ScoredMlPrediction[] {
  const limit = options.limit ?? 10;
  const excludeIds = options.excludeIds ?? new Set();
  const store = getStore();
  const allCachedTracks = Object.values(store.tracks) as CachedTrack[];
  if (allCachedTracks.length === 0) return [];

  const matrix = buildTransitionMatrix();
  const seedTransitions = matrix.get(seedTrack.id) || new Map<string, number>();
  const currentHour = new Date().getHours();
  const isNightTime = options.nightOnly || (currentHour >= 22 || currentHour <= 4);

  const scoredCandidates: ScoredMlPrediction[] = [];

  for (const candidate of allCachedTracks) {
    const candidateId = candidate.id;
    if (
      candidateId === seedTrack.id ||
      excludeIds.has(candidateId) ||
      (candidate.spotifyId && excludeIds.has(candidate.spotifyId)) ||
      (candidate.youtubeId && excludeIds.has(candidate.youtubeId))
    ) {
      continue;
    }

    // 1. Transition Score (Markov chain)
    const transitionCount = seedTransitions.get(candidateId) ?? 0;
    const transitionScore = Math.min(1.0, transitionCount / 3.0);

    // 2. Metadata / Content Similarity (Artist + Title Jaccard)
    const metadataScore = computeMetadataSimilarity(seedTrack, candidate);

    // 3. User Feedback & Recency Context
    let playCountScore = Math.min(1.0, (candidate.playCount ?? 0) / 10.0);
    if (transitionScore === 0 && metadataScore < 0.25) {
      playCountScore *= 0.15; // Prevent unrelated tracks from swamping recommendations
    }
    const daysSincePlayed = candidate.lastPlayed
      ? (Date.now() - candidate.lastPlayed) / (1000 * 60 * 60 * 24)
      : 30;
    const recencyScore = Math.exp(-daysSincePlayed / 14.0); // 14-day half-life decay

    // 4. Nightly Context Affinity & Noise Penalty
    let nightBonus = 0;
    if (isNightTime) {
      const log = loadPlayLog();
      const nightPlays = log.filter(
        (e) =>
          (e.trackId === candidateId ||
            e.trackId === candidate.spotifyId ||
            e.trackId === candidate.youtubeId) &&
          (e.hourOfDay >= 22 || e.hourOfDay <= 4)
      ).length;
      if (nightPlays > 0) nightBonus = 0.08;
    }

    const combined = `${candidate.title || ''} ${candidate.artist || ''}`.toLowerCase();
    let noisePenalty = 0;
    if (
      combined.includes('sings') ||
      combined.includes('singing') ||
      combined.includes('karaoke') ||
      combined.includes('ai cover') ||
      combined.includes('reaction')
    ) {
      noisePenalty = 0.35;
    }

    // Combined Hybrid Weighted Score
    const totalScore = Math.max(
      0,
      transitionScore * 0.4 +
        metadataScore * 0.35 +
        playCountScore * 0.15 +
        recencyScore * 0.1 +
        nightBonus -
        noisePenalty
    );

    if (totalScore > 0.05) {
      scoredCandidates.push({
        track: candidate as Track,
        transitionScore,
        metadataScore,
        playCountScore,
        recencyScore,
        nightBonus,
        totalScore,
      });
    }
  }

  // Sort by score descending and return top candidates
  scoredCandidates.sort((a, b) => b.totalScore - a.totalScore);
  return scoredCandidates.slice(0, limit);
}

export function predictMlRecommendations(
  seedTrack: Track,
  options: { excludeIds?: Set<string>; limit?: number; nightOnly?: boolean } = {}
): Track[] {
  return predictMlRecommendationsWithScores(seedTrack, options).map((item) => item.track);
}

// ── Import Production Dataset & Train Base Model ──────────────────────────────

export function importProdDataset(): { ok: boolean; importedTracks: number; totalPlays: number; pathUsed: string } {
  const appData = process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : '');
  const candidatePaths = [
    path.join(getDataDir(), 'songs.json'),
    path.join(process.cwd(), 'data', 'songs.json'),
    path.join(process.cwd(), 'backend', 'data', 'songs.json'),
    path.join(appData, 'dev.noctune.desktop', 'songs.json'),
    path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming', 'dev.noctune.desktop', 'songs.json'),
    'C:\\Users\\Caya\\AppData\\Roaming\\dev.noctune.desktop\\songs.json',
  ];

  let prodSongsFile = '';
  for (const p of candidatePaths) {
    if (p && fs.existsSync(p)) {
      prodSongsFile = p;
      break;
    }
  }

  if (!prodSongsFile) {
    throw new Error('Dataset songs.json not found in local data directory or AppData Roaming');
  }

  const raw = fs.readFileSync(prodSongsFile, 'utf-8');
  const prodData = JSON.parse(raw) as { tracks: Record<string, CachedTrack> };
  const prodTracks = Object.values(prodData.tracks || {});

  const store = getStore();
  let importedTracks = 0;
  let totalPlays = 0;
  const newLogEvents: PlayLogEvent[] = [];

  for (const prodTrack of prodTracks) {
    if (!prodTrack || !prodTrack.id) continue;
    store.tracks[prodTrack.id] = {
      ...store.tracks[prodTrack.id],
      ...prodTrack,
    };
    importedTracks++;
    const plays = prodTrack.playCount ?? 0;
    totalPlays += plays;

    // Generate play log entries for tracks with play history
    const playTime = prodTrack.lastPlayed || Date.now();
    const date = new Date(playTime);
    for (let i = 0; i < Math.min(plays, 5); i++) {
      newLogEvents.push({
        trackId: prodTrack.id,
        artist: prodTrack.artist || '',
        title: prodTrack.title || '',
        album: prodTrack.album,
        timestamp: playTime - i * 1000 * 60 * 30, // 30 min intervals
        hourOfDay: date.getHours(),
        dayOfWeek: date.getDay(),
      });
    }
  }

  // Save updated store
  const saveStore = (getStore() as any)._saveStore || undefined;
  if (saveStore) saveStore();

  const currentLog = loadPlayLog();
  const seenKeys = new Set<string>();
  const mergedLog: PlayLogEvent[] = [];

  for (const event of [...currentLog, ...newLogEvents]) {
    const key = `${event.trackId}_${event.timestamp}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      mergedLog.push(event);
    }
  }

  if (mergedLog.length > 5000) mergedLog.splice(0, mergedLog.length - 5000);
  savePlayLog(mergedLog);

  // Invalidate transition matrix cache so it rebuilds on demand
  transitionMatrixCache = null;

  return {
    ok: true,
    importedTracks,
    totalPlays,
    pathUsed: prodSongsFile,
  };
}

// ── Nightly Mix / Personalized Mixes Generator ────────────────────────────────

export function generateMlNightlyMixes(limit = 12): Track[] {
  const log = loadPlayLog();
  const store = getStore();
  const allTracks = Object.values(store.tracks) as CachedTrack[];
  if (allTracks.length === 0) return [];

  // Filter play log for night hours (22:00 - 04:00)
  const nightEvents = log.filter((e) => e.hourOfDay >= 22 || e.hourOfDay <= 4);
  const nightTrackCounts = new Map<string, number>();

  for (const e of nightEvents) {
    nightTrackCounts.set(e.trackId, (nightTrackCounts.get(e.trackId) ?? 0) + 1);
  }

  const now = Date.now();

  // Rank tracks by night frequency & play count, with recency decay
  const ranked = allTracks
    .map((track) => {
      const nightCount = nightTrackCounts.get(track.id) ?? 0;
      const totalPlayCount = track.playCount ?? 0;
      // Apply recency decay — tracks not played recently lose score
      const daysSinceLastPlayed = track.lastPlayed
        ? (now - track.lastPlayed) / (1000 * 60 * 60 * 24)
        : 60;
      const recencyMultiplier = Math.max(0.2, Math.exp(-daysSinceLastPlayed / 21)); // 21-day half-life
      const baseScore = nightCount * 3 + totalPlayCount;
      const score = baseScore * recencyMultiplier;
      return { track, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  // Take top candidates (wider pool), then shuffle to add variety
  const poolSize = Math.min(ranked.length, limit * 3);
  const pool = ranked.slice(0, poolSize);
  // Fisher-Yates weighted shuffle — top items stay near top but with variance
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return pool.slice(0, limit).map((item) => item.track as Track);
}

// ── Debug Status Exporter ────────────────────────────────────────────────────

export function getMlModelStats(): MlModelStats {
  const log = loadPlayLog();
  const seed = loadSeedModel();
  const matrix = buildTransitionMatrix();
  let pairCount = 0;
  for (const map of matrix.values()) pairCount += map.size;

  const seedCount = seed?.trackCount ?? (seed?.tracks ? Object.keys(seed.tracks).length : 0);
  const storeTracksCount = Object.keys(getStore().tracks).length;

  return {
    playLogCount: log.length,
    uniqueTracksCount: matrix.size,
    transitionPairsCount: pairCount,
    lastTrainedAt: seed?.trainedAt || lastModelTrainTime || Date.now(),
    isReady: seedCount > 0 || log.length > 0 || matrix.size > 0,
    hasSeedModel: Boolean(seed && seedCount > 0),
    seedTrackCount: Math.max(seedCount, storeTracksCount),
  };
}

export function clearMlDataset(): { cleared: boolean; playLogCount: number } {
  savePlayLog([]);

  const userSeedModelPath = path.join(getDataDir(), 'seed-model.json');
  try {
    if (fs.existsSync(userSeedModelPath)) {
      fs.unlinkSync(userSeedModelPath);
    }
  } catch (err) {
    console.error('[ml] Failed to remove user seed model:', err);
  }

  seedModelCache = null;
  seedModelFileMtime = 0;
  transitionMatrixCache = null;
  lastRecordedTrackId = null;
  return { cleared: true, playLogCount: 0 };
}

const DEFAULT_TELEMETRY_URL = 'https://noctune-dataset-collector.caya8205.workers.dev';
const TELEMETRY_STATE_FILE = path.join(getDataDir(), 'telemetry-submission.json');

export interface TelemetrySubmissionState {
  key: string;
  deleteToken: string;
  submittedAt: number;
  tracksCount: number;
  transitionsCount: number;
}

export async function getTelemetryStatus(validateRemote = true): Promise<{ hasSubmission: boolean; submission?: TelemetrySubmissionState }> {
  ensureDataDir();
  if (!fs.existsSync(TELEMETRY_STATE_FILE)) {
    return { hasSubmission: false };
  }
  let data: TelemetrySubmissionState | null = null;
  try {
    const raw = fs.readFileSync(TELEMETRY_STATE_FILE, 'utf-8');
    data = JSON.parse(raw) as TelemetrySubmissionState;
  } catch {}

  if (!data?.key || !data?.deleteToken) {
    return { hasSubmission: false };
  }

  if (validateRemote) {
    try {
      const targetUrl = DEFAULT_TELEMETRY_URL;
      const checkUrl = `${targetUrl.replace(/\/+$/, '')}/export/${encodeURIComponent(data.key)}`;
      const res = await fetch(checkUrl, { method: 'GET', signal: AbortSignal.timeout(3000) });
      if (res.status === 404) {
        clearTelemetryState();
        return { hasSubmission: false };
      }
    } catch {
      // If offline or network timeout, keep local state
    }
  }

  return { hasSubmission: true, submission: data };
}

export function saveTelemetryState(state: TelemetrySubmissionState) {
  ensureDataDir();
  fs.writeFileSync(TELEMETRY_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

export function clearTelemetryState() {
  ensureDataDir();
  if (fs.existsSync(TELEMETRY_STATE_FILE)) {
    try {
      fs.unlinkSync(TELEMETRY_STATE_FILE);
    } catch {}
  }
}

export async function submitMlTelemetry(customUrl?: string): Promise<{ ok: boolean; id?: string; key?: string; deleteToken?: string; tracksCount: number; transitionsCount: number }> {
  const store = getStore();
  const log = loadPlayLog();
  const matrix = buildTransitionMatrix();

  const activeTrackIds = new Set<string>();
  for (const event of log) {
    if (event.trackId) activeTrackIds.add(event.trackId);
  }
  for (const [fromId, targetMap] of matrix.entries()) {
    activeTrackIds.add(fromId);
    for (const toId of targetMap.keys()) {
      activeTrackIds.add(toId);
    }
  }

  const tracks: Record<string, { id: string; title: string; artist: string; playCount?: number }> = {};
  for (const [id, t] of Object.entries(store.tracks)) {
    if (!id || !t) continue;
    if ((t.playCount ?? 0) > 0 || activeTrackIds.has(id)) {
      tracks[id] = {
        id,
        title: t.title || '',
        artist: t.artist || '',
        playCount: t.playCount || 0,
      };
    }
  }

  const transitions: Record<string, Record<string, number>> = {};
  let transitionCount = 0;
  for (const [fromId, targetMap] of matrix.entries()) {
    transitions[fromId] = {};
    for (const [toId, weight] of targetMap.entries()) {
      transitions[fromId][toId] = weight;
      transitionCount++;
    }
  }

  const payload = {
    version: 1,
    submittedAt: Date.now(),
    tracksCount: Object.keys(tracks).length,
    logEventsCount: log.length,
    transitionsCount: transitionCount,
    tracks,
    transitions,
  };

  const targetUrl = customUrl || DEFAULT_TELEMETRY_URL;
  const res = await fetch(targetUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Telemetry submission failed (${res.status} ${res.statusText})`);
  }

  const data = (await res.json()) as { ok: boolean; id?: string; key?: string; deleteToken?: string };
  if (data.ok && data.key && data.deleteToken) {
    saveTelemetryState({
      key: data.key,
      deleteToken: data.deleteToken,
      submittedAt: payload.submittedAt,
      tracksCount: payload.tracksCount,
      transitionsCount: transitionCount,
    });
  }

  return {
    ok: Boolean(data.ok),
    id: data.id,
    key: data.key,
    deleteToken: data.deleteToken,
    tracksCount: payload.tracksCount,
    transitionsCount: transitionCount,
  };
}

export async function deleteMlTelemetry(customUrl?: string): Promise<{ ok: boolean; key?: string }> {
  const status = await getTelemetryStatus(false);
  if (!status.hasSubmission || !status.submission) {
    throw new Error('No telemetry upload found on this device to delete.');
  }

  const { key, deleteToken } = status.submission;
  const targetUrl = customUrl || DEFAULT_TELEMETRY_URL;
  const deleteUrl = `${targetUrl.replace(/\/+$/, '')}/entry/${encodeURIComponent(key)}`;

  const res = await fetch(deleteUrl, {
    method: 'DELETE',
    headers: {
      'X-Delete-Token': deleteToken,
    },
  });

  if (!res.ok) {
    if (res.status === 404) {
      clearTelemetryState();
      return { ok: true, key };
    }
    const errData = (await res.json().catch(() => ({ error: 'Delete request failed' }))) as { error?: string };
    throw new Error(errData.error || `Failed to delete submission (${res.status} ${res.statusText})`);
  }

  clearTelemetryState();
  return { ok: true, key };
}

export interface TelemetryImportPayload {
  version?: number;
  submittedAt?: number;
  tracksCount?: number;
  transitionsCount?: number;
  tracks?: Record<string, { id: string; title: string; artist: string; playCount?: number }>;
  transitions?: Record<string, Record<string, number>>;
}

export function importMlTelemetry(payload: TelemetryImportPayload): {
  ok: boolean;
  importedTracks: number;
  importedTransitions: number;
  totalLogEvents: number;
} {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid telemetry payload');
  }

  const store = getStore();
  let importedTracks = 0;
  let importedTransitions = 0;

  // 1. Merge tracks metadata into store.tracks
  if (payload.tracks && typeof payload.tracks === 'object') {
    for (const [id, track] of Object.entries(payload.tracks)) {
      if (!id || !track) continue;
      const existing = store.tracks[id];
      store.tracks[id] = {
        ...existing,
        id,
        title: track.title || existing?.title || '',
        artist: track.artist || existing?.artist || '',
        playCount: Math.max(existing?.playCount ?? 0, track.playCount ?? 0),
        query: existing?.query || `${track.title} ${track.artist}`.trim(),
      } as CachedTrack;
      importedTracks++;
    }
  }

  // 2. Load existing seed model or initialize fresh seed model structure
  const existingSeed = loadSeedModel();
  const seedModel: SeedModelData = existingSeed
    ? { ...existingSeed, transitions: { ...existingSeed.transitions } }
    : {
        version: 1,
        trainedAt: Date.now(),
        trackCount: 0,
        transitions: {},
      };

  if (!seedModel.transitions) seedModel.transitions = {};

  // 3. Merge transitions directly into seedModel.transitions
  if (payload.transitions && typeof payload.transitions === 'object') {
    for (const [fromId, targets] of Object.entries(payload.transitions)) {
      if (!targets || typeof targets !== 'object') continue;
      if (!seedModel.transitions[fromId]) seedModel.transitions[fromId] = {};
      const currentMap = seedModel.transitions[fromId];

      for (const [toId, weight] of Object.entries(targets)) {
        if (!toId) continue;
        currentMap[toId] = (currentMap[toId] ?? 0) + (typeof weight === 'number' ? weight : 1);
        importedTransitions++;
      }
    }
  }

  // 4. Save updated seed-model.json to user data dir
  seedModel.trackCount = Object.keys(seedModel.transitions).length;
  const userSeedModelPath = path.join(getDataDir(), 'seed-model.json');
  try {
    fs.writeFileSync(userSeedModelPath, JSON.stringify(seedModel, null, 2), 'utf-8');
  } catch (err) {
    console.warn(`[ml] failed to save user seed-model.json: ${(err as Error).message}`);
  }

  // Save track store updates
  const saveStore = (getStore() as any)._saveStore || undefined;
  if (saveStore) saveStore();

  // Invalidate caches so model rebuilds with updated Base Model
  seedModelCache = seedModel;
  transitionMatrixCache = null;

  return {
    ok: true,
    importedTracks,
    importedTransitions,
    totalLogEvents: (loadPlayLog() ?? []).length,
  };
}
