import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeckInstanceEditor } from './DeckInstanceEditor';
import type { UseDeckInstanceResult } from './useDeckInstance';
import type { DeckTarget } from './deckTarget';
import type { DeckConfig } from './types';
import type { DeckPresetFull, ImportDeckPresetResult } from '../../../api/deck';

const mockExportDeckPreset = vi.fn<(id: string) => Promise<boolean>>();
const mockImportDeckPreset = vi.fn<(file: File, allowPrivileged: boolean) => Promise<ImportDeckPresetResult>>();
vi.mock('../../../api/deck', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../api/deck')>();
  return {
    ...actual,
    exportDeckPreset: (id: string) => mockExportDeckPreset(id),
    importDeckPreset: (file: File, allowPrivileged: boolean) => mockImportDeckPreset(file, allowPrivileged),
  };
});

vi.mock('./DeckEditor', () => ({
  DeckEditor: ({ target }: { target: DeckTarget }) => <div data-testid="deck-editor">{target.kind}</div>,
}));

vi.mock('./DeckRecentAppsSection', () => ({
  DeckRecentAppsSection: ({ showPreviewNote, desktopActions }: { showPreviewNote: boolean; desktopActions?: boolean }) => (
    <div data-testid="recent-apps-section">{String(showPreviewNote)}:{String(desktopActions)}</div>
  ),
}));

