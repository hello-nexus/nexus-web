import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MultiplexContext, type MultiplexContextValue } from '../../../../hooks/useMultiplexSocket';
import { useMusicReactive } from '../../../../hooks/useMusicReactive';
import { MusicReactiveControl } from './MusicReactiveControl';

// The service-side flag, shared by every control the way the real endpoint is.
const service = { enabled: true };
const listeners = new Set<(data: unknown) => void>();

vi.mock('../../../../api/lighting', () => ({
  fetchMusicReactive: () => Promise.resolve({ enabled: service.enabled }),
  setMusicReactive: (enabled: boolean) => { service.enabled = enabled; return Promise.resolve({}); },
}));

const mux = {
  subscribe: (topic: string, listener: (data: unknown) => void) => { if (topic === 'lighting') listeners.add(listener); },
  unsubscribe: (topic: string, listener: (data: unknown) => void) => { if (topic === 'lighting') listeners.delete(listener); },
  connected: true,
} as MultiplexContextValue;

function Control() {
  const music = useMusicReactive(true);
  return <MusicReactiveControl active={music.enabled} onToggle={music.toggle} />;
}

const pushLightingTopic = () => act(async () => { listeners.forEach(l => l({})); });

describe('MusicReactiveControl', () => {
  beforeEach(() => { service.enabled = true; listeners.clear(); });

  it('shows a toggle made in one mounted control, and one made by another client, in the other', async () => {
    render(
      <MultiplexContext.Provider value={mux}>
        <div data-testid="a"><Control /></div>
        <div data-testid="b"><Control /></div>
      </MultiplexContext.Provider>,
    );
    const noteOf = (id: string) => screen.getByTestId(id).querySelector('button') as HTMLElement;
    await waitFor(() => expect(noteOf('b').getAttribute('aria-pressed')).toBe('true'));

    fireEvent.click(noteOf('a'));
    await waitFor(() => expect(noteOf('a').getAttribute('aria-pressed')).toBe('false'));
    expect(service.enabled).toBe(false);
    await pushLightingTopic();
    await waitFor(() => expect(noteOf('b').getAttribute('aria-pressed')).toBe('false'));

    service.enabled = true;
    await pushLightingTopic();
    await waitFor(() => expect(noteOf('a').getAttribute('aria-pressed')).toBe('true'));
    await waitFor(() => expect(noteOf('b').getAttribute('aria-pressed')).toBe('true'));
  });
});
