import { test, expect } from '@playwright/test';

// Host routing: `/` serves the marketing page on the bare host and the SPA
// shell on my.* hosts; every deeper path is host-independent. Absolute URLs
// throughout - this spec exercises both hosts regardless of baseURL.
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 4173);
const SITE = `http://localhost:${PORT}`;
const MY = `http://my.localhost:${PORT}`;

const MARKETING_TITLE = 'monitor, cool, and light up your PC';

test.describe('marketing site host routing', () => {
  test('bare host root serves the marketing page', async ({ request }) => {
    const res = await request.get(`${SITE}/`);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain(MARKETING_TITLE);
    expect(html).toContain('assets/site-');
  });

  test('my. host root serves the SPA shell', async ({ request }) => {
    const res = await request.get(`${MY}/`);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).not.toContain(MARKETING_TITLE);
    expect(html).toContain('manifest');
  });

  test('account paths redirect to the Build portal with their query', async ({ request }) => {
    for (const path of ['/login', '/account', '/u/someuser', '/login?return=%2Fbench']) {
      const res = await request.get(`${SITE}${path}`, { maxRedirects: 0 });
      expect(res.status(), path).toBe(302);
      expect(res.headers()['location'], path).toBe(`https://build.hellonexus.com${path}`);
    }
  });

  test('/panel/phone serves the SPA shell on both hosts', async ({ request }) => {
    for (const base of [SITE, MY]) {
      const html = await (await request.get(`${base}/panel/phone`)).text();
      expect(html).not.toContain(MARKETING_TITLE);
    }
  });
});

test.describe('marketing page content', () => {
  test('renders hero, My System link, and download links', async ({ page }) => {
    await page.goto(`${SITE}/`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Say hello to your PC.');

    const mySystem = page.getByRole('banner').getByRole('link', { name: 'My System' });
    await expect(mySystem).toHaveAttribute('href', /my\./);

    const winLinks = page.getByRole('link', { name: 'Download for Windows' });
    await expect(winLinks.first()).toHaveAttribute(
      'href', 'https://hellonexus.com/download/windows');
  });

  test('interactive demos mount: shader thumbnails and curve editor', async ({ page }) => {
    await page.goto(`${SITE}/`);

    await page.getByText('Lighting that reacts to you.').scrollIntoViewIfNeeded();
    // The effect picker is a strip of live shader thumbnails.
    for (const name of ['Plasma', 'Fire', 'Spiral', 'Neon Grid', 'Beat Builder']) {
      await expect(page.getByRole('button', { name })).toBeVisible();
    }

    await page.getByText('Quiet when idle.').scrollIntoViewIfNeeded();
    await expect(page.getByText('Fan speed').first()).toBeVisible();
  });
});

test.describe('downloads', () => {
  test('/download serves the marketing downloads page', async ({ request }) => {
    for (const base of [SITE, MY]) {
      const html = await (await request.get(`${base}/download`)).text();
      expect(html).toContain('assets/site-');
    }
  });

  test('per-OS routes 302 to a GitHub release asset', async ({ request }) => {
    const res = await request.get(`${SITE}/download/mac`, { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    const location = res.headers()['location'] ?? '';
    expect(location).toContain('github.com');
    expect(location).toContain('Nexus.dmg');
  });
});
