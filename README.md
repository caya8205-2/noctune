<p align="center">
  <img src="assets/logo.svg" alt="Noctune ASCII Logo" width="450" />
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

Noctune uses Spotify for metadata and discovery, Last.fm for similar-track signals, then resolves playable audio through a local YouTube resolver. It keeps playback responsive with prefetching, learned mappings, audio URL caching, optional local audio file caching, queue-aware playback behavior, personalized Nightly Mixes, and desktop update checks through GitHub Releases.

[![Repository traffic](https://raw.githubusercontent.com/caya8205-2/noctune/github-repo-stats/caya8205-2/noctune/repository-traffic-card.svg)](https://caya8205-2.github.io/noctune/caya8205-2/noctune/latest-report/report.html)

## Repository Insights

| Traffic card | Traffic report | Stored snapshots | Refresh |
|---|---|---|---|
| [README SVG](https://raw.githubusercontent.com/caya8205-2/noctune/github-repo-stats/caya8205-2/noctune/repository-traffic-card.svg) | [Latest HTML report](https://caya8205-2.github.io/noctune/caya8205-2/noctune/latest-report/report.html) | [`github-repo-stats` branch](https://github.com/caya8205-2/noctune/tree/github-repo-stats) | Daily at `23:00 UTC` |

The card highlights repository views and clones from the public traffic snapshots, while the full report includes popular paths, referrers, stars, and forks.

## Highlights

- **Spotify metadata search** for clean titles, artists, duration, artwork, albums, and release discovery.
- **Direct YouTube search** for users who want raw YouTube-style results.
- **Nightly Mixes** generated from local listening history, top tracks, and optional Last.fm similar-track signals, cached for several hours so Home stays fast and API-friendly.
- **Smarter autoqueue** that can top itself up near the end of the queue and uses recommendation signals instead of stopping after a short fixed list.
- **Local YouTube resolver** powered primarily by `youtubei.js`, with `yt-dlp` kept as a fallback path.
- **Smart Spotify-to-YouTube matching** with scoring for official uploads, Topic/VEVO channels, duration accuracy, and penalties for reactions, live/tour versions, piano/drum/instrumental covers, karaoke, nightcore, sped-up/slowed edits, and unrelated videos.
- **Queue-aware playback** where Search starts an autoqueue, while Playlist playback keeps the full playlist order.
- **Background prefetch** for upcoming tracks and recommendations.
- **Local audio cache** that can stream while writing cache files, with size limits and cache controls.
- **Synced lyrics** through LRCLIB with auto-loading on track start, local lyrics cache, and Romaji mode for Japanese lyrics.
- **Adaptive circular visualizer** around the album disk, using colors derived from the current artwork.
- **Local playlists** with liked songs, drag reorder, rename, cover upload/crop, import from Spotify or YouTube playlist URLs, and playlist cache tools.
- **Album and artist views** reachable from track details, search results, playlist rows, mini player, and full player links.
- **History view** that records actual playback using the displayed track metadata.
- **Track details sidebar** for Spotify-rich metadata and local resolver details.
- **Diagnostics and debug tools** for resolver health, failed stream IDs, Spotify-to-YouTube match cache, candidate scoring, and per-track cache clearing with confirmation.
- **GitHub Releases update checks** on startup and periodically while the app is open, with a download action in Settings.
- **Desktop app** packaged with Tauri and a bundled local backend sidecar.

## How It Works

```text
Search
  -> Spotify metadata or direct YouTube results
  -> Play selected track
  -> Resolve playable YouTube audio
  -> Stream through local backend proxy
  -> Prefetch next queue candidates and recommendations
  -> Cache metadata, mappings, lyrics, and audio files locally
```

For Spotify-backed tracks, Noctune keeps the Spotify metadata visible in the UI while mapping the track to a playable YouTube stream behind the scenes.

For personalized recommendations, Noctune blends local playback history with Last.fm similar-track results when `LAST_FM_KEY` is configured. The generated Nightly Mix cards are cached on the client for several hours, so opening Home does not repeatedly call the recommendation API.

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
| Recommendations | Local playback history, Last.fm API |
| External metadata | Spotify Web API, GitHub Releases API |
| Runtime cache | SQLite, JSON files, and audio files in local data storage |

## Setup

Install dependencies:

```bash
npm i
```

Spotify credentials are optional but recommended for metadata search, Spotify playlist import, album and artist discovery, and new releases. Add your Client ID and Client Secret from the app Settings screen.

Last.fm credentials are optional but recommended for better Nightly Mixes and autoqueue recommendations. Set `LAST_FM_KEY` in `.env` to enable Last.fm similar-track lookup. `LAST_FM_SECRET` is included in `.env.example` for completeness, but current recommendation lookup only needs the API key.

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

```text
noctune/
  backend/
    src/
      routes/          Fastify API routes
      services/        cache, Spotify, resolver, matcher, lyrics, playlists
      types/           backend domain types
    data/              development runtime data, ignored by git
  frontend/
    src/
      components/      app views and player UI
      hooks/           audio engine and keyboard shortcuts
      store/           Zustand player state
      utils/           typed API client
  src-tauri/           Tauri desktop shell
```

## Local Data

Noctune stores runtime data locally and ignores it from git:

- `config.json` - local settings and Spotify credentials
- `songs.json` - learned metadata, stream URLs, history, and cache state
- `spotify-youtube-map.json` - Spotify-to-YouTube match cache
- `noctune.db` - local playlists and liked songs
- `audio-cache/` - optional cached audio files
- lyrics cache - local LRCLIB lookup results
- Nightly Mix cache - frontend cache for generated personalized mixes

Settings includes controls for Spotify credentials, GitHub release update checks, cache export/import, audio cache limit, audio cache clearing, failed resolver IDs, and Spotify match cache clearing. Search, Playlist, History, and Queue also expose per-track cache clearing for fixing one problematic track without wiping good cache data.


## Changelog

See [CHANGELOG.md](./CHANGELOG.md) or [Releases](https://github.com/caya8205-2/noctune/releases)

## License

[MIT](./LICENSE)
