import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HelloGreeting } from './HelloGreeting';

vi.mock('../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string) => (key === 'hello.first' ? 'Hi' : key),
  }),
}));

// The shared jsdom test setup stubs matchMedia to always report matches:true
// for any query not containing "light" - which includes reduced-motion. Most
// tests want that (instant, deterministic render); the animated-path tests
// below override it locally to exercise the typewriter effect.
function mockReducedMotion(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: () => {},
    removeEventListener: () => {},
  }) as unknown as typeof window.matchMedia;
}

describe('HelloGreeting', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the full text immediately when reduced motion is preferred (default test env)', () => {
    render(<HelloGreeting textKey="hello.first" />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveAttribute('aria-label', 'Hi');
    expect(heading.textContent).toBe('Hi');
  });

  describe('with motion allowed', () => {
    beforeEach(() => {
      mockReducedMotion(false);
      vi.useFakeTimers();
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
});
