import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PANEL_SKINS } from '../skins/skins';
import { buildPanelTheme } from '../theme/panelTheme';
import { PanelThemeSettings } from './PanelThemeSettings';
import { SkinPicker } from './SkinPicker';

vi.mock('../skins/skinLoader', () => ({ useAllSkinStyles: () => true }));

describe('SkinPicker', () => {
  it('renders None first, then every skin in registry order', () => {
    render(<SkinPicker value={null} overrides={{}} mode="dark" onChange={() => {}} />);
    const names = screen.getAllByRole('button').map(b => b.lastElementChild!.textContent);
    expect(names).toEqual(['None', ...PANEL_SKINS.map(s => s.label)]);
  });

  it('marks the selected skin and applies a skin or None on click', () => {
    const onChange = vi.fn();
    render(<SkinPicker value="lcd" overrides={{}} mode="dark" onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'LCD' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Arcade' }));
    expect(onChange).toHaveBeenLastCalledWith('arcade');
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('draws each thumbnail in the panel mode with the remembered accent', () => {
    const { container } = render(<SkinPicker value="lcd" overrides={{ arcade: { accent: '#22c55e' } }} mode="light" onChange={() => {}} />);
    const arcade = container.querySelector<HTMLElement>('[data-thumb="arcade"]')!;
    expect(arcade.getAttribute('data-theme')).toBe('light');
    expect(arcade.style.getPropertyValue('--skin-accent')).toBe('#22c55e');
    const hud = container.querySelector<HTMLElement>('[data-thumb="hud"]')!;
    expect(hud.style.getPropertyValue('--skin-accent')).toBe('#2fd8ff');
  });
});

describe('Skin section Reset', () => {
  const handlerNames = [
    'onThemeSyncCommit', 'onThemeModeCommit', 'onAccentSyncCommit', 'onAccentPreview', 'onAccentCommit', 'onBackgroundPreview', 'onBackgroundCommit',
    'onBackgroundModeCommit', 'onBackdropCommit', 'onBackgroundEffectCommit', 'onBackgroundTemplateCommit', 'onBackgroundEffectStatePreview',
    'onBackgroundEffectStateCommit', 'onBackgroundOpacityPreview', 'onBackgroundOpacityCommit', 'onBackgroundMediaCommit', 'onBackgroundSlideshowCommit',
    'onBackgroundMediaOrderCommit', 'onBackgroundFrostPreview', 'onBackgroundFrostCommit', 'onWidgetOpacityPreview', 'onWidgetOpacityCommit',
    'onWidgetLabelsCommit', 'onWidgetPaddingPreview', 'onWidgetPaddingCommit', 'onSkinCommit', 'onFontCommit', 'onTextColorModeCommit',
    'onTextColorPreview', 'onTextColorCommit',
  ];
  const ui = (over: Record<string, unknown>, onSkinReset = vi.fn()) => {
    const theme = { ...buildPanelTheme(null, null), ...over } as ReturnType<typeof buildPanelTheme>;
    const handlers = Object.fromEntries(handlerNames.map(n => [n, vi.fn()]));
    return <PanelThemeSettings theme={theme} resolvedThemeMode="dark" sections="theme" onSkinReset={onSkinReset} {...handlers} />;
  };

  it('shows only when the active skin has an entry, and clears it on click', () => {
    const onReset = vi.fn();
    const { rerender } = render(ui({ skin: 'arcade', skinOverrides: {} }, onReset));
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
    rerender(ui({ skin: 'lcd', skinOverrides: { arcade: { accent: '#22c55e' } } }, onReset));
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
    rerender(ui({ skin: 'arcade', skinOverrides: { arcade: { accent: '#22c55e' } } }, onReset));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(onReset).toHaveBeenCalledOnce();
  });
});
