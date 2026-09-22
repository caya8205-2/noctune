# Spotstream Integration into Noctune — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Integrate `spotstream` as an **optional** native Rust library crate into Noctune's Tauri backend, enabling direct Spotify audio streaming (320kbps Vorbis → decoded PCM) as an opt-in alternative to the default innertube-rs YouTube matching pipeline. The default behavior remains unchanged — spotstream is only activated when a user explicitly enables it in Settings and pairs their own Spotify Premium account.

**Architecture:** Add `spotstream = "0.1.0"` to `src-tauri/Cargo.toml`, create a new `spotify_service.rs` module in `src-tauri/src/` that wraps spotstream's library API (auth, session, streaming, metadata, playlists), expose it to the frontend via Tauri `#[tauri::command]` IPC, and extend the Node.js backend with a `/player/stream/spotify:<id>` path that pipes PCM through FFmpeg to produce seekable WebM/Opus served to the Web Audio API. The session is kept alive as long-running shared state (not per-request), solving the "session-per-command overhead" concern from the code review.

**Tech Stack:** Rust (spotstream/librespot), Tauri 2 IPC, tokio async, existing Node.js backend (Fastify) for HTTP streaming proxy

---

## Critical Design Constraint: Optional, Not a Replacement

spotstream **does NOT replace** innertube-rs. Rationale:

1. **Noctune already injects the developer's Spotify Web API credentials** — all users get metadata, search, and YouTube matching out of the box without needing any Spotify account.
2. **Spotify Web API now requires Premium** (since March 2026). If we made spotstream the default, we'd be forcing every user to have a Premium account just to play music. That defeats the purpose.
3. **innertube-rs remains the default Spotify playback engine**: Spotify track → YouTube match → innertube-rs stream. This works for every user, Premium or not.
4. **spotstream is an opt-in upgrade** for users who happen to have Premium and want higher quality / zero matching delay / personalized playlist access.

The setting is exposed as **"Spotify Playback"** in Settings with two options:
- **YouTube Match (default)** — Current behavior. Spotify tracks are matched to YouTube via the scoring heuristic and streamed via innertube-rs. Works for everyone, no extra setup.
- **Spotify Direct** — Streams directly from Spotify at 320kbps. Requires Spotify Premium + one-time OAuth device pairing. Shows pairing UI when selected.

Users can also still input their own Spotify Web API credentials in Settings (existing feature) — that's separate from this and only affects metadata/search, not audio playback.

---

## Current Architecture (What Exists)

```
Frontend (React/Vite)
    │
    ├── Tauri IPC ──► src-tauri/src/ (Rust)
    │                   ├── innertube_service.rs  (search, metadata, stream URL via innertube-rs)
    │                   ├── youtube_channel.rs    (channel/playlist scraping)
    │                   └── lib.rs                (Tauri app setup, sidecar management)
    │
    └── HTTP ──► backend/ (Node.js Fastify, port 3131/3132)
                    ├── services/audioResolver.ts   (innertube → ytdlp fallback chain)
                    ├── services/spotify.ts         (Web API: metadata, search, playlists)
                    ├── services/youtubeMatcher.ts   (Spotify→YouTube match scoring)
                    ├── routes/player.ts            (resolve, stream proxy, prefetch, cache)
                    └── routes/search.ts            (search with spotify/youtube source)
```

### Current Spotify Playback Flow (Indirect — remains the DEFAULT)
1. User plays a Spotify track (id: `spotify:<id>`)
2. `player.ts` → `resolvePlayableVideoId()` → calls `matchSpotifyTrackToYoutube()`
3. `youtubeMatcher.ts` → searches YouTube for matching video using title+artist+duration scoring
4. Resolved YouTube `videoId` → `resolveAudioUrl()` via innertube-rs → returns Google CDN URL
5. Frontend plays Google CDN audio via `<audio>` element through backend stream proxy

---

## Proposed Architecture (After Integration)

