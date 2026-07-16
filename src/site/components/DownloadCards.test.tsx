import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '../../lib/i18n';
import { DownloadCards } from './DownloadCards';

const MB = 1024 * 1024;

function stubManifest(body: unknown) {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(body) })));
}

describe('DownloadCards', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renders version and size under each button from the manifest', async () => {
    stubManifest({
      version: 'v3.1.0',
      assets: { windows: { size: 24 * MB }, macos: { size: 31 * MB }, linux: { size: 18 * MB } },
    });
    render(<I18nProvider><DownloadCards /></I18nProvider>);

    expect(await screen.findByText('v3.1.0 · 24 MB')).toBeInTheDocument();
    expect(screen.getByText('v3.1.0 · 31 MB')).toBeInTheDocument();
    expect(screen.getByText('v3.1.0 · 18 MB')).toBeInTheDocument();
  });

  it('renders the buttons without a caption when the manifest is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    render(<I18nProvider><DownloadCards /></I18nProvider>);

    const winLink = await screen.findByRole('link', { name: 'Download for Windows' });
    expect(winLink).toHaveAttribute('href', 'https://hellonexus.com/download/windows');
    expect(screen.queryByText(/\d+ MB/)).not.toBeInTheDocument();
  });

  it('omits the caption only for an OS whose size is missing', async () => {
    stubManifest({
      version: 'v3.1.0',
      assets: { windows: { size: 24 * MB }, macos: { size: null }, linux: { size: 18 * MB } },
    });
    render(<I18nProvider><DownloadCards /></I18nProvider>);

    expect(await screen.findByText('v3.1.0 · 24 MB')).toBeInTheDocument();
    expect(screen.getByText('v3.1.0 · 18 MB')).toBeInTheDocument();
    expect(screen.getAllByText(/\d+ MB/)).toHaveLength(2);
  });
});
