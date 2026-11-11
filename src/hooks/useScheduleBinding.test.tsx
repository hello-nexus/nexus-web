import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useScheduleBinding } from './useScheduleBinding';
import type { BrightnessScheduleState } from './useBrightnessSchedule';

vi.mock('../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  }),
}));
vi.mock('./useUiSettings', () => ({ useUnitPrefs: () => ({ timeFormat: '24h' }) }));

const POINTS = [
  { hour: 0, brightness: 10 }, { hour: 7, brightness: 10 }, { hour: 9, brightness: 100 },
  { hour: 19, brightness: 100 }, { hour: 22, brightness: 10 },
];

const make = (over: Partial<BrightnessScheduleState> = {}): BrightnessScheduleState => ({
  schedule: { enabled: true, points: POINTS }, defaults: [], current: 100, minute: 14 * 60,
  sunShift: false, location: null, sun: null, sunPoints: null, sunLevels: { night: 10, day: 100 },
  lightingFollows: true, saveSun: vi.fn(), saveLightingFollows: vi.fn(), save: vi.fn().mockResolvedValue(undefined),
  ...over,
});

const bind = (state: BrightnessScheduleState, extra: { follows?: boolean; capsSlider?: boolean } = {}) =>
  renderHook(() => useScheduleBinding({
    state, follows: extra.follows ?? true, onFollowsChange: vi.fn(), onEdit: vi.fn(),
    capsSlider: extra.capsSlider,
  })).result.current;

describe('useScheduleBinding', () => {
  const AFTERNOON = 14 * 60;

  it('has no status line while the schedule is off', () => {
    const b = bind(make({ schedule: { enabled: false, points: POINTS }, current: null }));
    expect(b.scheduleOn).toBe(false);
    expect(b.statusAt(AFTERNOON, 80)).toBeNull();
  });

  it('names when the change starts, not the next point', () => {
    expect(bind(make()).statusAt(AFTERNOON, null)).toBe('lighting.schedule.status.fallsAt:{"level":100,"time":"19:00"}');
  });

  it('shows a device the lower of its slider and the schedule level', () => {
    const b = bind(make(), { capsSlider: true });
    expect(b.statusAt(AFTERNOON, 30)).toBe('lighting.schedule.status.fallsAt:{"level":30,"time":"19:00"}');
    expect(b.statusAt(AFTERNOON, 100)).toContain('"level":100');
  });

  it('is live: the same binding answers for a later minute', () => {
    const b = bind(make(), { capsSlider: true });
    // 22:00 onward the curve sits at its night level, below the slider.
    expect(b.statusAt(23 * 60, 80)).toContain('"level":10');
    expect(b.statusAt(AFTERNOON, 80)).toContain('"level":80');
  });

  it('shows lighting the schedule level whatever the slider says', () => {
    expect(bind(make()).statusAt(AFTERNOON, 30)).toContain('"level":100');
  });

  it('shows the schedule level for a device that does not follow', () => {
    expect(bind(make(), { follows: false, capsSlider: true }).statusAt(AFTERNOON, 30)).toContain('"level":100');
  });

  it('says the ramp end while the curve is moving', () => {
    expect(bind(make()).statusAt(8 * 60, null)).toMatch(/^lighting\.schedule\.status\.rising:\{"level":\d+,"time":"09:00"\}$/);
  });

  it('says steady for a flat schedule', () => {
    const b = bind(make({ schedule: { enabled: true, points: [{ hour: 0, brightness: 40 }, { hour: 12, brightness: 40 }] }, current: 40 }));
    expect(b.statusAt(AFTERNOON, null)).toBe('lighting.schedule.status.steady:{"level":40}');
  });

  it('turns the master schedule on, keeping its points', () => {
    const state = make({ schedule: { enabled: false, points: POINTS }, current: null });
    bind(state).onTurnOn();
    expect(state.save).toHaveBeenCalledWith({ enabled: true, points: POINTS });
  });

  it('caps at the schedule level from the local curve', () => {
    expect(bind(make({ current: 64 })).capPercent).toBe(64);
  });

  it('has no cap while the schedule is off or the control does not follow', () => {
    expect(bind(make({ schedule: { enabled: false, points: POINTS }, current: null })).capPercent).toBeNull();
    expect(bind(make(), { follows: false }).capPercent).toBeNull();
  });
});
