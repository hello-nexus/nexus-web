import { fireEvent, render, screen } from '@testing-library/react';
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

describe('PanelThemeSettings immersive background toggle', () => {
  function renderWith(showImmersiveBackdrop?: boolean) {
    const theme = { ...buildPanelTheme(null, null), backgroundMode: 'solid' as const };
    render(
      <PanelThemeSettings
        theme={theme}
        resolvedThemeMode="dark"
        sections="background"
        showImmersiveBackdrop={showImmersiveBackdrop}
        {...handlers()}
      />,
    );
  }

  it('shows the toggle for touch screens', () => {
    renderWith(true);
    expect(screen.getByText('Immersive background')).toBeTruthy();
  });

  it('hides the toggle for non-touch screens', () => {
    renderWith(false);
    expect(screen.queryByText('Immersive background')).toBeNull();
  });
});

describe('PanelThemeSettings effect search', () => {
  function renderAnimations(showEffectSearch?: boolean) {
    const theme = { ...buildPanelTheme(null, null), backgroundMode: 'shader' as const };
    render(
      <PanelThemeSettings
        theme={theme}
        resolvedThemeMode="dark"
        sections="background"
        showEffectSearch={showEffectSearch}
        {...handlers()}
      />,
    );
  }

  it('is hidden unless requested', () => {
    renderAnimations();
    expect(screen.getAllByLabelText('lighting.controls.sensorliquid').length).toBeGreaterThan(0);
    expect(screen.queryByRole('textbox', { name: 'lighting.effects.search' })).toBeNull();
  });

  it('filters the grid when requested', () => {
    renderAnimations(true);
    const input = screen.getByRole('textbox', { name: 'lighting.effects.search' });
    fireEvent.change(input, { target: { value: 'liquid' } });
    expect(screen.queryAllByLabelText('lighting.controls.plasma').length).toBe(0);
    expect(screen.getAllByLabelText('lighting.controls.sensorliquid').length).toBeGreaterThan(0);
  });
});
