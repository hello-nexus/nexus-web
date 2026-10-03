// SDK track(): the worker side forwards to the host api (no-op in a preview or
// on a host without it), and the host side posts to the service with the surface.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { createStore, type WidgetHostApi } from '../../../sdk/runtime/context';
import { track } from '../../../sdk/runtime/hooks';

const postService = vi.fn();
vi.mock('../../api/service', () => ({ postService: (...a: unknown[]) => postService(...a) }));

function storeWith(api: Partial<WidgetHostApi>, preview = false) {
  return createStore({
    instanceId: 'i-1',
    widgetId: 'com.example.app',
    size: { width: 1, height: 1 },
    settings: {},
    local: {},
    preview,
    api: { persistLocal: () => {}, dispatch: () => Promise.resolve(null), ...api },
  });
}

afterEach(() => { cleanup(); postService.mockReset(); vi.restoreAllMocks(); });

describe('track (worker side)', () => {
  it('forwards the event and properties to the host api', () => {
    const spy = vi.fn();
    storeWith({ track: spy });
    track('level_done', { level: 3, won: true });
    expect(spy).toHaveBeenCalledWith('level_done', { level: 3, won: true });
  });

  it('is a no-op in a preview and when the host has no track', () => {
    const spy = vi.fn();
    storeWith({ track: spy }, true);
    track('x');
    expect(spy).not.toHaveBeenCalled();
    storeWith({});
    expect(() => track('x')).not.toThrow();
  });

  it('never throws when the host call throws or rejects', async () => {
    storeWith({ track: () => { throw new Error('boom'); } });
    expect(() => track('x')).not.toThrow();
    storeWith({ track: () => Promise.reject(new Error('no')) });
    expect(() => track('x')).not.toThrow();
    await Promise.resolve();
  });
});

describe('sendAppTelemetry (host side)', () => {
  it('posts to the app route and maps the cell surface to widget', async () => {
    const { sendAppTelemetry } = await import('../appTelemetryClient');
    postService.mockResolvedValue({ error: false, msg: '' });
    await sendAppTelemetry('com.example.app', 'cell', 'level_done', { level: 3 });
    expect(postService).toHaveBeenCalledWith('/apps-api/telemetry/com.example.app', { event: 'level_done', properties: { level: 3 }, surface: 'widget' });
    await sendAppTelemetry('com.example.app', 'immersive', 'e');
    expect(postService.mock.calls[1][1]).toMatchObject({ surface: 'immersive' });
    await sendAppTelemetry('com.example.app', 'page', 'e');
    expect(postService.mock.calls[2][1]).toMatchObject({ surface: 'page' });
  });

  it('reports an error envelope to the console', async () => {
    const { sendAppTelemetry } = await import('../appTelemetryClient');
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    postService.mockResolvedValue({ error: true, msg: 'telemetry capability not granted' });
    await sendAppTelemetry('com.example.app', 'page', 'e');
    expect(err).toHaveBeenCalledWith(expect.stringContaining('telemetry capability not granted'));
  });

  it('swallows a network failure', async () => {
    const { sendAppTelemetry } = await import('../appTelemetryClient');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    postService.mockRejectedValue(new Error('offline'));
    await expect(sendAppTelemetry('a', 'page', 'e')).resolves.toBeUndefined();
  });
});
