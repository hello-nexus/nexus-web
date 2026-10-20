export const DECK_ANIMATED_MAX_MB = 8;

export type DeckPickKind = 'still' | 'animated' | 'unsupportedVideo';

const ANIMATED_TYPES = ['image/gif', 'video/mp4', 'video/webm'];
const EXT_TYPES: Record<string, string> = { gif: 'image/gif', mp4: 'video/mp4', webm: 'video/webm' };

/** Classifies a picked file: stills go through crop and resize, GIF/MP4/WebM upload untouched. */
export function classifyDeckFile(file: { type: string; name: string }): DeckPickKind {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const type = file.type || EXT_TYPES[ext] || '';
  if (ANIMATED_TYPES.includes(type)) return 'animated';
  if (type.startsWith('video/')) return 'unsupportedVideo';
  return 'still';
}

export function isDeckAnimatedTooLarge(size: number): boolean {
  return size > DECK_ANIMATED_MAX_MB * 1024 * 1024;
}
