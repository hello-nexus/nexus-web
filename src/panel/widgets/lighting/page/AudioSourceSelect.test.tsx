import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MultiplexContext, type MultiplexContextValue } from '../../../../hooks/useMultiplexSocket';
import { AudioSourceSelect } from './AudioSourceSelect';

// The service-side setting, shared by every picker the way the real endpoint is.
const service = { deviceId: '' };
const listeners = new Set<(data: unknown) => void>();

vi.mock('../../../../api/lighting', () => ({
  fetchAudioOutput: () => Promise.resolve({ deviceId: service.deviceId, deviceName: service.deviceId, direction: 'output' }),
  setAudioOutput: (pick: { deviceId: string }) => { service.deviceId = pick.deviceId; return Promise.resolve({}); },
}));
vi.mock('../../../../hooks/useAudioDevices', () => ({
  useAudioDevices: () => ({
    outputs: [{ id: 'spk', name: 'Speakers' }, { id: 'hp', name: 'Headphones' }],
    inputs: [],
    activeOutput: { id: 'spk', name: 'Speakers' },
    activeInput: null,
  }),
}));

const mux: MultiplexContextValue = {
  subscribe: (topic, listener) => { if (topic === 'lighting') listeners.add(listener); },
  unsubscribe: (topic, listener) => { if (topic === 'lighting') listeners.delete(listener); },
  connected: true,
} as MultiplexContextValue;

const pushLightingTopic = () => act(async () => { listeners.forEach(l => l({})); });

describe('AudioSourceSelect', () => {
  beforeEach(() => { service.deviceId = ''; listeners.clear(); });

  it('shows a pick made in the other mounted picker, and one made by another client', async () => {
    render(
      <MultiplexContext.Provider value={mux}>
        <div data-testid="a"><AudioSourceSelect /></div>
        <div data-testid="b"><AudioSourceSelect /></div>
      </MultiplexContext.Provider>,
    );
    const triggerOf = (id: string) => screen.getByTestId(id).querySelector('button') as HTMLElement;
    await waitFor(() => expect(triggerOf('b').textContent).toContain('systemDefaultNamed'));

    fireEvent.click(triggerOf('a'));
    fireEvent.click(screen.getByRole('option', { name: 'Headphones' }));
    await waitFor(() => expect(triggerOf('a').textContent).toContain('Headphones'));
    await pushLightingTopic();
    await waitFor(() => expect(triggerOf('b').textContent).toContain('Headphones'));

    service.deviceId = 'spk';
    await pushLightingTopic();
    await waitFor(() => expect(triggerOf('a').textContent).toContain('Speakers'));
    await waitFor(() => expect(triggerOf('b').textContent).toContain('Speakers'));
  });
});
