import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeckWidgetPresets } from './useDeckWidgetPresets';
import { DECK_WIDGET_PRESET_CAP } from './deckLayout';
import type { PanelConfigValue, PanelWidget } from '../../types';
import type { DeckConfig } from './types';

let uuidCounter = 0;
vi.mock('../../../lib/uuid', () => ({
  createUuid: () => `uuid-${++uuidCounter}`,
}));

function widgetWith(config: Record<string, PanelConfigValue>): PanelWidget {
  return { id: 'w1', type: 'deck', size: '2x2', col: 0, row: 0, config };
}

const DECK_A: DeckConfig = { pages: [{ slots: [{ label: 'a' }] }] };
const DECK_B: DeckConfig = { pages: [{ slots: [{ label: 'b' }] }] };

function renderPresets(config: Record<string, PanelConfigValue>) {
  const onUpdate = vi.fn();
  const utils = renderHook(
    ({ widget }) => useDeckWidgetPresets(widget, onUpdate),
    { initialProps: { widget: widgetWith(config) } },
  );
  return { ...utils, onUpdate };
}

beforeEach(() => { uuidCounter = 0; });

describe('useDeckWidgetPresets - CRUD', () => {
  it('reads zero presets for a widget with no preset keys', () => {
    const { result } = renderPresets({ deck: DECK_A as never });
    expect(result.current.presets).toEqual([]);
    expect(result.current.activeId).toBeNull();
    expect(result.current.presetCount).toBe(0);
  });

  it('handleCreate snapshots the current deck config and becomes active', async () => {
    const { result, onUpdate } = renderPresets({ deck: DECK_A as never });

    let outcome: { error: boolean } | undefined;
    await act(async () => { outcome = await result.current.handleCreate('Streaming'); });

    expect(outcome).toEqual({ error: false });
    expect(onUpdate).toHaveBeenCalledWith({
      deckPresets: [{ id: 'uuid-1', name: 'Streaming', deck: DECK_A }],
      deckActivePresetId: 'uuid-1',
    });
  });

  it('handleCreate refuses at the cap and does not write', async () => {
    const presets = Array.from({ length: DECK_WIDGET_PRESET_CAP }, (_, i) => ({ id: `p${i}`, name: `P${i}`, deck: DECK_A }));
    const { result, onUpdate } = renderPresets({ deck: DECK_A as never, deckPresets: presets as never });

    let outcome: { error: boolean } | undefined;
    await act(async () => { outcome = await result.current.handleCreate('Overflow'); });

    expect(outcome).toEqual({ error: true });
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('handleRename updates the name and preserves the active pointer', () => {
    const presets = [{ id: 'p1', name: 'Old', deck: DECK_A }];
    const { result, onUpdate } = renderPresets({ deck: DECK_A as never, deckPresets: presets as never, deckActivePresetId: 'p1' });

    act(() => result.current.handleRename('p1', 'New'));

    expect(onUpdate).toHaveBeenCalledWith({
      deckPresets: [{ id: 'p1', name: 'New', deck: DECK_A }],
      deckActivePresetId: 'p1',
    });
  });

  it('handleDelete removes the preset and clears the pointer when it was active', () => {
    const presets = [{ id: 'p1', name: 'A', deck: DECK_A }, { id: 'p2', name: 'B', deck: DECK_B }];
    const { result, onUpdate } = renderPresets({ deck: DECK_A as never, deckPresets: presets as never, deckActivePresetId: 'p1' });

    act(() => result.current.handleDelete('p1'));

    expect(onUpdate).toHaveBeenCalledWith({
      deckPresets: [{ id: 'p2', name: 'B', deck: DECK_B }],
      deckActivePresetId: null,
    });
  });

  it('handleDelete of a non-active preset leaves the pointer alone', () => {
    const presets = [{ id: 'p1', name: 'A', deck: DECK_A }, { id: 'p2', name: 'B', deck: DECK_B }];
    const { result, onUpdate } = renderPresets({ deck: DECK_A as never, deckPresets: presets as never, deckActivePresetId: 'p1' });

    act(() => result.current.handleDelete('p2'));

    expect(onUpdate).toHaveBeenCalledWith({
      deckPresets: [{ id: 'p1', name: 'A', deck: DECK_A }],
      deckActivePresetId: 'p1',
    });
  });

  it('handleLoad applies the preset config and marks it active', () => {
    const presets = [{ id: 'p1', name: 'A', deck: DECK_A }, { id: 'p2', name: 'B', deck: DECK_B }];
    const { result, onUpdate } = renderPresets({ deck: DECK_A as never, deckPresets: presets as never, deckActivePresetId: 'p1' });

    act(() => result.current.handleLoad('p2'));

    expect(onUpdate).toHaveBeenCalledWith({
      deck: DECK_B,
      deckPresets: presets,
      deckActivePresetId: 'p2',
    });
  });

  it('handleLoad is a no-op for an id that no longer exists', () => {
    const presets = [{ id: 'p1', name: 'A', deck: DECK_A }];
    const { result, onUpdate } = renderPresets({ deck: DECK_A as never, deckPresets: presets as never, deckActivePresetId: 'p1' });

    act(() => result.current.handleLoad('missing'));

    expect(onUpdate).not.toHaveBeenCalled();
  });
});

describe('useDeckWidgetPresets - auto-save', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it('does not schedule a save on mount, only on a subsequent deck edit', async () => {
    const presets = [{ id: 'p1', name: 'A', deck: DECK_A }];
    const { onUpdate } = renderPresets({ deck: DECK_A as never, deckPresets: presets as never, deckActivePresetId: 'p1' });

    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });

    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('auto-saves the active preset to the new deck config a debounce window after an edit', async () => {
    const presets = [{ id: 'p1', name: 'A', deck: DECK_A }];
    const { rerender, onUpdate } = renderPresets({ deck: DECK_A as never, deckPresets: presets as never, deckActivePresetId: 'p1' });

    rerender({ widget: widgetWith({ deck: DECK_B as never, deckPresets: presets as never, deckActivePresetId: 'p1' }) });
    expect(onUpdate).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith({
      deckPresets: [{ id: 'p1', name: 'A', deck: DECK_B }],
      deckActivePresetId: 'p1',
    });
  });

  it('collapses a burst of edits within the debounce window into a single save', async () => {
    const presets = [{ id: 'p1', name: 'A', deck: DECK_A }];
    const { rerender, onUpdate } = renderPresets({ deck: DECK_A as never, deckPresets: presets as never, deckActivePresetId: 'p1' });

    rerender({ widget: widgetWith({ deck: { pages: [{ slots: [{ label: '1' }] }] } as never, deckPresets: presets as never, deckActivePresetId: 'p1' }) });
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    rerender({ widget: widgetWith({ deck: DECK_B as never, deckPresets: presets as never, deckActivePresetId: 'p1' }) });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith({
      deckPresets: [{ id: 'p1', name: 'A', deck: DECK_B }],
      deckActivePresetId: 'p1',
    });
  });

  it('does not schedule a save when no preset is active', async () => {
    const { rerender, onUpdate } = renderPresets({ deck: DECK_A as never });

    rerender({ widget: widgetWith({ deck: DECK_B as never }) });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });

    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('flushes a still-pending save immediately on unmount instead of dropping it', async () => {
    const presets = [{ id: 'p1', name: 'A', deck: DECK_A }];
    const { rerender, unmount, onUpdate } = renderPresets({ deck: DECK_A as never, deckPresets: presets as never, deckActivePresetId: 'p1' });

    rerender({ widget: widgetWith({ deck: DECK_B as never, deckPresets: presets as never, deckActivePresetId: 'p1' }) });
    unmount();

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith({
      deckPresets: [{ id: 'p1', name: 'A', deck: DECK_B }],
      deckActivePresetId: 'p1',
    });
  });
});
