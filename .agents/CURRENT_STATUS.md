# Current Status & Release Tracker

This document tracks all implemented features, bug fixes, patches, and current system status for Noctune, categorized by release version and date.

---

## v3.3.1 - 2026-08-05

### Version-Aware Changelog Modal & Playback Polish
- [x] **Version-Aware Changelog Modal Subtitle**
  - **Dynamic Subtitle Wording**: Replaced the static `Major Release Notes & Updates` subtitle in `ChangelogModal.tsx` with dynamic release categorization (`Major Release Notes & Updates`, `Minor Feature Release & Updates`, `Patch & Fix Release Notes`).
  - **SemVer Version Comparison**: Derived release wording by parsing `APP_VERSION` semver structure and comparing against `lastSeen` version from `localStorage`.
- [x] **Home Queue Context Preservation**
  - **Cached Queue Context**: Fixed Recently Played and Continue Listening playback so cached queues retain their original playlist/source context instead of being overwritten by Home autoqueue recommendations after app reloads or idle states.
  - **Queue Metadata Persistence**: Saved original playlist and source metadata alongside the local queue so playlist context survives reloads.
- [x] **YouTube Channel Entry Filtering**
  - **Clean Channel Navigation**: Filtered out non-playable channel tab entries (`Videos`, `Live`, `Shorts`) from channel browse results.
- [x] **Fullscreen Artwork Viewport**
  - **Full-Window Viewer**: Expanded the artwork lightbox into a full-window viewer featuring fit-to-viewport display, click-to-zoom, immediate drag/pan while zoomed, and zoom reset returning the image to its fitted position.
  - **Viewport Sizing & Resolution**: Preserved high-resolution artwork sources for zooming and downloads while constraining initial render to readable viewport dimensions instead of stretching across the screen.
- [x] **Centered Player & Viewport Controls**
  - **Layout Spacing**: Centered Mini Player transport controls independently from track actions and separated artwork title and zoom controls with responsive spacing around the Mini Player.
- [x] **Changelog Settings Button Polish**
  - **Renamed Button & Text**: Renamed the `What's New` button in `SettingsView.tsx` to `Changelog` and updated info banner text in `ChangelogModal.tsx` (`Settings > Changelog`).
  - **Replaced Icon & Styling**: Replaced the glowing amber sparkles star icon (`<Sparkles />`) with a clean document icon (`<FileText />`) and updated button styling to Noctune's standard border button (`border border-base-600 text-soft hover:text-white hover:border-base-500`) to avoid confusing browser-link appearance.
- [x] **Local Library Header Gradient Consistency**
  - **Header Background & Border Removal**: Removed `bg-base-950/40` overlay and `border-b border-white/[0.06]` from `LocalFilesView.tsx` header so Noctune's ambient top gold background radial gradient shines through consistently across all views (History, Queue, Settings, and Local Library).
- [x] **Artwork Lightbox 50% Zoom Out & Draggable Support**
  - **Extended Minimum Zoom & Draggable Pan**: Expanded `ArtworkLightboxModal.tsx` zoom controls down to 50% (`0.5x`) and enabled dragging/panning across all non-100% zoom levels (both zoomed-in and zoomed-out).
- [x] **Native Rust YouTube Channel Resolver (Roadmap Track 2)**
  - **Native Rust Tauri Command**: Implemented `get_youtube_channel` command in `src-tauri/src/youtube_channel.rs` using `reqwest` for direct Innertube API fetching.
  - **High Performance & Zero Sidecar**: Reduced channel fetch latency from ~2,500ms down to ~350ms (5x–6x faster) and eliminated Desktop dependency on the `yt-dlp` binary for channel profiles.
- [x] **Native Rust YouTube Playlist Resolver & Instant Playlist Loading**
  - **Native Rust Tauri Command**: Implemented `get_youtube_playlist` command in `src-tauri/src/youtube_channel.rs` to fetch external YouTube playlists via Innertube API (~200ms vs ~2,000ms `yt-dlp` sidecar).
  - **Header & Cover Image Extraction**: Extracted real playlist titles and high-resolution cover artwork from YouTube microformats and Innertube renderers (`#RETNOSINGS`, etc.).
- [x] **Strict Topic Channel Artist Filtering**
  - **Unrelated Artist Filter**: Filtered out noise tracks (*Vale Lambo*, *Irokz*, *Trinidad Cardona*) from YouTube Music Topic channels so track lists only contain songs matching the target artist keyword.

---

## v3.3.0 - 2026-08-04

