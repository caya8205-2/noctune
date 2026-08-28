# Architecture & Migration Plan: Porting Noctune Backend to Full Rust

> **Goal:** Eliminate the Node.js / Express sidecar binary completely by migrating all backend capabilities into pure Rust directly integrated into Noctune's Tauri runtime (or embedded lightweight HTTP server for LAN / Remote mode).

---

## 1. Rust Web / Service Framework Options Comparison

Saat mem-porting backend Noctune ke Rust, ada 2 arsitektur utama:
1. **Direct Tauri IPC (Zero-Network Overhead):** Semua route frontend memanggil `invoke()` Tauri ke modul Rust. Ini yang paling cepat & ringan karena tidak ada HTTP network stack sama sekali.
2. **Embedded HTTP Server (LAN / Web Remote Mode):** Jika Noctune butuh diakses via browser LAN atau Discord RPC stream proxy.

### Opsi Framework Rust:

| Framework | Kelebihan | Kekurangan | Rekomendasi untuk Noctune |
| :--- | :--- | :--- | :--- |
| **Axum** *(by Tokio team)* | • Arsitektur modular berbasis `tower` & `tokio` (ekosistem standar Rust).<br>• Type-safe routing & extractors sangat mirip TypeScript Fastify/Express.<br>• Integrasi seamless dengan Tokio async runtime bawaan Tauri. | Perlu sedikit boilerplate untuk error handling kustom. | ⭐ **Pilihan Utama (Best in Class)** jika butuh local HTTP server / streaming proxy. |
| **Actix-web** | • Performa raw throughput benchmark sangat tinggi.<br>• Ekosistem mature. | • Menggunakan actor model & runtime terpisah di beberapa bagian, integrasi ke Tauri state sedikit lebih kaku dibanding Axum. | Alternatif solid, tapi Axum lebih pas dengan Tokio/Tauri. |
| **Pure Tauri IPC Commands (No Server)** | • **0 RAM overhead** untuk HTTP server.<br>• Tidak ada port conflict / firewall pop-up di Windows.<br>• Direct memory serialization via Serde. | Hanya bisa diakses dari window Tauri (bukan web browser eksternal). | ⭐ **Core Architecture**: Gunakan Tauri commands untuk 95% fitur, dan Axum embedded hanya jika LAN mode aktif. |

---

## 2. Inventory & Pemetaan Service Backend (TS -> Rust)

Berikut pemetaan lengkap 15+ modul backend Node.js ke crate Rust:

| Modul Node.js | Fungsi Utama | Target Crate / Solusi Rust |
| :--- | :--- | :--- |
| **`youtubei.ts` / `audioResolver.ts`** | Stream resolving, deciphering, search, playlist | `innertube-rs` *(Sudah selesai!)* |
| **`cache.ts` / `audioFileCache.ts`** | SQLite store metadata, cache mapping & local audio files | `rusqlite` / `sqlx` (SQLite embedded) |
| **`spotify.ts`** | Spotify Web API client (metadata, albums, playlists) | `rspotify` atau `reqwest` + `serde` |
| **`lyrics.ts`** | LRCLIB client, synced lyrics parser & romaji converter | `reqwest` + `lindera` (Japanese morphological analysis / Kuromoji equivalent) |
| **`localFiles.ts`** | Scan folder musik lokal, baca tags ID3/FLAC/M4A | `lofty` / `id3` / `symphonia` (Sangat cepat di Rust) |
| **`discordRpc.ts`** | Rich Presence (Playing status, album art, duration) | `discord-rich-presence` / `discord-sdk` |
| **`lastfm.ts`** | Scrobbling, loved tracks, similar tracks API | `reqwest` + `serde` |
| **`mlRecommendation.ts`** | Collaborative filtering & matrix factorization recommendation | `ndarray` / `linfa` (Bisa load `seed-model.json` langsung via `serde_json`) |
| **`prefetch.ts`** | Queue background prefetching | `tokio::sync::mpsc` + `tokio::spawn` worker pool |
| **`updateChecker.ts`** | GitHub Releases update check & download | `reqwest` / Tauri Updater Plugin |

---

## 3. Step-by-Step Implementation Roadmap

### Phase 1: Storage & Database Migration (`rusqlite`)
- Buat modul Rust `src-tauri/src/db.rs` menggunakan `rusqlite`.
- Migrasi schema database SQLite (`tracks`, `history`, `playlists`, `match_cache`, `settings`).
- Expose Tauri command untuk CRUD Playlist, History, dan Cache Management.

### Phase 2: Metadata & External Services Migration
- **Spotify & Last.fm**: Porting `spotify.ts` dan `lastfm.ts` ke `src-tauri/src/services/spotify.rs` & `lastfm.rs` menggunakan `reqwest`.
- **Lyrics & Romanization**: Implementasikan client LRCLIB di Rust + phonetic transliteration.
- **Discord RPC**: Hubungkan Discord RPC client langsung dari Rust tanpa dependency node-gyp.

### Phase 3: Local Library Scanner (`lofty`)
- Gantikan `music-metadata` di Node.js dengan crate Rust `lofty` yang mampu membaca tag puluhan ribu file audio dalam hitungan detik.
- Porting folder watcher menggunakan `notify`.

### Phase 4: Embedded Streaming & Optional Axum Bridge
- Gunakan streaming audio langsung lewat protocol custom Tauri (`tauri::UriSchemeProtocolHandler`) atau mini Axum listener untuk streaming partial bytes audio range (`206 Partial Content`).

### Phase 5: Deprecate Node.js Sidecar
- Hapus folder `backend/`, hapus script packaging `pkg` di `package.json`.
- Ukuran installer Noctune akan turun drastis (hemat ~50-80 MB karena tidak membawa engine Node.js & node_modules).
- RAM usage idle turun drastis dari ~120MB menjadi < 30MB!
