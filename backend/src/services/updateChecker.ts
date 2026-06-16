const rootPkg = require('../../../package.json') as { version: string };

const UPDATE_REPO = process.env.NOCTUNE_UPDATE_REPO ?? 'caya8205-2/noctune';
const RELEASE_API_URL = `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`;
const RELEASES_URL = `https://github.com/${UPDATE_REPO}/releases/latest`;
const CACHE_TTL_MS = 1000 * 60 * 60 * 5;

interface GitHubRelease {
  tag_name?: string;
  name?: string | null;
  html_url?: string;
  published_at?: string | null;
  draft?: boolean;
  prerelease?: boolean;
}

export interface UpdateInfo {
  ok: boolean;
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseName: string | null;
  releaseUrl: string;
  publishedAt: string | null;
  checkedAt: number;
  error?: string;
}

let cachedUpdate: UpdateInfo | null = null;

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, '');
}

function compareVersions(a: string, b: string): number {
  const left = normalizeVersion(a).split(/[.-]/);
  const right = normalizeVersion(b).split(/[.-]/);
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index++) {
    const leftPart = left[index] ?? '0';
    const rightPart = right[index] ?? '0';
    const leftNumber = Number(leftPart);
    const rightNumber = Number(rightPart);

    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
      if (leftNumber !== rightNumber) return leftNumber > rightNumber ? 1 : -1;
      continue;
    }

    if (leftPart !== rightPart) return leftPart > rightPart ? 1 : -1;
  }

  return 0;
}

function unavailable(error: string): UpdateInfo {
  return {
    ok: false,
    currentVersion: rootPkg.version,
    latestVersion: null,
    updateAvailable: false,
    releaseName: null,
    releaseUrl: RELEASES_URL,
    publishedAt: null,
    checkedAt: Date.now(),
    error,
  };
}

export async function getLatestReleaseUpdate(force = false): Promise<UpdateInfo> {
  if (!force && cachedUpdate && Date.now() - cachedUpdate.checkedAt < CACHE_TTL_MS) {
    return cachedUpdate;
  }

  try {
    const response = await fetch(RELEASE_API_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `Noctune/${rootPkg.version}`,
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub releases request failed: ${response.status}`);
    }

    const release = (await response.json()) as GitHubRelease;
    const latestVersion = normalizeVersion(release.tag_name ?? '');
    if (!latestVersion) {
      throw new Error('Latest release has no tag name');
    }

    cachedUpdate = {
      ok: true,
      currentVersion: rootPkg.version,
      latestVersion,
      updateAvailable: compareVersions(latestVersion, rootPkg.version) > 0,
      releaseName: release.name ?? release.tag_name ?? latestVersion,
      releaseUrl: release.html_url ?? RELEASES_URL,
      publishedAt: release.published_at ?? null,
      checkedAt: Date.now(),
    };
    return cachedUpdate;
  } catch (err) {
    cachedUpdate = unavailable((err as Error).message);
    return cachedUpdate;
  }
}
