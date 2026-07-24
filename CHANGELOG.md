# Changelog

All notable Noctune changes are documented here.

## v3.0.0 - 2026-07-24

### Spotify & Network Auto-Recovery
- **Spotify 401 Auto-Refresh & Retry**: Implemented automatic token refresh and 1-step retry in `spotifyApiFetch` to prevent `502 Bad Gateway` errors when Spotify credentials expire or account entitlement status changes.
- **Real Connection Diagnostics**: Updated `testSpotifyCredentials()` in Settings to execute a live test query against Spotify Web API endpoints to verify actual connection status.
- **YouTube Stream URL Recovery**: Improved automatic recovery for expired YouTube media links without applying permanent blacklisting.

### Audio Visualizer Library & Centering
- **6 Visualizer Presets**: Added `ncs` (Symmetrical NCS Ring), `wave` (Liquid Neon Wave), `orbit` (Orbital Particle Ring), `bars` (Dual Radial Bars), `ambient` (Ambient Halo Pulse), and `off`.
- **Symmetrical Dual-Mirror Mapping**: Mapped frequency spectrum symmetrically with bass frequencies centered at top center, mirroring left and right 50:50.
- **Smooth Pause Decay**: Visualizer frequency bars smoothly decay down to rest position when playback is paused before stopping the animation loop.
- **100% CD Centering**: Fixed CD artwork container geometry so Ambient Glow, CD Image, Center Hole, and SVG Visualizer Ring share exact `(50%, 50%)` center coordinates.
- **Live Preview in Settings**: Added an interactive vinyl preview box in Settings to test visualizer preset animations in real-time.

### Performance & Desktop Installation
- **GPU Usage Optimization**: Replaced heavy `backdrop-blur-xl` in `.surface-panel` cards with sleek solid dark styling, reducing GPU usage from 45% down to ~1-3%.
- **NSIS Installer Target Folder Fix**: Added `installMode: "currentUser"` to `tauri.conf.json` so setup executables default to `AppData\Local\Programs\Noctune`.

### Recommendations & Diagnostics
- **Selectable Recommendation Engines**: Added setting to choose between Last.fm (default) and Hybrid Local ML recommendation model.
- **Expanded Debug Dashboard**: Added Lyrics Cache Inspector, Playback Blacklist & Audio Cache Manager, and HTTP Request Log viewer.
- **What's New Changelog Modal**: Added automatic release notes modal that pops up on first launch after an update.

## v2.4.0 - 2026-07-23
### feat: overhaul debug dashboard, audio cache download UX, permanent blacklist & player badge legend

## v2.3.0 - 2026-07-23
### fix: add missing queueSource values to RPC TrackSchema

### fix: clear Discord RPC on app close to prevent lingering activity

### feat(debug): enhance debug dashboard with lyrics inspector, match blacklisting, and learned cache
- Add standalone 'Clear track cache' button to track action buttons in SearchView & PlaylistView
- Add 'Blacklist match' button in Resolver Match debug panel to blacklist bad YouTube IDs
- Allow 'Save as Match' for manual matcher searches without requiring a manual Spotify ID
- Rename 'Match Cache' tab to 'Learned Cache' across debug dashboard
- Add new 'Lyrics Inspector' tab in debug dashboard with manual LRCLIB search, 'Romaji Available' badge, and 'Save to Learned Cache'
- Keep Track Details Sidebar visible when Debug Dashboard is open
- Remove track limits on YouTube playlist imports by setting limit to MAX_SAFE_INTEGER
- Update scripts/sync-version.js to synchronize src-tauri/Cargo.lock version

## v2.2.3 - 2026-07-22
### fix(v2.2.3): inject discord client for RPC

### 22 Jul 2026:
- fix: add missing queueSource values to RPC TrackSchema
- fix: clear Discord RPC on app close to prevent lingering activity

