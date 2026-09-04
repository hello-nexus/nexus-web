import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { StorePage } from './StorePage';
import type { StoreApp, StoreAppDetail } from '../../../api/store';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      let text = key;
      if (params) for (const [k, v] of Object.entries(params)) text += ` ${k}=${v}`;
      return text;
    },
  }),
}));

const fetchStoreApps = vi.fn();
const fetchStoreApp = vi.fn();
const installStoreApp = vi.fn();

vi.mock('../../../api/store', () => ({
  fetchStoreApps: (...args: unknown[]) => fetchStoreApps(...args),
  fetchStoreApp: (...args: unknown[]) => fetchStoreApp(...args),
  installStoreApp: (...args: unknown[]) => installStoreApp(...args),
}));

const installed: Array<{ id: string; version: string; iconUrl: string | null }> = [];

vi.mock('../SettingsView/Account/AccountSignInModal', () => ({
  AccountSignInModal: ({ open, onSignedIn }: { open: boolean; onSignedIn: () => void }) =>
    (open ? <button type="button" onClick={onSignedIn}>signed-in</button> : null),
}));

vi.mock('../../../widgets/marketplaceRegistry', () => ({
  getAllMarketplaceListings: () => installed,
  loadMarketplaceApps: () => Promise.resolve(),
  subscribeMarketplaceRegistry: () => () => {},
}));

const version = {
  version: '1.0.2',
  sha256: 'a'.repeat(64),
  size: 12447,
  minNexusVersion: '',
  hasWidget: true,
  hasPage: false,
  requiresTouch: false,
  sizes: ['2x2'],
  surfaces: ['dashboard'],
  releasedAt: '2026-08-29T00:00:00Z',
};

const app: StoreApp = {
  id: 'com.hellonexus.aquarium',
  name: 'Aquarium',
  tagline: '',
  description: 'A pixel-art fish you can feed. Tap the water to drop food; the fish swims over, eats, and grows.',
  publisher: 'Nexus',
  category: 'other',
  iconUrl: null,
  rating: { average: 0, count: 0 },
  latest: version,
};

const detail: StoreAppDetail = {
  ...app,
  screenshots: [],
  versions: [{ version: '1.0.2', releasedAt: '2026-08-29T00:00:00Z', minNexusVersion: '' }],
};

beforeEach(() => {
  installed.length = 0;
  fetchStoreApps.mockResolvedValue([app]);
  fetchStoreApp.mockResolvedValue(detail);
  installStoreApp.mockReset();
});

describe('StorePage storefront', () => {
  it('leads with the coming-soon banner and an Apps heading', async () => {
    render(<StorePage />);

    expect(await screen.findByText('store.banner.title')).toBeInTheDocument();
    expect(screen.getByText('store.section.apps')).toBeInTheDocument();
  });

  it('gives a row a short line from the app, never the publisher, and its own Install button', async () => {
    render(<StorePage />);

    // The subtitle is the first sentence only; the rest is what the description is for.
    expect(await screen.findByText('A pixel-art fish you can feed')).toBeInTheDocument();
    expect(screen.queryByText(/Tap the water/)).not.toBeInTheDocument();
    expect(screen.queryByText('Nexus')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'store.install' })).toBeInTheDocument();
    expect(screen.queryByText('store.noRatings')).not.toBeInTheDocument();
  });
});

describe('StorePage row card', () => {
  it('opens the app page from anywhere on the card', async () => {
    render(<StorePage />);

    // The subtitle is card chrome, not a control: the container is the target.
    fireEvent.click(await screen.findByText('A pixel-art fish you can feed'));

    expect(await screen.findByText('store.spec.widget')).toBeInTheDocument();
    expect(screen.queryByText('store.banner.title')).not.toBeInTheDocument();
  });

  it('leaves a keyboard route to the app page: the title is a real control', async () => {
    render(<StorePage />);

    // The card's own onClick is mouse-only (disableInteractiveRole), so the
    // title has to carry the keyboard path.
    fireEvent.click(await screen.findByRole('button', { name: 'Aquarium' }));

    expect(await screen.findByText('store.spec.widget')).toBeInTheDocument();
  });

  it('keeps Install from opening the page it sits on', async () => {
    installStoreApp.mockResolvedValue({ appId: app.id, version: '1.0.2', ok: true });
    render(<StorePage />);

    fireEvent.click(await screen.findByRole('button', { name: 'store.install' }));

    // Still the storefront: the click must not bubble to the card.
    expect(screen.getByText('store.section.apps')).toBeInTheDocument();
    await waitFor(() => expect(installStoreApp).toHaveBeenCalled());
  });
});

