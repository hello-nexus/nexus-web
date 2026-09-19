import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const api = vi.hoisted(() => ({
  fetchPanelSwipeOnboarding: vi.fn(),
  completePanelSwipeOnboarding: vi.fn(),
}));
vi.mock('../../api/onboarding', () => api);
const topics = vi.hoisted(() => ({ listeners: new Map<string, (data: unknown) => void>() }));
vi.mock('../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: (topic: string, enabled: boolean, onFrame: (data: unknown) => void) => {
    if (enabled) topics.listeners.set(topic, onFrame);
    else topics.listeners.delete(topic);
  },
}));

import {
  usePanelSwipeOnboarding,
  SWIPE_HINT_PERIOD_MS,
  SWIPE_HINT_VISIBLE_MS,
} from './usePanelSwipeOnboarding';

type Opts = { enabled: boolean; blocked: boolean; trayOpen: boolean };

async function setup(initial: Partial<Opts> = {}, completed: boolean | null = false) {
  api.fetchPanelSwipeOnboarding.mockResolvedValue(completed === null ? null : { completed });
  api.completePanelSwipeOnboarding.mockResolvedValue({ completed: true });
  const opts: Opts = { enabled: true, blocked: false, trayOpen: false, ...initial };
  const hook = renderHook((p: Opts) => usePanelSwipeOnboarding(p), { initialProps: opts });
  await act(async () => { await Promise.resolve(); });
  return { ...hook, opts };
}

describe('usePanelSwipeOnboarding', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); topics.listeners.clear(); });

  it('shows the hand for the visible window once per period while pending', async () => {
    const { result } = await setup();
    expect(result.current.hintVisible).toBe(false);
    act(() => { vi.advanceTimersByTime(SWIPE_HINT_PERIOD_MS); });
    expect(result.current.hintVisible).toBe(true);
    act(() => { vi.advanceTimersByTime(SWIPE_HINT_VISIBLE_MS); });
    expect(result.current.hintVisible).toBe(false);
    act(() => { vi.advanceTimersByTime(SWIPE_HINT_PERIOD_MS - SWIPE_HINT_VISIBLE_MS); });
    expect(result.current.hintVisible).toBe(true);
  });

  it('never shows once the service reports completed', async () => {
    const { result } = await setup({}, true);
    act(() => { vi.advanceTimersByTime(SWIPE_HINT_PERIOD_MS * 3); });
    expect(result.current.hintVisible).toBe(false);
  });

  it('treats a failed read as completed', async () => {
    const { result } = await setup({}, null);
    act(() => { vi.advanceTimersByTime(SWIPE_HINT_PERIOD_MS * 3); });
    expect(result.current.hintVisible).toBe(false);
  });

  it('hides and restarts the clock while blocked', async () => {
    const { result, rerender, opts } = await setup();
    act(() => { vi.advanceTimersByTime(SWIPE_HINT_PERIOD_MS); });
    expect(result.current.hintVisible).toBe(true);
    rerender({ ...opts, blocked: true });
    expect(result.current.hintVisible).toBe(false);
    rerender({ ...opts, blocked: false });
    act(() => { vi.advanceTimersByTime(SWIPE_HINT_PERIOD_MS - 1); });
    expect(result.current.hintVisible).toBe(false);
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.hintVisible).toBe(true);
  });

  it('first tray open completes on the service, drops the hand and raises the notice', async () => {
    const { result, rerender, opts } = await setup();
    act(() => { vi.advanceTimersByTime(SWIPE_HINT_PERIOD_MS); });
    expect(result.current.hintVisible).toBe(true);
    rerender({ ...opts, trayOpen: true });
    expect(api.completePanelSwipeOnboarding).toHaveBeenCalledTimes(1);
    expect(result.current.hintVisible).toBe(false);
    expect(result.current.noticeVisible).toBe(true);
    rerender({ ...opts, trayOpen: false });
    act(() => { vi.advanceTimersByTime(SWIPE_HINT_PERIOD_MS * 2); });
    expect(result.current.hintVisible).toBe(false);
    expect(result.current.noticeVisible).toBe(false);
  });

  it('the next tap ends the notice for good', async () => {
    const { result, rerender, opts } = await setup();
    rerender({ ...opts, trayOpen: true });
    expect(result.current.noticeVisible).toBe(true);
    act(() => { document.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    expect(result.current.noticeVisible).toBe(false);
    rerender({ ...opts, trayOpen: false });
    rerender({ ...opts, trayOpen: true });
    expect(result.current.noticeVisible).toBe(false);
    expect(api.completePanelSwipeOnboarding).toHaveBeenCalledTimes(1);
  });

  it('a tray open while already completed posts nothing', async () => {
    const { result, rerender, opts } = await setup({}, true);
    rerender({ ...opts, trayOpen: true });
    expect(api.completePanelSwipeOnboarding).not.toHaveBeenCalled();
    expect(result.current.noticeVisible).toBe(false);
  });

  it('a re-read that still says pending lets the next open post again', async () => {
    const { rerender, opts } = await setup();
    rerender({ ...opts, trayOpen: true });
    rerender({ ...opts, trayOpen: false });
    rerender({ ...opts, enabled: false });
    rerender({ ...opts, enabled: true });
    await act(async () => { await Promise.resolve(); });
    rerender({ ...opts, trayOpen: true });
    expect(api.completePanelSwipeOnboarding).toHaveBeenCalledTimes(2);
  });

  it('re-reads the flag on the prefs topic, so a reset revives the hand on a live kiosk', async () => {
    const { result, rerender, opts } = await setup();
    rerender({ ...opts, trayOpen: true });
    rerender({ ...opts, trayOpen: false });
    act(() => { vi.advanceTimersByTime(SWIPE_HINT_PERIOD_MS * 2); });
    expect(result.current.hintVisible).toBe(false);
    api.fetchPanelSwipeOnboarding.mockResolvedValue({ completed: false });
    await act(async () => { topics.listeners.get('prefs')?.({}); await Promise.resolve(); });
    act(() => { vi.advanceTimersByTime(SWIPE_HINT_PERIOD_MS); });
    expect(result.current.hintVisible).toBe(true);
  });

  it('does not read the flag while disabled', async () => {
    await setup({ enabled: false });
    expect(api.fetchPanelSwipeOnboarding).not.toHaveBeenCalled();
  });
});
