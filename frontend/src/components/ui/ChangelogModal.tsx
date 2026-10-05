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

function renderInlineMarkdown(text: string) {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*.*?\*\*|``.*?``|`.*?`|\[.*?\]\(.*?\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={match.index} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('``') && token.endsWith('``')) {
      parts.push(
        <code key={match.index} className="rounded bg-white/10 px-1 py-0.5 font-mono text-[10px] text-accent">
          {token.slice(2, -2)}
        </code>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code key={match.index} className="rounded bg-white/10 px-1 py-0.5 font-mono text-[10px] text-accent">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('[') && token.includes('](')) {
      const label = token.slice(1, token.indexOf(']('));
      const url = token.slice(token.indexOf('](') + 2, -1);
      parts.push(
        <a key={match.index} href={url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
          {label}
        </a>
      );
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

function RenderedChangelog({ markdown }: { markdown: string }) {
  const lines = markdown.split('\n');
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('# ')) continue;

    if (line.startsWith('## ')) {
      const title = line.replace(/^##\s+/, '');
      elements.push(
        <div key={`h2-${i}`} className="mt-4 first:mt-0 flex items-center justify-between border-b border-white/10 pb-1.5 pt-2">
          <span className="font-semibold text-accent text-xs tracking-wide">{title}</span>
        </div>
      );
    } else if (line.startsWith('### ')) {
      const title = line.replace(/^###\s+/, '');
      elements.push(
        <h4 key={`h3-${i}`} className="mt-2.5 mb-1 text-[11px] font-semibold uppercase tracking-wider text-soft">
          {title}
        </h4>
      );
    } else if (line.startsWith('- ')) {
      const content = line.replace(/^-+\s+/, '');
      elements.push(
        <li key={`li-${i}`} className="flex items-start gap-2 text-xs leading-relaxed text-muted pl-1">
          <span className="text-accent font-bold select-none text-[8px] mt-1.5">•</span>
          <span className="flex-1">{renderInlineMarkdown(content)}</span>
        </li>
      );
    } else {
      elements.push(
        <p key={`p-${i}`} className="text-xs text-muted leading-relaxed">
          {renderInlineMarkdown(line)}
        </p>
      );
    }
  }

  return <ul className="space-y-1.5">{elements}</ul>;
}

const V451_HIGHLIGHTS = [
  {
    title: 'Resizable Track Details Sidebar',
    desc: 'You can now resize the right-hand Track Details sidebar by dragging its left border (with double-click to snap back to default 320px width). Your custom width is automatically saved across sessions.',
  },
  {
    title: 'Dynamic Settings Callouts & Clean Copy',
    desc: 'Settings descriptions are cleaner and feature responsive amber callout notices that update dynamically depending on whether your Spotify account is paired.',
  },
  {
    title: 'Debug Dashboard Spotify Direct Accuracy',
    desc: 'Fixed an issue where the Debug Dashboard reported stale YouTube match cache details (such as 128kbps MP4 and expired stream URLs) for Spotify tracks played under Spotify Direct. The inspector now accurately reflects live 320kbps WebM stream status and direct playback cache details.',
  },
];

const V450_HIGHLIGHTS = [
  {
    title: 'Direct Spotify Playback (320kbps)',
    desc: 'Stream Spotify tracks natively in original 320kbps Vorbis audio directly from Spotify servers without YouTube search or audio matching. Pair your Spotify Premium account seamlessly in Settings with instant device login. Features an ultra-responsive background engine delivering sub-second track transitions, instant in-memory replay cache, and bundled engine binaries included directly in the installer.',
  },
  {
    title: 'Personalized Playlists & Spotify Radio',
    desc: 'Import your personal and algorithmic Spotify playlists—including Discover Weekly, Daily Mixes, and personalized radio stations—that were previously inaccessible. Introduces a dedicated Spotify Radio recommendation mode in Settings to generate smart queues based on your active seed tracks.',
  },
  {
    title: 'Resizable Navigation Sidebar',
    desc: 'Easily customize the desktop layout by clicking and dragging the navigation sidebar border to any preferred width. Double-click the resize border to instantly snap back to the default width, with your custom size automatically saved across restarts.',
  },
  {
    title: 'Settings & Debug Interface Refinements',
    desc: 'Reorganized audio engines and playback settings into a cleaner layout with real-time connection status indicators, unsaved change badges, and streamlined engine identifiers in the debug dashboard.',
  },
  {
    title: 'Playback Timing & Progress Accuracy',
    desc: 'Fixed a timing issue where certain songs could unexpectedly cut off mid-track and advance to the next song in the queue. Resolved player bar progress duration discrepancies where live stream buffering temporarily shrank the total song length.',
  },
];

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
          <div className="rounded-xl border border-white/10 bg-base-950/40 p-4 space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <span className="rounded bg-accent/20 px-2 py-0.5 text-[11px] font-bold text-accent">v4.5.1</span>
                <span className="text-xs font-semibold text-white">Patch Updates</span>
              </div>
              <ul className="space-y-2 text-muted">
                {V451_HIGHLIGHTS.map((item, idx) => (
                  <li key={`v451-${idx}`} className="flex items-start gap-2">
                    <span className="text-accent font-bold mt-0.5">•</span>
                    <span>
                      <strong className="text-white">{renderInlineMarkdown(item.title)}:</strong>{' '}
                      {renderInlineMarkdown(item.desc)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="border-t border-white/10 pt-3.5">
              <div className="flex items-center gap-2 mb-2.5">
                <span className="rounded bg-white/10 px-2 py-0.5 text-[11px] font-bold text-soft">v4.5.0</span>
                <span className="text-xs font-semibold text-white">Major Release Highlights</span>
              </div>
              <ul className="space-y-2 text-muted">
                {V450_HIGHLIGHTS.map((item, idx) => (
                  <li key={`v450-${idx}`} className="flex items-start gap-2">
                    <span className="text-accent font-bold mt-0.5">•</span>
                    <span>
                      <strong className="text-white">{renderInlineMarkdown(item.title)}:</strong>{' '}
                      {renderInlineMarkdown(item.desc)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-200/90">
            <Info size={15} className="flex-shrink-0 text-amber-400" />
            <span>You can always review these release notes anytime from <strong>Settings &gt; Changelog</strong>.</span>
          </div>

          {changelogText && (
            <details className="group rounded-xl border border-white/10 bg-base-950/30 p-3">
              <summary className="cursor-pointer font-medium text-soft hover:text-white flex items-center justify-between select-none">
                <span>View Full CHANGELOG.md</span>
                <span className="text-xs text-muted group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <div className="mt-3 max-h-72 overflow-y-auto rounded-lg bg-base-950/60 p-3.5 border border-white/[0.06] text-left">
                <RenderedChangelog markdown={changelogText} />
              </div>
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
