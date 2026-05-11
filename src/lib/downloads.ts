import type { DetectedOS } from './platform';

const RELEASES_BASE = 'https://github.com/nexusqos/qos-releases/releases/latest/download';

export type DownloadableOS = Exclude<DetectedOS, 'unknown'>;

export const DOWNLOAD_URLS: Record<DownloadableOS, string> = {
  windows: `${RELEASES_BASE}/Qos-Setup.exe`,
  macos: `${RELEASES_BASE}/Qos.dmg`,
  linux: `${RELEASES_BASE}/Qos-x86_64.AppImage`,
};

export const ALL_DOWNLOADABLE_OS: readonly DownloadableOS[] = ['windows', 'macos', 'linux'];
