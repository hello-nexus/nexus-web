import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PanelOfflineOverlay } from './PanelOfflineOverlay';

const baseProps = {
  resolvedThemeMode: 'dark' as const,
  themeStyle: {},
  nativeBridgeAvailable: false,
  nextAttemptAt: null,
  remoteDisabled: false,
  relayDisabled: false,
  sessionRevoked: false,
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

  it('renders simplified wired overlay for y70 when offline-installed (no retry button, no alertdialog)', () => {
    const onRetry = vi.fn();
    render(
      <PanelOfflineOverlay
        {...baseProps}
        state="offline-installed"
        surface="y70"
        onRetry={onRetry}
      />,
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('connection.lost.reconnectingWired')).toBeInTheDocument();
    expect(screen.queryByText('connection.lost.retry')).toBeNull();
    expect(screen.queryByText('connection.lost.pickDevice')).toBeNull();
    expect(screen.queryByText('connection.lost.newDevice')).toBeNull();
  });

  it('renders simplified wired overlay for monitor when offline-installed', () => {
    render(
      <PanelOfflineOverlay
        {...baseProps}
        state="offline-installed"
        surface="monitor"
      />,
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('connection.lost.reconnectingWired')).toBeInTheDocument();
    expect(screen.queryByText('connection.lost.retry')).toBeNull();
  });

  it('renders checkUsb wired overlay for phone with nexus_link=usb when offline-installed', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) =>
      key === 'nexus_link' ? 'usb' : null,
    );
    render(
      <PanelOfflineOverlay
        {...baseProps}
        state="offline-installed"
        surface="phone"
      />,
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('connection.lost.checkUsb')).toBeInTheDocument();
    expect(screen.queryByText('connection.lost.retry')).toBeNull();
    vi.restoreAllMocks();
  });

  it('renders full WiFi offline card for phone without nexus_link=usb', () => {
    render(
      <PanelOfflineOverlay
        {...baseProps}
        state="offline-installed"
        surface="phone"
        nativeBridgeAvailable={false}
      />,
    );
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('connection.lost.retry')).toBeInTheDocument();
    expect(screen.getByText('connection.lost.newDevice')).toBeInTheDocument();
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

  it('shows the relay-turned-off popup when relayDisabled, with a retry button', () => {
    const onRetry = vi.fn();
    render(
      <PanelOfflineOverlay
        {...baseProps}
        state="online"
        surface="phone"
        relayDisabled
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText('connection.relayDisabled.title')).toBeInTheDocument();
    expect(screen.getByText('connection.relayDisabled.message')).toBeInTheDocument();
    expect(screen.getByText('connection.relayDisabled.checking')).toBeInTheDocument();
    fireEvent.click(screen.getByText('connection.lost.retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('sessionRevoked trumps relayDisabled', () => {
    render(
      <PanelOfflineOverlay
        {...baseProps}
        state="online"
        surface="phone"
        relayDisabled
        sessionRevoked
      />,
    );
    expect(screen.getByText('connection.sessionRevoked.title')).toBeInTheDocument();
    expect(screen.queryByText('connection.relayDisabled.title')).toBeNull();
  });

  it('shows simplified wired overlay for y70 when state is offline', () => {
    render(<PanelOfflineOverlay {...baseProps} state="offline" surface="y70" />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('connection.lost.reconnectingWired')).toBeInTheDocument();
  });

  it('q60 renders no overlay in any state (the panel swaps its own widget to a clock)', () => {
    for (const state of ['online', 'checking', 'offline-installed', 'offline'] as const) {
      const { container, unmount } = render(
        <PanelOfflineOverlay {...baseProps} state={state} surface="q60" />,
      );
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it('shows the countdown status on phone (WiFi) when nextAttemptAt is in the future, and falls back to the in-flight string when null', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-29T20:00:00.000Z'));
    const { rerender } = render(
      <PanelOfflineOverlay
        {...baseProps}
        state="offline-installed"
        surface="phone"
        nextAttemptAt={Date.now() + 4000}
      />,
    );
    expect(screen.getByText('connection.lost.reconnectingIn')).toBeInTheDocument();
    expect(screen.queryByText('connection.lost.reconnecting')).toBeNull();

    rerender(
      <PanelOfflineOverlay
        {...baseProps}
        state="offline-installed"
        surface="phone"
        nextAttemptAt={null}
      />,
    );
    expect(screen.getByText('connection.lost.reconnecting')).toBeInTheDocument();
    expect(screen.queryByText('connection.lost.reconnectingIn')).toBeNull();
    vi.useRealTimers();
  });
});
