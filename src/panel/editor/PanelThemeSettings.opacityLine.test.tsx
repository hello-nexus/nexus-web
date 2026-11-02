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

describe('Background Opacity notice', () => {
  it('shows the info notice under the slider while the value is 0, with no close button', () => {
    renderWithOpacity(0);
    const notice = screen.getByText(/isn't rendering/).closest('[data-tone]');
    expect(notice?.getAttribute('data-tone')).toBe('info');
    expect(notice?.getAttribute('role')).toBe('status');
    expect(notice?.querySelector('button')).toBeNull();
    expect(screen.getByText('Dims the background').textContent).not.toMatch(/rendering/);
  });

  it('shows no such line above 0', () => {
    renderWithOpacity(0.4);
    expect(screen.queryByText(/isn't rendering/)).toBeNull();
  });
});
