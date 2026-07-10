import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// /streamdeck/* is .LocalhostOnly(); a remote-paired session reaching the
// dashboard must see a desktop-only notice, never sit forever on a blank
// page waiting for useStreamDecks (which itself refuses to fetch there).
vi.mock('../../../api/service', () => ({ isRemoteOrigin: true }));
vi.mock('../../../hooks/useStreamDecks', () => ({
  useStreamDecks: () => ({ decks: [], loaded: false, rename: vi.fn(), setBrightness: vi.fn() }),
}));
vi.mock('../../../panel/widgets/deck/usePhysicalDeckTarget', () => ({
  usePhysicalDeckTarget: () => ({ target: null, loaded: false, error: false, retry: vi.fn(), replaceAll: vi.fn() }),
}));
vi.mock('../../../panel/widgets/deck/DeckEditor', () => ({
  DeckEditor: () => <div data-testid="deck-editor" />,
}));

import { StreamDeckDevicePage } from './StreamDeckDevicePage';

afterEach(() => {
  vi.clearAllMocks();
});

describe('StreamDeckDevicePage on a remote origin', () => {
  it('shows a desktop-only notice instead of the generic loading state', async () => {
    await act(async () => { render(<StreamDeckDevicePage />); });

    expect(screen.getByText('devices.streamdeck.desktopOnly')).toBeInTheDocument();
    expect(screen.queryByText('common.loading')).toBeNull();
    expect(screen.queryByTestId('deck-editor')).toBeNull();
  });
});
