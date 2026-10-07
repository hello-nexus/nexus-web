import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { WarningIcon } from './WarningIcon';

describe('WarningIcon', () => {
  it('is a focusable button labelled with the message', () => {
    render(<WarningIcon message="Fan can stop" />);
    expect(screen.getByRole('button', { name: 'Fan can stop' })).toBeInTheDocument();
  });

  it('toggles the tooltip on tap', () => {
    render(<WarningIcon message="Fan can stop" />);
    const btn = screen.getByRole('button', { name: 'Fan can stop' });
    fireEvent.click(btn);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Fan can stop');
    fireEvent.click(btn);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('opens when focused from the keyboard', () => {
    render(<WarningIcon message="Fan can stop" />);
    fireEvent.focus(screen.getByRole('button', { name: 'Fan can stop' }));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('keeps a click from reaching a clickable ancestor', () => {
    const onCard = vi.fn();
    render(<div onClick={onCard}><WarningIcon message="Fan can stop" /></div>);
    fireEvent.click(screen.getByRole('button', { name: 'Fan can stop' }));
    expect(onCard).not.toHaveBeenCalled();
  });

  it('applies the tone class', () => {
    const { rerender } = render(<WarningIcon message="m" />);
    expect(screen.getByRole('button').className).toContain('warning');
    rerender(<WarningIcon message="m" tone="critical" />);
    expect(screen.getByRole('button').className).toContain('critical');
  });

  describe('bare', () => {
    it('is a non-focusable image span, not a button', () => {
      render(<WarningIcon bare message="Fan can stop" />);
      expect(screen.getByRole('img', { name: 'Fan can stop' })).toBeInTheDocument();
      expect(screen.queryByRole('button')).toBeNull();
    });

    it('defaults to the warning tone, switches to critical and passes a class', () => {
      const { rerender } = render(<WarningIcon bare message="m" />);
      expect(screen.getByRole('img').className).toContain('warning');
      rerender(<WarningIcon bare message="m" tone="critical" className="extra" />);
      expect(screen.getByRole('img').className).toContain('critical');
      expect(screen.getByRole('img').className).toContain('extra');
    });
  });
});
