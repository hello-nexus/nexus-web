import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PanelBackgroundSolid } from './PanelBackgroundSolid';

describe('PanelBackgroundSolid', () => {
  it('paints the solid layer at the given opacity', () => {
    const { container } = render(<PanelBackgroundSolid opacity={0.4} />);
    const layer = container.querySelector<HTMLElement>('[data-panel-bg-layer]')!;
    expect(layer.className).toMatch(/backgroundSolid/);
    expect(layer.style.getPropertyValue('--panel-background-opacity')).toBe('0.4');
  });
});
