import { useEffect, useRef, useState } from 'react';
import { easeFlows, FLOW_EASE_STEP_MS } from '../lib/cooling/fanSpeed';

type Flow = Readonly<Record<string, number>>;

const sameKeys = (a: Flow, b: Flow) => Object.keys(a).length === Object.keys(b).length && Object.keys(b).every(k => k in a);

/**
 * The flows the solver sees: `target` approached in steps, so a fan that starts or stops does not switch the air in one step.
 * The ticks run on their own clock and read the latest target, so a target that keeps changing never starves them.
 * A changed set of fans is taken at once. Keys in `direct` follow the target without easing.
 */
export function useEasedFlow(target: Flow | null, direct: readonly string[]): Flow | null {
  const [shown, setShown] = useState<Flow | null>(null);
  const latest = useRef(target);
  latest.current = target;
  const easing = target !== null && shown !== target;
  useEffect(() => {
    if (!target) { setShown(null); return undefined; }
    return undefined;
  }, [target]);
  useEffect(() => {
    if (!easing) return undefined;
    const timer = setTimeout(() => setShown(prev => {
      const goal = latest.current;
      return goal ? (prev ? easeFlows(prev, goal, FLOW_EASE_STEP_MS, direct) : goal) : null;
    }), shown ? FLOW_EASE_STEP_MS : 0);
    return () => clearTimeout(timer);
    // direct is a fixed list of keys.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [easing, shown]);
  if (!target) return null;
  return shown && sameKeys(shown, target) ? { ...shown, ...Object.fromEntries(direct.filter(k => k in target).map(k => [k, target[k]])) } : target;
}
