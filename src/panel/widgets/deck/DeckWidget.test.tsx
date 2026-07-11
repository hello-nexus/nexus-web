import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const executeDeckAction = vi.fn();
vi.mock('./deckExecutor', () => ({ executeDeckAction: (...a: unknown[]) => executeDeckAction(...a) }));
vi.mock('./useDeckState', () => ({ useDeckLiveState: () => ({ isOn: () => undefined }) }));
vi.mock('../common/AppPicker', () => ({ useAppIcon: () => null, AppPicker: () => null }));

import { DeckWidget } from './DeckWidget';
import type { PanelWidget } from '../../types';
import type { DeckConfig, DeckPage } from './types';

function widget(pages: DeckPage[], size = '2x2'): PanelWidget {
  const deck: DeckConfig = { pages };
  return { id: 'w1', type: 'deck', size: size as PanelWidget['size'], col: 0, row: 0, config: { deck: deck as never } };
}

describe('DeckWidget', () => {
  beforeEach(() => executeDeckAction.mockClear());

  it('renders one cell per inner-grid slot for the size', () => {
    const { container } = render(<DeckWidget widget={widget([{ slots: [] }])} />);
    expect(container.querySelectorAll('[data-deck-slot-index]')).toHaveLength(4); // 2x2
  });

  it('renders a 4x4 inner grid as 16 cells', () => {
    const { container } = render(<DeckWidget widget={widget([{ slots: [] }], '4x4')} />);
    expect(container.querySelectorAll('[data-deck-slot-index]')).toHaveLength(16);
  });

  it('dispatches the slot action on press in run mode', () => {
    const deck: DeckPage[] = [{ slots: [{ action: { type: 'openUrl', url: 'https://x.com' } }] }];
    const { container } = render(<DeckWidget widget={widget(deck)} />);
    fireEvent.click(container.querySelector('[data-deck-slot-index="0"]')!);
    expect(executeDeckAction).toHaveBeenCalledWith({ type: 'openUrl', url: 'https://x.com' });
  });

  it('does not dispatch an empty slot', () => {
    const { container } = render(<DeckWidget widget={widget([{ slots: [] }])} />);
    const cell = container.querySelector('[data-deck-slot-index="0"]')!;
    fireEvent.click(cell);
    expect(executeDeckAction).not.toHaveBeenCalled();
  });

  it('navigates into a folder instead of dispatching', () => {
    const deck: DeckPage[] = [{ slots: [{ folder: { slots: [{ action: { type: 'openUrl', url: 'inner' } }] } }] }];
    const { container } = render(<DeckWidget widget={widget(deck)} />);
    fireEvent.click(container.querySelector('[data-deck-slot-index="0"]')!);
    expect(executeDeckAction).not.toHaveBeenCalled();
    // After entering, slot 0 is now the inner action.
    fireEvent.click(container.querySelector('[data-deck-slot-index="0"]')!);
    expect(executeDeckAction).toHaveBeenCalledWith({ type: 'openUrl', url: 'inner' });
  });

  describe('pagination', () => {
    const marker = (url: string) => ({ action: { type: 'openUrl' as const, url } });

    it('a next-page press advances to the next page without dispatching', () => {
      const deck: DeckPage[] = [
        { slots: [{ action: { type: 'page', op: 'next' } }] },
        { slots: [marker('p1')] },
      ];
      const { container } = render(<DeckWidget widget={widget(deck)} />);
      fireEvent.click(container.querySelector('[data-deck-slot-index="0"]')!);
      expect(executeDeckAction).not.toHaveBeenCalled();
      fireEvent.click(container.querySelector('[data-deck-slot-index="0"]')!);
      expect(executeDeckAction).toHaveBeenCalledWith({ type: 'openUrl', url: 'p1' });
    });

    it('a prev-page press wraps to the last page from page 0', () => {
      const deck: DeckPage[] = [
        { slots: [{ action: { type: 'page', op: 'prev' } }] },
        { slots: [] },
        { slots: [marker('p2')] },
      ];
      const { container } = render(<DeckWidget widget={widget(deck)} />);
      fireEvent.click(container.querySelector('[data-deck-slot-index="0"]')!); // wraps 0 -> 2
      fireEvent.click(container.querySelector('[data-deck-slot-index="0"]')!);
      expect(executeDeckAction).toHaveBeenCalledWith({ type: 'openUrl', url: 'p2' });
    });

    it('a goto-page press jumps directly to the target page', () => {
      const deck: DeckPage[] = [
        { slots: [{ action: { type: 'page', op: 'goto', target: 2 } }] },
        { slots: [marker('p1')] },
        { slots: [marker('p2')] },
      ];
      const { container } = render(<DeckWidget widget={widget(deck)} />);
      fireEvent.click(container.querySelector('[data-deck-slot-index="0"]')!); // goto page 2
      fireEvent.click(container.querySelector('[data-deck-slot-index="0"]')!);
      expect(executeDeckAction).toHaveBeenCalledWith({ type: 'openUrl', url: 'p2' });
      expect(executeDeckAction).not.toHaveBeenCalledWith({ type: 'openUrl', url: 'p1' });
    });

    it('pressing a pageIndicator slot does nothing', () => {
      const deck: DeckPage[] = [{ slots: [{ action: { type: 'pageIndicator' } }] }];
      const { container } = render(<DeckWidget widget={widget(deck)} />);
      fireEvent.click(container.querySelector('[data-deck-slot-index="0"]')!);
      expect(executeDeckAction).not.toHaveBeenCalled();
    });

    it('renders the pageIndicator label as currentPage/totalPages and updates after paging', () => {
      const deck: DeckPage[] = [
        { slots: [{ action: { type: 'page', op: 'next' } }, { action: { type: 'pageIndicator' } }] },
        { slots: [{}, { action: { type: 'pageIndicator' } }] },
      ];
      const { container } = render(<DeckWidget widget={widget(deck)} />);
      expect(container.querySelector('[data-deck-slot-index="1"]')?.textContent).toContain('1/2');
      fireEvent.click(container.querySelector('[data-deck-slot-index="0"]')!);
      expect(container.querySelector('[data-deck-slot-index="1"]')?.textContent).toContain('2/2');
    });
  });
});
