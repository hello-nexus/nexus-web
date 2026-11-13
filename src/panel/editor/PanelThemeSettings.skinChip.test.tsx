import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { offersSkinBackground } from '../theme/panelSkin';
import { buildPanelTheme } from '../theme/panelTheme';
import { PanelThemeSettings } from './PanelThemeSettings';

const handlerNames = [
  'onThemeSyncCommit', 'onThemeModeCommit', 'onAccentSyncCommit', 'onAccentPreview', 'onAccentCommit', 'onBackgroundPreview', 'onBackgroundCommit',
  'onBackgroundModeCommit', 'onBackdropCommit', 'onBackgroundEffectCommit', 'onBackgroundTemplateCommit', 'onBackgroundEffectStatePreview',
  'onBackgroundEffectStateCommit', 'onBackgroundOpacityPreview', 'onBackgroundOpacityCommit', 'onBackgroundMediaCommit', 'onBackgroundSlideshowCommit',
  'onBackgroundMediaOrderCommit', 'onBackgroundFrostPreview', 'onBackgroundFrostCommit', 'onWidgetOpacityPreview', 'onWidgetOpacityCommit',
  'onWidgetLabelsCommit', 'onWidgetPaddingPreview', 'onWidgetPaddingCommit', 'onSkinCommit',
];

function ui(overrides: Record<string, unknown>) {
  const theme = { ...buildPanelTheme(null, null), ...overrides } as ReturnType<typeof buildPanelTheme>;
  const handlers = Object.fromEntries(handlerNames.map(n => [n, vi.fn()]));
  return <PanelThemeSettings theme={theme} resolvedThemeMode="dark" sections="background" showBackdropSelector {...handlers} />;
}

// Position of the Rendering row among its siblings in the background box.
function renderingRowIndex(): number {
  const group = screen.getAllByLabelText('Rendering')[0];
  const row = group.closest('[data-settings-aside] > *') as HTMLElement;
  return Array.from(row.parentElement!.children).indexOf(row);
}

describe('Skin background chip and Rendering row', () => {
  it('offers the chip from the skin, not from the selected mode', () => {
    expect(offersSkinBackground({ ...buildPanelTheme(null, null), skin: 'lcd' })).toBe(true);
    expect(offersSkinBackground({ ...buildPanelTheme(null, null), skin: null })).toBe(false);
  });

  it('keeps the Rendering row in place and the Skin chip present across modes', () => {
    const skinned = { skin: 'lcd', backgroundMode: 'skin', backgroundModeBefore: 'solid' };
    const { rerender } = render(ui(skinned));
    const inSkin = renderingRowIndex();
    expect(screen.getByRole('radio', { name: 'Skin' })).toBeTruthy();
    rerender(ui({ ...skinned, backgroundMode: 'solid' }));
    expect(renderingRowIndex()).toBe(inSkin);
    expect(screen.getByRole('radio', { name: 'Skin' })).toBeTruthy();
    rerender(ui({ ...skinned, backgroundMode: 'shader' }));
    expect(renderingRowIndex()).toBe(inSkin);
    expect(screen.getByRole('radio', { name: 'Skin' })).toBeTruthy();
  });

  it('drops the chip when the skin is None', () => {
    render(ui({ skin: null, backgroundMode: 'solid' }));
    expect(screen.queryByRole('radio', { name: 'Skin' })).toBeNull();
  });
});
