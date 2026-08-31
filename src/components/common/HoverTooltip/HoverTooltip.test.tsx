import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TOOLTIP_OPEN_DELAY_MS } from '../tooltipDelay';
import { HoverTooltip } from './HoverTooltip';

function renderTrigger() {
  render(
    <HoverTooltip body="Reset" side="top">
      <button type="button">trigger</button>
    </HoverTooltip>,
  );
  return screen.getByRole('button', { name: 'trigger' });
}

describe('HoverTooltip', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens on keyboard focus', () => {
    const btn = renderTrigger();
    fireEvent.focus(btn);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Reset');
  });

  it('does not open when a pointer press causes the focus', () => {
    // A tap / mouse click focuses the trigger; that focus must not open the
    // tooltip - on a touch surface nothing would ever close it again.
    const btn = renderTrigger();
    fireEvent.pointerDown(btn);
    fireEvent.focus(btn);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('a consumed pointer press does not suppress a later keyboard focus', () => {
    const btn = renderTrigger();
    fireEvent.pointerDown(btn);
    fireEvent.focus(btn);
    fireEvent.blur(btn);
    fireEvent.focus(btn);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Reset');
  });

  it('a press that never focuses does not suppress a later keyboard focus', () => {
    // macOS click / preventDefault-ed pointerdown: click completes with no
    // focus event, so click clears the arm.
    const btn = renderTrigger();
    fireEvent.pointerDown(btn);
    fireEvent.click(btn);
    fireEvent.focus(btn);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Reset');
  });

  it('a cancelled press does not suppress a later keyboard focus', () => {
    // Touch press that turns into a scroll: pointercancel, no focus or click.
    const btn = renderTrigger();
    fireEvent.pointerDown(btn);
    fireEvent.pointerCancel(btn);
    fireEvent.focus(btn);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Reset');
  });

  it('dismisses on a press outside the trigger', () => {
    // Covers the latch where the trigger disables itself on click and Chromium
    // then fires no blur on it.
    const btn = renderTrigger();
    fireEvent.focus(btn);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('dismisses on a press on the trigger itself', () => {
    // A click is a commit; whatever it opens is the feedback from then on, so
    // the tooltip must not hang over the menu its own trigger just opened.
    const btn = renderTrigger();
    fireEvent.focus(btn);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.pointerDown(btn);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('cancels an open still inside its delay when the trigger is pressed', () => {
    vi.useFakeTimers();
    const btn = renderTrigger();
    fireEvent.pointerOver(btn, { pointerType: 'mouse' });
    fireEvent.pointerDown(btn);
    act(() => { vi.advanceTimersByTime(TOOLTIP_OPEN_DELAY_MS + 1); });
    expect(screen.queryByRole('tooltip')).toBeNull();
    vi.useRealTimers();
  });

  it('never opens from a touch pointer enter', () => {
    vi.useFakeTimers();
    const btn = renderTrigger();
    fireEvent.pointerOver(btn, { pointerType: 'touch' });
    act(() => { vi.advanceTimersByTime(TOOLTIP_OPEN_DELAY_MS + 1); });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('opens from a mouse hover after the rest delay', () => {
    vi.useFakeTimers();
    const btn = renderTrigger();
    fireEvent.pointerOver(btn, { pointerType: 'mouse' });
    act(() => { vi.advanceTimersByTime(TOOLTIP_OPEN_DELAY_MS + 1); });
    expect(screen.getByRole('tooltip')).toHaveTextContent('Reset');
  });
});
