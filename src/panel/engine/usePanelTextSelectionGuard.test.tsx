import { useRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, afterEach } from 'vitest';
import { usePanelTextSelectionGuard } from './usePanelTextSelectionGuard';

function GuardedPanel() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  usePanelTextSelectionGuard(rootRef);

  return (
    <>
      <div ref={rootRef} className="panel-root">
        <p data-testid="panel-text">Panel text</p>
        <input data-testid="panel-input" />
        <div contentEditable data-testid="panel-editable">Editable text</div>
      </div>
      <aside className="panel-root">
        <p data-testid="sheet-text">Sheet text</p>
        <input data-testid="sheet-input" />
      </aside>
      <p data-testid="outside-text">Outside text</p>
    </>
  );
}

function selectNodeContents(node: Node) {
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(node);
  selection?.removeAllRanges();
  selection?.addRange(range);
  return selection;
}

describe('usePanelTextSelectionGuard', () => {
  afterEach(() => {
    window.getSelection()?.removeAllRanges();
  });

  it('prevents native text selection from panel text', () => {
    render(<GuardedPanel />);

    const event = new Event('selectstart', { bubbles: true, cancelable: true });
    screen.getByTestId('panel-text').dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('prevents native text selection from panel text node targets', () => {
    render(<GuardedPanel />);

    const event = new Event('selectstart', { bubbles: true, cancelable: true });
    screen.getByTestId('panel-text').firstChild?.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('allows native text selection inside form controls', () => {
    render(<GuardedPanel />);

    const event = new Event('selectstart', { bubbles: true, cancelable: true });
    screen.getByTestId('panel-input').dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it('prevents native long-press context menus outside text inputs', () => {
    render(<GuardedPanel />);

    const event = new Event('contextmenu', { bubbles: true, cancelable: true });
    screen.getByTestId('panel-text').dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('allows native long-press context menus inside text inputs', () => {
    render(<GuardedPanel />);

    const event = new Event('contextmenu', { bubbles: true, cancelable: true });
    screen.getByTestId('panel-input').dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it('prevents native clipboard copy outside text inputs', () => {
    render(<GuardedPanel />);

    const event = new Event('copy', { bubbles: true, cancelable: true });
    screen.getByTestId('panel-text').dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('prevents native clipboard copy when selection is in panel text', () => {
    render(<GuardedPanel />);

    selectNodeContents(screen.getByTestId('panel-text'));
    const event = new Event('copy', { bubbles: true, cancelable: true });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(window.getSelection()?.rangeCount).toBe(0);
  });

  it('allows native clipboard copy inside text inputs', () => {
    render(<GuardedPanel />);

    const event = new Event('copy', { bubbles: true, cancelable: true });
    screen.getByTestId('panel-input').dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it('allows native clipboard copy when selection is in editable panel controls', () => {
    render(<GuardedPanel />);

    selectNodeContents(screen.getByTestId('panel-editable'));
    const event = new Event('copy', { bubbles: true, cancelable: true });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(window.getSelection()?.rangeCount).toBe(1);
  });

  it('prevents native text selection from sibling panel sheets', () => {
    render(<GuardedPanel />);

    const event = new Event('selectstart', { bubbles: true, cancelable: true });
    screen.getByTestId('sheet-text').dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('allows native text selection inside sibling sheet inputs', () => {
    render(<GuardedPanel />);

    const event = new Event('selectstart', { bubbles: true, cancelable: true });
    screen.getByTestId('sheet-input').dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it('clears range selection inside panel text', () => {
    render(<GuardedPanel />);

    const selection = selectNodeContents(screen.getByTestId('panel-text'));
    expect(selection?.rangeCount).toBe(1);

    document.dispatchEvent(new Event('selectionchange'));

    expect(window.getSelection()?.rangeCount).toBe(0);
  });

  it('clears range selection inside sibling panel sheet text', () => {
    render(<GuardedPanel />);

    const selection = selectNodeContents(screen.getByTestId('sheet-text'));
    expect(selection?.rangeCount).toBe(1);

    document.dispatchEvent(new Event('selectionchange'));

    expect(window.getSelection()?.rangeCount).toBe(0);
  });

  it('keeps range selection inside editable panel controls', () => {
    render(<GuardedPanel />);

    const selection = selectNodeContents(screen.getByTestId('panel-editable'));
    expect(selection?.rangeCount).toBe(1);

    document.dispatchEvent(new Event('selectionchange'));

    expect(window.getSelection()?.rangeCount).toBe(1);
  });

  it('leaves non-panel text selection alone', () => {
    render(<GuardedPanel />);

    const selection = selectNodeContents(screen.getByTestId('outside-text'));
    expect(selection?.rangeCount).toBe(1);

    document.dispatchEvent(new Event('selectionchange'));

    expect(window.getSelection()?.rangeCount).toBe(1);
  });
});
