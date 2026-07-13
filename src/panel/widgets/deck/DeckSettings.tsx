import { DeckEditor } from './DeckEditor';
import { makeWidgetDeckTarget } from './deckTarget';
import type { WidgetSettingsProps } from '../types';
import styles from './DeckSettings.module.scss';

/**
 * Deck widget settings sheet: the shared key inspector (DeckEditor) bound to
 * the touch widget's own config.deck. The widget has zero physical-Stream-
 * Deck awareness - a connected physical deck is configured on its own routed
 * device page (StreamDeckDevicePage), not from inside this widget. Presets
 * live only on that physical-deck device page.
 */
export function DeckSettings({ widget, surface, desktopEditor, onUpdate, selectedSlot, onSelectedSlotChange, editView, onEditViewChange }: WidgetSettingsProps) {
  const target = makeWidgetDeckTarget(widget, onUpdate);
  const page = editView?.page ?? 0;
  const folderPath = editView?.folderPath ?? [];

  return (
    <div className={styles.root}>
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
