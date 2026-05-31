# Changelog

All notable Noctune changes are documented here.

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
