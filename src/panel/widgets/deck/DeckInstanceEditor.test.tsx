import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeckInstanceEditor } from './DeckInstanceEditor';
import type { UseDeckInstanceResult } from './useDeckInstance';
import type { DeckTarget } from './deckTarget';
import type { DeckConfig } from './types';

vi.mock('./DeckPresetToolbar', () => ({
  DeckPresetToolbar: (props: { desktopActions: boolean; activatePreset: (id: string) => void; onDelete: (id: string) => void; rail?: boolean }) => (
    <div data-testid="preset-toolbar" data-desktop={String(props.desktopActions)}>
      <button type="button" onClick={() => props.activatePreset('p2')}>activate</button>
      <button type="button" onClick={() => props.onDelete('p1')}>delete</button>
    </div>
  ),
}));

vi.mock('./DeckEditor', () => ({
  DeckEditor: ({ target }: { target: DeckTarget }) => <div data-testid="deck-editor">{target.kind}</div>,
}));

vi.mock('./DeckRecentAppsSection', () => ({
  DeckRecentAppsSection: ({ showPreviewNote, desktopActions }: { showPreviewNote: boolean; desktopActions?: boolean }) => (
    <div data-testid="recent-apps-section">{String(showPreviewNote)}:{String(desktopActions)}</div>
  ),
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  }),
}));

const capturedTopics: Record<string, { enabled: boolean; cb: (data: unknown) => void } | null> = {};
vi.mock('../../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: (topic: string, enabled: boolean, cb: (data: unknown) => void) => {
    capturedTopics[topic] = { enabled, cb };
  },
}));

function fakeTarget(): DeckTarget {
  return {
    kind: 'widget', cols: 2, rows: 2, keyCount: 4, config: { pages: [{ slots: [] }] },
    updateSlot: vi.fn(), swapSlots: vi.fn(), addPage: vi.fn(), removePage: vi.fn(), removePageKeyCount: vi.fn(), setTitleDefault: vi.fn(),
    authoredPageCount: 1,
  };
}

function deckResult(over: Partial<UseDeckInstanceResult> = {}): UseDeckInstanceResult {
  return {
    instance: { mode: 'custom', activePresetId: 'p1' },
    preset: { id: 'p1', name: 'A', cols: 2, rows: 2, pageCount: 1, deck: { pages: [{ slots: [] }] } },
    presets: [{ id: 'p1', name: 'A', cols: 2, rows: 2, pageCount: 1 }],
    target: fakeTarget(),
    loaded: true,
    error: false,
    retry: vi.fn(),
    setMode: vi.fn(),
    activate: vi.fn(),
    createPreset: vi.fn(),
    renamePreset: vi.fn(),
    deletePreset: vi.fn(),
    canUndo: false,
    canRedo: false,
    undo: vi.fn(),
    redo: vi.fn(),
    reset: vi.fn(),
    endEditBurst: vi.fn(),
    ...over,
  } as UseDeckInstanceResult;
}

function baseProps(over: Partial<Parameters<typeof DeckInstanceEditor>[0]> = {}) {
  return {
    deck: deckResult(),
    instanceGrid: { cols: 2, rows: 2 },
    kind: 'widget' as const,
    page: 0,
    onPageChange: vi.fn(),
    folderPath: [],
    onFolderPathChange: vi.fn(),
    ...over,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('DeckInstanceEditor - sections', () => {
  it('shows the Recent Apps section only in that mode; no mode chip row exists', () => {
    const { rerender } = render(<DeckInstanceEditor {...baseProps()} />);
    expect(screen.queryByTestId('recent-apps-section')).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'panel.settings.deck.mode.label' })).toBeNull();

    rerender(<DeckInstanceEditor {...baseProps({ deck: deckResult({ instance: { mode: 'recentApps', activePresetId: 'p1' } }) })} />);
    expect(screen.getByTestId('recent-apps-section')).toBeInTheDocument();
  });

  it('a persisted appAware mode behaves as custom: no Recent Apps section, editor body shown', () => {
    render(<DeckInstanceEditor {...baseProps({ deck: deckResult({ instance: { mode: 'appAware', activePresetId: 'p1' } }) })} />);
    expect(screen.queryByTestId('recent-apps-section')).toBeNull();
    expect(screen.getByTestId('deck-editor')).toBeInTheDocument();
  });

  it('tells the Recent Apps section whether it owns the preview note (bodyMode full vs headerRail)', () => {
    const recent = deckResult({ instance: { mode: 'recentApps', activePresetId: 'p1' } });
    const { rerender } = render(<DeckInstanceEditor {...baseProps({ deck: recent })} />);
    expect(screen.getByTestId('recent-apps-section')).toHaveTextContent('true');

    rerender(<DeckInstanceEditor {...baseProps({ deck: recent, bodyMode: 'headerRail' })} />);
    expect(screen.getByTestId('recent-apps-section')).toHaveTextContent('false');
  });

  it('does not render the DeckEditor body in Recent Apps mode even with bodyMode="full"', () => {
    render(<DeckInstanceEditor {...baseProps({ deck: deckResult({ instance: { mode: 'recentApps', activePresetId: 'p1' } }) })} />);
    expect(screen.queryByTestId('deck-editor')).toBeNull();
  });

  it('hides the fit note in Recent Apps mode', () => {
    const deck = deckResult({
      instance: { mode: 'recentApps', activePresetId: 'p1' },
      preset: { id: 'p1', name: 'A', cols: 5, rows: 3, pageCount: 1, deck: { pages: [{ slots: [{ label: 'a' }] }] } },
    });
    render(<DeckInstanceEditor {...baseProps({ deck, instanceGrid: { cols: 2, rows: 2 } })} />);
    expect(screen.queryByText(/fitNote/)).toBeNull();
  });
});

