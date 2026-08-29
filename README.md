<p align="center">
  <img src="assets/ascii.svg" alt="Noctune ASCII Logo" width="450" />
</p>

<p align="center">A lightweight desktop music player perfect for playing youtube background noise without the memory-eating browser or spotify with no ads</p> 

<div align="center">

[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=111111)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vite.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Node.js](https://img.shields.io/badge/Node.js-24-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Fastify](https://img.shields.io/badge/Fastify-4-000000?style=for-the-badge&logo=fastify&logoColor=white)](https://fastify.dev/)
[![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?style=for-the-badge&logo=tauri&logoColor=white)](https://tauri.app/)\
[![Rust](https://img.shields.io/badge/Rust-2021-730039?style=for-the-badge&logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![innertube-rs](https://img.shields.io/badge/innertube--rs-0.7.0-dea584?style=for-the-badge&logo=rust&logoColor=white)](https://github.com/caya8205-2/innertube-rs)
[![MIT](https://img.shields.io/badge/License-MIT-white?style=for-the-badge)](LICENSE)
[![GitHub All Releases](https://img.shields.io/github/downloads/caya8205-2/noctune/total?style=for-the-badge&logo=github)](https://github.com)

</div>

<div align="center">

[![Repository traffic](https://raw.githubusercontent.com/caya8205-2/noctune/github-repo-stats/caya8205-2/noctune/repository-traffic-card.svg)](https://caya8205-2.github.io/noctune/caya8205-2/noctune/latest-report/report.html)

</div>

<p align="center">
  <strong>
    If you're too lazy to read all this,<br>
    just skip straight to <a href="#setup">Setup</a> or
    <a href="#faq-or-frequently-encountered-problems">FAQ</a>.
  </strong>
</p>

## Highlights

- **Rich Discovery & Search**: Search tracks via Spotify metadata (clean titles, HQ covers, albums) or directly query YouTube.
- **Native YouTube Audio Engine**: Fast, deciphered stream resolving powered natively by [`innertube-rs`](https://github.com/caya8205-2/innertube-rs).
- **Instant Audio Pre-buffering**: 0ms gapless transition between queued songs via background pre-buffering pool.
- **Smart Recommendations & Autoqueue**: Continuous dynamic queueing powered by YouTube watch-next graphs, Last.fm similarity, or local Markov chain transitions.
- **Synced Lyrics & Romaji**: Real-time synchronized lyrics via LRCLIB with Japanese Romaji conversion.
- **Adaptive Circular Visualizer**: 6 audio reactive visualizer presets rendering directly around the album disk.
- **Local Playlists & Library**: Full playlist management, liked songs, cover upload/crop, drag-and-drop reordering, and native audio tag scanner (`.flac`, `.mp3`, `.m4a`, etc.).
- **Debug Dashboard**: Built-in inspector for cache management, stream logs, candidate matching scores, and model stats.

## How It Works

<pre>
[User Search / Click Track]
         │
1. Metadata & Query Parsing
   └── Spotify track selected (rich metadata, title, artist, duration, cover).
         │
2. Intelligent YouTube Matching Engine
   └── Queries YouTube via innertube-rs using "Title + Artist".
   └── Ranks candidate videos using weighted heuristic scoring:
       • Positive: Official audio/video, Topic channels, VEVO, duration match etc. Look <a href="backend/src/services/youtubeMatcher.ts#L37">here</a> for details.
       • Penalties: Covers, live/tour, reactions, karaoke, nightcore/sped-up edits etc.
         │
3. Stream Extraction & Playback
   └── Native QuickJS engine deciphers YouTube audio signatures.
   └── Audio stream plays immediately through the player engine.
         │
4. Background Queue & Instant Pre-buffering
   └── Next up to 5 upcoming tracks in queue are automatically resolved & prefetched.
   └── Audio chunks are pre-buffered in memory so track transitions happen in 0ms.
   └── Mappings, metadata, and lyrics are persisted in local SQLite cache.
</pre>

## Tech Stack

| Layer | Tech |
|---|---|
| Desktop Shell | Tauri 2, Rust |
| Frontend | React 18, Vite, Tailwind CSS |
| UI State | Zustand |
| Server State | TanStack Query |
| Icons | Lucide React |
| Audio Visualizer | audiomotion-analyzer |
| Resolver Engine | innertube-rs (Rust, QuickJS decipher) & ytdlp (fallback) |
| Local Audio Scanner | lofty (Rust) |
| Local Database | SQLite (better-sqlite3) |
| Lyrics | LRCLIB, Kuroshiro, Kuromoji |
| Metadata & APIs | Spotify Web API, Last.fm API, GitHub Releases |

## Setup

Install dependencies:

```bash
npm i
```

Spotify credentials are optional. Noctune includes built-in Spotify API credentials for search, metadata, and playlist imports. You can override them with your own credentials in Settings (requires Spotify Premium due to Web API limits).

## Running

```bash
# Backend + frontend in browser
npm run dev

# Frontend only
npm run dev:frontend

# Backend only
npm run dev:backend

# Build backend + frontend
npm run build
```

For the Tauri desktop app:

```bash
# Development shell
npm run tauri

# Production desktop build
npm run tauri:build
```

## Project Structure

```bash
noctune/
  backend/             # Express/Fastify API sidecar & legacy handlers
  frontend/            # React + Tailwind SPA
    src/components/    # Views (Home, Queue, Player, Search, Playlist, Settings)
    src/hooks/         # Audio engine, preloading pool, lyrics
    src/store/         # Zustand global state (player, theme)
    src/utils/         # Tauri IPC & HTTP API bridges
  src-tauri/           # Tauri native core & Rust services (innertube-rs, db, lofty)
```

## Debug Dashboard

Accessible from Settings, the **Debug Dashboard** provides tools for:
- **Resolver Matcher Inspector**: View candidate YouTube search results and scoring reasons.
- **Match Cache**: Search and delete cached Spotify-to-YouTube ID mappings.
- **Lyrics Cache Inspector**: Manage cached synchronized lyrics.
- **Audio Cache Manager**: Inspect and clear on-disk stream files.
- **Live HTTP & IPC Logs**: Monitor real-time status codes, resolution latency, and network health.

## FAQ (or frequently encountered problems)

- [Windows warning](#why-is-windows-gives-warning-when-installing-the-app-is-there-malwarevirus-in-it)
- [Playlist import](#why-does-playlist-import-sometimes-returns-no-tracks-found-even-though-the-playlist-is-public)
- [First track delay](#why-does-first-track-take-a-few-second-to-start)
- [Playback delay](#why-doesnt-every-track-play-instantly)
- [Wrong match](#why-did-it-play-a-different-version-of-my-song)
- [Fix wrong match](#can-i-manually-fix-a-wrong-match)
- [Lyrics](#why-are-some-songs-missing-lyrics)
- [Romaji](#why-dont-some-japanese-songs-have-romaji)
- [Updating](#will-updating-delete-my-library)
- [Spotify API](#is-spotify-api-necessary)
- [Database location](#i-wanna-see-the-database-and-all-the-config-file-where-does-it-stored)

---

#### Why is Windows gives warning when installing the app? is there malware/virus in it?
* No. Its because the app needs local access, for local import, for cache etc. but mainly its because the app doesn't have signing and certified publisher yet, i'm working on that. If you're still unsure, check [here](./assets/virustotal-scan.png) or scan with Kaspersky, Malwarebytes or similar antivirus.

#### Why does playlist import sometimes returns "no tracks found" even though the playlist is public?  
* For **YT**, make sure collaboration is turned on in the playlist settings, for some reason it works even if you set the privacy to Unlisted (not public but anyone with a link can access the playlist) rather than Public but with Collaboration turned off.  

* For **Spotify**, even though the app use the official web API, its still doesn't allow personalization playlist like Daily Mix, Genre Mix or Artist Mix. It needs OAuth implementation on the app or some reverse engineering workaround and i'm not going to do both.  
Just open the said Mix playlist and click on the plus button to save it to a library, then import the said library.

#### Why does first track take a few second to start?
* The first track needs to be resolved from Spotify metadata (or youtube search) to a playable youtube stream. After that, the next few tracks are prefetched and cached, so playback is usually instant.

#### Why doesn't every track play instantly?
* Noctune is not a streaming service, it resolves tracks on demand and then keeps learning from your listening history. Popular tracks become faster over time thanks to the learned match cache and audio cache.

#### Why did it play a different version of my song?
* Some songs have dozens of uploads on YouTube. Noctune uses a scoring engine to pick the closest match based on title, artist, duration, release hints, blacklist history and many other rules. If the selected version is incorrect, open the Debug Dashboard and resolve the track again or clear only that track's cache.

#### Can I manually fix a wrong match?
* Yes. Open **Settings ➔ Open Debug Dashboard ➔ Resolver**, scroll down and click **Run Match** (it auto-fill from the currently playing track). The dashboard will display all candidate videos found along with their match scores. You can manually pick the correct video and click **"Set as Active Match & Clear Old Cache"** to lock in the mapping, or click **"Blacklist"** on incorrect candidates so Noctune never picks them again.

* Alternatively, you can click the three-dots `...` menu on any track row and select **Clear cache** to wipe that single track's mapping and let the resolver re-match it.

#### Why are some songs missing lyrics?
* Lyrics are provided by LRCLib, not every song has synchronized lyrics available yet.

#### Why don't some Japanese songs have Romaji?
* Romaji conversion depends on successful Japanese text analysis. Some community-provided lyrics may not contain enough information to generate accurate Romaji.

#### Will updating delete my library?
* No. Your database, playlists, cache and settings are stored separately from the application. And most of the update is backward compatible (e.g. if there's a matcher update, it will only affect the newer match, the old track that's already cached will not be affected unless you clear the cache)

#### Is spotify API necessary?
* Not anymore. Since v2.0.0, Noctune already includes its own Spotify API credentials. You can still enter your own credentials in Settings if you want to override the built-in one, but they must belong to a Spotify Premium account due to Spotify Web API restrictions.

#### I wanna see the database and all the config file, where does it stored?
* the binary is in `%LOCALAPPDATA%\Noctune`
* while the data is in `%APPDATA%\dev.noctune.desktop`

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) or [Releases](https://github.com/caya8205-2/noctune/releases)

## License

[MIT](./LICENSE)
