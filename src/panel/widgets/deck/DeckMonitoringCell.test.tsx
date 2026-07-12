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
  it('renders a full-opacity, unstroked filled area chart over the preview history', () => {
    const { container } = render(
      <PanelPreviewProvider value>
        <DeckMonitoringCell action={monitoringAction('backdrop', 'x')} />
      </PanelPreviewProvider>,
    );
    const fill = container.querySelector('path[fill-opacity="1"]');
    const stroke = container.querySelector('path[stroke-width="0"]');
    expect(fill).not.toBeNull();
    expect(fill).toHaveAttribute('fill', ACCENT);
    expect(stroke).not.toBeNull();
    // Only the tile chrome's own segment-bar class should be absent for this style.
    expect(container.querySelector(`.${styles.seg}`)).toBeNull();
  });

  it('renders the tile chrome without crashing when there is no history to chart yet', () => {
    const { container, getByText } = render(
      <DeckMonitoringCell action={monitoringAction('backdrop', 'backdrop-degenerate')} />,
    );
    // No sensor resolves and no samples have been pushed yet outside a live
    // socket connection - the Sparkline draws an empty <svg> rather than a
    // path with no drawable points, and the tile still shows its placeholder.
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('path')).toBeNull();
    expect(getByText('--')).toBeInTheDocument();
  });
});
