import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MarketplaceWidgetSettings } from './MarketplaceWidgetSettings';
import { _resetMarketplaceRegistryForTests, _seedMarketplaceRegistryForTests } from '../../../widgets/marketplaceRegistry';
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
  it('shows a struck-through settings glyph above the message, not the app\'s icon', () => {
    seed(ICON);
    const { container } = render(<MarketplaceWidgetSettings widget={widget} />);

    expect(screen.getByText('marketplace.settings.noSettings')).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
    const glyph = container.querySelector('svg')!;
    expect(glyph.getAttribute('aria-hidden')).toBe('true');
    expect(glyph.querySelector('path[d="m2 2 20 20"]')).toBeTruthy();
  });
});
