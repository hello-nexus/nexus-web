import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { UpdateBadge } from './UpdateBadge';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('UpdateBadge', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('notify mode on an auto-install platform opens the modal, not the browser', () => {
    const onOpen = vi.fn();
    const onInstall = vi.fn();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(
      <UpdateBadge
        updateMode="notify"
        canAutoInstall
        downloadUrl="https://example.com/Nexus.dmg"
        onOpen={onOpen}
        onInstall={onInstall}
      />,
    );

    expect(screen.getByRole('button', { name: 'update.badge.label' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onInstall).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('staged mode on an auto-install platform installs immediately', () => {
    const onOpen = vi.fn();
    const onInstall = vi.fn();
    render(
      <UpdateBadge
        updateMode="download"
        canAutoInstall
        downloadUrl="https://example.com/Nexus.dmg"
        onOpen={onOpen}
        onInstall={onInstall}
      />,
    );

    expect(screen.getByRole('button', { name: 'update.badge.labelReady' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(onInstall).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('opens the release asset in a new tab and never calls onOpen/onInstall when canAutoInstall is false', () => {
    const onOpen = vi.fn();
    const onInstall = vi.fn();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(
      <UpdateBadge
        updateMode="notify"
        canAutoInstall={false}
        downloadUrl="https://example.com/Nexus.dmg"
        onOpen={onOpen}
        onInstall={onInstall}
      />,
    );

    expect(screen.getByRole('button', { name: 'update.badge.labelDownload' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(openSpy).toHaveBeenCalledWith('https://example.com/Nexus.dmg', '_blank', 'noopener,noreferrer');
    expect(onOpen).not.toHaveBeenCalled();
    expect(onInstall).not.toHaveBeenCalled();
  });

  it('does not call window.open when canAutoInstall is false and downloadUrl is empty', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(
      <UpdateBadge
        updateMode="notify"
        canAutoInstall={false}
        downloadUrl=""
        onOpen={vi.fn()}
        onInstall={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button'));
    expect(openSpy).not.toHaveBeenCalled();
  });
});
