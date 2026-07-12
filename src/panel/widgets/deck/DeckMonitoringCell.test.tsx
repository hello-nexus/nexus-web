import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DeckMonitoringCell } from './DeckMonitoringCell';
import { PanelPreviewProvider } from '../common/PanelPreviewContext';
import type { DeckAction } from './types';
import styles from './DeckMonitoringCell.module.scss';

const ACCENT = 'rgb(255, 0, 0)';
const TRACK = 'rgba(255, 255, 255, 0.18)';

function monitoringAction(
  style: 'line' | 'segments' | 'backdrop' | 'number',
  sensor: string,
  overrides: Partial<Extract<DeckAction, { type: 'monitoring' }>> = {},
): Extract<DeckAction, { type: 'monitoring' }> {
  return { type: 'monitoring', category: 'cpu', sensor, style, color: ACCENT, ...overrides };
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

describe('DeckMonitoringCell name (labelText)', () => {
  it('falls back to the sensor-derived name when labelText is absent', () => {
    const { container } = render(
      <PanelPreviewProvider value>
        <DeckMonitoringCell action={monitoringAction('line', 'x')} />
      </PanelPreviewProvider>,
    );
    expect(container.querySelector(`.${styles.name}`)?.textContent).toBe('CPU Total');
  });

  it('uses labelText as the top name when set, replacing the sensor-derived fallback', () => {
    const { container } = render(
      <PanelPreviewProvider value>
        <DeckMonitoringCell action={monitoringAction('line', 'x', { labelText: 'My Rig' })} />
      </PanelPreviewProvider>,
    );
    expect(container.querySelector(`.${styles.name}`)?.textContent).toBe('My Rig');
  });

  it('never renders the name span when showName is false, regardless of labelText', () => {
    const { container } = render(
      <PanelPreviewProvider value>
        <DeckMonitoringCell action={monitoringAction('line', 'x', { labelText: 'My Rig', showName: false })} />
      </PanelPreviewProvider>,
    );
    expect(container.querySelector(`.${styles.name}`)).toBeNull();
  });
});

describe('DeckMonitoringCell fixed-range domain', () => {
  it('segments: a valid fixed range overrides the fill fraction instead of the adaptive Load domain', () => {
    const { container } = render(
      <PanelPreviewProvider value>
        <DeckMonitoringCell action={monitoringAction('segments', 'x', { scale: 'fixed', min: 0, max: 200 })} />
      </PanelPreviewProvider>,
    );
    const segs = Array.from(container.querySelectorAll<HTMLElement>(`.${styles.seg}`));
    // 58 (preview value) / 200 = 0.29 -> round(0.29 * 16) = 5 filled, vs 9
    // filled under the adaptive 0-100 Load domain the other segments test uses.
    expect(segs.filter(s => s.style.background === ACCENT)).toHaveLength(5);
  });

  it('segments: an inverted (invalid) fixed range falls back to the adaptive domain', () => {
    const { container } = render(
      <PanelPreviewProvider value>
        <DeckMonitoringCell action={monitoringAction('segments', 'x', { scale: 'fixed', min: 200, max: 0 })} />
      </PanelPreviewProvider>,
    );
    const segs = Array.from(container.querySelectorAll<HTMLElement>(`.${styles.seg}`));
    expect(segs.filter(s => s.style.background === ACCENT)).toHaveLength(9);
  });

  it('line: a fixed range changes the drawn chart geometry versus the adaptive domain', () => {
    const adaptive = render(
      <PanelPreviewProvider value>
        <DeckMonitoringCell action={monitoringAction('line', 'x')} />
      </PanelPreviewProvider>,
    );
    const fixed = render(
      <PanelPreviewProvider value>
        <DeckMonitoringCell action={monitoringAction('line', 'x', { scale: 'fixed', min: 0, max: 1000 })} />
      </PanelPreviewProvider>,
    );
    const adaptivePath = adaptive.container.querySelector(`.${styles.graph} path`)?.getAttribute('d');
    const fixedPath = fixed.container.querySelector(`.${styles.graph} path`)?.getAttribute('d');
    expect(adaptivePath).toBeTruthy();
    expect(fixedPath).toBeTruthy();
    expect(fixedPath).not.toBe(adaptivePath);
  });

  it('backdrop: a fixed range changes the drawn chart geometry versus the adaptive domain', () => {
    const adaptive = render(
      <PanelPreviewProvider value>
        <DeckMonitoringCell action={monitoringAction('backdrop', 'x')} />
      </PanelPreviewProvider>,
    );
    const fixed = render(
      <PanelPreviewProvider value>
        <DeckMonitoringCell action={monitoringAction('backdrop', 'x', { scale: 'fixed', min: 0, max: 1000 })} />
      </PanelPreviewProvider>,
    );
    const adaptivePath = adaptive.container.querySelector(`.${styles.backdropChart} path`)?.getAttribute('d');
    const fixedPath = fixed.container.querySelector(`.${styles.backdropChart} path`)?.getAttribute('d');
    expect(fixedPath).not.toBe(adaptivePath);
  });

  it('number style ignores scale/min/max entirely', () => {
    const { container } = render(
      <PanelPreviewProvider value>
        <DeckMonitoringCell action={monitoringAction('number', 'x', { scale: 'fixed', min: 0, max: 1000 })} />
      </PanelPreviewProvider>,
    );
    expect(container.querySelector(`.${styles.numberValue}`)?.textContent).toBe('58');
  });
});
