interface QuickBackgroundCommits {
  commitBackgroundMedia: (mediaId: string | null, type: 'static' | 'animated' | null, alpha?: boolean) => void;
}

/** A background picked from the preview's menu applies at once; the commit also switches the panel to the media mode. */
export function applyQuickBackgroundMedia(
  commits: QuickBackgroundCommits,
  mediaId: string | null,
  type: 'static' | 'animated' | null,
  alpha: boolean,
): void {
  commits.commitBackgroundMedia(mediaId, type, alpha);
}
