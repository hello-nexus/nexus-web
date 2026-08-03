import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SMART_LIGHT_GUIDE_URLS } from '../../../lib/externalLinks';
import { SmartLightsAddColumn, type SmartLightsController } from './SmartLightsPage';

vi.mock('../../../lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

function makeCtrl(brandEnabled: Record<string, boolean>): SmartLightsController {
  return {
    paired: [],
    brandEnabled,
    discovered: [],
    resultBrand: null,
    scanningBrand: null,
    scanError: null,
    pairState: { kind: 'idle' },
    ipBrand: 'govee',
    ipHost: '',
    grouped: new Map(),
    setIpBrand: vi.fn(),
    setIpHost: vi.fn(),
    handleScan: vi.fn(),
    handleBrandToggle: vi.fn(),
    doPair: vi.fn(),
    handleAddByIp: vi.fn(),
    handleToggleEnabled: vi.fn(),
  };
}

describe('SmartLightsAddColumn', () => {
  it('offers only brands with a shipped driver', () => {
    const { container } = render(<SmartLightsAddColumn ctrl={makeCtrl({})} />);
    const brandNames = [...container.querySelectorAll('[class*="brandName"]')].map(el => el.textContent);
    expect(brandNames).toEqual(['smartLights.brandHue', 'smartLights.brandGovee']);
  });

  it('hides the setup guide link until the brand is enabled', () => {
    render(<SmartLightsAddColumn ctrl={makeCtrl({})} />);
    expect(screen.queryAllByRole('link', { name: /howToConnect/ })).toHaveLength(0);
  });

  it('links each enabled brand to its own setup guide', () => {
    render(<SmartLightsAddColumn ctrl={makeCtrl({ hue: true, govee: true })} />);
    const links = screen.getAllByRole('link', { name: /howToConnect/ });
    expect(links.map(a => a.getAttribute('href')))
      .toEqual([SMART_LIGHT_GUIDE_URLS.hue, SMART_LIGHT_GUIDE_URLS.govee]);
    expect(links.every(a => a.getAttribute('target') === '_blank')).toBe(true);
  });
});
