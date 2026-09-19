import { act, render, renderHook, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeckInstance, DeckInstanceProvider } from './useDeckInstance';
import { AUTO_SAVE_DEBOUNCE_MS } from './deckLayout';
import type { DeckConfig } from './types';
import type { DeckInstance, DeckPresetFull } from '../../../api/deck';

const getDeckInstanceMock = vi.fn<(id: string) => Promise<DeckInstance | null>>();
const updateDeckInstanceMock = vi.fn<(id: string, patch: unknown) => Promise<DeckInstance | null>>();
const getDeckPresetsMock = vi.fn();
const getDeckPresetMock = vi.fn<(id: string) => Promise<DeckPresetFull | null>>();
const createDeckPresetMock = vi.fn();
const updateDeckPresetMock = vi.fn<(id: string, patch: unknown) => Promise<DeckPresetFull | null>>();
const deleteDeckPresetMock = vi.fn();

vi.mock('../../../api/deck', () => ({
  getDeckInstance: (id: string) => getDeckInstanceMock(id),
  updateDeckInstance: (id: string, patch: unknown) => updateDeckInstanceMock(id, patch),
  getDeckPresets: () => getDeckPresetsMock(),
  getDeckPreset: (id: string) => getDeckPresetMock(id),
  createDeckPreset: (body: unknown) => createDeckPresetMock(body),
  updateDeckPreset: (id: string, patch: unknown) => updateDeckPresetMock(id, patch),
  deleteDeckPreset: (id: string) => deleteDeckPresetMock(id),
}));

const capturedTopics: Record<string, ((data: unknown) => void) | null> = {};
let mockConnected = true;
vi.mock('../../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: (topic: string, enabled: boolean, cb: (data: unknown) => void) => {
    capturedTopics[topic] = enabled ? cb : null;
  },
  useMultiplex: () => ({ connected: mockConnected }),
}));

const INSTANCE: DeckInstance = { mode: 'fixed', activePresetId: 'p1' };
const PRESET: DeckPresetFull = { id: 'p1', name: 'Streaming', cols: 3, rows: 2, pageCount: 1, deck: { pages: [{ slots: [] }] } };

