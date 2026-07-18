// Pure decision for the LedMapEditor capture-phase Escape handler. Kept free
// of React/DOM so the arbitration rule is unit-testable without mounting the
// editor.

export interface EditorEscapeContext {
  /** Focus is in a text field (LED count input, a future rename field, etc.). */
  isEditableTarget: boolean;
  /** A dialog stacked above the editor (community modal, zone prompt, any
   *  confirm) is open. That surface owns Escape through the shared modal
   *  stack; the editor must not also react to the key. */
  dialogAboveEditorOpen: boolean;
  /** The canvas has an active marquee/LED selection. */
  hasSelection: boolean;
}

/**
 * True when the editor should consume Escape itself (clear the selection)
 * instead of letting it reach DeviceModal's Escape-close.
 */
export function shouldConsumeEditorEscape({
  isEditableTarget,
  dialogAboveEditorOpen,
  hasSelection,
}: EditorEscapeContext): boolean {
  if (isEditableTarget) return false;
  if (dialogAboveEditorOpen) return false;
  return hasSelection;
}
