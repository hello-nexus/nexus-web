import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GeneralTab } from './GeneralTab';
import { fetchConflictCatalog, fetchDynamicLighting, setConflictWhitelisted } from '../../../api/conflicts';
import { useConflictApps } from '../../../hooks/useConflictApps';
import { ToastProvider } from '../../common/Toast/Toast';
import type { NexusSettings } from '../../../lib/settings';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../../api/conflicts', () => ({
  HYTE_NEXUS2_CONFLICT_ID: 'hyte-nexus-2',
  WINDOWS_DYNAMIC_LIGHTING_CONFLICT_ID: 'windows-dynamic-lighting',
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

describe('GeneralTab Manage conflicting apps', () => {
  beforeEach(() => {
    vi.mocked(fetchConflictCatalog).mockResolvedValue([{ id: 'armoury-crate', displayName: 'Armoury Crate', category: 'lighting' }]);
    vi.mocked(fetchDynamicLighting).mockResolvedValue({ available: false, enabled: false, deviceCount: 0 });
    vi.mocked(useConflictApps).mockReturnValue({ conflicts: [], ready: true });
    vi.mocked(setConflictWhitelisted).mockReset();
    vi.mocked(setConflictWhitelisted).mockReturnValue(new Promise(() => {}));
  });

  it('a click updates the local list at once and posts that one app', async () => {
    const updateGeneral = vi.fn();
    const settings = { general: { conflictAutoKillExclusions: ['icue'] } } as unknown as NexusSettings;
    render(<ToastProvider><GeneralTab settings={settings} updateGeneral={updateGeneral} serviceOnline platform="windows" /></ToastProvider>);
    fireEvent.click(screen.getByText('settings.conflictApps.manage.action'));
    fireEvent.click(await screen.findByLabelText('Armoury Crate'));

    expect(updateGeneral).toHaveBeenCalledWith({ conflictAutoKillExclusions: ['icue', 'armoury-crate'] });
    await waitFor(() => expect(setConflictWhitelisted).toHaveBeenCalledTimes(1));
    expect(setConflictWhitelisted).toHaveBeenCalledWith('armoury-crate', true);
  });
});
