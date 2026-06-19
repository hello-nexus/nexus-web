import { useEffect, useRef, useState } from 'react';

// Increments once per change of `value`, skipping changes that land while
// `suppress` is true or on the render where it flips false - initial
// hydration applies the fetched state and clears `suppress` in the same
// batch, and that first sync must not read as a state change.
export function useStateChangePulse(value: unknown, suppress: boolean): number {
  const [pulse, setPulse] = useState(0);
  const prevValueRef = useRef(value);
  const prevSuppressRef = useRef(suppress);

  useEffect(() => {
    const changed = prevValueRef.current !== value;
    const wasSuppressed = prevSuppressRef.current;
    prevValueRef.current = value;
    prevSuppressRef.current = suppress;
    if (changed && !suppress && !wasSuppressed) setPulse(p => p + 1);
  }, [value, suppress]);

  return pulse;
}
