import { useEffect, type RefObject } from 'react';

const PANEL_ROOT_SELECTOR = '.panel-root';
const PANEL_TEXT_SELECTION_ALLOW_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]',
  '[data-panel-allow-text-selection="true"]',
].join(',');
const PANEL_NATIVE_CLIPBOARD_EVENTS = [
  'copy',
  'cut',
  'paste',
  'beforecopy',
  'beforecut',
  'beforepaste',
];
const PANEL_NATIVE_CLIPBOARD_EVENT_SET = new Set(PANEL_NATIVE_CLIPBOARD_EVENTS);
const PANEL_NATIVE_SELECTION_EVENTS = [
  'selectstart',
  'dragstart',
  'contextmenu',
  ...PANEL_NATIVE_CLIPBOARD_EVENTS,
];

function elementForNode(node: Node | null): Element | null {
  if (!node) return null;
  return node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
}

function elementForTarget(target: EventTarget | null): Element | null {
  return target instanceof Node ? elementForNode(target) : null;
}

function insidePanel(target: EventTarget | null): boolean {
  return Boolean(elementForTarget(target)?.closest(PANEL_ROOT_SELECTOR));
}

function allowsTextSelection(target: EventTarget | null): boolean {
  return Boolean(elementForTarget(target)?.closest(PANEL_TEXT_SELECTION_ALLOW_SELECTOR));
}

function nodeInsidePanel(node: Node | null): boolean {
  return Boolean(elementForNode(node)?.closest(PANEL_ROOT_SELECTOR));
}

function selectionTouchesPanel(selection: Selection): boolean {
  return nodeInsidePanel(selection.anchorNode) || nodeInsidePanel(selection.focusNode);
}

function selectionAllowed(selection: Selection): boolean {
  const anchor = elementForNode(selection.anchorNode);
  const focus = elementForNode(selection.focusNode);
  return Boolean(
    anchor?.closest(PANEL_TEXT_SELECTION_ALLOW_SELECTOR)
    && focus?.closest(PANEL_TEXT_SELECTION_ALLOW_SELECTOR),
  );
}

function isClipboardEvent(event: Event): boolean {
  return PANEL_NATIVE_CLIPBOARD_EVENT_SET.has(event.type);
}

function clipboardSelectionTouchesPanel(event: Event, selection: Selection | null): boolean {
  return isClipboardEvent(event) && Boolean(selection && !selection.isCollapsed && selectionTouchesPanel(selection));
}

function clipboardSelectionAllowed(event: Event, selection: Selection | null): boolean {
  return isClipboardEvent(event) && Boolean(selection && !selection.isCollapsed && selectionAllowed(selection));
}

export function usePanelTextSelectionGuard(rootRef: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    const root = rootRef.current;
    if (!root) return undefined;

    const preventNativeSelection = (event: Event) => {
      const selection = window.getSelection();
      if (!insidePanel(event.target) && !clipboardSelectionTouchesPanel(event, selection)) return;
      if (allowsTextSelection(event.target) || clipboardSelectionAllowed(event, selection)) return;
      event.preventDefault();
      selection?.removeAllRanges();
    };

    const clearPanelSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;
      if (!selectionTouchesPanel(selection) || selectionAllowed(selection)) return;
      selection.removeAllRanges();
    };

    for (const eventName of PANEL_NATIVE_SELECTION_EVENTS) {
      document.addEventListener(eventName, preventNativeSelection, true);
    }
    document.addEventListener('selectionchange', clearPanelSelection);

    return () => {
      for (const eventName of PANEL_NATIVE_SELECTION_EVENTS) {
        document.removeEventListener(eventName, preventNativeSelection, true);
      }
      document.removeEventListener('selectionchange', clearPanelSelection);
    };
  }, [rootRef, enabled]);
}
