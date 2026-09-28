import { useRef, type CSSProperties } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../../api/onboarding', () => ({
  fetchDashboardBanner: vi.fn(),
  dismissDashboardBanner: vi.fn(),
}));

import { DASHBOARD_BANNER_KEY, DashboardBanner } from './DashboardBanner';
import { dismissDashboardBanner, fetchDashboardBanner } from '../../../api/onboarding';

const GRID_ROOT_STYLE = { '--panel-cell-size': '90px', '--panel-gap': '8px' } as CSSProperties;

function Harness({ onOpen }: { onOpen: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  return (
    <>
      <DashboardBanner gridHostRef={hostRef} onOpen={onOpen} />
      <div ref={hostRef}><div style={GRID_ROOT_STYLE} /></div>
    </>
  );
}

function renderBanner(onOpen = vi.fn()) {
  render(<Harness onOpen={onOpen} />);
  return onOpen;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(dismissDashboardBanner).mockResolvedValue({ dismissedKey: DASHBOARD_BANNER_KEY });
});

describe('DashboardBanner', () => {
  it('shows while the stored key differs from this release, one grid row tall and eight wide', async () => {
    vi.mocked(fetchDashboardBanner).mockResolvedValue({ dismissedKey: 'older' });
    renderBanner();
    const title = await screen.findByText('dashboard.banner.marketplace.title');
    const banner = title.closest('button')!.parentElement!;
    expect(banner.style.getPropertyValue('--banner-width')).toBe(`${90 * 8 + 8 * 7}px`);
    expect(banner.style.getPropertyValue('--banner-height')).toBe('90px');
  });

  it('stays hidden once this release key was dismissed', async () => {
    vi.mocked(fetchDashboardBanner).mockResolvedValue({ dismissedKey: DASHBOARD_BANNER_KEY });
    renderBanner();
    await waitFor(() => expect(fetchDashboardBanner).toHaveBeenCalled());
    expect(screen.queryByText('dashboard.banner.marketplace.title')).not.toBeInTheDocument();
  });

  it('closes and stores the key on X without opening the Marketplace', async () => {
    vi.mocked(fetchDashboardBanner).mockResolvedValue({ dismissedKey: '' });
    const onOpen = renderBanner();
    fireEvent.click(await screen.findByRole('button', { name: 'dashboard.banner.dismiss' }));
    expect(dismissDashboardBanner).toHaveBeenCalledWith(DASHBOARD_BANNER_KEY);
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.queryByText('dashboard.banner.marketplace.title')).not.toBeInTheDocument();
  });

  it('opens the Marketplace and stores the key on click', async () => {
    vi.mocked(fetchDashboardBanner).mockResolvedValue({ dismissedKey: '' });
    const onOpen = renderBanner();
    fireEvent.click(await screen.findByText('dashboard.banner.marketplace.open'));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(dismissDashboardBanner).toHaveBeenCalledWith(DASHBOARD_BANNER_KEY);
    expect(screen.queryByText('dashboard.banner.marketplace.title')).not.toBeInTheDocument();
  });
});
