// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./service', () => ({
  fetchService: vi.fn(),
  postService: vi.fn(),
  putService: vi.fn(),
  deleteService: vi.fn(),
  fetchServiceBlob: vi.fn(),
  postServiceBytesWithStatus: vi.fn(),
}));

vi.mock('../lib/saveFile', () => ({
  saveBlobToFile: vi.fn(),
}));

import { fetchService, postService, putService, deleteService, fetchServiceBlob, postServiceBytesWithStatus } from './service';
import { saveBlobToFile } from '../lib/saveFile';
import {
  getDeckPresets, getDeckPreset, createDeckPreset, updateDeckPreset, deleteDeckPreset,
  getDeckInstance, updateDeckInstance, exportDeckPreset, importDeckPreset,
} from './deck';

const PRESET = { id: 'p1', name: 'Streaming', cols: 5, rows: 3, pageCount: 1, deck: { pages: [{ slots: [] }] } };

beforeEach(() => vi.clearAllMocks());

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

describe('exportDeckPreset', () => {
  it('downloads the export blob named after the preset', async () => {
    vi.mocked(fetchService).mockResolvedValue({ preset: PRESET });
    const blob = new Blob(['zip bytes']);
    vi.mocked(fetchServiceBlob).mockResolvedValue(blob);
    vi.mocked(saveBlobToFile).mockResolvedValue(true);

    expect(await exportDeckPreset('p1')).toBe(true);
    expect(fetchServiceBlob).toHaveBeenCalledWith('/deck/presets/p1/export');
    expect(saveBlobToFile).toHaveBeenCalledWith(blob, 'Streaming.nexus-deck');
  });

  it('sanitizes filesystem-hostile characters in the preset name', async () => {
    vi.mocked(fetchService).mockResolvedValue({ preset: { ...PRESET, name: 'My/Deck: Live' } });
    vi.mocked(fetchServiceBlob).mockResolvedValue(new Blob(['x']));
    vi.mocked(saveBlobToFile).mockResolvedValue(true);

    await exportDeckPreset('p1');
    expect(saveBlobToFile).toHaveBeenCalledWith(expect.anything(), 'My-Deck- Live.nexus-deck');
  });

  it('falls back to the id as the filename when the preset lookup fails', async () => {
    vi.mocked(fetchService).mockResolvedValue(null);
    vi.mocked(fetchServiceBlob).mockResolvedValue(new Blob(['x']));
    vi.mocked(saveBlobToFile).mockResolvedValue(true);

    await exportDeckPreset('p1');
    expect(saveBlobToFile).toHaveBeenCalledWith(expect.anything(), 'p1.nexus-deck');
  });

  it('returns false when the export route fails', async () => {
    vi.mocked(fetchService).mockResolvedValue({ preset: PRESET });
    vi.mocked(fetchServiceBlob).mockResolvedValue(null);

    expect(await exportDeckPreset('p1')).toBe(false);
    expect(saveBlobToFile).not.toHaveBeenCalled();
  });
});

describe('importDeckPreset', () => {
  const file = new File(['zip bytes'], 'Streaming.nexus-deck');

  it('POSTs the raw zip body with allowPrivileged=0 by default and returns the created preset', async () => {
    vi.mocked(postServiceBytesWithStatus).mockResolvedValue({
      response: new Response(JSON.stringify({ preset: PRESET })),
      status: 200,
    });

    const result = await importDeckPreset(file, false);
    expect(result).toEqual({ kind: 'ok', preset: PRESET });
    const [path, bytes, contentType] = vi.mocked(postServiceBytesWithStatus).mock.calls[0];
    expect(path).toBe('/deck/presets/import?allowPrivileged=0');
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(contentType).toBe('application/zip');
  });

  it('sends allowPrivileged=1 when the caller retries with allowPrivileged', async () => {
    vi.mocked(postServiceBytesWithStatus).mockResolvedValue({
      response: new Response(JSON.stringify({ preset: PRESET })),
      status: 200,
    });
    await importDeckPreset(file, true);
    expect(vi.mocked(postServiceBytesWithStatus).mock.calls[0][0]).toBe('/deck/presets/import?allowPrivileged=1');
  });

  it('reports a 409 as a name conflict with the server message', async () => {
    vi.mocked(postServiceBytesWithStatus).mockResolvedValue({
      response: new Response(JSON.stringify({ error: true, msg: 'A preset named "Streaming" already exists.' })),
      status: 409,
    });
    expect(await importDeckPreset(file, false)).toEqual({
      kind: 'conflict', msg: 'A preset named "Streaming" already exists.',
    });
  });

  it('reports a 403 as a privileged-package rejection with the server message', async () => {
    vi.mocked(postServiceBytesWithStatus).mockResolvedValue({
      response: new Response(JSON.stringify({ error: true, msg: 'This package needs extra permission.' })),
      status: 403,
    });
    expect(await importDeckPreset(file, false)).toEqual({
      kind: 'privileged', msg: 'This package needs extra permission.',
    });
  });

  it('reports a 400 (invalid/oversize package) as failed, not the server message', async () => {
    vi.mocked(postServiceBytesWithStatus).mockResolvedValue({
      response: new Response(JSON.stringify({ error: true, msg: 'Package exceeds the size limit.' })),
      status: 400,
    });
    expect(await importDeckPreset(file, false)).toEqual({ kind: 'failed' });
  });

  it('reports failed on a transport failure (no response)', async () => {
    vi.mocked(postServiceBytesWithStatus).mockResolvedValue({ response: null, status: 0 });
    expect(await importDeckPreset(file, false)).toEqual({ kind: 'failed' });
  });

  it('reports failed on an unrecognized 200 body', async () => {
    vi.mocked(postServiceBytesWithStatus).mockResolvedValue({
      response: new Response(JSON.stringify({ nonsense: true })),
      status: 200,
    });
    expect(await importDeckPreset(file, false)).toEqual({ kind: 'failed' });
  });
});
