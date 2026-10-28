import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PanelWidget } from '../../types';
import { LightingSettings } from './LightingSettings';

vi.mock('../../../lib/i18n', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('../../../hooks/useUiSettings', () => ({
  useUiSettings: () => ({ settings: { widgetAdvancedMode: false } }),
}));

const widget: PanelWidget = { id: 'l', type: 'lighting', size: '4x2', col: 0, row: 0 };

describe('LightingSettings', () => {
  it('names the toggle for the mode buttons and still saves advancedMode', () => {
    const onUpdate = vi.fn();
    render(<LightingSettings widget={widget} onUpdate={onUpdate} />);
    expect(screen.queryByText('panel.widget.advancedMode')).not.toBeInTheDocument();
    expect(screen.getByText('panel.widget.showModeButtons')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch'));
    expect(onUpdate).toHaveBeenCalledWith({ advancedMode: true });
  });
});