## v2.2.2 - 2026-07-22
### fix(v2.2.2): inject music service credentials into release builds 
- forward Last.fm and Spotify repository secrets to the Tauri release build
- prioritize CI environment credentials over local dotenv values and rebuild when they change
- synchronize package and Tauri version metadata to 2.2.2

## v2.2.1 - 2026-07-22
### fix(v2.2.1): preserve playlist context and improve playback feedback
- rebuild playlist queues from History and retain origin metadata through playback
- record History at playback start, refresh open History view, and prioritize current queue source badges
- show loading feedback immediately after track selection and reset track action visibility when playlist menus close
- align Queue source badge spacing and synchronize app package versions to 2.2.1

## v2.2.0 - 2026-07-22
### fix: align CI node-version with pkg target (24) and add --fallback-to-source
- CI uses node-version 22 but pkg --target node24-win-x64, causing
better-sqlite3 native addon ABI mismatch at runtime (NODE_MODULE_VERSION
127 vs 137). Bump CI to Node 24 to match pkg target.
- Also add --fallback-to-source so youtubei.js modules that fail V8
bytecode generation are still included as plain source.

### feat(v2.2.0): preserve playback sources and streamline track actions
- Add source metadata to history and restore full playlist context when replaying playlist tracks.
- Replace verbose queue badges with icon legends, move queue actions into a compact overflow menu, and remove Radio Mode from the player and API surface.
- Keep player action menus scoped correctly and make playlist dropdowns stable above muted queue rows.
- Sync all package and Tauri versions to 2.2.0.

## v2.1.0 - 2026-07-15
### feat: enhance equalizer with smooth drag & preset animation, persist settings, and interactive lyrics
#### Equalizer
- Replace native with custom mouse/touch drag handler
that tracks vertical cursor position directly, eliminating erratic value jumps
- Bypass React during drag: update thumb/fill DOM via refs with zero re-renders,
giving buttery-smooth 1:1 cursor tracking
- Bypass React during preset animation: apply target band positions directly
to DOM, let CSS transitions animate, then commit to Zustand after 200ms
- UseLayoutEffect re-applies target positions after eqPreset state update so
preset buttons highlight instantly while sliders animate smoothly
- Cancel pending preset animation on drag start to prevent conflicts
- Disable CSS transitions on the actively dragged slider to avoid jank

#### EQ & Player Settings Persistence (TanStack Query + localStorage)
- Cache eqEnabled, eqBands, eqPreset under 'noctune-eq-cache' key
- Cache playbackRate, crossfadeDuration under 'noctune-player-settings' key
- Hydrate Zustand store from localStorage cache on mount
- Write back to localStorage on changes (deduplicated via ref snapshot)
- Expose as useQuery(['eq-settings']) and useQuery(['player-settings']) matching the HomeView caching pattern with staleTime: Infinity

#### Lyrics (Spotify-like interactivity)
- Add hover state tracking per line with underline decoration
- Click any synced lyric line to seekAudio to its timestamp
- Cursor pointer only on lines with valid timestamps
- Active line excluded from hover underline to avoid visual clash

### 15 Jul 2026, 6:45 UTC+8
- Replaced the installer with a rebuilt package.
- The initial CI build used Node.js 22, which caused bettersqlite3 to fail resulting in sidecar also failing
- Version number remains v2.1.0 because no application code changed.

## v2.0.0 - 2026-07-13
### v2.0.0 — inject default spotify credentials for premium-tier api access
- spotify web api now requires a premium account for metadata access (its been like that since March, i just found out about it).
- built-in credentials (set via .env → build.rs → sidecar) provide seamless metadata lookup without requiring each user to bring their own api key. user-provided credentials in settings still take priority when set.

### 15 Jul 2026 Update:
- Added a self-signed digital signature to the Windows installer.

## v1.9.1 - 2026-07-11
### fix(stats): make artist name clickable in top artists section
- Add artist navigation button in TopArtistRow
- Revert TopTrackRow click behavior to original (no artist/album clickable)
- Revert HistoryView click behavior to original

