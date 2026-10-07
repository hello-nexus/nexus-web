import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCurveSaveLint } from './useCurveSaveLint';

// Rendered outside I18nProvider, so t() falls back to raw keys.

const api = vi.hoisted(() => ({
  lint: vi.fn(),
  save: vi.fn(),
  heal: vi.fn(),
  config: vi.fn(),
}));

vi.mock('../api/cooling', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/cooling')>()),
  lintCurves: api.lint,
  saveCurves: api.save,
  healCooling: api.heal,
  setGuardConfig: api.config,
}));

const hazard = { channelId: 'a', channelName: 'Fan #1', kind: 'manual-low', rootId: null, rootName: null };
const body = (n: number) => ({ globalSpeedModifier: n, curves: [] });
const hazardous = { hazards: [hazard], fixAvailable: true };
const ok = { error: false, msg: '' };
const healed = { undoAvailable: true, healedAtUtcMs: 1, channels: [{ id: 'a', name: 'Fan #1', hazard: 'manual-low' }] };
const clean = { hazards: [], fixAvailable: false };

const handle: { current: ReturnType<typeof useCurveSaveLint> | null } = { current: null };
const save = (b: ReturnType<typeof body>) => handle.current!.saveWithLint(b);
const onHealed = vi.fn();
const onSaved = vi.fn();

// No ToastProvider: the error has to render inline.
function Harness({ lintEnabled }: { lintEnabled?: boolean }) {
  const lint = useCurveSaveLint({ onHealed, onSaved, lintEnabled });
  useEffect(() => { handle.current = lint; });
  return <>{lint.prompt}{lint.error && <p role="alert">{lint.error.message}</p>}</>;
}

const mount = (lintEnabled?: boolean) => render(<Harness lintEnabled={lintEnabled} />);
const savedBodies = () => api.save.mock.calls.map(c => c[0].globalSpeedModifier);

