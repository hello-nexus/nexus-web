import type { PanelBackgroundMode } from './panelBackground';

interface QuickBackgroundCommits {
  commitBackgroundMode: (mode: PanelBackgroundMode) => void;
  commitBackgroundMedia: (mediaId: string | null, type: 'static' | 'animated' | null, alpha?: boolean) => void;
}

/** A background picked from the preview's menu applies at once: the media, and the media mode that shows it. */
export function applyQuickBackgroundMedia(
  commits: QuickBackgroundCommits,
  mediaId: string | null,
  type: 'static' | 'animated' | null,
  alpha: boolean,
): void {
  commits.commitBackgroundMode('media');
  commits.commitBackgroundMedia(mediaId, type, alpha);
}
