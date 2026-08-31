import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CanvasNoticeBar } from './CanvasNoticeBar';

describe('CanvasNoticeBar', () => {
  it('renders nothing when not visible', () => {
    const { container } = render(<CanvasNoticeBar visible={false} message="hidden" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('announces the message without an action when none is given', () => {
    render(<CanvasNoticeBar visible message="Setting up the graphics card" />);
    expect(screen.getByRole('status')).toHaveTextContent('Setting up the graphics card');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offers the fix-it action and calls back on click', () => {
    // The bar is click-through; a regression here is silent - the notice still
    // paints and the button stops responding.
    const onClick = vi.fn();
    render(<CanvasNoticeBar visible message="No usable GPU" action={{ label: 'Choose GPU', onClick }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose GPU' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
