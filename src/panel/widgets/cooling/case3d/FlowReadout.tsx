import { useEffect, useState } from 'react';
import styles from './FlowReadout.module.scss';

interface FlowDebug {
  debugInfo?: () => { variant: string; tier: number; drawn: number; alpha?: number; frameMs: number; solverMsPerStep: number };
}

/** Dev tools only: the numbers the airflow layer is drawing with, read once a second, so a live window shows its real tier, particle count and frame time. */
export function FlowReadout({ canvas }: { canvas: HTMLCanvasElement | null }) {
  const [text, setText] = useState('');
  useEffect(() => {
    const timer = setInterval(() => {
      const info = (globalThis as { __nexusFlowLayer?: FlowDebug }).__nexusFlowLayer?.debugInfo?.();
      if (!info || !canvas) return;
      setText(`${info.variant} t${info.tier} n${info.drawn} a${info.alpha} ${canvas.clientWidth}x${canvas.clientHeight}@${window.devicePixelRatio} ${info.frameMs.toFixed(1)}ms s${info.solverMsPerStep.toFixed(2)}`);
    }, 1000);
    return () => clearInterval(timer);
  }, [canvas]);
  return text ? <div className={styles.readout} aria-hidden="true">{text}</div> : null;
}
