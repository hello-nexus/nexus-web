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

  it('gives a card a short line from the app, never the publisher, and no Install button', async () => {
    render(<StorePage />);

    // The subtitle is the first sentence only; the rest is what About is for.
    expect(await screen.findByText('A pixel-art fish you can feed')).toBeInTheDocument();
    expect(screen.queryByText(/Tap the water/)).not.toBeInTheDocument();
    expect(screen.queryByText('Nexus')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'store.install' })).not.toBeInTheDocument();
    expect(screen.queryByText('store.noRatings')).not.toBeInTheDocument();
  });
});

describe('StorePage app page', () => {
  it('opens the sign-in dialog when the service refuses the install without an account', async () => {
    installStoreApp.mockResolvedValue({ appId: app.id, version: '1.0.2', ok: false, reason: 'sign_in_required' });
    render(<StorePage />);

    fireEvent.click(await screen.findByText('Aquarium'));
    fireEvent.click(await screen.findByRole('button', { name: 'store.install' }));

    await waitFor(() => expect(screen.getByText('store.signIn.body')).toBeInTheDocument());
  });

  it('offers no Delete for an app that is not installed', async () => {
    render(<StorePage tab={app.id} onTabChange={vi.fn()} />);

    await screen.findByRole('button', { name: 'store.install' });
    expect(screen.queryByRole('button', { name: 'store.delete' })).not.toBeInTheDocument();
  });

  it('names the installed version, and puts Delete on the page once installed', async () => {
    installed.push({ id: app.id, version: '1.0.1', iconUrl: null });
    render(<StorePage tab={app.id} onTabChange={vi.fn()} />);

    expect(await screen.findByText('store.installedVersion version=1.0.1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'store.update' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'store.delete' })).toBeInTheDocument();
  });
});

describe('StorePage subtitle', () => {
  it('trims a long one-liner at a word rather than running the card wide', async () => {
    fetchStoreApps.mockResolvedValue([{
      ...app,
      description: 'Ninomae Inanis as an interactive character companion that lives on the panel',
    }]);
    render(<StorePage />);

    expect(await screen.findByText('Ninomae Inanis as an interactive\u2026')).toBeInTheDocument();
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