```
Frontend (React/Vite)
    │
    ├── Tauri IPC ──► src-tauri/src/ (Rust)
    │                   ├── innertube_service.rs     (unchanged)
    │                   ├── youtube_channel.rs       (unchanged)
    │                   ├── spotify_service.rs  ← NEW (spotstream native integration)
    │                   │     ├── SpotifySessionState  (long-lived session via OnceCell)
    │                   │     ├── spotify_auth_status   → check if credentials exist
    │                   │     ├── spotify_start_pairing → RFC 8628 device auth
    │                   │     ├── spotify_poll_pairing  → poll + save credentials
    │                   │     ├── spotify_track_info    → metadata via Mercury
    │                   │     ├── spotify_playlist      → playlist tracks via Mercury
    │                   │     └── spotify_disconnect    → remove credentials + shutdown session
    │                   └── lib.rs                     (register new commands + state)
    │
    └── HTTP ──► backend/ (Node.js Fastify)
                    ├── services/spotifyDirect.ts  ← NEW (stream orchestrator)
                    │     └── spawnSpotstream() → PCM pipe → FFmpeg → Opus/WebM
                    ├── routes/player.ts           (extended: spotify direct stream path)
                    ├── routes/settings.ts         (extended: spotifyPlayback setting)
                    └── services/env.ts            (extended: spotifyPlayback config field)
```

### New Spotify Playback Flow (Direct — only when user opts in)
1. **Config check**: `env.spotifyPlayback === 'spotify-direct'` AND spotstream credentials exist
2. User plays a Spotify track (id: `spotify:<id>`)
3. `player.ts` → `spotifyDirect.ts` → spawns `spotstream stream <id>` subprocess
4. PCM s16le 44100Hz stdout → FFmpeg transcode → Opus/WebM container → HTTP 206 stream proxy
5. Frontend plays Opus/WebM via `<audio>` element through same backend stream proxy
6. **Fallback**: If stream fails or spotstream unavailable → existing YouTube matching pipeline (unchanged)

### When `env.spotifyPlayback === 'youtube-match'` (default)
- Nothing changes. Exact same flow as today. spotstream module exists but is dormant.

---

## Step-by-Step Plan

### Phase 1: Settings & Config Layer

#### Task 1.1: Add `spotifyPlayback` field to EnvConfig

**Objective:** Add the new setting to the backend config system.

**Files:**
- Modify: `backend/src/services/env.ts`

**Changes:**
```typescript
// In EnvConfig interface:
spotifyPlayback: 'youtube-match' | 'spotify-direct';

// In DEFAULTS:
spotifyPlayback: 'youtube-match',
```

- No migration needed — missing field falls back to default `'youtube-match'`

---

#### Task 1.2: Extend settings routes for the new field

**Objective:** Allow reading/writing the `spotifyPlayback` setting via the existing PATCH /settings endpoint.

**Files:**
- Modify: `backend/src/routes/settings.ts`

**Changes:**
- Add `spotifyPlayback: z.enum(['youtube-match', 'spotify-direct']).optional()` to `UpdateBody` schema
- Include `spotifyPlayback` in GET /settings response
- Include `spotifyPlayback` in PATCH /settings response

---

### Phase 2: Rust Crate Integration & Session Management

#### Task 2.1: Add spotstream dependency to Noctune Cargo.toml

**Objective:** Add `spotstream = "0.1.0"` crate dependency.

**Files:**
- Modify: `src-tauri/Cargo.toml`

**Changes:**
```toml
[dependencies]
# ... existing deps ...
spotstream = "0.1.0"
```

**Verification:**
```bash
cd src-tauri && cargo check
```

---

#### Task 2.2: Create `spotify_service.rs` with long-lived session state

**Objective:** Create the Rust module that wraps spotstream's library API with a shared, long-lived Spotify session managed via `tokio::sync::OnceCell`. This solves the "session-per-command overhead" issue from the code review — the session connects once and is reused across all subsequent IPC calls.

