import { fireEvent, render, screen } from '@testing-library/react';
import { createPortal } from 'react-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWindowDragRegion } from './useWindowDragRegion';
import { NEXUS_WINDOW_ACTIONS } from './windowActions';

function Bar() {
  const dragRegion = useWindowDragRegion();
  return (
    <header {...dragRegion} data-testid="bar">
      <span data-testid="chrome-text">title</span>
      {createPortal(<span data-testid="portaled-text">modal text</span>, document.body)}
    </header>
  );
}

describe('useWindowDragRegion', () => {
  const postMessage = vi.fn();

  beforeEach(() => {
    Object.assign(window, { nexusShellPlatform: 'windows-app', chrome: { webview: { postMessage } } });
  });

  afterEach(() => {
    postMessage.mockReset();
    delete (window as { nexusShellPlatform?: string }).nexusShellPlatform;
    delete (window as { chrome?: unknown }).chrome;
  });

  it('toggles maximize on a double mousedown on the bar itself', () => {
    render(<Bar />);
    const text = screen.getByTestId('chrome-text');
    fireEvent.mouseDown(text, { button: 0 });
    fireEvent.mouseDown(text, { button: 0 });
    expect(postMessage).toHaveBeenLastCalledWith(NEXUS_WINDOW_ACTIONS.toggleMaximize);
  });

  it('ignores mousedowns that bubble up from a portaled overlay', () => {
    render(<Bar />);
    const text = screen.getByTestId('portaled-text');
    fireEvent.mouseDown(text, { button: 0 });
    fireEvent.mouseDown(text, { button: 0 });
    expect(postMessage).not.toHaveBeenCalled();
  });
});
