import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuardResponse } from '../../../api/cooling';
import { ThermalGuardSetting } from './ThermalGuardSetting';

// The real hook and component against a mocked service: how switch, slider and
// Reset intents are written. Rendered outside I18nProvider, so t() returns raw keys.

const api = vi.hoisted(() => ({ fetchGuard: vi.fn(), setGuardConfig: vi.fn(), undoHeal: vi.fn() }));

vi.mock('../../../api/cooling', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../api/cooling')>()),
  ...api,
}));
vi.mock('../../../hooks/useMultiplexSocket', () => ({ useTopicCallback: () => {} }));

const guard = (over: Partial<GuardResponse> = {}): GuardResponse => ({
  state: 'normal', enabled: true, guardTempC: 50, limitC: 95, limitSource: 'spec',
  detectedLimitC: 95, detectedLimitSource: 'spec', limitOverrideC: null,
  sinceUtcMs: null, lastTrip: null,
  heal: { undoAvailable: false, healedAtUtcMs: null, channels: [] },
  ...over,
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

const slider = () => screen.getByRole('slider') as HTMLInputElement;
const bodies = () => api.setGuardConfig.mock.calls.map(c => c[0]);

// The slider defers its commit by one tick after release, so settle that tick.
const tick = () => act(async () => { await new Promise(r => setTimeout(r, 5)); });

/** A drag with a pointer: commits on release. */
async function drag(to: number) {
  fireEvent.pointerDown(slider());
  fireEvent.change(slider(), { target: { value: String(to) } });
  fireEvent.pointerUp(slider());
  await tick();
}

async function mount() {
  const view = render(<ThermalGuardSetting serviceOnline />);
  await screen.findByRole('switch');
  return view;
}

describe('ThermalGuardSetting writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchGuard.mockResolvedValue(guard());
    api.setGuardConfig.mockImplementation(async (body: Record<string, unknown>) => guard({
      ...(body.limitOverrideC ? { limitOverrideC: body.limitOverrideC as number, limitC: body.limitOverrideC as number, limitSource: 'user' as const } : {}),
    }));
  });

  it('a Reset inside the keyboard settle window wins over the keyed value', async () => {
    api.fetchGuard.mockResolvedValue(guard({ limitOverrideC: 102, limitC: 102, limitSource: 'user' }));
    await mount();
    fireEvent.change(slider(), { target: { value: '99' } });
    fireEvent.keyUp(slider());
    fireEvent.click(screen.getByRole('button', { name: 'cooling.guard.limit.reset' }));
    await waitFor(() => { expect(bodies()).toContainEqual({ clearLimitOverride: true }); });
    await act(async () => { await new Promise(r => setTimeout(r, 600)); });
    expect(bodies().some(b => b.limitOverrideC !== undefined)).toBe(false);
  });

  it('a toggle in flight and a slider commit both land', async () => {
    const first = deferred<GuardResponse>();
    api.setGuardConfig.mockReturnValueOnce(first.promise);
    await mount();
    fireEvent.click(screen.getByRole('switch'));
    await drag(100);
    await act(async () => { first.resolve(guard({ enabled: false, state: 'off' })); });
    await waitFor(() => { expect(bodies()).toEqual([{ enabled: false }, { limitOverrideC: 100 }]); });
  });

  it('writes a keyed value that was still settling when the row unmounted', async () => {
    const view = await mount();
    fireEvent.change(slider(), { target: { value: '101' } });
    fireEvent.keyUp(slider());
    await tick();
    view.unmount();
    await waitFor(() => { expect(bodies()).toEqual([{ limitOverrideC: 101 }]); });
  });

  it('shows the error for a rejected request and the next action still writes', async () => {
    api.setGuardConfig.mockRejectedValueOnce(new Error('network'));
    await mount();
    await drag(100);
    await screen.findByText(/cooling\.guard\.error\.limit/);
    await drag(103);
    await waitFor(() => { expect(bodies()).toEqual([{ limitOverrideC: 100 }, { limitOverrideC: 103 }]); });
    await waitFor(() => { expect(screen.queryByText(/cooling\.guard\.error\.limit/)).toBeNull(); });
  });

  it('holds the dragged value across back-to-back commits', async () => {
    const first = deferred<GuardResponse>();
    api.setGuardConfig.mockReturnValueOnce(first.promise);
    await mount();
    await drag(100);
    expect(slider().value).toBe('100');
    await drag(104);
    expect(slider().value).toBe('104');
    await act(async () => { first.resolve(guard({ limitOverrideC: 100, limitC: 100, limitSource: 'user' })); });
    // The newer commit is still pending, so the first answer does not pull the thumb back.
    expect(slider().value).toBe('104');
    await waitFor(() => { expect(bodies()).toEqual([{ limitOverrideC: 100 }, { limitOverrideC: 104 }]); });
    await waitFor(() => { expect(slider().value).toBe('104'); });
  });

  it('commits when the pointer is released outside the slider', async () => {
    await mount();
    fireEvent.pointerDown(slider());
    fireEvent.change(slider(), { target: { value: '104' } });
    // The release lands elsewhere on the page, never on the range input.
    fireEvent.pointerUp(document.body);
    await waitFor(() => { expect(bodies()).toEqual([{ limitOverrideC: 104 }]); });
  });

  it('drops the draft without writing when a release outside lands on the current value', async () => {
    await mount();
    fireEvent.pointerDown(slider());
    fireEvent.change(slider(), { target: { value: '104' } });
    fireEvent.change(slider(), { target: { value: '95' } });
    fireEvent.pointerUp(document.body);
    await tick();
    expect(bodies()).toEqual([]);
    expect(slider().value).toBe('95');
  });

  it('a cancelled pointer commits like a release', async () => {
    await mount();
    fireEvent.pointerDown(slider());
    fireEvent.change(slider(), { target: { value: '102' } });
    fireEvent.pointerCancel(document.body);
    await waitFor(() => { expect(bodies()).toEqual([{ limitOverrideC: 102 }]); });
  });
});
