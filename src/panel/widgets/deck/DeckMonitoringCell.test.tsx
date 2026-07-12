import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DeckMonitoringCell } from './DeckMonitoringCell';
import { PanelPreviewProvider } from '../common/PanelPreviewContext';
import type { DeckAction } from './types';
import styles from './DeckMonitoringCell.module.scss';

const ACCENT = 'rgb(255, 0, 0)';
const TRACK = 'rgba(255, 255, 255, 0.18)';

function monitoringAction(style: 'segments' | 'backdrop', sensor: string): Extract<DeckAction, { type: 'monitoring' }> {
  return { type: 'monitoring', category: 'cpu', sensor, style, color: ACCENT };
}

describe('DeckMonitoringCell segments style', () => {
  it('fills segments proportional to the preview fraction (58% of a 0-100 domain, non-degenerate history)', () => {
    const { container } = render(
      <PanelPreviewProvider value>
        <DeckMonitoringCell action={monitoringAction('segments', 'x')} />
      </PanelPreviewProvider>,
    );
    const segs = Array.from(container.querySelectorAll<HTMLElement>(`.${styles.seg}`));
    expect(segs).toHaveLength(16);
    // Filled count is the preview fixture's fraction rounded against the segment total.
    expect(segs.filter(s => s.style.background === ACCENT)).toHaveLength(9);
    expect(segs.filter(s => s.style.background === TRACK)).toHaveLength(7);
  });

  it('renders a neutral half-fill for a degenerate (no live data) domain', () => {
    const { container } = render(<DeckMonitoringCell action={monitoringAction('segments', 'seg-degenerate')} />);
    const segs = Array.from(container.querySelectorAll<HTMLElement>(`.${styles.seg}`));
    expect(segs).toHaveLength(16);
    expect(segs.filter(s => s.style.background === ACCENT)).toHaveLength(8);
    expect(segs.filter(s => s.style.background === TRACK)).toHaveLength(8);
  });
});

describe('DeckMonitoringCell backdrop style', () => {
  it('renders a dim, unstroked, full-frame chart behind a big centered overlaid value, no bottom value row', () => {
    const { container } = render(
      <PanelPreviewProvider value>
        <DeckMonitoringCell action={monitoringAction('backdrop', 'x')} />
      </PanelPreviewProvider>,
    );
    const chart = container.querySelector(`.${styles.backdropChart}`);
    const fill = chart?.querySelector('path[fill-opacity="0.45"]');
    const stroke = chart?.querySelector('path[stroke-width="0"]');
    expect(chart).not.toBeNull();
    expect(fill).toHaveAttribute('fill', ACCENT);
    expect(stroke).not.toBeNull();
    // The big centered value reuses the 'number' style's own markup.
    const numberWrap = container.querySelector(`.${styles.numberWrap}`);
    expect(numberWrap).not.toBeNull();
    expect(numberWrap?.querySelector(`.${styles.numberValue}`)?.textContent).toBe('58');
    expect(numberWrap?.querySelector(`.${styles.numberUnit}`)?.textContent).toBe('%');
    // No middle graph band and no bottom value row for this style.
    expect(container.querySelector(`.${styles.graph}`)).toBeNull();
    expect(container.querySelector(`.${styles.value}`)).toBeNull();
    expect(container.querySelector(`.${styles.seg}`)).toBeNull();
  });

  it('renders the tile chrome without crashing when there is no history to chart yet', () => {
    const { container, getByText } = render(
      <DeckMonitoringCell action={monitoringAction('backdrop', 'backdrop-degenerate')} />,
    );
    // No sensor resolves and no samples have been pushed yet outside a live
    // socket connection - the Sparkline draws an empty <svg> rather than a
    // path with no drawable points, and the tile still shows its placeholder.
    expect(container.querySelector(`.${styles.backdropChart} svg`)).not.toBeNull();
    expect(container.querySelector(`.${styles.backdropChart} path`)).toBeNull();
    expect(getByText('--')).toBeInTheDocument();
  });
});
