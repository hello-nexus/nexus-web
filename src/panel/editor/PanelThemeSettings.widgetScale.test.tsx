import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildPanelTheme } from '../theme/panelTheme';
import { PanelThemeSettings } from './PanelThemeSettings';

const handlers = () => ({
  onThemeSyncCommit: vi.fn(),
  onThemeModeCommit: vi.fn(),
  onAccentSyncCommit: vi.fn(),
  onAccentPreview: vi.fn(),
  onAccentCommit: vi.fn(),
  onBackgroundPreview: vi.fn(),
  onBackgroundCommit: vi.fn(),
  onBackgroundModeCommit: vi.fn(),
  onBackdropCommit: vi.fn(),
  onBackgroundEffectCommit: vi.fn(),
  onBackgroundTemplateCommit: vi.fn(),
  onBackgroundEffectStatePreview: vi.fn(),
  onBackgroundEffectStateCommit: vi.fn(),
  onBackgroundOpacityPreview: vi.fn(),
  onBackgroundOpacityCommit: vi.fn(),
  onBackgroundMediaCommit: vi.fn(),
  onBackgroundSlideshowCommit: vi.fn(),
  onBackgroundMediaOrderCommit: vi.fn(),
  onBackgroundFrostPreview: vi.fn(),
  onBackgroundFrostCommit: vi.fn(),
  onImmersiveBackdropCommit: vi.fn(),
  onWidgetOpacityPreview: vi.fn(),
  onWidgetOpacityCommit: vi.fn(),
  onWidgetLabelsCommit: vi.fn(),
  onWidgetPaddingPreview: vi.fn(),
  onWidgetPaddingCommit: vi.fn(),
  onTextColorModeCommit: vi.fn(),
  onTextColorPreview: vi.fn(),
  onTextColorCommit: vi.fn(),
  onFontCommit: vi.fn(),
});

function renderTheme(widgetScaleRow?: React.ReactNode, extra: Partial<React.ComponentProps<typeof PanelThemeSettings>> = {}) {
  render(
    <PanelThemeSettings
      theme={buildPanelTheme(null, null)}
      resolvedThemeMode="dark"
      sections="theme"
      widgetScaleRow={widgetScaleRow}
      {...handlers()}
      {...extra}
    />,
  );
}

describe('PanelThemeSettings widget scale row', () => {
  it('renders the row before every other Widgets control on a full panel', () => {
    renderTheme(<div data-testid="scale-row" />);
    const row = screen.getByTestId('scale-row');
    for (const name of [/widget opacity/i, /widget padding/i]) {
      const other = screen.getByRole('slider', { name });
      expect(row.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    const labels = screen.getByRole('switch', { name: /widget labels/i });
    expect(row.compareDocumentPosition(labels) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders the row first on a single-widget panel with labels and chrome hidden', () => {
    renderTheme(<div data-testid="scale-row" />, { hideWidgetLabelsToggle: true, hideWidgetChromeControls: true });
    expect(screen.getByTestId('scale-row')).toBeTruthy();
    expect(screen.queryByRole('slider', { name: /widget padding/i })).toBeNull();
  });

  it('renders nothing extra when no row is passed', () => {
    renderTheme();
    expect(screen.queryByTestId('scale-row')).toBeNull();
  });
});
