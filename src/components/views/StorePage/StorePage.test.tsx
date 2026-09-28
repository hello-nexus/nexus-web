import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { StorePage } from './StorePage';
import type { StoreApp, StoreAppDetail } from '../../../api/store';

const i18n = vi.hoisted(() => ({ language: 'en' }));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    language: i18n.language,
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

const openExternalUrl = vi.fn();

vi.mock('../../../sandbox/ui/openExternal', () => ({
  openExternalUrl: (...args: unknown[]) => openExternalUrl(...args),
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
  it('leads with the banner and features the first app, with no Apps heading for a one-app catalog', async () => {
    render(<StorePage />);

    expect(await screen.findByText('store.banner.title')).toBeInTheDocument();
    expect(screen.getByText('store.featured')).toBeInTheDocument();
    expect(screen.queryByText('store.section.apps')).not.toBeInTheDocument();
  });

  it('lets an app icon fill its box and draws a tile only behind the placeholder', async () => {
    const iconUrl = 'https://assets.example/icon.svg';
    fetchStoreApps.mockResolvedValue([{ ...app, iconUrl }, { ...app, id: 'com.example.bare', name: 'Bare' }]);
    const { container } = render(<StorePage />);

    await screen.findByText('Bare');
    const icons = container.querySelectorAll(`img[src="${iconUrl}"]`);
    expect(icons.length).toBeGreaterThan(0);
    for (const img of icons) expect(img.parentElement?.hasAttribute('data-placeholder')).toBe(false);
    const empty = container.querySelectorAll('[data-placeholder]');
    expect(empty).toHaveLength(1);
    expect(empty[0].querySelector('img')).toBeNull();
  });

  it('falls back to the placeholder tile when an icon fails to load', async () => {
    const iconUrl = 'https://assets.example/missing.svg';
    fetchStoreApps.mockResolvedValue([{ ...app, iconUrl }]);
    const { container } = render(<StorePage />);

    await screen.findByText('store.featured');
    const img = container.querySelector(`img[src="${iconUrl}"]`);
    expect(img).not.toBeNull();
    fireEvent.error(img!);
    expect(container.querySelector(`img[src="${iconUrl}"]`)).toBeNull();
    expect(container.querySelectorAll('[data-placeholder]').length).toBeGreaterThan(0);
  });

  it('gives the featured app its whole tagline and the opening paragraph of its description', async () => {
    fetchStoreApps.mockResolvedValue([{ ...app, tagline: 'Fish. Eggs. Mild obsession.', description: 'First paragraph.\n\nSecond paragraph.' }]);
    render(<StorePage />);

    expect(await screen.findByText('Fish. Eggs. Mild obsession.')).toBeInTheDocument();
    expect(screen.getByText('First paragraph.')).toBeInTheDocument();
    expect(screen.queryByText(/Second paragraph/)).not.toBeInTheDocument();
  });

  it('lists the apps after the featured one under an Apps heading', async () => {
    fetchStoreApps.mockResolvedValue([app, { ...app, id: 'com.example.clock', name: 'Clock' }]);
    render(<StorePage />);

    expect(await screen.findByText('store.section.apps')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aquarium' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clock' })).toBeInTheDocument();
  });

  it('fans the featured app\'s screenshots, at most three', async () => {
    fetchStoreApp.mockResolvedValue({ ...detail, screenshots: ['/a.png', '/b.png', '/c.png', '/d.png'] });
    render(<StorePage />);

    expect(await screen.findByAltText('store.screenshotAlt name=Aquarium index=3')).toBeInTheDocument();
    expect(screen.queryByAltText('store.screenshotAlt name=Aquarium index=4')).not.toBeInTheDocument();
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

describe('StorePage featured card', () => {
  it('opens the app page from anywhere on the card', async () => {
    render(<StorePage />);

    // The subtitle is card chrome, not a control: the container is the target.
    fireEvent.click(await screen.findByText('A pixel-art fish you can feed'));

    expect(await screen.findByText('store.spec.widget')).toBeInTheDocument();
    expect(screen.queryByText('store.banner.title')).not.toBeInTheDocument();
  });

  it('leaves a keyboard route to the app page: the title is a real control', async () => {
    render(<StorePage />);

    // The card's own onClick is mouse-only, so the title has to carry the keyboard path.
    fireEvent.click(await screen.findByRole('button', { name: 'Aquarium' }));

    expect(await screen.findByText('store.spec.widget')).toBeInTheDocument();
  });

  it('keeps Install from opening the page it sits on', async () => {
    installStoreApp.mockResolvedValue({ appId: app.id, version: '1.0.2', ok: true });
    render(<StorePage />);

    fireEvent.click(await screen.findByRole('button', { name: 'store.install' }));

    // Still the storefront: the click must not bubble to the card.
    expect(screen.getByText('store.banner.title')).toBeInTheDocument();
    await waitFor(() => expect(installStoreApp).toHaveBeenCalled());
  });
});

describe('StorePage row card', () => {
  const clock = { ...app, id: 'com.example.clock', name: 'Clock', description: 'A clock for your panel. It ticks.' };

  beforeEach(() => {
    fetchStoreApps.mockResolvedValue([app, clock]);
  });

  it('opens the app page from anywhere on a row past the featured app', async () => {
    render(<StorePage />);

    fireEvent.click(await screen.findByText('A clock for your panel'));

    expect(await screen.findByText('store.spec.widget')).toBeInTheDocument();
    expect(fetchStoreApp).toHaveBeenLastCalledWith('com.example.clock', { locale: 'en' });
  });

  it('leaves a keyboard route to the app page: the row title is a real control', async () => {
    render(<StorePage />);

    // The row card uses disableInteractiveRole, so its onClick is mouse-only.
    fireEvent.click(await screen.findByRole('button', { name: 'Clock' }));

    expect(await screen.findByText('store.spec.widget')).toBeInTheDocument();
  });

  it('keeps a row\'s Install from opening the page it sits on', async () => {
    installStoreApp.mockResolvedValue({ appId: clock.id, version: '1.0.2', ok: true });
    render(<StorePage />);

    const installs = await screen.findAllByRole('button', { name: 'store.install' });
    fireEvent.click(installs[1]);

    expect(screen.getByText('store.banner.title')).toBeInTheDocument();
    await waitFor(() => expect(installStoreApp).toHaveBeenCalledWith(expect.objectContaining({ id: clock.id })));
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

  it('names the installed version, and never offers Delete here (that lives under Manage purchased apps)', async () => {
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

  it('lists the round tile as the 2x2 every 2x2 widget already covers', async () => {
    fetchStoreApp.mockResolvedValue({
      ...detail,
      latest: { ...version, sizes: ['2x2', '4x2', '2x2round'] },
    });
    render(<StorePage tab={app.id} onTabChange={vi.fn()} />);

    expect(await screen.findByText('2x2 · 4x2')).toBeInTheDocument();
    expect(screen.queryByText(/2x2round/)).not.toBeInTheDocument();
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

  it('names each screenshot and puts the full description below them, each under its heading', async () => {
    fetchStoreApp.mockResolvedValue({
      ...detail,
      screenshots: ['/apps-api/store/media/com.hellonexus.aquarium/media/one.png'],
    });
    render(<StorePage tab={app.id} onTabChange={vi.fn()} />);

    expect(await screen.findByAltText('store.screenshotAlt name=Aquarium index=1')).toBeInTheDocument();
    expect(screen.getByText(/Tap the water/)).toBeInTheDocument();
    const headings = screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent);
    expect(headings).toEqual(['store.section.preview', 'store.section.description']);
  });

  it('lets the reader select the app name and the description, which the app chrome otherwise blocks', async () => {
    fetchStoreApp.mockResolvedValue(detail);
    render(<StorePage tab={app.id} onTabChange={vi.fn()} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Aquarium' })).toHaveClass('selectable');
    expect(screen.getByText(/Tap the water/)).toHaveClass('selectable');
  });

  it('shows a screenshot arrow only toward screenshots past that edge', async () => {
    const proto = HTMLElement.prototype;
    const saved = ['clientWidth', 'scrollWidth'].map(k => [k, Object.getOwnPropertyDescriptor(proto, k)] as const);
    Object.defineProperty(proto, 'clientWidth', { configurable: true, get: () => 800 });
    Object.defineProperty(proto, 'scrollWidth', { configurable: true, get: () => 1600 });
    const scrollBy = vi.fn();
    proto.scrollBy = scrollBy;
    try {
      fetchStoreApp.mockResolvedValue({ ...detail, screenshots: ['/a.png', '/b.png', '/c.png', '/d.png'] });
      render(<StorePage tab={app.id} onTabChange={vi.fn()} />);

      fireEvent.click(await screen.findByRole('button', { name: 'common.pager.next' }));
      expect(scrollBy).toHaveBeenCalledWith({ left: 720, behavior: 'smooth' });
      expect(screen.queryByRole('button', { name: 'common.pager.prev' })).not.toBeInTheDocument();

      const row = screen.getByAltText('store.screenshotAlt name=Aquarium index=1').parentElement!;
      row.scrollLeft = 800;
      fireEvent.scroll(row);
      const prev = await screen.findByRole('button', { name: 'common.pager.prev' });
      expect(screen.queryByRole('button', { name: 'common.pager.next' })).not.toBeInTheDocument();
      // The pressed arrow unmounted at the end, so focus lands on the other one instead of the body.
      expect(document.activeElement).toBe(prev);

      // Later scrolling never pulls focus back from wherever the user moved it.
      const install = screen.getByRole('button', { name: 'store.install' });
      install.focus();
      row.scrollLeft = 790;
      fireEvent.scroll(row);
      row.scrollLeft = 800;
      fireEvent.scroll(row);
      expect(document.activeElement).toBe(install);
    } finally {
      for (const [k, d] of saved) if (d) Object.defineProperty(proto, k, d); else delete (proto as unknown as Record<string, unknown>)[k];
      delete (proto as Partial<HTMLElement>).scrollBy;
    }
  });

  it('shows no Preview heading for an app without screenshots', async () => {
    render(<StorePage tab={app.id} onTabChange={vi.fn()} />);

    expect(await screen.findByText('store.section.description')).toBeInTheDocument();
    expect(screen.queryByText('store.section.preview')).not.toBeInTheDocument();
  });

  it('links a URL in the description, without its trailing period, through the system browser', async () => {
    fetchStoreApp.mockResolvedValue({
      ...detail,
      description: 'Feed the fish.\n\nGet the tank at https://example.com/tank.',
    });
    render(<StorePage tab={app.id} onTabChange={vi.fn()} />);

    const link = await screen.findByRole('link', { name: 'https://example.com/tank' });
    expect(link).toHaveAttribute('href', 'https://example.com/tank');
    fireEvent.click(link);
    expect(openExternalUrl).toHaveBeenCalledWith('https://example.com/tank');

    openExternalUrl.mockClear();
    const middle = new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 });
    fireEvent(link, middle);
    expect(middle.defaultPrevented).toBe(true);
    expect(openExternalUrl).toHaveBeenCalledWith('https://example.com/tank');
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

describe('StorePage launch day', () => {
  const inDays = (days: number) => new Date(Date.now() + days * 86400_000).toISOString();
  const launchText = (iso: string) => {
    const at = new Date(iso);
    const year = at.getFullYear() === new Date().getFullYear() ? undefined : 'numeric';
    return at.toLocaleString('en', { month: 'long', day: 'numeric', year, hour: 'numeric', minute: '2-digit' });
  };

  it('replaces Install with the launch day for an app that is not out yet', async () => {
    const at = inDays(30);
    fetchStoreApps.mockResolvedValue([{ ...app, releaseDate: at }]);
    render(<StorePage />);

    const day = launchText(at);
    expect(await screen.findByText(`store.comingSoon date=${day}`)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'store.install' })).not.toBeInTheDocument();
  });

  it('carries the launch day onto the app page too', async () => {
    const at = inDays(30);
    fetchStoreApp.mockResolvedValue({ ...detail, releaseDate: at });
    render(<StorePage tab={app.id} onTabChange={vi.fn()} />);

    const day = launchText(at);
    expect(await screen.findByText(`store.comingSoon date=${day}`)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'store.install' })).not.toBeInTheDocument();
  });

  it('offers Install again once the launch day has passed', async () => {
    fetchStoreApps.mockResolvedValue([{ ...app, releaseDate: inDays(-1) }]);
    render(<StorePage />);

    expect(await screen.findByRole('button', { name: 'store.install' })).toBeInTheDocument();
  });

  it('swaps in Install at the launch moment on a page left open', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      fetchStoreApps.mockResolvedValue([{ ...app, releaseDate: inDays(1) }]);
      render(<StorePage />);
      expect(await screen.findByText(/^store\.comingSoon/)).toBeInTheDocument();

      await act(async () => { vi.advanceTimersByTime(86400_000 + 1000); });

      expect(await screen.findByRole('button', { name: 'store.install' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps waiting for a launch beyond the longest single timeout', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      fetchStoreApps.mockResolvedValue([{ ...app, releaseDate: inDays(30) }]);
      render(<StorePage />);
      expect(await screen.findByText(/^store\.comingSoon/)).toBeInTheDocument();

      await act(async () => { vi.advanceTimersByTime(25 * 86400_000); });
      expect(screen.queryByRole('button', { name: 'store.install' })).not.toBeInTheDocument();
      await act(async () => { vi.advanceTimersByTime(5 * 86400_000 + 1000); });

      expect(await screen.findByRole('button', { name: 'store.install' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('offers Install for an app that never set a launch day', async () => {
    fetchStoreApps.mockResolvedValue([{ ...app, releaseDate: null }]);
    render(<StorePage />);

    expect(await screen.findByRole('button', { name: 'store.install' })).toBeInTheDocument();
  });

  it('ignores a launch day it cannot read rather than hiding the app behind it', async () => {
    fetchStoreApps.mockResolvedValue([{ ...app, releaseDate: 'not-a-date' }]);
    render(<StorePage />);

    expect(await screen.findByRole('button', { name: 'store.install' })).toBeInTheDocument();
  });
});

describe('StorePage language', () => {
  it('asks the catalog for listing copy in the UI language, on the storefront and on an app page', async () => {
    i18n.language = 'it';
    try {
      const { rerender } = render(<StorePage tab={app.id} onTabChange={vi.fn()} />);
      await screen.findByText('store.spec.widget');
      expect(fetchStoreApps).toHaveBeenCalledWith({ locale: 'it' });
      expect(fetchStoreApp).toHaveBeenCalledWith(app.id, { locale: 'it' });
      // A language switch asks again, in the new language.
      i18n.language = 'de';
      rerender(<StorePage tab={app.id} onTabChange={vi.fn()} />);
      await waitFor(() => expect(fetchStoreApp).toHaveBeenLastCalledWith(app.id, { locale: 'de' }));
      expect(fetchStoreApps).toHaveBeenLastCalledWith({ locale: 'de' });
    } finally {
      i18n.language = 'en';
    }
  });
});
