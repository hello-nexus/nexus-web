import { useEffect } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PcSetupRecord } from '../../../../api/pcSetup';
import type { HeadlessBuild } from '../../../../components/views/BuildPage/BuildPage';
import { supportsAirflow } from '../../../../lib/cooling/airflowCases';
import { resetTried } from '../../../../lib/cooling/autoResolve';
import { CoolingAutoResolve, RESOLVE_TIMEOUT_MS, type AutoResolveState } from './CoolingAutoResolve';

const h = vi.hoisted(() => ({
  remote: false,
  setup: { record: null as unknown, loaded: false },
  machine: { machine: null as unknown, key: null as string | null },
  frames: 0,
  headless: null as null | HeadlessBuild,
}));

vi.mock('../../../../api/service', () => ({ get isRemoteOrigin() { return h.remote; } }));
vi.mock('../../../../hooks/usePcSetupRecord', () => ({ usePcSetupRecord: () => h.setup }));
vi.mock('../../../../components/views/BuildPage/buildMachine', () => ({ useBuildMachine: () => h.machine }));
vi.mock('../../../../components/views/BuildPage/BuildPage', () => ({
  BuildPage: ({ headless }: { headless: HeadlessBuild }) => {
    h.headless = headless;
    useEffect(() => { h.frames += 1; }, []);
    return <div data-testid="frame" />;
  },
}));

const record = (rev: number, layout?: Record<string, unknown>): PcSetupRecord => ({
  rev,
  setup: { version: 1, case: {}, items: [], resolved: { objects: [], ...(layout ? { caseLayout: layout } : {}) } },
});
const Y70 = 'hyte-y70-touch-infinite';
const machineFor = (key: string, caseId: string | undefined = Y70) => ({ machine: { processor: 'cpu', ...(caseId ? { caseId } : {}) }, key });

let state: AutoResolveState = { phase: 'idle', retry: () => undefined };
const view = () => <CoolingAutoResolve>{s => { state = s; return <div data-testid="child" data-phase={s.phase} />; }}</CoolingAutoResolve>;
const frame = () => screen.queryByTestId('frame');
const mount = () => render(view());

