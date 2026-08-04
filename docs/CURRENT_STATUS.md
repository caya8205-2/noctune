# Current Status & Release Tracker (v3.3.0)

This document tracks all new features, bug fixes, patches, and implementation approaches taken for Noctune.

---

## 1. Features & UI Redesign

- [x] **Major Home View Redesign**
  - **Navigation Shortcut Pills**: Added quick-access filter pills at the top of Home View (`Liked Songs`, `Top Favorites`, `Discover Weekly`, `Recently Played`, `Short Tracks`) for one-tap section navigation and filtering.
  - **Continue Listening & New Releases GPU Autoscroll Carousels**: Built GPU hardware-accelerated horizontal autoscroll carousels (`transform: translate3d(-Xpx, 0, 0)` & `will-change-transform`), featuring a 2.5-second hold on the final card, vertical-to-horizontal mouse wheel scroll conversion, and hover pause.
  - **Your Playlists Manual Horizontal Carousel**: Converted `Your Playlists` grid into a manual horizontal scroll row (`ManualHorizontalCarousel`) using non-passive `wheel` event listeners to prevent vertical page clutter.
  - **Recently Played Redesign**: Refreshed Recently Played section with clean track rows and layout.
  - **Clean Home Header**: Displayed a clean title ("Home") and subtitle without duplicating sidebar greetings.

- [x] **Compact Sidebar Mode**
  - **Collapsible Icon-Only Sidebar**: Implemented a compact sidebar mode (`sidebarCompact` state persisted in `localStorage`) toggled via top header icon button (`PanelLeftOpen`/`PanelLeftClose`).
  - **Design System `.dropdown-panel` Token & Menu Consistency**: Added `.dropdown-panel` component token in `index.css` matching Noctune dropdown design system (`border border-base-600 bg-base-900 shadow-2xl shadow-black/80`). Reduced right padding on header containers (`px-0.5`) to eliminate right margin gaps for `+` and compact toggle buttons.
  - **Clean Sidebar Scrollbars**: Applied `scrollbar-hidden` to both normal and compact sidebar modes for a clean UI without visible scrollbars while maintaining full mouse wheel scrolling capability.

- [x] **Smart Playlists & Nightly Mix Refinements**
  - **Discover Weekly 7-Day Caching & Refetch Fix**: Added `discoverWeekly.ts` backend service with local disk persistence (`discover_weekly.json`) and 7-day TTL (`ONE_WEEK_MS`), preventing redundant recommendation refetches on component mount.
  - **Smart Playlist Branding & Renaming**: Renamed Smart Playlist labels (*Most Played* ➔ *Top Favorites*) and replaced the duplicate *Recently Played* smart playlist with *In Rotation*, a recommendation mix distinct from the real History view and Nightly Mixes such as *Deep Rotation*.
  - **Playlist & Nightly Mix Refresh Action**: Added an interactive **Refresh Playlist / Refresh Mix** button (`<RefreshCw />`) across all Smart Playlist views and Nightly Mixes to trigger real-time recommendation updates.

- [x] **Custom Audio Download Location**
  - **Download Storage Path Selector**: Added `downloadDir` configuration in backend (`env.ts` & `settings.ts`) and Settings View UI, complete with `POST /settings/open-download-dir` endpoint to launch OS File Explorer.

- [x] **Now Playing & Dynamic Visibility**
  - **Unified 3 Audio Bars Playing Indicator**: Replaced track numbers with 3 animated accent equalizer audio bars (`PlayingBars`) when playing across all track list views (*Home Recently Played, Album View, Artist View, Playlist View, Queue View, Search View, History View*).
  - **Cover Card Playing Indicator Alignment**: Positioned 3 audio bars on the right side of track titles in `CleanCoverCard`, vertically centered between title and artist name with clean right margin (`mr-1.5`).
  - **Clean Cover Artwork Outline**: Applied crisp accent border outline (`border border-accent`) around active cover artwork while keeping track title text white (`text-white hover:text-accent`).
  - **Unified Active Track Row Background**: Standardized active track row background in `PlaylistView` and `QueueView` to Noctune's global `bg-accent/10`.
  - **Dynamic Mini Player & Track Details Visibility**: Conditioned `PlayerBar` and `TrackDetailsSidebar` on `Boolean(currentTrack)`, automatically hiding both components when no track is loaded to reclaim screen real estate.
  - **Title Bar Logo Alignment**: Positioned official Noctune `/app-icon.png` logo on the far right (`ml-auto`) of the title bar with clean borderless styling.
  - **Changelog Modal & Fallback Sync**: Updated `DEFAULT_HIGHLIGHTS` in `ChangelogModal.tsx` and `FALLBACK_CHANGELOG` in backend `updates.ts` to deliver `v3.2.0` release notes in full sync with `CHANGELOG.md`.
  - **Manual Changelog Modal Trigger & Settings Button**: Exported `openChangelogModal()` helper listening to `noctune:open-changelog` window event, and added a **What's New** button in Settings View to allow viewing release notes anytime on demand.
  - **Changelog Modal Preferences & Notice**: Added a "Don't show this again" checkbox in the modal footer and an informational banner explaining that release notes can be revisited anytime via Settings > What's New.

