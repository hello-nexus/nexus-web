import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeviceWarningIcon, isRunningAppWarning } from './DeviceWarningIcon';

// Rendered outside I18nProvider, so t() falls back to raw keys - assertions
// below match keys, not English strings.

describe('DeviceWarningIcon', () => {
  it('maps a known code to its i18n key', () => {
    render(<DeviceWarningIcon code="usb-disconnected" />);
    expect(screen.getByRole('img', { name: 'devices.warning.usbDisconnected' })).toBeInTheDocument();
  });

  it('maps the macOS touch-permission code', () => {
    render(<DeviceWarningIcon code="touch-permission" />);
    expect(screen.getByRole('img', { name: 'devices.warning.touchPermission' })).toBeInTheDocument();
  });

  it('maps the access-denied code', () => {
    render(<DeviceWarningIcon code="access-denied" />);
    expect(screen.getByRole('img', { name: 'devices.warning.accessDenied' })).toBeInTheDocument();
  });

  it('falls back to the raw code for an unmapped code', () => {
    render(<DeviceWarningIcon code="some-future-code" />);
    expect(screen.getByRole('img', { name: 'some-future-code' })).toBeInTheDocument();
  });
});

describe('DeviceWarningIcon chip', () => {
  it('labels access-denied with its own chip', () => {
    render(<DeviceWarningIcon code="access-denied" chip />);
    expect(screen.getByText('devices.warning.chip.accessDenied')).toBeInTheDocument();
  });

  it('labels a known code briefly and keeps the full message as its name', () => {
    render(<DeviceWarningIcon code="usb-disconnected" chip />);
    expect(screen.getByText('devices.warning.chip.usbDisconnected')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAccessibleName('devices.warning.usbDisconnected');
  });

  it('names the running app for an app-contention warning', () => {
    render(<DeviceWarningIcon code="elgato-software-running" chip />);
    expect(screen.getByText('devices.conflictRunning.badge')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAccessibleName('devices.warning.elgatoSoftwareRunning');
    expect(isRunningAppWarning('elgato-software-running')).toBe(true);
    expect(isRunningAppWarning('usb-disconnected')).toBe(false);
  });

  it('falls back to a generic label for an unmapped code', () => {
    render(<DeviceWarningIcon code="some-future-code" chip />);
    expect(screen.getByText('devices.warning.chip.generic')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAccessibleName('some-future-code');
  });
});
