# Current Status & Release Tracker (v3.2.0)

Dokumen ini mencatat daftar fitur baru, bug fix, dan patch beserta pendekatan teknis yang diambil.

---

## 1. Features & UI Redesign

- [x] **Major Home View Redesign**
  - **Navigation Shortcut Pills**: Menambahkan tombol shortcut/pill di bagian atas Home View (`Liked Songs`, `Top Favorites`, `Discover Weekly`, `Recently Played`, `Short Tracks`) untuk navigasi dan filter sekali klik.
  - **Continue Listening & New Releases GPU Autoscroll Carousels**: Dibuat dengan animasi autoscroll horizontal berakselerasi GPU (`transform: translate3d(-Xpx, 0, 0)` & `will-change-transform`), penahanan 2.5 detik pada card terakhir, konversi scroll roda mouse vertikal-ke-horizontal, dan pause saat di-hover.
  - **Your Playlists Manual Horizontal Carousel**: Mengubah section playlist menjadi baris scroll horizontal manual (`ManualHorizontalCarousel`) dengan listener event `wheel` non-pasif.
  - **Recently Played Redesign**: Menyegarkan tampilan baris lagu Recently Played.
  - **Header Home View Rapi**: Menampilkan judul bersih "Home" dan subtitle tanpa duplikasi sapaan.

- [x] **Compact Sidebar Mode**
  - **Collapsible Icon-Only Sidebar**: Menambahkan state `sidebarCompact` (persisten di `localStorage`) dan tombol toggle (`PanelLeftOpen`/`PanelLeftClose`).
  - **In-List Create Playlist (`+`) Button**: Menempatkan tombol `+` langsung di dalam kontainer scrollable playlist (`overflow-y-auto flex flex-col gap-1`) agar sumbu tengah ikon ter-align presisi dengan semua item playlist.
  - **Standardisasi Shape Hover `rounded-xl`**: Mengubah semua hover shape tombol sidebar menjadi `rounded-xl` (rounded square).
  - **Pembersihan Header Compact**: Menghapus logo `/app-icon.png` dari header compact.

- [x] **Smart Playlists & Nightly Mix Refinements**
  - **Discover Weekly 7-Day Caching & Refetch Fix**: Menambahkan service `discoverWeekly.ts` dengan persistence file disk (`discover_weekly.json`) dan validasi TTL 7 hari (`ONE_WEEK_MS`), mencegah refetch berulang saat view dipasang (*mount*).
  - **Smart Playlist Branding & Renaming**: Mengubah label Smart Playlist (*Most Played* ➔ *Top Favorites*, *Recently Added* ➔ *Recently Played*) untuk membedakannya secara jelas dari Nightly Mix seperti *Deep Rotation*.
  - **Playlist & Nightly Mix Refresh Action**: Menambahkan tombol interaktif **Refresh Playlist / Refresh Mix** (`<RefreshCw />`) di seluruh Smart Playlist view dan Nightly Mixes.

- [x] **Custom Audio Download Location**
  - **Download Storage Path Selector**: Menambahkan opsi konfigurasi `downloadDir` di backend (`env.ts` & `settings.ts`) dan UI Settings View lengkap dengan endpoint `POST /settings/open-download-dir` untuk membuka folder di OS File Explorer.

- [x] **Now Playing & Dynamic Visibility**
  - **Unified 3 Audio Bars Playing Indicator**: Menggantikan nomor track dengan 3 animasi batang accent audio bars (`PlayingBars`) saat diputar di seluruh view (*Home Recently Played, Album View, Artist View, Playlist View, Queue View, Search View, History View*).
  - **Cover Card Playing Indicator Alignment**: Memposisikan 3 audio bars di sebelah kanan judul lagu pada `CleanCoverCard`, ter-center vertikal di antara baris title dan artist name dengan margin kanan `mr-1.5`.
  - **Clean Cover Artwork Outline**: Cover artwork lagu aktif menggunakan border aksen hijau (`border border-accent`), sementara judul lagu tetap berwarna putih (`text-white hover:text-accent`).
  - **Unified Active Track Row Background**: Mengubah background baris lagu aktif di `PlaylistView` dan `QueueView` menjadi warna aksen standar Noctune (`bg-accent/10`).
  - **Sembunyikan Mini Player & Track Details Saat Idle**: Mengondisikan komponen `PlayerBar` dan `TrackDetailsSidebar` pada `Boolean(currentTrack)` agar otomatis disembunyikan saat tidak ada lagu yang dimuat.
  - **Title Bar Logo Alignment**: Logo resmi Noctune (`/app-icon.png`) diposisikan di ujung kanan (`ml-auto`) title bar.
