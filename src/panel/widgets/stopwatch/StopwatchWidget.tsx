import { Play, Pause, RotateCcw } from 'lucide-react';
import { HoverTooltip } from '../../../components/common/HoverTooltip/HoverTooltip';
import { useTranslation } from '../../../lib/i18n';
import { useFitWidth } from '../common/useFitWidth';
import { StableDigits } from '../common/StableDigits';
import { useStopwatch } from '../common/useStopwatch';
import type { WidgetProps } from '../types';
import { formatStopwatchElapsed } from './formatStopwatchElapsed';
import styles from './StopwatchWidget.module.scss';

export function StopwatchWidget({ widget }: WidgetProps) {
  const { t } = useTranslation();
  const { elapsed, isRunning, start, stop, reset } = useStopwatch();
  const { boxRef, contentRef, scale } = useFitWidth();

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
      <div ref={boxRef} className={styles.fitBox}>
        <div
          ref={contentRef}
          className={styles.display}
          data-hours={hasHours ? 'true' : undefined}
          style={{ transform: `scale(${scale})` }}
        >
          <span className={styles.digits}>
            <StableDigits text={`${hasHours ? `${display.h}:` : ''}${display.m}:${display.s}`} />
          </span>
          <span className={styles.fraction}>
            <StableDigits text={`.${display.hundredths}`} />
          </span>
        </div>
      </div>
      <div className={styles.controls}>
        <HoverTooltip body={t('panel.stopwatch.reset')} side="top">
          <button
            type="button"
            className={`panel-chip ${styles.controlBtn}`}
            onClick={() => reset()}
            disabled={elapsed === 0 && !isRunning}
            aria-label={t('panel.stopwatch.reset')}
          >
            <RotateCcw size={16} />
          </button>
        </HoverTooltip>
        <HoverTooltip body={isRunning ? t('panel.stopwatch.pause') : t('panel.stopwatch.start')} side="top">
          <button
            type="button"
            className={`panel-chip ${styles.playBtn}`}
            onClick={handleToggle}
            data-active="true"
            aria-label={isRunning ? t('panel.stopwatch.pause') : t('panel.stopwatch.start')}
          >
            {isRunning ? <Pause size={16} /> : <Play size={16} />}
            {isWide && <span>{isRunning ? t('panel.stopwatch.pause') : t('panel.stopwatch.start')}</span>}
          </button>
        </HoverTooltip>
      </div>
    </div>
  );
}

export default StopwatchWidget;
