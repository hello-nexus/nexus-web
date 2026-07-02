import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProfilesTab } from './ProfilesTab';
import type { UseProfilesResult, UseProfileSharingResult } from '../../../hooks/useProfiles';
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

vi.mock('../../../hooks/useProfiles', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../hooks/useProfiles')>();
  return {
    ...actual,
    useProfileSharing: () => ({
      config: { primaryProfileId: null, sharedCategories: [], allCategories: [] },
      loading: false,
      setPrimary: vi.fn(),
      setCategoryShared: vi.fn(),
      resetProfile: vi.fn(),
      resetCategory: vi.fn(),
      refresh: vi.fn(),
    } as unknown as UseProfileSharingResult),
  };
});

vi.mock('./SharingSection', () => ({ SharingSection: () => null }));

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

afterEach(() => {
  vi.clearAllMocks();
});

describe('ProfilesTab create dialog', () => {
  it('disables the confirm button when typing an existing profile name (client-side check)', () => {
    const profiles = buildProfiles();
    render(<ProfilesTab profiles={profiles} onPreferencesChanged={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'profile.create' }));
    const input = screen.getByLabelText('profile.createPrompt');
    fireEvent.change(input, { target: { value: 'Work' } });

    expect(screen.getByText('profile.duplicateName')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'confirm.ok' })).toBeDisabled();
    expect(profiles.createProfile).not.toHaveBeenCalled();
  });

  it('is case-insensitive and trims when checking for a client-side collision', () => {
    const profiles = buildProfiles();
    render(<ProfilesTab profiles={profiles} onPreferencesChanged={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'profile.create' }));
    const input = screen.getByLabelText('profile.createPrompt');
    fireEvent.change(input, { target: { value: '  work  ' } });

    expect(screen.getByRole('button', { name: 'confirm.ok' })).toBeDisabled();
  });

  it('calls createProfile and closes the dialog on success', async () => {
    const profiles = buildProfiles();
    render(<ProfilesTab profiles={profiles} onPreferencesChanged={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'profile.create' }));
    fireEvent.change(screen.getByLabelText('profile.createPrompt'), { target: { value: 'Streaming' } });
    fireEvent.click(screen.getByRole('button', { name: 'confirm.ok' }));

    await waitFor(() => expect(profiles.createProfile).toHaveBeenCalledWith('Streaming'));
    await waitFor(() => expect(screen.queryByLabelText('profile.createPrompt')).not.toBeInTheDocument());
  });

  it('on a 409 profile_name_taken from the server, keeps the dialog open and shows the collision message', async () => {
    const profiles = buildProfiles({ createProfile: vi.fn().mockResolvedValue(taken()) });
    render(<ProfilesTab profiles={profiles} onPreferencesChanged={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'profile.create' }));
    const input = screen.getByLabelText('profile.createPrompt');
    fireEvent.change(input, { target: { value: 'Streaming' } });
    fireEvent.click(screen.getByRole('button', { name: 'confirm.ok' }));

    await waitFor(() => expect(profiles.createProfile).toHaveBeenCalledWith('Streaming'));
    await waitFor(() => expect(screen.getByText('profile.duplicateName')).toBeInTheDocument());
    expect(screen.getByLabelText('profile.createPrompt')).toBeInTheDocument();
  });
});

function enterRenameEdit(rowIndex: number): HTMLInputElement {
  const triggers = screen.getAllByLabelText('profile.rename');
  fireEvent.click(triggers[rowIndex]);
  const input = screen.getAllByLabelText('profile.rename').find(el => el.tagName === 'INPUT');
  if (!input) throw new Error('rename input did not appear');
  return input as HTMLInputElement;
}

describe('ProfilesTab rename', () => {
  it('shows an inline error and does not call renameProfile for a client-detected duplicate', () => {
    const profiles = buildProfiles();
    render(<ProfilesTab profiles={profiles} onPreferencesChanged={vi.fn()} />);

    const input = enterRenameEdit(0); // row 0 = profile 'a' (Gaming)
    fireEvent.change(input, { target: { value: 'Work' } }); // collides with profile 'b'
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByText('profile.duplicateName')).toBeInTheDocument();
    expect(profiles.renameProfile).not.toHaveBeenCalled();
  });

  it('on a 409 profile_name_taken from the server, shows the inline collision message', async () => {
    const profiles = buildProfiles({ renameProfile: vi.fn().mockResolvedValue(taken()) });
    render(<ProfilesTab profiles={profiles} onPreferencesChanged={vi.fn()} />);

    const input = enterRenameEdit(0);
    fireEvent.change(input, { target: { value: 'Streaming' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(profiles.renameProfile).toHaveBeenCalledWith('a', 'Streaming'));
    await waitFor(() => expect(screen.getByText('profile.duplicateName')).toBeInTheDocument());
  });

  it('clears a stale error once the field is committed to a non-colliding name', () => {
    const profiles = buildProfiles();
    render(<ProfilesTab profiles={profiles} onPreferencesChanged={vi.fn()} />);

    let input = enterRenameEdit(0);
    fireEvent.change(input, { target: { value: 'Work' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('profile.duplicateName')).toBeInTheDocument();

    input = enterRenameEdit(0);
    fireEvent.change(input, { target: { value: 'Streaming' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.queryByText('profile.duplicateName')).not.toBeInTheDocument();
    expect(profiles.renameProfile).toHaveBeenCalledWith('a', 'Streaming');
  });
});

describe('ProfilesTab import', () => {
  it('shows the import-specific inline error on a 409 profile_name_taken', async () => {
    const profiles = buildProfiles({ importProfile: vi.fn().mockResolvedValue(taken()) });
    render(<ProfilesTab profiles={profiles} onPreferencesChanged={vi.fn()} />);

    const file = new File([JSON.stringify({ name: 'Gaming' })], 'profile.json', { type: 'application/json' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => expect(profiles.importProfile).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('profile.importDuplicateName')).toBeInTheDocument());
  });

  it('shows no error on a successful import', async () => {
    const profiles = buildProfiles();
    render(<ProfilesTab profiles={profiles} onPreferencesChanged={vi.fn()} />);

    const file = new File([JSON.stringify({ name: 'Gaming' })], 'profile.json', { type: 'application/json' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => expect(profiles.importProfile).toHaveBeenCalled());
    expect(screen.queryByText('profile.importDuplicateName')).not.toBeInTheDocument();
  });
});
