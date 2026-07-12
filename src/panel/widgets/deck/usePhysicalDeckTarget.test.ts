import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePhysicalDeckTarget } from './usePhysicalDeckTarget';
import { getStreamDeckConfig, setStreamDeckConfig, uploadStreamDeckKeyImage, type StreamDeckSummary } from '../../../api/streamdeck';
import { renderDeckBackKeyBitmap, renderDeckKeyBitmap } from './renderDeckKeyBitmap';
import type { DeckConfig } from './types';

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

async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(res => { resolve = res; });
  return { promise, resolve };
}

async function settleInitialSync() {
  await flush();
  await advance(300);
  await flush();
}

beforeEach(() => {
  vi.useFakeTimers();
  mockGetConfig.mockResolvedValue({ pages: [{ slots: [] }] });
  mockSetConfig.mockResolvedValue(true);
  mockUpload.mockResolvedValue('hash');
  mockRenderBack.mockResolvedValue(new Uint8Array([1]));
  mockRenderKey.mockResolvedValue(new Uint8Array([2]));
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('usePhysicalDeckTarget - config load errors (RISK 1)', () => {
  it('sets error and blocks editing when the initial fetch fails, never falling back to an empty config', async () => {
    mockGetConfig.mockResolvedValue(null);
    const { result } = renderHook(() => usePhysicalDeckTarget(makeDeck(), []));
    await flush();

    expect(result.current.error).toBe(true);
    expect(result.current.target).toBeNull();
    expect(result.current.loaded).toBe(true);
    expect(mockSetConfig).not.toHaveBeenCalled();
  });

  it('retry() re-attempts a failed fetch and recovers into an editable target', async () => {
    mockGetConfig.mockResolvedValueOnce(null);
    const { result } = renderHook(() => usePhysicalDeckTarget(makeDeck(), []));
    await flush();
    expect(result.current.error).toBe(true);

    mockGetConfig.mockResolvedValueOnce({ pages: [{ slots: [{ label: 'recovered' }] }] });
    act(() => { result.current.retry(); });
    await flush();

    expect(result.current.error).toBe(false);
    expect(result.current.target).not.toBeNull();
    expect(result.current.target!.config.pages[0].slots[0].label).toBe('recovered');
  });

  it('normalizes a pre-pagination legacy { slots } response from the service into a single page', async () => {
    // A service build that predates pagination still returns the old shape;
    // the physical-deck fetch path must migrate it the same as the widget's
    // readDeckConfig does, or every pages[]-aware helper sees an undefined .pages.
    mockGetConfig.mockResolvedValue({ slots: [{ label: 'legacy' }] } as never);
    const { result } = renderHook(() => usePhysicalDeckTarget(makeDeck(), []));
    await flush();

    expect(result.current.target!.config.pages).toHaveLength(1);
    expect(result.current.target!.config.pages[0].slots[0].label).toBe('legacy');
  });

  it('normalizes a legacy { slots } response returned by the rollback re-fetch after a failed PUT', async () => {
    const { result } = renderHook(() => usePhysicalDeckTarget(makeDeck(), []));
    await settleInitialSync();

    mockSetConfig.mockResolvedValueOnce(false);
    mockGetConfig.mockResolvedValueOnce({ slots: [{ label: 'legacy-rollback' }] } as never);

    act(() => { result.current.target!.updateSlot(0, [], 0, { label: 'optimistic' }); });
    await advance(300);
    await flush();

    expect(result.current.target!.config.pages).toHaveLength(1);
    expect(result.current.target!.config.pages[0].slots[0]?.label).toBe('legacy-rollback');
  });
});

describe('usePhysicalDeckTarget - debounced sync + rollback (RISK 2, SMELL 1)', () => {
  it('debounces rapid edits into a single PUT of the latest config', async () => {
    const { result } = renderHook(() => usePhysicalDeckTarget(makeDeck(), []));
    await settleInitialSync();
    mockSetConfig.mockClear();

    act(() => { result.current.target!.updateSlot(0, [], 0, { label: 'a' }); });
    await advance(100);
    act(() => { result.current.target!.updateSlot(0, [], 0, { label: 'ab' }); });
    await advance(100);
    act(() => { result.current.target!.updateSlot(0, [], 0, { label: 'abc' }); });
    await advance(300);
    await flush();

    expect(mockSetConfig).toHaveBeenCalledTimes(1);
    const [, sentConfig] = mockSetConfig.mock.calls[0] as [string, DeckConfig];
    expect(sentConfig.pages[0].slots[0].label).toBe('abc');
  });

  it('flushes a pending edit immediately on unmount instead of dropping it', async () => {
    const { result, unmount } = renderHook(() => usePhysicalDeckTarget(makeDeck(), []));
    await settleInitialSync();
    mockSetConfig.mockClear();

    act(() => { result.current.target!.updateSlot(0, [], 0, { label: 'unsaved' }); });
    unmount();

    expect(mockSetConfig).toHaveBeenCalledTimes(1);
    const [, sentConfig] = mockSetConfig.mock.calls[0] as [string, DeckConfig];
    expect(sentConfig.pages[0].slots[0].label).toBe('unsaved');
  });

  it('flushes a pending edit for the previous deck when switching targets before the debounce fires', async () => {
    const deckA = makeDeck({ serial: 'SN1' });
    const { result, rerender } = renderHook(({ d }) => usePhysicalDeckTarget(d, []), { initialProps: { d: deckA } });
    await settleInitialSync();
    mockSetConfig.mockClear();

    act(() => { result.current.target!.updateSlot(0, [], 0, { label: 'switch-me' }); });
    rerender({ d: makeDeck({ serial: 'SN2' }) });
    await flush();

    expect(mockSetConfig).toHaveBeenCalledTimes(1);
    const [sentSerial, sentConfig] = mockSetConfig.mock.calls[0] as [string, DeckConfig];
    expect(sentSerial).toBe('SN1');
    expect(sentConfig.pages[0].slots[0].label).toBe('switch-me');
  });

  it('rolls back local config to server truth when the PUT fails', async () => {
    const { result } = renderHook(() => usePhysicalDeckTarget(makeDeck(), []));
    await settleInitialSync();

    mockSetConfig.mockResolvedValueOnce(false);
    mockGetConfig.mockResolvedValueOnce({ pages: [{ slots: [{ label: 'server-value' }] }] });

    act(() => { result.current.target!.updateSlot(0, [], 0, { label: 'optimistic-edit' }); });
    expect(result.current.target!.config.pages[0].slots[0].label).toBe('optimistic-edit');

    await advance(300);
    await flush();

    expect(result.current.target!.config.pages[0].slots[0]?.label).toBe('server-value');
  });

  it('does not let a stale rollback for a previous deck corrupt the newly active deck', async () => {
    const deckA = makeDeck({ serial: 'SN1' });
    const { result, rerender } = renderHook(({ d }) => usePhysicalDeckTarget(d, []), { initialProps: { d: deckA } });
    await settleInitialSync();

    mockSetConfig.mockResolvedValueOnce(false);
    const rollbackGet = deferred<DeckConfig | null>();
    mockGetConfig.mockReturnValueOnce(rollbackGet.promise);

    act(() => { result.current.target!.updateSlot(0, [], 0, { label: 'edit-on-a' }); });
    await advance(300);
    await flush();
    // A's rollback GET is now in flight but not yet resolved.

    mockGetConfig.mockResolvedValue({ pages: [{ slots: [{ label: 'b-config' }] }] });
    rerender({ d: makeDeck({ serial: 'SN2' }) });
    await settleInitialSync();
    expect(result.current.target!.config.pages[0].slots[0].label).toBe('b-config');

    await act(async () => { rollbackGet.resolve({ pages: [{ slots: [{ label: 'server-value-a' }] }] }); });
    await flush();

    expect(result.current.target!.config.pages[0].slots[0].label).toBe('b-config');
  });

  it('does not let a stale rollback clobber a newer edit made during its own debounce window', async () => {
    const { result } = renderHook(() => usePhysicalDeckTarget(makeDeck(), []));
    await settleInitialSync();

    mockSetConfig.mockResolvedValueOnce(false);
    const rollbackGet = deferred<DeckConfig | null>();
    mockGetConfig.mockReturnValueOnce(rollbackGet.promise);

    act(() => { result.current.target!.updateSlot(0, [], 0, { label: 'first-edit' }); });
    await advance(300);
    await flush();
    // The first edit's PUT has failed and its rollback GET is in flight.

    mockSetConfig.mockResolvedValueOnce(true);
    act(() => { result.current.target!.updateSlot(0, [], 0, { label: 'second-edit' }); });

    await act(async () => { rollbackGet.resolve({ pages: [{ slots: [{ label: 'server-value' }] }] }); });
    await flush();

    // The still-pending rollback must not clobber the newer, unrelated edit.
    expect(result.current.target!.config.pages[0].slots[0].label).toBe('second-edit');

    await advance(300);
    await flush();

    const putCalls = mockSetConfig.mock.calls as [string, DeckConfig][];
    expect(putCalls[putCalls.length - 1][1].pages[0].slots[0].label).toBe('second-edit');
  });

  it('gives up after repeated PUT failures and surfaces the load-failed state instead of looping forever', async () => {
    const { result } = renderHook(() => usePhysicalDeckTarget(makeDeck(), []));
    await settleInitialSync();

    mockSetConfig.mockResolvedValue(false);
    // A fresh object per call: setConfig with the exact same reference the
    // rollback already applied would be a React state bail-out, which would
    // stall the retry loop the test means to exercise.
    mockGetConfig.mockImplementation(async () => ({ pages: [{ slots: [] }] }));

    act(() => { result.current.target!.updateSlot(0, [], 0, { label: 'edit' }); });

    for (let i = 0; i < 6 && !result.current.error; i++) {
      await advance(300);
      await flush();
    }

    expect(result.current.error).toBe(true);
    expect(result.current.target).toBeNull();

    const putCallsAtFailure = mockSetConfig.mock.calls.length;
    await advance(1000);
    await flush();

    expect(mockSetConfig.mock.calls.length).toBe(putCallsAtFailure);
  });
});

describe('usePhysicalDeckTarget - back-key upload', () => {
  it('renders and uploads the back-key bitmap once per deck to slotPath "back" state 0', async () => {
    renderHook(() => usePhysicalDeckTarget(makeDeck(), []));
    await settleInitialSync();

    expect(mockRenderBack).toHaveBeenCalledTimes(1);
    expect(mockUpload).toHaveBeenCalledWith('SN1', 'back', 0, expect.any(Uint8Array), 'bmp');
  });

  it('does not re-upload the back bitmap when only the folder path changes', async () => {
    const deck = makeDeck();
    const { rerender } = renderHook(({ fp }) => usePhysicalDeckTarget(deck, fp), { initialProps: { fp: [] as number[] } });
    await settleInitialSync();
    expect(mockRenderBack).toHaveBeenCalledTimes(1);

    rerender({ fp: [0] });
    await advance(300);
    await flush();

    expect(mockRenderBack).toHaveBeenCalledTimes(1);
  });

  it('re-uploads the back bitmap when switching to a different deck serial', async () => {
    const { rerender } = renderHook(({ d }) => usePhysicalDeckTarget(d, []), { initialProps: { d: makeDeck({ serial: 'SN1' }) } });
    await settleInitialSync();
    expect(mockRenderBack).toHaveBeenCalledTimes(1);

    rerender({ d: makeDeck({ serial: 'SN2' }) });
    await settleInitialSync();

    expect(mockRenderBack).toHaveBeenCalledTimes(2);
    expect(mockUpload).toHaveBeenCalledWith('SN2', 'back', 0, expect.any(Uint8Array), 'bmp');
  });

  it('passes the server-authoritative transform through to the back-bitmap render model', async () => {
    renderHook(() => usePhysicalDeckTarget(makeDeck({ transform: 'none' }), []));
    await settleInitialSync();

    expect(mockRenderBack).toHaveBeenCalledWith({ keyPixels: 80, format: 'bmp', transform: 'none', orientation: 0 });
  });

  it('falls back to the model-derived transform when the server does not send one', async () => {
    renderHook(() => usePhysicalDeckTarget(makeDeck({ model: 'Mini', transform: undefined }), []));
    await settleInitialSync();

    expect(mockRenderBack).toHaveBeenCalledWith({ keyPixels: 80, format: 'bmp', transform: 'mirrorXRot90', orientation: 0 });
  });

  it('passes through a user-set mounting orientation to the back-bitmap render model', async () => {
    renderHook(() => usePhysicalDeckTarget(makeDeck({ orientation: 180 }), []));
    await settleInitialSync();

    expect(mockRenderBack).toHaveBeenCalledWith(expect.objectContaining({ orientation: 180 }));
  });

  it('normalizes an out-of-range or absent orientation to 0', async () => {
    renderHook(() => usePhysicalDeckTarget(makeDeck({ orientation: 45 }), []));
    await settleInitialSync();

    expect(mockRenderBack).toHaveBeenCalledWith(expect.objectContaining({ orientation: 0 }));
  });
});

describe('usePhysicalDeckTarget - page navigation', () => {
  it('resolves the view for the given page and re-renders key images when the page changes', async () => {
    mockGetConfig.mockResolvedValue({ pages: [{ slots: [{ label: 'p0' }] }, { slots: [{ label: 'p1' }] }] });
    const deck = makeDeck();
    const { rerender } = renderHook(({ p }) => usePhysicalDeckTarget(deck, [], p), { initialProps: { p: 0 } });
    await settleInitialSync();
    const keyCallsOnPage0 = mockRenderKey.mock.calls.length;
    expect(keyCallsOnPage0).toBeGreaterThan(0);

    rerender({ p: 1 });
    await advance(300);
    await flush();

    expect(mockRenderKey.mock.calls.length).toBeGreaterThan(keyCallsOnPage0);
  });

  it('defaults to page 0 when no page argument is given', async () => {
    mockGetConfig.mockResolvedValue({ pages: [{ slots: [{ label: 'p0' }] }, { slots: [{ label: 'p1' }] }] });
    const { result } = renderHook(() => usePhysicalDeckTarget(makeDeck(), []));
    await settleInitialSync();

    expect(result.current.target!.config.pages[0].slots[0].label).toBe('p0');
  });
});
