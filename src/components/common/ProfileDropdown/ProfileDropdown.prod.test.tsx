import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Force a production build: dev tools off.
vi.mock('../../../lib/devTools', () => ({ DEV_TOOLS: false }));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { ProfileDropdown } from './ProfileDropdown';
import type { UseProfilesResult } from '../../../hooks/useProfiles';
import type { ProfileEntry } from '../../../api/profiles';

const PROFILE_A: ProfileEntry = { id: 'a', name: 'Gaming', createdAt: '', updatedAt: '' };

const profiles: UseProfilesResult = {
  profiles: [PROFILE_A],
  activeId: 'a',
  switchProfile: vi.fn().mockResolvedValue(null),
  createProfile: vi.fn(),
  renameProfile: vi.fn(),
  deleteProfile: vi.fn(),
  exportProfile: vi.fn(),
  importProfile: vi.fn(),
  reorderProfiles: vi.fn(),
  refresh: vi.fn().mockResolvedValue(undefined),
  loading: false,
};

describe('ProfileDropdown without dev tools', () => {
  it('shows the Account group on an official build', () => {
    render(
      <ProfileDropdown
        profiles={profiles}
        onPreferencesChanged={vi.fn()}
        onNavigateSettings={vi.fn()}
        onNavigateAccount={vi.fn()}
        signedIn
        accountUsername="nicola"
        accountInitial="N"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /profile.label/ }));

    expect(screen.getByText('account.title')).toBeInTheDocument();
    expect(screen.getByText('nicola')).toBeInTheDocument();
    expect(screen.getByText('profile.header')).toBeInTheDocument();
  });
});