**Files:**
- Create: `src-tauri/src/spotify_service.rs`

**Key design decisions:**
- `SpotifySessionState` struct holds `OnceCell<Session>` — lazy-init on first use, kept alive for app lifetime
- Session auto-reconnects if the connection drops (librespot handles this internally via cached credentials)
- Cache directory: `dirs::data_local_dir() / "spotstream" / "cache"` (same as CLI, shares credentials)
- All commands are `async` and use `tauri::State<SpotifySessionState>`

**Exports (Tauri commands):**
1. `spotify_auth_status` → `{ authenticated: bool, cache_path: String }`
2. `spotify_start_pairing` → `{ user_code: String, verification_uri: String, device_code: String, expires_in: u64, interval: u64 }`
3. `spotify_poll_pairing(device_code, expires_in, interval)` → `{ success: bool }`
4. `spotify_track_info(track_id)` → `{ id, title, artists, album, duration_ms }`
5. `spotify_playlist_info(playlist_id)` → `{ name, description, tracks: [{ id, uri }] }`
6. `spotify_disconnect` → removes credentials, shuts down session, resets `OnceCell`

---

#### Task 2.3: Register spotify_service module and state in lib.rs

**Objective:** Wire up the new module into Tauri's app builder.

**Files:**
- Modify: `src-tauri/src/lib.rs`

**Changes:**
1. Add `mod spotify_service;`
2. Import the Tauri commands from `spotify_service`
3. Add `.manage(SpotifySessionState::new())` to the builder
4. Register all 6 commands in `invoke_handler`

**Verification:**
```bash
cd src-tauri && cargo check && cargo clippy --all-targets -- -D warnings
```

---

### Phase 3: Node.js Backend — Direct Spotify Streaming

#### Task 3.1: Create `spotifyDirect.ts` service

**Objective:** Create a service that spawns the `spotstream` CLI binary to stream Spotify audio directly, transcodes PCM via FFmpeg to Opus/WebM, and serves it as a seekable HTTP stream.

**Files:**
- Create: `backend/src/services/spotifyDirect.ts`

**Key design:**
- `isSpotstreamAvailable()`: Checks if `spotstream.exe` exists in PATH (`%LOCALAPPDATA%/avpull/spotstream.exe`) and credentials are cached at `%LOCALAPPDATA%/spotstream/cache/credentials.json`
- `isSpotifyDirectEnabled()`: Checks `getEnvConfig().spotifyPlayback === 'spotify-direct'` AND `isSpotstreamAvailable()` — both must be true
- `streamSpotifyTrack(spotifyId)`: Spawns `spotstream stream <id>`, pipes stdout (PCM s16le 44100Hz stereo) through FFmpeg:
  ```
  spotstream stream <id> | ffmpeg -f s16le -ar 44100 -ac 2 -i pipe:0 -c:a libopus -b:a 128k -vbr on -f webm pipe:1
  ```
- Returns a `Readable` stream of Opus/WebM data
- Includes process cleanup on abort/error/disconnect

**Note:** In production (packaged Tauri app), the `spotstream` binary isn't bundled — it's a user-installed CLI at `%LOCALAPPDATA%/avpull/spotstream.exe`. The backend discovers it via PATH or explicit env var `SPOTSTREAM_PATH`. In the future (when Noctune backend is fully Rust), this entire service becomes unnecessary because streaming will be done natively in-process via the `spotstream` crate's `stream_track()` function.

---

#### Task 3.2: Extend `player.ts` for Spotify direct resolve + stream

**Objective:** Add conditional handling in `/player/resolve/:videoId` and `/player/stream/:videoId` for `spotify:` prefixed IDs when Spotify Direct is enabled.

**Files:**
- Modify: `backend/src/routes/player.ts`

