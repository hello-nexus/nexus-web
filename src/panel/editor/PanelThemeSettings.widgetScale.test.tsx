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

function renderTheme(widgetScaleRow?: React.ReactNode) {
  render(
    <PanelThemeSettings
      theme={buildPanelTheme(null, null)}
      resolvedThemeMode="dark"
      sections="theme"
      widgetScaleRow={widgetScaleRow}
      {...handlers()}
    />,
  );
}

describe('PanelThemeSettings widget scale row', () => {
  it('renders the row directly after Widget padding', () => {
    renderTheme(<div data-testid="scale-row" />);
    const padding = screen.getByRole('slider', { name: /widget padding/i });
    const row = screen.getByTestId('scale-row');
    expect(padding.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders nothing extra when no row is passed', () => {
    renderTheme();
    expect(screen.queryByTestId('scale-row')).toBeNull();
  });
});
