import type { ChannelTarget } from '../../../api/update';

export type PreviewState = 'loading' | 'failed' | 'noRelease' | 'manual' | 'ready';

// What the preview shows for a target lookup. null is a lookup still in
// flight, undefined a lookup that got no usable answer.
export function previewState(target: ChannelTarget | null | undefined): PreviewState {
  if (target === null) return 'loading';
  if (target === undefined || target.error !== '') return 'failed';
  if (target.direction === 'none' || target.version === '') return 'noRelease';
  if (!target.canAutoInstall) return 'manual';
  return 'ready';
}

const DOWNLOAD_PAGE = 'https://hellonexus.com/download';

// Only http(s) links open: the URL comes from release metadata.
export function manualDownloadUrl(target: ChannelTarget): string {
  return /^https?:\/\//i.test(target.downloadUrl) ? target.downloadUrl : DOWNLOAD_PAGE;
}
