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

const bind = (state: BrightnessScheduleState, extra: { follows?: boolean; appliedPercent?: number | null } = {}) =>
  renderHook(() => useScheduleBinding({
    state, follows: extra.follows ?? true, onFollowsChange: vi.fn(), onEdit: vi.fn(), appliedPercent: extra.appliedPercent,
  })).result.current;

describe('useScheduleBinding', () => {
  it('has no status line while the schedule is off', () => {
    const b = bind(make({ schedule: { enabled: false, points: POINTS }, current: null }));
    expect(b.scheduleOn).toBe(false);
    expect(b.statusLine).toBeNull();
  });

  it('names when the change starts, not the next point', () => {
    const b = bind(make());
    expect(b.statusLine).toBe('lighting.schedule.status.fallsAt:{"level":100,"time":"19:00"}');
  });

  it('shows what the device actually gets when it follows', () => {
    const b = bind(make(), { appliedPercent: 64 });
    expect(b.statusLine).toBe('lighting.schedule.status.fallsAt:{"level":64,"time":"19:00"}');
  });

  it('falls back to the schedule level without an applied value, or when not following', () => {
    expect(bind(make(), { appliedPercent: null }).statusLine).toContain('"level":100');
    expect(bind(make(), { follows: false, appliedPercent: 64 }).statusLine).toContain('"level":100');
  });

  it('says the ramp end while the curve is moving', () => {
    const b = bind(make({ minute: 8 * 60, current: 55 }));
    expect(b.statusLine).toBe('lighting.schedule.status.rising:{"level":55,"time":"09:00"}');
  });

  it('says steady for a flat schedule', () => {
    const b = bind(make({ schedule: { enabled: true, points: [{ hour: 0, brightness: 40 }, { hour: 12, brightness: 40 }] }, current: 40 }));
    expect(b.statusLine).toBe('lighting.schedule.status.steady:{"level":40}');
  });

  it('turns the master schedule on, keeping its points', () => {
    const state = make({ schedule: { enabled: false, points: POINTS }, current: null });
    bind(state).onTurnOn();
    expect(state.save).toHaveBeenCalledWith({ enabled: true, points: POINTS });
  });

  it('caps at the applied level, falling back to the schedule level', () => {
    expect(bind(make(), { appliedPercent: 64 }).capPercent).toBe(64);
    expect(bind(make()).capPercent).toBe(100);
  });

  it('has no cap while the schedule is off or the control does not follow', () => {
    expect(bind(make({ schedule: { enabled: false, points: POINTS }, current: null })).capPercent).toBeNull();
    expect(bind(make(), { follows: false }).capPercent).toBeNull();
  });
});
