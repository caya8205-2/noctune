import type { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';
import { getLatestReleaseUpdate } from '../services/updateChecker.js';

const FALLBACK_CHANGELOG = `# Changelog

All notable Noctune changes are documented here.

## v3.2.0 - 2026-08-01

### Major Home View Redesign
- **Navigation Shortcut Pills**: Added quick-access filter pills at the top of Home View (*Liked Songs*, *Top Favorites*, *Discover Weekly*, *Recently Played*, *Short Tracks*) for one-tap section navigation.
- **Continue Listening & New Releases GPU Autoscroll Carousels**: Built GPU hardware-accelerated horizontal autoscroll carousels (\`transform: translate3d(-Xpx, 0, 0)\`) for *Continue Listening* (persisted queue tracks) and *New Releases*, complete with 2.5-second end-card pause, mouse wheel horizontal scroll, and hover pause.
- **Your Playlists Manual Horizontal Carousel**: Converted \`Your Playlists\` section into a manual horizontal scroll row with mouse wheel direction conversion, keeping all user playlists accessible without vertical page sprawl.
- **Recently Played Redesign**: Redesigned Recently Played section with clean track rows and layout.
- **Clean Header**: Replaced redundant taglines with a clean title ("Home") and subtitle to eliminate duplication with sidebar greetings.

### Compact Sidebar Mode
- **Collapsible Icon-Only Sidebar**: Added a compact sidebar mode (\`w-16\` width) toggled via top header toggle button (\`PanelLeftOpen\`/\`PanelLeftClose\`), featuring centered navigation items, hover tooltips, and playlist cover thumbnails.

### Smart Playlists & Nightly Mix Refinements
- **Discover Weekly 7-Day Caching & Refetch Fix**: Fixed \`Discover Weekly\` to persist cache for 7 days (\`discover_weekly.json\`) in backend and prevented redundant refetching every time its view is mounted.
- **Smart Playlist Branding & Renaming**: Renamed Smart Playlist labels for consistency (*Most Played* ➔ *Top Favorites*, *Recently Added* ➔ *Recently Played*) to distinguish them clearly from Nightly Mixes such as *Deep Rotation*.
- **Playlist & Nightly Mix Refresh Action**: Added an interactive **Refresh Playlist / Refresh Mix** button (\`<RefreshCw />\`) across all Smart Playlist views and Nightly Mixes to trigger real-time recommendation updates.

### Custom Audio Download Location
- **Download Storage Path Selector**: Added a setting in Settings View allowing users to select and configure custom audio cache download storage paths on disk with native folder browser dialog support.

### Now Playing & Dynamic Visibility
- **Unified 3 Audio Bars Playing Indicator**: Standardized playing indicators across all track list views (*Home Recently Played, Album View, Artist View, Playlist View, Queue View, Search View, History View*) with 3 animated accent audio bars (\`PlayingBars\`) when playing and accent row numbers when paused.
- **Unified Active Track Row Background**: Standardized active track row background to Noctune's global \`bg-accent/10\` across \`PlaylistView\` and \`QueueView\`.
- **Dynamic Mini Player & Track Details Visibility**: Automatically hide Mini Player (\`PlayerBar\`) and Sidebar Track Details (\`TrackDetailsSidebar\`) when no track is playing to maximize screen real estate.
- **Title Bar Logo Alignment**: Positioned official Noctune \`/app-icon.png\` logo on the far right (\`ml-auto\`) of the title bar with clean borderless styling.
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
