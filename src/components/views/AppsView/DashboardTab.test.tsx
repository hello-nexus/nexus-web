import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PanelLayout, PanelWidget } from '../../../panel/types';
import { DashboardTab } from './DashboardTab';

const widget = (id: string, size: PanelWidget['size'], col: number, row: number): PanelWidget =>
  ({ id, type: 'clock', size, col, row });

const h = vi.hoisted(() => ({
  update: vi.fn(),
  setLayout: vi.fn(),
  settings: { accentColor: '#0000ff', dashboardAutoArrange: true },
  layout: null as unknown as PanelLayout,
}));

vi.mock('../../../lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../../hooks/useUiSettings', () => ({
  useUiSettings: () => ({ settings: h.settings, update: h.update, hydrated: true }),
}));
vi.mock('../../../panel/engine/useDashboardLayout', () => ({
  useDashboardLayout: () => ({ layout: h.layout, loaded: true, setLayout: h.setLayout }),
}));
vi.mock('../../../panel/PanelApp', () => ({ PanelEmbeddedContent: () => null }));
vi.mock('./DashboardBanner', () => ({ DashboardBanner: () => null }));
vi.mock('./OverlayWidgetsModal', () => ({ OverlayWidgetsModal: () => null }));
vi.mock('../../../api/overlay', () => ({ listOverlayWidgets: () => Promise.resolve([]) }));
vi.mock('../../../hooks/useMultiplexSocket', () => ({ useTopicCallback: () => {} }));
vi.mock('../../../search/signals', () => ({ useSearchSignal: () => {} }));

afterEach(() => {
  vi.clearAllMocks();
  h.settings = { accentColor: '#0000ff', dashboardAutoArrange: true };
});

describe('DashboardTab auto-arrange toggle', () => {
  it('turning it off stores the arranged order packed to the manual grid width', () => {
    // Stored while auto-arranged on a narrow window; the manual grid holds all four in one row.
    h.layout = {
      layoutSchemaVersion: 2,
      surface: 'desktop',
      pages: [{ id: 'p0', widgets: [
        widget('a', '4x4', 0, 0),
        widget('b', '4x4', 4, 0),
        widget('c', '4x4', 0, 4),
        widget('d', '4x4', 4, 4),
      ] }],
    } as PanelLayout;
    render(<DashboardTab serviceOnline />);

    const toggle = screen.getByRole('switch', { name: 'dashboard.autoArrange' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);

    expect(h.update).toHaveBeenCalledWith({ dashboardAutoArrange: false });
    const saved = h.setLayout.mock.calls[0][0] as PanelLayout;
    expect(saved.pages[0].widgets.map(w => [w.id, w.col, w.row])).toEqual([
      ['a', 0, 0], ['b', 4, 0], ['c', 8, 0], ['d', 12, 0],
    ]);
  });

  it('turning it on leaves the stored layout alone', () => {
    h.settings = { accentColor: '#0000ff', dashboardAutoArrange: false };
    h.layout = { layoutSchemaVersion: 2, surface: 'desktop', pages: [{ id: 'p0', widgets: [widget('a', '2x2', 6, 4)] }] } as PanelLayout;
    render(<DashboardTab serviceOnline />);

    fireEvent.click(screen.getByRole('switch', { name: 'dashboard.autoArrange' }));

    expect(h.update).toHaveBeenCalledWith({ dashboardAutoArrange: true });
    expect(h.setLayout).not.toHaveBeenCalled();
  });
});
