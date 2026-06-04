import { useCallback, useEffect, useRef, useState } from 'react';
import { useLongPress } from './useLongPress';
import { triggerHaptic } from '../panelNativeBridge';
import type { PanelWidget } from '../types';

const PRESS_MOVE_THRESHOLD = 12;
const LONG_PRESS_MS = 500;
// Lengthening PRESS_SHRINK_MS automatically pulls PRESS_FEEDBACK_MS forward, so
// the shrink starts sooner and decelerates smoothly into the haptic at
// CONTEXT_MENU_TRIGGER_MS. Keep PRESS_SHRINK_MS in sync with --panel-press-duration.
const PRESS_SHRINK_MS = 400;
const CONTEXT_MENU_IN_MS = 140;
const PRESS_FEEDBACK_MS = LONG_PRESS_MS - PRESS_SHRINK_MS;
const CONTEXT_MENU_TRIGGER_MS = LONG_PRESS_MS - CONTEXT_MENU_IN_MS;
// Time at which the context menu opens. Exported so the host's
// dnd-kit PointerSensor can match its delay activation to the same
// instant - drag arms the moment the menu appears, never sooner.
 
export const PANEL_CONTEXT_MENU_TRIGGER_MS = CONTEXT_MENU_TRIGGER_MS;
const PANEL_SCROLLABLE_SELECTOR = '[data-panel-scrollable="true"]';
// Elements that handle their own click (a widget's mode button, slider,
// etc.) - tapping one of these should fire its own action, not bubble
// up to "tap-to-immersive".
const INTERACTIVE_SELECTOR = 'button, input, select, textarea, a, [role="button"], [role="slider"], [role="switch"], [role="checkbox"], [role="tab"], [role="menuitem"], [role="option"]';

function isNonPrimaryMouseButton(e: React.PointerEvent): boolean {
  return e.pointerType === 'mouse' && e.button !== 0;
}

export interface ContextMenuState {
  widget: PanelWidget;
  x: number;
  y: number;
}

interface PanelTouchModeOpts {
  // Fires when the user briefly taps a cell (no long-press, no drag,
  // no movement past PRESS_MOVE_THRESHOLD). Caller decides what to do
  // with it - the panel runtime opens immersive mode for widgets that
  // ship an ImmersiveComponent.
  onCellTap?: (widget: PanelWidget) => void;
}

/**
 * Touch UI state machine for the panel: long-press to open context menu,
 * drag arms at the same instant. Reorder/resize/remove are NOT handled
 * here - PanelApp owns the layout mutations and feeds them through the
 * single flat-list path. This hook only disambiguates tap / long-press
 * / drag and tracks rearrange visuals.
 */
