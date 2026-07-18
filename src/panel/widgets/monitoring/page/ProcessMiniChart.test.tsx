import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProcessMiniChart } from './ProcessMiniChart';

describe('ProcessMiniChart', () => {
  it('renders nothing for an empty series', () => {
    const { container } = render(<ProcessMiniChart points={[]} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders nothing for a single point (not enough to draw a line)', () => {
    const { container } = render(<ProcessMiniChart points={[{ t: 0, avg: 10 }]} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders an accent-colored fill silhouette for a continuous series, with no stroke line', () => {
    const points = [{ t: 0, avg: 10 }, { t: 1000, avg: 20 }, { t: 2000, avg: 15 }];
    const { container } = render(<ProcessMiniChart points={points} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    const fillPath = container.querySelector('path[fill="var(--accent)"]');
    expect(fillPath).toBeInTheDocument();
    expect(container.querySelector('path[stroke]')).toBeNull();
  });

  it('renders a break (two segments) across a large gap, each as a fill silhouette', () => {
    const points = [
      { t: 0, avg: 10 }, { t: 1000, avg: 20 },
      { t: 60_000, avg: 15 }, { t: 61_000, avg: 12 },
    ];
    const { container } = render(<ProcessMiniChart points={points} />);
    const fillPaths = container.querySelectorAll('path[fill="var(--accent)"]');
    expect(fillPaths).toHaveLength(2);
    expect(container.querySelectorAll('path[stroke]')).toHaveLength(0);
  });
});
