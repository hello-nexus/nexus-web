import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PanelConfigValue, PanelWidget } from '../../types';
import { HomeAssistantSettings } from './HomeAssistantSettings';

vi.mock('../../../components/common/Select/Select', () => ({
  Select: ({ value, onChange, options, ariaLabel }: {
    value: string; onChange: (v: string) => void;
    options: { value: string; label: string }[]; ariaLabel?: string;
  }) => (
    <select aria-label={ariaLabel} value={value} onChange={e => onChange(e.target.value)}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  ),
}));

vi.mock('../../../api/homeAssistant', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../api/homeAssistant')>()),
  fetchHaDashboards: vi.fn(async () => ({
    connected: true,
    dashboards: [{ id: 'lovelace', title: '' }, { id: 'dashboard-nexus', title: 'Nexus' }],
  })),
  fetchHaDashboard: vi.fn(async () => ({
    id: 'dashboard-nexus',
    error: '',
    config: { views: [{ title: 'Home', path: 'home', cards: [] }, { title: 'Misc', cards: [] }] },
  })),
}));

function haWidget(config?: Record<string, PanelConfigValue>): PanelWidget {
  return { id: 'ha-1', type: 'home-assistant', size: '4x2', col: 0, row: 0, config };
}

afterEach(() => vi.clearAllMocks());

describe('HomeAssistantSettings', () => {
  it('lists the room view and every dashboard', async () => {
    render(<HomeAssistantSettings widget={haWidget()} onUpdate={vi.fn()} onResize={vi.fn()} />);
    const picker = screen.getByRole('combobox', { name: 'homeAssistant.source' });
    await waitFor(() => expect(picker.querySelectorAll('option')).toHaveLength(3));
    expect([...picker.querySelectorAll('option')].map(o => o.textContent))
      .toEqual(['homeAssistant.source.rooms', 'homeAssistant.dashboard.overview', 'Nexus']);
    expect(screen.queryByRole('combobox', { name: 'panel.widget.home-assistant.settings.view' })).toBeNull();
  });

  it('saves the picked dashboard with its title and resets the view', async () => {
    const onUpdate = vi.fn();
    render(<HomeAssistantSettings widget={haWidget()} onUpdate={onUpdate} onResize={vi.fn()} />);
    const picker = screen.getByRole('combobox', { name: 'homeAssistant.source' });
    await waitFor(() => expect(picker.querySelectorAll('option')).toHaveLength(3));
    fireEvent.change(picker, { target: { value: 'dashboard-nexus' } });
    expect(onUpdate).toHaveBeenCalledWith({ dashboard: 'dashboard-nexus', dashboardTitle: 'Nexus', view: '' });
  });

  it('offers a view picker for a multi-view dashboard', async () => {
    const onUpdate = vi.fn();
    render(<HomeAssistantSettings widget={haWidget({ dashboard: 'dashboard-nexus' })} onUpdate={onUpdate} onResize={vi.fn()} />);
    const views = await screen.findByRole('combobox', { name: 'panel.widget.home-assistant.settings.view' });
    expect([...views.querySelectorAll('option')].map(o => o.value)).toEqual(['', 'home', '1']);
    fireEvent.change(views, { target: { value: 'home' } });
    expect(onUpdate).toHaveBeenCalledWith({ view: 'home' });
  });
});
