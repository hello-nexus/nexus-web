import { useEffect, useState } from 'react';
import { Copy } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { useStreamDecks } from '../../../hooks/useStreamDecks';
import { Button } from '../../../components/common/Button/Button';
import { ConfirmModal } from '../../../components/common/ConfirmModal/ConfirmModal';
import { DeckEditor } from './DeckEditor';
import { DeckRail } from './DeckRail';
import { makeWidgetDeckTarget, truncateConfigForTarget } from './deckTarget';
import { usePhysicalDeckTarget } from './usePhysicalDeckTarget';
import type { WidgetSettingsProps } from '../types';
import styles from './DeckSettings.module.scss';

/**
 * Deck widget settings sheet. Thin wrapper around the shared DeckEditor: it
 * always edits the touch widget's own config.deck, unchanged from before this
 * was extracted, UNLESS the desktop dashboard detects at least one physical
 * Stream Deck - then a left rail lets the user swap the editor onto a
 * physical deck's serial-keyed config instead. No physical deck detected (or
 * running outside the desktop dashboard) means no rail and zero behavior
 * change for touch-only users.
 */
export function DeckSettings({ widget, surface, desktopEditor, onUpdate, selectedSlot, onSelectedSlotChange, editView, onEditViewChange }: WidgetSettingsProps) {
  const { t } = useTranslation();
  const [copyConfirmOpen, setCopyConfirmOpen] = useState(false);
  const widgetTarget = makeWidgetDeckTarget(widget, onUpdate);

  // Physical decks are a hardware peripheral of THIS host; only the local
  // desktop dashboard (the widget's own on-panel sheet, or the desktop's
  // inline editor for a remote device's layout) ever fetches /streamdeck/*.
  const showPhysical = surface === 'desktop' || !!desktopEditor;
  const { decks } = useStreamDecks(showPhysical);

  const [activeSerial, setActiveSerial] = useState<string | null>(null);
  useEffect(() => {
    if (activeSerial && !decks.some(d => d.serial === activeSerial)) setActiveSerial(null);
  }, [decks, activeSerial]);
  const activeDeck = decks.find(d => d.serial === activeSerial) ?? null;

  const [physicalFolderPath, setPhysicalFolderPath] = useState<number[]>([]);
  const physical = usePhysicalDeckTarget(activeDeck, physicalFolderPath);

  const isPhysical = activeDeck !== null;
  const target = isPhysical ? physical.target : widgetTarget;
  const folderPath = isPhysical ? physicalFolderPath : (editView?.folderPath ?? []);
  const onFolderPathChange = (next: number[]) => {
    if (isPhysical) setPhysicalFolderPath(next);
    else onEditViewChange?.({ folderPath: next });
  };

  const selectTarget = (serial: string | null) => {
    setActiveSerial(serial);
    setPhysicalFolderPath([]);
    onSelectedSlotChange?.(0);
  };

  // Root keyCount alone misses a folder-only overflow (e.g. a 15-slot root
  // that fits but a full folder inside it still drops its last slot), so the
  // note is gated on running the actual truncation, not a capacity compare.
  const copyPreview = activeDeck ? truncateConfigForTarget(widgetTarget.config, { kind: 'physical', keyCount: activeDeck.keyCount }) : null;

  const copyWidgetLayout = () => {
    if (!activeDeck) return;
    const { config: truncated } = truncateConfigForTarget(structuredClone(widgetTarget.config), { kind: 'physical', keyCount: activeDeck.keyCount });
    physical.replaceAll(truncated);
    setCopyConfirmOpen(false);
  };

  const confirmModal = (
    <ConfirmModal
      open={copyConfirmOpen}
      title={t('panel.settings.deck.copyLayoutConfirm.title')}
      message={t('panel.settings.deck.copyLayoutConfirm.body', { name: activeDeck?.name ?? '' })}
      note={copyPreview?.truncated ? t('panel.settings.deck.copyLayoutConfirm.truncated', { count: activeDeck?.keyCount ?? 0, name: activeDeck?.name ?? '' }) : undefined}
      // eslint-disable-next-line i18next/no-literal-string -- note-tone enum value
      noteTone="danger"
      onConfirm={copyWidgetLayout}
      onCancel={() => setCopyConfirmOpen(false)}
    />
  );

  const editorBody = target ? (
    <DeckEditor
      target={target}
      folderPath={folderPath}
      onFolderPathChange={onFolderPathChange}
      selectedSlot={selectedSlot}
      onSelectedSlotChange={onSelectedSlotChange}
      surface={surface}
      desktopEditor={desktopEditor}
    />
  ) : isPhysical && physical.error ? (
    <div className={styles.loadError}>
      <span>{t('panel.settings.deck.rail.loadFailed')}</span>
      <Button type="button" size="sm" tone="neutral" onClick={physical.retry}>{t('panel.settings.deck.rail.retry')}</Button>
    </div>
  ) : (
    isPhysical && <div className={styles.loading}>{t('panel.settings.deck.rail.loadingConfig')}</div>
  );

  // No physical deck detected: render exactly what DeckSettings rendered
  // before this was extracted (no rail, no extra wrapper) so a touch-only
  // panel's DOM/behavior is unchanged.
  if (decks.length === 0) {
    return <>{editorBody}{confirmModal}</>;
  }

  return (
    <div className={styles.layout}>
      <DeckRail
        decks={decks}
        activeSerial={activeSerial}
        onSelectWidget={() => selectTarget(null)}
        onSelectDeck={serial => selectTarget(serial)}
      />
      <div className={styles.content}>
        {isPhysical && activeDeck && !physical.error && (
          <Button type="button" size="sm" tone="neutral" icon={<Copy size={14} />} onClick={() => setCopyConfirmOpen(true)} className={styles.copyButton}>
            {t('panel.settings.deck.copyLayout')}
          </Button>
        )}
        {editorBody}
      </div>
      {confirmModal}
    </div>
  );
}
