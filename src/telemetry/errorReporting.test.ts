import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const postService = vi.fn();
vi.mock('../api/service', () => ({
  authFetchWithStatus: (...a: unknown[]) => postService(...a),
}));

const recoverNow = vi.fn(async (): Promise<string> => 'noop');
vi.mock('../lib/staleChunkRecovery', async (orig) => ({
  ...(await orig<typeof import('../lib/staleChunkRecovery')>()),
  recoverFromStaleChunkNow: () => recoverNow(),
}));

import {
  droppedErrorCount,
  fingerprintOf,
  isForeignScriptError,
  installGlobalErrorReporting,
  reportError,
  resetErrorReportingForTests,
} from './errorReporting';

type Body = { errors: Array<Record<string, unknown>> };
const sent = (): Body[] => postService.mock.calls.map((c) => (c[1] as { body: Body }).body);

beforeEach(() => {
  vi.useFakeTimers();
  postService.mockReset();
  postService.mockResolvedValue({ response: null, status: 204 });
  installGlobalErrorReporting();
});

afterEach(() => {
  vi.unstubAllEnvs();
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
    resetErrorReportingForTests();
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

  it('rate gates a burst and stays cheap', () => {
    vi.useRealTimers();
    const err = new Error('frame loop');
    const t0 = performance.now();
    for (let i = 0; i < 100000; i++) reportError(err, 'render');
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(2000);
    expect(droppedErrorCount()).toBeGreaterThanOrEqual(100000 - 20);
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

  it('is a no-op until the listeners are installed', async () => {
    resetErrorReportingForTests();
    reportError(new Error('early'), 'render');
    await vi.advanceTimersByTimeAsync(5000);
    expect(postService).not.toHaveBeenCalled();
  });

  it('appends the Error cause chain to message and stack', async () => {
    const inner = new TypeError('inner boom');
    inner.stack = 'TypeError: inner boom\n    at inner.js:1:1';
    const mid = new Error('mid', { cause: inner });
    const outer = new Error('outer', { cause: mid });
    reportError(outer, 'render');
    await vi.advanceTimersByTimeAsync(5000);
    const r = sent()[0].errors[0];
    expect(r.message).toBe('outer cause: Error: mid cause: TypeError: inner boom');
    expect(r.stack as string).toContain('cause: TypeError: inner boom\n    at inner.js:1:1');
  });

  it('survives cause cycles, non-Error causes and deep chains', async () => {
    const a = new Error('a');
    const b = new Error('b', { cause: a });
    a.cause = b;
    let deep: Error = new Error('e0');
    for (let i = 1; i <= 6; i++) deep = new Error(`e${i}`, { cause: deep });
    reportError(a, 'render');
    reportError(new Error('x', { cause: { secret: 'token' } }), 'render');
    reportError(deep, 'render');
    await vi.advanceTimersByTimeAsync(5000);
    const messages = sent()[0].errors.map((e) => e.message);
    expect(messages).toEqual([
      'a cause: Error: b',
      'x',
      'e6 cause: Error: e5 cause: Error: e4 cause: Error: e3',
    ]);
  });

  it('keeps the cause stack under the stack cap', async () => {
    const e = new Error('o', { cause: new Error('c') });
    e.stack = 's'.repeat(5000);
    (e.cause as Error).stack = 'cause-frame';
    reportError(e, 'render');
    await vi.advanceTimersByTimeAsync(5000);
    const r = sent()[0].errors[0];
    expect((r.stack as string).length).toBeLessThanOrEqual(2000);
    expect(r.stack as string).toContain('cause: cause-frame');
  });

  it('keeps cause text in message when the outer message is huge', async () => {
    reportError(new Error('m'.repeat(5000), { cause: new Error('root') }), 'render');
    await vi.advanceTimersByTimeAsync(5000);
    const r = sent()[0].errors[0];
    expect((r.message as string).length).toBe(1000);
    expect(r.message as string).toMatch(/ cause: Error: root$/);
  });

  it('describes non-Error values by shape only', async () => {
    reportError({ status: 500, body: 'secret-token' }, 'unhandled-rejection');
    reportError(function leaky() { return 'secret-source'; }, 'unhandled-rejection');
    reportError(Object.assign(new Error('e'), { name: 42 }), 'window-error');
    reportError(null, 'unhandled-rejection');
    await vi.advanceTimersByTimeAsync(5000);
    const errors = sent()[0].errors;
    expect(errors.map((e) => `${e.type}:${e.message}`)).toEqual([
      'Object:Object{status,body}',
      'function:function leaky',
      'Error:e',
      'null:null',
    ]);
    expect(JSON.stringify(errors)).not.toContain('secret');
  });

  it('strips query and fragment from ws urls and relative paths', async () => {
    reportError(new Error('x wss://h/ws?token=SECRET and /panel?t=SECRET2#SECRET3 done'), 'window-error');
    await vi.advanceTimersByTimeAsync(5000);
    const r = sent()[0].errors[0];
    expect(r.message).toBe('x wss://h/ws and /panel done');
  });

  it('evicts a sent record when full and counts a drop when nothing can be evicted', async () => {
    for (let i = 0; i < 20; i++) {
      reportError(new Error(`full-${'x'.repeat(i + 1)}-q`), 'window-error');
      vi.advanceTimersByTime(120);
    }
    reportError(new Error('overflow-aaa'), 'window-error');
    vi.advanceTimersByTime(120);
    expect(droppedErrorCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(5000);
    reportError(new Error('overflow-bbb'), 'window-error');
    await vi.advanceTimersByTimeAsync(5000);
    const last = sent()[sent().length - 1].errors[0];
    expect(last.message).toBe('overflow-bbb');
  });
});

describe('isForeignScriptError', () => {
  const page = 'http://192.168.1.5:9400/panel/phone?token=abc';

  it('keeps errors from our own bundle', () => {
    expect(isForeignScriptError('http://localhost:9400/assets/index-abc.js', 9, page)).toBe(false);
  });

  it('keeps errors with no filename', () => {
    expect(isForeignScriptError('', 0, page)).toBe(false);
  });

  it('drops an injected snippet evaluated against the page at line 1', () => {
    expect(isForeignScriptError('http://192.168.1.5:9400/panel/phone', 1, page)).toBe(true);
  });

  it('keeps our inline index.html scripts, which sit past line 1', () => {
    expect(isForeignScriptError('http://192.168.1.5:9400/panel/phone', 32, page)).toBe(false);
  });

  it('drops scripts served from another origin or an extension', () => {
    expect(isForeignScriptError('chrome-extension://abc/inpage.js', 3, page)).toBe(true);
  });

  it('does not report a foreign window error in a production build', async () => {
    vi.stubEnv('DEV', false);
    window.dispatchEvent(new ErrorEvent('error', {
      error: new TypeError('undefined is not an object (evaluating window.ethereum.selectedAddress)'),
      message: 'x', filename: 'http://localhost:3000/panel/phone', lineno: 1,
    }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(postService).not.toHaveBeenCalled();
  });
});

describe('stale chunk errors', () => {
  it('never consults the recovery for an ordinary error', async () => {
    recoverNow.mockClear();
    reportError(new Error('Cannot read properties of undefined'), 'window-error');
    await vi.advanceTimersByTimeAsync(5000);
    expect(recoverNow).not.toHaveBeenCalled();
    expect(sent()).toHaveLength(1);
  });

  const stale = () => new TypeError('Failed to fetch dynamically imported module: http://localhost:9400/assets/DevicesPage-Bc.js');

  it('ignores a stale chunk message that is only in the cause chain', async () => {
    recoverNow.mockClear();
    reportError(new Error('wrapper', { cause: stale() }), 'unhandled-rejection');
    await vi.advanceTimersByTimeAsync(5000);
    expect(recoverNow).not.toHaveBeenCalled();
    expect(sent()).toHaveLength(1);
  });

  it('are swallowed when the reload guard allowed a reload', async () => {
    recoverNow.mockResolvedValueOnce('reloaded');
    reportError(stale(), 'unhandled-rejection');
    await vi.advanceTimersByTimeAsync(5000);
    expect(postService).not.toHaveBeenCalled();
  });

  it('are still reported when the guard blocked the reload', async () => {
    recoverNow.mockResolvedValueOnce('loop-guard');
    reportError(stale(), 'unhandled-rejection');
    await vi.advanceTimersByTimeAsync(5000);
    expect(sent()).toHaveLength(1);
    expect(sent()[0].errors[0].context).toContain('no-reload:loop-guard');
  });
});
