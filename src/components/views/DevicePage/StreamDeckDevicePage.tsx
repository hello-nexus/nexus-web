import { useEffect, useState } from 'react';
import { AlertTriangle, Unplug } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { localizeNumbers } from '../../../lib/units';
import { useStreamDecks } from '../../../hooks/useStreamDecks';
import { usePhysicalDeckTarget } from '../../../panel/widgets/deck/usePhysicalDeckTarget';
import { DeckEditor } from '../../../panel/widgets/deck/DeckEditor';
import { sendStreamDeckTestPattern } from '../../../api/streamdeck';
import { DEV_TOOLS } from '../../../lib/devTools';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { EditableText } from '../../common/Editable/EditableText';
import { InfoList, InfoRow } from '../../common/InfoList/InfoList';
import { Select } from '../../common/Select/Select';
import { Slider } from '../../common/Slider/Slider';
import { Button } from '../../common/Button/Button';
import styles from './StreamDeckDevicePage.module.scss';

/**
 * Routed device page for a physical Stream Deck: header (rename, model,
 * firmware, brightness) plus the same shared DeckEditor the widget-editing
 * rail uses, pinned to this deck's serial. DevicePage.tsx dispatches here
 * for curatedId === 'streamdeck'; the underlying handler is a singleton row
 * (one 'streamdeck' curated device), so multiple physical decks are picked
 * with a plain dropdown here rather than the widget-editing rail's UX.
 */
export function StreamDeckDevicePage() {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  const { decks, loaded, rename, setBrightness } = useStreamDecks(true);
  const [serial, setSerial] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<number[]>([]);
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [brightnessDraft, setBrightnessDraft] = useState<number | null>(null);

  useEffect(() => {
    if (serial && decks.some(d => d.serial === serial)) return;
    setSerial(decks[0]?.serial ?? null);
  }, [decks, serial]);

  const deck = decks.find(d => d.serial === serial) ?? null;
  const { target, loaded: configLoaded } = usePhysicalDeckTarget(deck, folderPath);

  useEffect(() => { setBrightnessDraft(null); setFolderPath([]); setSelectedSlot(0); }, [serial]);

  if (loaded && decks.length === 0) {
    return (
      <div className={styles.page}>
        {/* eslint-disable-next-line i18next/no-literal-string -- brand name */}
        <ViewHeader title="Stream Deck" />
        <div className={`${styles.pageBody} pageBody`}>
          <EmptyState icon={<Unplug size={40} />} title={t('devices.streamdeck.notConnected')} />
        </div>
      </div>
    );
  }

  const brightnessValue = brightnessDraft ?? deck?.brightness ?? 60;

  return (
    <div className={styles.page}>
      {/* eslint-disable-next-line i18next/no-literal-string -- brand name */}
      <ViewHeader title="Stream Deck" />
      <div className={`${styles.pageBody} pageBody`}>
        {decks.length > 1 && (
          <Select
            className={styles.deckPicker}
            value={serial ?? ''}
            options={decks.map(d => ({ value: d.serial, label: d.name }))}
            onChange={setSerial}
            ariaLabel={t('devices.streamdeck.pickerAria')}
          />
        )}

        {deck && (
          <>
            {deck.warning && (
              <div className={styles.warningBanner}>
                {/* eslint-disable-next-line i18next/no-literal-string -- ARIA boolean attribute */}
                <AlertTriangle size={14} aria-hidden="true" />
                <span>{t('devices.streamdeck.elgatoConflict')}</span>
              </div>
            )}

            <div className={styles.header}>
              <EditableText
                value={deck.name}
                onCommit={next => void rename(deck.serial, next)}
                maxLength={40}
                className={styles.nameEdit}
                ariaLabel={t('devices.streamdeck.renameAria')}
              />
              {!deck.verified && <span className={styles.experimentalChip}>{t('devices.streamdeck.experimental')}</span>}
            </div>

            <InfoList className={styles.info}>
              <InfoRow label={t('devices.streamdeck.model')} value={deck.model} />
              {deck.firmwareVersion && <InfoRow label={t('devices.streamdeck.firmware')} value={deck.firmwareVersion} />}
            </InfoList>

            <Slider
              // eslint-disable-next-line i18next/no-literal-string -- layout enum value
              orientation="stacked"
              editable
              trackFill
              label={t('devices.y70.brightness')}
              value={brightnessValue}
              min={0}
              max={100}
              step={1}
              formatValue={v => localizeNumbers(`${Math.round(v)}%`, numberFormat)}
              ariaLabel={t('devices.y70.brightness')}
              onChange={(v, commit) => {
                setBrightnessDraft(Math.round(v));
                if (commit) void setBrightness(deck.serial, Math.round(v));
              }}
              onCommit={v => {
                void setBrightness(deck.serial, Math.round(v));
                setBrightnessDraft(null);
              }}
            />

            {DEV_TOOLS && (
              <Button type="button" size="sm" tone="neutral" onClick={() => void sendStreamDeckTestPattern(deck.serial)}>
                {t('devices.streamdeck.sendTestPattern')}
              </Button>
            )}

            {target && configLoaded ? (
              <DeckEditor
                target={target}
                folderPath={folderPath}
                onFolderPathChange={setFolderPath}
                selectedSlot={selectedSlot}
                onSelectedSlotChange={setSelectedSlot}
                // eslint-disable-next-line i18next/no-literal-string -- PanelSurface enum value
                surface="desktop"
                desktopEditor
              />
            ) : (
              <div className={styles.loading}>{t('panel.settings.deck.rail.loadingConfig')}</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default StreamDeckDevicePage;
