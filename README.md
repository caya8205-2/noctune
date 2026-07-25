<p align="center">
  <img src="assets/ascii.svg" alt="Noctune ASCII Logo" width="450" />
</p>

<p align="center">A lightweight desktop music player perfect for playing youtube background noise without the memory-eating browser or spotify with no ads</p> 

<div align="center">

[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=111111)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Node.js](https://img.shields.io/badge/Node.js-24-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Fastify](https://img.shields.io/badge/Fastify-4-000000?logo=fastify&logoColor=white)](https://fastify.dev/)
[![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-Tauri_shell-000000?logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![SQLite](https://img.shields.io/badge/SQLite-Local-003B57?logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![YouTube.js](https://img.shields.io/badge/YouTube.js-Resolver-FF0000)](https://github.com/LuanRT/YouTube.js)
[![Spotify Web API](https://img.shields.io/badge/Spotify_Web_API-Metadata-1DB954?logo=spotify&logoColor=white)](https://developer.spotify.com/documentation/web-api)
[![Last.fm API](https://img.shields.io/badge/Last.fm_API-Personalized_mixes-D51007?logo=lastdotfm&logoColor=white)](https://www.last.fm/api)
[![LRCLIB](https://img.shields.io/badge/LRCLIB-Lyrics-9B5CFF)](https://lrclib.net/)
[![Kuroshiro](https://img.shields.io/badge/Kuroshiro-Romaji_lyrics-F7B733)](https://github.com/hexenq/kuroshiro)
[![MIT](https://img.shields.io/badge/License-MIT-white)](./LICENSE)
[![Traffic Report](https://img.shields.io/badge/Traffic_Report-Latest-2F80ED?logo=github&logoColor=white)](https://caya8205-2.github.io/noctune/caya8205-2/noctune/latest-report/report.html)
[![Stats Data](https://img.shields.io/badge/Stats_Data-github--repo--stats-111111?logo=github&logoColor=white)](https://github.com/caya8205-2/noctune/tree/github-repo-stats)

</div>

<div align="center">

[![Repository traffic](https://raw.githubusercontent.com/caya8205-2/noctune/github-repo-stats/caya8205-2/noctune/repository-traffic-card.svg)](https://caya8205-2.github.io/noctune/caya8205-2/noctune/latest-report/report.html)

</div>

<p align="center">Noctune uses Spotify for metadata and discovery, Last.fm & a local collaborative filtering ML model for personalized recommendations, then resolves playable audio through a local YouTube resolver. It keeps playback responsive with prefetching, learned mappings, audio URL caching, optional local audio file caching, queue-aware playback behavior, personalized Nightly Mixes, and desktop update checks through GitHub Releases.</p>

---

<p align="center">
  <strong>
    If you're too lazy to read all this (cuz i am, most of this readme is ai-generated),<br>
    just skip all this and go straight to <a href="#setup">Setup</a> or
    <a href="#faq-or-frequently-encountered-problems">FAQ</a>.
  </strong>
</p>


---

## Highlights

- **Spotify metadata search** for clean titles, artists, duration, artwork, albums, and release discovery.

- **Direct YouTube search** for users who want raw YouTube-style results.

- **Nightly Mixes** generated from local listening history, top tracks, Last.fm similar-track signals, and an on-the-go local ML recommendation model, cached for several hours so Home stays fast and API-friendly.

- **Smarter autoqueue** that can top itself up near the end of the queue and uses recommendation signals instead of stopping after a short fixed list.

- **Local YouTube resolver** powered primarily by `youtubei.js`, with `yt-dlp` kept as a fallback path.

- **Smart Spotify-to-YouTube matching** with scoring for official uploads, Topic/VEVO channels, duration accuracy, and penalties for reactions, live/tour versions, piano/drum/instrumental covers, karaoke, nightcore, sped-up/slowed edits, and unrelated videos.

- **Queue-aware playback** where Search starts an autoqueue, while Playlist playback keeps the full playlist order.

- **Background prefetch** for upcoming tracks and recommendations.

- **Local audio cache** that can stream while writing cache files, with size limits and cache controls.

- **Synced lyrics** through LRCLIB with auto-loading on track start, local lyrics cache, and Romaji mode for Japanese lyrics.

- **Adaptive circular visualizer** around the album disk, with 6 distinct preset modes and live preview settings.

- **Local playlists** with liked songs, drag reorder, rename, cover upload/crop, import from Spotify or YouTube playlist URLs, and playlist cache tools.

- **Album and artist views** reachable from track details, search results, playlist rows, mini player, and full player links.

- **History view** that records actual playback using the displayed track metadata.

- **Track details sidebar** for Spotify-rich metadata and local resolver details.

- **Diagnostics and debug tools** for resolver health, failed stream IDs, Spotify-to-YouTube match cache, candidate scoring, and per-track cache clearing with confirmation.

- **GitHub Releases update checks** on startup and periodically while the app is open, with a download action in Settings.

- **Desktop app** packaged with Tauri and a bundled local backend sidecar.

## How It Works

```bash
Search
  -> Spotify metadata or direct YouTube results
  -> Play selected track
  -> Resolve playable YouTube audio
  -> Stream through local backend proxy
  -> Prefetch next queue candidates and recommendations
  -> Cache metadata, mappings, lyrics, and audio files locally
```

For Spotify-backed tracks, Noctune keeps the Spotify metadata visible in the UI while mapping the track to a playable YouTube stream behind the scenes.

For personalized recommendations, Noctune offers selectable recommendation engines under Settings — blending local playback history with Last.fm similar-track results or an on-the-go local collaborative filtering ML model that continuously learns from your listening habits in the background. The generated Nightly Mix cards are cached on the client for several hours, so opening Home does not repeatedly call the recommendation API.

The desktop frontend talks to the local backend through a small port resolver. It prefers the normal backend port, but can follow a compatible backend sidecar when that port is already occupied.

## Matching Strategy

Noctune ranks YouTube candidates with lightweight heuristics:

- positive signals for official audio/video, lyric videos, Topic channels, VEVO, close title matches, and close duration
- negative signals for reaction/review videos, live/tour versions, movie/scene clips, fan uploads, covers, karaoke, instrumental uploads, piano covers, drum covers, sheet music, backing tracks, nightcore, sped-up/slowed edits, and unrelated content
- temporary failed-stream blacklist so broken candidates are skipped for future matching
- persistent Spotify-to-YouTube match cache for faster future playback
- optional Search debug panel showing candidate scores and reasons

## Tech Stack

| Layer | Tech |
|---|---|
| Desktop shell | Tauri 2, Rust, bundled sidecar backend |
| Frontend | React 18, Vite, Tailwind CSS |
| UI state | Zustand |
| Server state | TanStack Query |
| Icons | Lucide React |
| Audio visualizer | audiomotion-analyzer |
| Backend | Fastify, TypeScript, Node.js 24 |
| Primary resolver | youtubei.js |
| Fallback resolver | yt-dlp-wrap |
| Queue workers | p-queue |
| Local database | SQLite via better-sqlite3 |
| Lyrics | LRCLIB, Kuroshiro, Kuromoji |
| Recommendations | Local playback history, Last.fm API, Hybrid Local ML Model |
| External metadata | Spotify Web API, GitHub Releases API |
| Runtime cache | SQLite, JSON files, and audio files in local data storage |

## Setup

Install dependencies:

```bash
npm i
```

Spotify credentials are optional. Since v2.0.0, Noctune already includes a built-in Spotify API credential for metadata search, Spotify playlist import, album and artist discovery, and new releases. You can still add your own Client ID and Client Secret from the app Settings screen to override the built-in credential. Due to Spotify Web API restrictions, custom credentials must belong to a Spotify Premium account.

`yt-dlp` is optional for the fallback resolver. The main resolver path uses `youtubei.js`, so Noctune does not require users to install `yt-dlp` for the primary playback path.

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
  backend/
    src/
      routes/          # Fastify API routes
      services/        # cache, Spotify, resolver, matcher, lyrics, playlists
      types/           # backend domain types
    data/              # development runtime data, ignored by git
  frontend/
    src/
      components/      # app views and player UI
      hooks/           # audio engine and keyboard shortcuts
      store/           # Zustand player state
      utils/           # typed API client
  src-tauri/           # Tauri desktop shell
```

## Local Data

Noctune stores runtime data locally and ignores it from git:

- `config.json` - local settings and Spotify credentials
- `songs.json` - learned metadata, stream URLs, history, and cache state
- `spotify-youtube-map.json` - Spotify-to-YouTube match cache
- `noctune.db` - local playlists and liked songs
- `audio-cache/` - optional cached audio files
- `seed-model.json` - baseline dataset and pre-trained local ML recommendation model weights
- lyrics cache - local LRCLIB lookup results
- Nightly Mix cache - frontend cache for generated personalized mixes

Settings includes controls for Spotify credentials, GitHub release update checks, cache export/import, audio cache limit, audio cache clearing, failed resolver IDs, and Spotify match cache clearing. Search, Playlist, History, and Queue also expose per-track cache clearing for fixing one problematic track without wiping good cache data.

## ML Recommendation Model & Safe Dataset Importing

Noctune features an on-the-go **Hybrid Collaborative Filtering ML Model**. Unlike heavy Generative AI / LLMs that require massive VRAM, `.jsonl` training sets, and `.safetensors` model weights, Noctune uses an efficient Graph Markov Chain recommendation architecture:

- **Base Model (`seed-model.json`)**: Shipped directly with the application as lightweight baseline dataset weights (pre-computed transition matrix and track metadata).
- **Current Baseline Disclaimer & Default Engine**: The initial base model is currently trained on a small starter seed dataset of **888 unique tracks**. To ensure a smooth, rich recommendation experience for new users out-of-the-box, **Last.fm remains the default recommendation engine**. However, the local ML model continuously improves in the background as you listen to music, and upgraded pre-trained seed models trained on expanding datasets will be shipped with every future app update.
- **Community Telemetry Contribution (Help Improve ML Model)**: Users can optionally contribute anonymized listening dataset transitions to help train future baseline seed models by clicking **"Help Improve ML Model"** in **Debug Dashboard ➔ Tools**. Submissions are aggregated securely via Cloudflare Workers and can be viewed on the live [Noctune Dataset Collector Dashboard](https://noctune-dataset-collector.caya8205.workers.dev).
- **Automatic Real-time Training**: As you listen to music, Noctune automatically updates its in-memory transition matrix and appends to your local `play-log.json` in real-time. No manual retraining commands needed for daily use.
- **Safe Dataset Importing (Conflict-free)**: Power users with existing listening data can use **Debug Dashboard ➔ Tools ➔ "Import Prod Dataset"**. This instantly overlays listening history using additive matrix layering (`weight_base + weight_user`). It is **100% safe, conflict-free, and instant**, without risk of overwriting or breaking your local music preferences.
- **Shipping Updated Seed Models (Developers Only)**: Developers preparing a new release installer can run `npm run train-model` in `backend/` to bake latest listening datasets into `src/data/seed-model.json` so new installs start with rich out-of-the-box recommendations.

## Debug Dashboard

Noctune includes a dedicated **Debug Dashboard** accessible from Settings. It provides comprehensive power-user diagnostics:

- **Resolver Matcher Inspector**: View real-time YouTube candidate search results, confidence scores, and rule match evidence for any Spotify track.
- **Learned Match Cache**: Browse and search all cached Spotify-to-YouTube video ID mappings, with 1-click single-entry deletion.
- **Lyrics Cache Inspector**: View all cached plain and synced lyrics entries, line counts, and provider details with instant cache clearing.
- **Playback Blacklist & Audio Cache Manager**: View and manage temporary failed video IDs and on-disk audio cache files with size statistics.
- **ML Recommendation Sandbox**: View live ML model stats, import production datasets, and run live recommendation predictions.
- **HTTP Request Log**: Track real-time backend API requests, response status codes, and execution latency.

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

* For **Spotify**, even though the app use your own account API, its still doesn't allow personalization playlist like Daily Mix, Genre Mix or Artist Mix. It needs OAuth implementation on the app or some reverse engineering workaround and i'm not going to do both.  
Just open the said Mix playlist and click on the plus button to save it to a library, then import the said library.

#### Why does first track take a few second to start?
* The first track needs to be resolved from Spotify metadata to a playable
YouTube stream. After that, the next few tracks are prefetched and cached,
so playback is usually instant.

#### Why doesn't every track play instantly?
* Noctune is not a streaming service, it resolves tracks on demand and then keeps learning from your listening
history. Popular tracks become faster over time thanks to the learned
match cache and audio cache.

#### Why did it play a different version of my song?
* Some songs have dozens of uploads on YouTube. Noctune uses a scoring engine to pick the closest match based on title,
artist, duration, release hints, blacklist history and many other rules. If the selected version is incorrect, open the Debug Dashboard and
resolve the track again or clear only that track's cache.

#### Can I manually fix a wrong match?
* Yes, but not really (for now). If you got wrong match then open debug dashboard from the settings, go to Match Cache tab, clear the wrong cache, then play the track again. Clearing the wrong cache doesn't automatically blacklist it, but its gonna be in the future update.

#### Why are some songs missing lyrics?
* Lyrics are provided by LRCLib, not every song has synchronized lyrics available yet.

#### Why don't some Japanese songs have Romaji?
* Romaji conversion depends on successful Japanese text analysis.
Some community-provided lyrics may not contain enough information
to generate accurate Romaji.

#### Will updating delete my library?
* No. Your database, playlists, cache and settings are stored separately
from the application. And most of the update is backward compatible (e.g. if there's a matcher update, it will only affect the newer match, the old track that's already cached will not be affected unless you clear the cache)

#### Is spotify API necessary?
* Not anymore. Since v2.0.0, Noctune already includes its own Spotify API credentials. You can still enter your own credentials in Settings if you want to override the built-in one, but they must belong to a Spotify Premium account due to Spotify Web API restrictions.

#### I wanna see the database and all the config file, where does it stored?
* the binary is in `C:\<username>\AppData\Local\Noctune`

* while the data is in `C:\<username>\AppData\Roaming\dev.noctune.desktop`

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) or [Releases](https://github.com/caya8205-2/noctune/releases)

## License

[MIT](./LICENSE)