### Dedicated YouTube Channel Profiles & Multi-Platform Extraction
- [x] **Dedicated YouTube Channel View**
  - **Full-Featured Profiles**: Implemented channel profile view for YouTube creators (`browseYouTubeChannel`) with top tracks, avatars, subscriber counts, and channel playlists.
  - **Cross-Platform yt-dlp Sidecar Bundling (`prepare-ytdlp.mjs`)**: Bundled native platform-specific binaries for Windows (`yt-dlp.exe`) and Linux (`yt-dlp_linux`), removing manual yt-dlp installation requirements.
  - **Dedicated yt-dlp Channel Extraction (`ytdlp.ts`)**: Direct yt-dlp binary extraction for uploads, channel metadata, and public playlists, bypassing Innertube channel tab inconsistencies.
  - **External Playlist Resolution**: Added `ytplaylist:` support through `GET /playlists/:id` and `/browse/youtube-playlist/:id` so channel playlists open natively inside Noctune.
  - **Channel Videos & Playlists Tabs (`ArtistView.tsx`)**: Added persistent tabs, a clean empty state for channels without public playlists, and removed duplicated `VIDEOS` headings beneath active tabs.
  - **Navigation History & Cache**: Added history entries for channel tab changes and virtual `ytplaylist:` routes so mouse back restores the correct tab state. Added five-minute frontend caching for channel data.
  - **Topic Channel Extraction Hardening**: Handled Topic channels missing `/videos` or `/playlists` tabs, preserving uploads when playlists are absent. Added loading states, centered empty states, and avatar fallbacks.

### Interactive Artwork Lightbox & Cover Downloads
- [x] **Interactive Artwork Lightbox**: Interactive high-resolution cover art viewer with zoom controls across Album, Artist, Playlist, and Track Details views.
- [x] **Direct Cover Artwork Downloads (`POST /player/download-artwork`)**: Added data URL (Base64) handling and 10s fetch timeout to save original high-res cover images straight into Noctune's configured `downloadDir` with real-time `Saved to ...` path feedback.

### Direct Track Audio Stream Download Engine
- [x] **Direct Audio Stream Download Engine**: Overhauled `POST /player/download-tracks` in `player.ts` to perform direct fetch streaming (`Range: bytes=0-` & `writeAudioChunk` buffer draining) directly to `downloadDir`. Eliminates cache dependencies, fixes stuck 0KB downloads, and updates file `mtime` so downloaded tracks appear at the top when sorted by *Date Modified*.
- [x] **Dynamic Download Toast Anchoring**: Dynamically anchored completion toasts in `useDownloadTrack.tsx` (`bottom-20` when Mini Player is visible, `bottom-6` when hidden).

### Home History & Smart Playlist Corrections
- [x] **Recently Played History Routing**: Updated Home `Recently Played` section links to open the real History view instead of a duplicate history smart playlist.
- [x] **In Rotation Recommendations**: Replaced duplicate history smart playlist with `In Rotation`, a recommendation mix seeded from recent listening. Added dedicated description and Orbit sidebar icon.
- [x] **Recently Played Track Label Layout**: Fixed Home track rows so artist names no longer concatenate directly onto titles.

### Playlist Management & Drag-and-Drop Polish
- [x] **Separated Playlist Edit Action Controls**: Redesigned playlist edit mode controls in `PlaylistView.tsx` with distinct **Done** (accent button with check icon) and **Cancel** (ghost button with X icon) actions.
- [x] **Playlist Drag-and-Drop Reordering Fix**: Restricted drag initiation to the grip icon, provided live row movement feedback, and ensured accurate validated index submission.
- [x] **Transactional Playlist Editing**: Kept reordering local until **Done**; **Cancel** restores the complete pre-edit snapshot without corrupting sidebar or playlist cache state.
- [x] **Playlist View Controls & Sorting**: Added short descriptions beneath smart playlists, Grid/List view toggles, sticky filter toolbar, and explicit bidirectional sorting (`Duration (Shortest-Longest)` / `Duration (Longest-Shortest)`).

### UI Layout & Visualizer Polish
- [x] **Clickable Creator & Artist Names Everywhere**: Enabled interactive channel profile navigation across all track lists, player controls, sidebar panels, and playlist views.
- [x] **Header Margin Standardization**: Standardized top header margins in `LocalFilesView` and `StatsView` with `HomeView` and `PlaylistView`.
- [x] **Home Particle Animations Cleanup**: Removed redundant background particle animations in `HomeView` header to minimize GPU/CPU usage.
- [x] **Visualizer Rhythm Refinement**: Calibrated album art bass-pulse intensity in `PlayerView` visualizer canvas.
- [x] **Local Library Folder History**: Mouse back from open local library folders returns to the folder list.

