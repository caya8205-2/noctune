# Migration Plan: youtube.js to innertube-rs in Noctune

> **For Hermes:** Use subagent-driven-development or step-by-step TDD execution to implement this plan task-by-task.

**Goal:** Migrate Noctune's YouTube resolving, metadata extraction, search, and legacy recommendation engines from `youtubei.js` / Node.js scraping to the high-performance pure-Rust `innertube-rs` library.

**Architecture:**
1. Bridge `innertube-rs` into Noctune via Tauri IPC (`src-tauri`) commands and/or sidecar RPC endpoints.
2. Replace `youtubei.ts` / `youtube_channel.rs` with `innertube-rs` native client.
3. Update `audioResolver.ts` to query Tauri commands / Rust service for streaming audio URLs and track metadata.
4. Upgrade recommendation service to use `innertube-rs` `get_watch_next` endpoint for related tracks and radio seeding.

**Tech Stack:** Rust, Tauri v2, `innertube-rs` (local path / git), TypeScript, Node.js / Express backend.

---

### Task 1: Add `innertube-rs` Dependency to `src-tauri/Cargo.toml`

**Objective:** Link the local `innertube-rs` crate to Noctune's Tauri core.

**Files:**
- Modify: `C:\Users\Caya\Desktop\Project\music-player\src-tauri\Cargo.toml`

**Step 1: Update Cargo.toml dependencies**
Add `innertube-rs` via path or git:
```toml
[dependencies]
innertube-rs = { path = "../../innertube-rs" }
```

**Step 2: Verify compilation**
Run `cargo check` in `src-tauri` to ensure dependencies resolve cleanly without version conflicts.

---

### Task 2: Create Tauri Commands for InnerTube Core (Resolver & Metadata)

**Objective:** Expose `innertube-rs` metadata extraction, audio stream resolution, and search via Tauri invoke commands.

**Files:**
- Create: `C:\Users\Caya\Desktop\Project\music-player\src-tauri\src\innertube_service.rs`
- Modify: `C:\Users\Caya\Desktop\Project\music-player\src-tauri\src\lib.rs`

**Commands to implement:**
1. `resolve_audio_stream(video_id: String, quality: Option<String>) -> Result<AudioStreamResponse, String>`
2. `get_video_metadata(video_id: String) -> Result<TrackMetadataResponse, String>`
3. `search_youtube(query: String, filter: Option<String>, limit: Option<usize>) -> Result<Vec<TrackMetadataResponse>, String>`
4. `get_watch_next_tracks(video_id: String) -> Result<Vec<TrackMetadataResponse>, String>`

**Step 1: Implement state management for `Innertube` instance in Tauri.**
Store `Arc<Innertube>` in Tauri State (`app.manage(...)`).

**Step 2: Register invoke handlers in `src-tauri/src/lib.rs`.**

**Step 3: Test invoking commands with sample video ID (e.g. `dQw4w9WgXcQ`).**

---

### Task 3: Bridge Backend Audio Resolver to InnerTube Service

**Objective:** Refactor `backend/src/services/audioResolver.ts` and replace `youtubei.ts` dependency.

**Files:**
- Create / Modify: `C:\Users\Caya\Desktop\Project\music-player\backend\src\services\innertubeResolver.ts`
- Modify: `C:\Users\Caya\Desktop\Project\music-player\backend\src\services\audioResolver.ts`
- Modify: `C:\Users\Caya\Desktop\Project\music-player\backend\src\services\youtubeMatcher.ts`

**Steps:**
1. Direct backend audio queries to the Rust Tauri layer (or local HTTP/IPC bridge if running in sidecar mode).
2. Fallback to `yt-dlp` if deciphering encounters rate-limits or botguard exceptions.
3. Verify stream playback in player frontend.

---

### Task 4: Migrate Recommendation Engine to `watch_next` via `innertube-rs`

**Objective:** Upgrade `recommendations.ts` & `radio.ts` to leverage YouTube's native watch_next / related algorithms.

**Files:**
- Modify: `C:\Users\Caya\Desktop\Project\music-player\backend\src\services\recommendations.ts`
- Modify: `C:\Users\Caya\Desktop\Project\music-player\backend\src\routes\radio.ts`
- Modify: `C:\Users\Caya\Desktop\Project\music-player\backend\src\routes\queue.ts`

**Steps:**
1. Integrate `get_watch_next_tracks(seedVideoId)` into `getRecommendations()`.
2. Blend YouTube related tracks with local user listening history and ML weights.
3. Clean and filter incoming watch_next candidate items (filter out live streams, non-music videos, and reactions).

---

### Task 5: Clean Up Legacy `youtubei.js` & Verification

**Objective:** Remove unnecessary bundle overrides and verify end-to-end performance.

**Files:**
- Remove / Deprecate: `backend/src/services/youtubei.ts`
- Modify: `backend/package.json` (remove `youtubei.js` dependency if no longer required)
- Test: Run full Noctune dev suite (`npm run dev`) and test search, audio stream playback, radio mode, and queue generation.

---

### Verification & Quality Gates
- **Stream Playback:** Audio streams resolve in < 500ms and play without stutter.
- **Search:** Instant track queries return correct metadata & thumbnails.
- **Recommendations:** Radio queue seeds related tracks accurately via `watch_next`.
- **Resource Footprint:** Node.js sidecar memory usage decreases due to removing `youtubei.js` heavy AST evaluation in JS.
