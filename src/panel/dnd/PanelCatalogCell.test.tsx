import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PanelCatalogCell } from './PanelDragCells';
import type { PanelWidget } from '../types';

vi.mock('../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// The cell resolves its preview component through the registry; a stub keeps
// this focused on the cell's own interaction contract.
vi.mock('../widgets/registry', () => ({
  lookupApp: (type: string) =>
    type === 'missing' ? undefined : { meta: { i18nKey: `panel.widget.${type}` }, Widget: () => <div>stub</div> },
}));

const widget: PanelWidget = { id: 'w1', type: 'clock', size: '2x2', col: 0, row: 0 };

describe('PanelCatalogCell', () => {
  it('is activatable by click and keyboard when enabled', () => {
    const onClick = vi.fn();
    render(<PanelCatalogCell widget={widget} label="Clock" onClick={onClick} />);

    const cell = screen.getByRole('button', { name: 'Clock' });
    expect(cell).toHaveAttribute('tabindex', '0');
    expect(cell).not.toHaveAttribute('aria-disabled');

    fireEvent.click(cell);
    fireEvent.keyDown(cell, { key: 'Enter' });
    fireEvent.keyDown(cell, { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it('cannot be activated by click or keyboard when disabled', () => {
    const onClick = vi.fn();
    render(<PanelCatalogCell widget={widget} label="Clock" disabled onClick={onClick} />);

    const cell = screen.getByRole('button', { name: 'Clock' });
    // Keeps role=button so it reads as a real disabled control, but leaves the
    // tab order and drops both handlers.
    expect(cell).toHaveAttribute('aria-disabled', 'true');
    expect(cell).toHaveAttribute('tabindex', '-1');

    fireEvent.click(cell);
    fireEvent.keyDown(cell, { key: 'Enter' });
    fireEvent.keyDown(cell, { key: ' ' });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('keeps a presentational mount out of the tab order and unlabelled as a button', () => {
    render(<PanelCatalogCell widget={widget} label="Clock" />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('scopes the skin to the card and leaves the name strip outside it', () => {
    const { container } = render(
      <PanelCatalogCell
        widget={widget}
        label="Clock"
        previewScope={{ attrs: { 'data-panel-skin': 'lcd', 'data-theme': 'dark' }, style: { '--panel-font': 'Seg7' } as React.CSSProperties }}
      />,
    );

    const scope = container.querySelector('[data-preview-skin]') as HTMLElement;
    expect(scope).toHaveAttribute('data-panel-skin', 'lcd');
    expect(scope).toHaveClass('panel-root');
    expect(scope.style.getPropertyValue('--panel-font')).toBe('Seg7');
    expect(scope.querySelector('[data-widget-type="clock"]')).not.toBeNull();
    expect(scope.contains(screen.getByText('Clock'))).toBe(false);
  });

  it('adds no scope without one', () => {
    const { container } = render(<PanelCatalogCell widget={widget} label="Clock" />);
    expect(container.querySelector('[data-preview-skin]')).toBeNull();
  });
});
