import { act, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCurveSave } from './useCurveSave';

// Rendered outside I18nProvider, so t() falls back to raw keys.

const api = vi.hoisted(() => ({ save: vi.fn() }));

vi.mock('../api/cooling', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/cooling')>()),
  saveCurves: api.save,
}));

const body = (n: number) => ({ globalSpeedModifier: n, curves: [] });
const ok = { error: false, msg: '' };

const handle: { current: ReturnType<typeof useCurveSave> | null } = { current: null };
const save = (b: ReturnType<typeof body>) => handle.current!.save(b);
const onSaved = vi.fn();

// No ToastProvider: the error has to render inline.
function Harness() {
  const curveSave = useCurveSave({ onSaved });
  useEffect(() => { handle.current = curveSave; });
  return <>{curveSave.error && <p role="alert">{curveSave.error.message}</p>}</>;
}

const savedBodies = () => api.save.mock.calls.map(c => c[0].globalSpeedModifier);

describe('useCurveSave', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.save.mockResolvedValue(ok);
  });

  it('saves the body and reports it', async () => {
    render(<Harness />);
    await act(async () => { await save(body(1)); });
    expect(savedBodies()).toEqual([1]);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('saves in order when each save is awaited', async () => {
    render(<Harness />);
    await act(async () => { await save(body(1)); });
    await act(async () => { await save(body(2)); });
    expect(savedBodies()).toEqual([1, 2]);
  });

  it('saves the first body, then only the newest of those that arrive while it is in flight', async () => {
    render(<Harness />);
    let release!: (v: unknown) => void;
    api.save.mockImplementationOnce(() => new Promise(r => { release = r; }));
    let first!: Promise<unknown>;
    let second!: Promise<unknown>;
    let third!: Promise<unknown>;
    act(() => { first = save(body(1)); });
    act(() => { second = save(body(2)); third = save(body(3)); });
    await act(async () => { release(ok); await Promise.all([first, second, third]); });
    expect(savedBodies()).toEqual([1, 3]);
  });

  it('shows an error for a failed save and clears it once the next save succeeds', async () => {
    render(<Harness />);
    api.save.mockResolvedValueOnce({ error: true, msg: 'no' });
    await act(async () => { await save(body(1)); });
    expect(screen.getByRole('alert')).toHaveTextContent('cooling.guard.error.save');
    expect(onSaved).not.toHaveBeenCalled();
    await act(async () => { await save(body(2)); });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('rejects the waiting callers when the request throws', async () => {
    render(<Harness />);
    api.save.mockRejectedValueOnce(new Error('boom'));
    await act(async () => { await expect(save(body(1))).rejects.toThrow('boom'); });
  });
});
