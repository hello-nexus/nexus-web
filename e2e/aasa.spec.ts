import { test, expect } from '@playwright/test';

const AASA_PATH = '/.well-known/apple-app-site-association';
const TEAM_ID = '8ZFCKY2SQ9';
const BUNDLE_ID = 'com.nexusqos.panel';

test.describe('apple-app-site-association', () => {
  test('serves the AASA file as JSON, not the SPA shell', async ({ request }) => {
    const res = await request.get(AASA_PATH);
    expect(res.status()).toBe(200);
    const ct = res.headers()['content-type'] ?? '';
    expect(ct).toContain('application/json');
    expect(ct).not.toContain('text/html');
  });

  test('AASA is parseable JSON with the real team prefix and the /r/pair component', async ({ request }) => {
    const res = await request.get(AASA_PATH);
    const body = await res.json();

    const details = body?.applinks?.details;
    expect(Array.isArray(details)).toBe(true);
    expect(details.length).toBeGreaterThan(0);

    const detail = details[0];
    const expectedAppId = `${TEAM_ID}.${BUNDLE_ID}`;
    expect(detail.appIDs).toContain(expectedAppId);

    const rawText = JSON.stringify(body);
    expect(rawText).not.toMatch(/TEAMID/);

    const components = detail.components ?? [];
    const paths = components.map((c: { '/'?: string }) => c['/']).filter(Boolean);
    expect(paths).toContain('/r/pair');
  });

  test('AASA responds to HEAD with the same content-type', async ({ request }) => {
    const res = await request.head(AASA_PATH);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type'] ?? '').toContain('application/json');
  });
});
