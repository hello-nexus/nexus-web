import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModeControls, ScreenControls } from './ModeControls';
import { openMediaFolder } from '../../../../api/mediaLibrary';
import { fetchScreenEffect, fetchScreenMonitors, setScreenEffect, startScreenMirror } from '../../../../api/lighting';

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key, language: 'en' }),
}));
const toast = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('../../../../components/common/Toast/Toast', () => ({
  useToastSafe: () => ({ push: toast.push }),
}));
vi.mock('../effecteditor/useMediaLibrary', () => ({
  useMediaLibrary: () => ({ items: [], activeId: null, thumbs: {}, refresh: vi.fn(() => Promise.resolve()), play: vi.fn(), removeLocal: vi.fn() }),
}));
vi.mock('../../../../api/mediaLibrary', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../api/mediaLibrary')>()),
  openMediaFolder: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('../../../../api/lighting', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../api/lighting')>()),
  fetchScreenMonitors: vi.fn(),
  fetchScreenEffect: vi.fn(() => Promise.resolve({ hue: 0, colorize: 0, saturation: 1, contrast: 1 })),
  setScreenEffect: vi.fn(() => Promise.resolve(null)),
  startScreenMirror: vi.fn(() => Promise.resolve(null)),
  reselectScreen: vi.fn(() => Promise.resolve(null)),
}));

const pp = { hue: 0, colorize: 0, saturation: 1, contrast: 1 };
const monitors = [{ id: 'm1', name: 'Main (1920x1080)' }, { id: 'm2', name: 'Side (2560x1440)' }];

describe('ScreenControls monitor', () => {
  beforeEach(() => {
    vi.mocked(startScreenMirror).mockClear();
    vi.mocked(setScreenEffect).mockClear();
    vi.mocked(fetchScreenEffect).mockResolvedValue(pp);
  });

  const renderControls = () => render(<ScreenControls screenPP={pp} onScreenPPChange={() => {}} />);
  const monitorButton = (name: string) => screen.findByRole('button', { name });

  it('marks the persisted screen the service reports', async () => {
    vi.mocked(fetchScreenMonitors).mockResolvedValue({ effects: [], monitors, selectedMonitor: 'm2' });
    renderControls();
    expect((await monitorButton('Side (2560x1440)')).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Main (1920x1080)' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('shows the first screen for the default selection', async () => {
    vi.mocked(fetchScreenMonitors).mockResolvedValue({ effects: [], monitors, selectedMonitor: '' });
    renderControls();
    expect((await monitorButton('Main (1920x1080)')).getAttribute('aria-pressed')).toBe('true');
  });

  it('sends a monitor only once the user picks one', async () => {
    vi.mocked(fetchScreenMonitors).mockResolvedValue({ effects: [], monitors, selectedMonitor: 'm2' });
    renderControls();
    await monitorButton('Side (2560x1440)');

    // A filter change is not a screen choice: no monitor key, the persisted one stays.
    fireEvent.click(screen.getByRole('button', { name: 'lighting.filter.reactive' }));
    await waitFor(() => expect(startScreenMirror).toHaveBeenCalledTimes(1));
    expect(vi.mocked(startScreenMirror).mock.calls[0][2]).toBeUndefined();

    fireEvent.click(screen.getByRole('button', { name: 'Main (1920x1080)' }));
    await waitFor(() => expect(startScreenMirror).toHaveBeenCalledTimes(2));
    expect(vi.mocked(startScreenMirror).mock.calls[1][2]).toBe('m1');

    // From then on the chosen screen rides along.
    fireEvent.click(screen.getByRole('button', { name: 'lighting.filter.passthrough' }));
    await waitFor(() => expect(startScreenMirror).toHaveBeenCalledTimes(3));
    expect(vi.mocked(startScreenMirror).mock.calls[2][2]).toBe('m1');
  });
});

describe('ScreenControls with picks blocked', () => {
  it('applies no screen or filter pick and reports each one instead', async () => {
    vi.mocked(startScreenMirror).mockClear();
    vi.mocked(fetchScreenMonitors).mockResolvedValue({ effects: [], monitors, selectedMonitor: 'm2' });
    const blocked = vi.fn();
    render(<ScreenControls screenPP={pp} onScreenPPChange={() => {}} onBlockedPick={blocked} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Main (1920x1080)' }));
    fireEvent.click(screen.getByRole('button', { name: 'lighting.filter.reactive' }));
    await waitFor(() => expect(blocked).toHaveBeenCalledTimes(2));
    expect(startScreenMirror).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Side (2560x1440)' }).getAttribute('aria-pressed')).toBe('true');
  });
});


describe('media controls open folder', () => {
  beforeEach(() => { toast.push.mockClear(); });
  const renderMedia = () => render(<ModeControls mode="gif" screenPP={pp} onScreenPPChange={() => {}} />);
  const openButton = () => screen.getByRole('button', { name: 'lighting.controls.mediaManageFolder' });

  it('says so when the service could not open the folder', async () => {
    vi.mocked(openMediaFolder).mockResolvedValueOnce(false);
    renderMedia();
    fireEvent.click(openButton());
    await waitFor(() => expect(toast.push).toHaveBeenCalledWith({ title: 'common.openFolderFailed' }));
  });

  it('stays quiet when the folder opened', async () => {
    renderMedia();
    fireEvent.click(openButton());
    await waitFor(() => expect(openMediaFolder).toHaveBeenCalled());
    await vi.mocked(openMediaFolder).mock.results.at(-1)!.value;
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(toast.push).not.toHaveBeenCalled();
  });
});
