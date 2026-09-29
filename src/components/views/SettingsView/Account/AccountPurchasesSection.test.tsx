import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AccountPurchasesSection } from './AccountPurchasesSection';
import type { StoreApp, StorePurchase, StoreVersion } from '../../../../api/store';

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      let text = key;
      if (params) for (const [k, v] of Object.entries(params)) text += ` ${k}=${v}`;
      return text;
    },
  }),
}));

const fetchStoreLibrary = vi.fn();
const fetchStoreApps = vi.fn();
const installStoreApp = vi.fn();
const fetchPendingStoreUpdates = vi.fn();
const approvePendingStoreUpdate = vi.fn();
vi.mock('../../../../api/store', () => ({
  APPS_CHANGED_TOPIC: 'apps/changed',
  fetchStoreLibrary: () => fetchStoreLibrary(),
  fetchStoreApps: () => fetchStoreApps(),
  fetchPendingStoreUpdates: () => fetchPendingStoreUpdates(),
  approvePendingStoreUpdate: (update: unknown) => approvePendingStoreUpdate(update),
  installStoreApp: (app: unknown) => installStoreApp(app),
}));
vi.mock('../../../../widgets/marketplaceRegistry', () => ({
  loadMarketplaceApps: () => Promise.resolve(),
}));

const release = (version: string): StoreVersion => ({
  version, sha256: 'abc', size: 1, minNexusVersion: '3.0.0', hasWidget: true, hasPage: false,
  requiresTouch: false, sizes: [], surfaces: [], releasedAt: '2026-09-01T00:00:00.000Z',
});
const catalogApp = (id: string, version: string) => ({ id, latest: release(version) } as StoreApp);

const purchase = (over: Partial<StorePurchase> = {}): StorePurchase => ({
  appId: 'com.hellonexus.aquarium',
  name: 'Aquarium',
  tagline: 'Feed the fish',
  description: '',
  iconUrl: null,
  acquiredAt: '2026-08-29T16:33:42.104Z',
  priceCents: 0,
  listed: true,
  installedVersion: '1.0.2',
  installedAt: '2026-08-30T10:00:00.000Z',
  sizeBytes: 2 * 1024 * 1024,
  ...over,
});

beforeEach(() => {
  fetchStoreLibrary.mockReset();
  fetchStoreApps.mockReset().mockResolvedValue([]);
  installStoreApp.mockReset();
  fetchPendingStoreUpdates.mockReset().mockResolvedValue([]);
  approvePendingStoreUpdate.mockReset();
});

describe('AccountPurchasesSection updates', () => {
  it('offers Update when the catalog has a newer release, and installs that release', async () => {
    fetchStoreLibrary.mockResolvedValue({ signedIn: true, offline: false, purchases: [purchase()] });
    fetchStoreApps.mockResolvedValue([catalogApp('com.hellonexus.aquarium', '1.1.0')]);
    installStoreApp.mockResolvedValue({ appId: 'com.hellonexus.aquarium', version: '1.1.0', ok: true });
    render(<AccountPurchasesSection />);

    expect(await screen.findByText('account.purchases.updateAvailable version=1.1.0')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'store.update' }));
    await waitFor(() => expect(installStoreApp).toHaveBeenCalledWith({ id: 'com.hellonexus.aquarium', latest: release('1.1.0') }));
  });

  it('shows up to date and no update controls when on the latest release', async () => {
    fetchStoreLibrary.mockResolvedValue({ signedIn: true, offline: false, purchases: [purchase()] });
    fetchStoreApps.mockResolvedValue([catalogApp('com.hellonexus.aquarium', '1.0.2')]);
    render(<AccountPurchasesSection />);

    expect(await screen.findByText('account.purchases.upToDate')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'store.update' })).not.toBeInTheDocument();
    expect(screen.queryByText(/account.purchases.updateAll/)).not.toBeInTheDocument();
  });

  it('never offers a downgrade when the installed version is newer than the catalog', async () => {
    fetchStoreLibrary.mockResolvedValue({ signedIn: true, offline: false, purchases: [purchase({ installedVersion: '1.2.0' })] });
    fetchStoreApps.mockResolvedValue([catalogApp('com.hellonexus.aquarium', '1.1.0')]);
    render(<AccountPurchasesSection />);

    expect(await screen.findByText('account.purchases.upToDate')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'store.update' })).not.toBeInTheDocument();
  });

  it('updates every outdated app from Update all', async () => {
    fetchStoreLibrary.mockResolvedValue({
      signedIn: true, offline: false,
      purchases: [purchase(), purchase({ appId: 'com.example.clock', name: 'Clock', installedVersion: '2.0.0' })],
    });
    fetchStoreApps.mockResolvedValue([catalogApp('com.hellonexus.aquarium', '1.1.0'), catalogApp('com.example.clock', '2.1.0')]);
    installStoreApp.mockResolvedValue({ appId: '', version: '', ok: true });
    render(<AccountPurchasesSection />);

    fireEvent.click(await screen.findByRole('button', { name: 'account.purchases.updateAll count=2' }));
    await waitFor(() => expect(installStoreApp).toHaveBeenCalledTimes(2));
    expect(installStoreApp).toHaveBeenCalledWith({ id: 'com.example.clock', latest: release('2.1.0') });
  });
});

