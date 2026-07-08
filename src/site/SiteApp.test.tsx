import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '../lib/i18n';
import { SiteApp } from './SiteApp';

// jsdom has no WebGL2 (shader canvases fall back to the gradient panel) and
// no IntersectionObserver (useInViewport reports visible); the reduced-motion
// stub in setup.ts keeps every ticker frozen. The page must still mount all
// sections without any network I/O.
describe('SiteApp', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn(() => Promise.reject(new Error('network disabled in test')));
    vi.stubGlobal('fetch', fetchSpy);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders every section with no service I/O', async () => {
    render(<I18nProvider><SiteApp /></I18nProvider>);

    expect(await screen.findByText('Say hello to your PC.')).toBeInTheDocument();
    expect(screen.getByText('Every sensor, at a glance.')).toBeInTheDocument();
    expect(screen.getByText('Lighting that reacts to you.')).toBeInTheDocument();
    expect(screen.getByText('Quiet when idle. Fierce under load.')).toBeInTheDocument();
    expect(screen.getByText('Your PC, in your pocket.')).toBeInTheDocument();
    expect(screen.getByText('Get Nexus')).toBeInTheDocument();
    expect(screen.getByText('Why we built Nexus')).toBeInTheDocument();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('links My System and the per-OS downloads', async () => {
    render(<I18nProvider><SiteApp /></I18nProvider>);
    await screen.findByText('Say hello to your PC.');

    const mySystemLinks = screen.getAllByRole('link', { name: 'My System' });
    expect(mySystemLinks.length).toBeGreaterThan(0);

    const win = screen.getByRole('link', { name: 'Download for Windows' });
    expect(win).toHaveAttribute(
      'href', 'https://github.com/hello-nexus/nexus/releases/latest/download/Nexus-Setup.exe');
    const linux = screen.getByRole('link', { name: 'Download for Linux' });
    expect(linux).toHaveAttribute(
      'href', 'https://github.com/hello-nexus/nexus/releases/latest/download/Nexus-x86_64.AppImage');
  });
});