**Changes in `/player/resolve/:videoId`:**
- When `videoId` starts with `spotify:` AND `isSpotifyDirectEnabled()`:
  1. Skip YouTube matching entirely
  2. Fetch metadata via existing Spotify Web API (`getSpotifyTrackById`)
  3. Return a CachedTrack with:
     - `audioUrl: /player/stream/spotify:<id>`
     - `resolverSource: 'spotstream'`
     - `audioFormat: 'webm'`
     - `audioQuality: 'spotify-320kbps'`
  4. On error: fall back to existing `resolvePlayableVideoId()` (YouTube match)
- When `videoId` starts with `spotify:` AND `isSpotifyDirectEnabled()` is FALSE:
  - Existing behavior unchanged: YouTube matching via `resolvePlayableVideoId()`

**Changes in `/player/stream/:videoId`:**
- When `videoId` starts with `spotify:` AND `isSpotifyDirectEnabled()`:
  1. Extract spotifyId from the prefix
  2. Call `streamSpotifyTrack(spotifyId)` from `spotifyDirect.ts`
  3. Pipe the Opus/WebM readable stream directly to the HTTP response with proper headers:
     - `Content-Type: audio/webm`
     - `Accept-Ranges: bytes`
     - CORS headers (same as existing YouTube proxy)
  4. On error: return 502 (frontend handles retry via YouTube match on next attempt)

---

### Phase 4: Frontend Integration

#### Task 4.1: Add "Spotify Playback" setting in SettingsView

**Objective:** Add a dropdown in the Settings UI for choosing the Spotify playback engine.

**Files:**
- Modify: `frontend/src/components/settings/SettingsView.tsx`

**UI design:**
Located in the existing Playback section, after the Audio Quality selector:

```
Spotify Playback
┌──────────────────────────────────────┐
│ ● YouTube Match (default)            │   ← innertube-rs pipeline, works for everyone
│ ○ Spotify Direct                     │   ← requires Premium + OAuth pairing
└──────────────────────────────────────┘
```

When "Spotify Direct" is selected:
- If not yet paired: show inline pairing UI
  - "Pair Spotify Account" button
  - On click: call `invoke('spotify_start_pairing')`
  - Show pairing code + link to `spotify.com/pair`
  - Poll via `invoke('spotify_poll_pairing', ...)`
  - On success: show green "Connected" badge
- If already paired: show "Connected" status + "Disconnect" button
- Small note below: "Requires Spotify Premium. Streams audio directly at 320kbps without YouTube conversion."

When "YouTube Match" is selected:
- Pairing section hidden. Existing behavior.

**Interaction with existing Spotify Web API credentials input:**
- These remain separate and untouched. Web API credentials affect metadata/search/recommendations.
- Spotify Direct (spotstream) affects only audio playback. They're independent systems.

---

#### Task 4.2: Update `api.ts` with Spotify IPC methods

**Objective:** Add frontend API wrappers for the new Tauri IPC commands.

**Files:**
- Modify: `frontend/src/utils/api.ts`

**New methods on `api` object:**
```typescript
spotifyAuthStatus: async () => {
  if (!detectTauriEnvironment()) return { authenticated: false, cachePath: '' };
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<{ authenticated: boolean; cachePath: string }>('spotify_auth_status');
},
spotifyStartPairing: async () => {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<{ userCode: string; verificationUri: string; deviceCode: string; expiresIn: number; interval: number }>('spotify_start_pairing');
},
spotifyPollPairing: async (deviceCode: string, expiresIn: number, interval: number) => {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<{ success: boolean }>('spotify_poll_pairing', { deviceCode, expiresIn, interval });
},
spotifyDisconnect: async () => {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<{ success: boolean }>('spotify_disconnect');
},
spotifyTrackInfo: async (trackId: string) => {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<{ id: string; title: string; artists: string[]; album: string; durationMs: number }>('spotify_track_info', { trackId });
},
spotifyPlaylistInfo: async (playlistId: string) => {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<{ name: string; description: string; tracks: Array<{ id: string; uri: string }> }>('spotify_playlist_info', { playlistId });
},
```

