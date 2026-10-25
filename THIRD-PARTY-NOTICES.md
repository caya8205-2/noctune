# Third-Party Notices

Noctune is licensed under `GPL-3.0-or-later` (see [LICENSE](./LICENSE)). It is
built on third-party components that keep their own licenses. This file lists
the ones that matter for redistributing Noctune binaries.

## Bundled in the installer

Binaries placed in `src-tauri/resources` are shipped inside the Windows and Linux
release artifacts.

| Component  | Version | License    | Upstream |
|------------|---------|------------|----------|
| `yt-dlp`   | Windows build from [yt-dlp/yt-dlp releases](https://github.com/yt-dlp/yt-dlp/releases), fetched by `scripts/prepare-ytdlp.mjs` | Unlicense (public domain) | https://github.com/yt-dlp/yt-dlp |
| `innertube`| `innertube-rs` 0.8.0 | MIT | https://crates.io/crates/innertube-rs |
| `spotstream`| `spotstream` 0.1.0 | MIT | https://crates.io/crates/spotstream |

## Bundled in the application bundle

| Component | License | Upstream |
|-----------|---------|----------|
| Tauri | MIT OR Apache-2.0 | https://crates.io/crates/tauri |
| librespot | MIT | https://crates.io/crates/librespot |
| better-sqlite3 | MIT | https://github.com/WiseLibs/better-sqlite3 |
| Fastify | MIT | https://github.com/fastify/fastify |
| React, Vite, Tailwind CSS | MIT | https://react.dev / https://vite.dev / https://tailwindcss.com |
| lucide-react | ISC | https://github.com/lucide-icons/lucide |
| **audiomotion-analyzer** | **AGPL-3.0-or-later** | https://github.com/hvianna/audioMotion-analyzer — AGPL is compatible with GPLv3, but the combined work must stay open source |

All remaining npm dependencies are MIT, ISC, Apache-2.0, BSD, 0BSD, BlueOak, or
CC-BY-4.0 (attribution only). None of them are proprietary or GPL-incompatible.

## Not redistributed

- **FFmpeg** — Noctune spawns `ffmpeg` from the system `PATH` at runtime and does
  not bundle or link it. Users are responsible for their own FFmpeg build and its
  license. If a future release bundles FFmpeg, its LGPL/GPL terms and the
  corresponding-source offer must be added here.

## Service terms

The GPL covers Noctune's source code, not the services it talks to. Streaming
metadata and audio come from YouTube, Spotify, LRCLIB, and Last.fm; using them is
subject to their own terms of service.
