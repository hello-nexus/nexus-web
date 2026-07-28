import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { BlocksBoard } from './BlocksBoard';
import { computeLandingPreview, createEmptyBoard, SHAPES, type BlockCell } from './blocksLogic';

const CELL_SIZE = 20;

function renderBoard(landingPreview: ReturnType<typeof computeLandingPreview> | null, fallingBlocks: BlockCell[]) {
  return render(
    <BlocksBoard
      board={createEmptyBoard()}
      fallingBlocks={fallingBlocks}
      landingPreview={landingPreview}
      comboTier={0}
      boardLabel="board"
      cellSize={CELL_SIZE}
      boardBoxRef={() => {}}
      boardWidthCells={7}
      boardHeightCells={25}
      onPointerDown={vi.fn()}
      onKeyDown={vi.fn()}
    />,
  );
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
