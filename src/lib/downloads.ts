import type { DetectedOS } from './platform';

// Canonical per-OS installer URLs. server.js resolves each to the newest
// downloadable release's asset via the GitHub API (latest stable, or the
// newest prerelease while no stable has shipped) - GitHub's static
// `latest/download/<asset>` alias 404s until a stable release exists, so
// clients must not link it directly.
const DOWNLOAD_BASE = 'https://hellonexus.com/download';

export type DownloadableOS = Exclude<DetectedOS, 'unknown'>;

export const DOWNLOAD_URLS: Record<DownloadableOS, string> = {
  windows: `${DOWNLOAD_BASE}/windows`,
  macos: `${DOWNLOAD_BASE}/macos`,
  linux: `${DOWNLOAD_BASE}/linux`,
};

export const ALL_DOWNLOADABLE_OS: readonly DownloadableOS[] = ['windows', 'macos', 'linux'];

export interface DownloadManifest {
  version: string | null;
  assets: Record<DownloadableOS, { size: number | null }>;
}

// Version + per-OS installer byte size for the current release, served by the
// site server from its cached GitHub release poll - no client-side GitHub hit,
// and it always agrees with what the /download/<os> redirect delivers. Returns
// null on any failure so callers render the button without a caption.
export async function fetchDownloadManifest(signal?: AbortSignal): Promise<DownloadManifest | null> {
  try {
    const res = await fetch('/download/manifest', { signal });
    if (!res.ok) return null;
    return (await res.json()) as DownloadManifest;
  } catch {
    return null;
  }
}

// Installer size as a whole-number MB string, or null when the size is absent
// or non-positive (the caption is then omitted rather than showing "0 MB").
export function formatDownloadSizeMb(bytes: number | null | undefined): string | null {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return null;
  return String(Math.round(bytes / (1024 * 1024)));
}
