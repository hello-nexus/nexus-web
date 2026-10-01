import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelPresetsResponse } from '../../../api/panel';
import { PanelPresetToolbar } from './PanelPresetToolbar';

const api = vi.hoisted(() => ({
  fetchPanelPresets: vi.fn(),
  activatePanelPreset: vi.fn(),
  createPanelPreset: vi.fn(),
  renamePanelPreset: vi.fn(),
  deletePanelPreset: vi.fn(),
  setPanelPresetApps: vi.fn(),
}));
vi.mock('../../../api/panel', () => api);

const topic = vi.hoisted(() => ({ onFrame: null as ((data: unknown) => void) | null }));
vi.mock('../../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: (_topic: string, _enabled: boolean, onFrame: (data: unknown) => void) => { topic.onFrame = onFrame; },
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../../lib/platform', () => ({
  isApplePlatform: () => false,
}));

vi.mock('../../common/Select/Select', () => ({
  Select: ({ value, onChange, options }: { value: string; onChange: (v: string) => void; options?: Array<{ value: string; label: string }> }) => (
    <select value={value} onChange={e => onChange(e.target.value)} data-testid="preset-select">
      <option value="" />
      {options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  ),
}));

const PRESETS: PanelPresetsResponse = {
  presets: [
    { id: 'desk', name: 'Desk', apps: [] },
    { id: 'game', name: 'Game', apps: [{ id: 'proc:eldenring', name: 'Elden Ring', processName: 'eldenring' }] },
  ],
  activeId: 'desk',
};

describe('PanelPresetToolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchPanelPresets.mockResolvedValue(PRESETS);
  });

  it('loads the panel presets and activates the one picked', async () => {
    api.activatePanelPreset.mockResolvedValue({ ...PRESETS, activeId: 'game' });
    render(<PanelPresetToolbar deviceId="q60" />);
    const select = await screen.findByTestId('preset-select') as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe('desk'));

    fireEvent.change(select, { target: { value: 'game' } });

    expect(api.activatePanelPreset).toHaveBeenCalledWith('q60', 'game');
    await waitFor(() => expect(select.value).toBe('game'));
  });

  it('refetches when the service broadcasts this panel, not another', async () => {
    render(<PanelPresetToolbar deviceId="q60" />);
    await waitFor(() => expect(api.fetchPanelPresets).toHaveBeenCalledTimes(1));

    act(() => topic.onFrame?.({ deviceId: 'y70' }));
    expect(api.fetchPanelPresets).toHaveBeenCalledTimes(1);

    api.fetchPanelPresets.mockResolvedValue({ ...PRESETS, activeId: 'game' });
    act(() => topic.onFrame?.({ deviceId: 'q60' }));
    expect(api.fetchPanelPresets).toHaveBeenCalledTimes(2);
    await waitFor(() => expect((screen.getByTestId('preset-select') as HTMLSelectElement).value).toBe('game'));
  });
});
