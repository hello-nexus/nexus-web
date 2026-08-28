import { fireEvent, render, screen } from '@testing-library/react';
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
vi.mock('./CloudProfilesSection', () => ({
  CloudProfilesSection: () => <div>CLOUD_PROFILES</div>,
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
    expect(screen.queryByText('CLOUD_PROFILES')).not.toBeInTheDocument();
  });

  it('shows cloud management on its own tab', () => {
    renderView('cloud');

    expect(screen.getByText('CLOUD_PROFILES')).toBeInTheDocument();
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
