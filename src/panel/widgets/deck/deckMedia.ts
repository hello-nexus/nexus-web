export const DECK_ANIMATED_MAX_MB = 8;
const DECODE_TIMEOUT_MS = 5000;

export type DeckPickKind = 'still' | 'gif' | 'video' | 'unsupportedVideo';

const EXT_KINDS: Record<string, DeckPickKind> = { gif: 'gif', mp4: 'video', webm: 'video' };
const OTHER_VIDEO_EXTS = ['mov', 'mkv', 'avi', 'm4v', 'wmv', 'flv', 'ogv', 'mpg', 'mpeg', '3gp'];
const VIDEO_TYPES = ['video/mp4', 'video/webm'];

/** Classifies a picked file: stills go through crop and resize, GIF/MP4/WebM upload untouched. */
export function classifyDeckFile(file: { type: string; name: string }): DeckPickKind {
  if (file.type === 'image/gif') return 'gif';
  if (VIDEO_TYPES.includes(file.type)) return 'video';
  if (file.type.startsWith('video/')) return 'unsupportedVideo';
  if (file.type.startsWith('image/')) return 'still';
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (EXT_KINDS[ext]) return EXT_KINDS[ext];
  if (OTHER_VIDEO_EXTS.includes(ext)) return 'unsupportedVideo';
  return 'still';
}

export function isDeckAnimatedTooLarge(size: number): boolean {
  return size > DECK_ANIMATED_MAX_MB * 1024 * 1024;
}

/** Resolves false only on a decode error or metadata with no video track (audio-only decode); a timeout passes because some WebViews never load data without play(). */
export function probeVideoDecodes(file: Blob): Promise<boolean> {
  return new Promise(resolve => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    const finish = (ok: boolean) => {
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      resolve(ok);
    };
    video.muted = true;
    video.preload = 'auto';
    const onLoaded = () => finish(video.videoWidth > 0);
    video.addEventListener('loadedmetadata', onLoaded, { once: true });
    video.addEventListener('loadeddata', onLoaded, { once: true });
    video.addEventListener('error', () => finish(false), { once: true });
    const timer = setTimeout(() => finish(true), DECODE_TIMEOUT_MS);
    video.src = url;
  });
}
