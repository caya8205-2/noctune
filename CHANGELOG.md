# Changelog

All notable Noctune changes are documented here.

## v4.1.0 - 2026-08-29

### Core Performance & YouTube Engine Overhaul
- **Pure Rust `innertube-rs` YouTube Audio Resolver**: Upgraded the core YouTube audio streaming resolver to native Rust [`innertube-rs`](https://github.com/caya8205-2/innertube-rs) with embedded QuickJS (`rquickjs`) deciphering, slashing stream startup latency and memory overhead.

### Recommendation & Playlist Improvements
- **20-Track Full Length Nightly Mixes & Smart Playlists**: Expanded default track generation count across all Nightly Mixes and Smart Playlists from 8 to 20 tracks.
- **Strict Genre & Artist Coherence in Nightly Mixes**: Refined the personal mix generator to prioritize contextually coherent live recommendations from seed tracks, limiting local history dumps to high-affinity matches to prevent jarring genre mashups.
- **Adaptive Shuffle Mode AutoQueue Top-Up**: Implemented an adaptive background playback counter that automatically triggers autoqueue recommendations once the current queue cycle completes, correctly accounting for repeated tracks.
- **Dynamic AutoQueue Entropy Scoring**: Injected bounded score variance into candidate selection to ensure fresh, distinct recommendations on every playback session without genre drift.
- **Single Track Queue Seeding**: Refined search view playback to seed individual selected tracks directly into dynamic autoqueue generation instead of appending the entire search results table.

### Navigation & UI Refinements
- **YouTube Channel Playlist & Navigation Enhancements**: Added dedicated Back button navigation to YouTube Channel Playlist views, streamlined multi-byte Japanese/Unicode avatar handling, and fixed double-click browser history navigation.
- **Queue View & Settings Alignment**: Polished QueueView header baseline alignment (`sm:translate-y-2`), eliminated horizontal legend scrollbars, and cleaned up Settings diagnostic controls.

### Bug Fixes
- **Nightly Mix Action Controls**: Fixed an issue where the "Refresh mix" button was disabled in PlaylistView.
- **Recommendation Engine Selection**: Fixed an issue where non-Last.fm recommendation engines fell back to generic search candidates instead of querying the selected engine.
- **Channel Playlist Track Hydration**: Fixed an issue where YouTube channel playlist tracks failed to map and appeared empty in PlaylistView.
- **Startup Prefetch ID Resolution**: Mapped valid YouTube video IDs for Spotify tracks during startup prefetch warmup, preventing unresolvable Spotify IDs from triggering invalid yt-dlp fallbacks.
- **UTF-8 Slicing Panic in Channel Scraper**: Used `floor_char_boundary` in `extract_avatar_from_html` to prevent string slicing panics on multibyte Japanese/Unicode characters.
- **Search Engine Mode Preservation**: Ensured search queries properly route through user-configured search engines (Spotify vs YouTube) without defaulting to raw YouTube results.

## v4.0.0 - 2026-08-17

### YouTube Streaming & Audio Resolver Engine Overhaul (Breaking Changes)
- **Innertube `youtubei.js@18.0.0` Upgrade & `ANDROID_VR` Client Prioritization**: Upgraded `youtubei.js` to version `18.0.0` and prioritized the `ANDROID_VR` client across all audio resolution paths. Bypasses YouTube's latest signature cipher obfuscation and GoogleVideo HTTP 403 Forbidden blocking that previously broke playback across all v3.4.0 and older installations.
- **Dual-Mode JavaScript Evaluator Shim (`Platform.shim.eval`)**: Implemented a resilient JavaScript evaluator in `youtubei.ts` supporting both plain string expressions and InnerTube AST extractor objects (`arg.output`), completely preventing decipher extraction syntax failures during player initialization.
- **Native WebM Opus Stream Prioritization**: Updated streaming format selection in both `youtubei.ts` and `ytdlp.ts` (`pickBestAudioFormat`) to prioritize native WebM Opus (`itag 251`, ~160kbps). Eliminates player decipher signature failures previously triggered by `m4a`/`mp4` streams.
- **Automated `yt-dlp` Android Extractor & Stream Auto-Recovery**: Configured bundled `yt-dlp` extraction to use the official mobile `youtube:player_client=android` client. Enhanced Fastify's `/player/stream/:videoId` endpoint with transparent auto-recovery: when an upstream YouTube stream encounters an HTTP 403 or non-OK response, the backend immediately triggers automatic fallback to `yt-dlp` to resolve and proxy a working stream seamlessly without track skips.
- **Cache Store v2 Auto-Migration & Stale URL Purging**: Bumped `CACHE_VERSION` to `2` with automated store migration on startup. Cleans legacy/unplayable pre-v4 `audioUrl` entries from local storage (`songs.json`) so newly queued tracks immediately resolve fresh WebM Opus streams while preserving 100% of user history, playlists, play counts, and track metadata.
- **Debug Dashboard Resolver Engine & Audio Format Inspector**: Added dedicated `Resolver engine` (with color-coded badges for Innertube `youtubei.js`, bundled `yt-dlp` fallback, and local storage) and `Audio format` (container type and bitrate) status rows to the **Current Track** snapshot panel in the Debug Dashboard.
- **Bundled `yt-dlp` Path Discovery in Dev & Production**: Enhanced `resolveYtdlpBinaryPath` in `ytdlp.ts` to automatically search `src-tauri/resources/` and `../src-tauri/resources/`, ensuring the bundled binary is detected across all run modes.
