import { useEffect, useState } from 'react';
import { Download, ExternalLink, Sparkles, Wrench, X } from 'lucide-react';
import { api, type UpdateInfo, IS_TAURI } from '../utils/api';

const CHECK_INTERVAL_MS = 1000 * 60 * 60 * 5;

export async function openExternalUrl(url: string) {
  if (!IS_TAURI) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }

  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('open_external_url', { url });
}

function parseSemVer(v: string) {
  const clean = v.replace(/^v/, '').trim();
  const parts = clean.split('.').map((p) => parseInt(p, 10) || 0);
  return { major: parts[0] ?? 0, minor: parts[1] ?? 0, patch: parts[2] ?? 0 };
}

export type UpdateUrgency = 'major' | 'minor' | 'patch';

export function getUpdateUrgency(currentVersion: string, latestVersion: string): UpdateUrgency {
  const curr = parseSemVer(currentVersion);
  const late = parseSemVer(latestVersion);
  if (late.major > curr.major) return 'major';
  if (late.minor > curr.minor) return 'minor';
  return 'patch';
}

export function useUpdateChecker() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const result = await api.checkForUpdates();
        if (cancelled) return;
        setUpdate(result);
        if (result.updateAvailable) setVisible(true);
      } catch (err) {
        console.warn('[updates] Check failed', err);
      }
    }

    check();
    const intervalId = window.setInterval(check, CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const urgency: UpdateUrgency =
    update?.currentVersion && update?.latestVersion
      ? getUpdateUrgency(update.currentVersion, update.latestVersion)
      : 'minor';

  const updateToast =
    visible && update?.updateAvailable ? (
      <div
        className={`fixed right-4 top-16 z-50 w-[calc(100vw-2rem)] max-w-sm rounded-xl p-4 shadow-2xl backdrop-blur-xl transition-all ${
          urgency === 'major'
            ? 'border border-amber-500/50 bg-base-900/95 shadow-amber-500/10 ring-1 ring-amber-500/30'
            : urgency === 'patch'
            ? 'border border-white/10 bg-base-900/80 text-muted shadow-black/20'
            : 'border border-accent/25 bg-base-900/95 shadow-black/40'
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border ${
              urgency === 'major'
                ? 'border-amber-500/40 bg-amber-500/20 text-amber-400 animate-pulse'
                : urgency === 'patch'
                ? 'border-white/10 bg-white/5 text-soft'
                : 'border-accent/30 bg-accent/15 text-accent'
            }`}
          >
            {urgency === 'major' ? (
              <Sparkles size={18} />
            ) : urgency === 'patch' ? (
              <Wrench size={16} />
            ) : (
              <Download size={17} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p
              className={`text-sm font-semibold ${
                urgency === 'major' ? 'text-amber-300' : urgency === 'patch' ? 'text-soft font-normal' : 'text-white'
              }`}
            >
              {urgency === 'major'
                ? 'Major Update Available!'
                : urgency === 'patch'
                ? 'Small Patch Available'
                : 'Update Available'}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {urgency === 'major'
                ? `Noctune ${update.latestVersion} is out with big new features & fixes! (Current: ${update.currentVersion})`
                : urgency === 'patch'
                ? `Noctune ${update.latestVersion} includes minor fixes. Update whenever you're ready.`
                : `Noctune ${update.latestVersion} is ready. You are on ${update.currentVersion}.`}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => openExternalUrl(update.releaseUrl).catch(console.error)}
                className={
                  urgency === 'major'
                    ? 'rounded-lg bg-amber-500 hover:bg-amber-400 text-base-950 font-bold px-3 py-1.5 text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/20 transition-all hover:scale-105 active:scale-95'
                    : urgency === 'patch'
                    ? 'btn-ghost border border-white/10 px-3 py-1.5 text-xs text-soft hover:text-white'
                    : 'btn-accent px-3 py-2 text-xs'
                }
              >
                <ExternalLink size={13} />
                {urgency === 'major' ? 'Upgrade Now' : 'Download'}
              </button>
              <button
                type="button"
                onClick={() => setVisible(false)}
                className="btn-ghost px-3 py-2 text-xs text-muted hover:text-white"
              >
                Later
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setVisible(false)}
            className="btn-ghost -mr-1 -mt-1 p-1.5 text-muted hover:text-white"
            title="Dismiss"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    ) : null;

  return { update, updateToast, urgency };
}
