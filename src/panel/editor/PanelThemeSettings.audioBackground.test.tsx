import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildPanelTheme } from '../theme/panelTheme';
import { PanelThemeSettings } from './PanelThemeSettings';

const previewEffects: { effect: string; state: unknown }[] = [];
vi.mock('../widgets/lighting/effecteditor/BackgroundEffectPreview', () => ({
  BackgroundEffectPreview: (p: { effect: string; effectState: unknown }) => {
    previewEffects.push({ effect: p.effect, state: p.effectState });
    return null;
  },
}));

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


const STORED_STATE = { speed: 7, hue: 0.3, colorize: false, params: { u_stored: 1 } };

function renderStoredAudio(audioReactive: boolean) {
  previewEffects.length = 0;
  const theme = {
    ...buildPanelTheme(null, null),
    backgroundMode: 'shader' as const,
    backgroundEffect: 'spectrumbars',
    backgroundTemplate: 2,
    backgroundEffectState: STORED_STATE,
  };
  const onCommit = vi.fn();
  render(
    <PanelThemeSettings
      theme={theme as never}
      resolvedThemeMode="dark"
      sections="background"
      audioReactive={audioReactive}
      {...handlers()}
      onBackgroundEffectStateCommit={onCommit}
    />,
  );
}

describe('PanelThemeSettings stored audio background', () => {
  it('on a surface without audio edits what is drawn: no Effect tab, default effect and state', () => {
    renderStoredAudio(false);
    expect(screen.queryByText('lighting.rightPane.effect')).toBeNull();
    const last = previewEffects.at(-1);
    expect(last?.effect).toBe('plasma');
    expect(last?.state).not.toBe(STORED_STATE);
  });

  it('where audio is allowed keeps the Effect tab and the stored effect and state', () => {
    renderStoredAudio(true);
    expect(screen.getByText('lighting.rightPane.effect')).toBeTruthy();
    const last = previewEffects.at(-1);
    expect(last?.effect).toBe('spectrumbars');
    expect(last?.state).toBe(STORED_STATE);
  });
});
