import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TryxDevicePage } from './TryxDevicePage';

/* eslint-disable @typescript-eslint/no-explicit-any */

// jsdom has no pointer-capture engine; no-op it so onPointerDown/move run.
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key,
  }),
}));

const mockGetTryxStatus = vi.fn();
const mockGetTryxPresets = vi.fn();
const mockGetTryxMedia = vi.fn();
const mockGetTryxCloudCatalog = vi.fn();
const mockSetTryxEnabled = vi.fn();
const mockSetTryxBrightness = vi.fn();
const mockSetTryxOverlay = vi.fn();

vi.mock('../../../api/tryx', () => ({
  getTryxStatus: (...args: any[]) => mockGetTryxStatus(...args),
  getTryxPresets: (...args: any[]) => mockGetTryxPresets(...args),
  getTryxMedia: (...args: any[]) => mockGetTryxMedia(...args),
  getTryxCloudCatalog: (...args: any[]) => mockGetTryxCloudCatalog(...args),
  installTryxCloudMaterial: vi.fn(),
  setTryxEnabled: (...args: any[]) => mockSetTryxEnabled(...args),
  setTryxBrightness: (...args: any[]) => mockSetTryxBrightness(...args),
  setTryxFan: vi.fn(),
  setTryxPreset: vi.fn(),
  selectTryxMedia: vi.fn(),
  deleteTryxMedia: vi.fn(),
  setTryxOverlay: (...args: any[]) => mockSetTryxOverlay(...args),
  uploadTryxMedia: vi.fn(),
  TRYX_MEDIA_WIDTH: 858,
  TRYX_MEDIA_HEIGHT: 428,
}));

const defaultStatus = {
  connected: true,
  state: {
    serial: 'abc',
    adbSerial: 'abc',
    portName: 'COM3',
    modelName: 'Panorama',
    productId: '1011',
    screenEnabled: true,
    brightness: 80,
    currentMedia: 'default_01.mp4.h264_2240x1080',
    currentMediaIsCustom: false,
    lastConnectedMs: 0,
    lastFrameMs: 0,
  },
  overlay: {
    items: [{ stat: 'CPU Temperature', x: 0.04, y: 0.12 }],
    font: 'roboto-regular',
    size: 100,
    color: '#ffffff',
  },
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mockGetTryxStatus.mockResolvedValue(defaultStatus);
  mockGetTryxPresets.mockResolvedValue([]);
  mockGetTryxMedia.mockResolvedValue([]);
  mockGetTryxCloudCatalog.mockResolvedValue([]);
  mockSetTryxEnabled.mockResolvedValue(true);
  mockSetTryxBrightness.mockResolvedValue(true);
  mockSetTryxOverlay.mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

async function renderPage() {
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(<TryxDevicePage />);
  });
  return result!;
}

