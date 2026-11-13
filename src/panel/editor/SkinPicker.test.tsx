import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PANEL_SKINS } from '../skins/skins';
import { buildPanelTheme } from '../theme/panelTheme';
import { PanelThemeSettings } from './PanelThemeSettings';
import { SkinPicker } from './SkinPicker';

vi.mock('../skins/skinLoader', () => ({ useAllSkinStyles: () => true }));

describe('SkinPicker', () => {
  it('renders Default first, then every skin in registry order', () => {
    render(<SkinPicker value={null} overrides={{}} mode="dark" onChange={() => {}} />);
    const names = screen.getAllByRole('button').map(b => b.getAttribute('aria-label'));
    expect(names).toEqual(['Default', ...PANEL_SKINS.map(s => s.label)]);
  });

  it('keeps Default selected with no skin and draws it with the panel theme variables, unskinned', () => {
    const { container } = render(<SkinPicker value={null} overrides={{}} mode="dark" baseStyle={{ '--accent': '#123456' } as React.CSSProperties} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Default' }).getAttribute('aria-pressed')).toBe('true');
    const thumb = container.querySelector<HTMLElement>('[data-thumb="default"]')!;
    expect(thumb.hasAttribute('data-panel-skin')).toBe(false);
    expect(thumb.style.getPropertyValue('--accent')).toBe('#123456');
  });

  it('marks the selected skin and applies a skin or None on click', () => {
    const onChange = vi.fn();
    render(<SkinPicker value="lcd" overrides={{}} mode="dark" onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'LCD' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Arcade' }));
    expect(onChange).toHaveBeenLastCalledWith('arcade');
    fireEvent.click(screen.getByRole('button', { name: 'Default' }));
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

describe('SkinPicker reset action', () => {
  const overrides = { arcade: { accent: '#22c55e' } };

  it('shows only on the selected skin and only when it has an entry', () => {
    const { rerender } = render(<SkinPicker value="arcade" overrides={overrides} mode="dark" onReset={() => {}} onChange={() => {}} />);
    expect(screen.getAllByRole('button', { name: 'Reset' })).toHaveLength(1);
    rerender(<SkinPicker value="lcd" overrides={overrides} mode="dark" onReset={() => {}} onChange={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
    rerender(<SkinPicker value="arcade" overrides={{}} mode="dark" onReset={() => {}} onChange={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
  });

  it('never shows on an unselected card, even one with a remembered entry', () => {
    render(<SkinPicker value="arcade" overrides={{ arcade: { accent: '#22c55e' }, lcd: { accent: '#ff0000' }, hud: { font: 'pixel' } }} mode="dark" onReset={() => {}} onChange={() => {}} />);
    const resets = screen.getAllByRole('button', { name: 'Reset' });
    expect(resets).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Arcade' }).contains(resets[0])).toBe(true);
    expect(screen.getByRole('button', { name: 'LCD' }).querySelector('[data-card-delete]')).toBeNull();
  });

  it('is revealed by the shared card hover rule, not left always visible', () => {
    render(<SkinPicker value="arcade" overrides={{ arcade: { accent: '#22c55e' } }} mode="dark" onReset={() => {}} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Reset' }).getAttribute('data-card-delete')).toBe('hover');
  });

  it('resets without selecting the card', () => {
    const onReset = vi.fn();
    const onChange = vi.fn();
    render(<SkinPicker value="arcade" overrides={overrides} mode="dark" onReset={onReset} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(onReset).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
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
