import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScreentimePage } from './ScreentimePage';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const getTrackingStatusMock = vi.fn();
const setTrackingEnabledMock = vi.fn();
vi.mock('../../../hooks/useScreenTimeBrowse', () => ({
  getTrackingStatus: () => getTrackingStatusMock(),
  setTrackingEnabled: (enabled: boolean) => setTrackingEnabledMock(enabled),
}));

vi.mock('../../../components/views/ScreenTimeBrowse/ScreenTimeBrowse', () => ({
  SCREEN_TIME_MODES: ['day', 'week', 'month', 'app'],
  ScreenTimeBrowse: () => <div>browse</div>,
}));
vi.mock('../../../components/views/ScreenTimeBrowse/ScreenTimeDataControl', () => ({
  ScreenTimeDataControl: () => null,
}));

const flush = () => act(async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
});

const renderPage = () => render(<ScreentimePage serviceOnline tab="day" onTabChange={() => {}} />);

beforeEach(() => {
  getTrackingStatusMock.mockReset().mockResolvedValue({ enabled: true });
  setTrackingEnabledMock.mockReset().mockResolvedValue({ enabled: true });
});

describe('ScreentimePage', () => {
  it('shows the usage browser while tracking is on', async () => {
    renderPage();
    await flush();
    expect(screen.getByText('browse')).toBeInTheDocument();
    expect(screen.queryByText('screentime.intro.title')).not.toBeInTheDocument();
  });

  it('shows the intro with a tracking toggle while tracking is off, and turns it on', async () => {
    getTrackingStatusMock.mockResolvedValue({ enabled: false });
    renderPage();
    expect(await screen.findByText('screentime.intro.title')).toBeInTheDocument();
    expect(screen.queryByText('browse')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: 'settings.screentime.tracking' }));
    expect(setTrackingEnabledMock).toHaveBeenCalledWith(true);
    await flush();
    expect(screen.getByText('browse')).toBeInTheDocument();
  });

  it('keeps the intro when turning tracking on fails', async () => {
    getTrackingStatusMock.mockResolvedValue({ enabled: false });
    setTrackingEnabledMock.mockResolvedValue(null);
    renderPage();
    fireEvent.click(await screen.findByRole('switch', { name: 'settings.screentime.tracking' }));
    await flush();
    expect(screen.getByText('screentime.intro.title')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'settings.screentime.tracking' })).toHaveAttribute('aria-checked', 'false');
  });
});
