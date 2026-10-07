import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const postService = vi.fn();
vi.mock('../api/service', () => ({ postService: (...a: unknown[]) => postService(...a) }));

import {
  droppedErrorCount,
  fingerprintOf,
  installGlobalErrorReporting,
  reportError,
  resetErrorReportingForTests,
} from './errorReporting';

type Body = { errors: Array<Record<string, unknown>> };
const sent = (): Body[] => postService.mock.calls.map((c) => c[1] as Body);

beforeEach(() => {
  vi.useFakeTimers();
  postService.mockReset();
  postService.mockResolvedValue(null);
});

afterEach(() => {
  resetErrorReportingForTests();
  vi.useRealTimers();
});

describe('fingerprintOf', () => {
  it('is stable across digit, hex and quoted variations', () => {
    const a = fingerprintOf('TypeError', 'Cannot read "foo" of item 12 (0xdeadbeef)');
    const b = fingerprintOf('TypeError', "Cannot read 'barbaz' of item 9981 (0xCAFE1234)");
    expect(a).toBe(b);
    expect(fingerprintOf('RangeError', 'Cannot read "foo" of item 12')).not.toBe(a);
  });
});

describe('installGlobalErrorReporting', () => {
  it('is idempotent', () => {
    const spy = vi.spyOn(window, 'addEventListener');
    installGlobalErrorReporting();
    installGlobalErrorReporting();
    const names = spy.mock.calls.map((c) => c[0]);
    expect(names.filter((n) => n === 'error')).toHaveLength(1);
    expect(names.filter((n) => n === 'unhandledrejection')).toHaveLength(1);
    spy.mockRestore();
  });

  it('relays window errors and rejections', async () => {
    installGlobalErrorReporting();
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('boom 1'), message: 'boom 1' }));
    const ev = new Event('unhandledrejection') as Event & { reason: unknown };
    ev.reason = new TypeError('bad');
    window.dispatchEvent(ev);
    await vi.advanceTimersByTimeAsync(5000);
    const errors = sent()[0].errors;
    expect(errors.map((e) => e.kind).sort()).toEqual(['unhandled-rejection', 'window-error']);
    expect(postService.mock.calls[0][0]).toBe('/telemetry/client-errors');
  });
});

describe('reportError', () => {
  it('drops noise', async () => {
    reportError(new Error('ResizeObserver loop limit exceeded'), 'window-error');
    reportError('Script error.', 'window-error');
    await vi.advanceTimersByTimeAsync(5000);
    expect(postService).not.toHaveBeenCalled();
  });

  it('aggregates duplicates by fingerprint with a count', async () => {
    reportError(new Error('fail 1'), 'window-error');
    reportError(new Error('fail 2'), 'window-error');
    reportError(new Error('fail 3'), 'window-error');
    await vi.advanceTimersByTimeAsync(5000);
    expect(sent()).toHaveLength(1);
    expect(sent()[0].errors).toHaveLength(1);
    expect(sent()[0].errors[0].count).toBe(3);
  });

  it('caps distinct fingerprints at 20 and batches at 10 per POST', async () => {
    for (let i = 0; i < 30; i++) {
      reportError(new Error(`distinct-${'x'.repeat(i + 1)}-q`), 'window-error');
      vi.advanceTimersByTime(120);
    }
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(sent().map((b) => b.errors.length)).toEqual([10, 10]);
  });

  it('sends only an updated count for a fingerprint already sent, and nothing when unchanged', async () => {
    reportError(new Error('once'), 'window-error');
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(postService).toHaveBeenCalledTimes(1);
    reportError(new Error('once'), 'window-error');
    await vi.advanceTimersByTimeAsync(5000);
    expect(postService).toHaveBeenCalledTimes(2);
    expect(sent()[1].errors[0].count).toBe(1);
    await vi.advanceTimersByTimeAsync(20000);
    expect(postService).toHaveBeenCalledTimes(2);
  });

  it('rate gates a burst and stays cheap', async () => {
    const err = new Error('frame loop');
    const t0 = performance.now();
    for (let i = 0; i < 100000; i++) reportError(err, 'render');
    const ms = performance.now() - t0;
    console.info(`100000 reportError calls: ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(500);
    expect(droppedErrorCount()).toBe(100000 - 10);
    await vi.advanceTimersByTimeAsync(5000);
    expect(sent()).toHaveLength(1);
    expect(sent()[0].errors[0].count).toBe(10);
  });

  it('truncates fields to the caps', async () => {
    const e = new Error('m'.repeat(5000));
    e.stack = 's'.repeat(20000);
    reportError(e, 'render', 'c'.repeat(2000));
    await vi.advanceTimersByTimeAsync(5000);
    const r = sent()[0].errors[0];
    expect((r.message as string).length).toBe(1000);
    expect((r.stack as string).length).toBe(2000);
    expect((r.context as string).length).toBe(500);
    expect((r.fingerprint as string).length).toBeLessThanOrEqual(64);
  });

  it('never throws when the POST rejects or throws', async () => {
    postService.mockRejectedValue(new Error('net'));
    expect(() => reportError(new Error('a'), 'window-error')).not.toThrow();
    await expect(vi.advanceTimersByTimeAsync(5000)).resolves.not.toThrow();
    postService.mockImplementation(() => { throw new Error('sync'); });
    reportError(new Error('b'), 'window-error');
    await expect(vi.advanceTimersByTimeAsync(5000)).resolves.not.toThrow();
  });

  it('does not recurse when reporting itself raises an error event', async () => {
    installGlobalErrorReporting();
    const hostile = new Error('x');
    Object.defineProperty(hostile, 'message', {
      get(): string {
        window.dispatchEvent(new ErrorEvent('error', { error: new Error('inner'), message: 'inner' }));
        return 'outer';
      },
    });
    reportError(hostile, 'render');
    await vi.advanceTimersByTimeAsync(5000);
    const all = sent().flatMap((b) => b.errors.map((e) => e.message));
    expect(all).not.toContain('inner');
  });

  it('excludes query string and hash from context and messages', async () => {
    window.history.replaceState(null, '', '/panel/phone?token=SECRET#frag=SECRET2');
    reportError(new Error('GET http://h/x?token=SECRET failed'), 'render', 'in Foo');
    await vi.advanceTimersByTimeAsync(5000);
    const r = sent()[0].errors[0];
    expect(r.context).toBe('/panel/phone in Foo');
    expect(JSON.stringify(r)).not.toContain('SECRET');
    window.history.replaceState(null, '', '/');
  });
});
