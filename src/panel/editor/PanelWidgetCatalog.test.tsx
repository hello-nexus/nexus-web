import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PanelWidgetCatalog } from './PanelWidgetCatalog';
import type { PanelSurface } from '../types';

vi.mock('../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

interface MockMeta {
  i18nKey: string;
  sizes: string[];
  touch: boolean;
}

vi.mock('../widgets/registry', () => {
  const REGISTRY: Record<string, { meta: MockMeta }> = {
    clock: {
      meta: {
        i18nKey: 'panel.widget.clock',
        sizes: ['2x2'],
        touch: false,
      },
    },
    lighting: {
      meta: {
        i18nKey: 'panel.widget.lighting',
        sizes: ['4x4'],
        touch: true,
      },
    },
    media: {
      meta: {
        i18nKey: 'panel.widget.media',
        sizes: ['2x2'],
        touch: false,
      },
    },
  };
  return {
    APP_REGISTRY: REGISTRY,
    // Mirror getCatalogEntries (built-in + marketplace). Tests don't register
    // marketplace widgets, so that list stays empty.
    getCatalogEntries: () => Object.entries(REGISTRY),
    pickerSizeFor: () => '2x2',
    appAvailableForSurface: (meta: MockMeta, surface: PanelSurface) => {
      // Runtime rule: touch-required widgets hidden on the no-touch q60.
      if (meta.touch && surface === 'q60') return false;
      return true;
    },
  };
});

// The catalog refreshes the marketplace registry on mount; with no service in
// the test environment, stub the registry helpers to no-ops.
vi.mock('../../widgets/marketplaceRegistry', () => ({
  isMarketplaceRegistryStale: () => false,
  loadMarketplaceWidgets: () => Promise.resolve(),
  subscribeMarketplaceRegistry: () => () => {},
  isMarketplaceType: (type: string) => type.startsWith('marketplace:'),
  marketplaceIdFromType: (type: string) =>
    type.startsWith('marketplace:') ? type.slice('marketplace:'.length) : null,
  isMarketplaceIdEnabled: () => true,
}));

vi.mock('../widgets/common/WidgetPreviewCard', () => ({
  WidgetPreviewCard: ({
    label,
    onClick,
  }: {
    label: string;
    onClick: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {label}
    </button>
  ),
}));

describe('PanelWidgetCatalog', () => {
  it('keeps the add-widget search input unfocused when the sheet opens', () => {
    render(<PanelWidgetCatalog surface="phone" onAdd={vi.fn()} />);

    const search = screen.getByRole('textbox', { name: 'panel.add.searchPlaceholder' });

    expect(search).toBeInTheDocument();
    expect(search).not.toHaveFocus();
  });

  it('hides touch-only widgets on the q60 surface', () => {
    render(<PanelWidgetCatalog surface="q60" onAdd={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'panel.widget.clock' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'panel.widget.media' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'panel.widget.lighting' })).toBeNull();
  });

  it('shows touch-only widgets on touch surfaces', () => {
    render(<PanelWidgetCatalog surface="y70" onAdd={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'panel.widget.lighting' })).toBeInTheDocument();
  });
});
