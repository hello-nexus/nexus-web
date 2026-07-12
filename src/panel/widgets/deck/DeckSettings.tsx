import { DeckEditor } from './DeckEditor';
import { makeWidgetDeckTarget } from './deckTarget';
import { useDeckWidgetPresets } from './useDeckWidgetPresets';
import { DECK_WIDGET_PRESET_CAP } from './deckLayout';
import { PresetToolbar } from '../../../components/common/PresetToolbar/PresetToolbar';
import { canEditFreeText } from '../../types';
import type { WidgetSettingsProps } from '../types';
import styles from './DeckSettings.module.scss';

/**
 * Deck widget settings sheet: the shared key inspector (DeckEditor) bound to
 * the touch widget's own config.deck. The widget has zero physical-Stream-
 * Deck awareness - a connected physical deck is configured on its own routed
 * device page (StreamDeckDevicePage), not from inside this widget. Presets
 * are a separate, widget-local feature (useDeckWidgetPresets) - snapshots of
 * this widget's own config, with no relation to the physical deck's
 * service-backed presets.
 */
export function DeckSettings({ widget, surface, desktopEditor, onUpdate, selectedSlot, onSelectedSlotChange, editView, onEditViewChange }: WidgetSettingsProps) {
  const target = makeWidgetDeckTarget(widget, onUpdate);
  const page = editView?.page ?? 0;
  const folderPath = editView?.folderPath ?? [];
  const presets = useDeckWidgetPresets(widget, onUpdate);
  // Create/rename open a PromptModal text input, unusable on a keyboardless
  // kiosk surface (Y70/Q60) - switching and deleting stay available there.
  const allowCreateRename = canEditFreeText(surface, desktopEditor);

  return (
    <div className={styles.root}>
      <PresetToolbar
        presets={presets.presets}
        activeId={presets.activeId}
        presetCount={presets.presetCount}
        cap={DECK_WIDGET_PRESET_CAP}
        onLoad={presets.handleLoad}
        onCreate={presets.handleCreate}
        onRename={presets.handleRename}
        onDelete={presets.handleDelete}
        showHistory={false}
        allowCreateRename={allowCreateRename}
      />
      <DeckEditor
        target={target}
        page={page}
        onPageChange={next => onEditViewChange?.({ page: next, folderPath: [] })}
        folderPath={folderPath}
        onFolderPathChange={next => onEditViewChange?.({ page, folderPath: next })}
        selectedSlot={selectedSlot}
        onSelectedSlotChange={onSelectedSlotChange}
        surface={surface}
        desktopEditor={desktopEditor}
      />
    </div>
  );
}