describe('StorePage app page', () => {
  it('opens the sign-in dialog when the service refuses the install without an account', async () => {
    installStoreApp.mockResolvedValue({ appId: app.id, version: '1.0.2', ok: false, reason: 'sign_in_required' });
    render(<StorePage />);

    fireEvent.click(await screen.findByText('Aquarium'));
    fireEvent.click(await screen.findByRole('button', { name: 'store.install' }));

    // The dialog is stubbed in this file; its presence is the assertion.
    await waitFor(() => expect(screen.getByRole('button', { name: 'signed-in' })).toBeInTheDocument());
  });

  it('names the installed version, and never offers Delete here (that lives under Manage purchases)', async () => {
    installed.push({ id: app.id, version: '1.0.1', iconUrl: null });
    render(<StorePage tab={app.id} onTabChange={vi.fn()} />);

    expect(await screen.findByText('store.installedVersion version=1.0.1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'store.update' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'store.delete' })).not.toBeInTheDocument();
  });
});

describe('StorePage app page layout', () => {
  it('reads the capabilities as a highlight strip, not a definition table', async () => {
    render(<StorePage tab={app.id} onTabChange={vi.fn()} />);

    expect(await screen.findByText('store.spec.widget')).toBeInTheDocument();
    expect(screen.getByText('store.value.hasFeature')).toBeInTheDocument();
    expect(screen.getByText('2x2')).toBeInTheDocument();
    expect(screen.getByText('store.value.touchAny')).toBeInTheDocument();
    expect(screen.getByText('1.0.2')).toBeInTheDocument();
  });

  it('omits the sizes cell for an app that declares no widget', async () => {
    fetchStoreApp.mockResolvedValue({
      ...detail,
      latest: { ...version, hasWidget: false, sizes: [] },
    });
    render(<StorePage tab={app.id} onTabChange={vi.fn()} />);

    expect(await screen.findByText('store.value.noFeature')).toBeInTheDocument();
    expect(screen.queryByText('store.spec.widgetSizes')).not.toBeInTheDocument();
  });

  it('shows no subtitle for an app with no tagline, rather than repeating its description', async () => {
    render(<StorePage tab={app.id} onTabChange={vi.fn()} />);

    await screen.findByText('store.spec.widget');
    // The description block carries this sentence; the hero must not also.
    expect(screen.getAllByText(/A pixel-art fish you can feed/)).toHaveLength(1);
  });

  it('names each screenshot and puts the full description below them, with no section headings', async () => {
    fetchStoreApp.mockResolvedValue({
      ...detail,
      screenshots: ['/apps-api/store/media/com.hellonexus.aquarium/media/one.png'],
    });
    render(<StorePage tab={app.id} onTabChange={vi.fn()} />);

    expect(await screen.findByAltText('store.screenshotAlt name=Aquarium index=1')).toBeInTheDocument();
    expect(screen.getByText(/Tap the water/)).toBeInTheDocument();
    expect(screen.queryByText('store.section.preview')).not.toBeInTheDocument();
    expect(screen.queryByText('store.section.about')).not.toBeInTheDocument();
    expect(screen.queryByText('store.section.details')).not.toBeInTheDocument();
  });
});

describe('StorePage subtitle', () => {
  it('never abbreviates the line: the card clips its own width in CSS', async () => {
    fetchStoreApps.mockResolvedValue([{
      ...app,
      description: 'Ninomae Inanis as an interactive character companion that lives on the panel',
    }]);
    render(<StorePage />);

    expect(await screen.findByText(
      'Ninomae Inanis as an interactive character companion that lives on the panel',
    )).toBeInTheDocument();
  });

  it('prefers a tagline the app set over its description', async () => {
    fetchStoreApps.mockResolvedValue([{ ...app, tagline: 'Feed the fish' }]);
    render(<StorePage />);

    expect(await screen.findByText('Feed the fish')).toBeInTheDocument();
  });
});

describe('StorePage against an older catalog', () => {
  it('renders a card when the catalog omits description entirely', async () => {
    // The deployed catalog predates the field; a client that assumes a string
    // throws on the first card and takes the whole page with it.
    const noDescription: Partial<StoreApp> = { ...app };
    delete noDescription.description;
    fetchStoreApps.mockResolvedValue([noDescription]);
    render(<StorePage />);

    expect(await screen.findByText('Aquarium')).toBeInTheDocument();
  });
});

describe('StorePage sign-in', () => {
  it('signs the whole app in, not just the install: the shared account state is refreshed', async () => {
    installStoreApp.mockResolvedValueOnce({ appId: app.id, version: '1.0.2', ok: false, reason: 'sign_in_required' });
    installStoreApp.mockResolvedValueOnce({ appId: app.id, version: '1.0.2', ok: true });
    const accounts = { activeAccountId: null, activeAccount: null, refresh: vi.fn().mockResolvedValue(undefined) };
    render(<StorePage tab={app.id} onTabChange={vi.fn()} accounts={accounts} />);

    fireEvent.click(await screen.findByRole('button', { name: 'store.install' }));
    fireEvent.click(await screen.findByRole('button', { name: 'signed-in' }));

    await waitFor(() => expect(accounts.refresh).toHaveBeenCalled());
    await waitFor(() => expect(installStoreApp).toHaveBeenCalledTimes(2));
  });
});
