import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeckAppAwareSection } from './DeckAppAwareSection';
import type { UseDeckInstanceResult } from './useDeckInstance';
import type { DeckPresetSummary, PresetApp, SetDeckPresetAppsResult } from '../../../api/deck';

vi.mock('../common/AppPicker', () => ({ useAppIcon: () => null }));

const mockSetDeckPresetApps = vi.fn<(id: string, apps: PresetApp[]) => Promise<SetDeckPresetAppsResult>>();
vi.mock('../../../api/deck', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../api/deck')>();
  return { ...actual, setDeckPresetApps: (id: string, apps: PresetApp[]) => mockSetDeckPresetApps(id, apps) };
});

let lastModalProps: {
  presetName: string;
  apps: PresetApp[];
  taken: Record<string, string>;
  onSave: (apps: PresetApp[]) => Promise<string | null>;
  onClose: () => void;
} | null = null;
vi.mock('../lighting/page/PresetAppsModal', () => ({
  PresetAppsModal: (props: typeof lastModalProps) => {
    lastModalProps = props;
    return <div data-testid="preset-apps-modal">{props?.presetName}</div>;
  },
}));

let lastSheetProps: { boundApps: Record<string, string>; onClose: () => void; onCreated: (id: string) => void } | null = null;
vi.mock('./DeckAddAppProfileSheet', () => ({
  DeckAddAppProfileSheet: (props: typeof lastSheetProps) => {
    lastSheetProps = props;
    return <div data-testid="add-app-profile-sheet" />;
  },
}));

