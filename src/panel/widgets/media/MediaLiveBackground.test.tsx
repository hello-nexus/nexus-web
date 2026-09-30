import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { PanelImmersiveOpenProvider, PanelImmersiveProvider } from '../common/PanelImmersiveContext';

// The draw gate the tile hands the shared renderer is its whole throttling
// contract; the renderer itself needs WebGL2, which jsdom lacks.
let drawGate: React.RefObject<boolean> | undefined;
vi.mock('../../../hooks/useShaderRenderer', () => ({
  useShaderRenderer: (_c: unknown, _e: unknown, _s: unknown, _a: unknown, options?: { visibleRef?: React.RefObject<boolean> }) => {
    drawGate = options?.visibleRef;
    return { ready: false, loading: false, error: null };
  },
}));
vi.mock('../../../hooks/useAnimateTemplates', () => ({ useAnimateTemplates: () => ({ templates: {} }) }));
vi.mock('../../../hooks/useAudioState', () => ({ useAudioState: () => ({ current: null }) }));

const { MediaLiveBackground } = await import('./MediaLiveBackground');

const tile = (playing: boolean) => <MediaLiveBackground effect="lavahaze" artUrl="" playing={playing} preview={false} />;

describe('MediaLiveBackground draw gate', () => {
  it('draws while playing and visible', () => {
    render(tile(true));
    expect(drawGate?.current).toBe(true);
  });

  it('holds its frame while paused', () => {
    render(tile(false));
    expect(drawGate?.current).toBe(false);
  });

  it('stops under an immersive overlay, but not inside one', () => {
    const covered = render(<PanelImmersiveOpenProvider value={true}>{tile(true)}</PanelImmersiveOpenProvider>);
    expect(drawGate?.current).toBe(false);
    covered.unmount();

    render(
      <PanelImmersiveOpenProvider value={true}>
        <PanelImmersiveProvider value={true}>{tile(true)}</PanelImmersiveProvider>
      </PanelImmersiveOpenProvider>,
    );
    expect(drawGate?.current).toBe(true);
  });
});
