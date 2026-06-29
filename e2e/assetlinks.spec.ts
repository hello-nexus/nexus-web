import { test, expect } from '@playwright/test';

const ASSETLINKS_PATH = '/.well-known/assetlinks.json';
const PACKAGE_NAME = 'com.hellonexus.panel';
// Google Play App Signing certificate (Play re-signs distributed builds with it).
const PLAY_APP_SIGNING_SHA256 =
  '50:6A:FC:48:BC:DD:1A:C8:BC:38:FC:D6:AF:02:BA:F8:85:D2:41:D2:D3:46:14:2B:73:AD:AA:5B:71:43:00:15';

test.describe('assetlinks.json', () => {
  test('serves the assetlinks file as JSON, not the SPA shell', async ({ request }) => {
    const res = await request.get(ASSETLINKS_PATH);
    expect(res.status()).toBe(200);
    const ct = res.headers()['content-type'] ?? '';
    expect(ct).toContain('application/json');
    expect(ct).not.toContain('text/html');
  });

  test('is parseable JSON declaring the package and the Play app-signing cert', async ({ request }) => {
    const res = await request.get(ASSETLINKS_PATH);
    const body = await res.json();

    expect(Array.isArray(body)).toBe(true);
    const statement = body.find(
      (s: { target?: { package_name?: string } }) => s?.target?.package_name === PACKAGE_NAME,
    );
    expect(statement).toBeTruthy();
    expect(statement.relation).toContain('delegate_permission/common.handle_all_urls');
    expect(statement.target.namespace).toBe('android_app');
    expect(statement.target.sha256_cert_fingerprints).toContain(PLAY_APP_SIGNING_SHA256);
  });

  test('responds to HEAD with the same content-type', async ({ request }) => {
    const res = await request.head(ASSETLINKS_PATH);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type'] ?? '').toContain('application/json');
  });
});
