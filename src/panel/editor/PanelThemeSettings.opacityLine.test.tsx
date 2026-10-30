import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildPanelTheme } from '../theme/panelTheme';
import { PanelThemeSettings } from './PanelThemeSettings';

function renderWithOpacity(backgroundOpacity: number) {
  const theme = { ...buildPanelTheme(null, null), backgroundMode: 'solid' as const, backgroundOpacity };
  const handlers = Object.fromEntries([
    'onThemeSyncCommit', 'onThemeModeCommit', 'onAccentSyncCommit', 'onAccentPreview', 'onAccentCommit', 'onBackgroundPreview', 'onBackgroundCommit',
    'onBackgroundModeCommit', 'onBackdropCommit', 'onBackgroundEffectCommit', 'onBackgroundTemplateCommit', 'onBackgroundEffectStatePreview',
    'onBackgroundEffectStateCommit', 'onBackgroundOpacityPreview', 'onBackgroundOpacityCommit', 'onBackgroundMediaCommit', 'onBackgroundSlideshowCommit',
    'onBackgroundMediaOrderCommit', 'onBackgroundFrostPreview', 'onBackgroundFrostCommit', 'onWidgetOpacityPreview', 'onWidgetOpacityCommit',
    'onWidgetLabelsCommit', 'onWidgetPaddingPreview', 'onWidgetPaddingCommit',
  ].map(name => [name, vi.fn()]));
  render(<PanelThemeSettings theme={theme} resolvedThemeMode="dark" sections="background" {...handlers} />);
}

describe('Background Opacity row', () => {
  it('says the background is not rendering while the value is 0, as plain description text', () => {
    renderWithOpacity(0);
    const line = screen.getByText(/isn't rendering/);
    expect(line.closest('[role="status"], [data-tone]')).toBeNull();
    expect(line.querySelector('svg')).toBeNull();
  });

  it('shows no such line above 0', () => {
    renderWithOpacity(0.4);
    expect(screen.queryByText(/isn't rendering/)).toBeNull();
  });
});
