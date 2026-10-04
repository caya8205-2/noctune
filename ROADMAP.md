## Noctune Architecture Roadmap

Following the v4.x releases, Noctune's architecture continues evolving across two distinct tracks:

```text
Noctune v4.5.0
  |-- Track 1: Noctune Mobile (Flutter + Dart)
  |     `-- Local-first playback & sync on iOS & Android
  |
  `-- Track 2: Noctune Nightly (Full-Rust Core Migration)
        `-- Phase out Fastify Node.js sidecar in favor of pure Tauri/Rust core
```

### Track 1: Noctune Mobile
A cross-platform mobile application utilizing Flutter to bring Noctune's clean UI and local-first streaming mechanics to mobile devices.

* **Framework:** Flutter (Dart)
* **Audio Engine:** `just_audio` or `audioplayers` with native background playback services.
* **Stream Resolving:** Porting the resolver pipeline using optimized mobile extractors or embedded native engines.
* **Local Storage:** SQLite via `drift` or key-value caching using `Hive`/`Isar`.
* **Sync Ecosystem:** Ability to export/import the local database (`noctune.db`) and match cache between Desktop and Mobile.

### Track 2: Noctune Nightly (Full-Rust Rewrite)
An ultra-performance, low-overhead desktop build that completely eliminates the Node.js/Fastify background sidecar process.

* **Progress Completed:**
  - Native YouTube audio resolving & deciphering via `innertube-rs` Rust crate (`src-tauri`).
  - Native YouTube channel, playlist, and community post scraping via Rust (`src-tauri/src/youtube_channel.rs`).
  - Native Spotify session, RFC 8628 pairing, and Mercury metadata resolution via `spotstream` & `librespot` in Tauri core (`src-tauri/src/spotify_service.rs`).
* **Upcoming Milestones:**
  - **In-Process Audio Streaming:** Calling `spotstream::player` directly in-process via Rust and encoding with `symphonia`, removing the external `ffmpeg` process.
  - **Database Migration:** Moving from `better-sqlite3` (Node.js) to native Rust asynchronous drivers (`sqlx` or `rusqlite`).
  - **Full Backend Retirement:** Migrating remaining Fastify endpoints (search orchestration, queue management, lyrics) to Tauri commands and Rust state, reducing memory footprint and removing Node runtime entirely.

---

