import { test, expect } from '@playwright/test';

test.describe('/r/pair landing page', () => {
  test('without query params, surfaces an "invalid pairing link" message', async ({ page }) => {
    await page.goto('/r/pair');
    await expect(page.getByText('Invalid pairing link')).toBeVisible();
  });

  test('with a complete pairing link, auto-redirects to the plain-HTTP LAN URL on httpPort', async ({ page, context }) => {
    // Intercept any nav to the LAN host so the test doesn't hang waiting for a
    // 30s TCP timeout, and capture the URL the SPA redirected to.
    const navAttempts: string[] = [];
    await context.route('http://192.168.1.50:9400/**', async (route) => {
      navAttempts.push(route.request().url());
      await route.fulfill({ status: 200, contentType: 'text/plain', body: 'intercepted' });
    });

    // The chooser is bypassed: with a valid link the page redirects straight to
    // the browser panel, no "open in app vs. browser" prompt.
    await page.goto('/r/pair?host=192.168.1.50&port=9443&httpPort=9400&pair=TESTTOKEN', { waitUntil: 'commit' });

    await expect.poll(() => navAttempts.length, { timeout: 10_000 }).toBeGreaterThan(0);

    const target = navAttempts[navAttempts.length - 1];
    expect(target.startsWith('http://')).toBe(true);
    expect(target).toContain('192.168.1.50:9400/panel/phone');
    expect(target).toContain('pair=TESTTOKEN');
  });

  test('auto-redirect falls back to port 9400 when the QR predates httpPort', async ({ page, context }) => {
    const navAttempts: string[] = [];
    await context.route('http://192.168.1.50:9400/**', async (route) => {
      navAttempts.push(route.request().url());
      await route.fulfill({ status: 200, contentType: 'text/plain', body: 'intercepted' });
    });

    await page.goto('/r/pair?host=192.168.1.50&port=9443&pair=TESTTOKEN', { waitUntil: 'commit' });

    await expect.poll(() => navAttempts.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(navAttempts[navAttempts.length - 1]).toContain('192.168.1.50:9400/panel/phone');
  });

  // This page is served from the public hellonexus.com origin, so an
  // unvalidated `host` would turn it into an open redirect that leaks the pair
  // token to an attacker. The host must be a private LAN IPv4.
  test('refuses a non-LAN host and does not leak the pair token', async ({ page, context }) => {
    const leaked: string[] = [];
    await context.route('http://evil.com/**', async (route) => {
      leaked.push(route.request().url());
      await route.fulfill({ status: 200, contentType: 'text/plain', body: 'x' });
    });

    await page.goto('/r/pair?host=evil.com&httpPort=9400&pair=SECRETTOKEN', { waitUntil: 'commit' });

    await expect(page.getByText('Invalid pairing link')).toBeVisible();
    expect(leaked).toHaveLength(0);           // token never sent to the attacker host
    expect(page.url()).toContain('/r/pair');  // stayed on the public landing page
  });

  test('refuses a public IP host', async ({ page }) => {
    await page.goto('/r/pair?host=8.8.8.8&httpPort=9400&pair=SECRETTOKEN');
    await expect(page.getByText('Invalid pairing link')).toBeVisible();
  });

  test('refuses a host that only looks like a LAN IP (suffix smuggling)', async ({ page }) => {
    await page.goto(`/r/pair?host=${encodeURIComponent('192.168.1.50.evil.com')}&httpPort=9400&pair=SECRETTOKEN`);
    await expect(page.getByText('Invalid pairing link')).toBeVisible();
  });

  test('refuses a non-numeric httpPort', async ({ page }) => {
    await page.goto(`/r/pair?host=192.168.1.50&httpPort=${encodeURIComponent('9400/@evil.com')}&pair=SECRETTOKEN`);
    await expect(page.getByText('Invalid pairing link')).toBeVisible();
  });
});
