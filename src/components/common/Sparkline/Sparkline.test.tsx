import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Sparkline } from './Sparkline';

const VALUES = [1, 4, 2, 6, 3];

describe('Sparkline', () => {
  it('renders both a fill and a stroke line by default', () => {
    const { container } = render(<Sparkline values={VALUES} />);
    expect(container.querySelector('path[fill="var(--accent)"]')).not.toBeNull();
    expect(container.querySelector('path[stroke="var(--accent)"]')).not.toBeNull();
  });

  it('renders only the fill, at the silhouette weight, when fillOnly is set', () => {
    const { container } = render(<Sparkline values={VALUES} fillOnly />);
    const fillPath = container.querySelector('path[fill="var(--accent)"]');
    expect(fillPath).not.toBeNull();
    expect(fillPath).toHaveAttribute('fill-opacity', '0.25');
    expect(container.querySelector('path[stroke]')).toBeNull();
  });

  it('lets an explicit fillOpacity override the fillOnly silhouette weight', () => {
    const { container } = render(<Sparkline values={VALUES} fillOnly fillOpacity={0.6} />);
    expect(container.querySelector('path[fill="var(--accent)"]')).toHaveAttribute('fill-opacity', '0.6');
  });
});