describe('DeckInstanceEditor - inline preset toolbar', () => {
  it('renders the toolbar inline by default and omits it for bodyMode="headerRail"', () => {
    const { rerender } = render(<DeckInstanceEditor {...baseProps()} />);
    expect(screen.getByTestId('preset-toolbar')).toBeInTheDocument();
    rerender(<DeckInstanceEditor {...baseProps({ bodyMode: 'headerRail' })} />);
    expect(screen.queryByTestId('preset-toolbar')).toBeNull();
  });

  it('threads desktopActions: true with no surface or desktopEditor, false on a paired panel surface', () => {
    const { rerender } = render(<DeckInstanceEditor {...baseProps()} />);
    expect(screen.getByTestId('preset-toolbar')).toHaveAttribute('data-desktop', 'true');
    rerender(<DeckInstanceEditor {...baseProps({ surface: 'phone' })} />);
    expect(screen.getByTestId('preset-toolbar')).toHaveAttribute('data-desktop', 'false');
    rerender(<DeckInstanceEditor {...baseProps({ surface: 'phone', desktopEditor: true })} />);
    expect(screen.getByTestId('preset-toolbar')).toHaveAttribute('data-desktop', 'true');
  });

  it('loading a preset activates it and resets page and selected slot', () => {
    const onPageChange = vi.fn();
    const onSelectedSlotChange = vi.fn();
    const deck = deckResult();
    render(<DeckInstanceEditor {...baseProps({ deck, page: 3, onPageChange, onSelectedSlotChange })} />);
    fireEvent.click(screen.getByText('activate'));
    expect(deck.activate).toHaveBeenCalledWith('p2', undefined);
    expect(onPageChange).toHaveBeenCalledWith(0);
    expect(onSelectedSlotChange).toHaveBeenCalledWith(0);
  });

  it('deleting a preset resets page and selected slot', () => {
    const onPageChange = vi.fn();
    const onSelectedSlotChange = vi.fn();
    const deck = deckResult();
    render(<DeckInstanceEditor {...baseProps({ deck, page: 2, onPageChange, onSelectedSlotChange })} />);
    fireEvent.click(screen.getByText('delete'));
    expect(deck.deletePreset).toHaveBeenCalledWith('p1');
    expect(onPageChange).toHaveBeenCalledWith(0);
    expect(onSelectedSlotChange).toHaveBeenCalledWith(0);
  });
});

