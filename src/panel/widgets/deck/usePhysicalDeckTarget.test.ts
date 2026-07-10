import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePhysicalDeckTarget } from './usePhysicalDeckTarget';
import { getStreamDeckConfig, setStreamDeckConfig, uploadStreamDeckKeyImage, type StreamDeckSummary } from '../../../api/streamdeck';
import { renderDeckBackKeyBitmap, renderDeckKeyBitmap } from './renderDeckKeyBitmap';

vi.mock('../../../api/streamdeck', () => ({
  getStreamDeckConfig: vi.fn(),
  setStreamDeckConfig: vi.fn(),
  uploadStreamDeckKeyImage: vi.fn(),
}));

vi.mock('./renderDeckKeyBitmap', () => ({
  renderDeckBackKeyBitmap: vi.fn(),
  renderDeckKeyBitmap: vi.fn(),
}));

const mockGetConfig = vi.mocked(getStreamDeckConfig);
const mockSetConfig = vi.mocked(setStreamDeckConfig);
const mockUpload = vi.mocked(uploadStreamDeckKeyImage);
const mockRenderBack = vi.mocked(renderDeckBackKeyBitmap);
const mockRenderKey = vi.mocked(renderDeckKeyBitmap);

function makeDeck(over: Partial<StreamDeckSummary> = {}): StreamDeckSummary {
  return {
    serial: 'SN1', model: 'Mini', name: 'Deck', connected: true, verified: true,
    rows: 2, cols: 3, keyCount: 6, keyPixels: 80, format: 'bmp', brightness: 60,
    ...over,
  };
}

const flush = () => act(async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
});

beforeEach(() => {
  mockGetConfig.mockResolvedValue({ slots: [] });
  mockSetConfig.mockResolvedValue(true);
  mockUpload.mockResolvedValue('hash');
  mockRenderBack.mockResolvedValue(new Uint8Array([1]));
  mockRenderKey.mockResolvedValue(new Uint8Array([2]));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('usePhysicalDeckTarget back-key upload', () => {
  it('renders and uploads the back-chevron bitmap once per deck to slotPath "back" state 0', async () => {
    renderHook(() => usePhysicalDeckTarget(makeDeck(), []));
    await flush();

    expect(mockRenderBack).toHaveBeenCalledTimes(1);
    expect(mockUpload).toHaveBeenCalledWith('SN1', 'back', 0, expect.any(Uint8Array), 'bmp');
  });

  it('does not re-upload the back bitmap when only the folder path changes', async () => {
    const deck = makeDeck();
    const { rerender } = renderHook(({ fp }) => usePhysicalDeckTarget(deck, fp), { initialProps: { fp: [] as number[] } });
    await flush();
    expect(mockRenderBack).toHaveBeenCalledTimes(1);

    rerender({ fp: [0] });
    await flush();

    expect(mockRenderBack).toHaveBeenCalledTimes(1);
  });

  it('re-uploads the back bitmap when switching to a different deck serial', async () => {
    const { rerender } = renderHook(({ d }) => usePhysicalDeckTarget(d, []), { initialProps: { d: makeDeck({ serial: 'SN1' }) } });
    await flush();
    expect(mockRenderBack).toHaveBeenCalledTimes(1);

    rerender({ d: makeDeck({ serial: 'SN2' }) });
    await flush();

    expect(mockRenderBack).toHaveBeenCalledTimes(2);
    expect(mockUpload).toHaveBeenCalledWith('SN2', 'back', 0, expect.any(Uint8Array), 'bmp');
  });

  it('passes the server-authoritative transform through to the back-bitmap render model', async () => {
    renderHook(() => usePhysicalDeckTarget(makeDeck({ transform: 'none' }), []));
    await flush();

    expect(mockRenderBack).toHaveBeenCalledWith({ keyPixels: 80, format: 'bmp', transform: 'none' });
  });

  it('falls back to the model-derived transform when the server does not send one', async () => {
    renderHook(() => usePhysicalDeckTarget(makeDeck({ model: 'Mini', transform: undefined }), []));
    await flush();

    expect(mockRenderBack).toHaveBeenCalledWith({ keyPixels: 80, format: 'bmp', transform: 'mirrorXRot90' });
  });
});
