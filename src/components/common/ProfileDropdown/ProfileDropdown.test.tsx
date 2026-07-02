import type { ComponentProps } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProfileDropdown } from './ProfileDropdown';
import type { UseProfilesResult } from '../../../hooks/useProfiles';
import type { ProfileEntry, ProfileFetchResult, ProfileResponse } from '../../../api/profiles';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      let text = key;
      if (params) for (const [k, v] of Object.entries(params)) text += ` ${k}=${v}`;
      return text;
    },
  }),
}));

const PROFILE_A: ProfileEntry = { id: 'a', name: 'Gaming', createdAt: '', updatedAt: '' };
const PROFILE_B: ProfileEntry = { id: 'b', name: 'Work', createdAt: '', updatedAt: '' };

function ok(profile: ProfileEntry): ProfileFetchResult<ProfileResponse> {
  return { status: 200, body: { error: false, msg: 'Ok', profile } };
}

function taken(): ProfileFetchResult<ProfileResponse> {
  return { status: 409, body: { error: true, msg: 'profile_name_taken' } };
}

function buildProfiles(overrides: Partial<UseProfilesResult> = {}): UseProfilesResult {
  return {
    profiles: [PROFILE_A, PROFILE_B],
    activeId: 'a',
    switchProfile: vi.fn().mockResolvedValue(null),
    createProfile: vi.fn().mockResolvedValue(ok(PROFILE_A)),
    renameProfile: vi.fn().mockResolvedValue(ok(PROFILE_A)),
    deleteProfile: vi.fn().mockResolvedValue(undefined),
    exportProfile: vi.fn().mockResolvedValue(undefined),
    importProfile: vi.fn().mockResolvedValue(ok(PROFILE_A)),
    reorderProfiles: vi.fn(),
    refresh: vi.fn().mockResolvedValue(undefined),
    loading: false,
    ...overrides,
  };
}

function openDropdown(profiles: UseProfilesResult, extra: Partial<ComponentProps<typeof ProfileDropdown>> = {}) {
  render(
    <ProfileDropdown
      profiles={profiles}
      onPreferencesChanged={vi.fn()}
      onNavigateSettings={vi.fn()}
      {...extra}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /profile.label/ }));
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('ProfileDropdown create dialog', () => {
  it('disables the confirm button for a client-detected duplicate name', () => {
    const profiles = buildProfiles();
    openDropdown(profiles);

    fireEvent.click(screen.getByRole('button', { name: /profile.create/ }));
    fireEvent.change(screen.getByLabelText('profile.createPrompt'), { target: { value: 'Work' } });

    expect(screen.getByText('profile.duplicateName')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'confirm.ok' })).toBeDisabled();
    expect(profiles.createProfile).not.toHaveBeenCalled();
  });

  it('on a 409 profile_name_taken from the server, keeps the dialog open and shows the collision message', async () => {
    const profiles = buildProfiles({ createProfile: vi.fn().mockResolvedValue(taken()) });
    openDropdown(profiles);

    fireEvent.click(screen.getByRole('button', { name: /profile.create/ }));
    const input = screen.getByLabelText('profile.createPrompt');
    fireEvent.change(input, { target: { value: 'Streaming' } });
    fireEvent.click(screen.getByRole('button', { name: 'confirm.ok' }));

    await waitFor(() => expect(profiles.createProfile).toHaveBeenCalledWith('Streaming'));
    await waitFor(() => expect(screen.getByText('profile.duplicateName')).toBeInTheDocument());
    expect(screen.getByLabelText('profile.createPrompt')).toBeInTheDocument();
  });
});

describe('ProfileDropdown groups', () => {
  it('does not render import or export actions (moved to the Profiles settings page)', () => {
    const profiles = buildProfiles();
    openDropdown(profiles);

    expect(screen.queryByText('profile.import')).not.toBeInTheDocument();
    expect(screen.queryByText('profile.export')).not.toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).not.toBeInTheDocument();
  });

  it('labels the account entry with the Account group header when onNavigateAccount is provided', () => {
    const profiles = buildProfiles();
    openDropdown(profiles, { onNavigateAccount: vi.fn() });

    expect(screen.getByText('account.title')).toBeInTheDocument();
    expect(screen.getByText('profile.header')).toBeInTheDocument();
  });

  it('omits the Account group header when onNavigateAccount is not provided', () => {
    const profiles = buildProfiles();
    openDropdown(profiles);

    expect(screen.queryByText('account.title')).not.toBeInTheDocument();
    expect(screen.getByText('profile.header')).toBeInTheDocument();
  });
});

describe('ProfileDropdown account entry', () => {
  it('renders no account entry when onNavigateAccount is not provided', () => {
    const profiles = buildProfiles();
    openDropdown(profiles);

    expect(screen.queryByText('account.dropdown.logIn')).not.toBeInTheDocument();
  });

  it('signed out: shows a Log in row that navigates to the account page and closes', () => {
    const profiles = buildProfiles();
    const onNavigateAccount = vi.fn();
    openDropdown(profiles, { onNavigateAccount });

    fireEvent.click(screen.getByText('account.dropdown.logIn'));

    expect(onNavigateAccount).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('account.dropdown.logIn')).not.toBeInTheDocument();
  });

  it('signed in: shows the account avatar and username instead of the Log in row', () => {
    const profiles = buildProfiles();
    const onNavigateAccount = vi.fn();
    openDropdown(profiles, {
      onNavigateAccount, signedIn: true, accountUsername: 'nicola', accountInitial: 'N',
    });

    expect(screen.queryByText('account.dropdown.logIn')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('nicola'));

    expect(onNavigateAccount).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('nicola')).not.toBeInTheDocument();
  });
});
