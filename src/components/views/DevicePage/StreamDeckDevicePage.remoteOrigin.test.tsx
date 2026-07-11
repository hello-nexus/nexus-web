import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UnifiedDevice } from '../../../hooks/useUnifiedDevices';

// /streamdeck/* is .LocalhostOnly(); a remote-paired session reaching the
// dashboard must see a desktop-only notice, never sit forever on a blank
// page waiting for useStreamDecks (which itself refuses to fetch there).
vi.mock('../../../api/service', () => ({ isRemoteOrigin: true }));
vi.mock('../../../hooks/useStreamDecks', () => ({
  useStreamDecks: () => ({
    decks: [], loaded: false, rename: vi.fn(), setBrightness: vi.fn(), setOrientation: vi.fn(), setSleepAfterSeconds: vi.fn(),
  }),
}));
vi.mock('../../../hooks/useConflictApps', () => ({
  useConflictApps: () => ({ conflicts: [], ready: true }),
}));
vi.mock('../../../panel/widgets/deck/usePhysicalDeckTarget', () => ({
  usePhysicalDeckTarget: () => ({ target: null, loaded: false, error: false, retry: vi.fn() }),
}));
vi.mock('../../../panel/widgets/deck/useDeckPresets', () => ({
  useDeckPresets: () => ({
    presets: [], activeId: null, presetCount: 0, available: false,
    loadPresets: vi.fn(), handleCreate: vi.fn(), handleRename: vi.fn(), handleDelete: vi.fn(), handleLoad: vi.fn(),
  }),
}));
vi.mock('../../../panel/widgets/deck/DeckKeyInspector', () => ({
  DeckKeyInspector: () => <div data-testid="deck-key-inspector" />,
}));

import { StreamDeckDevicePage } from './StreamDeckDevicePage';

const device: UnifiedDevice = {
  key: 'streamdeck:SN1',
  shortName: 'Stream Deck Mini',
  name: 'Stream Deck Mini',
  subtitle: 'controller',
  category: 'controller',
  iconSrc: '/assets/devices/elgato.svg',
  connected: true,
  kind: 'curated',
  curatedId: 'streamdeck',
  streamdeckSerial: 'SN1',
  navigable: true,
  nexusControlEnabled: true,
  supportsNexusControl: true,
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('StreamDeckDevicePage on a remote origin', () => {
  it('shows a desktop-only notice instead of the generic loading state', async () => {
    await act(async () => { render(<StreamDeckDevicePage device={device} controlDevice={vi.fn()} />); });

    expect(screen.getByText('devices.streamdeck.desktopOnly')).toBeInTheDocument();
    expect(screen.queryByText('common.loading')).toBeNull();
    expect(screen.queryByTestId('deck-key-inspector')).toBeNull();
  });
});
