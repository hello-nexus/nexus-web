// Long-press detection shared by the host's pressable elements (ui-button,
// interactive ui-card). A press held past `delay` fires onLongPress and suppresses
// the trailing click so the same gesture never also fires onPress; a quick
// tap fires onPress via the native click (so keyboard Enter/Space still works).
// The timer here is the gesture's defining threshold, not a race patch.

import { useRef } from 'react';

const LONG_PRESS_MS = 450;

export interface LongPressHandlers {
  onPointerDown: () => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onPointerCancel: () => void;
  onClick: () => void;
}

export function useLongPress(opts: {
  onLongPress?: () => void;
  onPress?: () => void;
  disabled?: boolean;
  delay?: number;
}): LongPressHandlers {
  const { onLongPress, onPress, disabled, delay = LONG_PRESS_MS } = opts;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFired = useRef(false);

  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };

  return {
    onPointerDown: () => {
      // No long-press listener -> don't arm; behaviour is identical to before.
      if (disabled || !onLongPress) return;
      longFired.current = false;
      clear();
      timer.current = setTimeout(() => { timer.current = null; longFired.current = true; onLongPress(); }, delay);
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onClick: () => {
      if (disabled) return;
      if (longFired.current) { longFired.current = false; return; } // long-press already handled this gesture
      onPress?.();
    },
  };
}