// PRESET is authored 3x2 (keyCount 6); updateSlotAt pads to that before
// writing index 0, so the expected shape must carry all 6 cells too.
function label(text: string): DeckConfig {
  const slots = [{ label: text }, {}, {}, {}, {}, {}];
  return { pages: [{ slots }] };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockConnected = true;
  capturedTopics.deck = null;
  getDeckInstanceMock.mockResolvedValue(INSTANCE);
  getDeckPresetsMock.mockResolvedValue([{ id: 'p1', name: 'Streaming', cols: 3, rows: 2, pageCount: 1 }]);
  getDeckPresetMock.mockResolvedValue(PRESET);
  updateDeckPresetMock.mockResolvedValue(PRESET);
  updateDeckInstanceMock.mockResolvedValue(INSTANCE);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useDeckInstance - initial load', () => {
  it('fetches the instance, the preset list, and the active preset\'s full config', async () => {
    const { result } = renderHook(() => useDeckInstance('streamdeck:SN1', 'physical', { cols: 3, rows: 2 }));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(getDeckInstanceMock).toHaveBeenCalledWith('streamdeck:SN1');
    expect(getDeckPresetsMock).toHaveBeenCalled();
    expect(getDeckPresetMock).toHaveBeenCalledWith('p1');
    expect(result.current.instance).toEqual(INSTANCE);
    expect(result.current.preset).toEqual(PRESET);
    expect(result.current.presets).toEqual([{ id: 'p1', name: 'Streaming', cols: 3, rows: 2, pageCount: 1 }]);
    expect(result.current.target?.config).toEqual(PRESET.deck);
    expect(result.current.error).toBe(false);
  });

  it('does nothing when instanceId is null', async () => {
    const { result } = renderHook(() => useDeckInstance(null, 'widget', { cols: 2, rows: 2 }));
    await Promise.resolve();
    expect(getDeckInstanceMock).not.toHaveBeenCalled();
    expect(result.current.loaded).toBe(false);
    expect(result.current.target).toBeNull();
  });

  it('sets error and blocks editing when the instance fetch fails', async () => {
    getDeckInstanceMock.mockResolvedValue(null);
    const { result } = renderHook(() => useDeckInstance('streamdeck:SN1', 'physical', { cols: 3, rows: 2 }));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.target).toBeNull();
  });

  it('sets error when the instance resolves but its active preset does not', async () => {
    getDeckPresetMock.mockResolvedValue(null);
    const { result } = renderHook(() => useDeckInstance('streamdeck:SN1', 'physical', { cols: 3, rows: 2 }));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.target).toBeNull();
  });

  it('retry() re-runs the fetch after a failure', async () => {
    getDeckInstanceMock.mockResolvedValueOnce(null);
    const { result } = renderHook(() => useDeckInstance('streamdeck:SN1', 'physical', { cols: 3, rows: 2 }));
    await waitFor(() => expect(result.current.error).toBe(true));

    getDeckInstanceMock.mockResolvedValue(INSTANCE);
    act(() => result.current.retry());
    // error flips false synchronously on retry (before the refetch resolves)
    // - wait on the actual refetch outcome instead of that transient flag.
    await waitFor(() => expect(result.current.preset).toEqual(PRESET));
    expect(result.current.error).toBe(false);
  });

  it('refetches on reconnect (a dropped socket may have missed deck frames)', async () => {
    const { result, rerender } = renderHook(() => useDeckInstance('streamdeck:SN1', 'physical', { cols: 3, rows: 2 }));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    getDeckInstanceMock.mockClear();

    mockConnected = false;
    rerender();
    expect(getDeckInstanceMock).not.toHaveBeenCalled();
    mockConnected = true;
    rerender();

    await waitFor(() => expect(getDeckInstanceMock).toHaveBeenCalledTimes(1));
  });
});

describe('useDeckInstance - debounced auto-save', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));

  it('debounces rapid edits into a single PUT of the latest config', async () => {
    const { result } = renderHook(() => useDeckInstance('streamdeck:SN1', 'physical', { cols: 3, rows: 2 }));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => result.current.target!.updateSlot(0, [], 0, { label: 'first' }));
    act(() => result.current.target!.updateSlot(0, [], 0, { label: 'second' }));
    expect(updateDeckPresetMock).not.toHaveBeenCalled();

    await act(async () => { vi.advanceTimersByTime(AUTO_SAVE_DEBOUNCE_MS); });
    expect(updateDeckPresetMock).toHaveBeenCalledTimes(1);
    expect(updateDeckPresetMock).toHaveBeenCalledWith('p1', { deck: label('second') });
  });

  it('flushes a pending save immediately when a newer edit is not yet scheduled and the component unmounts', async () => {
    const { result, unmount } = renderHook(() => useDeckInstance('streamdeck:SN1', 'physical', { cols: 3, rows: 2 }));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => result.current.target!.updateSlot(0, [], 0, { label: 'x' }));
    unmount();

    expect(updateDeckPresetMock).toHaveBeenCalledTimes(1);
  });
});

