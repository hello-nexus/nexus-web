import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BASE_DEFAULTS } from '../types/lighting';
import { primeShaderSource, peekShaderSource, startAnimate, startStudioLive } from './lighting';
import { setActiveTransport } from './service';

const binding = { category: 'quick', sensor: 'summary/cpu-usage', min: 0, max: 100 };

beforeEach(() => {
  localStorage.setItem('nexus_token', 'test-token');
  setActiveTransport('lan');
});

afterEach(() => {
  vi.unstubAllGlobals();
  setActiveTransport(null);
});

function stubFetch() {
  const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ error: false, msg: 'Ok' }) }) as Response);
  vi.stubGlobal('fetch', fetchMock);
  return () => JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string) as Record<string, unknown>;
}

describe('sensor picks on the wire', () => {
  it('sends them with an animate start only when the user changed one', async () => {
    const body = stubFetch();
    await startAnimate('sensorbar', 50, 1, 0, 0, 1, 1, {}, true, { u_fill_level_s: binding });
    expect(body().sensors).toEqual({ u_fill_level_s: binding });
  });

  it('leaves the field out when there are none, so an older service sees the body it knows', async () => {
    const body = stubFetch();
    await startAnimate('sensorbar', 50, 1, 0, 0, 1, 1, {}, true, {});
    expect(body()).not.toHaveProperty('sensors');
  });

  it('carries them in a Studio live session too', async () => {
    const body = stubFetch();
    await startStudioLive('frag', { ...BASE_DEFAULTS, params: {}, sensors: { u_a_level_s: binding } });
    expect(body().sensors).toEqual({ u_a_level_s: binding });
  });
});

describe('shader source', () => {
  it('lists the sensor uniforms its frag declares', () => {
    primeShaderSource('fx-test', [
      'uniform float u_a_level; // hint_range(0.0, 1.0, 0.01) = 0.0',
      'uniform float u_a_level_s; // sensor {"category":"quick","sensor":"summary/cpu-usage","min":0,"max":100}',
    ].join('\n'));
    expect(peekShaderSource('fx-test')?.sensors).toEqual([{ name: 'u_a_level_s', binding }]);
    expect(peekShaderSource('fx-test')?.params.map(p => p.name)).toEqual(['u_a_level']);
  });
});
