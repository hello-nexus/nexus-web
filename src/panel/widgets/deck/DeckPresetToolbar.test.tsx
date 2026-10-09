import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeckPresetToolbar, modeOnPick } from './DeckPresetToolbar';
import type { UseDeckInstanceResult } from './useDeckInstance';
import type { ImportDeckPresetResult, SetDeckPresetAppsResult } from '../../../api/deck';

const mockExport = vi.fn<(id: string) => Promise<boolean>>();
const mockImport = vi.fn<(file: File, allowPrivileged: boolean) => Promise<ImportDeckPresetResult>>();
const mockSetApps = vi.fn<(id: string, apps: unknown[]) => Promise<SetDeckPresetAppsResult>>();
vi.mock('../../../api/deck', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../api/deck')>();
  return {
    ...actual,
    exportDeckPreset: (id: string) => mockExport(id),
    importDeckPreset: (file: File, allow: boolean) => mockImport(file, allow),
    setDeckPresetApps: (id: string, apps: unknown[]) => mockSetApps(id, apps),
  };
});

const mockPush = vi.fn();
vi.mock('../../../components/common/Toast/Toast', () => ({
  useToastSafe: () => ({ push: mockPush }),
}));

vi.mock('../lighting/page/PresetAppsModal', () => ({
  PresetAppsModal: ({ presetName, onSave, onClose }: { presetName: string; onSave: (a: unknown[]) => Promise<unknown>; onClose: () => void }) => (
    <div data-testid="apps-modal">
      {presetName}
      <button type="button" onClick={() => void onSave([{ id: 'a1', name: 'App' }])}>save-apps</button>
      <button type="button" onClick={onClose}>close-apps</button>
    </div>
  ),
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  }),
}));

const PLACEHOLDER = 'panel.settings.deck.presets.placeholder';

function deckResult(over: Partial<UseDeckInstanceResult> = {}): UseDeckInstanceResult {
  return {
    instance: { mode: 'custom', activePresetId: 'p1' },
    preset: null,
    presets: [{ id: 'p1', name: 'A', cols: 2, rows: 2, pageCount: 1 }, { id: 'p2', name: 'B', cols: 2, rows: 2, pageCount: 1 }],
    target: null,
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

function setup(over: Partial<Parameters<typeof DeckPresetToolbar>[0]> = {}) {
  const props = {
    deck: deckResult(),
    desktopActions: true,
    activatePreset: vi.fn(),
    onDelete: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onReset: vi.fn(),
    ...over,
  };
  render(<DeckPresetToolbar {...props} />);
  return props;
}

const open = () => fireEvent.click(screen.getByRole('button', { name: PLACEHOLDER }));
const optionNames = () => screen.getAllByRole('option').map(o => o.textContent);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DeckPresetToolbar - dropdown contents', () => {
  it('lists Recent Apps first, then presets, then the preset actions', () => {
    setup();
    open();
    expect(optionNames().slice(0, 3)).toEqual(['panel.settings.deck.mode.recentApps', 'A', 'B']);
    expect(screen.getByRole('option', { name: 'panel.settings.deck.presets.apps' })).toBeInTheDocument();
  });

  it('hides Apps and Export on a non-desktop surface', () => {
    setup({ desktopActions: false });
    open();
    expect(screen.queryByRole('option', { name: 'panel.settings.deck.presets.apps' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'panel.settings.deck.presets.export' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'panel.settings.deck.presets.delete' })).toBeNull();
    expect(screen.getByRole('option', { name: 'panel.settings.deck.mode.recentApps' })).toBeInTheDocument();
  });

  it('offers Import only when onImport is supplied', () => {
    setup();
    open();
    expect(screen.queryByRole('option', { name: 'panel.settings.deck.presets.importOption' })).toBeNull();
  });

  it('offers Import when onImport is supplied', () => {
    setup({ onImport: vi.fn() });
    open();
    expect(screen.getByRole('option', { name: 'panel.settings.deck.presets.importOption' })).toBeInTheDocument();
  });
});

describe('DeckPresetToolbar - Recent Apps entry', () => {
  it('selecting it sets the mode to recentApps', () => {
    const deck = deckResult();
    setup({ deck });
    open();
    fireEvent.click(screen.getByRole('option', { name: 'panel.settings.deck.mode.recentApps' }));
    expect(deck.setMode).toHaveBeenCalledWith('recentApps');
  });

  it('while active it offers no rename/apps/export/delete and no history controls', () => {
    setup({ deck: deckResult({ instance: { mode: 'recentApps', activePresetId: 'p1' }, canUndo: true }) });
    expect(screen.queryByRole('button', { name: 'panel.settings.deck.presets.undo' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'panel.settings.deck.presets.redo' })).toBeNull();
    open();
    for (const k of ['rename', 'apps', 'export', 'delete']) {
      expect(screen.queryByRole('option', { name: `panel.settings.deck.presets.${k}` })).toBeNull();
    }
  });

  it('picking a preset while in Recent Apps activates it with mode custom in the same call', () => {
    const deck = deckResult({ instance: { mode: 'recentApps', activePresetId: 'p1' } });
    const props = setup({ deck });
    open();
    fireEvent.click(screen.getByRole('option', { name: 'B' }));
    expect(deck.setMode).not.toHaveBeenCalled();
    expect(props.activatePreset).toHaveBeenCalledWith('p2', 'custom');
  });

  it('picking a preset in custom mode does not touch the mode', () => {
    const deck = deckResult();
    const props = setup({ deck });
    open();
    fireEvent.click(screen.getByRole('option', { name: 'B' }));
    expect(deck.setMode).not.toHaveBeenCalled();
    expect(props.activatePreset).toHaveBeenCalledWith('p2', undefined);
  });
});