describe('useDeckInstance - undo/redo/reset (burst coalescing)', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));

  it('collapses a rapid run of edits into one undo entry anchored on the pre-burst config', async () => {
    const { result } = renderHook(() => useDeckInstance('streamdeck:SN1', 'physical', { cols: 3, rows: 2 }));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => result.current.target!.updateSlot(0, [], 0, { label: 'a' }));
    act(() => vi.advanceTimersByTime(200));
    act(() => result.current.target!.updateSlot(0, [], 0, { label: 'ab' }));
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.undo());
    expect(result.current.preset?.deck).toEqual(PRESET.deck);
    expect(result.current.canUndo).toBe(false);
  });

  it('starts a new undo entry once the coalescing window has elapsed', async () => {
    const { result } = renderHook(() => useDeckInstance('streamdeck:SN1', 'physical', { cols: 3, rows: 2 }));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => result.current.target!.updateSlot(0, [], 0, { label: 'a' }));
    act(() => vi.advanceTimersByTime(AUTO_SAVE_DEBOUNCE_MS));
    act(() => result.current.target!.updateSlot(0, [], 0, { label: 'b' }));

    act(() => result.current.undo());
    expect(result.current.preset?.deck).toEqual(label('a'));
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.undo());
    expect(result.current.preset?.deck).toEqual(PRESET.deck);
    expect(result.current.canUndo).toBe(false);
  });

  it('redo re-applies the undone config', async () => {
    const { result } = renderHook(() => useDeckInstance('streamdeck:SN1', 'physical', { cols: 3, rows: 2 }));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => result.current.target!.updateSlot(0, [], 0, { label: 'a' }));
    act(() => result.current.undo());
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.redo());
    expect(result.current.preset?.deck).toEqual(label('a'));
    expect(result.current.canRedo).toBe(false);
  });

  it('reset clears to a single empty page and is itself undoable', async () => {
    const { result } = renderHook(() => useDeckInstance('streamdeck:SN1', 'physical', { cols: 3, rows: 2 }));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => result.current.reset());
    expect(result.current.preset?.deck).toEqual({ pages: [{ slots: [] }] });
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.undo());
    expect(result.current.preset?.deck).toEqual(PRESET.deck);
  });

  it('endEditBurst closes an open burst so the next edit starts its own entry', async () => {
    const { result } = renderHook(() => useDeckInstance('streamdeck:SN1', 'physical', { cols: 3, rows: 2 }));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => result.current.target!.updateSlot(0, [], 0, { label: 'a' }));
    act(() => result.current.endEditBurst());
    // Still inside what would have been the burst's window - the burst must
    // already be closed, or this edit gets folded into the same entry.
    act(() => result.current.target!.updateSlot(0, [], 0, { label: 'b' }));

    act(() => result.current.undo());
    expect(result.current.preset?.deck).toEqual(label('a'));
    expect(result.current.canUndo).toBe(true);
  });
});

describe('useDeckInstance - deck topic frames', () => {
  it('applies an inbound preset frame for the active preset when no local edit is pending', async () => {
    const { result } = renderHook(() => useDeckInstance('streamdeck:SN1', 'physical', { cols: 3, rows: 2 }));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    const pushedDeck = label('from-elsewhere');
    act(() => {
      capturedTopics.deck?.({
        kind: 'preset', presetId: 'p1',
        summary: { id: 'p1', name: 'Streaming', cols: 3, rows: 2, pageCount: 1 },
        deck: pushedDeck,
      });
    });

    expect(result.current.preset?.deck).toEqual(pushedDeck);
  });

  it('ignores an inbound preset frame while a local edit is still pending (echo guard)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useDeckInstance('streamdeck:SN1', 'physical', { cols: 3, rows: 2 }));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => result.current.target!.updateSlot(0, [], 0, { label: 'unsaved' }));
    act(() => {
      capturedTopics.deck?.({
        kind: 'preset', presetId: 'p1',
        summary: { id: 'p1', name: 'Streaming', cols: 3, rows: 2, pageCount: 1 },
        deck: label('stale-echo'),
      });
    });

    expect(result.current.preset?.deck).toEqual(label('unsaved'));
    vi.useRealTimers();
  });

  it('refetches the preset list on a presets frame', async () => {
    const { result } = renderHook(() => useDeckInstance('streamdeck:SN1', 'physical', { cols: 3, rows: 2 }));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    getDeckPresetsMock.mockResolvedValue([
      { id: 'p1', name: 'Streaming', cols: 3, rows: 2, pageCount: 1 },
      { id: 'p2', name: 'New one', cols: 3, rows: 2, pageCount: 1 },
    ]);
    await act(async () => { capturedTopics.deck?.({ kind: 'presets' }); await Promise.resolve(); });

    expect(result.current.presets).toHaveLength(2);
  });

  it('refetches the new preset and resets undo history when an active frame changes the activePresetId', async () => {
    const { result } = renderHook(() => useDeckInstance('streamdeck:SN1', 'physical', { cols: 3, rows: 2 }));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    const PRESET_2: DeckPresetFull = { id: 'p2', name: 'Gaming', cols: 3, rows: 2, pageCount: 1, deck: { pages: [{ slots: [{ label: 'g' }] }] } };
    getDeckPresetMock.mockResolvedValue(PRESET_2);
    await act(async () => {
      capturedTopics.deck?.({ kind: 'active', instanceId: 'streamdeck:SN1', instance: { mode: 'fixed', activePresetId: 'p2' } });
      await Promise.resolve();
    });

    expect(result.current.instance).toEqual({ mode: 'fixed', activePresetId: 'p2' });
    expect(result.current.preset).toEqual(PRESET_2);
    expect(result.current.canUndo).toBe(false);
  });
});

