import { useDeckInstance } from './useDeckInstance';
import { innerGridForSize } from './deckLayout';
import { DeckInstanceEditor } from './DeckInstanceEditor';
import type { WidgetSettingsProps } from '../types';
import styles from './DeckSettings.module.scss';

/**
 * Deck widget settings sheet: the shared instance editor (mode chip + preset
 * toolbar + DeckEditor) bound to this widget's own instance
 * (`widget:<widget.id>`), which points at a host-wide preset - the same
 * system a physical Stream Deck's device page edits.
 */
export function DeckSettings({ widget, surface, desktopEditor, selectedSlot, onSelectedSlotChange, editView, onEditViewChange }: WidgetSettingsProps) {
  const instanceGrid = innerGridForSize(widget.size);
  const deck = useDeckInstance(`widget:${widget.id}`, 'widget', instanceGrid, true);
  const page = editView?.page ?? 0;
  const folderPath = editView?.folderPath ?? [];

  return (
    <div className={styles.root}>
      <DeckInstanceEditor
        deck={deck}
        instanceGrid={instanceGrid}
        kind="widget"
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
