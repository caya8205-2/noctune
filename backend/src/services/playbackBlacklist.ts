const TTL_MS = 24 * 60 * 60 * 1000;
const failedIds = new Map<string, number>();

export function markPlaybackFailed(videoId: string): void {
  failedIds.set(videoId, Date.now());
}

export function isPlaybackBlacklisted(videoId: string): boolean {
  const failedAt = failedIds.get(videoId);
  if (!failedAt) return false;
  if (Date.now() - failedAt > TTL_MS) {
    failedIds.delete(videoId);
    return false;
  }
  return true;
}

export function getPlaybackBlacklist(): string[] {
  for (const [videoId] of failedIds) {
    isPlaybackBlacklisted(videoId);
  }
  return [...failedIds.keys()];
}

export function clearPlaybackBlacklist(): { cleared: number } {
  const cleared = failedIds.size;
  failedIds.clear();
  return { cleared };
}

export function clearPlaybackBlacklistForId(videoId: string): { cleared: number } {
  const cleared = failedIds.delete(videoId) ? 1 : 0;
  return { cleared };
}