describe('TryxDevicePage - overlay editor', () => {
  it('renders the font select and size slider, with no alignment chips', async () => {
    await renderPage();
    expect(screen.getByRole('button', { name: 'devices.tryx.font' })).toBeInTheDocument();
    expect(screen.getByText('devices.tryx.size')).toBeInTheDocument();
    expect(screen.queryByText('devices.tryx.alignment')).not.toBeInTheDocument();
    expect(screen.queryByText('devices.tryx.alignLeft')).not.toBeInTheDocument();
  });

  it('loads font/size/color and the first item stat from status.overlay', async () => {
    await renderPage();
    expect(screen.getByRole('button', { name: 'devices.tryx.font' })).toHaveTextContent('devices.tryx.fontRegular');
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('renders the preview canvas with a draggable stat showing a placeholder value + label', async () => {
    await renderPage();
    const drag = screen.getByRole('button', {
      name: 'devices.tryx.overlayDragAria:{"stat":"devices.tryx.statCpuTemperature"}',
    });
    expect(drag).toBeInTheDocument();
    expect(drag).toHaveTextContent('45°C');
    expect(drag).toHaveTextContent('devices.tryx.statCpuTemperature');
    expect(drag.style.left).toBe('4%');
    expect(drag.style.top).toBe('12%');
  });

  it('does not render a drag handle for a disabled overlay slot', async () => {
    await renderPage();
    expect(screen.queryByRole('button', {
      name: 'devices.tryx.overlayDragAria:{"stat":"devices.tryx.statCpuFrequency"}',
    })).not.toBeInTheDocument();
  });

  it('debounces a font change into a single setTryxOverlay call after 150ms', async () => {
    await renderPage();
    const fontSelect = screen.getByRole('button', { name: 'devices.tryx.font' });
    fireEvent.click(fontSelect);
    const boldOption = screen.getByRole('option', { name: 'devices.tryx.fontBold' });
    fireEvent.click(boldOption);

    expect(mockSetTryxOverlay).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(150); });

    expect(mockSetTryxOverlay).toHaveBeenCalledTimes(1);
    expect(mockSetTryxOverlay).toHaveBeenCalledWith({
      items: [{ stat: 'CPU Temperature', x: 0.04, y: 0.12 }],
      font: 'roboto-bold',
      size: 100,
      color: '#ffffff',
    });
  });

  it('flushes a still-pending debounced push immediately on unmount instead of dropping it', async () => {
    const { unmount } = await renderPage();
    const fontSelect = screen.getByRole('button', { name: 'devices.tryx.font' });
    fireEvent.click(fontSelect);
    const boldOption = screen.getByRole('option', { name: 'devices.tryx.fontBold' });
    fireEvent.click(boldOption);

    expect(mockSetTryxOverlay).not.toHaveBeenCalled();
    unmount();

    expect(mockSetTryxOverlay).toHaveBeenCalledTimes(1);
    expect(mockSetTryxOverlay).toHaveBeenCalledWith({
      items: [{ stat: 'CPU Temperature', x: 0.04, y: 0.12 }],
      font: 'roboto-bold',
      size: 100,
      color: '#ffffff',
    });
  });

  it('coalesces a rapid drag into a single debounced push with the final position', async () => {
    await renderPage();
    const drag = screen.getByRole('button', {
      name: 'devices.tryx.overlayDragAria:{"stat":"devices.tryx.statCpuTemperature"}',
    });
    const canvas = drag.parentElement as HTMLElement;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}),
    });

    fireEvent.pointerDown(drag, { clientX: 8, clientY: 12, pointerId: 1 });
    fireEvent.pointerMove(drag, { clientX: 28, clientY: 12, pointerId: 1 });
    fireEvent.pointerMove(drag, { clientX: 48, clientY: 12, pointerId: 1 });
    fireEvent.pointerUp(drag, { clientX: 48, clientY: 12, pointerId: 1 });

    expect(mockSetTryxOverlay).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(150); });

    expect(mockSetTryxOverlay).toHaveBeenCalledTimes(1);
    const call = mockSetTryxOverlay.mock.calls[0][0];
    // Dragged 40px right on a 200px-wide canvas = +0.2 normalized, from 0.04.
    expect(call.items[0].x).toBeCloseTo(0.24, 5);
    expect(call.items[0].y).toBeCloseTo(0.12, 5);
  });

  it('nudges position by arrow key and pushes the update debounced', async () => {
    await renderPage();
    const drag = screen.getByRole('button', {
      name: 'devices.tryx.overlayDragAria:{"stat":"devices.tryx.statCpuTemperature"}',
    });
    fireEvent.keyDown(drag, { key: 'ArrowRight' });
    await act(async () => { vi.advanceTimersByTime(150); });

    expect(mockSetTryxOverlay).toHaveBeenCalledTimes(1);
    const call = mockSetTryxOverlay.mock.calls[0][0];
    expect(call.items[0].x).toBeCloseTo(0.05, 5);
    expect(call.items[0].y).toBeCloseTo(0.12, 5);
  });

  it('falls back to the neutral background when no wallpaper is active', async () => {
    mockGetTryxStatus.mockResolvedValue({
      ...defaultStatus,
      state: { ...defaultStatus.state, currentMedia: '' },
    });
    await renderPage();
    const drag = screen.getByRole('button', {
      name: 'devices.tryx.overlayDragAria:{"stat":"devices.tryx.statCpuTemperature"}',
    });
    const canvas = drag.parentElement as HTMLElement;
    expect(canvas.style.backgroundImage).toBe('');
  });
});
