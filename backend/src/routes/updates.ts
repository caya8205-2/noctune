import type { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';
import { getLatestReleaseUpdate } from '../services/updateChecker.js';

const FALLBACK_CHANGELOG = `# Changelog

All notable Noctune changes are documented here.

## v3.1.0 - 2026-07-25

### Playback Blacklist & Disk Audio Cache Hardening
- **Disk Audio Cache Deletion Fix**: Normalized Video ID prefixes (\`youtube:\`, \`ytdlp:\`, \`spotify:\`) in \`audioFileCache\` so clearing track cache or blacklisting a video physically deletes cached \`.m4a\`/\`.webm\` files from disk.
- **Blacklisted Stream Rejection**: Enforced HTTP 404 stream rejection on \`GET /player/stream/:videoId\` for blacklisted video IDs, forcing HTML5 audio elements to load clean alternative streams.
- **Blacklist Relation Formatting**: Enhanced \`playbackBlacklist.ts\` and Debug Dashboard UI to record and display exact relation mappings: \`<Target Track: Artist — Title> ➔ 🚫 <Blacklisted Bad Match Title / Video ID>\` so users can easily distinguish between the requested track and the blacklisted video ID.

### Matcher Keyword Hardening
- **Keyword Penalty Bypass**: Expanded \`keywordAllowed\` in \`youtubeMatcher.ts\` to inspect title, artist, and search query. Target tracks containing terms like \`sings\`, \`cover\`, \`karaoke\`, \`concert\`, \`live\`, or date formats are no longer penalized by negative keyword filters.

### History & Track Cache Preservation
- **Metadata Preservation on Clear Cache**: Updated \`clearTrackCache()\` to strip stream URL properties while keeping track metadata (\`lastPlayed\`, \`playCount\`, \`title\`, \`artist\`) intact so tracks remain visible in History.
- **History Row Deduplication**: Added deduplication in \`getRecentTracks()\` to group repeated plays of the same track into a single history entry with updated timestamp.

### Direct YouTube Resolution
- **Direct Video ID Resolution**: Stripped \`ytdlp:\` and \`youtube:\` prefixes before video ID regex validation, ensuring direct YouTube search clicks resolve to exact Video IDs without unnecessary fallback query searches.

### Debug Dashboard UI & Workflow Improvements
- **Native In-App Confirmation Modal**: Replaced suppressed browser native confirmation dialogs in Electron/webview with a native React Noctune-styled \`ConfirmModal\` (\`modal-backdrop\`, \`modal-panel\`, \`btn-danger\`, \`btn-accent\`, \`btn-ghost\`) for all destructive debug actions while excluding instant non-destructive actions (\`Import Telemetry JSON\` & \`Test ML Predictions\`).
- **Tools Tab Restructure**: Re-organized Debug Dashboard navigation into 4 clean sections: \`Resolver\`, \`Lyrics\`, \`Status\`, and \`Tools\` (incorporating Blacklist Manager, Audio Cache Browser, HTTP Request Log, and ML Recommendation Sandbox).
- **Trained Dataset Badge**: Renamed \`Base Model\` badge to \`Trained Dataset\` with hover tooltip explaining it reflects both the pre-trained seed model and locally learned tracks from listening history. Track count now uses \`Math.max(seedCount, storeTracksCount)\` to accurately reflect the real dataset size.

### ML Dataset Management & Telemetry
- **Official Pre-trained Seed Model**: Shipped \`seed-model.json\` (888 baseline tracks & 11,300+ pre-trained transition weights) directly with Noctune \`v3.1.0\`, providing instant local ML recommendations on first launch without cold start.
- **Auto Disk Sync for Seed Model**: Added \`mtimeMs\` file timestamp tracking in \`loadSeedModel()\` so replacing or restoring \`seed-model.json\` on disk instantly invalidates RAM caches and reloads the dataset without requiring a server restart.
- **Log Event Deduplication**: Added automatic \`trackId_timestamp\` deduplication in \`importProdDataset()\` so importing production datasets is idempotent and never creates duplicate play events.
- **Clear ML Dataset Action**: Added \`DELETE /debug/ml/dataset\` endpoint and **Clear Dataset** button in Debug Dashboard ➔ Tools. Now properly unlinks \`data/seed-model.json\` from disk and resets all in-memory caches.
- **Anonymous Dataset Telemetry Submission**: Added \`POST /debug/ml/submit-telemetry\` endpoint and **Help Improve ML Model** button in Debug Dashboard ➔ Tools to allow users to contribute anonymized listening datasets to Cloudflare Workers for future base model training.
- **Cloudflare Worker Dataset Dashboard**: Deployed live dashboard at \`noctune-dataset-collector.caya8205.workers.dev\` with submission management (view, download individual/aggregated, delete entries with admin secret), stat cards, and deduplication disclaimer. Aggregation uses \`Math.max\` per transition weight to prevent duplicate inflation across multiple submissions.
`;

export async function updateRoutes(app: FastifyInstance) {
  app.get('/updates/latest', async (req, reply) => {
    const force = (req.query as { force?: string }).force === 'true';
    return reply.send(await getLatestReleaseUpdate(force));
  });

  app.get('/changelog', async (_req, reply) => {
    const execDir = path.dirname(process.execPath);
    const possiblePaths = [
      path.resolve(process.cwd(), 'CHANGELOG.md'),
      path.resolve(process.cwd(), '..', 'CHANGELOG.md'),
      path.resolve(process.cwd(), 'backend', '..', 'CHANGELOG.md'),
      path.resolve(execDir, 'CHANGELOG.md'),
      path.resolve(execDir, 'resources', 'CHANGELOG.md'),
      path.resolve(execDir, '..', 'resources', 'CHANGELOG.md'),
    ];
    for (const p of possiblePaths) {
      try {
        if (fs.existsSync(p)) {
          const text = fs.readFileSync(p, 'utf-8');
          if (text && text.trim().length > 20) {
            return reply.send({ content: text });
          }
        }
      } catch {}
    }
    return reply.send({ content: FALLBACK_CHANGELOG });
  });
}