---

#### Task 4.3: Show Spotify Direct badge in player UI

**Objective:** When a track is streaming via spotstream, show a visual indicator.

**Files:**
- Modify: `frontend/src/components/player/PlayerBar.tsx` (or relevant component)

**Changes:**
- When `currentTrack.resolverSource === 'spotstream'` or `currentTrack.audioQuality === 'spotify-320kbps'`:
  - Show a small green Spotify icon/badge next to the track title
  - Tooltip: "Streaming directly from Spotify (320kbps)"

---

### Phase 5: Personalized Playlist Support (Mercury Protocol)

#### Task 5.1: Enable personalized playlist fetching when Spotify Direct is active

**Objective:** When Spotify Direct mode is enabled AND the user has paired their account, personalized playlists (Daily Mix, Discover Weekly, etc.) can be fetched via Mercury protocol through the `spotify_playlist_info` Tauri IPC.

**Files:**
- Modify: `backend/src/services/spotify.ts` — `getSpotifyPlaylistTracks()`
- Modify: `frontend/src/utils/api.ts` (playlist import logic)

**Changes:**
- In `getSpotifyPlaylistTracks()`: when Web API returns 404 (personalized playlist) AND Spotify Direct is enabled, attempt resolution via Tauri IPC `spotify_playlist_info` → returns track IDs → enrich with Web API metadata per track
- This enables Daily Mix, Discover Weekly, and other personalized playlists that are inaccessible via Client Credentials Web API

---

### Phase 6: Testing & Verification

#### Task 6.1: Verify Rust compilation

```bash
cd src-tauri
cargo check
cargo clippy --all-targets -- -D warnings
```

#### Task 6.2: Verify default behavior unchanged (manual)

1. Launch Noctune dev mode
2. Confirm Settings → Spotify Playback shows "YouTube Match (default)"
3. Play a Spotify track
4. Verify: track is matched to YouTube and streamed via innertube-rs (existing behavior, no change)

#### Task 6.3: Verify Spotify Direct opt-in flow (manual)

1. Open Settings → Spotify Playback → select "Spotify Direct"
2. Follow pairing UI → complete pairing at spotify.com/pair
3. Verify status shows "Connected"
4. Play a Spotify track
5. Verify:
   - Track plays without YouTube matching delay
   - Backend logs show `resolverSource: 'spotstream'`
   - Player UI shows Spotify Direct badge
   - Seek works correctly within the track

#### Task 6.4: Verify fallback (manual)

1. With Spotify Direct enabled, rename/remove `spotstream.exe`
2. Play a Spotify track
3. Verify: track falls back to YouTube matching pipeline and still plays

#### Task 6.5: Verify disconnect (manual)

1. With Spotify Direct active, click "Disconnect" in Settings
2. Verify: setting reverts to "YouTube Match"
3. Play a Spotify track
4. Verify: YouTube matching pipeline used

---

## Files Summary

| Action | File Path | Description |
|--------|-----------|-------------|
| Modify | `backend/src/services/env.ts` | Add `spotifyPlayback` config field |
| Modify | `backend/src/routes/settings.ts` | Extend schema for `spotifyPlayback` |
| Modify | `src-tauri/Cargo.toml` | Add `spotstream = "0.1.0"` |
| Create | `src-tauri/src/spotify_service.rs` | Rust module: session state, auth, metadata, playlist IPC |
| Modify | `src-tauri/src/lib.rs` | Register module, state, commands |
| Create | `backend/src/services/spotifyDirect.ts` | Spawn spotstream CLI, PCM→FFmpeg→WebM pipe |
| Modify | `backend/src/routes/player.ts` | Conditional `spotify:` handling in resolve + stream |
| Modify | `frontend/src/utils/api.ts` | Spotify IPC wrappers |
| Modify | `frontend/src/components/settings/SettingsView.tsx` | Spotify Playback dropdown + pairing UI |
| Modify | `frontend/src/components/player/PlayerBar.tsx` | Spotify Direct badge |
| Modify | `backend/src/services/spotify.ts` | Mercury fallback for personalized playlists |

