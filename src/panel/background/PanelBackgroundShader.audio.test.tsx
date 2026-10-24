import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PanelBackgroundShader } from './PanelBackgroundShader';

const rendered: { effect: string; audioRef: unknown; state: unknown }[] = [];
const audioEnabled: boolean[] = [];
let audioAllowed = true;
let musicOn = true;
const audioRefStub = { current: null };

vi.mock('../../hooks/useShaderRenderer', () => ({
  useShaderRenderer: (_canvas: unknown, effect: string, stateRef: { current: unknown }, audioRef: unknown) => {
    rendered.push({ effect, audioRef, state: stateRef.current });
    return { ready: false, error: null };
  },
}));
vi.mock('../../hooks/useShaderParams', () => ({ useShaderParams: () => ({ specs: {}, sensors: [], loaded: true }) }));
vi.mock('../../hooks/useAudioState', () => ({
  useAudioState: (enabled: boolean) => { audioEnabled.push(enabled); return audioRefStub; },
}));
vi.mock('../../hooks/useMusicReactive', () => ({
  useMusicReactive: () => ({ enabled: musicOn, toggle: () => {}, setLocal: () => {} }),
}));
vi.mock('./panelAudio', () => ({ usePanelAudioReactive: () => audioAllowed }));

const props = { effect: 'spectrumbars', template: 0, opacity: 1 };

describe('PanelBackgroundShader audio effects', () => {
  beforeEach(() => { rendered.length = 0; audioEnabled.length = 0; audioAllowed = true; musicOn = true; });

  it('draws the audio effect and subscribes where audio is allowed', () => {
    render(<PanelBackgroundShader {...props} />);
    expect(rendered.at(-1)?.effect).toBe('spectrumbars');
    expect(rendered.at(-1)?.audioRef).toBe(audioRefStub);
    expect(audioEnabled.at(-1)).toBe(true);
  });

  it('draws the default and never subscribes where audio is not allowed', () => {
    audioAllowed = false;
    render(<PanelBackgroundShader {...props} />);
    expect(rendered.at(-1)?.effect).toBe('plasma');
    expect(audioEnabled.every(enabled => !enabled)).toBe(true);
  });

  it('does not draw the default with the stored audio effect state', () => {
    audioAllowed = false;
    const stored = { speed: 9, hue: 0.9, colorize: true, params: { u_stored: 1 } };
    render(<PanelBackgroundShader {...props} template={3} effectState={stored} />);
    expect(rendered.at(-1)?.effect).toBe('plasma');
    expect(rendered.at(-1)?.state).not.toBe(stored);
  });

  it('keeps the stored state where the audio effect is drawn', () => {
    const stored = { speed: 9, hue: 0.9, colorize: true, params: { u_stored: 1 } };
    render(<PanelBackgroundShader {...props} effectState={stored} />);
    expect(rendered.at(-1)?.state).toBe(stored);
  });

  it('draws the audio effect silent, without a subscription, while Music Reactive is off', () => {
    musicOn = false;
    render(<PanelBackgroundShader {...props} />);
    expect(rendered.at(-1)?.effect).toBe('spectrumbars');
    expect(audioEnabled.every(enabled => !enabled)).toBe(true);
  });

  it('holds no subscription for a non-audio effect', () => {
    render(<PanelBackgroundShader {...props} effect="plasma" />);
    expect(audioEnabled.at(-1)).toBe(false);
  });

  it('releases the subscription while covered', () => {
    render(<PanelBackgroundShader {...props} covered />);
    expect(audioEnabled.at(-1)).toBe(false);
  });
});
