import { describe, it, expect, vi, afterEach } from 'vitest';
import { classifyDeckFile, isDeckAnimatedTooLarge, probeVideoDecodes, DECK_ANIMATED_MAX_MB } from './deckMedia';

describe('classifyDeckFile', () => {
  it('treats png, jpeg and other stills as still', () => {
    expect(classifyDeckFile({ type: 'image/png', name: 'a.png' })).toBe('still');
    expect(classifyDeckFile({ type: 'image/jpeg', name: 'a.jpg' })).toBe('still');
    expect(classifyDeckFile({ type: 'image/webp', name: 'a.webp' })).toBe('still');
  });

  it('classifies gif and mp4/webm by type', () => {
    expect(classifyDeckFile({ type: 'image/gif', name: 'a.gif' })).toBe('gif');
    expect(classifyDeckFile({ type: 'video/mp4', name: 'a.mp4' })).toBe('video');
    expect(classifyDeckFile({ type: 'video/webm', name: 'a.webm' })).toBe('video');
  });

  it('falls back to the extension for an empty or generic type', () => {
    expect(classifyDeckFile({ type: '', name: 'A.GIF' })).toBe('gif');
    expect(classifyDeckFile({ type: 'application/octet-stream', name: 'clip.mp4' })).toBe('video');
    expect(classifyDeckFile({ type: 'application/octet-stream', name: 'clip.webm' })).toBe('video');
    expect(classifyDeckFile({ type: '', name: 'photo.png' })).toBe('still');
  });

  it('flags other video types and extensions as unsupported', () => {
    expect(classifyDeckFile({ type: 'video/quicktime', name: 'a.mov' })).toBe('unsupportedVideo');
    for (const ext of ['mov', 'mkv', 'avi']) {
      expect(classifyDeckFile({ type: '', name: `clip.${ext}` })).toBe('unsupportedVideo');
      expect(classifyDeckFile({ type: 'application/octet-stream', name: `clip.${ext}` })).toBe('unsupportedVideo');
    }
  });
});

describe('isDeckAnimatedTooLarge', () => {
  const cap = DECK_ANIMATED_MAX_MB * 1024 * 1024;
  it('allows exactly the cap and rejects one byte over', () => {
    expect(isDeckAnimatedTooLarge(cap)).toBe(false);
    expect(isDeckAnimatedTooLarge(cap + 1)).toBe(true);
  });
});

describe('probeVideoDecodes', () => {
  const { createObjectURL, revokeObjectURL } = URL;
  let video: HTMLVideoElement;

  function setup() {
    URL.createObjectURL = vi.fn(() => 'blob:probe');
    URL.revokeObjectURL = vi.fn();
    const real = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = real(tag);
      if (tag === 'video') {
        video = el as HTMLVideoElement;
        video.load = vi.fn();
      }
      return el;
    });
  }

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
  });

  function setWidth(w: number) {
    Object.defineProperty(video, 'videoWidth', { value: w, configurable: true });
  }

  it('resolves true when metadata loads with a video track and frees the object URL', async () => {
    setup();
    const p = probeVideoDecodes(new Blob(['x']));
    setWidth(640);
    video.dispatchEvent(new Event('loadedmetadata'));
    await expect(p).resolves.toBe(true);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:probe');
  });

  it('resolves true on loadeddata with a video track', async () => {
    setup();
    const p = probeVideoDecodes(new Blob(['x']));
    setWidth(640);
    video.dispatchEvent(new Event('loadeddata'));
    await expect(p).resolves.toBe(true);
  });

  it('resolves false when only audio decodes (videoWidth 0)', async () => {
    setup();
    const p = probeVideoDecodes(new Blob(['x']));
    setWidth(0);
    video.dispatchEvent(new Event('loadedmetadata'));
    await expect(p).resolves.toBe(false);
  });

  it('resolves false on a decode error', async () => {
    setup();
    const p = probeVideoDecodes(new Blob(['x']));
    video.dispatchEvent(new Event('error'));
    await expect(p).resolves.toBe(false);
  });

  it('passes when nothing loads before the timeout', async () => {
    vi.useFakeTimers();
    setup();
    const p = probeVideoDecodes(new Blob(['x']));
    vi.advanceTimersByTime(5001);
    await expect(p).resolves.toBe(true);
  });
});