describe('useDeckInstance - mode and preset management', () => {
  it('setMode optimistically updates and PUTs the instance', async () => {
    const { result } = renderHook(() => useDeckInstance('streamdeck:SN1', 'physical', { cols: 3, rows: 2 }));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => result.current.setMode('appAware'));
    expect(result.current.instance?.mode).toBe('appAware');
    expect(updateDeckInstanceMock).toHaveBeenCalledWith('streamdeck:SN1', { mode: 'appAware' });
  });

  it('activate switches the active preset and clears undo history', async () => {
    const { result } = renderHook(() => useDeckInstance('streamdeck:SN1', 'physical', { cols: 3, rows: 2 }));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => result.current.target!.updateSlot(0, [], 0, { label: 'a' }));
    expect(result.current.canUndo).toBe(true);

    const PRESET_2: DeckPresetFull = { id: 'p2', name: 'Gaming', cols: 3, rows: 2, pageCount: 1, deck: { pages: [{ slots: [] }] } };
    updateDeckInstanceMock.mockResolvedValue({ mode: 'fixed', activePresetId: 'p2' });
    getDeckPresetMock.mockResolvedValue(PRESET_2);

    await act(async () => { await result.current.activate('p2'); });

    expect(updateDeckInstanceMock).toHaveBeenCalledWith('streamdeck:SN1', { activePresetId: 'p2' });
    expect(result.current.preset).toEqual(PRESET_2);
    expect(result.current.canUndo).toBe(false);
  });

  it('createPreset seeds it at the instance grid, adds it to the list, and activates it', async () => {
    const { result } = renderHook(() => useDeckInstance('streamdeck:SN1', 'physical', { cols: 5, rows: 3 }));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    const CREATED: DeckPresetFull = { id: 'p3', name: 'New preset', cols: 5, rows: 3, pageCount: 1, deck: { pages: [{ slots: [] }] } };
    createDeckPresetMock.mockResolvedValue(CREATED);
    updateDeckInstanceMock.mockResolvedValue({ mode: 'fixed', activePresetId: 'p3' });
    getDeckPresetMock.mockResolvedValue(CREATED);

    let outcome: { error: boolean } | undefined;
    await act(async () => { outcome = await result.current.createPreset('New preset'); });

    expect(createDeckPresetMock).toHaveBeenCalledWith({ name: 'New preset', cols: 5, rows: 3 });
    expect(outcome).toEqual({ error: false });
    expect(result.current.presets.some(p => p.id === 'p3')).toBe(true);
    expect(result.current.preset?.id).toBe('p3');
  });

  it('createPreset reports an error and does not activate when the write is refused', async () => {
    const { result } = renderHook(() => useDeckInstance('streamdeck:SN1', 'physical', { cols: 3, rows: 2 }));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    createDeckPresetMock.mockResolvedValue(null);
    let outcome: { error: boolean } | undefined;
    await act(async () => { outcome = await result.current.createPreset('Blocked'); });

    expect(outcome).toEqual({ error: true });
    expect(updateDeckInstanceMock).not.toHaveBeenCalled();
  });

  it('renamePreset updates the list and the live preset name', async () => {
    const { result } = renderHook(() => useDeckInstance('streamdeck:SN1', 'physical', { cols: 3, rows: 2 }));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    updateDeckPresetMock.mockResolvedValue({ ...PRESET, name: 'Renamed' });
    await act(async () => { await result.current.renamePreset('p1', 'Renamed'); });

    expect(updateDeckPresetMock).toHaveBeenCalledWith('p1', { name: 'Renamed' });
    expect(result.current.preset?.name).toBe('Renamed');
    expect(result.current.presets[0].name).toBe('Renamed');
  });

  it('deletePreset removes it from the list and, when active, reloads the instance', async () => {
    const { result } = renderHook(() => useDeckInstance('streamdeck:SN1', 'physical', { cols: 3, rows: 2 }));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    deleteDeckPresetMock.mockResolvedValue(true);
    const PROMOTED: DeckInstance = { mode: 'fixed', activePresetId: 'p4' };
    const PROMOTED_PRESET: DeckPresetFull = { id: 'p4', name: 'Promoted', cols: 3, rows: 2, pageCount: 1, deck: { pages: [{ slots: [] }] } };
    getDeckInstanceMock.mockResolvedValue(PROMOTED);
    getDeckPresetsMock.mockResolvedValue([{ id: 'p4', name: 'Promoted', cols: 3, rows: 2, pageCount: 1 }]);
    getDeckPresetMock.mockResolvedValue(PROMOTED_PRESET);

    await act(async () => { await result.current.deletePreset('p1'); });

    expect(deleteDeckPresetMock).toHaveBeenCalledWith('p1');
    expect(result.current.preset).toEqual(PROMOTED_PRESET);
  });

  it('deletePreset does not reload when a non-active preset is deleted', async () => {
    const { result } = renderHook(() => useDeckInstance('streamdeck:SN1', 'physical', { cols: 3, rows: 2 }));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    deleteDeckPresetMock.mockResolvedValue(true);
    getDeckInstanceMock.mockClear();
    await act(async () => { await result.current.deletePreset('other'); });

    expect(getDeckInstanceMock).not.toHaveBeenCalled();
    expect(result.current.preset?.id).toBe('p1');
  });
});

