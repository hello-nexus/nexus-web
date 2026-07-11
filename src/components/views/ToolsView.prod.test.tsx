import { act, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Force a production build: dev tools off. The Stream Deck Simulator card is
// a bench-only affordance backed by service routes that don't exist in a
// release build, so it must never mount.
vi.mock('../../lib/devTools', () => ({ DEV_TOOLS: false }));

vi.mock('../../api/service', async () => {
  const actual = await vi.importActual<typeof import('../../api/service')>('../../api/service');
  return { ...actual, fetchService: vi.fn().mockResolvedValue(null) };
});

vi.mock('../../hooks/useStreamDecks', () => ({
  useStreamDecks: () => ({ decks: [], loaded: true, rename: vi.fn(), setBrightness: vi.fn(), setOrientation: vi.fn(), setSleepAfterSeconds: vi.fn(), refresh: vi.fn() }),
}));

import { ToolsView } from './ToolsView';

describe('ToolsView without dev tools', () => {
  it('does not render the Stream Deck Simulator card', async () => {
    await act(async () => { render(<ToolsView serviceOnline />); });

    expect(screen.queryByText('tools.streamdeckSim.title')).toBeNull();
    expect(screen.queryByRole('button', { name: 'devices.streamdeck.model' })).toBeNull();
  });
});
