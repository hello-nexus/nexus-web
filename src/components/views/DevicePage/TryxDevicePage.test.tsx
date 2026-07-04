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

const mockSensors = {
  cpu: [{ id: 'cpu-temp', name: 'CPU Package', type: 'Temperature', value: 45, units: '°C', formatted: '45°C', parent: { id: 'cpu', name: 'CPU' } }],
  gpu: [{ id: 'gpu-load', name: 'GPU Core', type: 'Load', value: 34, units: '%', formatted: '34%', parent: { id: 'gpu', name: 'GPU' } }],
  gpuModel: '',
  gpuComponents: [],
  memory: [],
  storage: [],
  storageComponents: {},
  storageSensors: [],
  motherboard: [],
  motherboardModel: '',
  cpuModel: '',
  gpuModels: [],
  memoryTotal: '',
};

vi.mock('../../../hooks/useSensors', () => ({
  useSensors: () => mockSensors,
}));

vi.mock('../../../hooks/useNetworkMonitor', () => ({
  useNetworkMonitor: () => ({
    series: [], sampleCount: 0, totalRate: 0, totalRateIn: 0, totalRateOut: 0, entries: [],
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
    items: [{ sensorId: 'cpu-temp', device: 'cpu', label: 'CPU Package', x: 0.04, y: 0.38 }],
    font: 'roboto-regular',
    size: 100,
    color: '#ffffff',
    align: 'left',
    docked: true,
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

function mockCanvasRect(drag: HTMLElement) {
  const canvas = drag.parentElement as HTMLElement;
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}),
  });
  return canvas;
}

describe('TryxDevicePage - overlay editor', () => {
  it('renders the align chips and a docked toggle', async () => {
    await renderPage();
    expect(screen.getByRole('group', { name: 'devices.tryx.align' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'devices.tryx.alignLeft' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'devices.tryx.alignCenter' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'devices.tryx.alignRight' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'devices.tryx.docked' })).toBeInTheDocument();
  });

  it('loads font/size/color and item 1\'s device + sensor from status.overlay', async () => {
    await renderPage();
    expect(screen.getByRole('button', { name: 'devices.tryx.font' })).toHaveTextContent('devices.tryx.fontRegular');
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'devices.tryx.overlayDeviceAria:{"n":1}' }))
      .toHaveTextContent('devices.tryx.deviceCpu');
    expect(screen.getByRole('button', { name: 'devices.tryx.overlaySensorAria:{"n":1}' }))
      .toHaveTextContent('Package (Temperature)');
    expect(screen.getByRole('switch', { name: 'devices.tryx.docked' })).toHaveAttribute('aria-checked', 'true');
  });

  it('renders the preview canvas with a draggable stat showing the live sensor value + label', async () => {
    await renderPage();
    const drag = screen.getByRole('button', { name: 'devices.tryx.overlayDragAria:{"stat":"CPU Package"}' });
    expect(drag).toBeInTheDocument();
    expect(drag).toHaveTextContent('45°C');
    expect(drag).toHaveTextContent('CPU Package');
    expect(drag.style.left).toBe('4%');
    expect(drag.style.top).toBe('38%');
  });

  it('does not render a drag handle for a disabled overlay slot', async () => {
    await renderPage();
    expect(screen.getAllByRole('button', { name: /overlayDragAria/ })).toHaveLength(1);
  });

  it('debounces a font change into a single setTryxOverlay call with the full payload', async () => {
    await renderPage();
    const fontSelect = screen.getByRole('button', { name: 'devices.tryx.font' });
    fireEvent.click(fontSelect);
    const boldOption = screen.getByRole('option', { name: 'devices.tryx.fontBold' });
    fireEvent.click(boldOption);

    expect(mockSetTryxOverlay).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(150); });

    expect(mockSetTryxOverlay).toHaveBeenCalledTimes(1);
    expect(mockSetTryxOverlay).toHaveBeenCalledWith({
      items: [{ sensorId: 'cpu-temp', device: 'cpu', label: 'CPU Package', x: 0.04, y: 0.38 }],
      font: 'roboto-bold',
      size: 100,
      color: '#ffffff',
      align: 'left',
      docked: true,
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
      items: [{ sensorId: 'cpu-temp', device: 'cpu', label: 'CPU Package', x: 0.04, y: 0.38 }],
      font: 'roboto-bold',
      size: 100,
      color: '#ffffff',
      align: 'left',
      docked: true,
    });
  });

  it('coalesces a rapid drag into a single debounced push, clearing docked', async () => {
    await renderPage();
    const drag = screen.getByRole('button', { name: 'devices.tryx.overlayDragAria:{"stat":"CPU Package"}' });
    mockCanvasRect(drag);

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
    expect(call.items[0].y).toBeCloseTo(0.38, 5);
    expect(call.docked).toBe(false);
  });

  it('nudges position by arrow key, pushes debounced, and clears docked', async () => {
    await renderPage();
    const drag = screen.getByRole('button', { name: 'devices.tryx.overlayDragAria:{"stat":"CPU Package"}' });
    fireEvent.keyDown(drag, { key: 'ArrowRight' });
    await act(async () => { vi.advanceTimersByTime(150); });

    expect(mockSetTryxOverlay).toHaveBeenCalledTimes(1);
    const call = mockSetTryxOverlay.mock.calls[0][0];
    expect(call.items[0].x).toBeCloseTo(0.05, 5);
    expect(call.items[0].y).toBeCloseTo(0.38, 5);
    expect(call.docked).toBe(false);
  });

  it('changing align while docked re-anchors the enabled item, keeping docked on', async () => {
    await renderPage();
    const rightChip = screen.getByRole('button', { name: 'devices.tryx.alignRight' });
    fireEvent.click(rightChip);
    await act(async () => { vi.advanceTimersByTime(150); });

    expect(mockSetTryxOverlay).toHaveBeenCalledTimes(1);
    const call = mockSetTryxOverlay.mock.calls[0][0];
    expect(call.align).toBe('right');
    expect(call.docked).toBe(true);
    expect(call.items[0].x).toBeCloseTo(0.96, 5);
    expect(call.items[0].y).toBeCloseTo(0.38, 5);
  });

  it('re-enabling docked snaps a dragged item back to the align-derived anchor', async () => {
    await renderPage();
    const drag = screen.getByRole('button', { name: 'devices.tryx.overlayDragAria:{"stat":"CPU Package"}' });
    mockCanvasRect(drag);
    fireEvent.pointerDown(drag, { clientX: 8, clientY: 12, pointerId: 1 });
    fireEvent.pointerMove(drag, { clientX: 108, clientY: 62, pointerId: 1 });
    fireEvent.pointerUp(drag, { clientX: 108, clientY: 62, pointerId: 1 });
    await act(async () => { vi.advanceTimersByTime(150); });
    mockSetTryxOverlay.mockClear();

    const dockedToggle = screen.getByRole('switch', { name: 'devices.tryx.docked' });
    expect(dockedToggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(dockedToggle);
    await act(async () => { vi.advanceTimersByTime(150); });

    expect(mockSetTryxOverlay).toHaveBeenCalledTimes(1);
    const call = mockSetTryxOverlay.mock.calls[0][0];
    expect(call.docked).toBe(true);
    expect(call.items[0].x).toBeCloseTo(0.04, 5);
    expect(call.items[0].y).toBeCloseTo(0.38, 5);
  });

  it('picking a different device group resets the sensor to the first of that group', async () => {
    await renderPage();
    const deviceSelect = screen.getByRole('button', { name: 'devices.tryx.overlayDeviceAria:{"n":1}' });
    fireEvent.click(deviceSelect);
    const gpuOption = screen.getByRole('option', { name: 'devices.tryx.deviceGpu' });
    fireEvent.click(gpuOption);
    await act(async () => { vi.advanceTimersByTime(150); });

    expect(mockSetTryxOverlay).toHaveBeenCalledTimes(1);
    const call = mockSetTryxOverlay.mock.calls[0][0];
    expect(call.items[0]).toEqual({ sensorId: 'gpu-load', device: 'gpu', label: 'GPU Core', x: 0.04, y: 0.38 });
  });

  it('disables a device group with no live sensors in the picker', async () => {
    await renderPage();
    const deviceSelect = screen.getByRole('button', { name: 'devices.tryx.overlayDeviceAria:{"n":1}' });
    fireEvent.click(deviceSelect);
    // mockSensors.memory is empty, so the group can't be picked.
    expect(screen.getByRole('option', { name: 'devices.tryx.deviceMemory' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('never disables fps in the picker - the static template covers a not-yet-running game', async () => {
    await renderPage();
    const deviceSelect = screen.getByRole('button', { name: 'devices.tryx.overlayDeviceAria:{"n":1}' });
    fireEvent.click(deviceSelect);
    expect(screen.getByRole('option', { name: 'devices.tryx.deviceFps' })).not.toHaveAttribute('aria-disabled');
  });

  it('picking fps as the device group resets the sensor to FPS (fps/current)', async () => {
    await renderPage();
    const deviceSelect = screen.getByRole('button', { name: 'devices.tryx.overlayDeviceAria:{"n":1}' });
    fireEvent.click(deviceSelect);
    const fpsOption = screen.getByRole('option', { name: 'devices.tryx.deviceFps' });
    fireEvent.click(fpsOption);
    await act(async () => { vi.advanceTimersByTime(150); });

    expect(mockSetTryxOverlay).toHaveBeenCalledTimes(1);
    const call = mockSetTryxOverlay.mock.calls[0][0];
    expect(call.items[0]).toEqual({ sensorId: 'fps/current', device: 'fps', label: 'FPS', x: 0.04, y: 0.38 });
  });

  it('enabling a never-configured slot auto-picks its default device\'s first sensor', async () => {
    await renderPage();
    const secondToggle = screen.getByRole('switch', { name: 'devices.tryx.overlayLineAria:{"n":2}' });
    fireEvent.click(secondToggle);
    await act(async () => { vi.advanceTimersByTime(150); });

    expect(mockSetTryxOverlay).toHaveBeenCalledTimes(1);
    const call = mockSetTryxOverlay.mock.calls[0][0];
    expect(call.items).toHaveLength(2);
    expect(call.items[1].sensorId).toBe('cpu-temp');
    expect(call.items[1].device).toBe('cpu');
    expect(call.items[1].label).toBe('CPU Package');
    expect(call.items[1].x).toBeCloseTo(0.04);
    expect(call.items[1].y).toBeCloseTo(0.50);
  });

  it('falls back to the neutral background when no wallpaper is active', async () => {
    mockGetTryxStatus.mockResolvedValue({
      ...defaultStatus,
      state: { ...defaultStatus.state, currentMedia: '' },
    });
    await renderPage();
    const drag = screen.getByRole('button', { name: 'devices.tryx.overlayDragAria:{"stat":"CPU Package"}' });
    const canvas = drag.parentElement as HTMLElement;
    expect(canvas.style.backgroundImage).toBe('');
  });

  it('shows the drag legend under the canvas while a stat is enabled', async () => {
    await renderPage();
    expect(screen.getByText('devices.tryx.overlayDragHint')).toBeInTheDocument();
  });

  it('hides the drag legend once no stat is enabled', async () => {
    await renderPage();
    const firstToggle = screen.getByRole('switch', { name: 'devices.tryx.overlayLineAria:{"n":1}' });
    fireEvent.click(firstToggle);
    await act(async () => { vi.advanceTimersByTime(150); });
    expect(screen.queryByText('devices.tryx.overlayDragHint')).not.toBeInTheDocument();
  });
});

describe('TryxDevicePage - media tab storage indicator', () => {
  async function openMediaTab() {
    await renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'devices.tryx.tabMedia' }));
  }

  it('shows the storage indicator even before any media is uploaded', async () => {
    await openMediaTab();
    expect(screen.getByText(/devices\.tryx\.storageFree/)).toBeInTheDocument();
  });

  it('shows the remaining-capacity percent and fills the bar by the used portion', async () => {
    mockGetTryxStatus.mockResolvedValue({
      ...defaultStatus,
      mediaFileCount: 8,
      mediaUsedBytes: 50305560,
    });
    await openMediaTab();
    expect(screen.getByText('devices.tryx.storageFree:{"percent":"99.4%"}')).toBeInTheDocument();
  });
});