describe('useCurveSaveLint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.lint.mockResolvedValue(clean);
    api.save.mockResolvedValue(ok);
    api.config.mockResolvedValue({ state: 'normal', lintWarnings: false });
    api.heal.mockResolvedValue(healed);
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

  it('reports a failed heal inline and keeps no stale notice', async () => {
    mount();
    api.lint.mockResolvedValue(hazardous);
    api.heal.mockResolvedValue(null);
    act(() => { void save(body(1)); });
    fireEvent.click(await screen.findByRole('button', { name: 'cooling.guard.dialog.fix' }));
    await screen.findByText('cooling.guard.error.heal');
    expect(onHealed).not.toHaveBeenCalled();
    expect(savedBodies()).toEqual([1]);
    expect(screen.getByRole('alert').textContent).toBe('cooling.guard.error.heal');
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

  it('prompts once per body and heals once each when Fix is followed by a superseding save', async () => {
    mount();
    api.lint.mockResolvedValue(hazardous);
    let first!: Promise<unknown>;
    let second!: Promise<unknown>;
    act(() => { first = save(body(1)); });
    await screen.findByText('cooling.guard.dialog.title');
    act(() => { second = save(body(2)); });
    fireEvent.click(screen.getByRole('button', { name: 'cooling.guard.dialog.fix' }));
    // Fix does not carry over: the newer body prompts on its own hazards.
    await waitFor(() => { expect(api.lint).toHaveBeenCalledTimes(2); });
    expect(api.save).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'cooling.guard.dialog.fix' }));
    await act(async () => { await Promise.all([first, second]); });
    expect(savedBodies()).toEqual([2]);
    expect(api.heal).toHaveBeenCalledTimes(1);
  });

  it('does not heal a superseding body that has no hazards', async () => {
    mount();
    api.lint.mockResolvedValueOnce(hazardous).mockResolvedValue(clean);
    let first!: Promise<unknown>;
    let second!: Promise<unknown>;
    act(() => { first = save(body(1)); });
    await screen.findByText('cooling.guard.dialog.title');
    act(() => { second = save(body(2)); });
    fireEvent.click(screen.getByRole('button', { name: 'cooling.guard.dialog.fix' }));
    await act(async () => { await Promise.all([first, second]); });
    expect(savedBodies()).toEqual([2]);
    expect(api.heal).not.toHaveBeenCalled();
  });

  it.each([['null', null], ['an error envelope', { error: true, msg: 'x' }]])('never heals after a save that returned %s', async (_n, result) => {
    mount();
    api.lint.mockResolvedValue(hazardous);
    api.save.mockResolvedValue(result);
    act(() => { void save(body(1)); });
    fireEvent.click(await screen.findByRole('button', { name: 'cooling.guard.dialog.fix' }));
    await screen.findByText('cooling.guard.error.save');
    expect(api.heal).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('prompts again for a body queued during the heal', async () => {
    mount();
    api.lint.mockResolvedValue(hazardous);
    let finishHeal!: (v: unknown) => void;
    api.heal.mockImplementation(() => new Promise(r => { finishHeal = r; }));
    act(() => { void save(body(1)); });
    fireEvent.click(await screen.findByRole('button', { name: 'cooling.guard.dialog.fix' }));
    await waitFor(() => { expect(api.heal).toHaveBeenCalled(); });
    act(() => { void save(body(2)); });
    await act(async () => { finishHeal(healed); });
    // Fix acknowledged nothing, so the pre-heal body asks instead of overwriting the heal.
    await screen.findByText('cooling.guard.dialog.title');
    expect(savedBodies()).toEqual([1]);
  });

  it('clears the error and reports a save once the next save succeeds', async () => {
    mount();
    api.save.mockResolvedValueOnce(null);
    await act(async () => { await save(body(1)); });
    expect(screen.getByRole('alert')).toBeTruthy();
    await act(async () => { await save(body(2)); });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  describe("Don't warn me again", () => {
    const tick = () => screen.findByRole('checkbox');

    it('ticked with Fix: the opt-out goes in its own request, then the save and the heal', async () => {
      mount();
      api.lint.mockResolvedValue(hazardous);
      act(() => { void save(body(1)); });
      fireEvent.click(await tick());
      fireEvent.click(screen.getByRole('button', { name: 'cooling.guard.dialog.fix' }));
      await waitFor(() => { expect(api.heal).toHaveBeenCalled(); });
      expect(api.config).toHaveBeenCalledExactlyOnceWith({ lintWarnings: false });
      expect(savedBodies()).toEqual([1]);
    });

    it('ticked with Save anyway: the opt-out is sent and nothing is healed', async () => {
      mount();
      api.lint.mockResolvedValue(hazardous);
      act(() => { void save(body(1)); });
      fireEvent.click(await tick());
      fireEvent.click(screen.getByRole('button', { name: 'cooling.guard.dialog.saveAnyway' }));
      await waitFor(() => { expect(savedBodies()).toEqual([1]); });
      expect(api.config).toHaveBeenCalledExactlyOnceWith({ lintWarnings: false });
      expect(api.heal).not.toHaveBeenCalled();
    });

    it('unticked sends no opt-out', async () => {
      mount();
      api.lint.mockResolvedValue(hazardous);
      act(() => { void save(body(1)); });
      fireEvent.click(await screen.findByRole('button', { name: 'cooling.guard.dialog.saveAnyway' }));
      await waitFor(() => { expect(savedBodies()).toEqual([1]); });
      expect(api.config).not.toHaveBeenCalled();
    });

    it('after the opt-out, later saves skip the lint and save directly', async () => {
      mount();
      api.lint.mockResolvedValue(hazardous);
      act(() => { void save(body(1)); });
      fireEvent.click(await tick());
      fireEvent.click(screen.getByRole('button', { name: 'cooling.guard.dialog.saveAnyway' }));
      await waitFor(() => { expect(savedBodies()).toEqual([1]); });
      api.lint.mockClear();
      await act(async () => { await save(body(2)); });
      expect(api.lint).not.toHaveBeenCalled();
      expect(savedBodies()).toEqual([1, 2]);
    });

    it('Esc with the box ticked only saves: no opt-out is sent', async () => {
      mount();
      api.lint.mockResolvedValue(hazardous);
      act(() => { void save(body(1)); });
      fireEvent.click(await tick());
      fireEvent.keyDown(document, { key: 'Escape' });
      await waitFor(() => { expect(savedBodies()).toEqual([1]); });
      expect(api.config).not.toHaveBeenCalled();
      expect(api.heal).not.toHaveBeenCalled();
    });

    it('Fix with the box ticked still fixes a body that superseded the prompted one, with no new prompt', async () => {
      mount();
      api.lint.mockResolvedValue(hazardous);
      let first!: Promise<unknown>;
      let second!: Promise<unknown>;
      act(() => { first = save(body(1)); });
      fireEvent.click(await tick());
      act(() => { second = save(body(2)); });
      fireEvent.click(screen.getByRole('button', { name: 'cooling.guard.dialog.fix' }));
      await act(async () => { await Promise.all([first, second]); });
      expect(api.config).toHaveBeenCalledExactlyOnceWith({ lintWarnings: false });
      expect(savedBodies()).toEqual([2]);
      expect(api.heal).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('cooling.guard.dialog.title')).toBeNull();
      // Later saves skip the lint as designed.
      api.lint.mockClear();
      await act(async () => { await save(body(3)); });
      expect(api.lint).not.toHaveBeenCalled();
    });

    it('a failed opt-out keeps its error across a superseding body', async () => {
      mount();
      api.lint.mockResolvedValue(hazardous);
      api.config.mockResolvedValue(null);
      let first!: Promise<unknown>;
      let second!: Promise<unknown>;
      act(() => { first = save(body(1)); });
      fireEvent.click(await tick());
      act(() => { second = save(body(2)); });
      fireEvent.click(screen.getByRole('button', { name: 'cooling.guard.dialog.saveAnyway' }));
      await act(async () => { await Promise.all([first, second]); });
      expect(screen.getByText('cooling.guard.error.lintWarnings')).toBeTruthy();
    });

    it('a failed opt-out shows an error and keeps warning', async () => {
      mount();
      api.lint.mockResolvedValue(hazardous);
      api.config.mockResolvedValue(null);
      act(() => { void save(body(1)); });
      fireEvent.click(await tick());
      fireEvent.click(screen.getByRole('button', { name: 'cooling.guard.dialog.saveAnyway' }));
      await screen.findByText('cooling.guard.error.lintWarnings');
      expect(savedBodies()).toEqual([1]);
      api.lint.mockClear();
      await act(async () => { void save(body(2)); });
      expect(api.lint).toHaveBeenCalled();
    });
  });

  it('skips the lint entirely while lintEnabled is false', async () => {
    mount(false);
    await act(async () => { await save(body(1)); });
    expect(api.lint).not.toHaveBeenCalled();
    expect(savedBodies()).toEqual([1]);
  });
});
