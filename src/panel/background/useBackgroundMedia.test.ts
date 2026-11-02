import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchService = vi.hoisted(() => vi.fn());
const postServiceFormResult = vi.hoisted(() => vi.fn());
const deleteService = vi.hoisted(() => vi.fn());
vi.mock('../../api/service', () => ({
  fetchService: (...a: unknown[]) => fetchService(...a),
  postServiceFormResult: (...a: unknown[]) => postServiceFormResult(...a),
  deleteService: (...a: unknown[]) => deleteService(...a),
  postService: vi.fn(),
  fetchServiceBlob: vi.fn().mockResolvedValue(null),
  resolveHttp: (p: string) => p,
  tokenParam: () => '',
}));

import { commitBackgroundMedia, deleteBackgroundMedia } from '../../api/panelBackgroundMedia';
import { useBackgroundMedia } from './useBackgroundMedia';

const item = { id: 'm1', name: 'cat', sourceExt: '.gif', type: 'animated', width: 1, height: 1, importedAtUnixMs: 1, durationSec: 1, alpha: false };

beforeEach(() => {
  fetchService.mockReset().mockResolvedValue({ items: [] });
  postServiceFormResult.mockReset();
  deleteService.mockReset();
});

describe('useBackgroundMedia across entry points', () => {
  it('an already mounted list shows an item committed through the quick-edit path', async () => {
    const { result } = renderHook(() => useBackgroundMedia('dev1'));
    await waitFor(() => expect(fetchService).toHaveBeenCalledTimes(1));
    expect(result.current.items).toEqual([]);

    fetchService.mockResolvedValue({ items: [item] });
    postServiceFormResult.mockResolvedValue({ item, error: false, msg: '' });
    await act(async () => { await commitBackgroundMedia('dev1', 'stage1', '{}', 10, 10); });

    await waitFor(() => expect(result.current.items.map(i => i.id)).toEqual(['m1']));
  });

  it('a refused commit changes nothing', async () => {
    renderHook(() => useBackgroundMedia('dev1'));
    await waitFor(() => expect(fetchService).toHaveBeenCalledTimes(1));
    postServiceFormResult.mockResolvedValue({ item: null, error: true, msg: 'no' });
    await act(async () => { await commitBackgroundMedia('dev1', 'stage1', '{}', 10, 10); });
    expect(fetchService).toHaveBeenCalledTimes(1);
  });

  it('a commit for another panel does not refetch this list', async () => {
    renderHook(() => useBackgroundMedia('dev1'));
    await waitFor(() => expect(fetchService).toHaveBeenCalledTimes(1));
    postServiceFormResult.mockResolvedValue({ item, error: false, msg: '' });
    await act(async () => { await commitBackgroundMedia('other', 'stage1', '{}', 10, 10); });
    expect(fetchService).toHaveBeenCalledTimes(1);
  });

  it('a delete from another list drops the item here', async () => {
    fetchService.mockResolvedValue({ items: [item] });
    const { result } = renderHook(() => useBackgroundMedia('dev1'));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    fetchService.mockResolvedValue({ items: [] });
    deleteService.mockResolvedValue({ error: false });
    await act(async () => { await deleteBackgroundMedia('dev1', 'm1'); });
    await waitFor(() => expect(result.current.items).toEqual([]));
  });
});