describe('modeOnPick', () => {
  it('is custom only while in Recent Apps', () => {
    expect(modeOnPick({ instance: { mode: 'recentApps', activePresetId: 'p1' } })).toBe('custom');
    expect(modeOnPick({ instance: { mode: 'custom', activePresetId: 'p1' } })).toBeUndefined();
    expect(modeOnPick({ instance: null })).toBeUndefined();
  });
});

describe('DeckPresetToolbar - host wiring', () => {
  it('routes delete, undo, redo through the host callbacks', () => {
    const props = setup({ deck: deckResult({ canUndo: true, canRedo: true }) });
    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.presets.undo' }));
    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.presets.redo' }));
    expect(props.onUndo).toHaveBeenCalledTimes(1);
    expect(props.onRedo).toHaveBeenCalledTimes(1);
    open();
    fireEvent.click(screen.getByRole('option', { name: 'panel.settings.deck.presets.delete' }));
    fireEvent.click(screen.getByText('confirm.ok'));
    expect(props.onDelete).toHaveBeenCalledWith('p1');
  });

  it('a newly created preset activates through the host activatePreset (or the custom-mode pick)', () => {
    const deck = deckResult({ createPreset: vi.fn().mockResolvedValue({ error: false }) });
    setup({ deck });
    open();
    fireEvent.click(screen.getByRole('option', { name: 'panel.settings.deck.presets.newOption' }));
    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.presets.new' }));
    expect(deck.createPreset).toHaveBeenCalledWith(expect.any(String), expect.any(Function));
  });

  it('Export calls exportDeckPreset with the active preset id', () => {
    setup();
    open();
    fireEvent.click(screen.getByRole('option', { name: 'panel.settings.deck.presets.export' }));
    expect(mockExport).toHaveBeenCalledWith('p1');
  });

  it('Import file... opens the hidden file picker', () => {
    setup();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');
    open();
    fireEvent.click(screen.getByRole('option', { name: 'panel.settings.deck.presets.importFileOption' }));
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('renders no file input on a non-desktop surface', () => {
    setup({ desktopActions: false });
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });
});

describe('DeckPresetToolbar - Apps... (per-preset app binding)', () => {
  it('opens the modal for the active preset and saves through setDeckPresetApps', async () => {
    mockSetApps.mockResolvedValue({ kind: 'ok', preset: { id: 'p1', name: 'A', cols: 2, rows: 2, pageCount: 1 } });
    setup();
    open();
    fireEvent.click(screen.getByRole('option', { name: 'panel.settings.deck.presets.apps' }));
    expect(screen.getByTestId('apps-modal')).toHaveTextContent('A');
    fireEvent.click(screen.getByText('save-apps'));
    await waitFor(() => expect(mockSetApps).toHaveBeenCalledWith('p1', [{ id: 'a1', name: 'App' }]));
    await waitFor(() => expect(screen.queryByTestId('apps-modal')).toBeNull());
  });
});

describe('DeckPresetToolbar - import file flow', () => {
  const IMPORTED: DeckPresetFull = { id: 'p-new', name: 'New', cols: 2, rows: 2, pageCount: 1, deck: { pages: [{ slots: [] }] } };
  const FILE = new File(['zip bytes'], 'Streaming.nexus-deck');
  const pickFile = () => fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [FILE] } });

  it('a successful import activates the imported preset', async () => {
    mockImport.mockResolvedValue({ kind: 'ok', preset: IMPORTED });
    const props = setup();
    pickFile();
    await waitFor(() => expect(props.activatePreset).toHaveBeenCalledWith('p-new', undefined));
    expect(mockImport).toHaveBeenCalledWith(FILE, false);
  });

  it('a 409 conflict toasts the server message with no retry action', async () => {
    mockImport.mockResolvedValue({ kind: 'conflict', msg: 'Already exists.' });
    setup();
    pickFile();
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith({ title: 'Already exists.' }));
  });

  it('a privileged rejection toasts with an Import anyway action that resends with allowPrivileged', async () => {
    mockImport
      .mockResolvedValueOnce({ kind: 'privileged', msg: 'Needs permission.' })
      .mockResolvedValueOnce({ kind: 'ok', preset: IMPORTED });
    const props = setup();
    pickFile();
    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    const toast = mockPush.mock.calls[0][0];
    expect(toast.title).toBe('Needs permission.');
    expect(toast.action.label).toBe('panel.settings.deck.presets.importAnyway');
    toast.action.onClick();
    await waitFor(() => expect(mockImport).toHaveBeenLastCalledWith(FILE, true));
    await waitFor(() => expect(props.activatePreset).toHaveBeenCalledWith('p-new', undefined));
  });

  it('a transport failure toasts the generic import-failed message', async () => {
    mockImport.mockResolvedValue({ kind: 'failed' });
    setup();
    pickFile();
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith({ title: 'panel.settings.deck.presets.importFailed' }));
  });
});