beforeEach(() => {
  vi.useFakeTimers();
  resetTried();
  h.remote = false;
  h.setup = { record: null, loaded: false };
  h.machine = { machine: null, key: null };
  h.frames = 0;
  h.headless = null;
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('CoolingAutoResolve', () => {
  it('mounts no frame while the record or the machine is still loading', () => {
    const { rerender } = mount();
    h.setup = { record: record(0), loaded: true };
    rerender(view());
    expect(frame()).toBeNull();
    expect(state.phase).toBe('idle');
  });

  it('resolves an empty record for a detected Y70: the frame mounts with the machine and key, then goes once the record holds the layout', () => {
    h.setup = { record: record(0), loaded: true };
    h.machine = machineFor('k1');
    const { rerender } = mount();
    expect(frame()).not.toBeNull();
    expect(state.phase).toBe('resolving');
    expect(h.headless).toMatchObject({ layoutKey: 'k1', machine: { caseId: Y70 } });

    act(() => h.headless!.onResolved({ rev: 1, saved: true, hasLayout: true, model: false }));
    // The layout is in, the model is not yet: the frame stays for it.
    h.setup = { record: record(1, { caseModel: 'HYTE Y70', inputKey: 'k1' }), loaded: true };
    rerender(view());
    expect(frame()).not.toBeNull();
    expect(supportsAirflow((h.setup.record as PcSetupRecord).setup.resolved.caseLayout && ((h.setup.record as PcSetupRecord).setup.resolved.caseLayout as { caseModel: string }).caseModel)).toBe(true);

    act(() => h.headless!.onResolved({ rev: 2, saved: true, hasLayout: true, model: true }));
    h.setup = { record: record(2, { caseModel: 'HYTE Y70', inputKey: 'k1' }), loaded: true };
    rerender(view());
    expect(frame()).toBeNull();
    expect(state.phase).toBe('idle');
  });

  it('re-resolves a stale layout once, and does not loop when it stays stale', () => {
    h.setup = { record: record(3, { caseModel: 'HYTE Y70', inputKey: 'old' }), loaded: true };
    h.machine = machineFor('k2');
    const { rerender } = mount();
    expect(frame()).not.toBeNull();
    expect(h.frames).toBe(1);
    act(() => h.headless!.onResolved({ rev: 3, saved: true, hasLayout: true, model: true }));
    // The record never took the new key: the frame is done, and no second one follows.
    rerender(view());
    expect(frame()).toBeNull();
    act(() => { vi.advanceTimersByTime(1000); });
    rerender(view());
    expect(frame()).toBeNull();
    expect(h.frames).toBe(1);
  });

  it('mounts no frame for a fresh layout', () => {
    h.setup = { record: record(3, { caseModel: 'HYTE Y70', inputKey: 'k1' }), loaded: true };
    h.machine = machineFor('k1');
    mount();
    expect(frame()).toBeNull();
    expect(state.phase).toBe('idle');
  });

  it('mounts no frame when no case is known, or on the web', () => {
    h.setup = { record: record(0), loaded: true };
    h.machine = machineFor('k1', '');
    const { unmount } = mount();
    expect(frame()).toBeNull();
    unmount();
    h.machine = machineFor('k1');
    h.remote = true;
    h.machine = { machine: null, key: null };
    mount();
    expect(frame()).toBeNull();
  });

  it('is done at once when Build resolved no layout, leaving the record\'s own notice to show', () => {
    h.setup = { record: record(0), loaded: true };
    h.machine = machineFor('k1');
    const { rerender } = mount();
    act(() => h.headless!.onResolved({ rev: 0, saved: true, hasLayout: false, model: false }));
    rerender(view());
    expect(frame()).toBeNull();
    expect(state.phase).toBe('idle');
  });

  it('shows a failure when the frame never loads (offline), and retries on request', () => {
    h.setup = { record: record(0), loaded: true };
    h.machine = machineFor('k1');
    const { rerender } = mount();
    act(() => h.headless!.onUnavailable());
    rerender(view());
    expect(frame()).toBeNull();
    expect(state.phase).toBe('failed');
    act(() => state.retry());
    rerender(view());
    expect(frame()).not.toBeNull();
    expect(state.phase).toBe('resolving');
  });

  it('fails when the service refused the write', () => {
    h.setup = { record: record(0), loaded: true };
    h.machine = machineFor('k1');
    const { rerender } = mount();
    act(() => h.headless!.onResolved({ rev: 0, saved: false, hasLayout: true, model: false }));
    rerender(view());
    expect(state.phase).toBe('failed');
  });

  it('gives up after the timeout, so an old Build that never answers leaves a notice and not a spinner', () => {
    h.setup = { record: record(0), loaded: true };
    h.machine = machineFor('k1');
    const { rerender } = mount();
    expect(state.phase).toBe('resolving');
    act(() => { vi.advanceTimersByTime(RESOLVE_TIMEOUT_MS - 1); });
    expect(frame()).not.toBeNull();
    act(() => { vi.advanceTimersByTime(2); });
    rerender(view());
    expect(frame()).toBeNull();
    expect(state.phase).toBe('failed');
  });

  it('tries the key again on the next visit when the view was left before it finished', () => {
    h.setup = { record: record(0), loaded: true };
    h.machine = machineFor('k1');
    const first = mount();
    expect(frame()).not.toBeNull();
    first.unmount();
    mount();
    expect(frame()).not.toBeNull();
  });

  it('does not offer a failure for another key than the one in view', () => {
    h.setup = { record: record(0), loaded: true };
    h.machine = machineFor('k1');
    const { rerender } = mount();
    act(() => h.headless!.onUnavailable());
    h.machine = machineFor('k2');
    rerender(view());
    // The new key gets its own try.
    expect(state.phase).toBe('resolving');
  });
});
