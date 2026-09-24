import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeckAddAppProfileSheet } from './DeckAddAppProfileSheet';
import type { DeckPresetFull, DeckTemplate, SetDeckPresetAppsResult } from '../../../api/deck';

const mockCreateDeckPreset = vi.fn<(body: unknown) => Promise<DeckPresetFull | null>>();
const mockDeleteDeckPreset = vi.fn<(id: string) => Promise<boolean>>();
const mockSetDeckPresetApps = vi.fn<(...a: unknown[]) => Promise<SetDeckPresetAppsResult>>();
const mockGetDeckTemplates = vi.fn<() => Promise<DeckTemplate[]>>();
vi.mock('../../../api/deck', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../api/deck')>();
  return {
    ...actual,
    createDeckPreset: (body: unknown) => mockCreateDeckPreset(body),
    deleteDeckPreset: (id: string) => mockDeleteDeckPreset(id),
    setDeckPresetApps: (...a: unknown[]) => mockSetDeckPresetApps(...a),
    getDeckTemplates: () => mockGetDeckTemplates(),
  };
});

const mockToastPush = vi.fn();
vi.mock('../../../components/common/Toast/Toast', () => ({ useToastSafe: () => ({ push: mockToastPush }) }));

vi.mock('../common/AppPicker', () => ({
  AppPicker: ({ onSelect }: { onSelect: (app: { id: string; name: string; processName?: string }) => void }) => (
    <button type="button" onClick={() => onSelect({ id: 'proc:steam', name: 'Steam', processName: 'steam' })}>
      pick-steam
    </button>
  ),
}));

function template(over: Partial<DeckTemplate> = {}): DeckTemplate {
  return {
    id: 'discord', name: 'Discord', description: 'Voice + text chords', cols: 5, rows: 3,
    match: { processNames: ['discord'], displayNames: ['Discord'] },
    installedAppId: 'shortcut-discord', installedAppName: 'Discord', processName: 'discord',
    ...over,
  };
}

const PRESET: DeckPresetFull = { id: 'p-new', name: 'Discord', cols: 5, rows: 3, pageCount: 1, deck: { pages: [{ slots: [] }] } };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDeckTemplates.mockResolvedValue([]);
  mockCreateDeckPreset.mockResolvedValue(PRESET);
  mockDeleteDeckPreset.mockResolvedValue(true);
  mockSetDeckPresetApps.mockResolvedValue({ kind: 'ok', preset: PRESET });
});

describe('DeckAddAppProfileSheet - Suggested tab', () => {
  it('lists a template only when its installed app is not already bound', async () => {
    mockGetDeckTemplates.mockResolvedValue([
      template({ id: 'discord', installedAppId: 'shortcut-discord', processName: 'discord' }),
      template({ id: 'chrome', name: 'Chrome', installedAppId: 'shortcut-chrome', processName: 'chrome' }),
    ]);
    render(
      <DeckAddAppProfileSheet
        currentPresetId="p1"
        boundApps={{ 'shortcut-discord': 'Discord profile', discord: 'Discord profile' }}
        instanceGrid={{ cols: 5, rows: 3 }}
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('Chrome')).toBeInTheDocument());
    expect(screen.queryByText('Discord')).toBeNull();
  });

  it('shows a not-installed template as filtered out (no installedAppId)', async () => {
    mockGetDeckTemplates.mockResolvedValue([template({ installedAppId: undefined, processName: undefined })]);
    render(
      <DeckAddAppProfileSheet currentPresetId={null} boundApps={{}} instanceGrid={{ cols: 5, rows: 3 }} onClose={vi.fn()} onCreated={vi.fn()} />,
    );
    await waitFor(() => expect(screen.getByText('panel.settings.deck.appAware.noSuggested')).toBeInTheDocument());
  });

  it('picking a suggested template creates it with templateId, binds the app and hands the id back', async () => {
    mockGetDeckTemplates.mockResolvedValue([template()]);
    const onCreated = vi.fn();
    render(
      <DeckAddAppProfileSheet currentPresetId="p1" boundApps={{}} instanceGrid={{ cols: 2, rows: 2 }} onClose={vi.fn()} onCreated={onCreated} />,
    );
    await waitFor(() => screen.getByText('Discord'));
    fireEvent.click(screen.getByText('Discord'));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('p-new'));
    expect(mockCreateDeckPreset).toHaveBeenCalledWith({ name: 'Discord', cols: 5, rows: 3, templateId: 'discord' });
    expect(mockSetDeckPresetApps).toHaveBeenCalledWith('p-new', [{ id: 'shortcut-discord', name: 'Discord', processName: 'discord' }]);
  });

  it('retries with a numbered suffix when the template\'s own name collides with an existing preset', async () => {
    mockGetDeckTemplates.mockResolvedValue([template()]);
    mockCreateDeckPreset
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(PRESET);
    const onCreated = vi.fn();
    render(
      <DeckAddAppProfileSheet currentPresetId="p1" boundApps={{}} instanceGrid={{ cols: 2, rows: 2 }} onClose={vi.fn()} onCreated={onCreated} />,
    );
    await waitFor(() => screen.getByText('Discord'));
    fireEvent.click(screen.getByText('Discord'));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('p-new'));
    expect(mockCreateDeckPreset).toHaveBeenNthCalledWith(1, { name: 'Discord', cols: 5, rows: 3, templateId: 'discord' });
    expect(mockCreateDeckPreset).toHaveBeenNthCalledWith(2, { name: 'Discord 2', cols: 5, rows: 3, templateId: 'discord' });
    expect(mockCreateDeckPreset).toHaveBeenNthCalledWith(3, { name: 'Discord 3', cols: 5, rows: 3, templateId: 'discord' });
  });

  it('a non-2xx create (the current templateId 501) shows a toast and does not call onCreated', async () => {
    mockGetDeckTemplates.mockResolvedValue([template()]);
    mockCreateDeckPreset.mockResolvedValue(null);
    const onCreated = vi.fn();
    render(
      <DeckAddAppProfileSheet currentPresetId="p1" boundApps={{}} instanceGrid={{ cols: 2, rows: 2 }} onClose={vi.fn()} onCreated={onCreated} />,
    );
    await waitFor(() => screen.getByText('Discord'));
    fireEvent.click(screen.getByText('Discord'));

    await waitFor(() => expect(mockToastPush).toHaveBeenCalled());
    expect(onCreated).not.toHaveBeenCalled();
    expect(mockSetDeckPresetApps).not.toHaveBeenCalled();
  });
});

