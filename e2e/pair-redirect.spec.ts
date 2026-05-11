import { test, expect } from '@playwright/test';

test.describe('/r/pair landing page', () => {
  test('without query params, surfaces an "invalid pairing link" message', async ({ page }) => {
    await page.goto('/r/pair');
    await expect(page.getByText('Invalid pairing link')).toBeVisible();
  });

  test('with a complete pairing link, transitions from "Opening qOS..." to the choice screen', async ({ page }) => {
    await page.goto('/r/pair?host=192.168.1.50&port=9443&pair=TESTTOKEN&fp=abc');

    // Initial probe stage waits ~1.5s for iOS to take over the URL.
    await expect(page.getByText('Opening qOS...')).toBeVisible();

    // After the probe window, the SPA flips to the install/continue screen.
    await expect(page.getByText('Pair phone with qOS')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('link', { name: /install the app/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /continue in browser/i })).toBeVisible();
  });

  test('"Continue in browser" navigates to the plain-HTTP LAN URL on httpPort', async ({ page, context }) => {
    // Intercept any nav to the LAN host so the test doesn't hang waiting for
    // a 30s TCP timeout, and capture the URL the SPA tried to navigate to.
    const navAttempts: string[] = [];
    await context.route('http://192.168.1.50:9400/**', async (route) => {
      navAttempts.push(route.request().url());
      await route.fulfill({ status: 200, contentType: 'text/plain', body: 'intercepted' });
    });

    await page.goto('/r/pair?host=192.168.1.50&port=9443&httpPort=9400&pair=TESTTOKEN');

    const continueBtn = page.getByRole('button', { name: /continue in browser/i });
    await expect(continueBtn).toBeVisible({ timeout: 10_000 });

    await continueBtn.click();
    await expect.poll(() => navAttempts.length, { timeout: 10_000 }).toBeGreaterThan(0);

    const target = navAttempts[navAttempts.length - 1];
    expect(target.startsWith('http://')).toBe(true);
    expect(target).toContain('192.168.1.50:9400/panel/phone');
    expect(target).toContain('pair=TESTTOKEN');
  });

  test('Continue in browser falls back to port 9400 when the QR predates httpPort', async ({ page, context }) => {
    const navAttempts: string[] = [];
    await context.route('http://192.168.1.50:9400/**', async (route) => {
      navAttempts.push(route.request().url());
      await route.fulfill({ status: 200, contentType: 'text/plain', body: 'intercepted' });
    });

    await page.goto('/r/pair?host=192.168.1.50&port=9443&pair=TESTTOKEN');

    const continueBtn = page.getByRole('button', { name: /continue in browser/i });
    await expect(continueBtn).toBeVisible({ timeout: 10_000 });

    await continueBtn.click();
    await expect.poll(() => navAttempts.length, { timeout: 10_000 }).toBeGreaterThan(0);

    expect(navAttempts[navAttempts.length - 1]).toContain('192.168.1.50:9400/panel/phone');
  });
});
