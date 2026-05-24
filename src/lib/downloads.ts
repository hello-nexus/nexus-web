import type { DetectedOS } from './platform';

const RELEASES_BASE = 'https://github.com/nexusqos/nexus-releases/releases/latest/download';

export type DownloadableOS = Exclude<DetectedOS, 'unknown'>;

export const DOWNLOAD_URLS: Record<DownloadableOS, string> = {
  windows: `${RELEASES_BASE}/Nexus-Setup.exe`,
  macos: `${RELEASES_BASE}/Nexus.dmg`,
  linux: `${RELEASES_BASE}/Nexus-x86_64.AppImage`,
};

export const ALL_DOWNLOADABLE_OS: readonly DownloadableOS[] = ['windows', 'macos', 'linux'];
