import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { makePhysicalDeckTarget, makeWidgetDeckTarget } from './deckTarget';
import type { PanelWidget } from '../types';
import type { DeckConfig, DeckSlot } from './types';

vi.mock('../common/AppPicker', () => ({ useAppIcon: () => null, AppPicker: () => null }));
vi.mock('../../../api/service', () => ({ fetchService: vi.fn().mockResolvedValue(null) }));

import { DeckKeyInspector, defaultActionFor } from './DeckKeyInspector';

describe('defaultActionFor - new Stream Deck action kinds', () => {
  it('deckBrightness defaults to op set at 50%', () => {
    expect(defaultActionFor('deckBrightness')).toEqual({ type: 'deckBrightness', op: 'set', value: 50 });
  });
  it('deckSleep has no params', () => {
    expect(defaultActionFor('deckSleep')).toEqual({ type: 'deckSleep' });
  });
  it('hotkeySwitch defaults to two empty hotkey slots', () => {
    expect(defaultActionFor('hotkeySwitch')).toEqual({ type: 'hotkeySwitch', keysA: '', keysB: '' });
  });
});

/**
 * DeckKeyInspector is a controlled view over `target.config` - it has no
 * internal slot state, so a bare `vi.fn()` updateSlot mock never reflects
 * back into a re-render. This harness uses the real makePhysicalDeckTarget
 * (the same factory StreamDeckDevicePage uses) over a useState-backed config
 * so picker interactions round-trip exactly like production.
 */
function Harness({ initialSlots }: { initialSlots: DeckSlot[] }) {
  const [config, setConfig] = useState<DeckConfig>({ pages: [{ slots: initialSlots }] });
  const target = makePhysicalDeckTarget(2, 1, initialSlots.length, config, setConfig);
  return (
    <DeckKeyInspector
      target={target}
      page={0}
      folderPath={[]}
      onFolderPathChange={() => {}}
      selectedSlot={0}
      onSelectedSlotChange={() => {}}
    />
  );
}

function renderInspector(slots: DeckSlot[] = [{}]) {
  return render(<Harness initialSlots={slots} />);
}

/** Same round-tripping contract as Harness, but over a touch-widget target (the
 * one editing surface with no physical Stream Deck to actually apply
 * deckBrightness/deckSleep). */
function WidgetHarness({ initialSlots }: { initialSlots: DeckSlot[] }) {
  const [widget, setWidget] = useState<PanelWidget>({
    id: 'w1', type: 'deck', size: '2x2', col: 0, row: 0,
    config: { deck: { pages: [{ slots: initialSlots }] } as never },
  });
  const target = makeWidgetDeckTarget(widget, patch => setWidget(w => ({ ...w, config: { ...w.config, ...patch } })));
  return (
    <DeckKeyInspector
      target={target}
      page={0}
      folderPath={[]}
      onFolderPathChange={() => {}}
      selectedSlot={0}
      onSelectedSlotChange={() => {}}
    />
  );
}

function renderWidgetInspector(slots: DeckSlot[] = [{}]) {
  render(<WidgetHarness initialSlots={slots} />);
}

