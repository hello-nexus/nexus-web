import { useState, useCallback } from 'react';
import { Play, Pause, Square, RotateCcw, ChevronUp, ChevronDown } from 'lucide-react';
import { IconLabelButton } from '../../../components/common/IconLabelButton/IconLabelButton';
import { useCountdown } from '../common/useCountdown';
import { useFitWidth } from '../common/useFitWidth';
import { StableDigits } from '../common/StableDigits';
import { useTranslation } from '../../../lib/i18n';
import type { WidgetProps } from '../types';
import styles from './TimerWidget.module.scss';

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatMs(ms: number): { h: string; m: string; s: string } {
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return { h: pad(h), m: pad(m), s: pad(s) };
}

type Phase = 'setup' | 'running';

export function TimerWidget({ widget }: WidgetProps) {
  const { t } = useTranslation();
  const { ms, isRunning, isComplete, start, pause, resume, stop, reset } = useCountdown();
  const { boxRef, contentRef, scale } = useFitWidth();
  const [phase, setPhase] = useState<Phase>('setup');
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(5);
  const [seconds, setSeconds] = useState(0);

  const isWide = widget.size === '4x2' || widget.size === '4x4';
  const canStart = hours > 0 || minutes > 0 || seconds > 0;

  const handleStart = useCallback(() => {
    if (!canStart) return;
    start(hours, minutes, seconds);
    setPhase('running');
  }, [canStart, hours, minutes, seconds, start]);

  const handleStop = useCallback(() => {
    stop();
    setPhase('setup');
  }, [stop]);

  const handleReset = useCallback(() => {
    reset();
    setPhase('setup');
  }, [reset]);

  const handlePauseResume = useCallback(() => {
    if (isRunning) {
      pause();
    } else {
      resume();
    }
  }, [isRunning, pause, resume]);

  if (phase === 'setup') {
    return (
      <div className={`${styles.container} ${isWide ? styles.wide : styles.compact}`}>
        <div className={styles.pickers}>
          <Stepper label="H" value={hours} min={0} max={23} onChange={setHours} t={t} />
          <span className={styles.separator}>:</span>
          <Stepper label="M" value={minutes} min={0} max={59} onChange={setMinutes} t={t} />
          <span className={styles.separator}>:</span>
          <Stepper label="S" value={seconds} min={0} max={59} onChange={setSeconds} t={t} />
        </div>
        <IconLabelButton
          variant="bare"
          className={styles.startBtn}
          icon={<Play size={16} fill="currentColor" stroke="none" />}
          title={t('panel.stopwatch.start')}
          ariaLabel={t('panel.stopwatch.start')}
          disabled={!canStart}
          onPress={handleStart}
        />
      </div>
    );
  }

  // Running / paused / complete phase
  const display = formatMs(ms);
  const showHours = display.h !== '00';

  return (
    <div
      className={`${styles.container} ${isWide ? styles.wide : styles.compact}`}
      data-complete={isComplete ? 'true' : undefined}
    >
      <div ref={boxRef} className={styles.fitBox}>
        <div ref={contentRef} className={styles.countdown} style={{ transform: `scale(${scale})` }}>
          <StableDigits text={`${showHours ? `${display.h}:` : ''}${display.m}:${display.s}`} />
        </div>
      </div>
      <div className={styles.controls}>
        {!isComplete && (
          <IconLabelButton
            variant="bare"
            className={styles.controlBtn}
            icon={isRunning
              ? <Pause size={16} fill="currentColor" stroke="none" />
              : <Play size={16} fill="currentColor" stroke="none" />}
            title={isRunning ? t('panel.stopwatch.pause') : t('panel.widget.timer.resume')}
            ariaLabel={isRunning ? t('panel.stopwatch.pause') : t('panel.widget.timer.resume')}
            onPress={handlePauseResume}
          />
        )}
        {!isComplete && (
          <IconLabelButton
            variant="bare"
            className={styles.controlBtn}
            icon={<Square size={14} fill="currentColor" stroke="none" />}
            title={t('panel.widget.timer.stop')}
            ariaLabel={t('panel.widget.timer.stop')}
            onPress={handleStop}
          />
        )}
        {isComplete && (
          <IconLabelButton
            variant="bare"
            className={styles.resetBtn}
            icon={<RotateCcw size={16} />}
            title={t('panel.stopwatch.reset')}
            ariaLabel={t('panel.stopwatch.reset')}
            onPress={handleReset}
          />
        )}
      </div>
    </div>
  );
}

// Stepper sub-component for time value selection
interface StepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

function Stepper({ label, value, min, max, onChange, t }: StepperProps) {
  const inc = () => onChange(value >= max ? min : value + 1);
  const dec = () => onChange(value <= min ? max : value - 1);

  return (
    <div className={styles.stepper}>
      <IconLabelButton
        variant="bare"
        className={styles.stepBtn}
        icon={<ChevronUp size={16} />}
        ariaLabel={t('panel.widget.timer.increase', { unit: label })}
        onPress={inc}
      />
      <span className={styles.stepValue}>{pad(value)}</span>
      <IconLabelButton
        variant="bare"
        className={styles.stepBtn}
        icon={<ChevronDown size={16} />}
        ariaLabel={t('panel.widget.timer.decrease', { unit: label })}
        onPress={dec}
      />
    </div>
  );
}

export default TimerWidget;
