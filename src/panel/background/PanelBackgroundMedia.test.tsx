import { fireEvent, render } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PanelBackgroundMedia } from './PanelBackgroundMedia';

vi.mock('../../api/panelBackgroundMedia', () => ({
  backgroundMediaFileUrl: (deviceId: string, id: string) => `/media/${deviceId}/${id}`,
}));

afterEach(() => {
  vi.useRealTimers();
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

  it('keeps its src under StrictMode, where the simulated unmount strips and restores it', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    const { container } = render(
      <StrictMode>
        <PanelBackgroundMedia id="v" deviceId="d" type="animated" opacity={1} />
      </StrictMode>,
    );
    expect(container.querySelector('video')?.getAttribute('src')).toBe('/media/d/v');
    expect(load).toHaveBeenCalled();
  });

  it('follows a changed url and releases the video when the layer turns into a still', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    const { container, rerender } = render(<PanelBackgroundMedia id="v1" deviceId="d" type="animated" opacity={1} />);
    const el = container.querySelector('video') as HTMLVideoElement;
    rerender(<PanelBackgroundMedia id="v2" deviceId="d" type="animated" opacity={1} />);
    expect(container.querySelector('video')).toBe(el);
    expect(el.getAttribute('src')).toBe('/media/d/v2');
    load.mockClear();
    rerender(<PanelBackgroundMedia id="i" deviceId="d" type="static" opacity={1} />);
    expect(container.querySelector('video')).toBeNull();
    expect(el.hasAttribute('src')).toBe(false);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('releases a still-then-video layer when it later unmounts', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    const { container, rerender, unmount } = render(<PanelBackgroundMedia id="i" deviceId="d" type="static" opacity={1} />);
    rerender(<PanelBackgroundMedia id="v" deviceId="d" type="animated" opacity={1} />);
    const el = container.querySelector('video') as HTMLVideoElement;
    load.mockClear();
    unmount();
    expect(el.hasAttribute('src')).toBe(false);
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('PanelBackgroundMedia error events', () => {
  function mount(readyState: number, error: unknown) {
    vi.useFakeTimers();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    const onFailed = vi.fn();
    const { container, unmount } = render(
      <PanelBackgroundMedia id="v" deviceId="d" type="animated" opacity={1} onFailed={onFailed} />,
    );
    const el = container.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(el, 'readyState', { value: readyState, configurable: true });
    Object.defineProperty(el, 'error', { value: error, configurable: true });
    return { el, onFailed, unmount };
  }

  it('fails at once on a real MediaError', () => {
    const { el, onFailed } = mount(0, { code: 4 });
    fireEvent.error(el);
    expect(onFailed).toHaveBeenCalledTimes(1);
  });

  it('keeps the clip when an error event carries no MediaError and the element has data', () => {
    const { el, onFailed } = mount(4, null);
    fireEvent.error(el);
    vi.advanceTimersByTime(10_000);
    expect(onFailed).not.toHaveBeenCalled();
  });

  it('gives up after the grace period when an error with no MediaError leaves the element empty', () => {
    const { el, onFailed } = mount(0, null);
    fireEvent.error(el);
    expect(onFailed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5_100);
    expect(onFailed).toHaveBeenCalledTimes(1);
  });

  it('cancels the pending give-up when the layer unmounts', () => {
    const { el, onFailed, unmount } = mount(0, null);
    fireEvent.error(el);
    unmount();
    vi.advanceTimersByTime(10_000);
    expect(onFailed).not.toHaveBeenCalled();
  });
});
