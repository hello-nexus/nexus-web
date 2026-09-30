import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GlobalBrightnessSlider } from './GlobalBrightnessSlider';

// The master slider's label carries a clock that opens the brightness
// schedule editor; while the schedule is on, it also names the cap.

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

  it('offers the schedule while it is off and opens the editor in place', async () => {
    api.fetchBrightnessSchedule.mockResolvedValue(schedule(false, 40));
    render(<GlobalBrightnessSlider serviceOnline />);
    const marker = await screen.findByRole('button', { name: 'lighting.schedule.marker.title' });
    await waitFor(() => expect(marker).not.toHaveAttribute('aria-disabled'));
    expect(marker).not.toHaveAttribute('data-active');

    fireEvent.pointerEnter(marker);
    await waitFor(() => expect(screen.getByText('lighting.schedule.now.off')).toBeInTheDocument());

    // Default prevented: the press leaves focus where it was.
    expect(fireEvent.mouseDown(marker)).toBe(false);
    fireEvent.click(marker);
    expect(await screen.findByText('lighting.schedule.enable.label')).toBeInTheDocument();
  });

  it('names the cap when the schedule is below the slider', async () => {
    api.fetchBrightnessSchedule.mockResolvedValue(schedule(true, 40));
    render(<GlobalBrightnessSlider serviceOnline />);
    const marker = await screen.findByRole('button', { name: 'lighting.schedule.marker.title' });
    await waitFor(() => expect(marker).toHaveAttribute('data-active'));

    fireEvent.pointerEnter(marker);
    await waitFor(() => expect(screen.getByText('lighting.schedule.marker.capping:{"level":40}')).toBeInTheDocument());
  });

  it('keeps the label click and the accessible name on the range, not the clock', async () => {
    api.fetchBrightnessSchedule.mockResolvedValue(schedule(true, 40));
    render(<GlobalBrightnessSlider serviceOnline />);
    await screen.findByRole('button', { name: 'lighting.schedule.marker.title' });

    // The stacked slider is a <label>: a real <button> in it would become the
    // labelled control and swallow clicks on the label text.
    fireEvent.click(screen.getByText('lighting.settings.brightnessLabel'));
    expect(screen.queryByText('lighting.schedule.enable.label')).toBeNull();
    expect(screen.getByRole('slider', { name: 'lighting.settings.brightnessLabel' })).toBeInTheDocument();
  });

  it('says what the schedule allows when it sits above the slider', async () => {
    api.fetchBrightnessSchedule.mockResolvedValue(schedule(true, 100));
    render(<GlobalBrightnessSlider serviceOnline />);
    const marker = await screen.findByRole('button', { name: 'lighting.schedule.marker.title' });

    fireEvent.pointerEnter(marker);
    await waitFor(() => expect(screen.getByText('lighting.schedule.marker.allowing:{"level":100}')).toBeInTheDocument());
  });
});