export function usePanelTouchMode({ onCellTap }: PanelTouchModeOpts) {
  const [rearranging, setRearranging] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);
  const [pressedWidgetId, setPressedWidgetId] = useState<string | null>(null);
  const longPressWidgetRef = useRef<PanelWidget | null>(null);
  const pressOriginRef = useRef({ x: 0, y: 0 });
  const pressFeedbackTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const draggingRef = useRef(false);
  const movedDuringDragRef = useRef(false);
  const lastDragEndAtRef = useRef(0);

  const clearPressFeedback = useCallback(() => {
    if (pressFeedbackTimerRef.current) {
      window.clearTimeout(pressFeedbackTimerRef.current);
      pressFeedbackTimerRef.current = null;
    }
    setPressedWidgetId(null);
  }, []);

  useEffect(() => {
    if (!pressedWidgetId) return undefined;
    window.addEventListener('pointerup', clearPressFeedback, true);
    window.addEventListener('pointercancel', clearPressFeedback, true);
    window.addEventListener('blur', clearPressFeedback);
    return () => {
      window.removeEventListener('pointerup', clearPressFeedback, true);
      window.removeEventListener('pointercancel', clearPressFeedback, true);
      window.removeEventListener('blur', clearPressFeedback);
    };
  }, [clearPressFeedback, pressedWidgetId]);

  const handleLongPress = useCallback((x: number, y: number) => {
    const w = longPressWidgetRef.current;
    if (w) {
      if (pressFeedbackTimerRef.current) {
        window.clearTimeout(pressFeedbackTimerRef.current);
        pressFeedbackTimerRef.current = null;
        setPressedWidgetId(w.id);
      }
      triggerHaptic('medium');
      setCtxMenu({ widget: w, x, y });
    } else {
      clearPressFeedback();
    }
  }, [clearPressFeedback]);

  const longPress = useLongPress(handleLongPress, CONTEXT_MENU_TRIGGER_MS);

  const handleContextMenu = useCallback((e: React.MouseEvent, widget: PanelWidget) => {
    e.preventDefault();
    e.stopPropagation();
    clearPressFeedback();
    setCtxMenu({ widget, x: e.clientX, y: e.clientY });
  }, [clearPressFeedback]);

  const handleGridClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget && rearranging) {
      setRearranging(false);
    }
  }, [rearranging]);

  const toggleRearrange = useCallback(() => {
    clearPressFeedback();
    setRearranging(prev => !prev);
  }, [clearPressFeedback]);

  const handleRearrangeTap = useCallback((e: React.MouseEvent) => {
    if (!rearranging) return;
    e.stopPropagation();
    const now = performance.now();
    if (draggingRef.current || now - lastDragEndAtRef.current < 200) return;
    setRearranging(false);
  }, [rearranging]);

  const closeCtxMenu = useCallback(() => {
    clearPressFeedback();
    setCtxMenu(null);
  }, [clearPressFeedback]);

  const handleDragStart = useCallback(() => {
    draggingRef.current = true;
    movedDuringDragRef.current = false;
    // Don't dismiss the context menu here. With a delay-based activation
    // constraint, dnd-kit fires DragStart at the long-press mark even when
    // the user hasn't moved - i.e. during the same gesture that just opened
    // the menu. We commit to "this is a drag" only on the first onDragMove
    // (handleDragMove). A release without movement leaves the menu visible.
  }, []);

  const handleDragMove = useCallback(() => {
    if (movedDuringDragRef.current) return;
    movedDuringDragRef.current = true;
    clearPressFeedback();
    setCtxMenu(null);
    setRearranging(true);
  }, [clearPressFeedback]);

  const handleDragEnd = useCallback(() => {
    if (draggingRef.current) {
      lastDragEndAtRef.current = performance.now();
    }
    draggingRef.current = false;
    movedDuringDragRef.current = false;
    setRearranging(false);
  }, []);

  const pressMovedRef = useRef(false);
  // Set when pointer-down lands on a widget-interior interactive
  // element (button, slider, etc.). Suppresses tap-to-immersive so
  // the widget's own click handler runs. Long-press still works for
  // the context menu.
  const pressOnInteractiveRef = useRef(false);

  const bindCellPointers = useCallback((widget: PanelWidget) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.isPrimary === false) return;
      if (isNonPrimaryMouseButton(e)) {
        clearPressFeedback();
        longPress.onPointerDown(e);
        pressOnInteractiveRef.current = false;
        pressMovedRef.current = false;
        return;
      }
      const onScrollable = e.target instanceof Element && Boolean(e.target.closest(PANEL_SCROLLABLE_SELECTOR));
      // Detect interactive descendants STRICTLY inside the cell. The
      // cell wrapper itself carries role="button" via dnd-kit's
      // useSortable attributes, so a plain `closest(INTERACTIVE)`
      // matches the cell on every tap and would suppress
      // tap-to-immersive on widgets that have no real button inside.
      // Exclude the cell wrapper (e.currentTarget) from the match.
      const interactiveAncestor = e.target instanceof Element ? e.target.closest(INTERACTIVE_SELECTOR) : null;
      pressOnInteractiveRef.current = !!interactiveAncestor && interactiveAncestor !== e.currentTarget;

      pressOriginRef.current = { x: e.clientX, y: e.clientY };
      pressMovedRef.current = false;
      longPressWidgetRef.current = widget;
      clearPressFeedback();
      // Skip the press-feedback shrink animation on scrollable lists
      // and interactive controls so the user's scroll / button tap
      // doesn't feel like the whole cell is being pressed. The
      // long-press timer + tap detection still arm normally - movement
      // past PRESS_MOVE_THRESHOLD cancels both.
      if (!onScrollable && !pressOnInteractiveRef.current) {
        pressFeedbackTimerRef.current = window.setTimeout(() => {
          pressFeedbackTimerRef.current = null;
          setPressedWidgetId(widget.id);
        }, PRESS_FEEDBACK_MS);
      }
      longPress.onPointerDown(e);
    },
    onPointerMove: (e: React.PointerEvent) => {
      longPress.onPointerMove(e);
      const dx = e.clientX - pressOriginRef.current.x;
      const dy = e.clientY - pressOriginRef.current.y;
      if (dx * dx + dy * dy > PRESS_MOVE_THRESHOLD * PRESS_MOVE_THRESHOLD) {
        clearPressFeedback();
        pressMovedRef.current = true;
      }
    },
    onPointerUp: (e: React.PointerEvent) => {
      if (isNonPrimaryMouseButton(e)) {
        longPress.onPointerUp();
        clearPressFeedback();
        pressOnInteractiveRef.current = false;
        pressMovedRef.current = false;
        return;
      }
      // Was a context menu already open BEFORE this gesture started?
      // The release that follows the long-press that just opened the
      // menu has `longPress.firedRef.current === true` - that's the
      // SAME gesture and must leave the menu visible. A subsequent tap
      // (firedRef false) on a cell while the menu is up = "dismiss".
      const menuWasOpen = !!ctxMenu;
      const longPressJustFired = longPress.firedRef.current;
      const wasTap =
        !longPressJustFired
        && !pressMovedRef.current
        && !pressOnInteractiveRef.current
        && !rearranging
        && !menuWasOpen;
      longPress.onPointerUp();
      clearPressFeedback();
      if (menuWasOpen && !longPressJustFired) {
        // Subsequent tap while the menu is open: dismiss only, don't
        // promote to onCellTap. The release after the long-press that
        // just opened the menu skips this branch.
        setCtxMenu(null);
      }
      if (wasTap) onCellTap?.(widget);
    },
    onPointerCancel: () => {
      longPress.onPointerCancel();
      clearPressFeedback();
      // Reset so a subsequent gesture cannot inherit the previous
      // press's "touch landed on a button" verdict.
      pressOnInteractiveRef.current = false;
    },
  }), [clearPressFeedback, longPress, onCellTap, rearranging, ctxMenu]);

  return {
    rearranging,
    ctxMenu,
    pressedWidgetId,
    closeCtxMenu,
    handleContextMenu,
    handleGridClick,
    handleRearrangeTap,
    toggleRearrange,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    bindCellPointers,
  };
}

