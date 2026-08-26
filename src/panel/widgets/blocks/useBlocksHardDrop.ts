import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { computeFastFallStepMs, computeHardDropDistance, hardDrop, hasCollision, type BlocksRunState } from './blocksLogic';

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export interface BlocksHardDropControls {
  // True for the duration of the fast-fall animation; callers gate rotate,
  // move, and the gravity tick on this so no input lands mid-drop.
  dropping: boolean;
  triggerHardDrop: () => void;
}

/**
 * Drives the hard-drop animation. The landing row is computed at trigger
 * time (identical to the instant drop), then the falling piece steps down
 * one row per interval tick until it reaches that row - one extra tick then
 * locks it through the same `hardDrop` path the instant version uses, so
 * even a one-row drop visibly moves before it merges into the board. Line
 * clears and game-over evaluate only once, after the piece lands. Reduced
 * motion, and a piece that is already resting, skip straight to the instant
 * drop with no interval at all. A mid-drop pause (the orientation flip that
 * shows RotatePrompt) freezes ticks in place rather than advancing blind,
 * matching every other mutator in BlocksTouch.
 *
 * Both the trigger distance and each step read live state, never the render
 * closure: the drag gesture calls this through listeners captured at
 * pointerdown, so gravity ticks during the drag would otherwise make the
 * distance one row too many per tick and walk the piece INTO the stack,
 * where the lock overwrites the cells it landed on.
 */
export function useBlocksHardDrop(
  runState: BlocksRunState,
  setRunState: Dispatch<SetStateAction<BlocksRunState>>,
  paused: boolean,
  randomFn: () => number = Math.random,
): BlocksHardDropControls {
  const [dropping, setDropping] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pausedRef = useRef(paused);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  const runStateRef = useRef(runState);
  useEffect(() => { runStateRef.current = runState; }, [runState]);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const triggerHardDrop = useCallback(() => {
    if (timerRef.current) return;

    const live = runStateRef.current;
    const distance = computeHardDropDistance(live.board, live.blocks, live.position);
    if (distance <= 0 || prefersReducedMotion()) {
      setRunState(prev => hardDrop(prev, randomFn));
      return;
    }

    const stepMs = computeFastFallStepMs(distance);
    let stepped = 0;
    setDropping(true);
    timerRef.current = setInterval(() => {
      if (pausedRef.current) return;
      if (stepped < distance) {
        stepped += 1;
        // A step that would land on the stack (or the floor) holds instead:
        // the lock tick below then resolves the piece where it actually is.
        setRunState(prev => (hasCollision(prev.board, prev.blocks, prev.position, 0, 1)
          ? prev
          : { ...prev, position: { x: prev.position.x, y: prev.position.y + 1 } }));
        return;
      }
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      setRunState(prev => hardDrop(prev, randomFn));
      setDropping(false);
    }, stepMs);
  }, [setRunState, randomFn]);

  return { dropping, triggerHardDrop };
}