function isBefore(a: Element, b: Element): boolean {
  return !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

describe('DeckKeyInspector section order', () => {
  it('renders Action, Label, Title Style, Icon, Color top to bottom', () => {
    renderInspector();
    const action = screen.getByText('panel.settings.deck.actionType');
    const label = screen.getByText('panel.settings.deck.label');
    const titleStyle = screen.getByText('panel.settings.deck.titleStyle.section');
    const icon = screen.getByText('panel.settings.icon');
    const color = screen.getByText('panel.settings.deck.color');
    expect(isBefore(action, label)).toBe(true);
    expect(isBefore(label, titleStyle)).toBe(true);
    expect(isBefore(titleStyle, icon)).toBe(true);
    expect(isBefore(icon, color)).toBe(true);
  });
});

describe('DeckKeyInspector action picker - collapsible category list', () => {
  it('starts with the current kind\'s category expanded and highlights the active kind', () => {
    renderInspector([{ action: { type: 'hotkey', keys: '' } }]);
    expect(screen.getByRole('option', { name: 'panel.settings.deck.action.hotkey' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: 'panel.settings.deck.action.launchApp' })).toHaveAttribute('aria-selected', 'false');
  });

  it('shows every category expanded by default', () => {
    renderInspector([{ action: { type: 'hotkey', keys: '' } }]);
    // Every category starts expanded, so a Stream Deck category action is
    // present without first clicking its header.
    expect(screen.getByRole('option', { name: 'panel.settings.deck.action.deckBrightness' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'panel.settings.deck.action.deckSleep' })).toBeInTheDocument();
  });

  it('clicking a kind entry selects that action and updates the highlight', () => {
    renderInspector();
    fireEvent.click(screen.getByRole('option', { name: 'panel.settings.deck.action.hotkey' }));

    expect(screen.getByRole('option', { name: 'panel.settings.deck.action.hotkey' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('panel.settings.deck.hotkey')).toBeInTheDocument();
  });

  it('offers a Stream Deck category containing Deck Brightness and Deck Sleep on a physical target', () => {
    renderInspector();
    expect(screen.getByRole('button', { name: 'panel.settings.deck.category.streamdeck' })).toBeInTheDocument();
  });

  it('deckBrightness shows a value slider for op "set" and swaps to a step field for "up"/"down"', () => {
    renderInspector([{ action: { type: 'deckBrightness', op: 'set', value: 50 } }]);
    expect(screen.getByRole('slider', { name: 'panel.settings.deck.value' })).toBeInTheDocument();
    expect(screen.queryByText('panel.settings.deck.step')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.deckBrightnessOp' }));
    fireEvent.click(screen.getByRole('option', { name: 'panel.settings.deck.deckBrightness.up' }));

    expect(screen.getByText('panel.settings.deck.step')).toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: 'panel.settings.deck.value' })).toBeNull();
  });

  it('deckSleep renders only a description line, no params', () => {
    renderInspector([{ action: { type: 'deckSleep' } }]);
    expect(screen.getByText('panel.settings.deck.deckSleepDescription')).toBeInTheDocument();
  });

  it('offers Hotkey Switch in the System category with two independently capturable hotkey inputs', () => {
    renderInspector([{ action: { type: 'hotkeySwitch', keysA: '', keysB: '' } }]);

    expect(screen.getByText('panel.settings.deck.hotkeySwitch.firstPress')).toBeInTheDocument();
    expect(screen.getByText('panel.settings.deck.hotkeySwitch.secondPress')).toBeInTheDocument();
    const captureButtons = screen.getAllByText('panel.settings.deck.hotkeySet');
    expect(captureButtons).toHaveLength(2);

    fireEvent.click(captureButtons[0]);
    fireEvent.keyDown(captureButtons[0], { code: 'KeyM', ctrlKey: true });
    expect(screen.getByText('ctrl+m')).toBeInTheDocument();
    // Second slot is untouched.
    expect(screen.getByText('panel.settings.deck.hotkeySet')).toBeInTheDocument();
  });

  it('lists Hotkey Switch inside the System category (open by default for a launchApp slot)', () => {
    renderInspector();
    expect(screen.getByRole('option', { name: 'panel.settings.deck.action.hotkeySwitch' })).toBeInTheDocument();
  });
});

describe('DeckKeyInspector - deckBrightness/deckSleep are physical-deck-only', () => {
  it('hides the Stream Deck category entirely on a touch-widget target', () => {
    renderWidgetInspector();

    expect(screen.queryByRole('button', { name: 'panel.settings.deck.category.streamdeck' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'panel.settings.deck.action.deckBrightness' })).toBeNull();
    // Every other category is still offered - only the physical-only one is gone.
    expect(screen.getByRole('button', { name: 'panel.settings.deck.category.system' })).toBeInTheDocument();
  });

  it('omits deckBrightness/deckSleep from a nested sequence step on a widget target', () => {
    renderWidgetInspector();
    fireEvent.click(screen.getByRole('option', { name: 'panel.settings.deck.action.sequence' }));

    fireEvent.click(screen.getByText('panel.settings.deck.sequence.addStep'));
    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.actionType' }));

    expect(screen.queryByRole('option', { name: 'panel.settings.deck.action.deckBrightness' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'panel.settings.deck.action.deckSleep' })).toBeNull();
    // hotkeySwitch works everywhere (best-effort on the widget), so the step's
    // own Select popup (an <li>, unlike the top-level category list's <button>
    // entries) still offers it.
    const hotkeySwitchOptions = screen.getAllByRole('option', { name: 'panel.settings.deck.action.hotkeySwitch' });
    expect(hotkeySwitchOptions.some(o => o.tagName === 'LI')).toBe(true);
  });

  it('still offers the Stream Deck category on a physical target', () => {
    renderInspector();
    expect(screen.getByRole('button', { name: 'panel.settings.deck.category.streamdeck' })).toBeInTheDocument();
  });
});

describe('DeckKeyInspector title style section', () => {
  it('defaults to Show title on', () => {
    renderInspector([{ label: 'Hi' }]);
    expect(screen.getByRole('switch', { name: 'panel.settings.deck.titleStyle.show' })).toBeChecked();
  });

  it('turning Show title off disables the rest of the title style controls', () => {
    renderInspector([{ label: 'Hi' }]);
    fireEvent.click(screen.getByRole('switch', { name: 'panel.settings.deck.titleStyle.show' }));

    expect(screen.getByRole('switch', { name: 'panel.settings.deck.titleStyle.show' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'panel.settings.deck.titleStyle.bold' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'panel.settings.deck.titleStyle.alignTop' })).toBeDisabled();
  });

  it('picking Bold toggles it active', () => {
    renderInspector([{ label: 'Hi' }]);
    const bold = screen.getByRole('button', { name: 'panel.settings.deck.titleStyle.bold' });
    expect(bold).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(bold);
    expect(screen.getByRole('button', { name: 'panel.settings.deck.titleStyle.bold' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('picking an alignment marks it active', () => {
    renderInspector([{ label: 'Hi' }]);
    // Middle is the default.
    expect(screen.getByRole('button', { name: 'panel.settings.deck.titleStyle.alignMiddle' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.titleStyle.alignTop' }));
    expect(screen.getByRole('button', { name: 'panel.settings.deck.titleStyle.alignTop' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'panel.settings.deck.titleStyle.alignMiddle' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders an Auto swatch for both the key color and the title text color', () => {
    renderInspector([{ label: 'Hi' }]);
    // One "Auto" swatch for the key's background color (existing section) and
    // one for the title's text color (new section) - both default-selected.
    expect(screen.getAllByText('panel.settings.deck.colorAuto')).toHaveLength(2);
  });
});
