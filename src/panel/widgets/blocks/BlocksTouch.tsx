import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { GameHud } from '../games-shared/GameHud';
import { GameOverScreen } from '../games-shared/GameOverScreen';
import { RotatePrompt } from '../games-shared/RotatePrompt';
import { useGameOrientation } from '../games-shared/useGameOrientation';
import { useGameScoreSubmission } from '../games-shared/useGameScoreSubmission';
import { useGameBoardScale } from '../games-shared/useGameBoardScale';
import { getBestScore, recordBestScore } from '../games-shared/gameBestScore';
import { BlocksBoard } from './BlocksBoard';
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  comboJuiceTier,
  computeDropSpeedMs,
  computeLevel,
  createInitialBlocksState,
  hardDrop,
  stepBlocks,
  tryMove,
  tryRotate,
  type BlockCell,
  type BlocksRunState,
} from './blocksLogic';
import type { WidgetProps } from '../types';
import styles from './BlocksTouch.module.scss';

// A drag must cross one cell's width before it moves the piece; a downward
// drag past 1.2 cells triggers the hard drop. Anything short of that (and no
// move/drop fired during the gesture) is a tap-to-rotate.
const MOVE_CELL_FRACTION = 1;
const DROP_CELL_FRACTION = 1.2;

export function BlocksTouch({ immersiveGrid }: WidgetProps) {
  const { t } = useTranslation();
  const orientation = useGameOrientation(immersiveGrid);
  const { boardBoxRef, cellSize } = useGameBoardScale(BOARD_WIDTH, BOARD_HEIGHT);
  const [runState, setRunState] = useState<BlocksRunState>(() => createInitialBlocksState());
  const [elapsed, setElapsed] = useState(0);
  const [isNewBest, setIsNewBest] = useState(false);

  const [startTime, setStartTime] = useState(() => Date.now());
  const submittedRef = useRef(false);

  const paused = !runState.gameOver && orientation === 'landscape';
  const gameType = 'block' as const;
  const submission = useGameScoreSubmission(gameType);
  const { submit } = submission;

  useEffect(() => {
    if (runState.gameOver || paused) return;
    const tickMs = computeDropSpeedMs(runState.score);
    const interval = setInterval(() => {
      setRunState(prev => stepBlocks(prev));
    }, tickMs);
    return () => clearInterval(interval);
  }, [runState.gameOver, paused, runState.score]);

  // Wall-clock elapsed time since the run started. Not pause-aware, same
  // simplification as SnakeTouch: a mid-run orientation flip freezes the drop
  // loop above but keeps this clock running.
  useEffect(() => {
    if (runState.gameOver) return;
    const timer = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 1000);
    return () => clearInterval(timer);
  }, [runState.gameOver, startTime]);

  useEffect(() => {
    if (runState.gameOver) {
      setElapsed(Date.now() - startTime);
    }
  }, [runState.gameOver, startTime]);

  useEffect(() => {
    if (!runState.gameOver) { submittedRef.current = false; return; }
    if (submittedRef.current) return;
    submittedRef.current = true;
    const previousBest = getBestScore(gameType);
    recordBestScore(gameType, runState.score);
    setIsNewBest(runState.score > 0 && runState.score > previousBest);
    void submit(runState.score, Date.now() - startTime);
  }, [runState.gameOver, runState.score, submit, startTime]);

  const handleRotate = useCallback(() => {
    if (runState.gameOver || paused) return;
    setRunState(prev => ({ ...prev, blocks: tryRotate(prev.board, prev.blocks, prev.position) }));
  }, [runState.gameOver, paused]);

  const handleMove = useCallback((dx: number) => {
    if (runState.gameOver || paused) return;
    setRunState(prev => ({ ...prev, position: tryMove(prev.board, prev.blocks, prev.position, dx) }));
  }, [runState.gameOver, paused]);

  const handleHardDrop = useCallback(() => {
    if (runState.gameOver || paused) return;
    setRunState(prev => hardDrop(prev));
  }, [runState.gameOver, paused]);

  const applyKey = useCallback((key: string) => {
    if (key === 'ArrowLeft') handleMove(-1);
    else if (key === 'ArrowRight') handleMove(1);
    else if (key === 'ArrowUp') handleRotate();
    else if (key === 'ArrowDown' || key === ' ') handleHardDrop();
  }, [handleMove, handleRotate, handleHardDrop]);

  // Own key handler on the focusable board (accessibility) AND a window-level
  // listener so keyboard works from anywhere while playing, mirroring
  // SnakeTouch. stopPropagation on the board's own handler keeps a keypress
  // while the board is focused from being applied twice.
  const handleBoardKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    applyKey(e.key);
  }, [applyKey]);

  useEffect(() => {
    if (runState.gameOver) return;
    const onKey = (e: KeyboardEvent) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) return;
      e.preventDefault();
      applyKey(e.key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [runState.gameOver, applyKey]);

  // Pointer Events (not parallel touch + mouse handlers): a WebView2/Chromium
  // kiosk still synthesizes a mousedown/mouseup pair after every touchend even
  // with touch-action: none, and a zero-movement synthetic pair would trip the
  // tap-to-rotate branch a second time. One pointerdown per physical gesture
  // avoids that outright, matching PaletteRing.tsx's drag pattern.
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (runState.gameOver || paused) return;
    const startY = e.clientY;
    let lastX = e.clientX;
    let moved = false;

    const move = (ev: PointerEvent) => {
      if (cellSize <= 0) return;
      const dx = ev.clientX - lastX;
      const dy = ev.clientY - startY;
      if (Math.abs(dx) > cellSize * MOVE_CELL_FRACTION) {
        handleMove(dx > 0 ? 1 : -1);
        lastX = ev.clientX;
        moved = true;
      }
      if (dy > cellSize * DROP_CELL_FRACTION) {
        handleHardDrop();
        moved = true;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!moved) handleRotate();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [runState.gameOver, paused, cellSize, handleMove, handleHardDrop, handleRotate]);

  const handleRestart = useCallback(() => {
    setRunState(createInitialBlocksState());
    setStartTime(Date.now());
    setElapsed(0);
    setIsNewBest(false);
  }, []);

  if (runState.gameOver) {
    return (
      <div className={styles.root}>
        <GameOverScreen
          labels={{
            title: t('panel.widget.blocks.gameOver.title'),
            scoreLabel: t('panel.widget.blocks.gameOver.score'),
            timeLabel: t('panel.widget.blocks.gameOver.time'),
            newBest: t('panel.widget.blocks.gameOver.newBest'),
            leaderboardTitle: t('panel.widget.blocks.gameOver.leaderboard'),
            back: t('panel.widget.blocks.gameOver.back'),
            anonymous: t('panel.widget.blocks.gameOver.anonymous'),
            loading: t('panel.widget.blocks.gameOver.loading'),
            error: t('panel.widget.blocks.gameOver.error'),
            empty: t('panel.widget.blocks.gameOver.empty'),
            playAgain: t('panel.widget.blocks.gameOver.playAgain'),
            yourEntry: t('panel.widget.blocks.gameOver.yourEntry'),
          }}
          score={runState.score}
          elapsedMs={elapsed}
          isNewBest={isNewBest}
          status={submission.status}
          entries={submission.entries}
          selfRank={submission.selfRank}
          onPlayAgain={handleRestart}
        />
      </div>
    );
  }

  const fallingBlocks: BlockCell[] = runState.blocks.map(block => ({
    x: block.x + runState.position.x,
    y: block.y + runState.position.y,
    color: block.color,
  }));

  return (
    <div className={styles.root} data-panel-no-sheet-swipe="true">
      <GameHud
        scoreText={t('panel.widget.blocks.scoreValue', { score: runState.score })}
        elapsedMs={elapsed}
        middle={
          <span className={styles.hudMiddle}>
            <span className={styles.hudChip}>{t('panel.widget.blocks.level', { level: computeLevel(runState.score) })}</span>
            {runState.combo > 1 && (
              <span className={`${styles.hudChip} ${styles.hudChipCombo}`}>
                {t('panel.widget.blocks.combo', { combo: runState.combo })}
              </span>
            )}
          </span>
        }
      />
      <BlocksBoard
        board={runState.board}
        fallingBlocks={fallingBlocks}
        comboTier={comboJuiceTier(runState.combo)}
        boardLabel={t('panel.widget.blocks.boardLabel')}
        cellSize={cellSize}
        boardBoxRef={boardBoxRef}
        boardWidthCells={BOARD_WIDTH}
        boardHeightCells={BOARD_HEIGHT}
        onPointerDown={handlePointerDown}
        onKeyDown={handleBoardKeyDown}
      />
      {paused && (
        <div className={styles.pauseOverlay}>
          <RotatePrompt message={t('panel.widget.blocks.rotatePrompt')} />
        </div>
      )}
    </div>
  );
}
