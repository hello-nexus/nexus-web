import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeviceWarningIcon } from './DeviceWarningIcon';

// Rendered outside I18nProvider, so t() falls back to raw keys - assertions
// below match keys, not English strings.

describe('DeviceWarningIcon', () => {
  it('maps a known code to its i18n key', () => {
    render(<DeviceWarningIcon code="usb-disconnected" />);
    expect(screen.getByRole('img', { name: 'devices.warning.usbDisconnected' })).toBeInTheDocument();
  });

  it('falls back to the raw code for an unmapped code', () => {
    render(<DeviceWarningIcon code="some-future-code" />);
    expect(screen.getByRole('img', { name: 'some-future-code' })).toBeInTheDocument();
  });
});
