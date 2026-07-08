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