function deckResult(over: Partial<UseDeckInstanceResult> & { presets?: DeckPresetSummary[] } = {}): UseDeckInstanceResult {
  return {
    instance: { mode: 'appAware', activePresetId: 'p1' },
    preset: { id: 'p1', name: 'Discord profile', cols: 5, rows: 3, pageCount: 1, deck: { pages: [{ slots: [] }] } },
    presets: [],
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

beforeEach(() => {
  vi.clearAllMocks();
  lastModalProps = null;
  lastSheetProps = null;
});

describe('DeckAppAwareSection - status pill', () => {
  it('shows the instance\'s live active preset name', () => {
    render(<DeckAppAwareSection deck={deckResult()} instanceGrid={{ cols: 5, rows: 3 }} />);
    expect(screen.getByText('panel.settings.deck.appAware.statusPill')).toBeInTheDocument();
  });
});

describe('DeckAppAwareSection - profiles list', () => {
  it('lists only presets that have app bindings', () => {
    const presets: DeckPresetSummary[] = [
      { id: 'p1', name: 'Discord profile', cols: 5, rows: 3, pageCount: 1, apps: [{ id: 'a1', name: 'Discord' }] },
      { id: 'p2', name: 'No bindings', cols: 5, rows: 3, pageCount: 1 },
    ];
    render(<DeckAppAwareSection deck={deckResult({ presets })} instanceGrid={{ cols: 5, rows: 3 }} />);
    expect(screen.getByText('Discord profile')).toBeInTheDocument();
    expect(screen.queryByText('No bindings')).toBeNull();
  });

  it('shows an empty note when no preset has bindings', () => {
    render(<DeckAppAwareSection deck={deckResult({ presets: [] })} instanceGrid={{ cols: 5, rows: 3 }} />);
    expect(screen.getByText('panel.settings.deck.appAware.noProfiles')).toBeInTheDocument();
  });

  it('Edit activates that preset on the instance', () => {
    const activate = vi.fn();
    const presets: DeckPresetSummary[] = [{ id: 'p2', name: 'Chrome profile', cols: 5, rows: 3, pageCount: 1, apps: [{ id: 'a2', name: 'Chrome' }] }];
    render(<DeckAppAwareSection deck={deckResult({ presets, activate })} instanceGrid={{ cols: 5, rows: 3 }} />);
    fireEvent.click(screen.getByText('panel.settings.deck.appAware.edit'));
    expect(activate).toHaveBeenCalledWith('p2');
  });

  it('Apps... opens PresetAppsModal with a taken map built across every OTHER preset', () => {
    const presets: DeckPresetSummary[] = [
      { id: 'p1', name: 'Discord profile', cols: 5, rows: 3, pageCount: 1, apps: [{ id: 'a1', name: 'Discord', processName: 'discord' }] },
      { id: 'p2', name: 'Chrome profile', cols: 5, rows: 3, pageCount: 1, apps: [{ id: 'a2', name: 'Chrome', processName: 'chrome' }] },
    ];
    render(<DeckAppAwareSection deck={deckResult({ presets })} instanceGrid={{ cols: 5, rows: 3 }} />);
    fireEvent.click(screen.getAllByText('panel.settings.deck.appAware.appsButton')[0]);

    expect(lastModalProps?.presetName).toBe('Discord profile');
    expect(lastModalProps?.taken).toEqual({ a2: 'Chrome profile', chrome: 'Chrome profile' });
  });
});

describe('DeckAppAwareSection - apps save', () => {
  it('surfaces a conflict message and keeps the modal target', async () => {
    const presets: DeckPresetSummary[] = [{ id: 'p1', name: 'Discord profile', cols: 5, rows: 3, pageCount: 1, apps: [{ id: 'a1', name: 'Discord' }] }];
    mockSetDeckPresetApps.mockResolvedValue({ kind: 'conflict', conflict: { error: true, msg: 'x', appName: 'Discord', presetName: 'Other' } });
    render(<DeckAppAwareSection deck={deckResult({ presets })} instanceGrid={{ cols: 5, rows: 3 }} />);
    fireEvent.click(screen.getByText('panel.settings.deck.appAware.appsButton'));

    const result = await lastModalProps!.onSave([]);
    expect(result).toBe('lighting.layoutPresets.appsTaken');
  });

  it('closes the modal on a clean save without resetting the whole instance hook', async () => {
    const retry = vi.fn();
    const presets: DeckPresetSummary[] = [{ id: 'p1', name: 'Discord profile', cols: 5, rows: 3, pageCount: 1, apps: [{ id: 'a1', name: 'Discord' }] }];
    mockSetDeckPresetApps.mockResolvedValue({ kind: 'ok', preset: presets[0] });
    render(<DeckAppAwareSection deck={deckResult({ presets, retry })} instanceGrid={{ cols: 5, rows: 3 }} />);
    fireEvent.click(screen.getByText('panel.settings.deck.appAware.appsButton'));

    let result: string | null = null;
    await act(async () => { result = await lastModalProps!.onSave([]); });
    expect(result).toBeNull();
    expect(screen.queryByTestId('preset-apps-modal')).toBeNull();
    // The `preset` deck-topic frame already updates state; re-running the
    // hook's whole fetch would flash a loading state and lose selection.
    expect(retry).not.toHaveBeenCalled();
  });
});

describe('DeckAppAwareSection - desktopActions=false (a paired panel: PUT /deck/presets/{id}/apps is LocalhostOnly)', () => {
  it('hides Apps... and + Add app profile but keeps Edit', () => {
    const presets: DeckPresetSummary[] = [{ id: 'p1', name: 'Discord profile', cols: 5, rows: 3, pageCount: 1, apps: [{ id: 'a1', name: 'Discord' }] }];
    render(<DeckAppAwareSection deck={deckResult({ presets })} instanceGrid={{ cols: 5, rows: 3 }} desktopActions={false} />);

    expect(screen.queryByText('panel.settings.deck.appAware.appsButton')).toBeNull();
    expect(screen.queryByText('panel.settings.deck.appAware.addProfile')).toBeNull();
    expect(screen.getByText('panel.settings.deck.appAware.edit')).toBeInTheDocument();
  });
});

describe('DeckAppAwareSection - add profile', () => {
  it('opens the add-app-profile sheet with the currently taken apps', () => {
    const presets: DeckPresetSummary[] = [{ id: 'p1', name: 'Discord profile', cols: 5, rows: 3, pageCount: 1, apps: [{ id: 'a1', name: 'Discord', processName: 'discord' }] }];
    render(<DeckAppAwareSection deck={deckResult({ presets })} instanceGrid={{ cols: 5, rows: 3 }} />);
    expect(screen.queryByTestId('add-app-profile-sheet')).toBeNull();

    fireEvent.click(screen.getByText('panel.settings.deck.appAware.addProfile'));
    expect(screen.getByTestId('add-app-profile-sheet')).toBeInTheDocument();
    expect(lastSheetProps?.boundApps).toEqual({ a1: 'Discord profile', discord: 'Discord profile' });
  });

  it('onCreated activates the new preset and closes the sheet', async () => {
    const activate = vi.fn().mockResolvedValue(undefined);
    render(<DeckAppAwareSection deck={deckResult({ activate })} instanceGrid={{ cols: 5, rows: 3 }} />);
    fireEvent.click(screen.getByText('panel.settings.deck.appAware.addProfile'));

    await act(async () => { lastSheetProps!.onCreated('new-preset'); });
    expect(activate).toHaveBeenCalledWith('new-preset');
    expect(screen.queryByTestId('add-app-profile-sheet')).toBeNull();
  });
});
