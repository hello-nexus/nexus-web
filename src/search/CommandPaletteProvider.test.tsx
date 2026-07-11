import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CommandPaletteProvider } from './CommandPaletteProvider';
import { useCommandPalette } from './CommandPaletteContext';

function Probe() {
  const { isOpen } = useCommandPalette();
  return (
    <>
      <span data-testid="state">{isOpen ? 'open' : 'closed'}</span>
      <input data-testid="field" />
      <div data-testid="editable" contentEditable suppressContentEditableWarning />
    </>
  );
}

function renderProbe() {
  render(
    <CommandPaletteProvider navigate={vi.fn()} onPairPhone={vi.fn()}>
      <Probe />
    </CommandPaletteProvider>,
  );
  return screen.getByTestId('state');
}

describe('CommandPaletteProvider global shortcut', () => {
  it('opens on a bare "/" when focus is not in an editable element', () => {
    const state = renderProbe();
    expect(state.textContent).toBe('closed');
    fireEvent.keyDown(window, { key: '/' });
    expect(state.textContent).toBe('open');
  });

  it('does not open on "/" typed into an input, so a literal slash still works', () => {
    const state = renderProbe();
    const field = screen.getByTestId('field');
    field.focus();
    fireEvent.keyDown(field, { key: '/' });
    expect(state.textContent).toBe('closed');
  });

  it('does not open on "/" typed into a contenteditable element', () => {
    const state = renderProbe();
    const editable = screen.getByTestId('editable');
    // jsdom does not compute isContentEditable from the attribute (a known
    // jsdom gap), so stub it to exercise the real-browser code path.
    Object.defineProperty(editable, 'isContentEditable', { value: true, configurable: true });
    editable.focus();
    fireEvent.keyDown(editable, { key: '/' });
    expect(state.textContent).toBe('closed');
  });

  it('ignores "/" combined with a modifier key', () => {
    const state = renderProbe();
    fireEvent.keyDown(window, { key: '/', ctrlKey: true });
    expect(state.textContent).toBe('closed');
  });

  it('still toggles on Ctrl/Cmd+K', () => {
    const state = renderProbe();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(state.textContent).toBe('open');
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(state.textContent).toBe('closed');
  });
});