describe('DeckAddAppProfileSheet - All apps tab', () => {
  it('picking an app copies the current preset and binds the picked app', async () => {
    const onCreated = vi.fn();
    render(
      <DeckAddAppProfileSheet currentPresetId="p1" boundApps={{}} instanceGrid={{ cols: 4, rows: 2 }} onClose={vi.fn()} onCreated={onCreated} />,
    );
    fireEvent.click(screen.getByText('panel.settings.deck.appAware.allAppsTab'));
    fireEvent.click(screen.getByText('pick-steam'));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('p-new'));
    expect(mockCreateDeckPreset).toHaveBeenCalledWith({ name: 'Steam', cols: 4, rows: 2, copyOfPresetId: 'p1' });
    expect(mockSetDeckPresetApps).toHaveBeenCalledWith('p-new', [{ id: 'proc:steam', name: 'Steam', processName: 'steam' }]);
  });

  it('retries with a numbered suffix when the app\'s own name collides with an existing preset', async () => {
    mockCreateDeckPreset
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(PRESET);
    const onCreated = vi.fn();
    render(
      <DeckAddAppProfileSheet currentPresetId="p1" boundApps={{}} instanceGrid={{ cols: 4, rows: 2 }} onClose={vi.fn()} onCreated={onCreated} />,
    );
    fireEvent.click(screen.getByText('panel.settings.deck.appAware.allAppsTab'));
    fireEvent.click(screen.getByText('pick-steam'));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('p-new'));
    expect(mockCreateDeckPreset).toHaveBeenNthCalledWith(1, { name: 'Steam', cols: 4, rows: 2, copyOfPresetId: 'p1' });
    expect(mockCreateDeckPreset).toHaveBeenNthCalledWith(2, { name: 'Steam 2', cols: 4, rows: 2, copyOfPresetId: 'p1' });
    expect(mockCreateDeckPreset).toHaveBeenNthCalledWith(3, { name: 'Steam 3', cols: 4, rows: 2, copyOfPresetId: 'p1' });
  });

  it('gives up and shows the failure toast after exhausting the numbered-suffix retries', async () => {
    mockCreateDeckPreset.mockResolvedValue(null);
    const onCreated = vi.fn();
    render(
      <DeckAddAppProfileSheet currentPresetId="p1" boundApps={{}} instanceGrid={{ cols: 4, rows: 2 }} onClose={vi.fn()} onCreated={onCreated} />,
    );
    fireEvent.click(screen.getByText('panel.settings.deck.appAware.allAppsTab'));
    fireEvent.click(screen.getByText('pick-steam'));

    await waitFor(() => expect(mockToastPush).toHaveBeenCalledWith({ title: 'panel.settings.deck.appAware.addProfileFailed' }));
    expect(onCreated).not.toHaveBeenCalled();
    expect(mockSetDeckPresetApps).not.toHaveBeenCalled();
  });

  it('a conflict on bind deletes the just-created orphan preset instead of activating it', async () => {
    mockSetDeckPresetApps.mockResolvedValue({ kind: 'conflict', conflict: { error: true, msg: 'x', appName: 'Steam', presetName: 'Other' } });
    const onCreated = vi.fn();
    render(
      <DeckAddAppProfileSheet currentPresetId={null} boundApps={{}} instanceGrid={{ cols: 4, rows: 2 }} onClose={vi.fn()} onCreated={onCreated} />,
    );
    fireEvent.click(screen.getByText('panel.settings.deck.appAware.allAppsTab'));
    fireEvent.click(screen.getByText('pick-steam'));

    await waitFor(() => expect(mockDeleteDeckPreset).toHaveBeenCalledWith('p-new'));
    expect(mockToastPush).toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('a failed bind (not a name conflict) also deletes the orphan preset and shows the save-failed toast', async () => {
    mockSetDeckPresetApps.mockResolvedValue({ kind: 'failed' });
    const onCreated = vi.fn();
    render(
      <DeckAddAppProfileSheet currentPresetId={null} boundApps={{}} instanceGrid={{ cols: 4, rows: 2 }} onClose={vi.fn()} onCreated={onCreated} />,
    );
    fireEvent.click(screen.getByText('panel.settings.deck.appAware.allAppsTab'));
    fireEvent.click(screen.getByText('pick-steam'));

    await waitFor(() => expect(mockDeleteDeckPreset).toHaveBeenCalledWith('p-new'));
    expect(mockToastPush).toHaveBeenCalledWith({ title: 'panel.settings.deck.appAware.appsSaveFailed' });
    expect(onCreated).not.toHaveBeenCalled();
  });
});
