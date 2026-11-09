import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingSlider } from '../SettingRow/SettingRow';
import { BrightnessScheduleButton, useScheduleSliderProps, type BrightnessScheduleBinding } from './BrightnessScheduleButton';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  }),
}));

const binding = (over: Partial<BrightnessScheduleBinding> = {}): BrightnessScheduleBinding => ({
  scheduleOn: true, follows: true, onFollowsChange: vi.fn(), onTurnOn: vi.fn(), onEdit: vi.fn(),
  statusAt: () => null, capPercent: 40, ...over,
});

describe('useScheduleSliderProps', () => {
  it('gives nothing without a binding', () => {
    const { result } = renderHook(() => useScheduleSliderProps(undefined, 80));
    expect(result.current).toEqual({ sun: null, marker: undefined, fillCap: undefined, markerTooltip: undefined });
  });

  it('caps below the slider: marker, dimmed fill and the explanation', () => {
    const { result } = renderHook(() => useScheduleSliderProps(binding(), 80));
    expect(result.current.marker).toBe(40);
    expect(result.current.fillCap).toBe(40);
    expect(result.current.markerTooltip).toBe('lighting.schedule.marker.capped:{"level":40}');
  });

  it('keeps the marker but not the dimmed fill when the cap is above the slider', () => {
    const { result } = renderHook(() => useScheduleSliderProps(binding({ capPercent: 90 }), 60));
    expect(result.current.marker).toBe(90);
    expect(result.current.fillCap).toBeUndefined();
  });

  it('shows no marker while the schedule is off or the control does not follow', () => {
    const { result } = renderHook(() => useScheduleSliderProps(binding({ capPercent: null }), 80));
    expect(result.current.marker).toBeUndefined();
    expect(result.current.markerTooltip).toBeUndefined();
    expect(result.current.sun).not.toBeNull();
  });
});

describe('SettingSlider with a schedule binding', () => {
  const caret = () => document.querySelector('[class*="markerCaret"]');

  it('draws the sun and the caret, and explains the caret on hover', async () => {
    render(<SettingSlider label="Brightness" value={80} min={0} max={100} onChange={() => {}} schedule={binding()} />);
    expect(screen.getByRole('button', { name: 'lighting.schedule.marker.title' })).toBeInTheDocument();
    expect(caret()).not.toBeNull();
    fireEvent.pointerEnter(caret()!.parentElement!);
    await waitFor(() => expect(screen.getByText('lighting.schedule.marker.capped:{"level":40}')).toBeInTheDocument());
  });

  it('draws no caret when the device does not follow', () => {
    render(<SettingSlider label="Brightness" value={80} min={0} max={100} onChange={() => {}} schedule={binding({ capPercent: null })} />);
    expect(caret()).toBeNull();
  });
});

describe('BrightnessScheduleButton popover', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('refreshes on open and recomputes the status line while it stays open', () => {
    vi.useFakeTimers();
    let level = 27;
    const onOpen = vi.fn();
    render(<BrightnessScheduleButton binding={binding({ onOpen, statusAt: () => `now ${level}` })} sliderValue={80} />);
    fireEvent.click(screen.getByRole('button', { name: 'lighting.schedule.marker.title' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(screen.getByText('now 27')).toBeInTheDocument();
    level = 30;
    act(() => { vi.advanceTimersByTime(15_000); });
    expect(screen.getByText('now 30')).toBeInTheDocument();
  });
});
