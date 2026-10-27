// The input mode an SDK app sees on a monitor panel: a generic display driven by a mouse reads pointer, a known display keeps its own answer.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { cellInputOf, isGenericDisplayPanel } from '../../types';
import { PanelDigitizerProvider, PanelGenericDisplayProvider } from '../common/PanelDisplayBoundContext';

const sandboxProps = vi.fn();
vi.mock('../../../api/service', () => ({
  postService: async () => ({ error: false }),
  fetchService: async () => ({ values: {} }),
}));
vi.mock('./useSdkBundle', () => ({
  useSdkBundle: () => ({ entryUrl: 'entry.mjs', failed: false }),
  useSdkRuntime: () => ({ runtimeUrl: 'runtime.mjs', failed: false }),
}));
vi.mock('../../../sandbox/SandboxedWidget', () => ({
  SandboxedWidget: (props: unknown) => { sandboxProps(props); return null; },
}));

import { SdkMarketplaceWidget } from './SdkMarketplaceWidget';

const listing = { id: 'com.example.app', name: 'Demo', capabilities: {} } as never;

afterEach(() => { cleanup(); sandboxProps.mockClear(); });

// Mirrors PanelContent: the providers carry the raw digitizer, the cell gets cellInputOf.
const inputFor = (family: string | undefined, digitizer: boolean | undefined) => {
  const generic = isGenericDisplayPanel('monitor', family, true);
  render(
    <PanelGenericDisplayProvider value={generic}>
      <PanelDigitizerProvider value={digitizer}>
        <SdkMarketplaceWidget listing={listing} instanceId="inst-1" size="2x2" surface="monitor" deviceTouch={cellInputOf(digitizer, generic)} />
      </PanelDigitizerProvider>
    </PanelGenericDisplayProvider>,
  );
  return (sandboxProps.mock.calls.at(-1)?.[0] as { displayInput: string }).displayInput;
};

describe('SDK display input on a monitor panel', () => {
  it('is pointer on a generic display with no digitizer', () => {
    expect(inputFor(undefined, undefined)).toBe('pointer');
    expect(inputFor(undefined, false)).toBe('pointer');
  });

  it('is touch on a generic display with a digitizer', () => {
    expect(inputFor(undefined, true)).toBe('touch');
  });

  it('keeps the old answer on a known display', () => {
    expect(inputFor('icue-link-lcd5', false)).toBe('none');
    expect(inputFor('icue-link-lcd5', undefined)).toBe('none');
    expect(inputFor('xeneon-edge', true)).toBe('touch');
  });
});
