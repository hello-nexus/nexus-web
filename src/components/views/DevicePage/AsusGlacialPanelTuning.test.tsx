import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AsusGlacialPanelTuning, GLACIAL_TUNING_DEFAULTS } from './AsusGlacialPanelTuning';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  }),
}));

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockReset = vi.fn();
const mockResume = vi.fn();
const mockPush = vi.fn();

vi.mock('../../common/Toast/Toast', () => ({ useToast: () => ({ push: mockPush }) }));
vi.mock('../../../api/asus-glacial-lcd', () => ({
  getGlacialTuning: () => mockGet(),
  setGlacialTuning: (patch: unknown) => mockSet(patch),
  resetGlacialTuningStats: () => mockReset(),
  resumeGlacialTuning: () => mockResume(),
}));

const tuning = (over: { settings?: object; stats?: object } = {}) => ({
  settings: {
    maxFps: 5, pacePercent: 19, replyDriven: false, scalePercent: 50, scaleMode: 'send',
    jpegQuality: 65, chunkKb: 4, doubleBuffer: false, ...over.settings,
  },
  stats: {
    uploadsOk: 10, uploadsFailed: 1, lastUploadMs: 900, uploadsPerSec: 1.1, lastFrameBytes: 20480,
    lastEncodeMs: 12, lastError: null, lastErrorAt: null, stalled: false, ...over.stats,
  },
});

async function mount(value = tuning()) {
  mockGet.mockResolvedValue(value);
  mockSet.mockImplementation(async (patch: object) => ({ ...value, settings: { ...value.settings, ...patch } }));
  await act(async () => { render(<AsusGlacialPanelTuning />); });
}

describe('AsusGlacialPanelTuning', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockSet.mockReset();
    mockReset.mockReset().mockResolvedValue(true);
    mockResume.mockReset().mockResolvedValue(true);
    mockPush.mockReset();
  });

  it('shows the stats readout', async () => {
    await mount();
    expect(screen.getByText('devices.asus-glacial-lcd.tuning.unitPerSec:{"n":"1.10"}')).toBeInTheDocument();
    expect(screen.getByText('devices.asus-glacial-lcd.tuning.uploadsValue:{"ok":"10","failed":"1"}')).toBeInTheDocument();
    expect(screen.queryByText('devices.asus-glacial-lcd.tuning.lastError')).toBeNull();
  });

  it('applies a toggle at once with a partial write', async () => {
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: /replyDriven/ }));
    });
    expect(mockSet).toHaveBeenCalledWith({ replyDriven: true });
  });

  it('applies the scale step and mode chips', async () => {
    await mount();
    await act(async () => { fireEvent.click(screen.getByRole('radio', { name: '75%' })); });
    expect(mockSet).toHaveBeenCalledWith({ scalePercent: 75 });
    await act(async () => { fireEvent.click(screen.getByRole('radio', { name: 'devices.asus-glacial-lcd.tuning.scaleModeUpscale' })); });
    expect(mockSet).toHaveBeenCalledWith({ scaleMode: 'upscale' });
  });

  it('shows the stalled notice and resumes', async () => {
    await mount(tuning({ stats: { stalled: true } }));
    expect(screen.getByText('devices.asus-glacial-lcd.tuning.stalled')).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'devices.asus-glacial-lcd.tuning.resume' })); });
    expect(mockResume).toHaveBeenCalledTimes(1);
  });

  it('hides the stalled notice while uploads run and shows the last error when present', async () => {
    await mount(tuning({ stats: { lastError: 'pipe closed' } }));
    expect(screen.queryByText('devices.asus-glacial-lcd.tuning.stalled')).toBeNull();
    expect(screen.getByText('pipe closed')).toBeInTheDocument();
  });

  it('resets statistics and restores defaults', async () => {
    await mount();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'devices.asus-glacial-lcd.tuning.resetStats' })); });
    expect(mockReset).toHaveBeenCalledTimes(1);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'devices.asus-glacial-lcd.tuning.restoreDefaults' })); });
    expect(mockSet).toHaveBeenCalledWith(GLACIAL_TUNING_DEFAULTS);
    expect(GLACIAL_TUNING_DEFAULTS).toMatchObject({ pacePercent: 19, doubleBuffer: false, chunkKb: 4, jpegQuality: 65, scalePercent: 100 });
  });

  it('toasts when a write is refused', async () => {
    await mount();
    mockSet.mockResolvedValue(null);
    await act(async () => { fireEvent.click(screen.getByRole('switch', { name: /doubleBuffer/ })); });
    expect(mockPush).toHaveBeenCalled();
  });

  it('polls about once a second and stops on unmount', async () => {
    vi.useFakeTimers();
    try {
      mockGet.mockResolvedValue(tuning());
      let view!: ReturnType<typeof render>;
      await act(async () => { view = render(<AsusGlacialPanelTuning />); });
      const initial = mockGet.mock.calls.length;
      await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
      expect(mockGet.mock.calls.length).toBeGreaterThanOrEqual(initial + 3);
      view.unmount();
      const after = mockGet.mock.calls.length;
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      expect(mockGet.mock.calls.length).toBe(after);
    } finally {
      vi.useRealTimers();
    }
  });
});
