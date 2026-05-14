import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PanelWidgetCatalog } from './PanelWidgetCatalog';
import type { PanelSurface } from '../types';

vi.mock('../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

interface MockMeta {
  supportedSurfaces: PanelSurface[];
  i18nKey: string;
  sizes: string[];
  touch: 'touch-only' | 'any';
}

vi.mock('../widgets/registry', () => {
  const REGISTRY: Record<string, { meta: MockMeta }> = {
    clock: {
      meta: {
        supportedSurfaces: ['phone', 'y70', 'q60'],
        i18nKey: 'panel.widget.clock',
        sizes: ['2x2'],
        touch: 'any',
      },
    },
    snake: {
      meta: {
        supportedSurfaces: ['phone', 'y70'],
        i18nKey: 'panel.widget.snake',
        sizes: ['4x4'],
        touch: 'touch-only',
      },
    },
    media: {
      meta: {
        supportedSurfaces: ['phone', 'y70', 'q60'],
        i18nKey: 'panel.widget.media',
        sizes: ['2x2'],
        touch: 'any',
      },
    },
  };
  return {
    WIDGET_REGISTRY: REGISTRY,
    // Mirror the real `getCatalogEntries` which the catalog now uses to
    // walk both built-in and marketplace entries; tests don't exercise
    // marketplace registration so the second list stays empty.
    getCatalogEntries: () => Object.entries(REGISTRY),
    pickerSizeFor: () => '2x2',
    widgetAvailableForSurface: (meta: MockMeta, surface: PanelSurface) => {
      if (!meta.supportedSurfaces.includes(surface)) return false;
      if (meta.touch === 'touch-only' && surface === 'q60') return false;
      return true;
    },
  };
});

// The catalog now eagerly triggers a marketplace registry refresh on mount.
// The test environment has no service to talk to, so stub both the
// registry helpers to no-op functions.
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
    expect(screen.queryByRole('button', { name: 'panel.widget.snake' })).toBeNull();
  });

  it('shows touch-only widgets on touch surfaces', () => {
    render(<PanelWidgetCatalog surface="y70" onAdd={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'panel.widget.snake' })).toBeInTheDocument();
  });
});
