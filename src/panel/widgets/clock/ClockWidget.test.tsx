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

  it('shows the short zone name joined to the date when showTimezone is on', () => {
    const zone = new Intl.DateTimeFormat(undefined, { timeZone: 'Asia/Tokyo', timeZoneName: 'short' })
      .formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value ?? '';
    expect(zone).not.toBe('');

    const { container } = render(
      <ClockWidget widget={clockWidget({ design: 'digital', timezone: 'Asia/Tokyo', showTimezone: true })} />,
    );
    expect(container.textContent).toContain(` · ${zone}`);
  });

  it('shows the zone name alone when the date is off', () => {
    const zone = new Intl.DateTimeFormat(undefined, { timeZone: 'Asia/Tokyo', timeZoneName: 'short' })
      .formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value ?? '';

    const { container } = render(
      <ClockWidget widget={clockWidget({ design: 'digital', timezone: 'Asia/Tokyo', showDate: false, showTimezone: true })} />,
    );
    expect(container.textContent).toContain(zone);
    expect(container.textContent).not.toContain('·');
  });

  // The colons ARE the separator a stacked layout splits on, so their absence
  // is what distinguishes the two layouts in the rendered output.
  it('drops the colons and keeps every unit when a design is stacked', () => {
    for (const design of ['digital', 'splitflap', 'rolling', 'led', 'dots', 'matrix']) {
      const stacked = render(
        <ClockWidget widget={clockWidget({ design, layout: 'stacked', showSeconds: true })} />,
      );
      const horizontal = render(
        <ClockWidget widget={clockWidget({ design, showSeconds: true })} />,
      );

      // led and dots draw their digits as segment/dot divs, not text, so only
      // the text-bearing designs can be asserted on their rendered string.
      if (design === 'digital' || design === 'splitflap' || design === 'matrix') {
        expect(horizontal.container.textContent).toMatch(/\d:\d/);
        expect(stacked.container.textContent).not.toMatch(/\d:\d/);
      }
      // One line column per face, holding three lines once seconds are on.
      expect(stacked.container.querySelectorAll('[class*="lines"]')).toHaveLength(1);
    }
  });

  // The badge is balanced by an invisible twin at the head of the line, so
  // switching to 12-hour cannot slide the digits off centre.
  it('balances the AM/PM badge against the head of the line', () => {
    for (const design of ['digital', 'rolling', 'led', 'dots', 'matrix']) {
      const { container } = render(<ClockWidget widget={clockWidget({ design, format: '12h' })} />);
      const badges = container.querySelectorAll('[class*="ampm"]');

      expect(badges).toHaveLength(2);
      expect(badges[0].getAttribute('aria-hidden')).toBe('true');
      expect(badges[1].getAttribute('aria-hidden')).toBeNull();
      expect(badges[0].textContent).toBe(badges[1].textContent);
    }
  });

  it('ignores a stacked layout on a design that cannot split the time', () => {
    expect(() =>
      render(<ClockWidget widget={clockWidget({ design: 'analog', layout: 'stacked' })} />),
    ).not.toThrow();
  });

  it('omits the zone name by default', () => {
    const zone = new Intl.DateTimeFormat(undefined, { timeZone: 'Asia/Tokyo', timeZoneName: 'short' })
      .formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value ?? '';

    const { container } = render(
      <ClockWidget widget={clockWidget({ design: 'digital', timezone: 'Asia/Tokyo' })} />,
    );
    expect(container.textContent).not.toContain(zone);
  });
});
