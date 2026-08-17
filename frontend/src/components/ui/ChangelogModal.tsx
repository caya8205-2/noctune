import { useEffect, useState } from 'react';
import { X, Check, FileText, Info } from 'lucide-react';
import { apiUrl } from '../../utils/api';

const APP_VERSION = __APP_VERSION__;
const LAST_SEEN_VERSION_KEY = 'noctune:last-seen-version';

export function parseLatestHighlights(fullText: string | null): Array<{ title: string; desc: string }> {
  if (!fullText) return [];
  const sections = fullText.split(/\n(?=##\s+v\d+)/g);
  const latestSection = sections.find((s) => s.trim().startsWith('## '));
  if (!latestSection) return [];

  const lines = latestSection.split('\n');
  const items: Array<{ title: string; desc: string }> = [];
  let currentGroup = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('### ')) {
      currentGroup = trimmed.replace(/^###\s+/, '').trim();
    } else if (trimmed.startsWith('- ')) {
      const content = trimmed.replace(/^-+\s+/, '');
      const match = content.match(/^\*\*([^*]+)\*\*:\s*(.*)$/);
      if (match) {
        items.push({ title: match[1], desc: match[2] });
      } else {
        items.push({ title: currentGroup || 'Update', desc: content });
      }
    }
  }

  return items;
}

const V400_HIGHLIGHTS = [
  {
    title: 'YouTube Audio Streaming & Playback Engine Overhaul',
    desc: 'Upgraded the core YouTube audio streaming resolver to Innertube 18.0.0 with dedicated ANDROID_VR client routing. Bypasses YouTube’s latest bot detection and signature cipher changes that caused playback to fail with 403 Forbidden errors across v3.4.0 and older versions.',
  },
  {
    title: 'Automated Fallback Stream Recovery',
    desc: 'Integrated official YouTube Android client extraction in bundled yt-dlp with automatic stream recovery in the backend, completely preventing unwanted track-skipping cascades if an upstream stream URL fails.',
  },
  {
    title: 'High-Quality WebM Opus Stream Prioritization',
    desc: 'Streaming formats now prioritize native WebM Opus (160kbps high-bitrate audio) across all playback resolvers. This eliminates player decipher blocks previously encountered with legacy MP4/M4A streams.',
  },
  {
    title: 'Debug Dashboard Resolver Engine & Audio Format Inspector',
    desc: 'Added live Resolver Engine indicators (Innertube, yt-dlp fallback, or Local storage) and audio format/bitrate information directly inside the Debug Dashboard Current Track panel.',
  },
  {
    title: 'Bundled Binary Detection & Dev Mode Reliability',
    desc: 'Improved bundled helper path detection across both development and installed desktop modes, ensuring automatic fallback execution is always ready whenever needed.',
  },
  {
    title: 'Cache Store v2 Auto-Migration',
    desc: 'Local cache store automatically upgrades to v2 on launch, purging legacy 403-prone audio links while safely preserving all your listening history, playlists, favorites, and track metadata.',
  },
];

const DEFAULT_HIGHLIGHTS = V400_HIGHLIGHTS;

const PRESENTATION_HIGHLIGHTS: Record<string, { title: string; desc: string } | null> = {
  'YouTube Audio Streaming & Playback Engine Overhaul': {
    title: 'YouTube Streaming Engine Overhaul',
    desc: 'Upgraded the core audio resolver to Innertube 18.0.0 with ANDROID_VR client routing, bypassing YouTube bot detection and 403 Forbidden errors.',
  },
  'Innertube `youtubei.js@18.0.0` Upgrade & `ANDROID_VR` Client Prioritization': {
    title: 'YouTube Streaming Engine Overhaul',
    desc: 'Upgraded the core audio resolver to Innertube 18.0.0 with ANDROID_VR client routing, bypassing YouTube bot detection and 403 Forbidden errors.',
  },
  'Dual-Mode JavaScript Evaluator Shim (`Platform.shim.eval`)': {
    title: 'Resilient Decipher Evaluator',
    desc: 'Integrated a dual-mode decipher engine supporting both string and syntax extractors for crash-free signature decoding.',
  },
  'Native WebM Opus Stream Prioritization': {
    title: 'WebM Opus Stream Prioritization',
    desc: 'Prioritizes high-quality WebM Opus audio (160kbps) across all resolvers, avoiding decipher blocks from legacy MP4 streams.',
  },
  'Automated `yt-dlp` Android Extractor & Stream Auto-Recovery': {
    title: 'Automated Stream Fallback Recovery',
    desc: 'Integrated official YouTube Android client extraction in bundled yt-dlp with automatic stream recovery to eliminate track skipping on 403 errors.',
  },
  'Automated Fallback Stream Recovery': {
    title: 'Automated Stream Fallback Recovery',
    desc: 'Integrated official YouTube Android client extraction in bundled yt-dlp with automatic stream recovery to eliminate track skipping on 403 errors.',
  },
  'Debug Dashboard Resolver Engine & Audio Format Inspector': {
    title: 'Debug Dashboard Resolver Inspector',
    desc: 'Added live Resolver Engine indicators and audio format/bitrate information directly inside the Debug Dashboard.',
  },
  'Bundled `yt-dlp` Path Discovery in Dev & Production': {
    title: 'Bundled Binary Discovery',
    desc: 'Enhanced bundled helper detection across development and production desktop builds for seamless fallback readiness.',
  },
  'Cache Store v2 Auto-Migration & Stale URL Purging': {
    title: 'Cache Store v2 Auto-Migration',
    desc: 'Upgrades the local cache store to v2, clearing legacy unplayable stream links while safely preserving your entire listening history and playlists.',
  },
  'Cache Store v2 Auto-Migration': {
    title: 'Cache Store v2 Auto-Migration',
    desc: 'Upgrades the local cache store to v2, clearing legacy unplayable stream links while safely preserving your entire listening history and playlists.',
  },
  'Native Rust Channel Scraper Engine': {
    title: 'Native Rust Channel Engine',
    desc: 'Replaced legacy yt-dlp sidecar binary dependency with a high-performance native Rust scraper, removing sidecar bundling overhead to shrink the application size and accelerate channel page loading by 5x (<400ms).',
  },
  'Comprehensive YouTube Channel View Refinement': {
    title: 'YouTube Channel View Polish',
    desc: 'Completely overhauled channel browsing with exact video upload lists, topic channel discography playlists, automatic VEVO link rerouting to official artist channels (such as DragonForce), original English system titles ("Favorites"), accurate creator avatars, and mouse back/forward (MB4/MB5) tab history.',
  },
  'Multi-Seed AutoQueue Engine Refinement': {
    title: 'Multi-Seed AutoQueue Engine',
    desc: 'AutoQueue recommendations now trigger seamlessly on playlist completion using multi-track seed analysis, Spotify genre matching, and dominant source routing (Spotify vs YouTube) for higher recommendation accuracy.',
  },
  'Nightly Mix & Smart Playlist Refinement': {
    title: 'Nightly Mix & Smart Playlist Drift',
    desc: 'Nightly mixes and Top Favorites smart playlists now evolve dynamically with recency decay, wider seed pool randomization, and artist/channel drift refresh so your recommendations stay fresh.',
  },
  'Audio Cache Status & Legend Badges Refinement': {
    title: 'Interactive Audio Cache Legend',
    desc: 'Added an interactive status legend in Full Player and Queue View with high-contrast colorblind-accessible badges (Gold, Emerald, Sky Blue, Red, Lime Green) and detailed prefetch/cache tooltips.',
  },
  'Supporting Polish & Bug Fixes': {
    title: 'Performance & Bug Fixes',
    desc: 'Fixed stream prefetch map lookups, Spotify-to-YouTube matcher cache evidence, desktop queue single-click play, and clean app reopen queue restoration.',
  },
  'Dedicated YouTube Channel Profiles': {
    title: 'Dedicated YouTube Channel',
    desc: 'YouTube tracks now have clickable channel names, just like Spotify tracks have clickable artist names. Open a dedicated channel view powered by bundled yt-dlp to browse uploads, artwork, and public playlists on Windows or Linux.',
  },
  'Dedicated YouTube Channel View & Multi-Platform Extraction': {
    title: 'Dedicated YouTube Channel',
    desc: 'YouTube tracks now have clickable channel names, just like Spotify tracks have clickable artist names. Open a dedicated channel view powered by bundled yt-dlp to browse uploads, artwork, and public playlists on Windows or Linux.',
  },
  'Cross-Platform yt-dlp Sidecar Bundling': {
    title: 'Bundled yt-dlp for Channel View',
    desc: 'Channel view currently uses bundled yt-dlp as a temporary compatibility approach because Innertube cannot expose channel uploads and playlists reliably enough. This keeps channel browsing available on Windows and Linux, but makes loading slower and increases the app size. Playback and search still use the faster Innertube resolver; we will keep looking for a lighter, faster long-term solution.',
  },
  'Dedicated yt-dlp Channel Extraction': null,
  'External YouTube Playlist Resolution': null,
  'Channel Videos & Playlists Tabs': null,
  'Interactive Artwork Lightbox & Cover Downloads': {
    title: 'Interactive Artwork Viewer',
    desc: 'View high-resolution artwork in a full-screen viewer that starts at a comfortable fitted size, then zoom and pan when you need a closer look.',
  },
  'Interactive Artwork Lightbox': {
    title: 'Interactive Artwork Viewer',
    desc: 'View high-resolution artwork in a full-screen viewer that starts at a comfortable fitted size, then zoom and pan when you need a closer look.',
  },
  'Direct Cover Downloads': {
    title: 'Direct Cover Downloads',
    desc: 'Added data URL (Base64) handling and 10-second fetch timeout to POST /player/download-artwork to save original high-quality cover images directly into Noctune\'s configured download folder with real-time status and destination path feedback (Saved to ...).',
  },
  'Playlist View Controls': {
    title: 'Playlist Browsing Polish',
    desc: 'Refined playlist browsing with Grid/List views, a filter toolbar that stays available while scrolling, and two-way sorting for title, artist, and duration.',
  },
  'Bidirectional Playlist Sorting': null,
  'Direct Audio Stream Download Engine': {
    title: 'Clearer Download Feedback',
    desc: 'Track download confirmations now clearly show where the saved file was placed.',
  },
  'Playlist Management & Drag-and-Drop Polish': {
    title: 'Playlist Editing',
    desc: 'Edit playlists with clearer Done and Cancel actions, and reorder tracks with responsive drag-and-drop feedback.',
  },
  'Playlist Drag-and-Drop Reordering Fix': {
    title: 'Playlist Track Reordering',
    desc: 'Fixed playlist edit reordering/DnD so it is now actually functional and tracks can now be dragged from the handle, move visibly while dragging, and save in the intended order.',
  },
  'UI Layout & Visualizer Polish': {
    title: 'Navigation & Player Polish',
    desc: 'Open creator names from track lists, enjoy cleaner page spacing, and see more consistent playback indicators.',
  },
  'Clickable Creator & Artist Names Everywhere': {
    title: 'Dedicated YouTube Channel',
    desc: 'YouTube tracks now have clickable channel names, just like Spotify tracks have clickable artist names. Open a dedicated channel view powered by bundled yt-dlp to browse uploads, artwork, and public playlists on Windows or Linux.',
  },
  'Channel Navigation Fallbacks': null,
  'Channel & Playlist Navigation History': null,
  'Channel Extraction Reliability': null,
  'Local Library Folder Navigation History': {
    title: 'Local Library Mouse Back',
    desc: 'Mouse back from an open local folder now returns to the folder list instead of leaving Local Library.',
  },
  'Immediate History Recording': {
    title: 'Recently Played on Home',
    desc: 'View Full History now opens the real History view, and Home Recently Played updates immediately when a track is clicked.',
  },
  'Recently Played History Routing': {
    title: 'Recently Played on Home',
    desc: 'View Full History now opens the real History view, and Home Recently Played updates immediately when a track is clicked.',
  },
  'In Rotation Recommendation Logic': {
    title: 'In Rotation Smart Playlist',
    desc: 'Renamed Smart Playlist Recently Played to In Rotation so it no longer conflicts with Home’s Recently Played section, and replaced the duplicate History contents with a distinct recommendation mix.',
  },
  'External Playlist Loading Feedback': null,
  'Dynamic Download Toast Positioning': null,
  'Custom Confirmation Modals': {
    title: 'Confirmation Dialogs',
    desc: 'Settings actions that need confirmation now use Noctune’s existing themed modal instead of an unavailable native dialog.',
  },
  'Visualizer Rhythm Refinement': {
    title: 'Visualizer Pulse Refinement',
    desc: 'Increased the existing bass-pulse intensity so the visualizer response is easier to see.',
  },
  'Version-Aware Changelog Modal Subtitle': {
    title: 'Version-Aware Changelog Modal',
    desc: 'Derived the release subtitle dynamically based on SemVer changes (Major, Minor Feature, Patch/Fix).',
  },
  'Changelog Settings Button Polish': {
    title: 'Settings Changelog Button',
    desc: 'Renamed the "What\'s New" button in Settings to "Changelog" with a clean document icon and standard button styling.',
  },
  'Local Library Header Gradient Consistency': {
    title: 'Local Library Header Glow',
    desc: 'Aligned Local Library header styling with other views so Noctune’s ambient gold top radial gradient shines through consistently.',
  },
  'Artwork Lightbox 50% Zoom Out & Draggable Support': {
    title: 'Artwork 50% Zoom & Pan',
    desc: 'Expanded cover artwork lightbox controls down to 50% (0.5x) and enabled dragging/panning on all zoomed levels.',
  },
  'Artwork Lightbox 50% Zoom Out Support': {
    title: 'Artwork 50% Zoom & Pan',
    desc: 'Expanded cover artwork lightbox controls down to 50% (0.5x) and enabled dragging/panning on all zoomed levels.',
  },
  'Native Rust YouTube Channel Resolver (Roadmap Track 2)': {
    title: 'Native Rust Channel Resolver',
    desc: 'Accelerated YouTube Channel loading by 5x–6x (~350ms) using a native Rust Tauri Command instead of yt-dlp.',
  },
  'Native Rust YouTube Playlist Resolver & Instant Playlist Loading': {
    title: 'Native Rust Playlist Resolver',
    desc: 'Accelerated YouTube Playlist loading to ~200ms using a native Rust Tauri Command instead of yt-dlp.',
  },
};

export function toPresentationHighlights(items: Array<{ title: string; desc: string }>) {
  const seen = new Set<string>();
  const highlights = items.reduce<Array<{ title: string; desc: string }>>((result, item) => {
    const mapped = Object.prototype.hasOwnProperty.call(PRESENTATION_HIGHLIGHTS, item.title)
      ? PRESENTATION_HIGHLIGHTS[item.title]
      : item;
    if (!mapped || seen.has(mapped.title)) return result;
    seen.add(mapped.title);
    result.push(mapped);
    return result;
  }, []);

  const artworkDownloadIndex = highlights.findIndex((item) => item.title === 'Direct Cover Downloads');
  const artworkIndex = artworkDownloadIndex >= 0
    ? artworkDownloadIndex
    : highlights.findIndex((item) => item.title === 'Interactive Artwork Viewer');
  const playlistIndex = highlights.findIndex((item) => item.title === 'Playlist Browsing Controls');
  if (artworkIndex >= 0 && playlistIndex > artworkIndex + 1) {
    const [playlistHighlight] = highlights.splice(playlistIndex, 1);
    highlights.splice(artworkIndex + 1, 0, playlistHighlight);
  }
  return highlights;
}

function parseSemVer(v: string) {
  const clean = v.replace(/^v/, '').trim();
  const parts = clean.split('.').map((p) => parseInt(p, 10) || 0);
  return { major: parts[0] ?? 0, minor: parts[1] ?? 0, patch: parts[2] ?? 0 };
}

function getReleaseSubtitle(version: string, previousVersion?: string | null): string {
  if (previousVersion && previousVersion !== version) {
    const prev = parseSemVer(previousVersion);
    const curr = parseSemVer(version);
    if (curr.major > prev.major) return 'Major Release Notes & Updates';
    if (curr.minor > prev.minor) return 'Minor Feature Release & Updates';
    if (curr.patch > prev.patch) return 'Patch & Fix Release Notes';
  }

  const { minor, patch } = parseSemVer(version);
  if (patch > 0) return 'Patch & Fix Release Notes';
  if (minor > 0) return 'Minor Feature Release & Updates';
  return 'Major Release Notes & Updates';
}

export function openChangelogModal() {
  window.dispatchEvent(new CustomEvent('noctune:open-changelog'));
}

export function ChangelogModal() {
  const [open, setOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(true);
  const [changelogText, setChangelogText] = useState<string | null>(null);
  const [previousVersion, setPreviousVersion] = useState<string | null>(null);

  useEffect(() => {
    const lastSeen = localStorage.getItem(LAST_SEEN_VERSION_KEY);
    if (lastSeen && lastSeen !== APP_VERSION) {
      setPreviousVersion(lastSeen);
    }
    if (lastSeen !== APP_VERSION) {
      setOpen(true);
      fetchChangelog();
    }

    function handleOpenEvent() {
      setOpen(true);
      fetchChangelog();
    }

    window.addEventListener('noctune:open-changelog', handleOpenEvent);
    return () => window.removeEventListener('noctune:open-changelog', handleOpenEvent);
  }, []);

  async function fetchChangelog() {
    try {
      const res = await fetch(await apiUrl('/changelog'));
      const data = await res.json();
      setChangelogText(data.content || null);
    } catch {
      // Fallback
    }
  }

  function handleDismiss() {
    if (dontShowAgain) {
      localStorage.setItem(LAST_SEEN_VERSION_KEY, APP_VERSION);
    } else {
      localStorage.removeItem(LAST_SEEN_VERSION_KEY);
    }
    setOpen(false);
  }

  if (!open) return null;

  const highlights = DEFAULT_HIGHLIGHTS;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/75 backdrop-blur-md transition-opacity"
        onClick={handleDismiss}
        aria-label="Close modal"
      />
      <div className="surface-panel relative z-10 max-h-[85vh] w-[92vw] max-w-xl animate-slide-up flex flex-col overflow-hidden rounded-2xl border border-amber-500/30 bg-base-900/95 shadow-2xl shadow-black/80">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 bg-base-950/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <FileText size={20} className="text-amber-400 flex-shrink-0" />
            <div>
              <h2 className="text-base font-bold text-white">What's New in Noctune v{APP_VERSION}!</h2>
              <p className="text-xs text-soft">{getReleaseSubtitle(APP_VERSION, previousVersion)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="btn-ghost p-1.5 text-muted hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs leading-relaxed text-soft">
          <div className="rounded-xl border border-white/10 bg-base-950/40 p-4 space-y-3">
            <h3 className="font-semibold text-white text-sm">
              Highlights of this release:
            </h3>
            <ul className="space-y-2 text-muted">
              {highlights.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-accent font-bold mt-0.5">•</span>
                  <span><strong className="text-white">{item.title}:</strong> {item.desc}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-200/90">
            <Info size={15} className="flex-shrink-0 text-amber-400" />
            <span>You can always review these release notes anytime from <strong>Settings &gt; Changelog</strong>.</span>
          </div>

          {changelogText && (
            <details className="group rounded-xl border border-white/10 bg-base-950/30 p-3">
              <summary className="cursor-pointer font-medium text-soft hover:text-white flex items-center justify-between">
                <span>View Full CHANGELOG.md</span>
                <span className="text-xs text-muted group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <pre className="mt-3 max-h-60 overflow-y-auto font-mono text-[11px] text-muted whitespace-pre-wrap rounded-lg bg-base-950/60 p-3">
                {changelogText}
              </pre>
            </details>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/10 bg-base-950/60 px-6 py-3.5">
          <label className="flex items-center gap-2 text-xs text-muted hover:text-white cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="rounded border-white/20 bg-base-800 text-accent focus:ring-accent accent-accent cursor-pointer"
            />
            <span>Don't show this again</span>
          </label>

          <button
            type="button"
            onClick={handleDismiss}
            className="btn-accent flex items-center gap-1.5 px-5 py-2 text-xs font-semibold rounded-xl"
          >
            <Check size={14} /> Got it!
          </button>
        </div>
      </div>
    </div>
  );
}
