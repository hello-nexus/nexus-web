import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SignalBarsIcon } from './SignalBarsIcon';

function highlights(container: HTMLElement) {
  return [1, 2, 3].map(i => container.querySelector(`[data-bar-highlight="${i}"]`) as SVGRectElement);
}

describe('SignalBarsIcon', () => {
  it('scales highlights to the level, anchored at each bar bottom', () => {
    const { container } = render(<SignalBarsIcon level={2} />);
    const [b1, b2, b3] = highlights(container);
    expect(b1.style.transform).toBe('scaleY(1)');
    expect(b2.style.transform).toBe('scaleY(1)');
    expect(b3.style.transform).toBe('scaleY(0)');
    expect(b3.style.transformOrigin).toBe('center bottom');
  });

  it('only transitions when animate is set', () => {
    const { container, rerender } = render(<SignalBarsIcon level={1} />);
    expect(highlights(container)[2].style.transition).toBe('none');
    rerender(<SignalBarsIcon level={3} animate />);
    expect(highlights(container)[2].style.transition).toContain('transform');
    expect(highlights(container)[2].style.transform).toBe('scaleY(1)');
  });
});
