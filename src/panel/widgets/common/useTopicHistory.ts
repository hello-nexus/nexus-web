import { useRef, useState } from 'react';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';

/**
 * Rolling history buffer driven by a multiplex topic's broadcast cadence.
 * Each received frame of <code>topic</code> extends the buffer by one
 * sample (the current <code>value</code>), with no value-identity dedup —
 * a stretch of identical readings still advances the buffer once per
 * backend broadcast.
 *
 * Use this for charts whose source is a single topic (cpu, gpu,
 * cooling-realtime, etc.) so the chart's tick rate matches the wire and
 * doesn't depend on React's primitive-prop equality or on a
 * cross-topic frameTick wrapper.
 */
export function useTopicHistory(topic: string, value: number, samples: number): number[] {
  // Write-only-in-render mutation: the ref is read inside the post-commit
  // topic callback, never inside render, so the stale-render value can
  // never be observed by a downstream consumer.
  const valueRef = useRef(value);
  valueRef.current = value;
  const bufRef = useRef<number[]>([]);
  const [, force] = useState(0);
  useTopicCallback(topic, true, () => {
    const v = valueRef.current;
    const prev = bufRef.current;
    bufRef.current = prev.length >= samples
      ? [...prev.slice(-samples + 1), v]
      : [...prev, v];
    force(n => n + 1);
  });
  return bufRef.current;
}
