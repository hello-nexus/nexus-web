import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudProfilesSection } from './CloudProfilesSection';
import type { UseCloudAccountsResult } from '../../../hooks/useCloudAccounts';
import type { UseSyncStatusResult } from '../../../hooks/useSyncStatus';
import type { UseProfilesResult } from '../../../hooks/useProfiles';
import { deleteCloudProfile, fetchCloudLibrary, importCloudProfile } from '../../../api/cloud';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    language: 'en',
    t: (key: string, params?: Record<string, string | number>) => {
      let text = key;
      if (params) for (const [k, v] of Object.entries(params)) text += ` ${k}=${v}`;
      return text;
    },
  }),
}));

const accountsResult = vi.fn<() => UseCloudAccountsResult>();
const syncResult = vi.fn<() => UseSyncStatusResult>();

vi.mock('../../../hooks/useCloudAccounts', () => ({
  useCloudAccounts: () => accountsResult(),
}));
vi.mock('../../../hooks/useSyncStatus', () => ({
  useSyncStatus: () => syncResult(),
}));
vi.mock('../../../api/cloud', () => ({
  fetchCloudLibrary: vi.fn(),
  importCloudProfile: vi.fn(),
  deleteCloudProfile: vi.fn(),
}));

const SIGNED_OUT: UseCloudAccountsResult = { activeAccountId: null, activeAccount: null, refresh: vi.fn() };
const SIGNED_IN: UseCloudAccountsResult = {
  activeAccountId: 'acct-1',
  activeAccount: { accountId: 'acct-1', email: 'a@example.com', username: 'alpha', avatar: null, isPrivate: false, emailVerified: true },
  refresh: vi.fn(),
};

const BASE_SYNC: UseSyncStatusResult = {
  state: 'idle',
  lastSyncAt: null,
  conflicts: [],
  profiles: [],
  syncNow: vi.fn().mockResolvedValue(undefined),
  resolve: vi.fn(),
  refresh: vi.fn(),
};

const PROFILES = {
  profiles: [{ id: 'p1', name: 'Main', createdAt: '', updatedAt: '' }],
  activeId: 'p1',
  refresh: vi.fn(),
} as unknown as UseProfilesResult;

function renderSection() {
  return render(<CloudProfilesSection profiles={PROFILES} />);
}

const LIBRARY = {
  machines: [
    {
      installId: 'this-one', hostname: 'T1', isThisMachine: true, lastSeenAt: 't',
      profiles: [{ profileId: 'p1', name: 'Default', revision: 1, sizeBytes: 10, updatedAt: 't' }],
    },
    {
      installId: 'other', hostname: 'HYTEY70', isThisMachine: false, lastSeenAt: 't',
      profiles: [{ profileId: 'p2', name: 'Default', revision: 1, sizeBytes: 10, updatedAt: 't' }],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  accountsResult.mockReturnValue(SIGNED_IN);
  syncResult.mockReturnValue(BASE_SYNC);
  vi.mocked(fetchCloudLibrary).mockResolvedValue(LIBRARY);
  vi.mocked(importCloudProfile).mockResolvedValue({ status: 200, body: { error: false } });
  vi.mocked(deleteCloudProfile).mockResolvedValue({ error: false });
});

describe('CloudProfilesSection signed-out state', () => {
  it('prompts to sign in instead of showing backup controls', () => {
    accountsResult.mockReturnValue(SIGNED_OUT);
    renderSection();

    expect(screen.getByText('profile.cloud.signedOut.title')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'profile.cloud.backup.syncNow' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'profile.cloud.import.open' })).not.toBeInTheDocument();
  });
});

describe('CloudProfilesSection backup control', () => {
  function syncNowButton() {
    return screen.getByRole('button', { name: 'profile.cloud.backup.syncNow' });
  }

  it('spins from click until the triggered pass leaves the syncing state', async () => {
    const syncNow = vi.fn().mockResolvedValue(undefined);
    syncResult.mockReturnValue({ ...BASE_SYNC, syncNow });
    const { rerender } = renderSection();
    await waitFor(() => expect(syncNowButton()).toBeInTheDocument());

    fireEvent.click(syncNowButton());
    expect(syncNow).toHaveBeenCalledTimes(1);
    expect(syncNowButton()).toHaveAttribute('data-loading', 'true');

    syncResult.mockReturnValue({ ...BASE_SYNC, state: 'syncing', syncNow });
    rerender(<CloudProfilesSection profiles={PROFILES} />);
    await act(async () => { await Promise.resolve(); });
    expect(syncNowButton()).toHaveAttribute('data-loading', 'true');

    syncResult.mockReturnValue({ ...BASE_SYNC, state: 'idle', syncNow });
    rerender(<CloudProfilesSection profiles={PROFILES} />);
    await waitFor(() => {
      expect(syncNowButton()).not.toHaveAttribute('data-loading', 'true');
    });
  });

  it('regression: a status poll landing before the click resolves does not clear the spinner', async () => {
    let resolveSync: (() => void) | undefined;
    const syncNow = vi.fn().mockReturnValue(new Promise<void>(res => { resolveSync = () => res(); }));
    syncResult.mockReturnValue({ ...BASE_SYNC, syncNow });
    const { rerender } = renderSection();
    await waitFor(() => expect(syncNowButton()).toBeInTheDocument());

    fireEvent.click(syncNowButton());

    // A background poll re-renders with an already-idle status that predates
    // the click; the spinner must survive it.
    syncResult.mockReturnValue({ ...BASE_SYNC, state: 'idle', syncNow });
    rerender(<CloudProfilesSection profiles={PROFILES} />);
    await act(async () => { await Promise.resolve(); });
    expect(syncNowButton()).toHaveAttribute('data-loading', 'true');

    await act(async () => { resolveSync?.(); await Promise.resolve(); });
    await waitFor(() => {
      expect(syncNowButton()).not.toHaveAttribute('data-loading', 'true');
    });
  });
});

