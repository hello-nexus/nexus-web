import { useTranslation } from '../../../lib/i18n';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import { ChipGroup, type ChipOption } from '../../../components/common/ChipGroup/ChipGroup';
import { PresetToolbar } from '../../../components/common/PresetToolbar/PresetToolbar';
import { Button } from '../../../components/common/Button/Button';
import { fitPageCount } from './deckLayout';
import { DeckEditor } from './DeckEditor';
import { DeckRecentAppsSection } from './DeckRecentAppsSection';
import { DeckAppAwareSection } from './DeckAppAwareSection';
import type { UseDeckInstanceResult } from './useDeckInstance';
import type { DeckInstanceMode } from '../../../api/deck';
import type { PanelSurface } from '../../types';
import styles from './DeckInstanceEditor.module.scss';

export const DECK_PRESET_CAP = 50;

const MODE_KEYS: DeckInstanceMode[] = ['fixed', 'recentApps', 'appAware'];

export interface DeckInstanceEditorProps {
  deck: UseDeckInstanceResult;
  instanceGrid: { cols: number; rows: number };
  kind: 'physical' | 'widget';
  page: number;
  onPageChange: (page: number) => void;
  folderPath: readonly number[];
  onFolderPathChange: (folderPath: number[]) => void;
  selectedSlot?: number;
  onSelectedSlotChange?: (slot: number) => void;
  surface?: PanelSurface;
  desktopEditor?: boolean;
  /** Import into a host-wide preset (StreamDeckDevicePage's Elgato import); omitted hides the toolbar option. */
  onImport?: () => void;
  /** Override the toolbar's actions beyond `deck`'s own (StreamDeckDevicePage wraps them to also reset its page/folder nav and clear its live-tile preview cache). Default to `deck.activate`/`deletePreset`/`undo`/`redo`/`reset`. */
  onLoad?: (id: string) => void;
  onDelete?: (id: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onReset?: () => void;
  /**
   * 'toolbarOnly' renders just the mode chip + section + preset toolbar, so a
   * host with its own bespoke grid (StreamDeckDevicePage, which also shows
   * live hardware-rendered tiles) supplies that grid itself against the same
   * `deck.target`. 'full' (default) additionally renders the shared
   * DeckEditor body, used by the widget settings sheet, which has none.
   */
  bodyMode?: 'full' | 'toolbarOnly';
}

/**
 * Mode chip + host-wide preset toolbar + (optionally) the shared grid/
 * inspector body, bound to one useDeckInstance() result. Hosted by both
 * StreamDeckDevicePage (Customize tab) and DeckSettings (the Deck widget's
 * edit sheet) so a preset edited from either surface repaints the other.
 */
export function DeckInstanceEditor({
  deck, instanceGrid, kind, page, onPageChange, folderPath, onFolderPathChange,
  selectedSlot, onSelectedSlotChange, surface, desktopEditor, onImport,
  onLoad, onDelete, onUndo, onRedo, onReset, bodyMode = 'full',
}: DeckInstanceEditorProps) {
  const { t } = useTranslation();
  const mode = deck.instance?.mode ?? 'fixed';

  // Presence-only: the payload is ignored. Mounted for as long as this editor
  // is on screen (unmounts on a tab switch or the widget sheet closing), so
  // the service's App Aware switcher can pause while any editor for this
  // instance is open and settle once the last one closes.
  useTopicCallback('deck-edit', true, () => {});

  const modeOptions: ChipOption[] = MODE_KEYS.map(key => ({
    key,
    label: t(`panel.settings.deck.mode.${key}`),
  }));

  const preset = deck.preset;
  const gridDiffers = !!preset && (preset.cols !== instanceGrid.cols || preset.rows !== instanceGrid.rows);
  const fitNote = preset && gridDiffers
    ? t('panel.settings.deck.instance.fitNote', {
      cols: preset.cols,
      rows: preset.rows,
      pages: fitPageCount({ cols: preset.cols, rows: preset.rows, deck: preset.deck }, { ...instanceGrid, kind }),
    })
    : null;

  return (
    <div className={styles.root}>
      <ChipGroup
        fullWidth
        ariaLabel={t('panel.settings.deck.mode.label')}
        options={modeOptions}
        activeKey={mode}
        onChange={key => deck.setMode(key as DeckInstanceMode)}
      />

      {mode === 'recentApps' && <DeckRecentAppsSection showPreviewNote={bodyMode === 'full'} />}
      {mode === 'appAware' && <DeckAppAwareSection deck={deck} instanceGrid={instanceGrid} />}

      <PresetToolbar
        cap={DECK_PRESET_CAP}
        presets={deck.presets.map(p => ({ id: p.id, name: p.name, hasApps: !!p.apps?.length }))}
        activeId={deck.instance?.activePresetId ?? null}
        presetCount={deck.presets.length}
        onLoad={onLoad ?? (id => void deck.activate(id))}
        onCreate={deck.createPreset}
        onRename={deck.renamePreset}
        onDelete={onDelete ?? (id => void deck.deletePreset(id))}
        onImport={onImport}
        canUndo={deck.canUndo}
        canRedo={deck.canRedo}
        onUndo={onUndo ?? deck.undo}
        onRedo={onRedo ?? deck.redo}
        onReset={onReset ?? deck.reset}
        translationPrefix="panel.settings.deck.presets"
      />

      {fitNote && <p className={styles.fitNote}>{fitNote}</p>}

      {bodyMode === 'full' && mode !== 'recentApps' && (
        deck.target ? (
          <DeckEditor
            target={deck.target}
            page={page}
            onPageChange={onPageChange}
            folderPath={folderPath}
            onFolderPathChange={onFolderPathChange}
            selectedSlot={selectedSlot}
            onSelectedSlotChange={onSelectedSlotChange}
            surface={surface}
            desktopEditor={desktopEditor}
          />
        ) : deck.error ? (
          <div className={styles.loadError}>
            <span>{t('panel.settings.deck.rail.loadFailed')}</span>
            <Button type="button" size="sm" tone="neutral" onClick={deck.retry}>{t('panel.settings.deck.rail.retry')}</Button>
          </div>
        ) : (
          <div className={styles.loading}>{t('panel.settings.deck.rail.loadingConfig')}</div>
        )
      )}
    </div>
  );
}
