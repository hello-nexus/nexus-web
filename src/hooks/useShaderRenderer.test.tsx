import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useShaderRenderer } from './useShaderRenderer';
import type { EffectState } from '../types/lighting';

vi.mock('../api/lighting', () => ({
  fetchShaderSource: vi.fn(async () => ({ frag: 'void main() {}', params: [] })),
}));

function fakeGl() {
  const noop = vi.fn();
  return new Proxy({ createShader: () => ({}), createProgram: () => ({}), getShaderParameter: () => true, getProgramParameter: () => true } as Record<string, unknown>, {
    get: (t, k: string) => (k in t ? t[k] : /^[A-Z_0-9]+$/.test(k) ? 1 : noop),
  });
}

describe('useShaderRenderer', () => {
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stops drawing without throwing when the canvas is detached mid-loop', async () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue(fakeGl() as unknown as WebGL2RenderingContext);
    const canvasRef = { current: canvas as HTMLCanvasElement | null };
    const stateRef = { current: { params: {} } as unknown as EffectState };
    renderHook(() => useShaderRenderer(canvasRef, 'fx', stateRef));
    await waitFor(() => expect(frames.length).toBe(1));

    frames[0](16);
    expect(frames.length).toBe(2);

    canvasRef.current = null;
    expect(() => frames[1](32)).not.toThrow();
    expect(frames.length).toBe(2);
  });
});
