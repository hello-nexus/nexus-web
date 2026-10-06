// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { setAw3225QfCrosshair } from './aw3225qf';

const request = vi.hoisted(() => vi.fn());
vi.mock('./service', () => ({ authFetchWithStatus: request, fetchService: vi.fn() }));
beforeEach(() => request.mockReset());

it('preserves a hardware error response instead of discarding its saved configuration', async () => {
  const result = { connected: true, enabled: false, config: { type: 0, color: 2, maskControl: 0 }, error: 'Could not set the crosshair.' };
  request.mockResolvedValue({ status: 422, response: new Response(JSON.stringify(result), { status: 422 }) });
  expect(await setAw3225QfCrosshair(true, { type: 5, color: 3, maskControl: 0 })).toEqual(result);
});

it('does not treat an authentication error as monitor state', async () => {
  request.mockResolvedValue({ status: 401, response: new Response('{}', { status: 401 }) });
  expect(await setAw3225QfCrosshair(true, { type: 0, color: 2, maskControl: 0 })).toBeNull();
});
