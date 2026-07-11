import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { PanelWidget } from '../types';
import type { DeckConfig } from './types';

vi.mock('../common/AppPicker', () => ({ useAppIcon: () => null, AppPicker: () => null }));

import { DeckSettings } from './DeckSettings';

function makeWidget(deck: DeckConfig): PanelWidget {
  return { id: 'w1', type: 'deck', size: '2x2', col: 0, row: 0, config: { deck: deck as never } };
}

// The slot carries an action so the icon/title editor renders (it stays hidden
// for an unbound slot).
function renderSettings(deck: DeckConfig = { pages: [{ slots: [{ action: { type: 'hotkey', keys: '' }, label: 'existing' }] }] }) {
  const onUpdate = vi.fn();
  const utils = render(
    <DeckSettings
      widget={makeWidget(deck)}
      surface="desktop"
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
