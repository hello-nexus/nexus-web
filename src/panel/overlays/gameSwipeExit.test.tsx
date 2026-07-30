import { describe, expect, it } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { PanelImmersiveOverlay } from './PanelImmersiveOverlay';
import { SnakeTouch } from '../widgets/snake/SnakeTouch';
import { BlocksTouch } from '../widgets/blocks/BlocksTouch';
import type { WidgetProps } from '../widgets/types';

// QA reproduced this on a Y70 (3.0.5-beta6): a running game swallowed the
// overlay's swipe-to-dismiss everywhere, because the games marked their whole
// immersive root as a no-sheet-swipe target rather than just the playfield.
// These mount the real game inside the real overlay so the suppression stays
// scoped: a swipe on the HUD strip closes, a swipe on the playfield does not.

function dispatchTouch(target: Element, type: string, clientX: number, clientY: number, timeStamp: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', {
    value: type === 'touchend' || type === 'touchcancel' ? [] : [{ clientX, clientY, target }],
  });
  Object.defineProperty(event, 'timeStamp', { value: timeStamp });
  target.dispatchEvent(event);
}

function stubDialogRect(dialog: HTMLElement) {
  dialog.getBoundingClientRect = () => ({
    x: 0, y: 0, top: 0, left: 0, right: window.innerWidth, bottom: 800,
    width: window.innerWidth, height: 800, toJSON: () => {},
  });
}

function swipeDown(target: Element) {
  act(() => {
    dispatchTouch(target, 'touchstart', 100, 100, 0);
    dispatchTouch(target, 'touchmove', 100, 160, 16);
  });
}

// Portrait grid so the games render their playing view rather than the
// rotate-to-portrait prompt.
const gameProps = { immersiveGrid: { columns: 4, rows: 16 } } as unknown as WidgetProps;

describe('game immersive views keep the overlay swipe-to-dismiss', () => {
  it('snake: a swipe on the HUD engages dismissal, a swipe on the board does not', () => {
    render(
      <PanelImmersiveOverlay open onExit={() => {}}>
        <SnakeTouch {...gameProps} />
      </PanelImmersiveOverlay>,
    );
    // Start a run so the playing phase (the phase QA tested) is mounted.
    fireEvent.click(screen.getByText('panel.widget.snake.difficulty.easy'));

    const dialog = screen.getByRole('dialog');
    stubDialogRect(dialog);

    const board = screen.getByLabelText('panel.widget.snake.boardLabel');
    swipeDown(board);
    expect(dialog).not.toHaveAttribute('data-drag');

    const hud = dialog.querySelector('[data-panel-game-hud="true"]');
    expect(hud).not.toBeNull();
    swipeDown(hud as Element);
    expect(dialog).toHaveAttribute('data-drag', 'dragging');
  });

  it('blocks: a swipe on the HUD engages dismissal, a swipe on the board does not', () => {
    render(
      <PanelImmersiveOverlay open onExit={() => {}}>
        <BlocksTouch {...gameProps} />
      </PanelImmersiveOverlay>,
    );

    const dialog = screen.getByRole('dialog');
    stubDialogRect(dialog);

    const board = screen.getByLabelText('panel.widget.blocks.boardLabel');
    swipeDown(board);
    expect(dialog).not.toHaveAttribute('data-drag');

    const hud = dialog.querySelector('[data-panel-game-hud="true"]');
    expect(hud).not.toBeNull();
    swipeDown(hud as Element);
    expect(dialog).toHaveAttribute('data-drag', 'dragging');
  });
});