### feat(local-files): improve scanning & metadata extraction
- Add folder/file import progress UI (isScanning, scanError)
- Implement metadata fallback chain: music-metadata → ffprobe → ffmpeg thumbnail extraction
- Add server-side POST endpoint for cache file writing (Save As in Tauri)

### feat(player): short-circuit local track playback
- Skip network resolution for tracks with 'local:' prefix
- Background fetch metadata/thumbnail on demand
- Queue entire library when playing from local library

### fix(settings): implement Save As dialog for cache export
- Use Tauri save dialog on desktop
- POST base64 cache to backend write-file endpoint

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>

## v1.9.0 - 2026-07-09
### fix(critical): resolve production build data persistence and local files playback

## v1.8.0 - 2026-07-02
### fix(build): set NSIS installer/uninstaller icon + header/sidebar images
- set bundle.windows.nsis.installerIcon and uninstallerIcon to icons/icon.ico (setup.exe was falling back to the NSIS default download-arrow icon since v1.0.0)
- add nsis-header.bmp (150x57) and nsis-sidebar.bmp (164x314) for installer wizard
- regenerate icon.icns from app-icon.png

## v1.7.2 - 2026-06-28
### fix: Harden resolver matching
- Harden Spotify-to-YouTube matching by requiring title evidence before accepting candidates or cached mappings, continuing fallback queries when early results are weak, rejecting stale cache entries after rescoring, and avoiding raw first-result fallback for Spotify playback.
- Handle compact titles like I I I -> III, penalize Japanese karaoke results, and bump the resolver match cache version

## v1.7.1 - 2026-06-27
### fix(debug): embed dashboard and harden resolver matching
- Move the debug dashboard into the main app view instead of opening a second Tauri window, remove the obsolete open_debug_dashboard command, and keep sidecar shutdown async on main-window close.
- Polish the debug dashboard typography, rename the header to Debug Dashboard, make the dashboard return to Settings, and combine playback quality with Discord Rich Presence under Playback & presence.

## v1.7.0 - 2026-06-27
### chore(release): bump version to 1.7.0 and add debug preview controls
- Bump workspace and package versions to 1.7.0 in root package.json, package-lock.json, backend/package.json, frontend/package.json, src-tauri/Cargo.toml, and src-tauri/tauri.conf.json
- Add backend debug preview endpoints in backend/src/routes/debug.ts:
  - POST /debug/preview/start
  - POST /debug/preview/stop
  - GET /debug/preview/status
- Implement frontend preview process management with Windows support and frontend workspace resolution
- Add frontend/noctune-debug.bat helper to launch the preview server on Windows
- Extend frontend settings UI in frontend/src/components/settings/SettingsView.tsx with debug dashboard status, start/open/stop controls, busy states, and messages
- Add frontend API helpers in frontend/src/utils/api.ts for debug preview control
- Polish UI button layout in frontend/src/components/player/TrackDetailsSidebar.tsx

## v1.6.1 - 2026-06-27
### fix(matcher,log): improve Spotify→YouTube accuracy, fix pino mojibake, add debug dashboard
- Stale cache rejection, three matcher scoring bugs, ICU-free logging,
progressive query fallback, debug tooling, and per-track cache modal fix.
- Stale match cache (youtubeMatcher.ts, settings.ts).
- Pino mojibake fix (index.ts).
- Matcher scoring bugs (player.ts, youtubeMatcher.ts).
- Progressive query fallback (youtubeMatcher.ts).
- Debug dashboard (new).
- Home TTL cache (home.ts).
- Per-track cache clear modal fix (TrackActionButtons.tsx,
useClearTrackCache.tsx).
- Version bump to 1.6.1 (package.json, backend/package.json,
frontend/package.json, Cargo.toml, tauri.conf.json).

