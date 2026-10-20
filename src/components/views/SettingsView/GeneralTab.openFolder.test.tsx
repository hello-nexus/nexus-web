import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GeneralTab } from './GeneralTab';
import { postService } from '../../../api/service';
import type { NexusSettings } from '../../../lib/settings';

const toast = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('../../common/Toast/Toast', () => ({
  useToastSafe: () => ({ push: toast.push }),
}));
vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../../api/fastStartup', () => ({
  fetchFastStartup: vi.fn().mockResolvedValue(null),
  setFastStartup: vi.fn(),
}));
vi.mock('../../../api/autoStart', () => ({
  fetchAutoStart: vi.fn().mockResolvedValue(null),
  setAutoStart: vi.fn(),
}));
vi.mock('../../../api/service', () => ({
  postService: vi.fn(),
  fetchService: vi.fn().mockResolvedValue(null),
  isRemoteOrigin: false,
  isRemotePaired: false,
}));
vi.mock('../../../hooks/useFlashStatus', () => ({
  useFlashStatus: () => ({ status: null }),
}));

const settings = { general: {} } as unknown as NexusSettings;
const openButton = () => screen.getByRole('button', { name: 'settings.diagnostics.openDataFolderButton' });

describe('GeneralTab open data folder', () => {
  beforeEach(() => {
    toast.push.mockClear();
    vi.mocked(postService).mockReset();
  });

  it('says so when the service could not open the folder', async () => {
    vi.mocked(postService).mockResolvedValue(null);
    render(<GeneralTab settings={settings} updateGeneral={vi.fn()} serviceOnline platform="windows" />);
    fireEvent.click(openButton());
    await waitFor(() => expect(toast.push).toHaveBeenCalledWith({ title: 'common.openFolderFailed' }));
    expect(postService).toHaveBeenCalledWith('/diagnostics/open-logs', {});
  });

  it('stays quiet when the folder opened', async () => {
    const settled = Promise.resolve({ error: false, msg: 'Ok' });
    vi.mocked(postService).mockReturnValue(settled);
    render(<GeneralTab settings={settings} updateGeneral={vi.fn()} serviceOnline platform="windows" />);
    fireEvent.click(openButton());
    await waitFor(() => expect(postService).toHaveBeenCalledWith('/diagnostics/open-logs', {}));
    await settled;
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(toast.push).not.toHaveBeenCalled();
  });
});
