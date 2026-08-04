import type { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';
import { getLatestReleaseUpdate } from '../services/updateChecker.js';

const FALLBACK_CHANGELOG = `# Changelog

All notable Noctune changes are documented here.

## v3.3.0 - 2026-08-04

### Dedicated YouTube Channel View & Multi-Platform Extraction
- **Dedicated YouTube Channel View**: Introduced a full-featured channel profile view for YouTube creators with top tracks, avatars, subscriber counts, and channel playlists.
- **Cross-Platform yt-dlp Sidecar Bundling**: Updated build scripts (\`scripts/prepare-ytdlp.mjs\`) to package native platform-specific \`yt-dlp\` binaries for Windows (\`yt-dlp.exe\`) and Linux (\`yt-dlp_linux\`). The bundled binary removes the need for a manual yt-dlp installation; YouTube extraction still requires an internet connection.
- **Channel Parsing & Fallback Engine**: Built \`browseYouTubeChannel\` in \`youtubei.ts\` with Innertube parser recovery, exact channel identity resolution, controlled search fallbacks, and yt-dlp extraction for creator queries so ordinary channels are not mapped to similarly named Spotify artists.
- **External YouTube Playlist Resolution**: Supported \`ytplaylist:\` IDs through \`GET /playlists/:id\` and the dedicated \`/browse/youtube-playlist/:id\` route so channel playlists open inside Noctune.
- **Channel Videos & Playlists Tabs**: Added persistent \`Videos\` and \`Playlists\` tab switchers in \`ArtistView.tsx\`, a clean empty state when no public playlists are available, and removed the duplicated \`VIDEOS\` section heading.

### Interactive Artwork Lightbox & Cover Downloads
- **Artwork Lightbox Modal**: Introduced \`ArtworkLightboxModal.tsx\` allowing users to view full-resolution cover art/thumbnails in a viewport modal with zoom controls and download them directly to disk with a **Download Artwork** button.
- **Multi-View Viewport Access**: Added click triggers on artwork/thumbnails across \`AlbumView\`, \`ArtistView\` (avatar/pfp), \`PlaylistView\`, and \`TrackDetailsSidebar\`.
- **Backend Artwork Storage Endpoint**: Added data URL (Base64) handling and 10-second fetch timeout to \`POST /player/download-artwork\` to save original high-quality cover images directly into Noctune's configured download folder with real-time status and destination path feedback (\`Saved to ...\`).

### Direct Track Download Engine
- **Direct Stream Download Engine**: Overhauled \`POST /player/download-tracks\` to perform direct fetch streaming (\`Range: bytes=0-\` & \`writeAudioChunk\` buffer draining) straight to the user's download directory (\`downloadDir\`). Eliminates cache dependencies and fixes stuck 0KB downloads while updating file \`mtime\` so downloaded tracks appear at the top of File Explorer when sorted by *Date Modified*.
- **Dynamic Download Toast Positioning**: Updated \`useDownloadTrack.tsx\` to dynamically anchor download completion toasts (\`bottom-20\` when Mini Player is visible, \`bottom-6\` when hidden) to prevent floating overlay overlap.

### Home History & Smart Playlist Corrections
- **Recently Played History Routing**: Home's \`Recently Played\` shortcuts and section links now open the real History view instead of a duplicate history smart playlist.
- **In Rotation Recommendation Logic**: Replaced the duplicate history-based smart playlist with fresh recommendations based on recent listening, with an explanatory description and dedicated Orbit sidebar icon.
- **Recently Played Track Label Layout**: Fixed Home track rows so artist names no longer concatenate directly onto titles.

### Playlist Management & Drag-and-Drop Polish
- **Separated Playlist Edit Action Controls**: Redesigned playlist edit mode controls to display distinct **Done** and **Cancel** actions.
- **Grip-Only Live DnD Reordering**: Custom playlist DnD now starts only from the grip, shows live row movement/highlight feedback, avoids misleading draggable cursors outside the grip, and submits validated indices.
- **Transactional Playlist Editing**: Reorders remain local until **Done**; **Cancel** restores the complete pre-edit snapshot and keeps playlist/sidebar cache state consistent.

### UI Layout & Visualizer Polish
- **Clickable Channel Names Across All Views**: Added \`ytchannel:\` navigation fallback across \`PlayerBar\` (Mini Player), \`PlayerView\` (Full Player), \`TrackDetailsSidebar\` (Sidebar), and \`PlaylistView\` (Track Rows) so clicking creator names opens their channel profile.
- **Header Margin Standardization**: Aligned top header margins in \`LocalFilesView\` and \`StatsView\` with \`HomeView\` and \`PlaylistView\` for consistent layout spacing across all application pages.
- **Home Header Particle Animations Cleanup**: Removed redundant background particle animations in \`HomeView\` header to minimize unnecessary GPU/CPU overhead.
- **Visualizer Rhythm Refinement**: Calibrated album art bass-pulse intensity in \`PlayerView\` visualizer canvas to match audio visualizer canvas rhythm.
- **Channel Navigation Fallbacks**: Made creator/channel names clickable across track surfaces while preserving direct \`ytchannel:\` routing.

## v3.2.2 - 2026-08-02

### Linux & Multi-Platform Audio Fixes
- **Linux Audio Stream Capping Fix**: Fixed YouTube audio stream range capping in backend (\`player.ts\`) that caused playback to stop prematurely at ~25 seconds (1MB buffer limit) and automatically skip to the next track.
- **Linux DevTools Console Cleanup**: Added 4-attempt retry with 250ms backoff on preferred port 3131 in \`api.ts\`, eliminating 10 connection refused console error logs during sidecar cold start.
- **Global Dark Mode Dropdowns (\`select\`/\`option\`)**: Added \`color-scheme: dark;\` and custom background/text styling for HTML \`<select>\` and \`<option>\` elements in \`index.css\` \`@layer base\` to fix white unreadable dropdown popups on Linux WebKitGTK.

## v3.2.1 - 2026-08-01

### Compact Sidebar & UI Refinements
- **Design System \`.dropdown-panel\` Token & Menu Consistency**: Added \`.dropdown-panel\` component token in \`index.css\` matching Noctune's dropdown design system (\`border border-base-600 bg-base-900 shadow-2xl shadow-black/80\`). Aligned right margins for \`+\` and compact toggle buttons and enabled unclipped dropdown menu popups with solid 100% opacity.
- **Clean Sidebar Scrollbars**: Applied \`scrollbar-hidden\` to both normal and compact sidebar modes for a clean UI without visible scrollbars while maintaining full mouse wheel scrolling capability.

### Multi-Platform Release Preparation (Linux Support)
- **Linux Multi-Job CI Workflow**: Added \`build-linux\` runner job (\`ubuntu-22.04\`) in GitHub Actions \`release.yml\` for automated \`.deb\` and \`.AppImage\` packaging alongside Windows NSIS installers.
- **Linux Sidecar Binary Target**: Configured \`build:binary:linux\` script targeting \`node24-linux-x64\` to generate \`noctune-backend-x86_64-unknown-linux-gnu\`.

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

## v3.1.0 - 2026-07-25

### Playback Blacklist & Disk Audio Cache Hardening
- **Disk Audio Cache Deletion Fix**: Normalized Video ID prefixes (\`youtube:\`, \`ytdlp:\`, \`spotify:\`) in \`audioFileCache\` so clearing track cache or blacklisting a video physically deletes cached \`.m4a\`/\`.webm\` files from disk.
- **Blacklisted Stream Rejection**: Enforced HTTP 404 stream rejection on \`GET /player/stream/:videoId\` for blacklisted video IDs, forcing HTML5 audio elements to load clean alternative streams.

## v3.0.0 - 2026-07-24

### Spotify & Network Auto-Recovery
- **Spotify 401 Auto-Refresh & Retry**: Implemented automatic token refresh and 1-step retry in \`spotifyApiFetch\` to prevent \`502 Bad Gateway\` errors when Spotify credentials expire.

## v2.4.0 - 2026-07-23
### feat: overhaul debug dashboard, audio cache download UX, permanent blacklist & player badge legend

## v2.3.0 - 2026-07-23
### fix: add missing queueSource values to RPC TrackSchema
### fix: clear Discord RPC on app close to prevent lingering activity

## v2.2.3 - 2026-07-22
### fix(v2.2.3): inject discord client for RPC

## v2.2.2 - 2026-07-22
### fix(v2.2.2): inject music service credentials into release builds

## v2.2.1 - 2026-07-22
### fix(v2.2.1): preserve playlist context and improve playback feedback

## v2.2.0 - 2026-07-22
### feat(v2.2.0): preserve playback sources and streamline track actions

## v2.1.0 - 2026-07-15
### feat: enhance equalizer with smooth drag & preset animation, persist settings, and interactive lyrics

## v2.0.0 - 2026-07-13
### v2.0.0 — inject default spotify credentials for premium-tier api access

## v1.9.1 - 2026-07-11
### fix(stats): make artist name clickable in top artists section

## v1.9.0 - 2026-07-09
### fix(critical): resolve production build data persistence and local files playback

## v1.8.0 - 2026-07-02
### fix(build): set NSIS installer/uninstaller icon + header/sidebar images

## v1.7.2 - 2026-06-28
### fix: Harden resolver matching

## v1.7.1 - 2026-06-27
### fix(debug): embed dashboard and harden resolver matching

## v1.7.0 - 2026-06-27
### chore(release): bump version to 1.7.0 and add debug preview controls

## v1.6.1 - 2026-06-27
### fix(matcher,log): improve Spotify→YouTube accuracy, fix pino mojibake, add debug dashboard

## v1.6.0 - 2026-06-25
### feat: add personalized nightly mixes and queue polish

## v1.5.0 - 2026-06-18
### release: prepare v1.5.0

## v1.4.0 - 2026-06-17
### feat: prepare Noctune 1.4.0 stability release

## v1.3.0 - 2026-06-17
### feat: expand browse and update workflows

## v1.2.0 - 2026-06-16
### feat: ui reskin

## v1.1.0 - 2026-06-14
### fix: playlist max tracks from 100 to 2000

## v1.0.0 - 2026-06-08
### Settings & Discord RPC
- Added Discord Rich Presence (RPC) toggle in Settings.

## v1.0.0-beta.5 - 2026-05-30
### Initial Beta Release
- Full player view, Spotify metadata search, YouTube playback resolver, LRCLIB synced lyrics, local audio disk caching.
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
      path.resolve(process.cwd(), '..', '..', 'CHANGELOG.md'),
      path.resolve(process.cwd(), 'backend', '..', 'CHANGELOG.md'),
      path.resolve(execDir, 'CHANGELOG.md'),
      path.resolve(execDir, 'resources', 'CHANGELOG.md'),
      path.resolve(execDir, '..', 'resources', 'CHANGELOG.md'),
      path.resolve(execDir, '..', 'CHANGELOG.md'),
      path.resolve(execDir, '_up_', 'CHANGELOG.md'),
      path.resolve(execDir, '_up_', '_up_', 'CHANGELOG.md'),
      path.resolve('/usr/share/noctune', 'CHANGELOG.md'),
      path.resolve('/usr/lib/noctune', 'CHANGELOG.md'),
      path.resolve('/usr/lib/noctune/resources', 'CHANGELOG.md'),
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
