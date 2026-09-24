import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildPanelTheme } from '../theme/panelTheme';
import { PanelThemeSettings } from './PanelThemeSettings';

function renderBackground(backgroundHeldBy: string | null) {
  const theme = { ...buildPanelTheme(null, null), backgroundMode: 'solid' as const };
  render(
    <PanelThemeSettings
      theme={theme}
      resolvedThemeMode="dark"
      sections="background"
      backgroundHeldBy={backgroundHeldBy}
      {...handlers()}
    />,
  );
}

function handlers() {
  return {
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
    onWidgetOpacityPreview: vi.fn(),
    onWidgetOpacityCommit: vi.fn(),
    onWidgetLabelsCommit: vi.fn(),
    onWidgetPaddingPreview: vi.fn(),
    onWidgetPaddingCommit: vi.fn(),
  };
}

describe('PanelThemeSettings background notice', () => {
  it('names the focus mode holding the background', () => {
    renderBackground('Game Mode');
    expect(screen.getByRole('status').textContent).toContain('Game Mode');
  });

  it('shows nothing when no focus mode holds it', () => {
    renderBackground(null);
    expect(screen.queryByRole('status')).toBeNull();
  });
});
