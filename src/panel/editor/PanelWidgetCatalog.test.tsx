import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PanelWidgetCatalog } from './PanelWidgetCatalog';
import type { PanelSurface } from '../types';

vi.mock('../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Curation only applies on beta/prod; DEV_TOOLS builds show everything. Pin the
// curated (non-dev) path so the delist assertions below are meaningful.
vi.mock('../../lib/devTools', () => ({ DEV_TOOLS: false }));

interface MockMeta {
  i18nKey: string;
  sizes: string[];
  touch: boolean;
  listed?: boolean;
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
        sizes: ['2x2', '4x2'],
        touch: false,
      },
    },
    discord: {
      meta: {
        i18nKey: 'panel.widget.discord',
        sizes: ['4x4'],
        touch: true,
        listed: false,
      },
    },
  };
  return {
    APP_REGISTRY: REGISTRY,
    // Mirror getCatalogEntries (built-in + marketplace). Tests don't register
    // marketplace widgets, so that list stays empty.
    getCatalogEntries: () => Object.entries(REGISTRY),
    sizesForSurface: (meta: MockMeta) => meta.sizes,
    pickerSizeFor: (meta: MockMeta) => (meta.sizes.includes('4x2') ? '4x2' : meta.sizes[0]),
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
  loadMarketplaceApps: () => Promise.resolve(),
  subscribeMarketplaceRegistry: () => () => {},
  isMarketplaceType: (type: string) => type.startsWith('app:'),
  marketplaceIdFromType: (type: string) =>
    type.startsWith('app:') ? type.slice('app:'.length) : null,
  isMarketplaceIdEnabled: () => true,
}));

vi.mock('../dnd/PanelDragCells', () => ({
  PanelCatalogCell: ({
    widget,
    label,
    onClick,
  }: {
    widget: { size: string };
    label: string;
    onClick: () => void;
  }) => (
    <button type="button" data-size={widget.size} onClick={onClick}>
      {label}
    </button>
  ),
}));

describe('PanelWidgetCatalog', () => {
  beforeEach(() => {
    localStorage.clear();
  });

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

  it('omits delisted widgets (meta.listed === false) on beta/prod builds', () => {
    render(<PanelWidgetCatalog surface="y70" onAdd={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'panel.widget.clock' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'panel.widget.discord' })).toBeNull();
  });

  it('previews widgets at 2x2 by default when they support it', () => {
    render(<PanelWidgetCatalog surface="desktop" onAdd={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'panel.widget.media' })).toHaveAttribute('data-size', '2x2');
    expect(screen.getByRole('button', { name: 'panel.widget.lighting' })).toHaveAttribute('data-size', '4x4');
  });

  it('renders the size chips as icon buttons with a hover tooltip', () => {
    render(<PanelWidgetCatalog surface="desktop" onAdd={vi.fn()} />);

    const chip = screen.getByRole('button', { name: '4x2' });
    expect(chip).toHaveAttribute('title', 'panel.add.preferSize');
    expect(chip.querySelector('svg')).not.toBeNull();
  });

  it('switches supporting widgets to 4x2 via the size chips and persists the choice', () => {
    const onAdd = vi.fn();
    render(<PanelWidgetCatalog surface="desktop" onAdd={onAdd} />);

    fireEvent.click(screen.getByRole('button', { name: '4x2' }));

    // Widgets without a 4x2 variant keep their own shape.
    expect(screen.getByRole('button', { name: 'panel.widget.media' })).toHaveAttribute('data-size', '4x2');
    expect(screen.getByRole('button', { name: 'panel.widget.clock' })).toHaveAttribute('data-size', '2x2');
    expect(screen.getByRole('button', { name: 'panel.widget.lighting' })).toHaveAttribute('data-size', '4x4');
    expect(localStorage.getItem('nexus.catalog.preferredSize')).toBe(JSON.stringify('4x2'));

    // Adding inserts at the browsed size.
    fireEvent.click(screen.getByRole('button', { name: 'panel.widget.media' }));
    expect(onAdd).toHaveBeenCalledWith('media', '4x2');
  });

  it('seeds the size preference from localStorage', () => {
    localStorage.setItem('nexus.catalog.preferredSize', JSON.stringify('4x2'));
    render(<PanelWidgetCatalog surface="desktop" onAdd={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'panel.widget.media' })).toHaveAttribute('data-size', '4x2');
  });

  it('hides the size chips on single-widget surfaces', () => {
    render(<PanelWidgetCatalog surface="q60" onAdd={vi.fn()} />);

    expect(screen.queryByRole('group', { name: 'panel.add.sizePreference' })).toBeNull();
  });
});
