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

  it('renders an accent-colored line for a continuous series', () => {
    const points = [{ t: 0, avg: 10 }, { t: 1000, avg: 20 }, { t: 2000, avg: 15 }];
    const { container } = render(<ProcessMiniChart points={points} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    const strokePath = container.querySelector('path[stroke="var(--accent)"]');
    expect(strokePath).toBeInTheDocument();
  });

  it('renders a break (two segments) across a large gap', () => {
    const points = [
      { t: 0, avg: 10 }, { t: 1000, avg: 20 },
      { t: 60_000, avg: 15 }, { t: 61_000, avg: 12 },
    ];
    const { container } = render(<ProcessMiniChart points={points} />);
    const strokePaths = container.querySelectorAll('path[stroke="var(--accent)"]');
    expect(strokePaths).toHaveLength(2);
  });
});