## v1.6.0 - 2026-06-25
### feat: add personalized nightly mixes and queue polish
- Add Last.fm-backed recommendation support, Nightly Mix home cards, cached mix refreshes, and autoqueue top-up behavior.
- Introduce shared track action buttons with add-to-playlist support across track lists, player surfaces, queue, history, search, album, and artist views.
- Add env-aware dev and Tauri launch scripts so backend/client ports can avoid conflicts with a running Noctune instance.
- Update README, env examples, app version metadata, and package locks for the v1.6.0 release.

## v1.5.0 - 2026-06-18
### release: prepare v1.5.0
- Polish list layouts across search, playlist, queue, and history views for wider desktop windows.
- Align album and artist typography with the refreshed Noctune visual system.
- Prefetch lyrics when playback changes so cached and cold lyrics are ready before opening the full player.
- Add a Preferred stream quality setting with Auto and High modes, persist it in backend settings, and make audio resolve, prefetch, URL cache, and local audio cache quality-aware.
- Record audio format and quality metadata in cache and log resolver/cache decisions so Auto vs High can be verified from backend logs.
- Bump workspace, frontend, backend, and Tauri versions to 1.5.0.

## v1.4.0 - 2026-06-17
### feat: prepare Noctune 1.4.0 stability release
- Add Japanese lyrics romanization with Kuroshiro/Kuromoji and expose Romaji mode in the full player.
- Require compatible backend capabilities when resolving desktop API ports, preserve explicit YouTube IDs during playback resolve and prefetch, and avoid rematching tracks while clearing per-track cache.
- Fix previous-track seeking behavior, bump app/package/Tauri versions to 1.4.0, and refresh README tech stack/current feature documentation.

## v1.3.0 - 2026-06-17
### feat: expand browse and update workflows
- Add album and artist browse routes plus dedicated frontend views, route-aware navigation history, and clickable track/artist/album entry points across player, sidebar, search, playlist, history, and queue surfaces.
- Add per-track cache clearing with a confirmation modal and backend cleanup for learned metadata, Spotify matches, audio files, prefetch state, and failed playback IDs.
- Add GitHub Releases update checks with startup toast, Settings controls, backend capability detection for mixed-version desktop backends, and native external URL opening for Spotify/update links without the deprecated Tauri shell opener.
- Improve search result limits and cached-query merging, preserve player controls in narrower desktop full-player layouts, and remove the accidentally committed feedback.txt tester note.
- Add the post-v1.3.0 roadmap covering the mobile app track and full-Rust nightly rewrite direction.

## v1.2.0 - 2026-06-16
### feat: ui reskin

## v1.1.0 - 2026-06-14
### fix: playlist max tracks from 100 to 2000

## v1.0.0 - 2026-06-08
### Settings & Discord RPC
- Added Discord Rich Presence (RPC) toggle in Settings, allowing users to enable or disable Discord activity status display.

### Backend & Network
- Added port fallback logic: if preferred port `3131` is busy, the backend scans up to 10 sequential ports and binds to the first available one.

### Stability & Security
- Hardened `yt-dlp` search resolver with `try-catch` blocks to prevent crashes on network failures or missing binaries.
- Added search query sanitization to filter out control and dangerous shell characters before querying `yt-dlp`.

## v1.0.0-beta.5.3 - 2026-06-01
### Playback and Resolver
- Improved stream recovery when YouTube audio URLs expire or return forbidden responses.
- Added validation for resolved YouTube stream URLs and skipped limited iOS stream URLs that can fail during playback.
- Kept playback recovery closer to the previous position instead of restarting from the beginning when possible.
- Returned stream proxy failures as safe JSON responses.

### Search and Matching
- Improved Spotify-to-YouTube scoring with stronger official/MV/original signals.
- Added artist-to-channel matching and stronger duration weighting.
- Added penalties for acoustic versions and related cover variants.
- Refreshed Spotify-to-YouTube match cache version so improved scoring can take effect.

### Discord RPC
- Refined Discord activity display so Noctune stays as the listening app while title, artist, and album metadata are shown in the right places.
- Cleared activity while playback is paused.

