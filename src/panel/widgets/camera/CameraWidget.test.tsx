import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const isTunnelActive = vi.fn(() => false);
const postService = vi.fn(async () => null);
const fetchService = vi.fn(async () => null);
vi.mock('../../../api/service', () => ({
  isTunnelActive: () => isTunnelActive(),
  resolveAuthWs: async (path: string) => `ws://test${path}`,
  postService: (...a: unknown[]) => postService(...a as []),
  fetchService: (...a: unknown[]) => fetchService(...a as []),
}));

import { CameraWidget } from './CameraWidget';
import { resetCameraCaptureForTests } from './useCameraCapture';
import { PanelPreviewProvider } from '../common/PanelPreviewContext';
import type { PanelWidget } from '../../types';

const widget: PanelWidget = { id: 'w1', type: 'camera', size: '2x2', col: 0, row: 0 };

type BridgeWindow = Window & { nexusNative?: { openSettings?: () => void } };

describe('CameraWidget', () => {
  beforeEach(() => {
    resetCameraCaptureForTests();
    isTunnelActive.mockReturnValue(false);
    postService.mockClear();
    fetchService.mockClear();
    // Capture is wrapper-only; tests run as if inside the app.
    (window as BridgeWindow).nexusNative = { openSettings: () => {} };
  });

  afterEach(() => {
    delete (window as BridgeWindow).nexusNative;
  });

  it('offers the camera flip unless settings pin an explicit device', () => {
    const { rerender } = render(<CameraWidget widget={widget} />);
    expect(screen.getByLabelText('panel.widget.camera.flip')).toBeTruthy();

    rerender(<CameraWidget widget={{ ...widget, config: { deviceId: 'cam-2' } }} />);
    expect(screen.queryByLabelText('panel.widget.camera.flip')).toBeNull();
  });

  it('flip toggles and persists the facing preference without starting capture', () => {
    localStorage.removeItem('nexus.camera.facing');
    render(<CameraWidget widget={widget} />);
    const flip = screen.getByLabelText('panel.widget.camera.flip');

    fireEvent.click(flip);
    expect(localStorage.getItem('nexus.camera.facing')).toBe('environment');
    fireEvent.click(flip);
    expect(localStorage.getItem('nexus.camera.facing')).toBe('user');
    // Idle flips only store the preference - nothing is armed.
    expect(postService).not.toHaveBeenCalled();
  });

  it('shows the open-in-app state outside the wrapper', () => {
    delete (window as BridgeWindow).nexusNative;
    render(<CameraWidget widget={widget} />);
    expect(screen.getByText('panel.widget.camera.openInApp')).toBeTruthy();
    expect(screen.queryByText('panel.widget.camera.start')).toBeNull();
  });

  it('renders a static idle tile in preview mode with no I/O', () => {
    const { container } = render(
      <PanelPreviewProvider value={true}>
        <CameraWidget widget={widget} />
      </PanelPreviewProvider>,
    );

    expect(screen.getByText('panel.widget.camera.start')).toBeTruthy();
    expect(container.querySelector('video')).toBeNull();
    fireEvent.click(screen.getByText('panel.widget.camera.start'));
    expect(postService).not.toHaveBeenCalled();
    expect(fetchService).not.toHaveBeenCalled();
  });

  it('explains itself instead of offering start over the relay tunnel', () => {
    isTunnelActive.mockReturnValue(true);
    render(<CameraWidget widget={widget} />);

    expect(screen.getByText('panel.widget.camera.notLan')).toBeTruthy();
    expect(screen.queryByText('panel.widget.camera.start')).toBeNull();
  });

  it('surfaces the unsupported error when media capture is unavailable', () => {
    // jsdom exposes no navigator.mediaDevices, so an explicit start lands in
    // the unsupported error state without arming anything.
    render(<CameraWidget widget={widget} />);

    fireEvent.click(screen.getByText('panel.widget.camera.start'));

    expect(screen.getByText('panel.widget.camera.unsupported')).toBeTruthy();
    expect(screen.getByText('panel.widget.camera.start')).toBeTruthy();
    expect(postService).not.toHaveBeenCalled();
  });
});
