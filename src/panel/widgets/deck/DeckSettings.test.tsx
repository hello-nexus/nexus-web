import { useRef, useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { makePresetDeckTarget } from './deckTarget';
import type { PanelSurface, PanelWidget } from '../types';
import type { DeckConfig } from './types';

vi.mock('../common/AppPicker', () => ({ useAppIcon: () => null, AppPicker: () => null }));

// Seeded by renderSettings() before each render; the mocked hook below reads
// it only as a useState initializer (each render() call mounts a fresh
// component tree, so a stale value from a previous test is never observed).
let currentInitialDeck: DeckConfig = { pages: [{ slots: [] }] };
let latestSave = vi.fn();

// DeckSettings edits through useDeckInstance's target now, not onUpdate/
// config.deck - this fake hook behaves like the real one (real React state +
// the real makePresetDeckTarget) but skips the network entirely, mirroring
// DeckKeyInspector.test.tsx's harness pattern. The save spy is memoized per
// mount (useRef) so it keeps accumulating calls across the re-renders one
// edit causes, instead of being replaced by a fresh, uncalled spy each time.
vi.mock('./useDeckInstance', () => ({
  useDeckInstance: () => {
    const [deck, setDeck] = useState<DeckConfig>(currentInitialDeck);
    const setDeckRef = useRef(setDeck);
    setDeckRef.current = setDeck;
    const saveRef = useRef<ReturnType<typeof vi.fn> | null>(null);
    if (!saveRef.current) {
      saveRef.current = vi.fn((next: DeckConfig) => setDeckRef.current(next));
      latestSave = saveRef.current;
    }
    const preset = { id: 'p1', name: 'Preset', cols: 2, rows: 2, pageCount: deck.pages.length, deck };
    const target = makePresetDeckTarget(preset, { cols: 2, rows: 2 }, 'widget', saveRef.current);
    return {
      instance: { mode: 'fixed', activePresetId: 'p1' },
      preset,
      presets: [{ id: 'p1', name: 'Preset', cols: 2, rows: 2, pageCount: deck.pages.length }],
      target,
      loaded: true,
      error: false,
      retry: vi.fn(),
      setMode: vi.fn(),
      activate: vi.fn(),
      createPreset: vi.fn(),
      renamePreset: vi.fn(),
      deletePreset: vi.fn(),
      canUndo: false,
      canRedo: false,
      undo: vi.fn(),
      redo: vi.fn(),
      reset: vi.fn(),
      endEditBurst: vi.fn(),
    };
  },
}));

import { DeckSettings } from './DeckSettings';

// title.show is on so the title text field renders: Show-title off hides it
// along with the rest of the title fields.
const EXISTING_DECK: DeckConfig = {
  pages: [{ slots: [{ action: { type: 'hotkey', keys: '' }, label: 'existing', title: { show: true } }] }],
};

function makeWidget(): PanelWidget {
  return { id: 'w1', type: 'deck', size: '2x2', col: 0, row: 0, config: {} };
}

// The slot carries an action so the icon/title editor renders (it stays hidden
// for an unbound slot).
function renderSettings(deck: DeckConfig = EXISTING_DECK, opts: {
  surface?: PanelSurface;
  desktopEditor?: boolean;
} = {}) {
  currentInitialDeck = deck;
  const utils = render(
    <DeckSettings
      widget={makeWidget()}
      surface={opts.surface ?? 'desktop'}
      desktopEditor={opts.desktopEditor}
      onUpdate={vi.fn()}
      onResize={vi.fn()}
      selectedSlot={0}
      onSelectedSlotChange={vi.fn()}
      editView={{ page: 0, folderPath: [] }}
      onEditViewChange={vi.fn()}
    />,
  );
  return utils;
}

describe('DeckSettings (touch widget)', () => {
  it('has zero physical-Stream-Deck surface: no rail, no deck picker, no physical-only wording', () => {
    renderSettings();

    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByText(/rail/i)).toBeNull();
    expect(screen.queryByText('This widget')).toBeNull();
  });

  it('hosts the shared instance editor: mode chip + preset toolbar + key inspector', () => {
    renderSettings();

    expect(screen.getByRole('radiogroup', { name: 'panel.settings.deck.mode.label' })).toBeInTheDocument();
    expect(screen.getByText('panel.settings.deck.actionType')).toBeInTheDocument();
    expect(screen.getByText('panel.settings.icon')).toBeInTheDocument();
    expect(screen.getByText('panel.settings.deck.titleStyle.section')).toBeInTheDocument();
    // The key color now lives in the Icon box as "Icon Color".
    expect(screen.getByText('panel.settings.deck.color')).toBeInTheDocument();
  });

  it('edits the label through the preset target', () => {
    renderSettings();

    const labelInput = screen.getByPlaceholderText('panel.settings.deck.labelPlaceholder');
    fireEvent.change(labelInput, { target: { value: 'New label' } });

    expect(latestSave).toHaveBeenCalled();
    const patch = latestSave.mock.calls[0][0] as DeckConfig;
    expect(patch.pages[0].slots[0].label).toBe('New label');
  });

  it('clears the selected key back to blank from the delete control, with no confirm for a plain action', () => {
    renderSettings();

    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.deleteKey' }));

    expect(screen.queryByText('panel.settings.deck.deleteFolder.title')).toBeNull();
    const patch = latestSave.mock.calls[0][0] as DeckConfig;
    expect(patch.pages[0].slots[0]).toEqual({});
  });

  it('confirms first when the selected key is a folder holding bound keys', () => {
    const deck: DeckConfig = {
      pages: [{ slots: [{ folder: { slots: [{ action: { type: 'hotkey', keys: 'a' } }] } }] }],
    };
    renderSettings(deck);

    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.deleteKey' }));

    expect(latestSave).not.toHaveBeenCalled();
    expect(screen.getByText('panel.settings.deck.deleteFolder.title')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'confirm.ok' }));
    const patch = latestSave.mock.calls[0][0] as DeckConfig;
    expect(patch.pages[0].slots[0]).toEqual({});
  });

  it('keeps the folder when the delete confirm is cancelled', () => {
    const deck: DeckConfig = {
      pages: [{ slots: [{ folder: { slots: [{ action: { type: 'hotkey', keys: 'a' } }] } }] }],
    };
    renderSettings(deck);

    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.deleteKey' }));
    fireEvent.click(screen.getByRole('button', { name: 'confirm.cancel' }));

    expect(latestSave).not.toHaveBeenCalled();
    expect(screen.queryByText('panel.settings.deck.deleteFolder.title')).toBeNull();
  });

  it('deletes an empty folder outright - nothing inside it to warn about', () => {
    // A trailing populated slot keeps the fitted view from trimming the empty
    // folder away entirely (fitToGrid only trims trailing CONTENTLESS slots).
    const deck: DeckConfig = { pages: [{ slots: [{ folder: { slots: [] } }, { action: { type: 'hotkey', keys: 'x' } }] }] };
    renderSettings(deck);

    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.deleteKey' }));

    expect(screen.queryByText('panel.settings.deck.deleteFolder.title')).toBeNull();
    const patch = latestSave.mock.calls[0][0] as DeckConfig;
    expect(patch.pages[0].slots[0]).toEqual({});
  });
});