describe('useDeckInstance - DeckInstanceProvider sharing', () => {
  // A widget's draggable preview tile and its settings inspector each call
  // useDeckInstance independently; without a shared provider each holds its
  // own preset copy and its own debounced auto-save, so an edit from one can
  // be silently overwritten by the other's stale snapshot. Two consumers
  // under one DeckInstanceProvider must instead read/write the same state.
  function ConsumerA() {
    const a = useDeckInstance('widget:w1', 'widget', { cols: 3, rows: 2 });
    return <button type="button" onClick={() => a.target?.updateSlot(0, [], 0, { label: 'from-a' })}>edit-a</button>;
  }
  function ConsumerB() {
    const b = useDeckInstance('widget:w1', 'widget', { cols: 3, rows: 2 });
    return <div data-testid="b-label">{b.preset?.deck.pages[0]?.slots[0]?.label ?? ''}</div>;
  }
  function TwoConsumerHarness() {
    const top = useDeckInstance('widget:w1', 'widget', { cols: 3, rows: 2 }, true);
    return (
      <DeckInstanceProvider value={top.preset ? { instanceId: 'widget:w1', value: top } : null}>
        <ConsumerA />
        <ConsumerB />
      </DeckInstanceProvider>
    );
  }

  it('an edit from one consumer under a shared provider is immediately visible to another (no independent, racing auto-save)', async () => {
    render(<TwoConsumerHarness />);
    await waitFor(() => expect(getDeckPresetMock).toHaveBeenCalled());

    fireEvent.click(screen.getByText('edit-a'));
    expect(screen.getByTestId('b-label').textContent).toBe('from-a');
  });
});
