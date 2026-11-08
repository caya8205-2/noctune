# Mobile Changelog

All notable changes to the Noctune Mobile application (Android) are documented here.

## v1.0.0 - 2026-11-09

Initial official release of Noctune Mobile (powered by Tauri v2 and native Android audio architecture).

### Native Audio Playback & Engine
- **Dedicated Media Service**: Background audio processing is isolated into a dedicated `:media` process (`MediaPlaybackService`) to survive WebView suspension, page navigation, and OS background throttling.
- **ExoPlayer Audio Handoff**: Audio seamlessly transfers between the frontend WebView and native ExoPlayer.
- **Spotify Direct Live Stream Muxing**: Direct stream chunks join live muxes at accurate resume offsets using a sample-rebasing extractor wrapper.
- **Cache & Seekable Streams**: High-performance RAM cache and stream seekability allow smooth scrubbing and track resumption.

### Notification & System Integration
- **Android MediaStyle Notification**: Interactive media notification with playback controls (Previous, Play/Pause, Next), live track duration, and dismiss capability.
- **MediaSessionCompat Support**: Publishes track title, artist, and album artwork with resolved absolute URLs to the system media router, lockscreen, and Bluetooth devices.
- **Graceful Lifecycle Management**: Swiping Noctune from Android Recents gracefully pauses playback and dismisses active foreground locks without process crashes.

### Mobile UI & Controls
- **Touch-Optimized Responsive Layout**: Mobile player bar, full-screen player view with swipe navigation, real-time audio spectrum visualizer, and touch-first queue management.
- **Companion Server & Tunnel Connectivity**: Quick pairing with Noctune Desktop over local network (port 3130) or Cloudflare secure tunnels.
- **Platform-Scoped Equalizer**: 5-band audio equalizer tuned for mobile listening.

### Visuals & App Identity
- **Adaptive Launcher Icons**: Brand logo baked at safe-zone proportions (`MARK = 0.45`) across squircle, circular, and legacy OEM launchers without distorted crop.
- **Optimized Media Header Icon**: Silhouetted `ic_stat_noctune` icon scaled to optical balance (`STAT_MARK = 0.72`) with standard padding, providing crisp contrast in both Light Mode and Material You theming.
- **Splash Screen**: Dedicated Android 12+ animated splash icon (`ic_splash_noctune`).
