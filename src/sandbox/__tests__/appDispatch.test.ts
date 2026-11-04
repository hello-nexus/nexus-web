import { beforeEach, describe, expect, it, vi } from 'vitest';

const downloadSupportBundle = vi.fn();
const postService = vi.fn();
vi.mock('../../api/diagnostics', () => ({ downloadSupportBundle: () => downloadSupportBundle() }));
vi.mock('../../api/service', () => ({ postService: (...a: unknown[]) => postService(...a) }));

import { createAppDispatch } from '../appDispatch';

const ACTION = 'diagnostics.supportBundle';

describe('createAppDispatch', () => {
  beforeEach(() => {
    downloadSupportBundle.mockReset();
    postService.mockReset();
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
});
