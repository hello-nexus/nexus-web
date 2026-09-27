// useImmersive().enter is the SDK's feature-detection primitive: an app
// button that opens the fullscreen view exists only when the host actually
// wired a callback. The host (SandboxedWidget) always sets `immersive` and
// `api.enterImmersive` together, so a store that mirrors that contract is
// enough to cover the hook without spinning up a worker.

import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore, ContextProvider, type WidgetHostApi } from '../../../sdk/runtime/context';
import { useImmersive } from '../../../sdk/runtime/hooks';

function Probe({ onRender }: { onRender: (v: ReturnType<typeof useImmersive>) => void }) {
  onRender(useImmersive());
  return null;
}

function renderWithApi(api: Partial<WidgetHostApi>, immersive: boolean) {
  const store = createStore({
    instanceId: 'i-1',
    widgetId: 'w-1',
    immersive,
    size: { width: 100, height: 100 },
    settings: {},
    local: {},
    api: { persistLocal: () => {}, dispatch: () => Promise.resolve(null), ...api },
  });
  let seen: ReturnType<typeof useImmersive> | null = null;
  render(
    <ContextProvider store={store}>
      <Probe onRender={v => { seen = v; }} />
    </ContextProvider>,
  );
  return seen!;
}

afterEach(cleanup);

describe('useImmersive().enter', () => {
  it('is undefined when the host gives no enterImmersive callback', () => {
    const result = renderWithApi({}, false);
    expect(result.enter).toBeUndefined();
  });

  it('is the host callback when one is wired', () => {
    const enterImmersive = vi.fn();
    const result = renderWithApi({ enterImmersive }, false);
    expect(result.enter).toBe(enterImmersive);
    result.enter?.();
    expect(enterImmersive).toHaveBeenCalledTimes(1);
  });

  it('is undefined inside the immersive view itself, matching the host contract', () => {
    // The host never sets api.enterImmersive on the immersive worker's own
    // context - immersive:true and enterImmersive both come from SandboxedWidget
    // in the same branch, so a render that is already immersive has none.
    const result = renderWithApi({}, true);
    expect(result.enter).toBeUndefined();
  });
});
