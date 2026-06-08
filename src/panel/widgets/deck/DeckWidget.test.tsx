import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const executeDeckAction = vi.fn();
vi.mock('./deckExecutor', () => ({ executeDeckAction: (...a: unknown[]) => executeDeckAction(...a) }));
vi.mock('./useDeckState', () => ({ useDeckLiveState: () => ({ isOn: () => undefined }) }));
vi.mock('../common/AppPicker', () => ({ useAppIcon: () => null, AppPicker: () => null }));

import { DeckWidget } from './DeckWidget';
import type { PanelWidget } from '../../types';
import type { DeckConfig } from './types';

function widget(deck: DeckConfig, size = '2x2'): PanelWidget {
  return { id: 'w1', type: 'deck', size: size as PanelWidget['size'], col: 0, row: 0, config: { deck: deck as never } };
}

describe('DeckWidget', () => {
  beforeEach(() => executeDeckAction.mockClear());

  it('renders one cell per inner-grid slot for the size', () => {
    const { container } = render(<DeckWidget widget={widget({ slots: [] })} />);
    expect(container.querySelectorAll('[data-deck-slot-index]')).toHaveLength(4); // 2x2
  });

  it('renders a 4x4 inner grid as 16 cells', () => {
    const { container } = render(<DeckWidget widget={widget({ slots: [] }, '4x4')} />);
    expect(container.querySelectorAll('[data-deck-slot-index]')).toHaveLength(16);
  });

  it('dispatches the slot action on press in run mode', () => {
    const deck: DeckConfig = { slots: [{ action: { type: 'openUrl', url: 'https://x.com' } }] };
    const { container } = render(<DeckWidget widget={widget(deck)} />);
    fireEvent.click(container.querySelector('[data-deck-slot-index="0"]')!);
    expect(executeDeckAction).toHaveBeenCalledWith({ type: 'openUrl', url: 'https://x.com' });
  });

  it('does not dispatch an empty slot', () => {
    const { container } = render(<DeckWidget widget={widget({ slots: [] })} />);
    const cell = container.querySelector('[data-deck-slot-index="0"]')!;
    fireEvent.click(cell);
    expect(executeDeckAction).not.toHaveBeenCalled();
  });

  it('navigates into a folder instead of dispatching', () => {
    const deck: DeckConfig = { slots: [{ folder: { slots: [{ action: { type: 'openUrl', url: 'inner' } }] } }] };
    const { container } = render(<DeckWidget widget={widget(deck)} />);
    fireEvent.click(container.querySelector('[data-deck-slot-index="0"]')!);
    expect(executeDeckAction).not.toHaveBeenCalled();
    // After entering, slot 0 is now the inner action.
    fireEvent.click(container.querySelector('[data-deck-slot-index="0"]')!);
    expect(executeDeckAction).toHaveBeenCalledWith({ type: 'openUrl', url: 'inner' });
  });
});