describe('CloudProfilesSection profile list', () => {
  it('names the owning computer on other-computer rows', async () => {
    renderSection();

    // Both machines call their profile "Default"; the machine name in the
    // other-computers section is what tells them apart.
    await waitFor(() => expect(screen.getByText('HYTEY70')).toBeInTheDocument());
    expect(screen.getAllByText('Default')).toHaveLength(2);
  });

  it('reports an import failure beside the import buttons, not under this computer', async () => {
    // A 409 body used to be discarded by postService, so the conflict showed
    // as a generic failure - and it rendered in the wrong section.
    vi.mocked(importCloudProfile).mockResolvedValue({ status: 400, body: { error: true, msg: 'nope' } });
    renderSection();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'profile.cloud.import.open' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'profile.cloud.import.open' }));

    const alert = await screen.findByRole('alert');
    const othersHeading = screen.getByText('profile.cloud.others.title');
    // The alert must sit inside the other-computers section.
    expect(othersHeading.closest('section')).toContainElement(alert);
  });

  it('separates this computer from the others and stamps its own backup time', async () => {
    syncResult.mockReturnValue({
      ...BASE_SYNC,
      profiles: [{ profileId: 'p1', name: 'Default', lastSyncedAt: '2026-08-28T02:31:10.000Z', revision: 1 }],
    });
    renderSection();

    await waitFor(() => expect(screen.getByText('profile.cloud.others.title')).toBeInTheDocument());
    // This computer's rows carry the backup stamp, not the machine name; the
    // owning machine is named only in the other-computers section.
    expect(screen.getByText(/profile\.cloud\.backup\.lastSynced/)).toBeInTheDocument();
    expect(screen.getByText('HYTEY70')).toBeInTheDocument();
    expect(screen.queryByText('T1')).not.toBeInTheDocument();
  });

  it('hides the other-computers section when nothing else has backed up', async () => {
    vi.mocked(fetchCloudLibrary).mockResolvedValue({ machines: [LIBRARY.machines[0]] });
    renderSection();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'profile.cloud.backup.syncNow' })).toBeInTheDocument();
    });
    expect(screen.queryByText('profile.cloud.others.title')).not.toBeInTheDocument();
  });

  it('offers import only on another computer profile and copies it in one click', async () => {
    renderSection();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'profile.cloud.import.open' })).toBeInTheDocument();
    });
    // One button, for the row that is not this machine.
    expect(screen.getAllByRole('button', { name: 'profile.cloud.import.open' })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'profile.cloud.import.open' }));

    await waitFor(() => {
      expect(importCloudProfile).toHaveBeenCalledWith('other', 'p2', false);
    });
  });

  it('marks the row as imported once the copy lands', async () => {
    renderSection();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'profile.cloud.import.open' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'profile.cloud.import.open' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'profile.cloud.import.done' })).toBeInTheDocument();
    });
  });

  it('asks whether to replace on a name clash and retries with replaceExisting', async () => {
    vi.mocked(importCloudProfile).mockResolvedValueOnce({ status: 409, body: { error: true, msg: 'profile_name_taken' } });
    renderSection();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'profile.cloud.import.open' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'profile.cloud.import.open' }));

    await waitFor(() => {
      expect(screen.getByText('profile.cloud.import.nameTaken.title')).toBeInTheDocument();
    });
    vi.mocked(importCloudProfile).mockResolvedValue({ status: 200, body: { error: false } });
  vi.mocked(deleteCloudProfile).mockResolvedValue({ error: false });
    fireEvent.click(screen.getByRole('button', { name: 'profile.cloud.import.nameTaken.replace' }));

    await waitFor(() => {
      expect(importCloudProfile).toHaveBeenLastCalledWith('other', 'p2', true);
    });
  });

  it('surfaces the local profile cap instead of failing silently', async () => {
    vi.mocked(importCloudProfile).mockResolvedValue({ status: 400, body: { error: true, msg: 'profile_limit_reached' } });
    renderSection();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'profile.cloud.import.open' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'profile.cloud.import.open' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('profile.cloud.import.error.limit');
    });
  });
});

describe('CloudProfilesSection backup that has no local profile', () => {
  // The user's scenario: everything backed up, then the local profile is
  // deleted. Its backup must offer restore + remove, not another backup.
  const ORPHANED = {
    machines: [{
      installId: 'this-one', hostname: 'T1', isThisMachine: true, lastSeenAt: 't',
      profiles: [{ profileId: 'deleted-locally', name: 'Gaming', revision: 2, sizeBytes: 10, updatedAt: 't' }],
    }],
  };

  it('offers import and remove instead of back up', async () => {
    vi.mocked(fetchCloudLibrary).mockResolvedValue(ORPHANED);
    renderSection();

    await waitFor(() => {
      expect(screen.getByText('profile.cloud.list.notOnThisComputer')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'profile.cloud.import.open' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'profile.cloud.delete.action' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'profile.cloud.backup.syncNow' })).not.toBeInTheDocument();
  });

  it('confirms before removing the backup and leaves the local profile alone', async () => {
    vi.mocked(fetchCloudLibrary).mockResolvedValue(ORPHANED);
    renderSection();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'profile.cloud.delete.action' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'profile.cloud.delete.action' }));
    await waitFor(() => {
      expect(screen.getByText('profile.cloud.delete.title')).toBeInTheDocument();
    });
    expect(deleteCloudProfile).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole('button', { name: 'profile.cloud.delete.action' })[1]);
    await waitFor(() => {
      expect(deleteCloudProfile).toHaveBeenCalledWith('this-one', 'deleted-locally');
    });
  });
});
