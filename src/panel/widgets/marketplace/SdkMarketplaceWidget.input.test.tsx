// The input mode an SDK app sees on a display-bound panel: a mouse-only display must read as interactive, not 'none'.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { widgetInputOf } from '../../types';

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

const inputFor = (deviceTouch: boolean | undefined) => {
  render(<SdkMarketplaceWidget listing={listing} instanceId="inst-1" size="2x2" surface="monitor" deviceTouch={deviceTouch} />);
  return (sandboxProps.mock.calls.at(-1)?.[0] as { displayInput: string }).displayInput;
};

describe('SDK display input on a monitor panel', () => {
  it('is none without a digitizer when the panel is not display-bound', () => {
    expect(inputFor(widgetInputOf(undefined, false))).toBe('none');
  });

  it('is interactive on a display-bound panel with no digitizer', () => {
    expect(inputFor(widgetInputOf(undefined, true))).not.toBe('none');
    expect(inputFor(widgetInputOf(false, true))).not.toBe('none');
  });
});
