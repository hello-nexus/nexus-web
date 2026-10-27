// A stored Snake or Blocks tile on a generic display panel stays on the grid as an unavailable tile, so it can still be removed.

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PanelGenericDisplayProvider } from '../common/PanelDisplayBoundContext';
import type { PanelWidget } from '../../types';
import { SnakeWidget } from './SnakeWidget';
import { BlocksWidget } from '../blocks/BlocksWidget';

afterEach(cleanup);

const widget = (type: string) => ({ id: 'g1', type, size: '2x2', col: 0, row: 0, config: {} }) as PanelWidget;

describe.each([['snake', SnakeWidget], ['blocks', BlocksWidget]] as const)('%s tile', (type, Widget) => {
  it('reads as unavailable on a generic display panel', () => {
    render(<PanelGenericDisplayProvider value><Widget widget={widget(type)} surface="monitor" /></PanelGenericDisplayProvider>);
    expect(screen.getByText('panel.widget.web-view.unsupported')).toBeTruthy();
  });

  it('shows the game tile elsewhere', () => {
    render(<Widget widget={widget(type)} surface="y70" />);
    expect(screen.queryByText('panel.widget.web-view.unsupported')).toBeNull();
  });
});
