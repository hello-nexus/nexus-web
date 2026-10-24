import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PanelBackgroundMedia } from './PanelBackgroundMedia';

vi.mock('../../api/panelBackgroundMedia', () => ({
  backgroundMediaFileUrl: (deviceId: string, id: string) => `/media/${deviceId}/${id}`,
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PanelBackgroundMedia', () => {
  it('releases the video decoder on unmount', () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
    const { container, unmount } = render(<PanelBackgroundMedia id="v" deviceId="d" type="animated" opacity={1} />);
    const el = container.querySelector('video') as HTMLVideoElement;
    expect(el.getAttribute('src')).toBe('/media/d/v');
    pause.mockClear();
    load.mockClear();
    unmount();
    expect(pause).toHaveBeenCalledTimes(1);
    expect(el.hasAttribute('src')).toBe(false);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does nothing extra for a still image', () => {
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    const { unmount } = render(<PanelBackgroundMedia id="i" deviceId="d" type="static" opacity={1} />);
    unmount();
    expect(load).not.toHaveBeenCalled();
  });
});