---

## Risks & Tradeoffs

### 1. Dual-path audio: spotstream CLI subprocess vs native Rust
- **Current plan**: Node.js backend spawns `spotstream.exe` as a subprocess for audio streaming. This is the pragmatic choice because the audio stream proxy lives in the Node.js backend (Fastify), not in the Tauri Rust process.
- **Future (Noctune Nightly / full Rust backend)**: When the backend is fully ported to Rust, `spotstream::stream_track()` will be called directly in-process — no subprocess, no FFmpeg, native PCM decoding piped through Rust's own HTTP streaming. This is the end goal per the ROADMAP.md Track 2 plan.

### 2. FFmpeg transcoding overhead
- spotstream outputs raw PCM (s16le 44100Hz stereo) — the frontend can't play raw PCM directly via `<audio>` element.
- FFmpeg transcodes to Opus/WebM container which the browser can seek and play natively.
- Overhead is minimal (~2-5% CPU for real-time Opus encoding), and this is the same approach used for the Discord bot.
- Alternative: In the full Rust future, use `symphonia` to encode directly to Opus in Rust, eliminating the FFmpeg dependency entirely.

### 3. Credential sharing between CLI and Tauri
- Both `spotstream.exe` (CLI) and the Tauri Rust module share the same credential cache at `%LOCALAPPDATA%/spotstream/cache/credentials.json`.
- If user pairs via CLI, Noctune picks it up automatically (and vice versa).
- Concurrent access is safe because librespot's credential format is read-once-at-connect, not continuously locked.

### 4. Session lifetime & Spotify rate limits
- A long-lived session means one persistent TCP connection to Spotify's Access Point.
- Spotify tolerates this (it's how the official desktop client works).
- The session auto-reconnects on network changes via librespot's internal retry logic.

### 5. Seek support for PCM→WebM pipe
- FFmpeg's WebM muxer writes a seekable container with a proper duration header when the input duration is known.
- Pre-fetch duration via `spotify_track_info` IPC before starting the stream, pass it to FFmpeg via `-t <duration>` flag.
- The frontend's `<audio>` element + backend's 206 range proxy handle seeking as with any other WebM stream.

### 6. No impact on non-Premium users
- Default behavior (`youtube-match`) works without any Spotify account.
- The Spotify Direct option in Settings clearly states "Requires Spotify Premium".
- If a user selects Spotify Direct without pairing, the pairing UI is shown inline — no silent failure.
- If spotstream binary is not installed, the option is either greyed out or shows an install prompt.

---

## Open Questions

1. **Should spotstream binary be bundled in Noctune's installer?**
   - Pro: Zero setup for end users who want Spotify Direct
   - Con: Adds ~11MB to installer, separate update cycle
   - **Recommendation**: Don't bundle for now. Spotify Direct is opt-in for power users. They can install spotstream via `cargo install spotstream` or download the binary from GitHub Releases. Bundling can come later as a `resources/` entry in `tauri.conf.json`.

2. **Should we add `spotstream search` to bypass YouTube search entirely for Spotify-backed queries?**
   - This would require adding a Mercury-based search endpoint to spotstream (not yet implemented).
   - The existing Spotify Web API search in `spotify.ts` already works well for catalog search.
   - **Recommendation**: Not in this phase. Add it later when the full Rust backend migration reaches the search service.

3. **Naming: "Spotify Playback" vs "Audio Source" vs "Playback Engine"?**
   - "Spotify Playback" is the clearest — it specifically describes what changes (where audio comes from when playing Spotify tracks).
   - "Audio Source" is too generic (could be confused with local files).
   - "Playback Engine" is too technical.
   - **Recommendation**: Use **"Spotify Playback"** as the Settings section label.
