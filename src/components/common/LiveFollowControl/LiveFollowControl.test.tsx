import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LiveFollowControl } from './LiveFollowControl';

const DETACHED_LABEL = '3:45 PM';

describe('LiveFollowControl', () => {
  it('shows the Live badge, with the live dot to the right of the label, while following', () => {
    render(<LiveFollowControl following={true} detachedLabel={DETACHED_LABEL} onBackToLive={vi.fn()} />);
    const liveLabel = screen.getByText('monitoring.history.live');
    const dot = document.querySelector('[class*="liveDot"]');
    expect(dot).not.toBeNull();
    // getByText resolves to the Badge's own span (its text is a direct child
    // text node); the dot is the label's next sibling within that span, i.e.
    // its last child - confirming it renders after the label, not before it.
    expect(liveLabel.lastChild).toBe(dot);

    const liveSlot = liveLabel.closest('span[aria-hidden]');
    expect(liveSlot).toHaveAttribute('aria-hidden', 'false');
  });

  it('shows the viewed frame\'s time with a trailing return arrow once detached', () => {
    render(<LiveFollowControl following={false} detachedLabel={DETACHED_LABEL} onBackToLive={vi.fn()} />);
    const button = screen.getByText(DETACHED_LABEL).closest('button')!;
    expect(button).toHaveAttribute('aria-hidden', 'false');
    expect(button).toHaveAttribute('tabindex', '0');
    // Accessible name still names the action, even though the visible label
    // is a bare timestamp.
    expect(button).toHaveAttribute('aria-label', 'monitoring.history.backToLive');

    // The formatted time comes first, the arrow icon (an svg) after it.
    expect(button.firstChild?.textContent).toBe(DETACHED_LABEL);
    const arrow = button.querySelector('svg');
    expect(arrow).not.toBeNull();
    expect(button.lastChild).toBe(arrow);
  });

  it('calls onBackToLive when the detached control is clicked', () => {
    const onBackToLive = vi.fn();
    render(<LiveFollowControl following={false} detachedLabel={DETACHED_LABEL} onBackToLive={onBackToLive} />);
    fireEvent.click(screen.getByText(DETACHED_LABEL).closest('button')!);
    expect(onBackToLive).toHaveBeenCalledTimes(1);
  });

  it('keeps both variants mounted at all times, hiding only the inactive one (fixed footprint)', () => {
    const { rerender } = render(<LiveFollowControl following={true} detachedLabel={DETACHED_LABEL} onBackToLive={vi.fn()} />);
    expect(screen.getByText('monitoring.history.live')).toBeInTheDocument();
    const detachedButton = screen.getByText(DETACHED_LABEL).closest('button')!;
    expect(detachedButton).toHaveAttribute('aria-hidden', 'true');
    expect(detachedButton).toHaveAttribute('tabindex', '-1');

    rerender(<LiveFollowControl following={false} detachedLabel={DETACHED_LABEL} onBackToLive={vi.fn()} />);
    const liveSlot = screen.getByText('monitoring.history.live').closest('span[aria-hidden]');
    expect(liveSlot).toHaveAttribute('aria-hidden', 'true');
    expect(detachedButton).toHaveAttribute('aria-hidden', 'false');
    expect(detachedButton).toHaveAttribute('tabindex', '0');
  });

  it('updates the visible detached label when the caller passes a new formatted time', () => {
    const { rerender } = render(<LiveFollowControl following={false} detachedLabel="3:45 PM" onBackToLive={vi.fn()} />);
    expect(screen.getByText('3:45 PM')).toBeInTheDocument();
    rerender(<LiveFollowControl following={false} detachedLabel="3:46 PM" onBackToLive={vi.fn()} />);
    expect(screen.queryByText('3:45 PM')).toBeNull();
    expect(screen.getByText('3:46 PM')).toBeInTheDocument();
  });
});
