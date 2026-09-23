import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { act, renderHook } from '@testing-library/react';
import { useBlocksHardDrop } from './useBlocksHardDrop';
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  computeFastFallStepMs,
  computeHardDropDistance,
  createEmptyBoard,
  SHAPES,
  SPAWN_POSITION,
  stepBlocks,
  type BlocksRunState,
} from './blocksLogic';

const fixedRandom = () => 0;

function stateAtSpawn(): BlocksRunState {
  return {
    board: createEmptyBoard(),
    blocks: SHAPES.yellow,
    nextBlocks: SHAPES.cyan,
    position: { ...SPAWN_POSITION },
    score: 0,
    combo: 0,
    gameOver: false,
    lastClearedRowIndices: [],
  };
}

function useHarness(initial: BlocksRunState, paused: boolean) {
  const [runState, setRunState] = useState(initial);
  const controls = useBlocksHardDrop(runState, setRunState, paused, fixedRandom);
  return { runState, setRunState, ...controls };
}

describe('useBlocksHardDrop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('steps the falling piece down one row at a time toward the landing row', () => {
    const initial = stateAtSpawn();
    const distance = computeHardDropDistance(initial.board, initial.blocks, initial.position);
    const { result } = renderHook(() => useHarness(initial, false));

    act(() => result.current.triggerHardDrop());
    expect(result.current.dropping).toBe(true);
    expect(result.current.runState.position.y).toBe(initial.position.y);

    // Round up to guarantee the tick fires without letting a second one slip
    // in - computeFastFallStepMs can return a fractional per-row interval.
    const stepMs = Math.ceil(computeFastFallStepMs(distance));
    act(() => { vi.advanceTimersByTime(stepMs); });
    expect(result.current.runState.position.y).toBe(initial.position.y + 1);
    expect(result.current.dropping).toBe(true);

    act(() => { vi.advanceTimersByTime(stepMs); });
    expect(result.current.runState.position.y).toBe(initial.position.y + 2);
  });

  it('locks exactly once, one tick after reaching the landing row', () => {
    const initial = stateAtSpawn();
    const distance = computeHardDropDistance(initial.board, initial.blocks, initial.position);
    const { result } = renderHook(() => useHarness(initial, false));

    act(() => result.current.triggerHardDrop());
    // distance row-steps plus one settle tick before the lock, generously overshot.
    const overshootMs = computeFastFallStepMs(distance) * (distance + 1) + 1000;
    act(() => { vi.advanceTimersByTime(overshootMs); });

    expect(result.current.dropping).toBe(false);
    // The yellow O piece locks and respawns at SPAWN_POSITION; the board now
    // holds its placed cells instead of an empty board.
    expect(result.current.runState.position).toEqual(SPAWN_POSITION);
    expect(result.current.runState.board).not.toBe(initial.board);
    expect(result.current.runState.blocks).not.toBe(initial.blocks);

    // Advancing well past completion fires no further lock (no interval left running).
    const boardAfterLock = result.current.runState.board;
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(result.current.runState.board).toBe(boardAfterLock);
  });

  it('a one-row drop still visibly moves before it locks, not a stall-then-teleport', () => {
    const board = createEmptyBoard();
    for (let x = 0; x < BOARD_WIDTH; x++) board[BOARD_HEIGHT - 1][x] = 'red';
    const oneRowAway: BlocksRunState = {
      board,
      blocks: SHAPES.yellow,
      nextBlocks: SHAPES.cyan,
      position: { x: 0, y: BOARD_HEIGHT - 4 },
      score: 0,
      combo: 0,
      gameOver: false,
      lastClearedRowIndices: [],
    };
    const distance = computeHardDropDistance(oneRowAway.board, oneRowAway.blocks, oneRowAway.position);
    expect(distance).toBe(1);
    const { result } = renderHook(() => useHarness(oneRowAway, false));

    act(() => result.current.triggerHardDrop());
    const stepMs = Math.ceil(computeFastFallStepMs(distance));

    act(() => { vi.advanceTimersByTime(stepMs); });
    // First tick renders the piece one row down, still unlocked.
    expect(result.current.runState.position.y).toBe(oneRowAway.position.y + 1);
    expect(result.current.runState.board).toBe(oneRowAway.board);
    expect(result.current.dropping).toBe(true);

    act(() => { vi.advanceTimersByTime(stepMs); });
    // Second tick locks it.
    expect(result.current.dropping).toBe(false);
    expect(result.current.runState.board).not.toBe(oneRowAway.board);
  });

  it('ignores a re-entrant trigger while a drop is already animating', () => {
    const initial = stateAtSpawn();
    const distance = computeHardDropDistance(initial.board, initial.blocks, initial.position);
    const { result } = renderHook(() => useHarness(initial, false));

    act(() => result.current.triggerHardDrop());
    const stepMs = Math.ceil(computeFastFallStepMs(distance));
    act(() => { vi.advanceTimersByTime(stepMs); });
    const midDropPosition = result.current.runState.position;

    // A second trigger mid-animation must not restart or double the drop.
    act(() => result.current.triggerHardDrop());
    expect(result.current.runState.position).toEqual(midDropPosition);
  });

  it('freezes ticks while paused and resumes without skipping ahead once unpaused', () => {
    const initial = stateAtSpawn();
    const distance = computeHardDropDistance(initial.board, initial.blocks, initial.position);
    const { result, rerender } = renderHook(
      ({ paused }) => useHarness(initial, paused),
      { initialProps: { paused: false } },
    );

    act(() => result.current.triggerHardDrop());
    const stepMs = Math.ceil(computeFastFallStepMs(distance));
    act(() => { vi.advanceTimersByTime(stepMs); });
    const positionBeforePause = result.current.runState.position;
    expect(positionBeforePause.y).toBe(initial.position.y + 1);

    rerender({ paused: true });
    // Several ticks' worth of wall time passes while paused; none should land.
    act(() => { vi.advanceTimersByTime(stepMs * 5); });
    expect(result.current.runState.position).toEqual(positionBeforePause);
    expect(result.current.dropping).toBe(true);

    rerender({ paused: false });
    act(() => { vi.advanceTimersByTime(stepMs); });
    expect(result.current.runState.position.y).toBe(initial.position.y + 2);
  });

  it('locks instantly with no interval when the piece is already resting', () => {
    const board = createEmptyBoard();
    for (let x = 0; x < BOARD_WIDTH; x++) board[BOARD_HEIGHT - 1][x] = 'red';
    const resting: BlocksRunState = {
      board,
      blocks: SHAPES.yellow,
      nextBlocks: SHAPES.cyan,
      position: { x: 0, y: BOARD_HEIGHT - 3 },
      score: 0,
      combo: 0,
      gameOver: false,
      lastClearedRowIndices: [],
    };
    expect(computeHardDropDistance(resting.board, resting.blocks, resting.position)).toBe(0);
    const { result } = renderHook(() => useHarness(resting, false));

    act(() => result.current.triggerHardDrop());
    expect(result.current.dropping).toBe(false);
    expect(result.current.runState.board).not.toBe(resting.board);
  });

  // The drag gesture registers its pointermove/pointerup listeners once, at
  // pointerdown, so they call the trigger captured by THAT render. Gravity
  // ticks landing during the drag used to leave the trigger's distance a row
  // too long per tick, walking the piece into the stack - where the lock
  // overwrote the cells it had landed on.
  it('lands on the stack, not through it, when triggered from a pre-gravity-tick closure', () => {
    const board = createEmptyBoard();
    // Two nubs on the floor for a flat I piece to come to rest on.
    board[BOARD_HEIGHT - 1][0] = 'red';
    board[BOARD_HEIGHT - 1][1] = 'red';
    const initial: BlocksRunState = {
      board,
      blocks: SHAPES.cyan,
      nextBlocks: SHAPES.yellow,
      position: { x: 0, y: 0 },
      score: 0,
      combo: 0,
      gameOver: false,
      lastClearedRowIndices: [],
    };
    const { result } = renderHook(() => useHarness(initial, false));
    const staleTrigger = result.current.triggerHardDrop;

    // A gravity tick lands between pointerdown and the drag crossing its
    // drop threshold.
    act(() => { result.current.setRunState(prev => stepBlocks(prev, fixedRandom)); });
    expect(result.current.runState.position.y).toBe(1);

    act(() => { staleTrigger(); });
    act(() => { vi.advanceTimersByTime(10_000); });

    expect(result.current.runState.board[BOARD_HEIGHT - 1][0]).toBe('red');
    expect(result.current.runState.board[BOARD_HEIGHT - 1][1]).toBe('red');
    // The I piece's own row sits directly on top of the nubs.
    expect(result.current.runState.board[BOARD_HEIGHT - 2].slice(0, 4))
      .toEqual(['cyan', 'cyan', 'cyan', 'cyan']);
  });
});
