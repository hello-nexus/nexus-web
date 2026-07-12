import { useState } from 'react';
import { render, screen, within, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PanelConfigValue, PanelSurface, PanelWidget } from '../types';
import { AUTO_SAVE_DEBOUNCE_MS } from './useDeckPresets';
import type { DeckConfig, DeckWidgetPreset } from './types';

vi.mock('../common/AppPicker', () => ({ useAppIcon: () => null, AppPicker: () => null }));

import { DeckSettings } from './DeckSettings';

const EXISTING_DECK: DeckConfig = { pages: [{ slots: [{ action: { type: 'hotkey', keys: '' }, label: 'existing' }] }] };

function makeWidget(deck: DeckConfig, extraConfig: Record<string, PanelConfigValue> = {}): PanelWidget {
  return { id: 'w1', type: 'deck', size: '2x2', col: 0, row: 0, config: { deck: deck as never, ...extraConfig } };
}

// The slot carries an action so the icon/title editor renders (it stays hidden
// for an unbound slot).
function renderSettings(deck: DeckConfig = EXISTING_DECK, opts: {
  surface?: PanelSurface;
  desktopEditor?: boolean;
  extraConfig?: Record<string, PanelConfigValue>;
} = {}) {
  const onUpdate = vi.fn();
  const utils = render(
    <DeckSettings
      widget={makeWidget(deck, opts.extraConfig)}
      surface={opts.surface ?? 'desktop'}
      desktopEditor={opts.desktopEditor}
      onUpdate={onUpdate}
      onResize={vi.fn()}
      selectedSlot={0}
      onSelectedSlotChange={vi.fn()}
      editView={{ page: 0, folderPath: [] }}
      onEditViewChange={vi.fn()}
    />,
  );
  return { ...utils, onUpdate };
}

const PRESET_TRIGGER = { name: 'lighting.layoutPresets.placeholder' };

function openPresetMenu() {
  fireEvent.click(screen.getByRole('button', PRESET_TRIGGER));
}

describe('DeckSettings (touch widget)', () => {
  it('has zero physical-Stream-Deck surface: no rail, no deck picker, no physical-only wording', () => {
    renderSettings();

    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByText(/rail/i)).toBeNull();
    expect(screen.queryByText('This widget')).toBeNull();
  });

  it('renders the shared key inspector directly for the widget target', () => {
    renderSettings();

    expect(screen.getByText('panel.settings.deck.actionType')).toBeInTheDocument();
    expect(screen.getByText('panel.settings.icon')).toBeInTheDocument();
    expect(screen.getByText('panel.settings.deck.titleStyle.section')).toBeInTheDocument();
    // The key color now lives in the Icon box as "Icon Color".
    expect(screen.getByText('panel.settings.deck.color')).toBeInTheDocument();
  });

  it('edits the label through onUpdate against the widget config.deck', () => {
    const { onUpdate } = renderSettings();

    const labelInput = screen.getByPlaceholderText('panel.settings.deck.labelPlaceholder');
    fireEvent.change(labelInput, { target: { value: 'New label' } });

    expect(onUpdate).toHaveBeenCalled();
    const patch = onUpdate.mock.calls[0][0] as { deck: DeckConfig };
    expect(patch.deck.pages[0].slots[0].label).toBe('New label');
  });
});

