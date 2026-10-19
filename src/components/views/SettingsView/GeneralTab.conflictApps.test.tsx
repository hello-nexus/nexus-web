import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GeneralTab } from './GeneralTab';
import {
  fetchConflictCatalog, fetchDynamicLighting, setConflictWhitelisted,
  type SetConflictWhitelistedResponse,
} from '../../../api/conflicts';
import { useConflictApps } from '../../../hooks/useConflictApps';
import { ToastProvider } from '../../common/Toast/Toast';
import type { NexusSettings } from '../../../lib/settings';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../../api/conflicts', () => ({
  HYTE_NEXUS2_CONFLICT_ID: 'hyte-nexus-2',
  fetchConflictCatalog: vi.fn(),
  fetchDynamicLighting: vi.fn(),
  setDynamicLighting: vi.fn(),
  setConflictWhitelisted: vi.fn(),
}));
vi.mock('../../../hooks/useConflictApps', () => ({ useConflictApps: vi.fn() }));
vi.mock('../../../api/fastStartup', () => ({
  fetchFastStartup: vi.fn().mockResolvedValue(null),
  setFastStartup: vi.fn(),
}));
vi.mock('../../../api/autoStart', () => ({
  fetchAutoStart: vi.fn().mockResolvedValue(null),
  setAutoStart: vi.fn(),
}));
vi.mock('../../../api/service', () => ({
  postService: vi.fn().mockResolvedValue(null),
  fetchService: vi.fn().mockResolvedValue(null),
  isRemoteOrigin: false,
  isRemotePaired: false,
}));
vi.mock('../../../hooks/useFlashStatus', () => ({
  useFlashStatus: () => ({ status: null }),
}));

const CATALOG = [{ id: 'armoury-crate', displayName: 'Armoury Crate', category: 'lighting' }];
const OK: SetConflictWhitelistedResponse = { error: false, msg: '' };
const withList = (ids: string[]) => ({ general: { conflictAutoKillExclusions: ids } }) as unknown as NexusSettings;
const tab = (ids: string[]) => (
  <ToastProvider><GeneralTab settings={withList(ids)} updateGeneral={vi.fn()} serviceOnline platform="windows" /></ToastProvider>
);
const state = () => screen.getByLabelText('Armoury Crate').getAttribute('aria-checked');

async function openModal() {
  const view = render(tab([]));
  fireEvent.click(screen.getByText('settings.conflictApps.manage.action'));
  const toggle = await screen.findByLabelText('Armoury Crate');
  return { toggle, rerender: (ids: string[]) => view.rerender(tab(ids)) };
}

function deferred() {
  const releases: Array<(r: SetConflictWhitelistedResponse | null) => void> = [];
  vi.mocked(setConflictWhitelisted).mockImplementation(() => new Promise(resolve => { releases.push(resolve); }));
  return releases;
}

describe('GeneralTab Manage conflicting apps', () => {
  beforeEach(() => {
    vi.mocked(fetchConflictCatalog).mockResolvedValue(CATALOG);
    vi.mocked(fetchDynamicLighting).mockResolvedValue({ available: false, enabled: false, deviceCount: 0 });
    vi.mocked(useConflictApps).mockReturnValue({ conflicts: [], ready: true });
    vi.mocked(setConflictWhitelisted).mockReset();
  });

  it('flips the toggle at once, before the service answers', async () => {
    vi.mocked(setConflictWhitelisted).mockReturnValue(new Promise(() => {}));
    const { toggle } = await openModal();
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    expect(screen.getByLabelText('Armoury Crate').getAttribute('aria-checked')).toBe('false');
    await waitFor(() => expect(setConflictWhitelisted).toHaveBeenCalledWith('armoury-crate', true));
  });

  it('reverts the toggle and shows the toast when the write fails', async () => {
    vi.mocked(setConflictWhitelisted).mockResolvedValue(null);
    const { toggle } = await openModal();
    fireEvent.click(toggle);
    expect(await screen.findByText('settings.conflictApps.saveFailed')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Armoury Crate').getAttribute('aria-checked')).toBe('true'));
  });

  it('ends in the second click state and sends the writes in order', async () => {
    const releases: Array<() => void> = [];
    vi.mocked(setConflictWhitelisted).mockImplementation(() => new Promise(resolve => {
      releases.push(() => resolve(OK));
    }));
    const { toggle } = await openModal();
    fireEvent.click(toggle);
    fireEvent.click(screen.getByLabelText('Armoury Crate'));
    expect(screen.getByLabelText('Armoury Crate').getAttribute('aria-checked')).toBe('true');
    await waitFor(() => expect(setConflictWhitelisted).toHaveBeenCalledTimes(1));
    await act(async () => { releases[0](); });
    await waitFor(() => expect(setConflictWhitelisted).toHaveBeenCalledTimes(2));
    expect(vi.mocked(setConflictWhitelisted).mock.calls.map(c => c[1])).toEqual([true, false]);
    await act(async () => { releases[1](); });
    expect(screen.getByLabelText('Armoury Crate').getAttribute('aria-checked')).toBe('true');
  });

  it('keeps the click while its write is in flight, even when a list read disagrees', async () => {
    deferred();
    const { toggle, rerender } = await openModal();
    fireEvent.click(toggle);
    rerender([]);
    expect(state()).toBe('false');
  });

  it('shows the service value once the list agrees after the write', async () => {
    const releases = deferred();
    const { toggle, rerender } = await openModal();
    fireEvent.click(toggle);
    await waitFor(() => expect(releases).toHaveLength(1));
    await act(async () => { releases[0](OK); });
    rerender(['armoury-crate']);
    expect(state()).toBe('false');
    rerender([]);
    expect(state()).toBe('true');
  });

  it('drops a settled override on the next list even when it disagrees', async () => {
    const releases = deferred();
    const { toggle, rerender } = await openModal();
    fireEvent.click(toggle);
    await waitFor(() => expect(releases).toHaveLength(1));
    await act(async () => { releases[0](OK); });
    expect(state()).toBe('false');
    rerender([]);
    expect(state()).toBe('true');
  });

  it('keeps the later click when an earlier queued write fails', async () => {
    const releases = deferred();
    const { toggle } = await openModal();
    fireEvent.click(toggle);
    fireEvent.click(screen.getByLabelText('Armoury Crate'));
    await waitFor(() => expect(releases).toHaveLength(1));
    await act(async () => { releases[0](null); });
    expect(await screen.findByText('settings.conflictApps.saveFailed')).toBeInTheDocument();
    expect(state()).toBe('true');
    await waitFor(() => expect(releases).toHaveLength(2));
    await act(async () => { releases[1](OK); });
    expect(vi.mocked(setConflictWhitelisted).mock.calls.map(c => c[1])).toEqual([true, false]);
  });
});
