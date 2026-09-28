import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketplaceTouch } from './MarketplaceWidget';
import { _resetMarketplaceRegistryForTests, _seedMarketplaceRegistryForTests } from '../../../widgets/marketplaceRegistry';
import type { AppInstalledListing } from '../../../widgets/types';
import type { PanelWidget } from '../../types';

vi.mock('./SdkMarketplaceWidget', () => ({
  SdkMarketplaceWidget: ({ size, sandboxSurface }: { size: string; sandboxSurface: string }) =>
    <div data-testid="sdk" data-size={size} data-surface={sandboxSurface} />,
}));

const listing = {
  id: 'com.example.imm', name: 'App', version: '1.0.0', surfaces: ['dashboard'], runtime: 'sdk', page: false,
  capabilities: {}, sizes: ['2x2', '4x4'], defaultSize: '2x2', source: 'user', preinstalled: false, immersive: true,
} as unknown as AppInstalledListing;

beforeEach(() => _seedMarketplaceRegistryForTests([listing]));
afterEach(() => _resetMarketplaceRegistryForTests());

describe('MarketplaceTouch', () => {
  it('fills the immersive overlay edge to edge, not inside the padded immersive-cell wrapper', () => {
    const widget = { id: 'w1', type: 'app:com.example.imm', size: '2x2', config: {} } as unknown as PanelWidget;
    const { container } = render(<MarketplaceTouch widget={widget} />);

    const sdk = screen.getByTestId('sdk');
    expect(sdk.dataset.size).toBe('4x4');
    expect(sdk.dataset.surface).toBe('immersive');
    expect(sdk.parentElement?.className).toMatch(/fullBleed/);
    expect(container.firstElementChild).toBe(sdk.parentElement);
  });
});
