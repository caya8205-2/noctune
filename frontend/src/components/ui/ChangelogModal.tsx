import { useEffect, useState } from 'react';
import { Sparkles, X, Check, FileText } from 'lucide-react';
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
  { title: 'Playback Blacklist & Disk Cache Hardening', desc: 'Normalized Video ID prefixes so clearing cache or blacklisting a track physically deletes stale audio files from disk, and enforced HTTP 404 stream rejection for blacklisted IDs.' },
  { title: 'Matcher Keyword Penalty Bypass', desc: 'Expanded matcher inspection to check title, artist, and search query so terms like "sings", "cover", "karaoke", "concert", or date formats are no longer penalized when present in target tracks.' },
  { title: 'History Preservation & Deduplication', desc: 'Preserved track metadata when clearing track cache so tracks remain in History, and added automatic deduplication for repeated plays.' },
  { title: 'Direct YouTube Resolution', desc: 'Direct YouTube clicks now resolve to exact Video IDs without unnecessary fallback query searches.' },
  { title: 'Formatted Playback Blacklist', desc: 'Blacklist manager in Debug Tools now displays formatted track titles and artists (Artist — "Title" · VideoID).' },
];

export function ChangelogModal() {
  const [open, setOpen] = useState(false);
  const [changelogText, setChangelogText] = useState<string | null>(null);

  useEffect(() => {
    const lastSeen = localStorage.getItem(LAST_SEEN_VERSION_KEY);
    if (lastSeen !== APP_VERSION) {
      setOpen(true);
      fetchChangelog();
    }
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
    localStorage.setItem(LAST_SEEN_VERSION_KEY, APP_VERSION);
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
        <div className="flex items-center justify-end border-t border-white/10 bg-base-950/60 px-6 py-3.5">
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
