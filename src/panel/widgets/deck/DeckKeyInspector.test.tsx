import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { makePhysicalDeckTarget } from './deckTarget';
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
  render(<Harness initialSlots={slots} />);
}

function openCategoryPicker() {
  fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.actionCategory' }));
}

function openKindPicker() {
  fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.actionType' }));
}

describe('DeckKeyInspector action picker - Stream Deck category', () => {
  it('offers a Stream Deck category containing Deck Brightness and Deck Sleep', () => {
    renderInspector();
    openCategoryPicker();
    fireEvent.click(screen.getByRole('option', { name: 'panel.settings.deck.category.streamdeck' }));

    openKindPicker();
    expect(screen.getByRole('option', { name: 'panel.settings.deck.action.deckBrightness' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'panel.settings.deck.action.deckSleep' })).toBeInTheDocument();
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

  it('lists Hotkey Switch inside the System category picker', () => {
    renderInspector();
    openCategoryPicker();
    fireEvent.click(screen.getByRole('option', { name: 'panel.settings.deck.category.system' }));

    openKindPicker();
    expect(screen.getByRole('option', { name: 'panel.settings.deck.action.hotkeySwitch' })).toBeInTheDocument();
  });
});
