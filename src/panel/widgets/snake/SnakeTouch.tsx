import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { Button } from '../../../components/common/Button/Button';
import { GameOverScreen } from '../games-shared/GameOverScreen';
import { RotatePrompt } from '../games-shared/RotatePrompt';
import { useGameOrientation } from '../games-shared/useGameOrientation';
import { useGameScoreSubmission } from '../games-shared/useGameScoreSubmission';
import { recordBestScore } from '../games-shared/gameBestScore';
import { formatGameDuration } from '../games-shared/formatGameDuration';
import { SnakeBoard } from './SnakeBoard';
import {
  changeDirection,
  createInitialState,
  tick,
  type Direction,
  type SnakeState,
} from './snakeLogic';
import { advanceSnakeInput, createSnakeInputState, queueDirection, type SnakeInputState } from './snakeInput';
import type { WidgetProps } from '../types';
import type { GameType } from '../../../types/games';
import styles from './SnakeTouch.module.scss';

type Difficulty = 'easy' | 'medium' | 'hard';
type Phase = 'select' | 'playing' | 'gameover';

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
const DIFFICULTY_TICK_MS: Record<Difficulty, number> = { easy: 190, medium: 140, hard: 90 };
const DIFFICULTY_GAME_TYPE: Record<Difficulty, GameType> = {
  easy: 'snake-easy',
  medium: 'snake-medium',
  hard: 'snake-hard',
};
const SWIPE_THRESHOLD = 20;
const ARROW_KEY_DIRECTION: Record<string, Direction> = {
  ArrowUp: 'UP',
  ArrowDown: 'DOWN',
  ArrowLeft: 'LEFT',
  ArrowRight: 'RIGHT',
};

