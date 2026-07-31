import fs from 'fs';
import path from 'path';
import { getDataDir } from './env.js';
import { getRecentTracks } from './cache.js';
import { getRecommendations } from './recommendations.js';
import type { Track } from '../types/index.js';

const DISCOVER_WEEKLY_FILE = path.join(getDataDir(), 'discover_weekly.json');
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface DiscoverWeeklyData {
  generatedAt: number;
  tracks: Track[];
}

function loadCache(): DiscoverWeeklyData | null {
  if (!fs.existsSync(DISCOVER_WEEKLY_FILE)) return null;
  try {
    const raw = fs.readFileSync(DISCOVER_WEEKLY_FILE, 'utf-8');
    const data = JSON.parse(raw) as DiscoverWeeklyData;
    if (typeof data.generatedAt === 'number' && Array.isArray(data.tracks)) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

function saveCache(data: DiscoverWeeklyData): void {
  try {
    const dir = path.dirname(DISCOVER_WEEKLY_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DISCOVER_WEEKLY_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[discoverWeekly] Failed to save cache:', (err as Error).message);
  }
}

export async function getDiscoverWeekly(forceRefresh = false): Promise<DiscoverWeeklyData> {
  const cached = loadCache();
  const now = Date.now();

  if (!forceRefresh && cached && cached.tracks.length > 0 && now - cached.generatedAt < ONE_WEEK_MS) {
    return cached;
  }

  // Generate new Discover Weekly recommendations
  const recentTracks = getRecentTracks(5);
  if (recentTracks.length === 0) {
    const emptyData: DiscoverWeeklyData = {
      generatedAt: cached?.generatedAt || now,
      tracks: cached?.tracks || [],
    };
    return emptyData;
  }

  const seed = recentTracks[0];
  const excludeIds = recentTracks.map((t) => t.id);

  try {
    const recs = await getRecommendations(seed as Track, { excludeIds, limit: 20 });
    const newData: DiscoverWeeklyData = {
      generatedAt: now,
      tracks: recs,
    };
    saveCache(newData);
    return newData;
  } catch (err) {
    console.warn('[discoverWeekly] Recommendation failed, returning fallback:', (err as Error).message);
    if (cached) return cached;
    return { generatedAt: now, tracks: [] };
  }
}
