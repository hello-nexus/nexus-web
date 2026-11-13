import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LightingDevice } from '../../../api/lighting';

vi.mock('../../../lib/i18n', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
const h = vi.hoisted(() => ({
  fetch: vi.fn(),
  save: vi.fn(),
  push: vi.fn(),
  topic: undefined as undefined | ((d: unknown) => void),
}));
vi.mock('../../../api/lighting', () => ({
  fetchLightingDevices: () => h.fetch(),
  setLightingDeviceSaveToDevice: (id: string, enabled: boolean) => h.save(id, enabled),
}));
vi.mock('../../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: (_t: string, _e: boolean, cb: (d: unknown) => void) => { h.topic = cb; },
}));
vi.mock('../../../hooks/useStreamDecks', () => ({ useStreamDecks: () => ({ decks: [{ serial: 'S1', displayName: 'Corsair Galleon' }] }) }));
vi.mock('../../common/Toast/Toast', () => ({ useToast: () => ({ push: h.push }) }));

import { GalleonKeyboardLightingSection } from './GalleonKeyboardLightingSection';

const kb = (over: Partial<LightingDevice> = {}) => ({ id: 'k', deviceId: 'corsair-galleon:S1', saveToDeviceSupported: true, ...over }) as LightingDevice;

beforeEach(() => {
  h.fetch.mockReset();
  h.save.mockReset();
  h.push.mockReset();
  h.save.mockResolvedValue({ error: false, msg: '' });
});

describe('GalleonKeyboardLightingSection', () => {
  it('renders nothing when no keyboard card can save colors', async () => {
    h.fetch.mockResolvedValue({ devices: [{ id: 'z', deviceId: 'other' }] });
    const { container } = render(<GalleonKeyboardLightingSection serial="S1" />);
    await waitFor(() => expect(h.fetch).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });

  it('shows the toggle reflecting the card and posts the card deviceId on press', async () => {
    h.fetch.mockResolvedValue({ devices: [kb()] });
    render(<GalleonKeyboardLightingSection serial="S1" />);
    const toggle = await screen.findByRole('switch', { name: /saveColors\.label/ });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    await waitFor(() => expect(h.save).toHaveBeenCalledWith('corsair-galleon:S1', true));
  });

  it('shows on state from the service and posts enabled false when switched off', async () => {
    h.fetch.mockResolvedValue({ devices: [kb({ savedToDevice: true })] });
    render(<GalleonKeyboardLightingSection serial="S1" />);
    const toggle = await screen.findByRole('switch', { name: /saveColors\.label/ });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    await waitFor(() => expect(h.save).toHaveBeenCalledWith('corsair-galleon:S1', false));
  });

  it('rolls back and toasts when the service refuses', async () => {
    h.fetch.mockResolvedValue({ devices: [kb()] });
    h.save.mockResolvedValue({ error: true, msg: 'no' });
    render(<GalleonKeyboardLightingSection serial="S1" />);
    const toggle = await screen.findByRole('switch', { name: /saveColors\.label/ });
    fireEvent.click(toggle);
    await waitFor(() => expect(h.push).toHaveBeenCalled());
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('false'));
  });

  it('refetches on a lighting signal', async () => {
    h.fetch.mockResolvedValue({ devices: [kb()] });
    render(<GalleonKeyboardLightingSection serial="S1" />);
    await screen.findByRole('switch');
    h.fetch.mockResolvedValue({ devices: [kb({ savedToDevice: true })] });
    h.topic?.({});
    await waitFor(() => expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true'));
  });
});
