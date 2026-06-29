import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PanelWidget } from '../types';
import { ClockWidget } from './ClockWidget';

function clockWidget(config: Record<string, unknown>): PanelWidget {
  return { id: 'clock-1', type: 'clock', size: '4x2', col: 0, row: 0, config };
}

describe('ClockWidget', () => {
  // Regression: a partial/invalid timezone (a half-typed value) used to reach
  // Intl.DateTimeFormat and throw RangeError, crashing the whole panel.
  it('renders local time instead of throwing on an invalid timezone', () => {
    for (const design of ['digital', 'analog', 'matrix']) {
      expect(() =>
        render(<ClockWidget widget={clockWidget({ design, timezone: 'j' })} />),
      ).not.toThrow();
    }
  });

  it('renders a valid timezone without error', () => {
    const { container } = render(
      <ClockWidget widget={clockWidget({ design: 'digital', timezone: 'Asia/Tokyo' })} />,
    );
    expect(container.textContent).toMatch(/\d{1,2}:\d{2}/);
  });
});
