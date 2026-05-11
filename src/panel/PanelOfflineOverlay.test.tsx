import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PanelOfflineOverlay } from './PanelOfflineOverlay';

const baseProps = {
  resolvedThemeMode: 'dark' as const,
  themeStyle: {},
  nativeBridgeAvailable: false,
  nextAttemptAt: null,
  onRetry: () => {},
  onOpenNativePairing: () => {},
};

describe('PanelOfflineOverlay', () => {
  it('renders nothing when state is online', () => {
    const { container } = render(
      <PanelOfflineOverlay {...baseProps} state="online" surface="y70" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders only the checking strip when state is checking', () => {
    render(<PanelOfflineOverlay {...baseProps} state="checking" surface="y70" />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });

  it('renders alert dialog with retry button on y70 when offline-installed', () => {
    const onRetry = vi.fn();
    render(
      <PanelOfflineOverlay
        {...baseProps}
        state="offline-installed"
        surface="y70"
        onRetry={onRetry}
      />,
    );
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toBeInTheDocument();
    const retry = screen.getByText('connection.lost.retry');
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
    // y70 surface - no pairing buttons.
    expect(screen.queryByText('connection.lost.pickDevice')).toBeNull();
    expect(screen.queryByText('connection.lost.newDevice')).toBeNull();
  });

  it('renders pick-device button on phone when native bridge is available', () => {
    const onOpen = vi.fn();
    render(
      <PanelOfflineOverlay
        {...baseProps}
        state="offline-installed"
        surface="phone"
        nativeBridgeAvailable
        onOpenNativePairing={onOpen}
      />,
    );
    const pickDevice = screen.getByText('connection.lost.pickDevice');
    fireEvent.click(pickDevice);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(screen.getByText('connection.lost.newDevice')).toBeInTheDocument();
  });

  it('hides pick-device button on phone when native bridge is unavailable but still shows new-device link', () => {
    render(
      <PanelOfflineOverlay
        {...baseProps}
        state="offline-installed"
        surface="phone"
        nativeBridgeAvailable={false}
      />,
    );
    expect(screen.queryByText('connection.lost.pickDevice')).toBeNull();
    expect(screen.getByText('connection.lost.newDevice')).toBeInTheDocument();
  });

  it('shows the not-installed message when state is offline', () => {
    render(<PanelOfflineOverlay {...baseProps} state="offline" surface="y70" />);
    expect(screen.getByText('connection.lost.notInstalled')).toBeInTheDocument();
  });

  it('shows the countdown status when nextAttemptAt is in the future, and falls back to the in-flight string when null', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-29T20:00:00.000Z'));
    const { rerender } = render(
      <PanelOfflineOverlay
        {...baseProps}
        state="offline-installed"
        surface="y70"
        nextAttemptAt={Date.now() + 4000}
      />,
    );
    expect(screen.getByText('connection.lost.reconnectingIn')).toBeInTheDocument();
    expect(screen.queryByText('connection.lost.reconnecting')).toBeNull();

    rerender(
      <PanelOfflineOverlay
        {...baseProps}
        state="offline-installed"
        surface="y70"
        nextAttemptAt={null}
      />,
    );
    expect(screen.getByText('connection.lost.reconnecting')).toBeInTheDocument();
    expect(screen.queryByText('connection.lost.reconnectingIn')).toBeNull();
    vi.useRealTimers();
  });
});
