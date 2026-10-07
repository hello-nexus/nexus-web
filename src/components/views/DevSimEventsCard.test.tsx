import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DevSimEvents } from '../../api/devSim';
import { DevSimEventsCard } from './DevSimEventsCard';

// A translator with one known key: the rest return the key, like a miss.
const translations = vi.hoisted(() => ({ map: {} as Record<string, string> }));
vi.mock('../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => translations.map[key] ?? key }),
}));

const api = vi.hoisted(() => ({
  fetchDevSimEvents: vi.fn(),
  startDevSim: vi.fn(),
  stopDevSim: vi.fn(),
  clearDevSims: vi.fn(),
}));
vi.mock('../../api/devSim', () => api);

const events = (active: string[] = []): DevSimEvents => ({
  catalog: [
    { id: 'guard.limitTrip', category: 'guard', label: 'Guard limit trip' },
    { id: 'guard.endedTrip', category: 'guard', label: 'Guard ended trip' },
    { id: 'health.fanStall', category: 'health', label: 'Fan stall' },
    { id: 'future.thing', category: 'lab', label: 'Brand new sim' },
  ],
  active: active.map(id => ({ id, startedAtUtcMs: 1 })),
});

describe('DevSimEventsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    translations.map = {};
    api.fetchDevSimEvents.mockResolvedValue(events());
    api.startDevSim.mockImplementation(async (id: string) => events([id]));
    api.stopDevSim.mockImplementation(async () => events());
    api.clearDevSims.mockImplementation(async () => events());
  });

  it('lists the catalog grouped by category, an unknown category after the known ones', async () => {
    render(<DevSimEventsCard />);
    await screen.findByText('Guard limit trip');
    const groups = screen.getAllByRole('region').map(r => r.getAttribute('aria-label'));
    expect(groups).toEqual(['guard', 'health', 'lab']);
    expect(screen.getAllByRole('switch')).toHaveLength(4);
  });

  it('localizes a label by id and falls back to the service label for an unknown id', async () => {
    translations.map['tools.simEvents.event.guard.limitTrip'] = 'CPU limit trip';
    translations.map['tools.simEvents.category.guard'] = 'Thermal guard';
    render(<DevSimEventsCard />);
    expect(await screen.findByText('CPU limit trip')).toBeTruthy();
    expect(screen.getByText('Thermal guard')).toBeTruthy();
    expect(screen.getByText('Brand new sim')).toBeTruthy();
  });

  it('shows each switch on for an active sim', async () => {
    api.fetchDevSimEvents.mockResolvedValue(events(['health.fanStall']));
    render(<DevSimEventsCard />);
    const on = await screen.findByRole('switch', { name: 'Fan stall' });
    expect(on.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('switch', { name: 'Guard limit trip' }).getAttribute('aria-checked')).toBe('false');
  });

  it('turning a switch on starts the sim and the switches follow the response', async () => {
    render(<DevSimEventsCard />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Guard limit trip' }));
    await waitFor(() => expect(api.startDevSim).toHaveBeenCalledWith('guard.limitTrip'));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Guard limit trip' }).getAttribute('aria-checked')).toBe('true'));
    // The response is the state: no second fetch follows the change.
    expect(api.fetchDevSimEvents).toHaveBeenCalledTimes(1);
  });

  it('turning a switch off stops the sim', async () => {
    api.fetchDevSimEvents.mockResolvedValue(events(['guard.endedTrip']));
    render(<DevSimEventsCard />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Guard ended trip' }));
    await waitFor(() => expect(api.stopDevSim).toHaveBeenCalledWith('guard.endedTrip'));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Guard ended trip' }).getAttribute('aria-checked')).toBe('false'));
  });

  it('Clear all stops everything, and is disabled with nothing active', async () => {
    const { unmount } = render(<DevSimEventsCard />);
    await screen.findByText('Guard limit trip');
    expect(screen.getByRole('button', { name: 'tools.simEvents.clearAll' })).toBeDisabled();
    unmount();

    api.fetchDevSimEvents.mockResolvedValue(events(['guard.limitTrip', 'health.fanStall']));
    render(<DevSimEventsCard />);
    await screen.findByText('Guard limit trip');
    fireEvent.click(screen.getByRole('button', { name: 'tools.simEvents.clearAll' }));
    await waitFor(() => expect(api.clearDevSims).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Fan stall' }).getAttribute('aria-checked')).toBe('false'));
  });

  it('a failing request shows an inline error', async () => {
    api.startDevSim.mockResolvedValue(null);
    render(<DevSimEventsCard />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Guard limit trip' }));
    expect((await screen.findByRole('alert')).textContent).toBe('tools.simEvents.error');
  });

  it('a failing request keeps the switches as they were and a later success clears the error', async () => {
    api.startDevSim.mockResolvedValueOnce(null);
    render(<DevSimEventsCard />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Guard limit trip' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('switch', { name: 'Guard limit trip' }).getAttribute('aria-checked')).toBe('false');
    fireEvent.click(screen.getByRole('switch', { name: 'Guard limit trip' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('shows a load error when the catalog cannot be read', async () => {
    api.fetchDevSimEvents.mockResolvedValue(null);
    render(<DevSimEventsCard />);
    expect((await screen.findByRole('alert')).textContent).toBe('tools.simEvents.loadError');
  });

  it('disables the controls while a request is in flight', async () => {
    let finish!: (v: unknown) => void;
    api.startDevSim.mockReturnValue(new Promise(r => { finish = r; }));
    render(<DevSimEventsCard />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Guard limit trip' }));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Fan stall' })).toBeDisabled());
    await act(async () => { finish(events(['guard.limitTrip'])); });
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Fan stall' })).not.toBeDisabled());
  });
});
