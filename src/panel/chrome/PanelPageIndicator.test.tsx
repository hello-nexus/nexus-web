import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PanelPageIndicator } from './PanelPageIndicator';

vi.mock('../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const dots = () => Array.from(screen.getByRole('tablist').children);

describe('PanelPageIndicator', () => {
  it('default mode marks only the current dot and fades', () => {
    vi.useFakeTimers();
    render(<PanelPageIndicator total={4} active={2} />);
    expect(dots().filter(d => d.hasAttribute('data-filled'))).toHaveLength(0);
    expect(dots().filter(d => d.getAttribute('data-active') === 'true')).toHaveLength(1);
    vi.advanceTimersByTime(2000);
    vi.useRealTimers();
  });

  it('progress mode fills the current dot and every one before it', () => {
    render(<PanelPageIndicator progress total={5} active={2} />);
    expect(dots().map(d => d.getAttribute('data-filled'))).toEqual(['true', 'true', 'true', null, null]);
  });

  it('progress mode never fades', () => {
    vi.useFakeTimers();
    render(<PanelPageIndicator progress total={3} active={0} />);
    vi.advanceTimersByTime(5000);
    expect(screen.getByRole('tablist').hasAttribute('data-fade')).toBe(false);
    vi.useRealTimers();
  });
});
