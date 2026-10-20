import { describe, it, expect } from 'vitest';
import { classifyDeckFile, isDeckAnimatedTooLarge, DECK_ANIMATED_MAX_MB } from './deckMedia';

describe('classifyDeckFile', () => {
  it('treats png, jpeg and other stills as still', () => {
    expect(classifyDeckFile({ type: 'image/png', name: 'a.png' })).toBe('still');
    expect(classifyDeckFile({ type: 'image/jpeg', name: 'a.jpg' })).toBe('still');
    expect(classifyDeckFile({ type: 'image/webp', name: 'a.webp' })).toBe('still');
  });

  it('treats gif, mp4 and webm as animated', () => {
    expect(classifyDeckFile({ type: 'image/gif', name: 'a.gif' })).toBe('animated');
    expect(classifyDeckFile({ type: 'video/mp4', name: 'a.mp4' })).toBe('animated');
    expect(classifyDeckFile({ type: 'video/webm', name: 'a.webm' })).toBe('animated');
  });

  it('falls back to the extension when the type is empty', () => {
    expect(classifyDeckFile({ type: '', name: 'A.GIF' })).toBe('animated');
    expect(classifyDeckFile({ type: '', name: 'photo.png' })).toBe('still');
  });

  it('flags other video types as unsupported', () => {
    expect(classifyDeckFile({ type: 'video/quicktime', name: 'a.mov' })).toBe('unsupportedVideo');
  });
});

describe('isDeckAnimatedTooLarge', () => {
  const cap = DECK_ANIMATED_MAX_MB * 1024 * 1024;
  it('allows exactly the cap and rejects one byte over', () => {
    expect(isDeckAnimatedTooLarge(cap)).toBe(false);
    expect(isDeckAnimatedTooLarge(cap + 1)).toBe(true);
  });
});