### UI and Responsive Layout
- Restored desktop full-player behavior with the track details sidebar and bottom mini player.
- Kept inline full-player controls and embedded details limited to mobile layouts.
- Made Search, History, Playlist, and Home track rows/cards play with one click.
- Removed redundant hover play buttons so row actions stay cleaner and closer to duration text.
- Updated remaining old scaffold naming to Noctune.

### Packaging and Cleanup
- Removed obsolete setup script and kept generated/local artifacts out of source control.

## v1.0.0-beta.5 - 2026-05-30
### Playback and Resolver
- Moved the main playback path to a faster local YouTube resolver powered by `youtubei.js`, with `yt-dlp` kept as fallback.
- Improved cold playback and seeking behavior for uncached tracks.
- Added same-origin backend stream proxy behavior needed for desktop playback and Web Audio visualization.
- Added local audio file caching with background cache jobs, cache status badges, cache size limits, and audio cache clearing.
- Added temporary failed-stream blacklist so broken candidates are skipped after playback failures.
- Added resolver diagnostics for active resolver, prefetch state, failed IDs, and Spotify match cache.

### Search and Matching
- Added direct engine switching inside Search between YouTube and Spotify.
- Added URL-aware search for YouTube and Spotify links.
- Improved Spotify-to-YouTube scoring with penalties for reactions, reviews, live/tour versions, covers, karaoke, instrumental versions, piano covers, drum covers, backing tracks, sheet music, nightcore, sped-up/slowed edits, and unrelated clips.
- Added Spotify-to-YouTube match cache clearing.
- Added Search scoring debug mode with candidate scores and scoring reasons.
- Added recent searches.
- Added fallback action to try the other engine when Search has no results.

### Queue and Playlists
- Added draggable queue reorder with visual drag handles.
- Added queue actions for shuffle, hide failed tracks, remove played tracks, remove individual queue items, and clear queue.
- Added queue badges for manual/search/playlist/autoqueue/cache status.
- Changed playlist playback so playing any track from a playlist keeps the full playlist context instead of replacing the queue with autoqueue.
- Added Play all for playlists.
- Added playlist track filtering and sort modes.
- Added playlist edit tools: rename, cover upload, cover crop with grid overlay, WebP conversion, reorder, and remove tracks.
- Added Liked Songs behavior and like buttons across key views.
- Added Spotify and YouTube playlist import with better loading and error feedback.

### Lyrics and Player UI
- Added LRCLIB synced lyrics support with local lyrics cache.
- Added full player view with album disk, lyrics space, and adaptive circular visualizer.
- Added visualizer color adaptation from current album art.
- Improved progress and volume sliders for easier seeking and control.
- Added track details sidebar with Spotify metadata when available and local resolver details otherwise.

### History and Library
- Added History view and made it record actual playback instead of prefetch activity.
- Updated history recording to preserve Spotify metadata when Spotify tracks are resolved to YouTube streams.
- Added single-item history removal and full history clearing.
- Improved home view cards, playlist cards, and now-playing layout.

### Settings and Diagnostics
- Reworked Settings sections for Spotify credentials, diagnostics, cache, about, and version info.
- Clarified that Spotify credentials are used for metadata search, playlist import, and release discovery, not Spotify playback.
- Added cache import/export, full cache clear, audio cache clear, and audio cache limit controls.
- Added custom Search scoring debug toggle.
- Updated displayed version to `v1.0.0-beta.5`.

### Desktop and Packaging
- Improved Tauri desktop backend wiring and production API targeting.
- Fixed desktop audio playback issues related to stream source/CORS behavior.
- Kept local app data out of git while allowing development data to regenerate automatically.

## v1.0.0-beta.4 and Earlier

- Initial Noctune desktop player foundation.
- Spotify metadata search and YouTube playback resolver.
- Smart autoqueue and prefetch system.
- Local playlists, liked songs, and cache learning basics.
- Initial Tauri desktop packaging and app icon.
