import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key, language: 'en' }),
}));

vi.mock('../../../api/service', () => ({
  fetchService: vi.fn(),
  postService: vi.fn(),
}));

vi.mock('../../../api/overlay', () => ({
  listOverlayWidgets: vi.fn(),
  deleteOverlayWidget: vi.fn(),
}));

vi.mock('../../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: vi.fn(),
}));

vi.mock('../../../app/windowActions', () => ({
  isMacAppShell: vi.fn(() => false),
}));

import { OverlayWidgetsModal } from './OverlayWidgetsModal';
import { fetchService, postService } from '../../../api/service';
import { listOverlayWidgets } from '../../../api/overlay';
import { isMacAppShell } from '../../../app/windowActions';

function mockPrefs(overlay: Record<string, unknown>) {
  vi.mocked(fetchService).mockResolvedValue({ overlay } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listOverlayWidgets).mockResolvedValue([]);
  vi.mocked(postService).mockResolvedValue(undefined as never);
  vi.mocked(isMacAppShell).mockReturnValue(false);
});

describe('OverlayWidgetsModal frosted glass', () => {
  it('reads the saved pref and posts overlay.frost the moment it is toggled', async () => {
    mockPrefs({ enabled: true, frost: false });
    render(<OverlayWidgetsModal open onClose={() => {}} />);
    const sw = await screen.findByRole('switch', { name: 'overlayWidgets.frostAria' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(sw);
    await waitFor(() => {
      expect(postService).toHaveBeenCalledWith('/preferences', { overlay: { frost: true } });
    });
    expect(sw).toHaveAttribute('aria-checked', 'true');
  });

  it('shows the toggle on when the pref is already set', async () => {
    mockPrefs({ enabled: true, frost: true });
    render(<OverlayWidgetsModal open onClose={() => {}} />);
    const sw = await screen.findByRole('switch', { name: 'overlayWidgets.frostAria' });
    expect(sw).toHaveAttribute('aria-checked', 'true');
  });

  it('hides the toggle in the macOS shell, whose host has no blur plate', async () => {
    vi.mocked(isMacAppShell).mockReturnValue(true);
    mockPrefs({ enabled: true, frost: false });
    render(<OverlayWidgetsModal open onClose={() => {}} />);
    await screen.findByRole('switch', { name: 'overlayWidgets.enableAria' });
    expect(screen.queryByRole('switch', { name: 'overlayWidgets.frostAria' })).toBeNull();
  });
});
