import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GeneralTab } from './GeneralTab';
import { fetchFastStartup, setFastStartup, type FastStartupInfo } from '../../../api/fastStartup';
import type { NexusSettings } from '../../../lib/settings';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../../api/fastStartup', () => ({
  fetchFastStartup: vi.fn(),
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

const settings = { general: {} } as unknown as NexusSettings;

function info(patch: Partial<FastStartupInfo> = {}): FastStartupInfo {
  return { supported: true, enabled: true, policyManaged: false, hibernateAvailable: true, ...patch };
}

function renderTab(platform = 'windows') {
  return render(<GeneralTab settings={settings} updateGeneral={vi.fn()} serviceOnline platform={platform} />);
}

describe('GeneralTab Fast Startup', () => {
  beforeEach(() => {
    vi.mocked(fetchFastStartup).mockReset();
    vi.mocked(setFastStartup).mockReset();
  });

  it('is hidden when the service reports it unsupported', async () => {
    vi.mocked(fetchFastStartup).mockResolvedValue(info({ supported: false }));
    renderTab();
    await waitFor(() => expect(fetchFastStartup).toHaveBeenCalled());
    expect(screen.queryByText('settings.fastStartup.label')).toBeNull();
  });

  it('is hidden when the request fails or the route is missing', async () => {
    vi.mocked(fetchFastStartup).mockResolvedValue(null);
    renderTab();
    await waitFor(() => expect(fetchFastStartup).toHaveBeenCalled());
    expect(screen.queryByText('settings.fastStartup.label')).toBeNull();
  });

  it('is not requested off Windows', () => {
    renderTab('macos');
    expect(fetchFastStartup).not.toHaveBeenCalled();
  });

  it('disables the toggle and shows the policy note when managed', async () => {
    vi.mocked(fetchFastStartup).mockResolvedValue(info({ policyManaged: true }));
    renderTab();
    expect(await screen.findByText(/settings\.fastStartup\.policyManaged/)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'settings.fastStartup.label' })).toBeDisabled();
  });

  it('shows Off, disabled, with the hibernation note when hibernation is unavailable', async () => {
    vi.mocked(fetchFastStartup).mockResolvedValue(info({ enabled: true, hibernateAvailable: false }));
    renderTab();
    expect(await screen.findByText(/settings\.fastStartup\.hibernateUnavailable/)).toBeInTheDocument();
    const toggle = screen.getByRole('switch', { name: 'settings.fastStartup.label' });
    expect(toggle).toBeDisabled();
    expect(toggle).not.toBeChecked();
  });

  it('posts the new value and adopts the echoed state', async () => {
    vi.mocked(fetchFastStartup).mockResolvedValue(info({ enabled: true }));
    vi.mocked(setFastStartup).mockResolvedValue(info({ enabled: false }));
    renderTab();
    const toggle = await screen.findByRole('switch', { name: 'settings.fastStartup.label' });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    await waitFor(() => expect(setFastStartup).toHaveBeenCalledWith(false));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'settings.fastStartup.label' })).not.toBeChecked());
  });

  it('reverts when the service refuses', async () => {
    vi.mocked(fetchFastStartup).mockResolvedValue(info({ enabled: true }));
    vi.mocked(setFastStartup).mockResolvedValue(null);
    renderTab();
    const toggle = await screen.findByRole('switch', { name: 'settings.fastStartup.label' });
    fireEvent.click(toggle);
    await waitFor(() => expect(setFastStartup).toHaveBeenCalledWith(false));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'settings.fastStartup.label' })).toBeChecked());
  });
});
