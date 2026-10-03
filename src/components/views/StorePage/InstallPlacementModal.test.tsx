import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Boxes } from 'lucide-react';
import { ToastProvider } from '../../common/Toast/Toast';
import type { PlacementPlan, PlacementTarget } from './installPlacement';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    language: 'en',
    t: (key: string, params?: Record<string, string | number>) => {
      let text = key;
      if (params) for (const [k, v] of Object.entries(params)) text += ` ${k}=${v}`;
      return text;
    },
  }),
}));

const fetchStoreApp = vi.fn();

vi.mock('../../../api/store', () => ({
  fetchStoreApp: () => fetchStoreApp(),
}));

vi.mock('../../../panel/widgets/registry', () => ({
  lookupApp: (type: string) => ({ meta: { type, i18nKey: type === 'clock' ? 'Clock' : 'Fish', icon: Boxes } }),
}));

const targets: PlacementTarget[] = [
  { key: 'dashboard', name: 'Apps dashboard', iconSrc: null, surface: 'desktop' },
  { key: 'panel-q60', name: 'Q60', iconSrc: '/q60.svg', surface: 'q60' },
];
const commitPlacement = vi.fn();

vi.mock('./installPlacement', () => ({
  DASHBOARD_TARGET_KEY: 'dashboard',
  placementTargets: () => targets,
  loadTarget: () => Promise.resolve({ layout: { layoutSchemaVersion: 1, surface: 'desktop', pages: [] } }),
  planPlacement: (target: PlacementTarget): PlacementPlan => {
    const widget = { id: 'new', type: 'app:fish', size: target.surface === 'q60' ? '2x4' as const : '4x2' as const, col: 0, row: 0 };
    const page = { id: 'p', widgets: [widget] };
    return {
      target, widget, page,
      layout: { layoutSchemaVersion: 1, surface: target.surface, pages: [page] },
      capacity: target.surface === 'q60' ? { gridCols: 2, pageRows: 4 } : { gridCols: 6, pageRows: 4 },
      replaces: target.surface === 'q60' ? 'clock' : undefined,
      screen: target.surface === 'q60' ? { width: 720, height: 1280 } : undefined,
    };
  },
  commitPlacement: (...args: unknown[]) => commitPlacement(...args),
}));

const { InstallPlacementModal } = await import('./InstallPlacementModal');

function renderModal(onDone = vi.fn()) {
  render(
    <ToastProvider>
      <InstallPlacementModal
        app={{ id: 'com.example.fish', name: 'Fish' }}
        iconSrc={null}
        devices={[]}
        dashboardColumns={6}
        onDone={onDone}
      />
    </ToastProvider>,
  );
  return onDone;
}

beforeEach(() => {
  commitPlacement.mockReset();
  commitPlacement.mockResolvedValue(true);
  fetchStoreApp.mockResolvedValue({ screenshots: ['/shot.png'] });
});

describe('InstallPlacementModal', () => {
  it('offers every target checked, names the one-widget screen it would replace, and counts the selection', async () => {
    renderModal();

    const cards = await screen.findAllByRole('checkbox');
    expect(cards.map(c => c.getAttribute('aria-checked'))).toEqual(['true', 'true']);
    expect(screen.getByText('store.place.replaces widget=Clock')).toBeInTheDocument();
    expect(screen.getByText('store.place.selected selected=2 total=2')).toBeInTheDocument();
  });

  it('adds only to the checked targets', async () => {
    const onDone = renderModal();

    fireEvent.click(await screen.findByRole('checkbox', { name: /Q60/ }));
    fireEvent.click(screen.getByRole('button', { name: /store\.place\.add/ }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(commitPlacement).toHaveBeenCalledTimes(1);
    expect(commitPlacement.mock.calls[0][0]).toMatchObject({ key: 'dashboard' });
    expect(screen.getByText('store.place.added name=Fish places=Apps dashboard')).toBeInTheDocument();
  });

  it('turns Add off with nothing checked, and Skip closes without writing', async () => {
    const onDone = renderModal();

    for (const card of await screen.findAllByRole('checkbox')) fireEvent.click(card);
    expect(screen.getByRole('button', { name: /store\.place\.add/ })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'store.place.skip' }));
    expect(onDone).toHaveBeenCalled();
    expect(commitPlacement).not.toHaveBeenCalled();
  });

  it('closes rather than hang when the targets cannot be read', async () => {
    fetchStoreApp.mockRejectedValue(new SyntaxError('bad json'));
    const onDone = renderModal();

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('names the targets a write failed for', async () => {
    commitPlacement.mockImplementation((target: PlacementTarget) => Promise.resolve(target.key === 'dashboard'));
    renderModal();

    fireEvent.click(await screen.findByRole('button', { name: /store\.place\.add/ }));

    expect(await screen.findByText('store.place.failed name=Fish places=Q60')).toBeInTheDocument();
  });
});
