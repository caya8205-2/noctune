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

const V420_HIGHLIGHTS = [
  {
    title: 'User-Controlled Telemetry Privacy & Data Retraction',
    desc: 'You now have full control over your contributed listening data. When submitting telemetry to help train Noctune\'s recommendation model, a private delete token is securely saved on your device, allowing you to withdraw or delete your upload at any time.',
  },
  {
    title: 'In-App Telemetry Management & Instant Cloud Sync',
    desc: 'Easily manage your telemetry contribution directly inside Noctune under Debug Dashboard > Tools. Delete your upload with one click, copy your secret delete token, and enjoy instant synchronization whenever contributions are removed.',
  },
  {
    title: 'Modernized Dataset Collector & Secure Token Verification',
    desc: 'Upgraded the Cloudflare dataset collector backend with SHA-256 cryptographic token verification, enabling seamless self-service data deletion from both the desktop app and the web collector dashboard.',
  },
];

const DEFAULT_HIGHLIGHTS = V420_HIGHLIGHTS;

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
