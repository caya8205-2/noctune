## Roadmap (Towards v2.0.0)

With the stable release of **v1.3.0**, Noctune's architecture is expanding into two distinct, parallel development tracks to target different core environments.

```text
Noctune v1.3.0
  |-- Track 1: Noctune Mobile (Flutter + Dart)
  |     `-- Bring local-first playback & sync to iOS & Android
  |
  `-- Track 2: Noctune Nightly (Full-Rust Core)
        `-- Rewrite Fastify Node.js server into native Tauri/Rust
```

### Track 1: Noctune Mobile
A cross-platform mobile application utilizing Flutter to bring Noctune's clean UI and local-first streaming mechanics to pockets.

* **Framework:** Flutter (Dart)
* **Audio Engine:** `just_audio` or `audioplayers` with native background playback services.
* **Stream Resolving:** Porting the resolver pipeline using optimized mobile extractors (e.g., `youtubei.js` via a lightweight embedded engine or high-performance native Dart parsers).
* **Local Storage:** SQLite via `drift` or key-value caching using `Hive`/`Isar` to mirror desktop performance.
* **Sync Ecosystem:** Ability to export/import the local database (`noctune.db`) and match cache JSONs between Desktop and Mobile.

### Track 2: Noctune Nightly (Full-Rust Rewrite)
An ultra-performance, low-overhead desktop build that completely eliminates the Node.js/Fastify background process.

* **Architecture:** Migrate the backend layer into the Tauri core process, making Rust the single source of truth for the backend.
* **Native Resolving:** Replacing `youtubei.js` with pure Rust implementations (e.g., `rusty-ytdl` or native scrapers via `reqwest`).
* **Database Migration:** Moving from `better-sqlite3` to native Rust asynchronous drivers like `sqlx` or `rusqlite`.
* **State Management:** Inter-process communication (IPC) through Tauri commands directly calling Rust services, reducing memory footprints by up to 60%.

---
