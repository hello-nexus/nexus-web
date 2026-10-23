import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const postService = vi.fn();
vi.mock('../api/service', () => ({
  authFetchWithStatus: (...a: unknown[]) => postService(...a),
}));

vi.mock('../widgets/marketplaceRegistry', () => ({
  getMarketplaceListing: (id: string) => (id === 'com.test.app' ? { id, version: '2.3.4' } : undefined),
}));

import { installGlobalErrorReporting, resetErrorReportingForTests } from './errorReporting';
import { reportAppError, resetAppErrorReportingForTests, type AppErrorPath } from './appErrorReporting';

type Item = Record<string, unknown>;
const items = (): Item[] => postService.mock.calls.flatMap((c) => (c[1] as { body: { errors: Item[] } }).body.errors);

beforeEach(() => {
  vi.useFakeTimers();
  postService.mockReset();
  postService.mockResolvedValue({ response: null, status: 204 });
  installGlobalErrorReporting();
});

afterEach(() => {
  resetErrorReportingForTests();
  resetAppErrorReportingForTests();
  vi.useRealTimers();
});

const flush = () => vi.advanceTimersByTimeAsync(6000);

describe('reportAppError', () => {
  const paths: AppErrorPath[] = ['worker-error', 'boot-error', 'unhandled-rejection', 'render-failed', 'canvas-error', 'boundary', 'log-error'];

  it.each(paths)('reports a %s once as kind app with the app id, version and surface', async (path) => {
    reportAppError('com.test.app', path, new TypeError('x is undefined'));
    await flush();
    const sent = items();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      kind: 'app',
      type: 'com.test.app:TypeError',
      message: 'x is undefined',
      app: `com.test.app@2.3.4 desktop ${path}`,
    });
    expect(String(sent[0].context)).toContain(`app=com.test.app@2.3.4 surface=desktop path=${path}`);
  });

  it('tags a panel route as the panel surface and an unlisted app as unknown version', async () => {
    window.history.pushState({}, '', '/panel/abc');
    try {
      reportAppError('com.other.app', 'worker-error', 'boom');
      await flush();
      expect(items()[0].app).toBe('com.other.app@unknown panel worker-error');
    } finally {
      window.history.pushState({}, '', '/');
    }
  });

  it('keeps identical messages from different apps apart', async () => {
    reportAppError('com.test.app', 'log-error', 'same');
    reportAppError('com.other.app', 'log-error', 'same');
    await flush();
    expect(items().map((i) => i.fingerprint)).toHaveLength(2);
    expect(new Set(items().map((i) => i.fingerprint)).size).toBe(2);
  });

  it('reports an app that throws on every tick once, and again after the cooldown', async () => {
    for (let i = 0; i < 2000; i++) {
      reportAppError('com.test.app', 'worker-error', `tick ${i} failed`);
      vi.advanceTimersByTime(50);
    }
    await flush();
    expect(items()).toHaveLength(1);
    expect(items()[0].count).toBe(1);
    await vi.advanceTimersByTimeAsync(11 * 60 * 1000);
    reportAppError('com.test.app', 'worker-error', 'tick 5 failed');
    await flush();
    expect(items()).toHaveLength(2);
  });

  it('caps the distinct reports per app per window', async () => {
    for (let i = 0; i < 60; i++) reportAppError('com.test.app', 'log-error', `distinct failure ${'x'.repeat(i + 1)}`);
    await flush();
    await vi.advanceTimersByTimeAsync(6000);
    expect(items().length).toBeLessThanOrEqual(20);
    expect(items().length).toBeGreaterThan(0);
  });

  it('truncates long messages', async () => {
    reportAppError('com.test.app', 'log-error', 'a'.repeat(5000));
    await flush();
    expect(String(items()[0].message).length).toBeLessThanOrEqual(500);
  });

  it('sends nothing before global reporting is installed', async () => {
    resetErrorReportingForTests();
    reportAppError('com.test.app', 'worker-error', 'boom');
    await flush();
    expect(postService).not.toHaveBeenCalled();
  });
});
