import { beforeEach, describe, expect, it, vi } from 'vitest';

const downloadSupportBundle = vi.fn();
const postService = vi.fn();
vi.mock('../../api/diagnostics', () => ({ downloadSupportBundle: () => downloadSupportBundle() }));
vi.mock('../../api/service', () => ({ postService: (...a: unknown[]) => postService(...a) }));

import { createAppDispatch, _resetSupportBundleGatesForTests } from '../appDispatch';

const ACTION = 'diagnostics.supportBundle';

describe('createAppDispatch', () => {
  beforeEach(() => {
    downloadSupportBundle.mockReset();
    postService.mockReset();
    _resetSupportBundleGatesForTests();
    vi.useRealTimers();
  });

  it('downloads the bundle for a granted support bundle action without calling the service', async () => {
    downloadSupportBundle.mockResolvedValue(true);
    const dispatch = createAppDispatch({ appId: 'a.b', allowed: [ACTION] });
    expect(await dispatch(ACTION)).toEqual({ ok: true, result: { saved: true } });
    expect(postService).not.toHaveBeenCalled();
  });

  it('reports failure and notifies when the download fails', async () => {
    downloadSupportBundle.mockResolvedValue(false);
    const onFail = vi.fn();
    const dispatch = createAppDispatch({ appId: 'a.b', allowed: [ACTION], onSupportBundleFailed: onFail });
    expect(await dispatch(ACTION)).toMatchObject({ ok: false });
    expect(onFail).toHaveBeenCalledTimes(1);
  });

  it('refuses the action when the manifest does not list it', async () => {
    const dispatch = createAppDispatch({ appId: 'a.b', allowed: [] });
    expect(await dispatch(ACTION)).toMatchObject({ ok: false });
    expect(downloadSupportBundle).not.toHaveBeenCalled();
  });

  it('forwards other actions to the service dispatch', async () => {
    postService.mockResolvedValue({ ok: true, result: 1 });
    const dispatch = createAppDispatch({ appId: 'a.b', allowed: ['system.specs'] });
    await dispatch('system.specs', { x: 1 });
    expect(postService).toHaveBeenCalledWith('/apps-api/dispatch', { appId: 'a.b', action: 'system.specs', args: { x: 1 } });
  });

  it('shares one in-flight bundle between concurrent calls', async () => {
    let finish: (v: boolean) => void = () => {};
    downloadSupportBundle.mockReturnValue(new Promise<boolean>((r) => { finish = r; }));
    const dispatch = createAppDispatch({ appId: 'a.b', allowed: [ACTION] });
    const first = dispatch(ACTION);
    const second = dispatch(ACTION);
    finish(true);
    expect(await first).toEqual({ ok: true, result: { saved: true } });
    expect(await second).toEqual({ ok: true, result: { saved: true } });
    expect(downloadSupportBundle).toHaveBeenCalledTimes(1);
  });

  it('refuses quietly during the cooldown after a saved bundle, then allows another', async () => {
    vi.useFakeTimers();
    downloadSupportBundle.mockResolvedValue(true);
    const onFail = vi.fn();
    const dispatch = createAppDispatch({ appId: 'a.b', allowed: [ACTION], onSupportBundleFailed: onFail });
    await dispatch(ACTION);
    expect(await dispatch(ACTION)).toEqual({ ok: false, error: 'cooldown' });
    expect(downloadSupportBundle).toHaveBeenCalledTimes(1);
    expect(onFail).not.toHaveBeenCalled();
    vi.advanceTimersByTime(31_000);
    expect(await dispatch(ACTION)).toMatchObject({ ok: true });
    expect(downloadSupportBundle).toHaveBeenCalledTimes(2);
  });

  it('does not cool down after a failed download, so a retry runs', async () => {
    downloadSupportBundle.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const dispatch = createAppDispatch({ appId: 'a.b', allowed: [ACTION] });
    expect(await dispatch(ACTION)).toMatchObject({ ok: false });
    expect(await dispatch(ACTION)).toMatchObject({ ok: true });
  });

  it('gates each app on its own', async () => {
    downloadSupportBundle.mockResolvedValue(true);
    await createAppDispatch({ appId: 'a.b', allowed: [ACTION] })(ACTION);
    expect(await createAppDispatch({ appId: 'c.d', allowed: [ACTION] })(ACTION)).toMatchObject({ ok: true });
  });
});
