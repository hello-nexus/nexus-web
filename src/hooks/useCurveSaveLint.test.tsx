import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/common/Toast/Toast';
import { useCurveSaveLint } from './useCurveSaveLint';

// Rendered outside I18nProvider, so t() falls back to raw keys.

const api = vi.hoisted(() => ({
  lint: vi.fn(),
  save: vi.fn(),
  heal: vi.fn(),
}));

vi.mock('../api/cooling', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/cooling')>()),
  lintCurves: api.lint,
  saveCurves: api.save,
  healCooling: api.heal,
}));

const hazard = { channelId: 'a', channelName: 'Fan #1', kind: 'manual-low', rootId: null, rootName: null };
const body = (n: number) => ({ globalSpeedModifier: n, curves: [] });
const hazardous = { hazards: [hazard], fixAvailable: true };
const clean = { hazards: [], fixAvailable: false };

const handle: { current: ReturnType<typeof useCurveSaveLint> | null } = { current: null };
const save = (b: ReturnType<typeof body>) => handle.current!.saveWithLint(b);
const onHealed = vi.fn();

function Harness() {
  const lint = useCurveSaveLint(onHealed);
  useEffect(() => { handle.current = lint; });
  return <>{lint.prompt}</>;
}

const mount = () => render(<ToastProvider><Harness /></ToastProvider>);
const savedBodies = () => api.save.mock.calls.map(c => c[0].globalSpeedModifier);

describe('useCurveSaveLint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.lint.mockResolvedValue(clean);
    api.save.mockResolvedValue(undefined);
    api.heal.mockResolvedValue({ undoAvailable: true, healedAtUtcMs: 1, channels: [{ id: 'a', name: 'Fan #1', hazard: 'manual-low' }] });
  });

  it('a save arriving while the prompt is open replaces the held body and saves once', async () => {
    mount();
    api.lint.mockResolvedValue(hazardous);
    let first!: Promise<unknown>;
    let second!: Promise<unknown>;
    act(() => { first = save(body(1)); });
    await screen.findByText('cooling.guard.dialog.title');
    act(() => { second = save(body(2)); });
    // Nothing saves while the prompt is up.
    expect(api.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'cooling.guard.dialog.saveAnyway' }));
    await act(async () => { await Promise.all([first, second]); });
    expect(savedBodies()).toEqual([2]);
  });

  it('serializes lints that are in flight and saves the newest body last', async () => {
    mount();
    const resolvers: Array<(v: unknown) => void> = [];
    api.lint.mockImplementation(() => new Promise(r => { resolvers.push(r); }));
    let first!: Promise<unknown>;
    let second!: Promise<unknown>;
    act(() => { first = save(body(1)); second = save(body(2)); });
    expect(api.lint).toHaveBeenCalledTimes(1);
    await act(async () => { resolvers[0](clean); });
    await waitFor(() => { expect(api.lint).toHaveBeenCalledTimes(2); });
    await act(async () => { resolvers[1](clean); });
    await act(async () => { await Promise.all([first, second]); });
    expect(savedBodies()).toEqual([2]);
  });

  it('saves in order when each save is awaited', async () => {
    mount();
    await act(async () => { await save(body(1)); });
    await act(async () => { await save(body(2)); });
    expect(savedBodies()).toEqual([1, 2]);
  });

  it('settles as Save anyway when unmounted with the prompt open', async () => {
    const view = mount();
    api.lint.mockResolvedValue(hazardous);
    let pending!: Promise<unknown>;
    act(() => { pending = save(body(7)); });
    await screen.findByText('cooling.guard.dialog.title');
    view.unmount();
    await pending;
    expect(savedBodies()).toEqual([7]);
    expect(api.heal).not.toHaveBeenCalled();
  });

  it('hides Fix when the service offers no fix', async () => {
    mount();
    api.lint.mockResolvedValue({ hazards: [hazard], fixAvailable: false });
    act(() => { void save(body(1)); });
    await screen.findByText('cooling.guard.dialog.title');
    expect(screen.queryByRole('button', { name: 'cooling.guard.dialog.fix' })).toBeNull();
    expect(screen.getByRole('button', { name: 'cooling.guard.dialog.saveAnyway' })).toBeTruthy();
  });

  it('reports a failed heal, keeps no stale notice, and asks again next time', async () => {
    mount();
    api.lint.mockResolvedValue(hazardous);
    api.heal.mockResolvedValue(null);
    act(() => { void save(body(1)); });
    fireEvent.click(await screen.findByRole('button', { name: 'cooling.guard.dialog.fix' }));
    await screen.findByText('cooling.guard.error.heal');
    expect(onHealed).not.toHaveBeenCalled();
    expect(savedBodies()).toEqual([1]);
    // Not acknowledged, so the same hazards prompt again.
    act(() => { void save(body(2)); });
    await screen.findByText('cooling.guard.dialog.title');
  });

  it('treats a heal that changed no channel as failed', async () => {
    mount();
    api.lint.mockResolvedValue(hazardous);
    api.heal.mockResolvedValue({ undoAvailable: false, healedAtUtcMs: null, channels: [] });
    act(() => { void save(body(1)); });
    fireEvent.click(await screen.findByRole('button', { name: 'cooling.guard.dialog.fix' }));
    await screen.findByText('cooling.guard.error.heal');
    expect(onHealed).not.toHaveBeenCalled();
  });

  it('reports a successful heal to the caller', async () => {
    mount();
    api.lint.mockResolvedValue(hazardous);
    act(() => { void save(body(1)); });
    fireEvent.click(await screen.findByRole('button', { name: 'cooling.guard.dialog.fix' }));
    await waitFor(() => { expect(onHealed).toHaveBeenCalled(); });
  });
});
