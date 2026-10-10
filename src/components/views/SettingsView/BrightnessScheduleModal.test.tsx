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

const scheduleState = {
  schedule: { enabled: false, points: [{ hour: 0, brightness: 20 }, { hour: 12, brightness: 100 }] },
  defaults: [],
  current: null,
  minute: 0,
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
  it('snaps an off-list stored timeout to the nearest option', async () => {
    await open(idle({ timeoutSeconds: 240 }));
    await screen.findByRole('switch', { name: 'lighting.idleDim.enable.label' });
    expect(timeoutTrigger()).toHaveTextContent('slideshow.minutes.other:3');
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
