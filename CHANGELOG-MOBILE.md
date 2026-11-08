# Mobile Changelog

All notable changes to the Noctune Mobile application (Android) are documented here.

## v1.0.2 - 2026-11-09

Hotfix release for external link launching and update download actions on Android.

### System Integration & Updates
- **Fixed External URL Launching on Android**: Connected the native Android `ACTION_VIEW` intent bridge in `MainActivity`, fixing non-responsive "Download" buttons on update notifications and external links throughout the app.

## v1.0.1 - 2026-11-09

Maintenance, gesture polish, settings update checker, and Discord companion release for Noctune Mobile.

### Notification & System Integration
- **Fixed Inverted Media Notification Controls**: Corrected the previous/next vector drawable definitions so that the Previous button (|◀) and Next button (▶|) match standard orientations on Android media cards.

### Mobile UI & Gesture Navigation
- **Lightbox Pinch-to-Zoom & Double-Tap**: Added full multi-touch gesture support to the artwork lightbox viewer. Pinch with two fingers to smoothly zoom in/out, double-tap to zoom or reset, and pan without image jitter.
- **Smart Carousel & Drawer Swipe Protection**: Swiping right opens the navigation drawer smoothly from anywhere across the screen, while horizontal scroll and carousel ignore guards ensure browsing track carousels never triggers the sidebar unintentionally.
- **Clean Touch Scrolling**: Hidden synthetic desktop webkit scrollbars on mobile touchscreens in favor of native momentum touch scrolling, eliminating scroll freeze and stuck thumbs.

### Integrations & Settings
- **Update Checker in Mobile Settings**: Restored the prominent Updates section at the top of SettingsView for mobile devices, enabling one-tap update checks, release notes viewing, and direct APK download links.
- **Discord Rich Presence Companion Sync**: Mobile playback activity now automatically forwards to the desktop companion backend, seamlessly updating your Discord status on your PC while streaming from your phone.
- **Restored Discord RPC Toggle**: Re-enabled the Discord Rich Presence toggle in mobile Settings with local persistence.

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
