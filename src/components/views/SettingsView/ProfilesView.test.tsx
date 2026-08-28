import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProfilesView } from './ProfilesView';
import type { UseProfilesResult } from '../../../hooks/useProfiles';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    language: 'en',
    t: (key: string) => key,
  }),
}));

vi.mock('./ProfilesTab', () => ({
  ProfilesTab: () => <div>LOCAL_PROFILES</div>,
}));
const accountsResult = vi.fn(() => ({ activeAccountId: 'acct-1', activeAccount: null, refresh: vi.fn() }));
vi.mock('../../../hooks/useCloudAccounts', () => ({
  useCloudAccounts: () => accountsResult(),
}));

let reportLoading: ((loading: boolean) => void) | undefined;
vi.mock('./CloudProfilesSection', () => ({
  CloudProfilesSection: ({ reloadToken, onLoadingChange }: {
    reloadToken?: number;
    onLoadingChange?: (loading: boolean) => void;
  }) => {
    reportLoading = onLoadingChange;
    return <div>CLOUD_PROFILES token={String(reloadToken)}</div>;
  },
}));

const PROFILES = {
  profiles: [{ id: 'p1', name: 'Main', createdAt: '', updatedAt: '' }],
  activeId: 'p1',
  refresh: vi.fn(),
} as unknown as UseProfilesResult;

function renderView(tab: string | null, onTabChange = vi.fn()) {
  render(
    <ProfilesView serviceOnline profiles={PROFILES} tab={tab} onTabChange={onTabChange} />,
  );
  return onTabChange;
}

describe('ProfilesView tabs', () => {
  it('shows local profiles by default and keeps cloud out of that page', () => {
    renderView(null);

    expect(screen.getByText('LOCAL_PROFILES')).toBeInTheDocument();
    expect(screen.queryByText(/CLOUD_PROFILES/)).not.toBeInTheDocument();
  });

  it('shows cloud management on its own tab', () => {
    renderView('cloud');

    expect(screen.getByText(/CLOUD_PROFILES/)).toBeInTheDocument();
    expect(screen.queryByText('LOCAL_PROFILES')).not.toBeInTheDocument();
  });

  it('reports the tab change so the route segment follows', () => {
    const onTabChange = renderView('local');

    fireEvent.click(screen.getByRole('tab', { name: 'profile.tab.cloud' }));

    expect(onTabChange).toHaveBeenCalledWith('cloud', expect.anything());
  });

  it('falls back to local for an unknown route segment', () => {
    renderView('nonsense');

    expect(screen.getByText('LOCAL_PROFILES')).toBeInTheDocument();
  });
});

describe('ProfilesView cloud refresh', () => {
  it('hides the refresh control while signed out', () => {
    accountsResult.mockReturnValueOnce({ activeAccountId: null, activeAccount: null, refresh: vi.fn() });
    render(
      <ProfilesView serviceOnline profiles={PROFILES} tab="cloud" onTabChange={vi.fn()} />,
    );
    // Nothing to re-read signed out; the page is just the sign-in prompt.
    expect(screen.queryByRole('button', { name: 'profile.cloud.refresh' })).not.toBeInTheDocument();
  });

  it('spins only while a read is in flight', async () => {
    render(
      <ProfilesView serviceOnline profiles={PROFILES} tab="cloud" onTabChange={vi.fn()} />,
    );
    const button = () => screen.getByRole('button', { name: 'profile.cloud.refresh' });
    expect(button()).not.toHaveAttribute('data-loading');

    await act(async () => { reportLoading?.(true); });
    expect(button()).toHaveAttribute('data-loading', 'true');
    expect(button()).toBeDisabled();

    await act(async () => { reportLoading?.(false); });
    expect(button()).not.toHaveAttribute('data-loading');
    expect(button()).not.toBeDisabled();
  });

  it('bumps the reload token when the tab refresh control is pressed', () => {
    render(
      <ProfilesView serviceOnline profiles={PROFILES} tab="cloud" onTabChange={vi.fn()} />,
    );
    expect(screen.getByText(/token=0/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'profile.cloud.refresh' }));

    expect(screen.getByText(/token=1/)).toBeInTheDocument();
  });

  it('offers no refresh control on the local tab', () => {
    render(
      <ProfilesView serviceOnline profiles={PROFILES} tab="local" onTabChange={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: 'profile.cloud.refresh' })).not.toBeInTheDocument();
  });
});
