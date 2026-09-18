import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GlobalBrightnessSlider } from './GlobalBrightnessSlider';

// While the brightness schedule is on, the master slider carries a marker at
// the scheduled level with an (i) that names the cap and opens the schedule.

const api = vi.hoisted(() => ({
  fetchGlobalBrightness: vi.fn(),
  setGlobalBrightness: vi.fn().mockResolvedValue(null),
  fetchBrightnessSchedule: vi.fn(),
  setBrightnessSchedule: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../../../api/lighting', () => api);
vi.mock('../../../../hooks/useMultiplexSocket', () => ({ useTopicCallback: () => {} }));
vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  }),
}));

const schedule = (enabled: boolean, level: number) => ({
  enabled,
  // A flat curve, so the level is the same whatever the wall clock says.
  points: [{ hour: 0, brightness: level }, { hour: 12, brightness: level }],
  defaults: [],
});

describe('GlobalBrightnessSlider schedule marker', () => {
  beforeEach(() => {
    api.fetchGlobalBrightness.mockReset().mockResolvedValue({ value: 0.8 });
    api.fetchBrightnessSchedule.mockReset();
  });

  it('shows no marker while the schedule is off', async () => {
    api.fetchBrightnessSchedule.mockResolvedValue(schedule(false, 40));
    render(<GlobalBrightnessSlider serviceOnline onOpenSchedule={() => {}} />);
    await screen.findByRole('slider');
    expect(screen.queryByRole('button', { name: 'lighting.schedule.marker.title' })).toBeNull();
  });

  it('names the cap when the schedule is below the slider and opens the schedule on click', async () => {
    api.fetchBrightnessSchedule.mockResolvedValue(schedule(true, 40));
    const onOpen = vi.fn();
    render(<GlobalBrightnessSlider serviceOnline onOpenSchedule={onOpen} />);
    const marker = await screen.findByRole('button', { name: 'lighting.schedule.marker.title' });

    fireEvent.pointerEnter(marker);
    await waitFor(() => expect(screen.getByText('lighting.schedule.marker.capping:{"level":40}')).toBeInTheDocument());

    fireEvent.click(marker);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('keeps the label click and the accessible name on the range, not the (i)', async () => {
    api.fetchBrightnessSchedule.mockResolvedValue(schedule(true, 40));
    const onOpen = vi.fn();
    render(<GlobalBrightnessSlider serviceOnline onOpenSchedule={onOpen} />);
    await screen.findByRole('button', { name: 'lighting.schedule.marker.title' });

    // The stacked slider is a <label>: a real <button> in it would become the
    // labelled control and swallow clicks on the label text.
    fireEvent.click(screen.getByText('lighting.settings.brightnessLabel'));
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.getByRole('slider', { name: 'lighting.settings.brightnessLabel' })).toBeInTheDocument();
  });

  it('says what the schedule allows when it sits above the slider', async () => {
    api.fetchBrightnessSchedule.mockResolvedValue(schedule(true, 100));
    render(<GlobalBrightnessSlider serviceOnline onOpenSchedule={() => {}} />);
    const marker = await screen.findByRole('button', { name: 'lighting.schedule.marker.title' });

    fireEvent.pointerEnter(marker);
    await waitFor(() => expect(screen.getByText('lighting.schedule.marker.allowing:{"level":100}')).toBeInTheDocument());
  });
});