describe('AccountPurchasesSection', () => {
  it('lists the purchase with its version and size on disk, and no install date', async () => {
    fetchStoreLibrary.mockResolvedValue({ signedIn: true, offline: false, purchases: [purchase()] });
    render(<AccountPurchasesSection onOpenStoreApp={vi.fn()} />);

    expect(await screen.findByText('Aquarium')).toBeInTheDocument();
    expect(screen.getByText('1.0.2')).toBeInTheDocument();
    expect(screen.getByText('2 MB')).toBeInTheDocument();
    expect(screen.queryByText('account.purchases.installed')).toBeNull();
    expect(screen.getByText('account.purchases.free')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'account.purchases.uninstall' })).toBeInTheDocument();
  });

  it('offers no uninstall for an app acquired on another machine', async () => {
    fetchStoreLibrary.mockResolvedValue({
      signedIn: true,
      offline: false,
      purchases: [purchase({ installedVersion: null, installedAt: null, sizeBytes: null })],
    });
    render(<AccountPurchasesSection onOpenStoreApp={vi.fn()} />);

    expect(await screen.findByText('account.purchases.notInstalled')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'account.purchases.uninstall' })).not.toBeInTheDocument();
  });

  it('says so when nothing has been downloaded', async () => {
    fetchStoreLibrary.mockResolvedValue({ signedIn: true, offline: false, purchases: [] });
    render(<AccountPurchasesSection />);

    expect(await screen.findByText('account.purchases.empty')).toBeInTheDocument();
  });
});

describe('AccountPurchasesSection store link', () => {
  it('links a local-only row to the store, since no verdict is not "delisted"', async () => {
    fetchStoreLibrary.mockResolvedValue({
      signedIn: false,
      offline: false,
      purchases: [purchase({ acquiredAt: null, listed: null })],
    });
    render(<AccountPurchasesSection onOpenStoreApp={vi.fn()} />);

    expect(await screen.findByRole('button', { name: 'account.purchases.viewInStore' })).toBeInTheDocument();
  });

  it('hides the link for an app the store has delisted', async () => {
    fetchStoreLibrary.mockResolvedValue({
      signedIn: true,
      offline: false,
      purchases: [purchase({ listed: false })],
    });
    render(<AccountPurchasesSection onOpenStoreApp={vi.fn()} />);

    await screen.findByText('Aquarium');
    expect(screen.queryByRole('button', { name: 'account.purchases.viewInStore' })).toBeNull();
  });
});

describe('AccountPurchasesSection held updates', () => {
  const held = {
    appId: 'com.hellonexus.aquarium', fromVersion: '1.0.2', version: '1.1.0',
    requestedCapabilities: ['appData', 'audio'], newCapabilities: ['audio'],
  };

  it('offers Update needs permission, shows the new capability marked, and approves the requested set', async () => {
    fetchStoreLibrary.mockResolvedValue({ signedIn: true, offline: false, purchases: [purchase()] });
    fetchPendingStoreUpdates.mockResolvedValue([held]);
    approvePendingStoreUpdate.mockResolvedValue({ appId: held.appId, version: '1.1.0', ok: true });
    render(<AccountPurchasesSection />);

    fireEvent.click(await screen.findByRole('button', { name: 'store.consent.updateNeedsPermission' }));
    expect(screen.getByText('store.consent.cap.audio')).toBeInTheDocument();
    expect(screen.getAllByText('store.consent.new')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'store.consent.allow' }));
    await waitFor(() => expect(approvePendingStoreUpdate).toHaveBeenCalledWith(held));
  });

  it('asks again with the service list when the downloaded manifest asks for more than the catalog listed', async () => {
    fetchStoreLibrary.mockResolvedValue({ signedIn: true, offline: false, purchases: [purchase()] });
    fetchPendingStoreUpdates.mockResolvedValue([held]);
    const wider = ['appData', 'audio', 'net.fetch:example.com'];
    approvePendingStoreUpdate
      .mockResolvedValueOnce({ appId: held.appId, version: '1.1.0', ok: false, reason: 'consent_required', requestedCapabilities: wider })
      .mockResolvedValueOnce({ appId: held.appId, version: '1.1.0', ok: true });
    render(<AccountPurchasesSection />);

    fireEvent.click(await screen.findByRole('button', { name: 'store.consent.updateNeedsPermission' }));
    fireEvent.click(screen.getByRole('button', { name: 'store.consent.allow' }));
    fireEvent.click(await screen.findByRole('button', { name: 'store.consent.allow' }));

    await waitFor(() => expect(approvePendingStoreUpdate).toHaveBeenLastCalledWith({ ...held, requestedCapabilities: wider }));
  });

  it('does not approve when the dialog is cancelled', async () => {
    fetchStoreLibrary.mockResolvedValue({ signedIn: true, offline: false, purchases: [purchase()] });
    fetchPendingStoreUpdates.mockResolvedValue([held]);
    render(<AccountPurchasesSection />);

    fireEvent.click(await screen.findByRole('button', { name: 'store.consent.updateNeedsPermission' }));
    fireEvent.click(screen.getByRole('button', { name: 'confirm.cancel' }));
    expect(approvePendingStoreUpdate).not.toHaveBeenCalled();
  });
});
