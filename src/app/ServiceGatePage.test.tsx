import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '../lib/i18n';
import { ServiceGatePage } from './ServiceGatePage';

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function stubUserAgent(ua: string) {
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(ua);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ServiceGatePage', () => {
  it('handheld: platform note + pairing how-to instead of the launch/download card', async () => {
    stubUserAgent(IPHONE_UA);
    render(<I18nProvider><ServiceGatePage state="offline" /></I18nProvider>);
    const link = await screen.findByRole('link', { name: 'How to: pair this device with your PC' });
    // jsdom's host is localhost, so marketingHref falls back to the bare path.
    expect(link).toHaveAttribute('href', '/how-to/pair-your-phone');
    expect(screen.getByText(/available for Windows, macOS, and Linux/)).toBeInTheDocument();
    expect(screen.getByText(/remote control panel/)).toBeInTheDocument();
    expect(screen.queryByText(/Already installed but not connecting/)).toBeNull();
    expect(screen.queryByRole('link', { name: /Download/ })).toBeNull();
  });

  it('handheld on my.hellonexus.com: the how-to link targets the bare marketing domain', async () => {
    stubUserAgent(IPHONE_UA);
    const realLocation = window.location;
    Object.defineProperty(window, 'location', {
      value: { protocol: 'https:', host: 'my.hellonexus.com' },
      configurable: true,
    });
    try {
      render(<I18nProvider><ServiceGatePage state="offline" /></I18nProvider>);
      const link = await screen.findByRole('link', { name: 'How to: pair this device with your PC' });
      expect(link).toHaveAttribute('href', 'https://hellonexus.com/how-to/pair-your-phone');
    } finally {
      Object.defineProperty(window, 'location', { value: realLocation, configurable: true });
    }
  });

  it('desktop: keeps the ServiceRequired launch/download gate', async () => {
    stubUserAgent(DESKTOP_UA);
    render(<I18nProvider><ServiceGatePage state="offline" /></I18nProvider>);
    await screen.findByText('This page connects to Nexus running on this computer.');
    expect(screen.getByText(/Already installed but not connecting/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'How to: pair this device with your PC' })).toBeNull();
  });
});
