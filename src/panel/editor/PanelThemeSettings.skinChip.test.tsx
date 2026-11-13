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

const chipLabels = () => ['Skin', 'Solid', 'Animations'].filter(n => screen.queryByRole('radio', { name: n }));
const checked = (name: string) => screen.getByRole('radio', { name }).getAttribute('aria-checked') === 'true';

describe('Skin as a source chip under Rendering', () => {
  const skinned = { skin: 'lcd', backgroundMode: 'skin', backgroundModeBefore: 'solid' };

  it('Skin with Rendering = Theme shows every chip with Skin selected', () => {
    render(ui(skinned));
    expect(chipLabels()).toEqual(['Skin', 'Solid', 'Animations']);
    expect(checked('Skin')).toBe(true);
    expect(checked('Theme')).toBe(true);
  });

  it('Skin -> Wallpaper hides the chips and selects Wallpaper', () => {
    render(ui({ ...skinned, backdrop: 'wallpaper' }));
    expect(chipLabels()).toEqual([]);
    expect(checked('Wallpaper')).toBe(true);
  });

  it('Wallpaper -> Theme shows the chips again with Skin still selected', () => {
    const { rerender } = render(ui({ ...skinned, backdrop: 'wallpaper' }));
    rerender(ui({ ...skinned, backdrop: 'theme' }));
    expect(chipLabels()).toEqual(['Skin', 'Solid', 'Animations']);
    expect(checked('Skin')).toBe(true);
  });

  it('Skin -> Solid keeps every chip, Skin included, with Solid selected', () => {
    render(ui({ ...skinned, backgroundMode: 'solid' }));
    expect(chipLabels()).toEqual(['Skin', 'Solid', 'Animations']);
    expect(checked('Solid')).toBe(true);
  });

  it('Solid -> Skin keeps every chip with Skin selected', () => {
    const { rerender } = render(ui({ ...skinned, backgroundMode: 'solid' }));
    rerender(ui(skinned));
    expect(chipLabels()).toEqual(['Skin', 'Solid', 'Animations']);
    expect(checked('Skin')).toBe(true);
  });

  it('without a skin, Theme shows Solid and Animations only and Wallpaper hides them', () => {
    const { rerender } = render(ui({ skin: null, backgroundMode: 'solid' }));
    expect(chipLabels()).toEqual(['Solid', 'Animations']);
    rerender(ui({ skin: null, backgroundMode: 'solid', backdrop: 'wallpaper' }));
    expect(chipLabels()).toEqual([]);
  });
});

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
