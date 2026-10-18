import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrightnessScheduleModal } from './BrightnessScheduleModal';

const api = vi.hoisted(() => ({
  fetchIdleDim: vi.fn(),
  setIdleDim: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../../api/lighting', () => api);
const topic = vi.hoisted(() => ({ fire: () => {} }));
vi.mock('../../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: (_topic: string, _enabled: boolean, cb: () => void) => { topic.fire = cb; },
}));
vi.mock('../../../hooks/useUiSettings', () => ({
  useUnitPrefs: () => ({ timeFormat: '24h', numberFormat: 'dot' }),
}));
vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    language: 'en',
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${Object.values(vars).join(',')}` : key),
  }),
}));

interface Place { lat: number; lon: number; label: string; cc: string }
const OSLO: Place = { lat: 59.913, lon: 10.752, label: 'Oslo, NO', cc: 'NO' };
const SINGAPORE: Place = { lat: 1.29, lon: 103.85, label: 'Singapore, SG', cc: 'SG' };

vi.mock('../../../panel/widgets/weather/useWeatherPrefs', () => ({
  useWeatherPrefs: () => ({ prefs: { unit: 'auto', locations: [{ lat: 59.913, lon: 10.752, label: 'Oslo, NO', cc: 'NO' }] } }),
}));
vi.mock('../../../panel/widgets/weather/WeatherLocationSearch', () => ({
  WeatherLocationSearch: ({ onSelect }: { onSelect: (r: unknown) => void }) => (
    <button type="button" onClick={() => onSelect({ name: 'Rome', admin1: '', country: 'Italy', countryCode: 'IT', latitude: 41.9, longitude: 12.5 })}>
      search-pick
    </button>
  ),
}));

const scheduleState = {
  schedule: { enabled: false, points: [{ hour: 0, brightness: 20 }, { hour: 12, brightness: 100 }] },
  defaults: [],
  current: null,
  minute: 0,
  sunShift: true,
  location: null as Place | null,
  sun: { status: 'no-location', date: '2026-03-05', sunriseMin: null, sunsetMin: null, sunPoints: [], resolvedLocation: null, autoLocation: null } as Record<string, unknown> | null,
  sunPoints: null as { hour: number; brightness: number }[] | null,
  saveSun: vi.fn().mockResolvedValue(undefined),
  save: vi.fn(),
};

const idle = (over: Record<string, unknown> = {}) => ({
  enabled: true, timeoutSeconds: 0, level: 10, supported: true, screenOffSupported: true,
  osScreenOffSeconds: 10800, ...over,
});

const open = async (state: Record<string, unknown>) => {
  api.fetchIdleDim.mockResolvedValue(state);
  render(<BrightnessScheduleModal open onClose={() => {}} state={scheduleState} />);
  await waitFor(() => expect(api.fetchIdleDim).toHaveBeenCalled());
};

const SUN_OK = {
  status: 'ok', date: '2026-03-05', sunriseMin: 420, sunsetMin: 1140, resolvedLocation: OSLO, autoLocation: SINGAPORE,
  sunPoints: [{ min: 420, brightness: 30 }, { min: 540, brightness: 100 }],
};
const withState = (over: Record<string, unknown>) => {
  api.fetchIdleDim.mockResolvedValue(idle({ supported: false }));
  render(<BrightnessScheduleModal open onClose={() => {}} state={{ ...scheduleState, ...over }} />);
};
const graphHandles = () => document.querySelectorAll('circle[class*="curvePoint"]');

const timeoutTrigger = () => screen.getByRole('button', { name: 'lighting.idleDim.timeout.label' });

describe('BrightnessScheduleModal idle dimming', () => {
  beforeEach(() => {
    api.fetchIdleDim.mockReset();
    api.setIdleDim.mockReset().mockResolvedValue(null);
  });

  it('hides the whole section when the platform does not support it', async () => {
    await open(idle({ supported: false }));
    // Let the resolved fetch land in state before asserting absence.
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.queryByRole('switch', { name: 'lighting.idleDim.enable.label' })).not.toBeInTheDocument();
  });

  it('hides the dropdown and slider while the toggle is off', async () => {
    await open(idle({ enabled: false }));
    expect(await screen.findByRole('switch', { name: 'lighting.idleDim.enable.label' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByRole('button', { name: 'lighting.idleDim.timeout.label' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('lighting.idleDim.level.label')).not.toBeInTheDocument();
  });

  it('names the OS screen-off time on the default option', async () => {
    await open(idle());
    await screen.findByRole('switch', { name: 'lighting.idleDim.enable.label' });
    expect(timeoutTrigger()).toHaveTextContent('lighting.idleDim.timeout.screenOffAfter:slideshow.hours.other:3');
  });

  it('says the OS never turns the screen off when the value is 0', async () => {
    await open(idle({ osScreenOffSeconds: 0 }));
    await screen.findByRole('switch', { name: 'lighting.idleDim.enable.label' });
    expect(timeoutTrigger()).toHaveTextContent('lighting.idleDim.timeout.screenOffNever');
    expect(screen.getByText('lighting.idleDim.timeout.neverNote')).toBeInTheDocument();
  });

  it('shows the plain default option when the OS value is unknown', async () => {
    await open(idle({ osScreenOffSeconds: null }));
    await screen.findByRole('switch', { name: 'lighting.idleDim.enable.label' });
    expect(timeoutTrigger()).toHaveTextContent('lighting.idleDim.timeout.screenOff');
    expect(timeoutTrigger()).not.toHaveTextContent('screenOffAfter');
    expect(screen.queryByText('lighting.idleDim.timeout.neverNote')).not.toBeInTheDocument();
  });

  it('saves the toggle', async () => {
    await open(idle({ enabled: false, level: 25, timeoutSeconds: 300 }));
    fireEvent.click(await screen.findByRole('switch', { name: 'lighting.idleDim.enable.label' }));
    expect(api.setIdleDim).toHaveBeenCalledWith({ enabled: true, timeoutSeconds: 300, level: 25 });
  });

  it('saves a picked timeout', async () => {
    await open(idle());
    await screen.findByRole('switch', { name: 'lighting.idleDim.enable.label' });
    fireEvent.click(timeoutTrigger());
    fireEvent.click(screen.getByRole('option', { name: 'slideshow.minutes.other:5' }));
    expect(api.setIdleDim).toHaveBeenCalledWith({ enabled: true, timeoutSeconds: 300, level: 10 });
  });

  it('saves the level when the slider commits', async () => {
    await open(idle());
    await screen.findByRole('switch', { name: 'lighting.idleDim.enable.label' });
    const slider = screen.getByRole('slider', { name: 'lighting.idleDim.level.label' });
    fireEvent.change(slider, { target: { value: '40' } });
    fireEvent.pointerUp(slider);
    await waitFor(() => expect(api.setIdleDim).toHaveBeenCalledWith({ enabled: true, timeoutSeconds: 0, level: 40 }));
  });

  describe('where the display-off event is unavailable', () => {
    it('hides that option and shows ten minutes for a stored 0', async () => {
      await open(idle({ screenOffSupported: false, osScreenOffSeconds: null }));
      await screen.findByRole('switch', { name: 'lighting.idleDim.enable.label' });
      expect(timeoutTrigger()).toHaveTextContent('slideshow.minutes.other:10');
      fireEvent.click(timeoutTrigger());
      expect(screen.queryByRole('option', { name: /lighting\.idleDim\.timeout\.screenOff/ })).not.toBeInTheDocument();
    });

    it('sends 600, never 0, when the toggle is turned on', async () => {
      await open(idle({ enabled: false, screenOffSupported: false, osScreenOffSeconds: null }));
      fireEvent.click(await screen.findByRole('switch', { name: 'lighting.idleDim.enable.label' }));
      expect(api.setIdleDim).toHaveBeenCalledWith({ enabled: true, timeoutSeconds: 600, level: 10 });
    });
  });
  it('shows an off-list stored timeout snapped but saves the stored value', async () => {
    await open(idle({ enabled: false, timeoutSeconds: 240 }));
    fireEvent.click(await screen.findByRole('switch', { name: 'lighting.idleDim.enable.label' }));
    expect(api.setIdleDim).toHaveBeenCalledWith({ enabled: true, timeoutSeconds: 240, level: 10 });
    expect(timeoutTrigger()).toHaveTextContent('slideshow.minutes.other:3');
  });

  it('does not re-fetch after a successful save', async () => {
    await open(idle({ enabled: false }));
    api.setIdleDim.mockResolvedValue({ error: false, msg: '' });
    api.fetchIdleDim.mockClear();
    fireEvent.click(await screen.findByRole('switch', { name: 'lighting.idleDim.enable.label' }));
    await waitFor(() => expect(api.setIdleDim).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(api.fetchIdleDim).not.toHaveBeenCalled();
  });

  it('drops a GET that was in flight when a save happened', async () => {
    await open(idle({ enabled: false }));
    api.setIdleDim.mockResolvedValue({ error: false, msg: '' });
    let resolveLate: (v: unknown) => void = () => {};
    api.fetchIdleDim.mockReset().mockReturnValueOnce(new Promise(r => { resolveLate = r; }));
    await act(async () => { topic.fire(); });
    fireEvent.click(await screen.findByRole('switch', { name: 'lighting.idleDim.enable.label' }));
    await act(async () => { resolveLate(idle({ enabled: false })); await Promise.resolve(); });
    expect(screen.getByRole('switch', { name: 'lighting.idleDim.enable.label' })).toHaveAttribute('aria-checked', 'true');
  });

  it('re-fetches when a save fails, since no topic push follows', async () => {
    await open(idle({ enabled: false }));
    api.setIdleDim.mockResolvedValue(null);
    api.fetchIdleDim.mockClear();
    fireEvent.click(await screen.findByRole('switch', { name: 'lighting.idleDim.enable.label' }));
    await waitFor(() => expect(api.fetchIdleDim).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'lighting.idleDim.enable.label' })).toHaveAttribute('aria-checked', 'false'));
  });

  it('survives a rejected save', async () => {
    await open(idle({ enabled: false }));
    api.setIdleDim.mockRejectedValue(new Error('bad body'));
    api.fetchIdleDim.mockClear();
    fireEvent.click(await screen.findByRole('switch', { name: 'lighting.idleDim.enable.label' }));
    await waitFor(() => expect(api.fetchIdleDim).toHaveBeenCalledTimes(1));
  });

  it('keeps the dragged level when a topic push lands mid-drag', async () => {
    await open(idle({ level: 10 }));
    await screen.findByRole('switch', { name: 'lighting.idleDim.enable.label' });
    const slider = screen.getByRole('slider', { name: 'lighting.idleDim.level.label' });
    fireEvent.change(slider, { target: { value: '40' } });
    api.fetchIdleDim.mockClear();
    await act(async () => { topic.fire(); await Promise.resolve(); });
    expect(api.fetchIdleDim).not.toHaveBeenCalled();
    expect(slider).toHaveValue('40');
    fireEvent.pointerUp(slider);
    await waitFor(() => expect(api.setIdleDim).toHaveBeenCalledWith({ enabled: true, timeoutSeconds: 0, level: 40 }));
  });

  describe('without the display-off event', () => {
    const linux = { screenOffSupported: false, osScreenOffSeconds: null };

    it('never sends 0 when a timeout is picked', async () => {
      await open(idle(linux));
      await screen.findByRole('switch', { name: 'lighting.idleDim.enable.label' });
      fireEvent.click(timeoutTrigger());
      fireEvent.click(screen.getByRole('option', { name: 'slideshow.minutes.other:5' }));
      expect(api.setIdleDim).toHaveBeenCalledWith({ enabled: true, timeoutSeconds: 300, level: 10 });
    });

    it('never sends 0 when the level commits', async () => {
      await open(idle(linux));
      await screen.findByRole('switch', { name: 'lighting.idleDim.enable.label' });
      const slider = screen.getByRole('slider', { name: 'lighting.idleDim.level.label' });
      fireEvent.change(slider, { target: { value: '40' } });
      fireEvent.pointerUp(slider);
      await waitFor(() => expect(api.setIdleDim).toHaveBeenCalledWith({ enabled: true, timeoutSeconds: 600, level: 40 }));
    });
  });
});

describe('BrightnessScheduleModal sunset shift', () => {
  beforeEach(() => {
    scheduleState.saveSun.mockClear();
    scheduleState.save.mockClear();
  });

  it('lists Follow the schedule first, then Sunset shift', () => {
    withState({});
    const names = screen.getAllByRole('switch').map(el => el.getAttribute('aria-label'));
    expect(names.slice(0, 2)).toEqual(['lighting.schedule.enable.label', 'lighting.schedule.sun.label']);
  });

  it('shows the toggle on and saves the flip immediately', async () => {
    withState({ sunShift: true });
    const toggle = screen.getByRole('switch', { name: 'lighting.schedule.sun.label' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(toggle);
    expect(scheduleState.saveSun).toHaveBeenCalledWith({ sunShift: false });
  });

  it('turns the shift on from off', () => {
    withState({ sunShift: false });
    fireEvent.click(screen.getByRole('switch', { name: 'lighting.schedule.sun.label' }));
    expect(scheduleState.saveSun).toHaveBeenCalledWith({ sunShift: true });
  });

  it('keeps the location row in place but disabled while off, so the modal does not resize', () => {
    withState({ sunShift: false, sun: SUN_OK });
    expect(screen.getByRole('button', { name: 'lighting.schedule.sun.location' })).toBeDisabled();
    expect(screen.getByText('search-pick')).toBeInTheDocument();
    expect(screen.getByText(/lighting\.schedule\.sun\.times:/)).toBeInTheDocument();
  });

  it('keeps both graph hint lines mounted so either state sizes the same block', () => {
    withState({ sunShift: false });
    expect(screen.getByText('lighting.schedule.graph.hint')).not.toHaveAttribute('data-hidden');
    expect(screen.getByText('lighting.schedule.sun.editNote')).toHaveAttribute('data-hidden');
  });

  it('names the IP-resolved place under Auto, not the chosen one', () => {
    withState({ sunShift: true, location: OSLO, sun: SUN_OK });
    fireEvent.click(screen.getByRole('button', { name: 'lighting.schedule.sun.location' }));
    const auto = screen.getByRole('option', { name: /locationAutoNamed/ });
    expect(auto).toHaveTextContent('Singapore, SG');
    expect(auto).not.toHaveTextContent('Oslo');
  });

  it('says plain Auto when the service could not place the PC', () => {
    withState({ sunShift: true, location: null, sun: { ...SUN_OK, autoLocation: null } });
    fireEvent.click(screen.getByRole('button', { name: 'lighting.schedule.sun.location' }));
    expect(screen.getByRole('option', { name: 'lighting.schedule.sun.locationAuto' })).toBeInTheDocument();
  });

  it('saves a picked place, Auto as null, and a searched result', () => {
    withState({ sunShift: true, location: OSLO, sun: SUN_OK });
    const trigger = screen.getByRole('button', { name: 'lighting.schedule.sun.location' });
    expect(trigger).toHaveTextContent('Oslo, NO');
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('option', { name: /lighting\.schedule\.sun\.locationAutoNamed/ }));
    expect(scheduleState.saveSun).toHaveBeenLastCalledWith({ location: null });

    fireEvent.click(screen.getByText('search-pick'));
    expect(scheduleState.saveSun).toHaveBeenLastCalledWith({
      location: { lat: 41.9, lon: 12.5, label: 'Rome, IT', cc: 'IT' },
    });
  });

  it('selects a saved place from the list', () => {
    withState({ sunShift: true, location: null, sun: SUN_OK });
    fireEvent.click(screen.getByRole('button', { name: 'lighting.schedule.sun.location' }));
    fireEvent.click(screen.getByRole('option', { name: 'Oslo, NO' }));
    expect(scheduleState.saveSun).toHaveBeenLastCalledWith({ location: OSLO });
  });

  it('shows read-only sun curve, markers, times and disabled reset when it applies', () => {
    withState({
      sunShift: true, sun: SUN_OK, sunPoints: [{ hour: 7, brightness: 30 }, { hour: 9, brightness: 100 }],
      defaults: [{ hour: 0, brightness: 10 }, { hour: 12, brightness: 100 }],
    });
    expect(screen.getByText('lighting.schedule.sun.editNote')).toBeInTheDocument();
    expect(screen.getByText(/lighting\.schedule\.sun\.times:/)).toBeInTheDocument();
    expect(screen.getAllByText(/7:00/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('button', { name: 'lighting.schedule.reset' })).toBeDisabled();
    expect(graphHandles().length).toBeGreaterThan(0);
    expect(graphHandles()[0]).not.toHaveStyle({ cursor: 'grab' });
  });

  it.each([
    ['polar-day', 'lighting.schedule.sun.polarDay'],
    ['polar-night', 'lighting.schedule.sun.polarNight'],
    ['no-location', 'lighting.schedule.sun.noLocation'],
  ])('keeps the user curve editable and explains %s', (status, key) => {
    withState({
      sunShift: true, sunPoints: null, defaults: [{ hour: 0, brightness: 10 }, { hour: 12, brightness: 100 }],
      sun: { ...SUN_OK, status, sunriseMin: null, sunsetMin: null, sunPoints: [] },
    });
    expect(screen.getByText(key)).toBeInTheDocument();
    expect(screen.getByText('lighting.schedule.sun.editNote')).toHaveAttribute('data-hidden');
    expect(graphHandles()[0]).toHaveStyle({ cursor: 'grab' });
    expect(screen.getByRole('button', { name: 'lighting.schedule.reset' })).toBeEnabled();
  });

  it('shows the editable custom curve with a reset when off', () => {
    withState({ sunShift: false, sun: SUN_OK, sunPoints: null, defaults: [{ hour: 0, brightness: 10 }, { hour: 12, brightness: 100 }] });
    expect(graphHandles()[0]).toHaveStyle({ cursor: 'grab' });
    fireEvent.click(screen.getByRole('button', { name: 'lighting.schedule.reset' }));
    expect(scheduleState.save).toHaveBeenCalledWith({ enabled: false, points: [{ hour: 0, brightness: 10 }, { hour: 12, brightness: 100 }] });
    expect(scheduleState.saveSun).not.toHaveBeenCalled();
  });
});
