// A settings-panel edit must not be snapped back by an incoming document while its PATCH is pending.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, act, fireEvent, screen } from '@testing-library/react';

vi.mock('../../../api/service', () => ({
  fetchService: async () => ({ values: { name: 'server0' }, revision: 1 }),
  resolveHttp: (p: string) => p,
  loopbackFetchInit: {},
}));
vi.mock('../../../api/auth', () => ({ getToken: async () => null, handleUnauthorized: async () => null }));

import { MarketplaceWidgetSettings } from './MarketplaceWidgetSettings';
import { _resetMarketplaceRegistryForTests, _seedMarketplaceRegistryForTests } from '../../../widgets/marketplaceRegistry';
import { WidgetSettingsBridge } from '../../../widgets/settingsBridge';
import type { AppInstalledListing } from '../../../widgets/types';
import type { PanelWidget } from '../../types';

const widget = { id: 'p1', type: 'app:com.example.s', size: '2x2', config: {} } as unknown as PanelWidget;

beforeEach(() => {
  vi.useFakeTimers();
  WidgetSettingsBridge._resetSharedForTests();
  _seedMarketplaceRegistryForTests([{
    id: 'com.example.s', name: 'S', version: '1.0.0', surfaces: ['dashboard'], runtime: 'sdk',
    capabilities: {}, source: 'user', iconUrl: null, settings: [{ key: 'name', type: 'string', label: 'Name' }],
  } as unknown as AppInstalledListing]);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); _resetMarketplaceRegistryForTests(); });

describe('settings panel optimistic edit', () => {
  it('is not overwritten by a frame while the patch is in flight, then reconciles', async () => {
    let resolvePatch!: (r: unknown) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise((r) => { resolvePatch = r; })));
    render(<MarketplaceWidgetSettings widget={widget} />);
    await act(async () => {});
    const input = screen.getByDisplayValue('server0') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'mine' } });
    await act(async () => { vi.advanceTimersByTime(300); });
    // Patch is now in flight; a broadcast arrives.
    act(() => { WidgetSettingsBridge.for('p1').apply({ name: 'other' }, 2); });
    expect(input.value).toBe('mine');
    await act(async () => { resolvePatch({ ok: true, status: 200, json: async () => ({ widgetId: 'p1', values: { name: 'mine' }, revision: 3 }) }); });
    expect(input.value).toBe('mine');
    act(() => { WidgetSettingsBridge.for('p1').apply({ name: 'later' }, 4); });
    expect(input.value).toBe('later');
  });
});
