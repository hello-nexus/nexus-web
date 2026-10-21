import { render } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { DeckImageMedia } from './DeckImageMedia';

describe('DeckImageMedia', () => {
  afterEach(() => vi.restoreAllMocks());

  it('calls play() on a video when it mounts', () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const { container } = render(<DeckImageMedia url="blob:v" isVideo />);
    expect(container.querySelector('video')).not.toBeNull();
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('renders an img for a non-video', () => {
    const { container } = render(<DeckImageMedia url="blob:i" isVideo={false} />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:i');
    expect(container.querySelector('video')).toBeNull();
  });
});
