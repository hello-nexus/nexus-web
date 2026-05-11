import { useState, useCallback } from 'react';
import { Play, Pause, Square, RotateCcw } from 'lucide-react';
import { useCountdown } from '../common/useCountdown';
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
  const { ms, isRunning, isComplete, start, pause, resume, stop, reset } = useCountdown();
  const [phase, setPhase] = useState<Phase>('setup');
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(5);
  const [seconds, setSeconds] = useState(0);

  const isWide = widget.size === '4x2' || widget.size === '4x4';

  const handleStart = useCallback(() => {
    if (hours === 0 && minutes === 0 && seconds === 0) return;
    start(hours, minutes, seconds);
    setPhase('running');
  }, [hours, minutes, seconds, start]);

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
          <Stepper label="H" value={hours} min={0} max={23} onChange={setHours} />
          <span className={styles.separator}>:</span>
          <Stepper label="M" value={minutes} min={0} max={59} onChange={setMinutes} />
          <span className={styles.separator}>:</span>
          <Stepper label="S" value={seconds} min={0} max={59} onChange={setSeconds} />
        </div>
        <button
          type="button"
          className={`panel-chip ${styles.startBtn}`}
          onClick={handleStart}
          disabled={hours === 0 && minutes === 0 && seconds === 0}
        >
          <Play size={16} />
          {isWide && <span>Start</span>}
        </button>
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
      <div className={styles.countdown}>
        {showHours && <>{display.h}:</>}
        {display.m}:{display.s}
      </div>
      <div className={styles.controls}>
        {!isComplete && (
          <button
            type="button"
            className={`panel-chip ${styles.controlBtn}`}
            onClick={handlePauseResume}
          >
            {isRunning ? <Pause size={16} /> : <Play size={16} />}
          </button>
        )}
        {!isComplete && (
          <button
            type="button"
            className={`panel-chip ${styles.controlBtn}`}
            onClick={handleStop}
          >
            <Square size={14} />
          </button>
        )}
        {isComplete && (
          <button
            type="button"
            className={`panel-chip ${styles.resetBtn}`}
            onClick={handleReset}
          >
            <RotateCcw size={16} />
            {isWide && <span>Reset</span>}
          </button>
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
}

function Stepper({ label, value, min, max, onChange }: StepperProps) {
  const inc = () => onChange(value >= max ? min : value + 1);
  const dec = () => onChange(value <= min ? max : value - 1);

  return (
    <div className={styles.stepper}>
      <button type="button" className={styles.stepBtn} onClick={inc} aria-label={`Increase ${label}`}>
        &#x25B2;
      </button>
      <span className={styles.stepValue}>{pad(value)}</span>
      <button type="button" className={styles.stepBtn} onClick={dec} aria-label={`Decrease ${label}`}>
        &#x25BC;
      </button>
    </div>
  );
}

export default TimerWidget;
