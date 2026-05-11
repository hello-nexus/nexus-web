import { Play, Pause, RotateCcw } from 'lucide-react';
import { useStopwatch } from '../common/useStopwatch';
import type { WidgetProps } from '../types';
import { formatStopwatchElapsed } from './formatStopwatchElapsed';
import styles from './StopwatchWidget.module.scss';

export function StopwatchWidget({ widget }: WidgetProps) {
  const { elapsed, isRunning, start, stop, reset } = useStopwatch();

  const isWide = widget.size === '4x2' || widget.size === '4x4';
  const display = formatStopwatchElapsed(elapsed);
  const hasHours = display.h !== null;

  const handleToggle = () => {
    if (isRunning) {
      stop();
    } else {
      start();
    }
  };

  return (
    <div className={`${styles.container} ${isWide ? styles.wide : styles.compact}`}>
      <div className={styles.display} data-hours={hasHours ? 'true' : undefined}>
        <span className={styles.digits}>
          {hasHours && `${display.h}:`}
          {display.m}:{display.s}
        </span>
        <span className={styles.fraction}>.{display.hundredths}</span>
      </div>
      <div className={styles.controls}>
        <button
          type="button"
          className={`panel-chip ${styles.controlBtn}`}
          onClick={() => reset()}
          disabled={elapsed === 0 && !isRunning}
          aria-label="Reset stopwatch"
          title="Reset"
        >
          <RotateCcw size={16} />
        </button>
        <button
          type="button"
          className={`panel-chip ${styles.playBtn}`}
          onClick={handleToggle}
          data-active={isRunning ? 'true' : undefined}
          aria-label={isRunning ? 'Pause stopwatch' : 'Start stopwatch'}
          title={isRunning ? 'Pause' : 'Start'}
        >
          {isRunning ? <Pause size={16} /> : <Play size={16} />}
          {isWide && <span>{isRunning ? 'Pause' : 'Start'}</span>}
        </button>
      </div>
    </div>
  );
}

export default StopwatchWidget;
