# Third-Party Notices

Noctune is licensed under `GPL-3.0-or-later` (see [LICENSE](./LICENSE)). It is
built on third-party components that keep their own licenses. This file lists
the ones that matter for redistributing Noctune binaries.

## Bundled in the installer

Binaries placed in `src-tauri/resources` are shipped inside the Windows and Linux
release artifacts.

| Component  | Version source        | License    | Notes |
|------------|-----------------------|------------|-------|
| `yt-dlp`   | `prepare-ytdlp.mjs`   | Unlicense  | Public domain. https://github.com/yt-dlp/yt-dlp |
| `innertube`| `prepare-innertube.mjs` | MIT      | Built from https://github.com/caya8205-2/innertube-rs |
| `spotstream`| `prepare-spotstream.mjs` | MIT    | Spotify Connect streaming helper crate |

## Bundled in the application bundle

| Component | License | Notes |
|-----------|---------|-------|
| Tauri | MIT OR Apache-2.0 | Desktop shell |
| librespot | MIT | Spotify Connect playback |
| better-sqlite3 | MIT | Local database |
| Fastify | MIT | Backend HTTP server |
| React, Vite, Tailwind CSS | MIT | Frontend |
| lucide-react | ISC | Icons |
| **audiomotion-analyzer** | **AGPL-3.0-or-later** | Audio visualizer. AGPL is compatible with GPLv3; the combined work must stay open source. https://github.com/hvianna/audioMotion-analyzer |

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