### Playback, History & Settings Reliability
- [x] **Immediate History Recording**: Playback-start history writes update immediately, moving repeated tracks to the top with fresh timestamps.
- [x] **Themed Confirmation Dialogs**: Replaced native dialog calls with Noctune's themed modal for cache, failed-ID, and match-clearing actions.

---

## v3.2.3 - 2026-08-02

### Playback & UI Responsiveness
- [x] **Instant Optimistic Mini Player**: Set `currentTrack` and `isLoading: true` optimistically on track click for instant Mini Player bar display with spinning artwork loaders.
- [x] **Audio Stream CORS & Readiness**: Added `Cross-Origin-Resource-Policy: cross-origin` headers and `waitForAudioReady` checks to prevent WebKitGTK / GStreamer media pipeline aborts.

### Linux & Multi-Platform Fixes
- [x] **Linux Audio Stream Capping Fix**: Removed 1MB range capping in backend `player.ts` that caused playback truncation at ~25 seconds on Linux.
- [x] **Linux DevTools Console Cleanup**: Added 4-attempt retry with 250ms backoff on port 3131 in `api.ts` to prevent connection refused console errors.
- [x] **Global Dark Mode Dropdowns**: Added `color-scheme: dark;` and custom styling for `<select>` and `<option>` elements in `index.css`.

### Full CHANGELOG History & Assets
- [x] **Full CHANGELOG History Viewer**: Updated backend `/changelog` route to bundle and render 100% of Noctune's release history.
- [x] **Tauri Application Icons Update**: Regenerated all Tauri app icons across Windows, macOS, Linux, Android, and iOS from `assets/app-icon.png`.

---

## v3.2.2 - 2026-08-02

- [x] **Linux Stream & Audio Patch**: Patched YouTube audio stream capping and WebKitGTK dropdown popups for Linux builds.

---

## v3.2.1 - 2026-08-01

### Compact Sidebar & UI Refinements
- [x] **Design System `.dropdown-panel` Token**: Standardized menu dropdown token styling and eliminated right margin gaps for compact toggle buttons.
- [x] **Clean Sidebar Scrollbars**: Applied hidden scrollbar utility to normal and compact sidebar modes while preserving scroll capabilities.

### Multi-Platform Release Preparation
- [x] **Linux Multi-Job CI Workflow**: Added `build-linux` runner job (`ubuntu-22.04`) in GitHub Actions `release.yml` for automated `.deb` and `.AppImage` packaging.
- [x] **Linux Sidecar Target**: Configured `build:binary:linux` script targeting `node24-linux-x64`.

---

## v3.2.0 - 2026-08-01

### Major Home View Redesign
- [x] **Navigation Shortcut Pills**: Added filter pills (*Liked Songs*, *Top Favorites*, *Discover Weekly*, *Recently Played*, *Short Tracks*) at the top of Home View.
- [x] **GPU Autoscroll Carousels**: Built hardware-accelerated autoscroll carousels for *Continue Listening* and *New Releases*.
- [x] **Your Playlists Horizontal Carousel**: Converted playlist grid into a manual horizontal scroll row.
- [x] **Clean Home Header**: Clean title and subtitle without duplicating sidebar greetings.

### Compact Sidebar Mode
- [x] **Collapsible Icon-Only Sidebar**: Added compact sidebar mode persisted in `localStorage` and toggled via header icon button.

### Smart Playlists & Mix Refinements
- [x] **Discover Weekly 7-Day Caching**: Added local disk cache (`discover_weekly.json`) with 7-day TTL.
- [x] **Smart Playlist Branding & Refresh**: Renamed *Most Played* to *Top Favorites*, added *In Rotation*, and introduced interactive **Refresh Playlist / Refresh Mix** buttons.

### Custom Audio Download Location
- [x] **Download Storage Selector**: Added `downloadDir` backend configuration and Settings UI selector with OS File Explorer launcher.

### Now Playing & Dynamic Visibility
- [x] **Unified 3 Equalizer Audio Bars**: Animated equalizer playing indicators across all track list views.
- [x] **Dynamic Controls Visibility**: Automatically hid `PlayerBar` and `TrackDetailsSidebar` when no track is loaded.
- [x] **Manual Changelog Modal Trigger**: Added **What's New** button in Settings View and "Don't show this again" preference.
