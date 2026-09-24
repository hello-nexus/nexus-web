import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { BlocksBoard } from './BlocksBoard';
import { computeLandingPreview, createEmptyBoard, SHAPES, type BlockCell } from './blocksLogic';
import styles from './BlocksBoard.module.scss';

const CELL_SIZE = 20;

function boardElement(
  fallingBlocks: BlockCell[],
  opts: {
    landingPreview?: ReturnType<typeof computeLandingPreview> | null;
    score?: number;
    clearedRowIndices?: number[];
  } = {},
) {
  return (
    <BlocksBoard
      board={createEmptyBoard()}
      fallingBlocks={fallingBlocks}
      landingPreview={opts.landingPreview ?? null}
      comboTier={0}
      boardLabel="board"
      cellSize={CELL_SIZE}
      boardBoxRef={() => {}}
      boardWidthCells={7}
      boardHeightCells={25}
      score={opts.score ?? 0}
      clearedRowIndices={opts.clearedRowIndices ?? []}
      onPointerDown={vi.fn()}
      onKeyDown={vi.fn()}
    />
  );
}

function renderBoard(
  landingPreview: ReturnType<typeof computeLandingPreview> | null,
  fallingBlocks: BlockCell[],
  extra?: Partial<{ score: number; clearedRowIndices: number[] }>,
) {
  return render(boardElement(fallingBlocks, { landingPreview, ...extra }));
}

describe('BlocksBoard landing preview rendering', () => {
  const position = { x: 0, y: 0 };
  const fallingBlocks: BlockCell[] = SHAPES.yellow.map(b => ({ ...b, x: b.x + position.x, y: b.y + position.y }));

  it('renders a ghost cell per piece cell and a trail cell for the path when a preview is given', () => {
    const board = createEmptyBoard();
    const preview = computeLandingPreview(board, SHAPES.yellow, position);
    const { container } = renderBoard(preview, fallingBlocks);

    const ghostCells = container.querySelectorAll('[data-ghost="true"]');
    expect(ghostCells).toHaveLength(preview.ghostCells.length);
    expect(preview.trailCells.length).toBeGreaterThan(0);
  });

  it('renders nothing for the preview when it is null (mid hard-drop, or game over unmounts the board entirely)', () => {
    const { container } = renderBoard(null, fallingBlocks);
    expect(container.querySelectorAll('[data-ghost="true"]')).toHaveLength(0);
  });

  it('the ghost keeps the piece color so its footprint is identifiable at a glance', () => {
    const board = createEmptyBoard();
    const preview = computeLandingPreview(board, SHAPES.yellow, position);
    const { container } = renderBoard(preview, fallingBlocks);

    const ghostCells = container.querySelectorAll('[data-ghost="true"]');
    ghostCells.forEach(cell => expect(cell.getAttribute('data-color')).toBe('yellow'));
  });

  it('places the ghost on top of a stacked cell rather than at the floor', () => {
    const board = createEmptyBoard();
    board[10][0] = 'red';
    board[10][1] = 'red';
    const preview = computeLandingPreview(board, SHAPES.yellow, position);
    const { container } = renderBoard(preview, fallingBlocks);

    const ghostCells = Array.from(container.querySelectorAll<HTMLElement>('[data-ghost="true"]'));
    const expectedTopPx = `${Math.min(...preview.ghostCells.map(c => c.y)) * CELL_SIZE}px`;
    expect(ghostCells.some(cell => cell.style.top === expectedTopPx)).toBe(true);
  });
});

describe('BlocksBoard row-clear particle burst', () => {
  const fallingBlocks: BlockCell[] = SHAPES.yellow;

  it('fires no burst on mount, even when mounted directly with a positive score', () => {
    const { container } = render(boardElement(fallingBlocks, { score: 200, clearedRowIndices: [5] }));
    expect(container.querySelectorAll(`.${styles.particle}`)).toHaveLength(0);
  });

  it('fires a burst on a rising score edge when rows were cleared', () => {
    const { container, rerender } = render(boardElement(fallingBlocks));
    rerender(boardElement(fallingBlocks, { score: 200, clearedRowIndices: [5] }));
    expect(container.querySelectorAll(`.${styles.particle}`).length).toBeGreaterThan(0);
  });

  it('caps the particle count for a multi-row clear instead of spraying one burst per row', () => {
    const { container, rerender } = render(boardElement(fallingBlocks));
    // Even uncapped, this many cleared rows would fall well short of
    // "hundreds" of particles - the cap keeps it bounded regardless.
    rerender(boardElement(fallingBlocks, { score: 800, clearedRowIndices: [1, 2, 3, 4, 5, 6, 7, 8] }));
    const count = container.querySelectorAll(`.${styles.particle}`).length;
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(16);
  });

  it('fires no burst on a score rise with no cleared rows (guards the plumbing, though this never happens in play)', () => {
    const { container, rerender } = render(boardElement(fallingBlocks));
    rerender(boardElement(fallingBlocks, { score: 100, clearedRowIndices: [] }));
    expect(container.querySelectorAll(`.${styles.particle}`)).toHaveLength(0);
  });

  it('self-removes a particle on its own animation-end event', () => {
    const { container, rerender } = render(boardElement(fallingBlocks));
    rerender(boardElement(fallingBlocks, { score: 200, clearedRowIndices: [5] }));
    const before = container.querySelectorAll(`.${styles.particle}`).length;
    expect(before).toBeGreaterThan(0);
    // jsdom has no global AnimationEvent, so React's feature detection falls
    // back to listening for the vendor-prefixed native event instead of the
    // standard "animationend" - firing that standard name here is a no-op.
    container.querySelectorAll(`.${styles.particle}`).forEach(el => fireEvent(el, new Event('webkitAnimationEnd', { bubbles: true })));
    expect(container.querySelectorAll(`.${styles.particle}`)).toHaveLength(0);
  });
});
