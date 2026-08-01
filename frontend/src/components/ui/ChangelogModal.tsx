import { useEffect, useState } from 'react';
import { Sparkles, X, Check, FileText, Info } from 'lucide-react';
import { apiUrl } from '../../utils/api';

const APP_VERSION = __APP_VERSION__;
const LAST_SEEN_VERSION_KEY = 'noctune:last-seen-version';

function parseLatestHighlights(fullText: string | null): Array<{ title: string; desc: string }> {
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

const DEFAULT_HIGHLIGHTS = [
  { title: 'Navigation Shortcut Pills', desc: 'Added quick-access filter pills at the top of Home View (Liked Songs, Top Favorites, Discover Weekly, Recently Played, Short Tracks) for one-tap section navigation.' },
  { title: 'Continue Listening & New Releases GPU Autoscroll Carousels', desc: 'Built GPU hardware-accelerated horizontal autoscroll carousels (transform: translate3d(-Xpx, 0, 0)) for Continue Listening (persisted queue tracks) and New Releases, complete with 2.5s end-card pause, mouse wheel horizontal scroll, and hover pause.' },
  { title: 'Your Playlists Manual Horizontal Carousel', desc: 'Converted Your Playlists section into a manual horizontal scroll row with mouse wheel direction conversion, keeping all user playlists accessible without vertical page sprawl.' },
  { title: 'Collapsible Icon-Only Compact Sidebar', desc: 'Added a compact sidebar mode (w-16 width) toggled via top header toggle button (PanelLeftOpen/PanelLeftClose), featuring centered navigation items, hover tooltips, and playlist cover thumbnails.' },
  { title: '7-Day Persistent Discover Weekly Caching', desc: 'Configured Discover Weekly to persist cache for 7 days (discover_weekly.json) in backend and prevented redundant refetching every time its view is mounted.' },
  { title: 'Smart Playlist Branding & Renaming', desc: 'Renamed Smart Playlist labels for consistency (Most Played ➔ Top Favorites, Recently Added ➔ Recently Played) to distinguish them clearly from Nightly Mixes such as Deep Rotation.' },
  { title: 'Playlist & Nightly Mix Refresh Action', desc: 'Added an interactive Refresh Playlist / Refresh Mix button (<RefreshCw />) across all Smart Playlist views and Nightly Mixes to trigger real-time recommendation updates.' },
  { title: 'Custom Audio Download Location Setting', desc: 'Added a setting in Settings View allowing users to select and configure custom audio cache download storage paths on disk with native folder browser dialog support.' },
  { title: 'On-Demand Release Notes & Changelog Modal', desc: 'Added a What\'s New button in Settings View allowing users to open and review release notes anytime on demand, accompanied by a clean "Don\'t show this again" preference toggle.' },
  { title: 'Unified 3 Audio Bars Playing Indicator', desc: 'Standardized playing indicators across all track list views (Home Recently Played, Album View, Artist View, Playlist View, Queue View, Search View, History View) with 3 animated accent audio bars when playing and accent row numbers when paused.' },
  { title: 'Dynamic Mini Player & Track Details Visibility', desc: 'Automatically hide Mini Player (PlayerBar) and Sidebar Track Details (TrackDetailsSidebar) when no track is playing to maximize screen real estate.' },
];

export function openChangelogModal() {
  window.dispatchEvent(new CustomEvent('noctune:open-changelog'));
}

export function ChangelogModal() {
  const [open, setOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(true);
  const [changelogText, setChangelogText] = useState<string | null>(null);

  useEffect(() => {
    const lastSeen = localStorage.getItem(LAST_SEEN_VERSION_KEY);
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

  const dynamicHighlights = parseLatestHighlights(changelogText);
  const highlights = dynamicHighlights.length > 0 ? dynamicHighlights : DEFAULT_HIGHLIGHTS;

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
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-500/40 bg-amber-500/20 text-amber-400">
              <Sparkles size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">What's New in Noctune v{APP_VERSION}!</h2>
              <p className="text-xs text-soft">Major Release Notes & Updates</p>
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
            <h3 className="font-semibold text-white text-sm flex items-center gap-2">
              <FileText size={15} className="text-accent" /> Highlights of this release:
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
            <span>You can always review these release notes anytime from <strong>Settings &gt; What's New</strong>.</span>
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