vi.mock('./DeckAppAwareSection', () => ({
  DeckAppAwareSection: ({ desktopActions }: { desktopActions?: boolean }) => (
    <div data-testid="app-aware-section">{String(desktopActions)}</div>
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

describe('DeckInstanceEditor - mode chip', () => {
  it('shows a visible "Mode" label, not just an aria-label', () => {
    render(<DeckInstanceEditor {...baseProps()} />);
    expect(screen.getByText('panel.settings.deck.mode.label')).toBeInTheDocument();
  });

  it('reflects the instance\'s current mode', () => {
    render(<DeckInstanceEditor {...baseProps({ deck: deckResult({ instance: { mode: 'appAware', activePresetId: 'p1' } }) })} />);
    expect(screen.getByRole('radio', { name: 'panel.settings.deck.mode.appAware' })).toHaveAttribute('aria-checked', 'true');
  });

  it('defaults to custom when the instance has not loaded yet', () => {
    render(<DeckInstanceEditor {...baseProps({ deck: deckResult({ instance: null }) })} />);
    expect(screen.getByRole('radio', { name: 'panel.settings.deck.mode.custom' })).toHaveAttribute('aria-checked', 'true');
  });

  it('switching the chip calls setMode', () => {
    const setMode = vi.fn();
    render(<DeckInstanceEditor {...baseProps({ deck: deckResult({ setMode }) })} />);
    fireEvent.click(screen.getByRole('radio', { name: 'panel.settings.deck.mode.recentApps' }));
    expect(setMode).toHaveBeenCalledWith('recentApps');
  });

  it('shows the Recent Apps or App Aware section for their modes, and nothing extra for Custom', () => {
    const { rerender } = render(<DeckInstanceEditor {...baseProps()} />);
    expect(screen.queryByTestId('recent-apps-section')).toBeNull();
    expect(screen.queryByTestId('app-aware-section')).toBeNull();

    rerender(<DeckInstanceEditor {...baseProps({ deck: deckResult({ instance: { mode: 'recentApps', activePresetId: 'p1' } }) })} />);
    expect(screen.getByTestId('recent-apps-section')).toBeInTheDocument();

    rerender(<DeckInstanceEditor {...baseProps({ deck: deckResult({ instance: { mode: 'appAware', activePresetId: 'p1' } }) })} />);
    expect(screen.getByTestId('app-aware-section')).toBeInTheDocument();
  });

  it('tells the Recent Apps section whether it owns the preview note (bodyMode full vs toolbarOnly)', () => {
    const { rerender } = render(<DeckInstanceEditor {...baseProps({ deck: deckResult({ instance: { mode: 'recentApps', activePresetId: 'p1' } }) })} />);
    expect(screen.getByTestId('recent-apps-section')).toHaveTextContent('true');

    rerender(<DeckInstanceEditor {...baseProps({ deck: deckResult({ instance: { mode: 'recentApps', activePresetId: 'p1' } }), bodyMode: 'toolbarOnly' })} />);
    expect(screen.getByTestId('recent-apps-section')).toHaveTextContent('false');
  });
});

describe('DeckInstanceEditor - Recent Apps hides the editable grid', () => {
  it('does not render the DeckEditor body in Recent Apps mode even with bodyMode="full"', () => {
    render(<DeckInstanceEditor {...baseProps({ deck: deckResult({ instance: { mode: 'recentApps', activePresetId: 'p1' } }) })} />);
    expect(screen.queryByTestId('deck-editor')).toBeNull();
    expect(screen.getByTestId('recent-apps-section')).toBeInTheDocument();
  });

  it('hides the preset toolbar, the import file input, and the fit note - none of them are visible in this mode', () => {
    const deck = deckResult({
      instance: { mode: 'recentApps', activePresetId: 'p1' },
      preset: { id: 'p1', name: 'A', cols: 5, rows: 3, pageCount: 1, deck: { pages: [{ slots: [{ label: 'a' }] }] } },
    });
    render(<DeckInstanceEditor {...baseProps({ deck, instanceGrid: { cols: 2, rows: 2 } })} />);

    expect(screen.queryByRole('button', { name: 'panel.settings.deck.presets.placeholder' })).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByText(/fitNote/)).toBeNull();
  });
});

describe('DeckInstanceEditor - preset toolbar wiring', () => {
  it('defaults Load/Delete/Undo/Redo/Reset to the deck hook\'s own methods', () => {
    const deck = deckResult({
      presets: [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }],
      canUndo: true, canRedo: true,
    });
    render(<DeckInstanceEditor {...baseProps({ deck })} />);

    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.presets.placeholder' }));
    fireEvent.click(screen.getByRole('option', { name: 'B' }));
    expect(deck.activate).toHaveBeenCalledWith('p2');

    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.presets.undo' }));
    expect(deck.undo).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.presets.redo' }));
    expect(deck.redo).toHaveBeenCalledTimes(1);
  });

  it('an override prop wins over the deck hook\'s own method', () => {
    const deck = deckResult({ canUndo: true });
    const onUndo = vi.fn();
    render(<DeckInstanceEditor {...baseProps({ deck, onUndo })} />);

    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.presets.undo' }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(deck.undo).not.toHaveBeenCalled();
  });

  it('a newly created preset activates through the host\'s onLoad reset, same as Load', () => {
    const onLoad = vi.fn();
    const deck = deckResult({ createPreset: vi.fn().mockResolvedValue({ error: false }) });
    render(<DeckInstanceEditor {...baseProps({ deck, onLoad })} />);

    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.presets.placeholder' }));
    fireEvent.click(screen.getByRole('option', { name: 'panel.settings.deck.presets.newOption' }));
    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.presets.new' }));

    expect(deck.createPreset).toHaveBeenCalledWith(expect.any(String), onLoad);
  });

  it('without an onLoad override, a newly created preset activates through the hook\'s own activate', () => {
    const deck = deckResult({ createPreset: vi.fn().mockResolvedValue({ error: false }) });
    render(<DeckInstanceEditor {...baseProps({ deck })} />);

    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.presets.placeholder' }));
    fireEvent.click(screen.getByRole('option', { name: 'panel.settings.deck.presets.newOption' }));
    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.presets.new' }));

    expect(deck.createPreset).toHaveBeenCalledWith(expect.any(String), expect.any(Function));
    const activatePreset = deck.createPreset.mock.calls[0][1];
    activatePreset('p9');
    expect(deck.activate).toHaveBeenCalledWith('p9');
  });

  it('without an onLoad override, loading a preset resets page and selected slot (a switched-to preset can have fewer of either)', () => {
    const onPageChange = vi.fn();
    const onSelectedSlotChange = vi.fn();
    const deck = deckResult({ presets: [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }] });
    render(<DeckInstanceEditor {...baseProps({ deck, page: 3, onPageChange, onSelectedSlotChange })} />);

    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.presets.placeholder' }));
    fireEvent.click(screen.getByRole('option', { name: 'B' }));

    expect(deck.activate).toHaveBeenCalledWith('p2');
    expect(onPageChange).toHaveBeenCalledWith(0);
    expect(onSelectedSlotChange).toHaveBeenCalledWith(0);
  });

  it('without an onDelete override, deleting a preset resets page and selected slot', () => {
    const onPageChange = vi.fn();
    const onSelectedSlotChange = vi.fn();
    const deck = deckResult({ presets: [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }] });
    render(<DeckInstanceEditor {...baseProps({ deck, page: 2, onPageChange, onSelectedSlotChange })} />);

    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.presets.placeholder' }));
    fireEvent.click(screen.getByRole('option', { name: 'panel.settings.deck.presets.delete' }));
    fireEvent.click(screen.getByText('confirm.ok'));

    expect(deck.deletePreset).toHaveBeenCalledWith('p1');
    expect(onPageChange).toHaveBeenCalledWith(0);
    expect(onSelectedSlotChange).toHaveBeenCalledWith(0);
  });

  it('an onDelete override still wins, unchanged, over the default reset', () => {
    const onDelete = vi.fn();
    const onPageChange = vi.fn();
    const deck = deckResult({ presets: [{ id: 'p1', name: 'A' }] });
    render(<DeckInstanceEditor {...baseProps({ deck, onDelete, onPageChange })} />);

    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.presets.placeholder' }));
    fireEvent.click(screen.getByRole('option', { name: 'panel.settings.deck.presets.delete' }));
    fireEvent.click(screen.getByText('confirm.ok'));

    expect(onDelete).toHaveBeenCalledWith('p1');
    expect(deck.deletePreset).not.toHaveBeenCalled();
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('hides the import option when onImport is omitted', () => {
    render(<DeckInstanceEditor {...baseProps()} />);
    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.presets.placeholder' }));
    expect(screen.queryByRole('option', { name: 'panel.settings.deck.presets.importOption' })).toBeNull();
  });

  it('shows the import option when onImport is supplied', () => {
    render(<DeckInstanceEditor {...baseProps({ onImport: vi.fn() })} />);
    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.presets.placeholder' }));
    expect(screen.getByRole('option', { name: 'panel.settings.deck.presets.importOption' })).toBeInTheDocument();
  });

  it('offers delete when no surface is given (the desktop device page)', () => {
    render(<DeckInstanceEditor {...baseProps()} />);
    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.presets.placeholder' }));
    expect(screen.getByRole('option', { name: 'panel.settings.deck.presets.delete' })).toBeInTheDocument();
  });

  it('hides delete on a paired panel surface - DELETE /deck/presets/{id} is LocalhostOnly', () => {
    render(<DeckInstanceEditor {...baseProps({ surface: 'phone' })} />);
    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.presets.placeholder' }));
    expect(screen.queryByRole('option', { name: 'panel.settings.deck.presets.delete' })).toBeNull();
  });

  it('still offers delete on a non-desktop surface when desktopEditor marks it as the desktop app\'s own simulated preview', () => {
    render(<DeckInstanceEditor {...baseProps({
      surface: 'phone',
      desktopEditor: true,
    })} />);
    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.presets.placeholder' }));
    expect(screen.getByRole('option', { name: 'panel.settings.deck.presets.delete' })).toBeInTheDocument();
  });

  it('shows Export and Import file when no surface is given (the desktop device page)', () => {
    render(<DeckInstanceEditor {...baseProps()} />);
    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.presets.placeholder' }));
    expect(screen.getByRole('option', { name: 'panel.settings.deck.presets.export' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'panel.settings.deck.presets.importFileOption' })).toBeInTheDocument();
  });

  it('hides Export and Import file on a paired panel surface, same rule as Delete', () => {
    render(<DeckInstanceEditor {...baseProps({ surface: 'phone' })} />);
    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.presets.placeholder' }));
    expect(screen.queryByRole('option', { name: 'panel.settings.deck.presets.export' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'panel.settings.deck.presets.importFileOption' })).toBeNull();
  });

  it('still offers Export and Import file on a non-desktop surface marked desktopEditor', () => {
    render(<DeckInstanceEditor {...baseProps({ surface: 'phone', desktopEditor: true })} />);
    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.presets.placeholder' }));
    expect(screen.getByRole('option', { name: 'panel.settings.deck.presets.export' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'panel.settings.deck.presets.importFileOption' })).toBeInTheDocument();
  });

  it('selecting Export calls exportDeckPreset with the active preset id', () => {
    render(<DeckInstanceEditor {...baseProps()} />);
    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.presets.placeholder' }));
    fireEvent.click(screen.getByRole('option', { name: 'panel.settings.deck.presets.export' }));
    expect(mockExportDeckPreset).toHaveBeenCalledWith('p1');
  });

  it('selecting Import file... opens the hidden file picker', () => {
    render(<DeckInstanceEditor {...baseProps()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');
    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.presets.placeholder' }));
    fireEvent.click(screen.getByRole('option', { name: 'panel.settings.deck.presets.importFileOption' }));
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});

describe('DeckInstanceEditor - import file flow', () => {
  const IMPORTED_PRESET: DeckPresetFull = {
    id: 'p-new', name: 'New', cols: 2, rows: 2, pageCount: 1, deck: { pages: [{ slots: [] }] },
  };
  const FILE = new File(['zip bytes'], 'Streaming.nexus-deck');

  function pickFile(file: File) {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
  }

  it('a successful import activates the imported preset on this instance', async () => {
    mockImportDeckPreset.mockResolvedValue({ kind: 'ok', preset: IMPORTED_PRESET });
    const activate = vi.fn();
    render(<DeckInstanceEditor {...baseProps({ deck: deckResult({ activate }) })} />);

    pickFile(FILE);

    await waitFor(() => expect(mockImportDeckPreset).toHaveBeenCalledWith(FILE, false));
    await waitFor(() => expect(activate).toHaveBeenCalledWith('p-new'));
  });

  it('a 409 name conflict shows the server message with no retry offered', async () => {
    mockImportDeckPreset.mockResolvedValue({ kind: 'conflict', msg: 'A preset named "Streaming" already exists.' });
    render(<DeckInstanceEditor {...baseProps()} />);

    pickFile(FILE);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('A preset named "Streaming" already exists.'));
    expect(screen.queryByRole('button', { name: 'panel.settings.deck.presets.importAnyway' })).toBeNull();
  });

  it('a privileged-package rejection shows the message with an Import anyway retry, resent with allowPrivileged=true', async () => {
    mockImportDeckPreset
      .mockResolvedValueOnce({ kind: 'privileged', msg: 'This package needs extra permission.' })
      .mockResolvedValueOnce({ kind: 'ok', preset: IMPORTED_PRESET });
    const activate = vi.fn();
    render(<DeckInstanceEditor {...baseProps({ deck: deckResult({ activate }) })} />);

    pickFile(FILE);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('This package needs extra permission.'));

    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.presets.importAnyway' }));

    await waitFor(() => expect(mockImportDeckPreset).toHaveBeenLastCalledWith(FILE, true));
    await waitFor(() => expect(activate).toHaveBeenCalledWith('p-new'));
  });

  it('a transport failure shows the generic import-failed message', async () => {
    mockImportDeckPreset.mockResolvedValue({ kind: 'failed' });
    render(<DeckInstanceEditor {...baseProps()} />);

    pickFile(FILE);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('panel.settings.deck.presets.importFailed'));
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
    render(<DeckInstanceEditor {...baseProps({ bodyMode: 'toolbarOnly' })} />);
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

describe('DeckInstanceEditor - desktopActions threading (LocalhostOnly preset-apps/templates/recent-apps routes)', () => {
  it('is true for the desktop device page (no surface)', () => {
    render(<DeckInstanceEditor {...baseProps({ deck: deckResult({ instance: { mode: 'appAware', activePresetId: 'p1' } }) })} />);
    expect(screen.getByTestId('app-aware-section')).toHaveTextContent('true');
  });

  it('is false on a paired panel surface', () => {
    render(<DeckInstanceEditor {...baseProps({
      deck: deckResult({ instance: { mode: 'appAware', activePresetId: 'p1' } }), surface: 'phone',
    })}
    />);
    expect(screen.getByTestId('app-aware-section')).toHaveTextContent('false');
  });

  it('is true on a non-desktop surface marked desktopEditor (the desktop app\'s own simulated preview)', () => {
    render(<DeckInstanceEditor {...baseProps({
      deck: deckResult({ instance: { mode: 'appAware', activePresetId: 'p1' } }), surface: 'phone', desktopEditor: true,
    })}
    />);
    expect(screen.getByTestId('app-aware-section')).toHaveTextContent('true');
  });
});

describe('DeckInstanceEditor - deck-edit presence subscription', () => {
  it('subscribes to deck-edit for as long as the editor is mounted, regardless of mode', () => {
    render(<DeckInstanceEditor {...baseProps()} />);
    expect(capturedTopics['deck-edit']?.enabled).toBe(true);
  });
});
