import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MarketplaceWidgetSettings } from './MarketplaceWidgetSettings';
import { _resetMarketplaceRegistryForTests, _seedMarketplaceRegistryForTests } from '../../../widgets/marketplaceRegistry';
import { resolveHttp } from '../../../api/service';
import type { AppInstalledListing } from '../../../widgets/types';
import type { PanelWidget } from '../../types';

vi.mock('../../../widgets/settingsBridge', () => ({
  WidgetSettingsBridge: class {
    load() { return Promise.resolve({}); }
    onChange() { return () => {}; }
    patch() { return Promise.resolve(); }
  },
}));

const ICON = '/apps-api/installed/com.example.bare/asset/assets/icon.svg';

function seed(iconUrl: string | null) {
  _seedMarketplaceRegistryForTests([{
    id: 'com.example.bare', name: 'Bare', version: '1.0.0', surfaces: ['dashboard'], runtime: 'sdk',
    capabilities: {}, source: 'user', iconUrl,
  } as unknown as AppInstalledListing]);
}

const widget = { id: 'w1', type: 'app:com.example.bare', size: '2x2', config: {} } as unknown as PanelWidget;

afterEach(() => _resetMarketplaceRegistryForTests());

describe('MarketplaceWidgetSettings with no settings', () => {
  it('shows the app icon above the message', () => {
    seed(ICON);
    const { container } = render(<MarketplaceWidgetSettings widget={widget} />);

    expect(screen.getByText('marketplace.settings.noSettings')).toBeTruthy();
    expect(container.querySelector('img')?.getAttribute('src')).toBe(resolveHttp(ICON));
  });

  it('falls back to a drawn glyph when the app has no icon or it fails to load', () => {
    seed(ICON);
    const { container } = render(<MarketplaceWidgetSettings widget={widget} />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).toBeTruthy();

    _resetMarketplaceRegistryForTests();
    seed(null);
    const bare = render(<MarketplaceWidgetSettings widget={widget} />);
    expect(bare.container.querySelector('img')).toBeNull();
    expect(bare.container.querySelector('svg')).toBeTruthy();
  });
});
