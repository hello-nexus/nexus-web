/** Modifier-key glyph for the current platform: ⌘ on Apple, Ctrl elsewhere. */
export function metaKeyLabel(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  return /Mac|iPhone|iPad/.test(ua) ? '⌘' : 'Ctrl';
}