describe('DeckInstanceEditor - fit note', () => {
  it('shows no fit note when the preset\'s authored grid matches the instance grid', () => {
    render(<DeckInstanceEditor {...baseProps({ instanceGrid: { cols: 2, rows: 2 } })} />);
    expect(screen.queryByText(/fitNote/)).toBeNull();
  });

  it('shows the plain "larger deck" note with no page count when the fitted view is still one page', () => {
    const deck = deckResult({
      preset: { id: 'p1', name: 'A', cols: 5, rows: 3, pageCount: 1, deck: { pages: [{ slots: [{ label: 'a' }] }] } },
    });
    render(<DeckInstanceEditor {...baseProps({ deck, instanceGrid: { cols: 2, rows: 2 } })} />);
    expect(screen.getByText('panel.settings.deck.instance.fitNoteLarger')).toBeInTheDocument();
  });

  it('shows the "larger deck, N pages" note when the authored content actually overflows', () => {
    const bigDeck: DeckConfig = { pages: [{ slots: Array.from({ length: 7 }, (_, i) => ({ label: `k${i}` })) }] };
    const deck = deckResult({
      preset: { id: 'p1', name: 'A', cols: 3, rows: 3, pageCount: 1, deck: bigDeck },
    });
    render(<DeckInstanceEditor {...baseProps({ deck, instanceGrid: { cols: 2, rows: 2 } })} />);
    expect(screen.getByText('panel.settings.deck.instance.fitNoteLargerPaged:{"pages":3}')).toBeInTheDocument();
  });

  it('shows no fit note when the shapes differ but the key count matches (4x2 authored, viewed on a 2x4 instance)', () => {
    const deck = deckResult({
      preset: { id: 'p1', name: 'A', cols: 4, rows: 2, pageCount: 1, deck: { pages: [{ slots: [{ label: 'a' }] }] } },
    });
    render(<DeckInstanceEditor {...baseProps({ deck, instanceGrid: { cols: 2, rows: 4 } })} />);
    expect(screen.queryByText(/fitNote/)).toBeNull();
  });

  it('shows the "smaller deck" note when the preset was authored at a smaller grid', () => {
    const deck = deckResult({
      preset: { id: 'p1', name: 'A', cols: 2, rows: 2, pageCount: 1, deck: { pages: [{ slots: [{ label: 'a' }] }] } },
    });
    render(<DeckInstanceEditor {...baseProps({ deck, instanceGrid: { cols: 3, rows: 3 } })} />);
    expect(screen.getByText('panel.settings.deck.instance.fitNoteSmaller')).toBeInTheDocument();
  });
});

describe('DeckInstanceEditor - body', () => {
  it('renders the shared DeckEditor body by default (bodyMode="full")', () => {
    render(<DeckInstanceEditor {...baseProps()} />);
    expect(screen.getByTestId('deck-editor')).toHaveTextContent('widget');
  });

  it('omits the body entirely for bodyMode="toolbarOnly" (the host renders its own grid)', () => {
    render(<DeckInstanceEditor {...baseProps({ bodyMode: 'headerRail' })} />);
    expect(screen.queryByTestId('deck-editor')).toBeNull();
  });

  it('shows a load-failed state with retry instead of the editor when the target is null due to an error', () => {
    const retry = vi.fn();
    render(<DeckInstanceEditor {...baseProps({ deck: deckResult({ target: null, preset: null, error: true, retry }) })} />);
    expect(screen.getByText('panel.settings.deck.rail.loadFailed')).toBeInTheDocument();
    fireEvent.click(screen.getByText('panel.settings.deck.rail.retry'));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('shows a loading state while the target has not loaded and there is no error', () => {
    render(<DeckInstanceEditor {...baseProps({ deck: deckResult({ target: null, preset: null, error: false }) })} />);
    expect(screen.getByText('panel.settings.deck.rail.loadingConfig')).toBeInTheDocument();
  });
});

describe('DeckInstanceEditor - body', () => {
  it('renders the shared DeckEditor body by default (bodyMode="full")', () => {
    render(<DeckInstanceEditor {...baseProps()} />);
    expect(screen.getByTestId('deck-editor')).toHaveTextContent('widget');
  });

  it('omits the body entirely for bodyMode="headerRail" (the host renders its own grid)', () => {
    render(<DeckInstanceEditor {...baseProps({ bodyMode: 'headerRail' })} />);
    expect(screen.queryByTestId('deck-editor')).toBeNull();
  });

  it('shows a load-failed state with retry instead of the editor when the target is null due to an error', () => {
    const retry = vi.fn();
    render(<DeckInstanceEditor {...baseProps({ deck: deckResult({ target: null, preset: null, error: true, retry }) })} />);
    expect(screen.getByText('panel.settings.deck.rail.loadFailed')).toBeInTheDocument();
    fireEvent.click(screen.getByText('panel.settings.deck.rail.retry'));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('shows a loading state while the target has not loaded and there is no error', () => {
    render(<DeckInstanceEditor {...baseProps({ deck: deckResult({ target: null, preset: null, error: false }) })} />);
    expect(screen.getByText('panel.settings.deck.rail.loadingConfig')).toBeInTheDocument();
  });
});

describe('DeckInstanceEditor - deck-edit presence subscription', () => {
  it('subscribes to deck-edit for as long as the editor is mounted, regardless of mode', () => {
    render(<DeckInstanceEditor {...baseProps()} />);
    expect(capturedTopics['deck-edit']?.enabled).toBe(true);
  });
});