export function SnakeTouch({ immersiveGrid }: WidgetProps) {
  const { t } = useTranslation();
  const orientation = useGameOrientation(immersiveGrid);
  const [phase, setPhase] = useState<Phase>('select');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [state, setState] = useState<SnakeState>(() => createInitialState());
  const [elapsed, setElapsed] = useState(0);

  const inputRef = useRef<SnakeInputState>(createSnakeInputState('RIGHT'));
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [startTime, setStartTime] = useState(() => Date.now());
  const submittedRef = useRef(false);

  const paused = phase === 'playing' && orientation === 'landscape';
  const gameType = DIFFICULTY_GAME_TYPE[difficulty];
  const submission = useGameScoreSubmission(gameType);
  const { submit } = submission;

  const handleDirection = useCallback((dir: Direction) => {
    if (phase !== 'playing' || state.gameOver || paused) return;
    inputRef.current = queueDirection(inputRef.current, dir);
  }, [phase, state.gameOver, paused]);

  // stopPropagation keeps this from also being applied by the window-level
  // listener below when the board itself has focus.
  const handleBoardKeyDown = useCallback((e: React.KeyboardEvent) => {
    const dir = ARROW_KEY_DIRECTION[e.key];
    if (dir) { e.preventDefault(); e.stopPropagation(); handleDirection(dir); }
  }, [handleDirection]);

  // Keyboard works from anywhere while playing, not only when the board has
  // focus - useful on a kiosk with an attached test keyboard.
  useEffect(() => {
    if (phase !== 'playing') return;
    const onKey = (e: KeyboardEvent) => {
      const dir = ARROW_KEY_DIRECTION[e.key];
      if (dir) { e.preventDefault(); handleDirection(dir); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, handleDirection]);

  // Tick loop: advances the queued direction input and steps snakeLogic.
  useEffect(() => {
    if (phase !== 'playing' || state.gameOver || paused) return;
    const tickMs = DIFFICULTY_TICK_MS[difficulty];
    const interval = setInterval(() => {
      setState(prev => {
        inputRef.current = advanceSnakeInput(inputRef.current);
        const withDir = changeDirection(prev, inputRef.current.pendingDirection);
        return tick(withDir);
      });
    }, tickMs);
    return () => clearInterval(interval);
  }, [phase, state.gameOver, paused, difficulty]);

  // Wall-clock elapsed time since the run started. Not pause-aware: a mid-run
  // orientation flip freezes gameplay (the tick loop above) but keeps this
  // clock running, matching the ported Nexus 2 timer's simplicity.
  useEffect(() => {
    if (phase !== 'playing' || state.gameOver) return;
    const timer = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, state.gameOver, startTime]);

  useEffect(() => {
    if (state.gameOver && phase === 'playing') {
      setElapsed(Date.now() - startTime);
      setPhase('gameover');
    }
  }, [state.gameOver, phase, startTime]);

  useEffect(() => {
    if (phase !== 'gameover') { submittedRef.current = false; return; }
    if (submittedRef.current) return;
    submittedRef.current = true;
    recordBestScore(gameType, state.score);
    void submit(state.score, Date.now() - startTime);
  }, [phase, gameType, state.score, submit, startTime]);

  const resolveSwipe = useCallback((startX: number, startY: number, endX: number, endY: number) => {
    const dx = endX - startX;
    const dy = endY - startY;
    if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return;
    if (Math.abs(dx) > Math.abs(dy)) handleDirection(dx > 0 ? 'RIGHT' : 'LEFT');
    else handleDirection(dy > 0 ? 'DOWN' : 'UP');
  }, [handleDirection]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);
  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.changedTouches[0];
    resolveSwipe(touchStartRef.current.x, touchStartRef.current.y, touch.clientX, touch.clientY);
    touchStartRef.current = null;
  }, [resolveSwipe]);
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    touchStartRef.current = { x: e.clientX, y: e.clientY };
  }, []);
  const onMouseUp = useCallback((e: React.MouseEvent) => {
    if (!touchStartRef.current) return;
    resolveSwipe(touchStartRef.current.x, touchStartRef.current.y, e.clientX, e.clientY);
    touchStartRef.current = null;
  }, [resolveSwipe]);
  const onMouseLeave = useCallback(() => { touchStartRef.current = null; }, []);

  const handleDifficultyPick = useCallback((d: Difficulty) => {
    const newState = createInitialState();
    inputRef.current = createSnakeInputState(newState.direction);
    setStartTime(Date.now());
    setElapsed(0);
    setDifficulty(d);
    setState(newState);
    setPhase('playing');
  }, []);

  const handleRestart = useCallback(() => setPhase('select'), []);

  if (phase === 'select') {
    return (
      <div className={styles.root}>
        <div className={styles.selectPanel}>
          <div className={styles.title}>{t('panel.widget.snake')}</div>
          <div className={styles.subtitle}>{t('panel.widget.snake.selectDifficulty')}</div>
          <div className={styles.difficulties}>
            {DIFFICULTIES.map(d => (
              <Button key={d} tone="accent" size="lg" onClick={() => handleDifficultyPick(d)}>
                {t(`panel.widget.snake.difficulty.${d}`)}
              </Button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'gameover') {
    return (
      <div className={styles.root}>
        <GameOverScreen
          labels={{
            title: t('panel.widget.snake.gameOver.title'),
            scoreLabel: t('panel.widget.snake.gameOver.score'),
            timeLabel: t('panel.widget.snake.gameOver.time'),
            leaderboardTitle: t('panel.widget.snake.gameOver.leaderboard'),
            anonymous: t('panel.widget.snake.gameOver.anonymous'),
            loading: t('panel.widget.snake.gameOver.loading'),
            error: t('panel.widget.snake.gameOver.error'),
            empty: t('panel.widget.snake.gameOver.empty'),
            playAgain: t('panel.widget.snake.gameOver.playAgain'),
            yourEntry: t('panel.widget.snake.gameOver.yourEntry'),
          }}
          score={state.score}
          elapsedMs={elapsed}
          status={submission.status}
          entries={submission.entries}
          selfRank={submission.selfRank}
          onPlayAgain={handleRestart}
        />
      </div>
    );
  }

  return (
    <div className={styles.root} data-panel-no-sheet-swipe="true">
      <div className={styles.hud}>
        <span className={styles.hudScore}>{t('panel.widget.snake.scoreValue', { score: state.score })}</span>
        <span className={styles.hudTime}>{formatGameDuration(elapsed)}</span>
      </div>
      <SnakeBoard
        state={state}
        boardLabel={t('panel.widget.snake.boardLabel')}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        onKeyDown={handleBoardKeyDown}
      />
      <div className={styles.dpad}>
        <Button
          className={styles.dpadUp}
          tone="neutral"
          icon={<ChevronUp size={22} />}
          aria-label={t('panel.widget.snake.dpad.up')}
          onClick={() => handleDirection('UP')}
        />
        <Button
          className={styles.dpadLeft}
          tone="neutral"
          icon={<ChevronLeft size={22} />}
          aria-label={t('panel.widget.snake.dpad.left')}
          onClick={() => handleDirection('LEFT')}
        />
        <Button
          className={styles.dpadRight}
          tone="neutral"
          icon={<ChevronRight size={22} />}
          aria-label={t('panel.widget.snake.dpad.right')}
          onClick={() => handleDirection('RIGHT')}
        />
        <Button
          className={styles.dpadDown}
          tone="neutral"
          icon={<ChevronDown size={22} />}
          aria-label={t('panel.widget.snake.dpad.down')}
          onClick={() => handleDirection('DOWN')}
        />
      </div>
      {paused && (
        <div className={styles.pauseOverlay}>
          <RotatePrompt message={t('panel.widget.snake.rotatePrompt')} />
        </div>
      )}
    </div>
  );
}
