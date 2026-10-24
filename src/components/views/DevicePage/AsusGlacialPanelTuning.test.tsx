import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  GLACIAL_TUNING_UNAVAILABLE: 'unavailable',
}));

const tuning = (over: { settings?: object; stats?: object } = {}) => ({
  settings: {
    maxFps: 5, pacePercent: 19, replyDriven: true, scalePercent: 50, scaleMode: 'send',
    jpegQuality: 65, chunkKb: 4, doubleBuffer: false, closeWriteMode: true, rawStream: false, updateInPlace: false, rawProbe: false, ...over.settings,
  },
  stats: {
    uploadsOk: 10, uploadsFailed: 1, lastUploadMs: 900, uploadsPerSec: 1.1, lastFrameBytes: 20480,
    lastEncodeMs: 12, lastError: null, lastErrorAt: null, stalled: false,
    ackReplies: 40, ackTimeouts: 2, lastUploadAckWaitMs: 350, lastCommitWaitMs: 800, rawFramesOk: 7, rawFramesFailed: 0, rawActive: false, ...over.stats,
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
    mockReset.mockReset().mockResolvedValue('ok');
    mockResume.mockReset().mockResolvedValue('ok');
    mockPush.mockReset();
  });

  it('reads a frame rate cap of 30 as no cap', async () => {
    await mount(tuning({ settings: { maxFps: 30 } }));
    expect(screen.getByText('devices.asus-glacial-lcd.tuning.noCap')).toBeInTheDocument();
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
    expect(mockSet).toHaveBeenCalledWith({ replyDriven: false });
  });

  it('applies the close write mode and raw stream toggles at once, raw stream off by default', async () => {
    await mount();
    expect(screen.getByRole('switch', { name: /closeWriteMode/ })).toBeChecked();
    expect(screen.getByRole('switch', { name: /rawStream/ })).not.toBeChecked();
    await act(async () => { fireEvent.click(screen.getByRole('switch', { name: /closeWriteMode/ })); });
    expect(mockSet).toHaveBeenCalledWith({ closeWriteMode: false });
    await act(async () => { fireEvent.click(screen.getByRole('switch', { name: /rawStream/ })); });
    expect(mockSet).toHaveBeenCalledWith({ rawStream: true });
  });

  it('applies the two probe toggles at once, both off by default', async () => {
    await mount();
    expect(screen.getByRole('switch', { name: /updateInPlace/ })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: /rawProbe/ })).not.toBeChecked();
    await act(async () => { fireEvent.click(screen.getByRole('switch', { name: /updateInPlace/ })); });
    expect(mockSet).toHaveBeenCalledWith({ updateInPlace: true });
    await act(async () => { fireEvent.click(screen.getByRole('switch', { name: /rawProbe/ })); });
    expect(mockSet).toHaveBeenCalledWith({ rawProbe: true });
  });

  it('shows the reply statistics, and the raw frame counts only while raw streaming is on', async () => {
    await mount();
    expect(screen.getByText('devices.asus-glacial-lcd.tuning.ackRepliesValue:{"ok":"40","missed":"2"}')).toBeInTheDocument();
    expect(screen.getByText('devices.asus-glacial-lcd.tuning.unitMs:{"n":"350"}')).toBeInTheDocument();
    expect(screen.getByText('devices.asus-glacial-lcd.tuning.unitMs:{"n":"800"}')).toBeInTheDocument();
    expect(screen.queryByText('devices.asus-glacial-lcd.tuning.rawFramesValue:{"ok":"7","failed":"0"}')).toBeNull();
  });

  it('keeps the raw frame counts after the service switched raw streaming off by itself', async () => {
    await mount(tuning({ stats: { rawFramesFailed: 3 } }));
    expect(screen.getByText('devices.asus-glacial-lcd.tuning.rawFramesValue:{"ok":"7","failed":"3"}')).toBeInTheDocument();
  });

  it('shows the raw frame counts while raw streaming is on', async () => {
    await mount(tuning({ settings: { rawStream: true } }));
    expect(screen.getByText('devices.asus-glacial-lcd.tuning.rawFramesValue:{"ok":"7","failed":"0"}')).toBeInTheDocument();
  });

  it('applies the scale mode chip at once', async () => {
    await mount();
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
    expect(GLACIAL_TUNING_DEFAULTS).toMatchObject({ maxFps: 30, replyDriven: true, closeWriteMode: true, rawStream: false, updateInPlace: false, rawProbe: false, scaleMode: 'send', pacePercent: 19, doubleBuffer: false, chunkKb: 4, jpegQuality: 65, scalePercent: 100 });
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

describe('AsusGlacialPanelTuning slider edits against the poll', () => {
  const paceSlider = () => screen.getByRole('slider', { name: /pacePercent|devices.asus-glacial-lcd.tuning.pacePercent/ }) as HTMLInputElement;

  beforeEach(() => {
    vi.useFakeTimers();
    mockGet.mockReset();
    mockSet.mockReset();
    mockPush.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function mountReal() {
    mockGet.mockResolvedValue(tuning());
    mockSet.mockImplementation(async (patch: object) => ({ ...tuning(), settings: { ...tuning().settings, ...patch } }));
    await act(async () => { render(<AsusGlacialPanelTuning />); });
  }

  it('keeps the dragged thumb across a poll and commits the dragged value on release', async () => {
    await mountReal();
    await act(async () => { fireEvent.change(paceSlider(), { target: { value: '80' } }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2_100); });
    expect(paceSlider().value).toBe('80');
    expect(mockSet).not.toHaveBeenCalled();
    await act(async () => { fireEvent.pointerUp(paceSlider()); await vi.advanceTimersByTimeAsync(10); });
    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith({ pacePercent: 80 });
  });

  it('ignores a poll that was already in flight when a write landed', async () => {
    await mountReal();
    let resolveStale: (v: ReturnType<typeof tuning>) => void = () => {};
    mockGet.mockReturnValueOnce(new Promise(r => { resolveStale = r; }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1_100); });
    await act(async () => { fireEvent.change(paceSlider(), { target: { value: '60' } }); });
    await act(async () => { fireEvent.pointerUp(paceSlider()); await vi.advanceTimersByTimeAsync(10); });
    expect(paceSlider().value).toBe('60');
    await act(async () => { resolveStale(tuning({ settings: { pacePercent: 19 } })); });
    expect(paceSlider().value).toBe('60');
  });

  it('sends one write for a typed value', async () => {
    await mountReal();
    await act(async () => { fireEvent.click(screen.getByText('19%')); });
    const input = screen.getAllByDisplayValue('19').find(el => (el as HTMLInputElement).type !== 'range') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: '50' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith({ pacePercent: 50 });
  });

  it('keeps a re-grabbed slider protected while its first write is still in flight', async () => {
    await mountReal();
    let answerFirst: (v: ReturnType<typeof tuning>) => void = () => {};
    mockSet.mockReturnValueOnce(new Promise(r => { answerFirst = r; }));
    await act(async () => { fireEvent.change(paceSlider(), { target: { value: '60' } }); });
    await act(async () => { fireEvent.pointerUp(paceSlider()); await vi.advanceTimersByTimeAsync(10); });
    await act(async () => { fireEvent.change(paceSlider(), { target: { value: '70' } }); });
    await act(async () => { answerFirst(tuning({ settings: { pacePercent: 60 } })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1_100); });
    expect(paceSlider().value).toBe('70');
  });

  it('commits a change that never reaches release once it goes quiet', async () => {
    await mountReal();
    await act(async () => { fireEvent.change(paceSlider(), { target: { value: '45' } }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2_900); });
    expect(mockSet).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith({ pacePercent: 45 });
  });

  it('tells a failed write even when the card is gone', async () => {
    mockGet.mockResolvedValue(tuning());
    let failWrite: (v: null) => void = () => {};
    mockSet.mockReturnValueOnce(new Promise(r => { failWrite = r; }));
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(<AsusGlacialPanelTuning />); });
    await act(async () => { fireEvent.change(paceSlider(), { target: { value: '30' } }); });
    await act(async () => { fireEvent.pointerUp(paceSlider()); await vi.advanceTimersByTimeAsync(10); });
    view.unmount();
    await act(async () => { failWrite(null); });
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('re-reads after a failed write even while a poll is in flight', async () => {
    mockGet.mockResolvedValue(tuning());
    mockSet.mockResolvedValue(null);
    await act(async () => { render(<AsusGlacialPanelTuning />); });
    let finishPoll: (v: ReturnType<typeof tuning>) => void = () => {};
    mockGet.mockReturnValueOnce(new Promise(r => { finishPoll = r; }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1_100); });
    const before = mockGet.mock.calls.length;
    await act(async () => { fireEvent.change(paceSlider(), { target: { value: '30' } }); });
    await act(async () => { fireEvent.pointerUp(paceSlider()); await vi.advanceTimersByTimeAsync(10); });
    await act(async () => { finishPoll(tuning()); });
    expect(mockGet.mock.calls.length).toBeGreaterThan(before);
    expect(paceSlider().value).toBe('19');
  });

  it('never runs two polls at once', async () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    await act(async () => { render(<AsusGlacialPanelTuning />); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  const scaleSlider = () => screen.getByRole('slider', { name: /scalePercent/ }) as HTMLInputElement;

  it('offers the real frame sizes from 30 to 100 percent in steps of 10', async () => {
    await mountReal();
    const slider = scaleSlider();
    expect([slider.min, slider.max, slider.step]).toEqual(['30', '100', '10']);
    expect(screen.getByText('50% (360x640)')).toBeInTheDocument();
    await act(async () => { fireEvent.change(slider, { target: { value: '70' } }); });
    expect(screen.getByText('70% (504x896)')).toBeInTheDocument();
    await act(async () => { fireEvent.pointerUp(slider); await vi.advanceTimersByTimeAsync(10); });
    expect(mockSet).toHaveBeenCalledWith({ scalePercent: 70 });
  });

  it('stays quiet and stops calling once the service answers 409', async () => {
    mockGet.mockResolvedValueOnce(tuning());
    mockSet.mockResolvedValue('unavailable');
    await act(async () => { render(<AsusGlacialPanelTuning />); });
    await act(async () => { fireEvent.change(paceSlider(), { target: { value: '30' } }); });
    await act(async () => { fireEvent.pointerUp(paceSlider()); await vi.advanceTimersByTimeAsync(10); });
    expect(mockPush).not.toHaveBeenCalled();
    const calls = mockGet.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(mockGet.mock.calls.length).toBe(calls);
  });

  it('stops polling when a read answers 409', async () => {
    mockGet.mockResolvedValue('unavailable');
    await act(async () => { render(<AsusGlacialPanelTuning />); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });
});
