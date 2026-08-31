import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AccountPurchasesSection } from './AccountPurchasesSection';
import type { StorePurchase } from '../../../../api/store';

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
vi.mock('../../../../api/store', () => ({
  fetchStoreLibrary: () => fetchStoreLibrary(),
}));

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

beforeEach(() => fetchStoreLibrary.mockReset());

describe('AccountPurchasesSection', () => {
  it('lists the purchase with its version and size on disk', async () => {
    fetchStoreLibrary.mockResolvedValue({ signedIn: true, offline: false, purchases: [purchase()] });
    render(<AccountPurchasesSection onOpenStoreApp={vi.fn()} />);

    expect(await screen.findByText('Aquarium')).toBeInTheDocument();
    expect(screen.getByText('1.0.2')).toBeInTheDocument();
    expect(screen.getByText('2 MB')).toBeInTheDocument();
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