describe('DeckSettings (widget-local presets)', () => {
  it('mounts the preset selector above the key inspector', () => {
    renderSettings();

    expect(screen.getByRole('button', PRESET_TRIGGER)).toBeInTheDocument();
  });

  it('creating a preset snapshots the current deck config and activates it', async () => {
    const { onUpdate } = renderSettings();

    openPresetMenu();
    fireEvent.click(screen.getByRole('option', { name: 'lighting.layoutPresets.newOption' }));
    fireEvent.change(within(screen.getByRole('alertdialog')).getByRole('textbox'), { target: { value: 'My layout' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'lighting.layoutPresets.new' }));
      await Promise.resolve();
    });

    expect(onUpdate).toHaveBeenCalledTimes(1);
    const patch = onUpdate.mock.calls[0][0] as { deckPresets: DeckWidgetPreset[]; deckActivePresetId: string };
    expect(patch.deckPresets).toHaveLength(1);
    expect(patch.deckPresets[0].name).toBe('My layout');
    expect(patch.deckPresets[0].deck).toEqual(EXISTING_DECK);
    expect(patch.deckActivePresetId).toBe(patch.deckPresets[0].id);
  });

  it('switching to another preset applies its config and marks it active', () => {
    const altDeck: DeckConfig = { pages: [{ slots: [{ label: 'alt' }] }] };
    const presets: DeckWidgetPreset[] = [
      { id: 'p1', name: 'Current', deck: EXISTING_DECK },
      { id: 'p2', name: 'Alt', deck: altDeck },
    ];
    const { onUpdate } = renderSettings(EXISTING_DECK, {
      extraConfig: { deckPresets: presets as never, deckActivePresetId: 'p1' },
    });

    openPresetMenu();
    fireEvent.click(screen.getByRole('option', { name: 'Alt' }));

    expect(onUpdate).toHaveBeenCalledWith({
      deck: altDeck,
      deckPresets: presets,
      deckActivePresetId: 'p2',
    });
  });

  it('renaming the active preset', async () => {
    const presets: DeckWidgetPreset[] = [{ id: 'p1', name: 'Old name', deck: EXISTING_DECK }];
    const { onUpdate } = renderSettings(EXISTING_DECK, {
      extraConfig: { deckPresets: presets as never, deckActivePresetId: 'p1' },
    });

    openPresetMenu();
    fireEvent.click(screen.getByRole('option', { name: 'lighting.layoutPresets.rename' }));
    fireEvent.change(within(screen.getByRole('alertdialog')).getByRole('textbox'), { target: { value: 'New name' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'lighting.layoutPresets.rename' }));
      await Promise.resolve();
    });

    expect(onUpdate).toHaveBeenCalledWith({
      deckPresets: [{ id: 'p1', name: 'New name', deck: EXISTING_DECK }],
      deckActivePresetId: 'p1',
    });
  });

  it('deleting the active preset clears the pointer', () => {
    const presets: DeckWidgetPreset[] = [{ id: 'p1', name: 'Only one', deck: EXISTING_DECK }];
    const { onUpdate } = renderSettings(EXISTING_DECK, {
      extraConfig: { deckPresets: presets as never, deckActivePresetId: 'p1' },
    });

    openPresetMenu();
    fireEvent.click(screen.getByRole('option', { name: 'lighting.layoutPresets.delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'confirm.ok' }));

    expect(onUpdate).toHaveBeenCalledWith({ deckPresets: [], deckActivePresetId: null });
  });

  it('hides create and rename on a keyboardless surface (Y70, no desktopEditor)', () => {
    const presets: DeckWidgetPreset[] = [{ id: 'p1', name: 'Only one', deck: EXISTING_DECK }];
    renderSettings(EXISTING_DECK, {
      surface: 'y70',
      extraConfig: { deckPresets: presets as never, deckActivePresetId: 'p1' },
    });

    openPresetMenu();
    expect(screen.queryByRole('option', { name: 'lighting.layoutPresets.newOption' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'lighting.layoutPresets.rename' })).toBeNull();
    expect(screen.getByRole('option', { name: 'lighting.layoutPresets.delete' })).toBeInTheDocument();
  });

  it('shows create/rename on a keyboardless surface when desktopEditor is true', () => {
    renderSettings(EXISTING_DECK, { surface: 'y70', desktopEditor: true });

    openPresetMenu();
    expect(screen.getByRole('option', { name: 'lighting.layoutPresets.newOption' })).toBeInTheDocument();
  });

  it('never renders the reset/undo/redo history controls (the widget editor has no undo infra)', () => {
    renderSettings();

    openPresetMenu();
    expect(screen.queryByRole('option', { name: 'lighting.layoutPresets.reset' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'lighting.layoutPresets.undo' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'lighting.layoutPresets.redo' })).toBeNull();
  });
});

describe('DeckSettings (widget-local presets - auto-save integration)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  // A minimal stand-in for the real panel state owner (PanelApp/PanelDevicePage):
  // shallow-merges every onUpdate patch into widget.config, the same as
  // updateWidgetConfig, so DeckSettings receives a fresh `widget` after each
  // edit - the signal the auto-save effect watches.
  function Harness({ onPatch }: { onPatch: (config: Record<string, PanelConfigValue>) => void }) {
    const [widget, setWidget] = useState<PanelWidget>(
      makeWidget(EXISTING_DECK, { deckPresets: [{ id: 'p1', name: 'A', deck: EXISTING_DECK }] as never, deckActivePresetId: 'p1' }),
    );
    return (
      <DeckSettings
        widget={widget}
        surface="desktop"
        onUpdate={config => {
          onPatch(config);
          setWidget(w => ({ ...w, config: { ...w.config, ...config } }));
        }}
        onResize={vi.fn()}
        selectedSlot={0}
        onSelectedSlotChange={vi.fn()}
        editView={{ page: 0, folderPath: [] }}
        onEditViewChange={vi.fn()}
      />
    );
  }

  it('auto-saves the active preset a debounce window after a committed key edit', async () => {
    const onPatch = vi.fn();
    render(<Harness onPatch={onPatch} />);

    const labelInput = screen.getByPlaceholderText('panel.settings.deck.labelPlaceholder');
    fireEvent.change(labelInput, { target: { value: 'New label' } });
    expect(onPatch).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS); });

    expect(onPatch).toHaveBeenCalledTimes(2);
    const autoSavePatch = onPatch.mock.calls[1][0] as { deckPresets: DeckWidgetPreset[]; deckActivePresetId: string };
    expect(autoSavePatch.deckActivePresetId).toBe('p1');
    expect(autoSavePatch.deckPresets[0].deck.pages[0].slots[0].label).toBe('New label');
  });
});
