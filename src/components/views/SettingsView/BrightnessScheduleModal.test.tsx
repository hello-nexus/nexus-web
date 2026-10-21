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
  schedule: { enabled: true, points: [{ hour: 0, brightness: 20 }, { hour: 12, brightness: 100 }] },
  defaults: [],
  current: null,
  minute: 0,
  sunShift: true,
  sunLevels: { night: 10, day: 100 },
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
const SUN6 = [
  { hour: 6, brightness: 10 }, { hour: 7, brightness: 55 }, { hour: 9, brightness: 100 },
  { hour: 17, brightness: 100 }, { hour: 19, brightness: 55 }, { hour: 20, brightness: 10 },
];
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

  it('lists Follow the schedule first, then Daylight sync', () => {
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
    expect(screen.queryByText(/lighting\.schedule\.sun\.times/)).not.toBeInTheDocument();
  });

  it('keeps both graph hint lines mounted so either state sizes the same block', () => {
    withState({ sunShift: false, sun: SUN_OK });
    expect(screen.getByText('lighting.schedule.graph.hint')).not.toHaveAttribute('data-hidden');
    expect(screen.getByText(/lighting\.schedule\.sun\.editNote:/)).toHaveAttribute('data-hidden');
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

  it('puts the sun times in the hint and drops the separate times line', () => {
    withState({ sunShift: true, sun: SUN_OK, sunPoints: SUN6 });
    expect(screen.getByText('lighting.schedule.sun.editNote:07:00,19:00')).not.toHaveAttribute('data-hidden');
    expect(screen.getByText('lighting.schedule.graph.hint')).toHaveAttribute('data-hidden');
    expect(screen.queryByText(/lighting\.schedule\.sun\.times/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/07:00/).length).toBeGreaterThanOrEqual(2);
  });

  it('locks the sunrise and sunset points and leaves night and day draggable in sun mode', () => {
    withState({ sunShift: true, sun: SUN_OK, sunPoints: SUN6 });
    const cursors = Array.from(graphHandles()).map(h => (h as SVGElement).style.cursor);
    expect(cursors).toEqual(['ns-resize', '', 'ns-resize', 'ns-resize', '', 'ns-resize']);
  });

  describe('dragging a level in sun mode', () => {
    const drag = (index: number, clientY: number) => {
      const handle = graphHandles()[index];
      fireEvent.pointerDown(handle);
      fireEvent.pointerMove(handle, { clientX: 100, clientY });
      fireEvent.pointerUp(handle);
    };
    // Chart height 124 from y 8: speed s sits at y = 132 - 1.24 * s.
    const yFor = (speed: number) => 132 - 1.24 * speed;

    beforeEach(() => {
      vi.spyOn(SVGSVGElement.prototype, 'getBoundingClientRect')
        .mockReturnValue({ left: 0, top: 0, width: 400, height: 140, right: 400, bottom: 140, x: 0, y: 0, toJSON: () => ({}) });
      Element.prototype.setPointerCapture = vi.fn();
    });

    it('moves Night from either night point and saves only sunNight', () => {
      withState({ sunShift: true, sun: SUN_OK, sunPoints: SUN6 });
      drag(0, yFor(40));
      expect(scheduleState.saveSun).toHaveBeenCalledWith({ sunNight: 40 });
    });

    it('moves Day from either day point and saves only sunDay', () => {
      withState({ sunShift: true, sun: SUN_OK, sunPoints: SUN6 });
      drag(3, yFor(70));
      expect(scheduleState.saveSun).toHaveBeenCalledWith({ sunDay: 70 });
    });

    it('keeps Night at or below Day', () => {
      withState({ sunShift: true, sun: SUN_OK, sunPoints: SUN6, sunLevels: { night: 10, day: 60 } });
      drag(0, yFor(90));
      expect(scheduleState.saveSun).toHaveBeenCalledWith({ sunNight: 60 });
    });

    it('does nothing when a locked sunrise point is dragged', () => {
      withState({ sunShift: true, sun: SUN_OK, sunPoints: SUN6 });
      drag(1, yFor(20));
      expect(scheduleState.saveSun).not.toHaveBeenCalled();
    });

    it('moves Day from a day point on a sun that sets before it rises on the clock', () => {
      const wrapped = { ...SUN_OK, sunriseMin: 1290, sunsetMin: 710 };
      const points = [590, 710, 770, 1230, 1290, 1410].map((min, i) => ({ hour: min / 60, brightness: [100, 55, 10, 10, 55, 100][i] }));
      withState({ sunShift: true, sun: wrapped, sunPoints: points });
      drag(0, yFor(70));
      expect(scheduleState.saveSun).toHaveBeenCalledWith({ sunDay: 70 });
    });

    it('resets Night and Day to 10 and 100, enabled only when they differ', () => {
      withState({ sunShift: true, sun: SUN_OK, sunPoints: SUN6, sunLevels: { night: 20, day: 80 }, defaults: [{ hour: 0, brightness: 5 }, { hour: 12, brightness: 90 }] });
      fireEvent.click(screen.getByRole('button', { name: 'lighting.schedule.reset' }));
      expect(scheduleState.saveSun).toHaveBeenCalledWith({ sunNight: 10, sunDay: 100 });
      expect(scheduleState.save).not.toHaveBeenCalled();
    });
  });

  it('disables Reset in sun mode while the levels are the defaults', () => {
    withState({ sunShift: true, sun: SUN_OK, sunPoints: SUN6 });
    expect(screen.getByRole('button', { name: 'lighting.schedule.reset' })).toBeDisabled();
  });

  it.each([
    ['polar-day', 'lighting.schedule.sun.polarDay'],
    ['polar-night', 'lighting.schedule.sun.polarNight'],
    ['no-location', 'lighting.schedule.sun.noLocation'],
  ])('keeps the user curve editable and puts the %s note in the hint spot', (status, key) => {
    withState({
      sunShift: true, sunPoints: null, defaults: [{ hour: 0, brightness: 10 }, { hour: 12, brightness: 100 }],
      sun: { ...SUN_OK, status, sunriseMin: null, sunsetMin: null, sunPoints: [] },
    });
    expect(screen.getByText(key)).not.toHaveAttribute('data-hidden');
    expect(screen.getByText('lighting.schedule.graph.hint')).toHaveAttribute('data-hidden');
    expect(graphHandles()[0]).toHaveStyle({ cursor: 'grab' });
    expect(screen.getByRole('button', { name: 'lighting.schedule.reset' })).toBeEnabled();
  });

  it('shows the editable custom curve with a reset when off', () => {
    withState({ sunShift: false, sun: SUN_OK, sunPoints: null, defaults: [{ hour: 0, brightness: 10 }, { hour: 12, brightness: 100 }] });
    expect(graphHandles()[0]).toHaveStyle({ cursor: 'grab' });
    fireEvent.click(screen.getByRole('button', { name: 'lighting.schedule.reset' }));
    expect(scheduleState.save).toHaveBeenCalledWith({ enabled: true, points: [{ hour: 0, brightness: 10 }, { hour: 12, brightness: 100 }] });
    expect(scheduleState.saveSun).not.toHaveBeenCalled();
  });

  describe('with Follow the schedule off', () => {
    const off = { schedule: { enabled: false, points: [{ hour: 0, brightness: 20 }, { hour: 12, brightness: 100 }] }, current: null, sun: SUN_OK, sunPoints: SUN6, defaults: [{ hour: 0, brightness: 5 }, { hour: 12, brightness: 90 }] };

    it('dims and disables the whole schedule without removing it', () => {
      withState(off);
      expect(screen.getByRole('switch', { name: 'lighting.schedule.sun.label' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'lighting.schedule.sun.location' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'lighting.schedule.reset' })).toBeDisabled();
      expect(screen.getByRole('switch', { name: 'lighting.schedule.sun.label' }).closest('[data-off]')).not.toBeNull();
      expect(graphHandles().length).toBe(6);
      for (const h of graphHandles()) expect((h as SVGElement).style.cursor).toBe('');
    });

    it('hides the status line but keeps its space', () => {
      withState(off);
      expect(screen.getByText('lighting.schedule.now.off')).toHaveStyle({ visibility: 'hidden' });
    });

    it('leaves idle dimming active', async () => {
      api.fetchIdleDim.mockResolvedValue(idle());
      render(<BrightnessScheduleModal open onClose={() => {}} state={{ ...scheduleState, ...off }} />);
      expect(await screen.findByRole('switch', { name: 'lighting.idleDim.enable.label' })).toBeEnabled();
    });
  });

  it('shows the status line while the schedule is on', () => {
    withState({ current: 55 });
    expect(screen.getByText('lighting.schedule.now.on:55%')).not.toHaveStyle({ visibility: 'hidden' });
  });
});
