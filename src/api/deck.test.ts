// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('./service', () => ({
  fetchService: vi.fn(),
  postService: vi.fn(),
  putService: vi.fn(),
  deleteService: vi.fn(),
}));

import { fetchService, postService, putService, deleteService } from './service';
import {
  getDeckPresets, getDeckPreset, createDeckPreset, updateDeckPreset, deleteDeckPreset,
  getDeckInstance, updateDeckInstance,
} from './deck';

const PRESET = { id: 'p1', name: 'Streaming', cols: 5, rows: 3, pageCount: 1, deck: { pages: [{ slots: [] }] } };

describe('getDeckPresets', () => {
  it('fetches the host-wide preset list', async () => {
    vi.mocked(fetchService).mockResolvedValue({ presets: [PRESET] });
    expect(await getDeckPresets()).toEqual([PRESET]);
    expect(fetchService).toHaveBeenCalledWith('/deck/presets');
  });

  it('returns an empty array when the fetch fails', async () => {
    vi.mocked(fetchService).mockResolvedValue(null);
    expect(await getDeckPresets()).toEqual([]);
  });
});

describe('getDeckPreset', () => {
  it('fetches one preset by id, URL-encoded', async () => {
    vi.mocked(fetchService).mockResolvedValue({ preset: PRESET });
    expect(await getDeckPreset('p 1')).toEqual(PRESET);
    expect(fetchService).toHaveBeenCalledWith('/deck/presets/p%201');
  });

  it('returns null when the fetch fails', async () => {
    vi.mocked(fetchService).mockResolvedValue(null);
    expect(await getDeckPreset('p1')).toBeNull();
  });
});

describe('createDeckPreset', () => {
  it('posts the create body and returns the full preset', async () => {
    vi.mocked(postService).mockResolvedValue({ preset: PRESET });
    const result = await createDeckPreset({ name: 'Streaming', cols: 5, rows: 3 });
    expect(postService).toHaveBeenCalledWith('/deck/presets', { name: 'Streaming', cols: 5, rows: 3 });
    expect(result).toEqual(PRESET);
  });

  it('returns null on a refused write (duplicate name, cap reached, or transport failure)', async () => {
    vi.mocked(postService).mockResolvedValue(null);
    expect(await createDeckPreset({ name: 'Streaming', cols: 5, rows: 3 })).toBeNull();
  });
});

describe('updateDeckPreset', () => {
  it('PUTs the patch and returns the full preset', async () => {
    vi.mocked(putService).mockResolvedValue({ preset: PRESET });
    const result = await updateDeckPreset('p1', { name: 'Renamed' });
    expect(putService).toHaveBeenCalledWith('/deck/presets/p1', { name: 'Renamed' });
    expect(result).toEqual(PRESET);
  });
});

describe('deleteDeckPreset', () => {
  it('acks a successful delete', async () => {
    vi.mocked(deleteService).mockResolvedValue({});
    expect(await deleteDeckPreset('p1')).toBe(true);
    expect(deleteService).toHaveBeenCalledWith('/deck/presets/p1');
  });

  it('reports false on a 409 (last preset still pointed at by an instance)', async () => {
    vi.mocked(deleteService).mockResolvedValue({ error: true });
    expect(await deleteDeckPreset('p1')).toBe(false);
  });

  it('reports false when the request never lands', async () => {
    vi.mocked(deleteService).mockResolvedValue(null);
    expect(await deleteDeckPreset('p1')).toBe(false);
  });
});

describe('getDeckInstance', () => {
  it('fetches one instance by id, URL-encoded', async () => {
    vi.mocked(fetchService).mockResolvedValue({ instance: { mode: 'fixed', activePresetId: 'p1' } });
    const result = await getDeckInstance('widget:my id');
    expect(fetchService).toHaveBeenCalledWith('/deck/instances/widget%3Amy%20id');
    expect(result).toEqual({ mode: 'fixed', activePresetId: 'p1' });
  });

  it('returns null when the fetch fails', async () => {
    vi.mocked(fetchService).mockResolvedValue(null);
    expect(await getDeckInstance('streamdeck:SN1')).toBeNull();
  });
});

describe('updateDeckInstance', () => {
  it('PUTs the mode/activePresetId patch and returns the updated instance', async () => {
    vi.mocked(putService).mockResolvedValue({ instance: { mode: 'appAware', activePresetId: 'p2' } });
    const result = await updateDeckInstance('streamdeck:SN1', { mode: 'appAware' });
    expect(putService).toHaveBeenCalledWith('/deck/instances/streamdeck%3ASN1', { mode: 'appAware' });
    expect(result).toEqual({ mode: 'appAware', activePresetId: 'p2' });
  });
});