## 2. Environment Variables & Scripts

- [x] **SignPath PowerShell Script (`scripts/noctune-signing.ps1`)**
  - **Technical Approach**: Added automatic loading of `.env` variables from root directory (`Join-Path $PSScriptRoot "..\.env"`), reading `SIGN_TOKEN`, `ORGANIZATION_ID`, `INPUT_PATH`, and `OUTPUT_PATH` (matching `.env.example`), validating environment variable presence before execution, and passing parameters to `Submit-SigningRequest`.

## 3. Multi-Platform & CI/CD Pipeline

- [x] **Linux Build Pipeline & Binary Target**
  - **Technical Approach**: Added `build-linux` job to `.github/workflows/release.yml` running on `ubuntu-22.04` with GTK, WebKit, and `libayatana-appindicator3-dev` dependencies to compile `.deb` and `.AppImage` packages. Removed SignPath code-signing steps from `build-windows` to bypass yearly quota limits. Configured `Swatinem/rust-cache@v2`, `paths: [package.json]` trigger filter, and `concurrency: cancel-in-progress: true` in `release.yml` with `dist/windows/*` and `dist/linux/*` wildcard release attachments. Configured `build:binary:linux` script in `backend/package.json` to output `noctune-backend-x86_64-unknown-linux-gnu` sidecar.
  - **Linux Audio Stream Capping Fix**: Removed artificial 1MB (`bytes=0-1048575`) range capping in `player.ts` `fetchAudioStream` to allow full continuous streaming without premature audio cutoff / track auto-skip at ~25 seconds.
  - **Linux DevTools Port Discovery Cleanup**: Configured `getApiBase()` in `api.ts` to retry port 3131 4 times during cold start before scanning other ports, eliminating 10 connection refused console error logs.
  - **Global Dark Mode Select & Option Styling**: Added `color-scheme: dark;` and `select, option { background-color: #18181c; color: #ffffff; }` in `index.css` `@layer base` to enforce dark mode options dropdown popups across WebKitGTK (Linux) and Chromium.
  - **Tauri Application Icons Update**: Regenerated all Tauri app icons across Windows (.ico), macOS (.icns), Linux (.png), Android, and iOS from the new black background logo `assets/app-icon.png` using `npx tauri icon`.
  - **Audio Stream Metadata Readiness & CORS Policy Fix**: Added `Cross-Origin-Resource-Policy: cross-origin` and `Access-Control-Expose-Headers` in `player.ts` stream responses, and updated `useAudio.ts` to await `waitForAudioReady(audio)` before calling `playAudio(audio)` to prevent WebKitGTK / GStreamer media pipeline aborts and premature paused state.
  - **Instant Optimistic Mini Player & Loading Indicator**: Updated `playTrack` in `player.ts` store to optimistically set `currentTrack` and `isLoading: true` the exact millisecond a track is clicked, instantly displaying the Mini Player bar with spinning artwork and button loaders while backend resolving proceeds in background.
  - **Unmapped Spotify Stream Request Guard**: Added guard in `useAudio.ts` to skip stream request calls (`GET /player/stream/spotify:...`) when a track is an optimistic Spotify track that has not yet been resolved to a YouTube Video ID (`youtubeId`). Prevents 404 stream errors and audio error state during optimistic Mini Player display.
  - **Pure YouTube Channel View Routing Restored**: Restored `/browse/artist/:id` routing in `browse.ts` so `ytchannel:` requests directly query YouTube Channel uploads without Spotify search intervention, preserving dual-source architecture.
  - **Artwork Lightbox Modal & Download**: Added `ArtworkLightboxModal.tsx` and clickable artwork hover overlays in `TrackDetailsSidebar.tsx` allowing users to view full-resolution cover art/thumbnails in a viewport modal and download them directly to disk with a **Download Artwork** button.
  - **Direct Track Stream Download & Timestamp Overhaul**: Updated `POST /player/download-tracks` in `player.ts` to download audio streams directly with `Range: bytes=0-` headers and `writeAudioChunk` buffer flushing, bypassing cache dependencies and setting file `mtime` to current time so downloaded files appear at the top of Downloads folder. Restored YouTube channel Videos/Playlists tab switcher visibility in `ArtistView.tsx` and fixed DevTools `ContinuationItemView` error fallback in `youtubei.ts`.

---

## 4. Comprehensive v3.3.0 Minor Release Audit & System Status

