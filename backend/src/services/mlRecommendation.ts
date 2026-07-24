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
  trainedAt: number;
  trackCount: number;
  tracks: Record<string, Track>;
  transitions: Record<string, Record<string, number>>;
}

let seedModelCache: SeedModelData | null = null;

function loadSeedModel(): SeedModelData | null {
  if (seedModelCache) return seedModelCache;
  try {
    const candidatePaths = [
      path.join(process.cwd(), 'src/data/seed-model.json'),
      path.join(process.cwd(), 'dist/data/seed-model.json'),
      path.join(getDataDir(), 'seed-model.json'),
    ];
    for (const p of candidatePaths) {
      if (p && fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf-8');
        seedModelCache = JSON.parse(raw);
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
    throw new Error('Production songs.json not found in AppData Roaming dev.noctune.desktop');
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
  const mergedLog = [...currentLog, ...newLogEvents];
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

  // Rank tracks by night frequency & play count
  const ranked = allTracks
    .map((track) => {
      const nightCount = nightTrackCounts.get(track.id) ?? 0;
      const totalPlayCount = track.playCount ?? 0;
      const score = nightCount * 3 + totalPlayCount;
      return { track, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return ranked.slice(0, limit).map((item) => item.track as Track);
}

// ── Debug Status Exporter ────────────────────────────────────────────────────

export function getMlModelStats(): MlModelStats {
  const log = loadPlayLog();
  const seed = loadSeedModel();
  const matrix = buildTransitionMatrix();
  let pairCount = 0;
  for (const map of matrix.values()) pairCount += map.size;

  const uniqueTracks = new Set(log.map((e) => e.trackId)).size;
  const seedCount = seed?.trackCount ?? 0;

  return {
    playLogCount: log.length,
    uniqueTracksCount: uniqueTracks,
    transitionPairsCount: pairCount,
    lastTrainedAt: seed?.trainedAt || lastModelTrainTime || Date.now(),
    isReady: log.length >= 3 || uniqueTracks >= 2 || seedCount > 0,
    hasSeedModel: Boolean(seed),
    seedTrackCount: seedCount,
  };
}
