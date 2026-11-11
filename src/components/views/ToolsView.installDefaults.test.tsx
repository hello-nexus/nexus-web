import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/devTools', () => ({ DEV_TOOLS: false }));

vi.mock('../../api/service', async () => {
  const actual = await vi.importActual<typeof import('../../api/service')>('../../api/service');
  return { ...actual, fetchService: vi.fn().mockResolvedValue(null) };
});

vi.mock('../../api/installDefaults', async () => {
  const actual = await vi.importActual<typeof import('../../api/installDefaults')>('../../api/installDefaults');
  return {
    ...actual,
    fetchInstallDefaults: vi.fn().mockResolvedValue(null),
    fetchInstallDefaultsSnapshot: vi.fn().mockResolvedValue(null),
  };
});

vi.mock('../../hooks/useStreamDecks', () => ({
  useStreamDecks: () => ({ decks: [], loaded: true, rename: vi.fn(), setBrightness: vi.fn(), setOrientation: vi.fn(), setSleepAfterSeconds: vi.fn(), refresh: vi.fn() }),
}));

import { ToolsView } from './ToolsView';

describe('ToolsView install defaults modal', () => {
  it('renders its Current and Defaults switch through Tabs and toggles selection', async () => {
    await act(async () => { render(<ToolsView serviceOnline />); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'tools.installDefaults.openSnapshot' })); });

    const tablist = screen.getByRole('tablist', { name: 'tools.installDefaults.title' });
    expect(tablist).toBeInTheDocument();
    const current = screen.getByRole('tab', { name: 'tools.installDefaults.tabCurrent' });
    const defaults = screen.getByRole('tab', { name: 'tools.installDefaults.tabDefaults' });
    expect(current).toHaveAttribute('aria-selected', 'true');
    expect(defaults).toHaveAttribute('aria-selected', 'false');

    await act(async () => { fireEvent.click(defaults); });
    expect(defaults).toHaveAttribute('aria-selected', 'true');
    expect(current).toHaveAttribute('aria-selected', 'false');
  });
});
