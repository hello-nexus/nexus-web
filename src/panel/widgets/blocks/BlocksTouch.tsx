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
import { BlocksNextPreview } from './BlocksNextPreview';
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  comboJuiceTier,
  computeDropSpeedMs,
  computeLandingPreview,
  computeLevel,
  createInitialBlocksState,
  stepBlocks,
  tryMove,
  tryRotate,
  type BlockCell,
  type BlocksRunState,
} from './blocksLogic';
import { beginGesture, updateGesture } from './blocksGesture';
import { useBlocksHardDrop } from './useBlocksHardDrop';
import type { WidgetProps } from '../types';
import styles from './BlocksTouch.module.scss';

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
  const { dropping, triggerHardDrop } = useBlocksHardDrop(runState, setRunState, paused);

  useEffect(() => {
    if (runState.gameOver || paused || dropping) return;
    const tickMs = computeDropSpeedMs(runState.score);
    const interval = setInterval(() => {
      setRunState(prev => stepBlocks(prev));
    }, tickMs);
    return () => clearInterval(interval);
  }, [runState.gameOver, paused, dropping, runState.score]);

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
    if (runState.gameOver || paused || dropping) return;
    setRunState(prev => ({ ...prev, blocks: tryRotate(prev.board, prev.blocks, prev.position) }));
  }, [runState.gameOver, paused, dropping]);

  const handleMove = useCallback((dx: number) => {
    if (runState.gameOver || paused || dropping) return;
    setRunState(prev => ({ ...prev, position: tryMove(prev.board, prev.blocks, prev.position, dx) }));
  }, [runState.gameOver, paused, dropping]);

  const handleHardDrop = useCallback(() => {
    if (runState.gameOver || paused || dropping) return;
    triggerHardDrop();
  }, [runState.gameOver, paused, dropping, triggerHardDrop]);

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
    if (runState.gameOver || paused || dropping) return;
    let gesture = beginGesture(e.clientX, e.clientY);

    const move = (ev: PointerEvent) => {
      const result = updateGesture(gesture, ev.clientX, ev.clientY, cellSize);
      gesture = result.gesture;
      if (result.move !== 0) handleMove(result.move);
      if (result.drop) {
        handleHardDrop();
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!gesture.dragged) handleRotate();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [runState.gameOver, paused, dropping, cellSize, handleMove, handleHardDrop, handleRotate]);

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
  // Suppressed while the piece is already animating down: it is its own
  // feedback, and a trail racing the fast-fall would read as noise.
  const landingPreview = dropping
    ? null
    : computeLandingPreview(runState.board, runState.blocks, runState.position);
  // Scales with the board's own cell size so the swatch tracks the board
  // across viewports instead of a fixed size; floored so it never vanishes
  // before cellSize is measured.
  const previewCellPx = Math.max(8, Math.round(cellSize * 0.4));

  return (
    <div className={styles.root}>
      <div className={styles.topRow}>
        <GameHud
          className={styles.hud}
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
        <BlocksNextPreview blocks={runState.nextBlocks} label={t('panel.widget.blocks.next')} cellPx={previewCellPx} />
      </div>
      <BlocksBoard
        board={runState.board}
        fallingBlocks={fallingBlocks}
        landingPreview={landingPreview}
        comboTier={comboJuiceTier(runState.combo)}
        boardLabel={t('panel.widget.blocks.boardLabel')}
        cellSize={cellSize}
        boardBoxRef={boardBoxRef}
        boardWidthCells={BOARD_WIDTH}
        boardHeightCells={BOARD_HEIGHT}
        score={runState.score}
        clearedRowIndices={runState.lastClearedRowIndices}
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
