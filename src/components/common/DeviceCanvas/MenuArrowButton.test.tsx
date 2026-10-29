import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MenuArrowButton } from './MenuArrowButton';

afterEach(cleanup);

function rect(top: number): DOMRect {
  return { top, bottom: top + 100, left: 0, right: 200, width: 200, height: 100, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
}

describe('MenuArrowButton corner badge', () => {
  it('places on show and on scroll without a frame loop, and hides when scrolled out', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    const scroller = document.createElement('div');
    scroller.style.overflowY = 'auto';
    const card = document.createElement('div');
    scroller.appendChild(card);
    document.body.appendChild(scroller);
    let cardTop = 50;
    vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue(rect(40));
    vi.spyOn(card, 'getBoundingClientRect').mockImplementation(() => rect(cardTop));

    const { unmount } = render(
      <MenuArrowButton variant="corner" anchor={card} label="More" tooltip="More" open={false} onOpen={() => {}} onClose={() => {}} />,
    );
    const badge = screen.getByRole('button', { name: 'More' });
    expect(badge.style.top).toBe('50px');
    expect(badge.style.left).toBe('200px');
    expect(badge.style.visibility).toBe('');

    cardTop = 10;
    act(() => { fireEvent.scroll(scroller); });
    expect(badge.style.top).toBe('10px');
    expect(badge.style.visibility).toBe('hidden');

    unmount();
    expect(raf).not.toHaveBeenCalled();
    scroller.remove();
  });
});
