import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HelloGreeting } from './HelloGreeting';

vi.mock('../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string) => (key === 'hello.first' ? 'Hi' : key),
  }),
}));

describe('HelloGreeting', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('types the text one character at a time', () => {
    render(<HelloGreeting textKey="hello.first" />);
    const heading = screen.getByRole('heading', { level: 1 });

    expect(heading.textContent).toBe('');
    act(() => { vi.advanceTimersByTime(40); });
    expect(heading.textContent).toBe('H');
    act(() => { vi.advanceTimersByTime(40); });
    expect(heading.textContent).toBe('Hi');
    // Fully typed; no further characters appear even after more time.
    act(() => { vi.advanceTimersByTime(200); });
    expect(heading.textContent).toBe('Hi');
  });

  it('keeps the full text as the accessible name throughout typing', () => {
    render(<HelloGreeting textKey="hello.first" />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveAttribute('aria-label', 'Hi');
  });
});
