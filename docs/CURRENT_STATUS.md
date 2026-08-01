# Current Status & Release Tracker (v3.2.0)

This document tracks all new features, bug fixes, patches, and implementation approaches taken for Noctune.

---

## 1. Features & UI Redesign

- [x] **Major Home View Redesign**
  - **Navigation Shortcut Pills**: Added quick-access filter pills at the top of Home View (`Liked Songs`, `Top Favorites`, `Discover Weekly`, `Recently Played`, `Short Tracks`) for one-tap section navigation and filtering.
  - **Continue Listening & New Releases GPU Autoscroll Carousels**: Built GPU hardware-accelerated horizontal autoscroll carousels (`transform: translate3d(-Xpx, 0, 0)` & `will-change-transform`), featuring a 2.5-second hold on the final card, vertical-to-horizontal mouse wheel scroll conversion, and hover pause.
  - **Your Playlists Manual Horizontal Carousel**: Converted `Your Playlists` grid into a manual horizontal scroll row (`ManualHorizontalCarousel`) using non-passive `wheel` event listeners to prevent vertical page clutter.
  - **Recently Played Redesign**: Refreshed Recently Played section with clean track rows and layout.
  - **Clean Home Header**: Displayed a clean title ("Home") and subtitle without duplicating sidebar greetings.

- [x] **Compact Sidebar Mode**
  - **Collapsible Icon-Only Sidebar**: Implemented a compact sidebar mode (`sidebarCompact` state persisted in `localStorage`) toggled via top header icon button (`PanelLeftOpen`/`PanelLeftClose`).
  - **In-List Create Playlist (`+`) Button**: Embedded the `+` button directly inside the playlist scrollable list container (`overflow-y-auto flex flex-col gap-1`) for pixel-perfect vertical icon alignment.
  - **Standardized Rounded Square Buttons**: Unified hover shapes for all sidebar buttons to `rounded-xl` (rounded square).
  - **Clean Compact Header**: Removed Noctune `/app-icon.png` logo from compact sidebar header.
  - **Compact Icon Alignment**: Standardized button container width (`w-full`), padding (`py-2.5`), and hidden scrollbars (`scrollbar-hidden`) in compact mode to ensure all icons (including header toggle and `+` create playlist) align to the exact same vertical center axis.

- [x] **Smart Playlists & Nightly Mix Refinements**
  - **Discover Weekly 7-Day Caching & Refetch Fix**: Added `discoverWeekly.ts` backend service with local disk persistence (`discover_weekly.json`) and 7-day TTL (`ONE_WEEK_MS`), preventing redundant recommendation refetches on component mount.
  - **Smart Playlist Branding & Renaming**: Renamed Smart Playlist labels (*Most Played* ➔ *Top Favorites*, *Recently Added* ➔ *Recently Played*) to distinguish them clearly from Nightly Mixes such as *Deep Rotation*.
  - **Playlist & Nightly Mix Refresh Action**: Added an interactive **Refresh Playlist / Refresh Mix** button (`<RefreshCw />`) across all Smart Playlist views and Nightly Mixes to trigger real-time recommendation updates.

- [x] **Custom Audio Download Location**
  - **Download Storage Path Selector**: Added `downloadDir` configuration in backend (`env.ts` & `settings.ts`) and Settings View UI, complete with `POST /settings/open-download-dir` endpoint to launch OS File Explorer.

- [x] **Now Playing & Dynamic Visibility**
  - **Unified 3 Audio Bars Playing Indicator**: Replaced track numbers with 3 animated accent equalizer audio bars (`PlayingBars`) when playing across all track list views (*Home Recently Played, Album View, Artist View, Playlist View, Queue View, Search View, History View*).
  - **Cover Card Playing Indicator Alignment**: Positioned 3 audio bars on the right side of track titles in `CleanCoverCard`, vertically centered between title and artist name with clean right margin (`mr-1.5`).
  - **Clean Cover Artwork Outline**: Applied crisp accent border outline (`border border-accent`) around active cover artwork while keeping track title text white (`text-white hover:text-accent`).
  - **Unified Active Track Row Background**: Standardized active track row background in `PlaylistView` and `QueueView` to Noctune's global `bg-accent/10`.
  - **Dynamic Mini Player & Track Details Visibility**: Conditioned `PlayerBar` and `TrackDetailsSidebar` on `Boolean(currentTrack)`, automatically hiding both components when no track is loaded to reclaim screen real estate.
  - **Title Bar Logo Alignment**: Positioned official Noctune `/app-icon.png` logo on the far right (`ml-auto`) of the title bar with clean borderless styling.
  - **Changelog Modal & Fallback Sync**: Updated `DEFAULT_HIGHLIGHTS` in `ChangelogModal.tsx` and `FALLBACK_CHANGELOG` in backend `updates.ts` to deliver `v3.2.0` release notes in full sync with `CHANGELOG.md`.
  - **Manual Changelog Modal Trigger & Settings Button**: Exported `openChangelogModal()` helper listening to `noctune:open-changelog` window event, and added a **What's New** button in Settings View to allow viewing release notes anytime on demand.
  - **Changelog Modal Preferences & Notice**: Added a "Don't show this again" checkbox in the modal footer and an informational banner explaining that release notes can be revisited anytime via Settings > What's New.

## 2. Environment Variables & Scripts

- [x] **SignPath PowerShell Script (`scripts/noctune-signing.ps1`)**
  - **Technical Approach**: Added automatic loading of `.env` variables from root directory (`Join-Path $PSScriptRoot "..\.env"`), reading `SIGN_TOKEN`, `ORGANIZATION_ID`, `INPUT_PATH`, and `OUTPUT_PATH` (matching `.env.example`), validating environment variable presence before execution, and passing parameters to `Submit-SigningRequest`.