- [x] **Dedicated YouTube Channel View & Multi-Platform Extraction**
  - **Dedicated YouTube Channel Profiles**: Full-featured channel view for YouTube creators (`browseYouTubeChannel`) with top tracks, avatars, subscriber counts, and channel playlists.
  - **Cross-Platform yt-dlp Sidecar Bundling (`prepare-ytdlp.mjs`)**: Bundled native platform-specific binaries for Windows (`yt-dlp.exe`) and Linux (`yt-dlp_linux`), removing the need for a manual yt-dlp installation. YouTube extraction still requires an internet connection.
  - **Dedicated yt-dlp Channel Extraction (`ytdlp.ts`)**: Channel view now uses the bundled cross-platform yt-dlp binary directly for uploads, channel metadata, and public playlists. Innertube is intentionally excluded from this path because its channel tabs are inconsistent across Topic, creator, and handle channels; known channel IDs never use generic search fallback.
  - **External Playlist Resolution**: Added `ytplaylist:` support through `GET /playlists/:id` and `/browse/youtube-playlist/:id` so channel playlists open inside Noctune.
  - **Channel Videos & Playlists Tabs (`ArtistView.tsx`)**: Added persistent tabs, a clean empty state for channels without public playlists, and removed the duplicated `VIDEOS` heading beneath the active tab.
  - **Channel & Playlist Navigation History**: Added history entries for channel tab changes and virtual `ytplaylist:` routes so mouse back restores the correct channel tab. Channel data uses a five-minute frontend cache.
  - **Topic Channel Extraction Hardening**: Bundled yt-dlp channel extraction now handles channels without `/videos` or `/playlists` tabs, keeps uploads available when playlists are absent, and exposes loading/empty/avatar fallbacks in the UI.
  - **Home History Routing**: Home's `Recently Played` shortcuts now open the real History view instead of a duplicate history smart playlist.
  - **In Rotation Recommendations**: Replaced the duplicate history smart playlist with fresh recommendations based on recent listening, with a description and dedicated Orbit sidebar icon.
  - **Recently Played Label Fix**: Fixed Home track rows where artist names were concatenated directly onto titles.

- [x] **Artwork Lightbox & High-Res Cover Downloads**
  - **Interactive Artwork Lightbox**: Built high-resolution cover art viewer with zoom controls across Album, Artist, Playlist, and Track Details views.
  - **Backend Endpoint (`POST /player/download-artwork`)**: Added data URL (Base64) handling and 10s fetch timeout to save original artwork directly into Noctune's configured `downloadDir` with real-time status and destination path feedback (`Saved to ...`).

- [x] **Direct Track Audio Stream Download Engine**
  - **Direct Stream Download Engine**: Overhauled `POST /player/download-tracks` in `player.ts` to perform direct fetch streaming (`Range: bytes=0-` & `writeAudioChunk` buffer draining) directly to `downloadDir`. Eliminates cache dependencies and fixes stuck 0KB downloads while updating file `mtime` so downloaded tracks appear at the top of File Explorer.
  - **Dynamic Download Toast Position**: Updated `useDownloadTrack.tsx` to dynamically anchor download completion toasts (`bottom-20` when Mini Player is visible, `bottom-6` when hidden).

- [x] **Playlist Management & Drag-and-Drop Polish**
  - **Separated Playlist Edit Action Controls**: Redesigned playlist edit mode controls in `PlaylistView.tsx` to display distinct **Done** (accent button with check icon) and **Cancel** (ghost button with X icon) actions, replacing the confusing single red button.
  - **Playlist Drag-and-Drop Reordering Fix**: DnD starts only from the grip, uses accurate validated indices, shows live row movement/highlight feedback, and avoids misleading draggable cursors outside the grip.
  - **Transactional Playlist Editing**: Reorders remain local until **Done**; **Cancel** restores the complete pre-edit snapshot, discards pending changes, and keeps playlist/sidebar cache state consistent.

- [x] **UI Layout & Visualizer Polish**
  - **Clickable Creator & Artist Names Everywhere**: Enabled interactive channel profile navigation across all track lists, player controls, sidebar panels, and playlist views so clicking any creator or artist name instantly opens their dedicated profile.
  - **Header Margin Standardization**: Aligned top header margins in `LocalFilesView.tsx` and `StatsView.tsx` to match `HomeView.tsx` and `PlaylistView.tsx`.
  - **Home View Animations Cleanup**: Removed redundant background particle animations in `HomeView.tsx` header to minimize GPU/CPU overhead.
  - **Visualizer Pulse Refinement**: Calibrated album art bass-pulse intensity in `PlayerView.tsx` visualizer canvas.
  - **Local Library Folder History**: Opening a local folder creates a browser-history entry so mouse back returns to the folder list; the explicit **Back to folders** button remains supported.
  - **External Playlist Loading Feedback**: Added centered loading and empty states for channel playlist track resolution.

- [x] **Playback, History & Settings Reliability**
  - **Immediate History Synchronization**: Playback-start history writes now move repeated tracks to the top with a refreshed timestamp and update Home Recently Played listeners immediately.
  - **Themed Confirmation Dialogs**: Cache, failed-ID, and match-clearing actions use the global Noctune confirmation modal instead of native dialog commands.
