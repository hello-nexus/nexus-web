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

  test('/login serves the SPA shell on both hosts', async ({ request }) => {
    for (const base of [SITE, MY]) {
      const html = await (await request.get(`${base}/login`)).text();
      expect(html).not.toContain(MARKETING_TITLE);
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

    const winLink = page.getByRole('link', { name: 'Download for Windows' });
    await expect(winLink).toHaveAttribute(
      'href', 'https://github.com/hello-nexus/nexus/releases/latest/download/Nexus-Setup.exe');
  });

  test('interactive demos mount: palette ring and curve editor', async ({ page }) => {
    await page.goto(`${SITE}/`);

    await page.getByText('Lighting that reacts to you.').scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Preset 1' })).toBeVisible();

    await page.getByText('Quiet when idle.').scrollIntoViewIfNeeded();
    await expect(page.getByText('Fan speed')).toBeVisible();
  });
});
