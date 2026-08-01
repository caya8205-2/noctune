import type { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';
import { getLatestReleaseUpdate } from '../services/updateChecker.js';

const FALLBACK_CHANGELOG = `# Changelog

All notable Noctune changes are documented here.

## v3.2.2 - 2026-08-02

### Linux & Multi-Platform Audio Fixes
- **Linux Audio Stream Capping Fix**: Fixed YouTube audio stream range capping in backend (\`player.ts\`) that caused playback to stop prematurely at ~25 seconds (1MB buffer limit) and automatically skip to the next track.
- **Linux DevTools Console Cleanup**: Added 4-attempt retry with 250ms backoff on preferred port 3131 in \`api.ts\`, eliminating 10 connection refused console error logs during sidecar cold start.
- **Global Dark Mode Dropdowns (\`select\`/\`option\`)**: Added \`color-scheme: dark;\` and custom background/text styling for HTML \`<select>\` and \`<option>\` elements in \`index.css\` \`@layer base\` to fix white unreadable dropdown popups on Linux WebKitGTK.

## v3.2.1 - 2026-08-01

### Compact Sidebar & UI Refinements
- **Design System \`.dropdown-panel\` Token & Menu Consistency**: Added \`.dropdown-panel\` component token in \`index.css\` matching Noctune's dropdown design system (\`border border-base-600 bg-base-900 shadow-2xl shadow-black/80\`). Aligned right margins for \`+\` and compact toggle buttons and enabled unclipped dropdown menu popups with solid 100% opacity.
- **Clean Sidebar Scrollbars**: Applied \`scrollbar-hidden\` to both normal and compact sidebar modes for a clean UI without visible scrollbars while maintaining full mouse wheel scrolling capability.

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

### On-Demand Release Notes & Changelog Modal
- **What's New Settings Button & Modal Trigger**: Added a **What's New** button in Settings View allowing users to open and review release notes anytime on demand, accompanied by a clean "Don't show this again" preference toggle.

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
