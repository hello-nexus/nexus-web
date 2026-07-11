import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, LayoutGrid, Monitor, Settings as SettingsIcon, Unplug, ChevronLeft } from 'lucide-react';
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { useTranslation } from '../../../lib/i18n';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { localizeNumbers } from '../../../lib/units';
import { useStreamDecks } from '../../../hooks/useStreamDecks';
import type { UnifiedDevice } from '../../../hooks/useUnifiedDevices';
import { useConflictApps } from '../../../hooks/useConflictApps';
import { usePhysicalDeckTarget } from '../../../panel/widgets/deck/usePhysicalDeckTarget';
import { DeckGrid } from '../../../panel/widgets/deck/DeckGrid';
import { DeckKeyInspector } from '../../../panel/widgets/deck/DeckKeyInspector';
import { DeckPageStrip } from '../../../panel/widgets/deck/DeckPageStrip';
import { padSlots, pageHasContent } from '../../../panel/widgets/deck/deckLayout';
import { withPageIndicatorDisplay } from '../../../panel/widgets/deck/deckIcons';
import { resolveTargetView, slotCountAtDepth } from '../../../panel/widgets/deck/deckTarget';
import { sendStreamDeckTestPattern } from '../../../api/streamdeck';
import { isRemoteOrigin } from '../../../api/service';
import { DEV_TOOLS } from '../../../lib/devTools';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import type { TabDef } from '../../common/Tabs/Tabs';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { EditableText } from '../../common/Editable/EditableText';
import { Select } from '../../common/Select/Select';
import { SettingRow, SettingToggle, SettingSelect, SettingSlider } from '../../common/SettingRow/SettingRow';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { ConflictAppCard } from '../../common/ConflictAppCard/ConflictAppCard';
import { Button } from '../../common/Button/Button';
import styles from './StreamDeckDevicePage.module.scss';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

type StreamDeckTab = 'customize' | 'settings';

const ORIENTATION_OPTIONS = [0, 90, 180, 270] as const;
const SLEEP_AFTER_OPTIONS = [0, 60, 300, 600, 900, 1800] as const;

function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      {/* eslint-disable-next-line i18next/no-literal-string -- brand name */}
      <ViewHeader title="Stream Deck" />
      <div className={`${styles.pageBody} pageBody`}>{children}</div>
    </div>
  );
}

interface StreamDeckDevicePageProps {
  device: UnifiedDevice;
  controlDevice: (id: string, nextEnabled: boolean) => Promise<void>;
}

/**
 * Routed device page for a physical Stream Deck: a Customize tab (grid on
 * the right, key inspector on the left) and a Settings tab (device prefs on
 * the left, a read-only preview of the same grid on the right). The
 * underlying handler is a singleton row (one 'streamdeck' curated device),
 * so multiple physical decks are picked with a plain dropdown here rather
 * than the widget-editing rail's UX. `device`/`controlDevice` come from the
 * router's own useUnifiedDevices call so the Nexus Link toggle here shares
 * state with the NexusControlOff gate that swaps this whole page out.
 */
export function StreamDeckDevicePage({ device, controlDevice }: StreamDeckDevicePageProps) {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  const { decks, loaded, rename, setBrightness, setOrientation, setSleepAfterSeconds } = useStreamDecks(true);
  const [serial, setSerial] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [folderPath, setFolderPath] = useState<number[]>([]);
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [brightnessDraft, setBrightnessDraft] = useState<number | null>(null);
  const [tab, setTab] = useState<StreamDeckTab>('customize');
  const dragSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    if (serial && decks.some(d => d.serial === serial)) return;
    setSerial(decks[0]?.serial ?? null);
  }, [decks, serial]);

  const deck = decks.find(d => d.serial === serial) ?? null;
  const { target, error: configError, retry: retryConfig } = usePhysicalDeckTarget(deck, folderPath, page);
  const { conflicts } = useConflictApps(!!deck?.conflictAppId);
  const activeConflict = deck?.conflictAppId ? conflicts.find(c => c.id === deck.conflictAppId) : undefined;

  useEffect(() => { setBrightnessDraft(null); setPage(0); setFolderPath([]); setSelectedSlot(0); setTab('customize'); }, [serial]);

  const onSelectPage = (next: number) => { setPage(next); setFolderPath([]); setSelectedSlot(0); };

  // /streamdeck/* is .LocalhostOnly(); a remote-paired session (or a browser
  // reaching the dashboard over the relay) would otherwise sit on this page
  // forever with useStreamDecks refusing to fetch and `loaded` never true.
  if (isRemoteOrigin) {
    return (
      <PageShell>
        <EmptyState icon={<Monitor size={40} />} title={t('devices.streamdeck.desktopOnly')} />
      </PageShell>
    );
  }

  if (!loaded) {
    return (
      <PageShell>
        <div className={styles.loading}>{t('common.loading')}</div>
      </PageShell>
    );
  }

  if (decks.length === 0) {
    return (
      <PageShell>
        <EmptyState icon={<Unplug size={40} />} title={t('devices.streamdeck.notConnected')} />
      </PageShell>
    );
  }

  const brightnessValue = brightnessDraft ?? deck?.brightness ?? 60;
  const inFolder = folderPath.length > 0;
  const pageCount = target ? target.config.pages.length : 1;
  const viewCount = target ? slotCountAtDepth(target, folderPath.length) : 0;
  const viewSlots = withPageIndicatorDisplay(
    target ? (resolveTargetView(target, page, folderPath) ?? padSlots([], viewCount)) : [],
    page,
    pageCount,
  );
  const selSlot = clamp(selectedSlot, 0, Math.max(0, viewCount - 1));

  const onBack = () => { setFolderPath(p => p.slice(0, -1)); setSelectedSlot(0); };
  const onDragEnd = (e: DragEndEvent) => {
    if (!target) return;
    const from = Number(e.active.id);
    const to = e.over ? Number(e.over.id) : NaN;
    if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return;
    target.swapSlots(page, folderPath, from, to);
  };

  const TABS: TabDef[] = [
    { key: 'customize', label: t('devices.streamdeck.tab.customize'), icon: <LayoutGrid size={14} /> },
    { key: 'settings', label: t('devices.streamdeck.tab.settings'), icon: <SettingsIcon size={14} /> },
  ];

  return (
    <div className={styles.page}>
      <ViewHeader
        // eslint-disable-next-line i18next/no-literal-string -- brand name
        title="Stream Deck"
        tabs={TABS}
        activeTab={tab}
        onTabChange={k => setTab(k as StreamDeckTab)}
      />
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
            {activeConflict && <ConflictAppCard conflict={activeConflict} />}

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

            <div className={styles.splitLayout}>
              {tab === 'customize' ? (
                <>
                  <div className={styles.leftPane}>
                    {target ? (
                      <DeckKeyInspector
                        target={target}
                        page={page}
                        folderPath={folderPath}
                        onFolderPathChange={setFolderPath}
                        selectedSlot={selectedSlot}
                        onSelectedSlotChange={setSelectedSlot}
                        // eslint-disable-next-line i18next/no-literal-string -- PanelSurface enum value
                        surface="desktop"
                        desktopEditor
                      />
                    ) : configError ? (
                      <div className={styles.loadError}>
                        <span>{t('panel.settings.deck.rail.loadFailed')}</span>
                        <Button type="button" size="sm" tone="neutral" onClick={retryConfig}>{t('panel.settings.deck.rail.retry')}</Button>
                      </div>
                    ) : (
                      <div className={styles.loading}>{t('panel.settings.deck.rail.loadingConfig')}</div>
                    )}
                  </div>
                  <div className={styles.previewPane}>
                    <div className={styles.previewStage}>
                      {target && (
                        <DeckPageStrip
                          pageCount={pageCount}
                          currentPage={page}
                          onSelectPage={onSelectPage}
                          onAddPage={() => { target.addPage(); onSelectPage(pageCount); }}
                          onRemoveCurrentPage={() => { target.removePage(page); onSelectPage(Math.max(0, page - 1)); }}
                          currentPageHasContent={pageHasContent(target.config.pages[page] ?? { slots: [] })}
                        />
                      )}
                      {inFolder && (
                        <div className={styles.breadcrumb}>
                          <button type="button" onClick={onBack}>
                            <ChevronLeft size={14} /> {t('panel.settings.deck.back')}
                          </button>
                        </div>
                      )}
                      {target && (
                        <DndContext sensors={dragSensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                          <DeckGrid
                            slots={viewSlots}
                            cols={target.cols}
                            rows={target.rows}
                            square
                            selectable
                            dragEnabled
                            selectedIndex={selSlot}
                            onCell={setSelectedSlot}
                            backCell={inFolder ? { onBack, ariaLabel: t('panel.settings.deck.back') } : undefined}
                          />
                        </DndContext>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.leftPane}>
                    <SettingsSection boxClassName={styles.sectionBox}>
                      <SettingRow label={t('devices.streamdeck.deviceName')}>
                        <EditableText
                          value={deck.name}
                          onCommit={next => void rename(deck.serial, next)}
                          maxLength={40}
                          ariaLabel={t('devices.streamdeck.deviceName')}
                        />
                      </SettingRow>
                      <SettingToggle
                        label={t('devices.nexusControl')}
                        checked={device.nexusControlEnabled}
                        onChange={next => {
                          if (device.curatedId) void controlDevice(device.curatedId, next);
                        }}
                      />
                      <SettingSelect
                        label={t('devices.streamdeck.orientation')}
                        value={String(deck.orientation ?? 0)}
                        options={ORIENTATION_OPTIONS.map(degrees => ({
                          value: String(degrees),
                          label: degrees === 0
                            ? t('devices.streamdeck.orientationStandard')
                            : t('devices.streamdeck.orientationDegrees', { n: degrees }),
                        }))}
                        onChange={v => void setOrientation(deck.serial, Number(v))}
                      />
                      <SettingSelect
                        label={t('devices.streamdeck.sleepAfter')}
                        value={String(deck.sleepAfterSeconds ?? 0)}
                        options={SLEEP_AFTER_OPTIONS.map(seconds => ({
                          value: String(seconds),
                          label: seconds === 0
                            ? t('devices.streamdeck.sleepAfterNever')
                            : t('devices.streamdeck.sleepAfterMinutes', { n: seconds / 60 }),
                        }))}
                        onChange={v => void setSleepAfterSeconds(deck.serial, Number(v))}
                      />
                      <SettingSlider
                        editable
                        trackFill
                        label={t('devices.streamdeck.brightness')}
                        value={brightnessValue}
                        min={0}
                        max={100}
                        step={1}
                        formatValue={v => localizeNumbers(`${Math.round(v)}%`, numberFormat)}
                        ariaLabel={t('devices.streamdeck.brightness')}
                        onChange={(v, commit) => {
                          setBrightnessDraft(Math.round(v));
                          if (commit) void setBrightness(deck.serial, Math.round(v));
                        }}
                        onCommit={v => {
                          void setBrightness(deck.serial, Math.round(v));
                          setBrightnessDraft(null);
                        }}
                      />
                      {deck.firmwareVersion && (
                        <SettingRow label={t('devices.streamdeck.firmware')}>
                          <span className={styles.readOnlyValue}>{deck.firmwareVersion}</span>
                        </SettingRow>
                      )}
                      <SettingRow label={t('devices.streamdeck.serialNumber')}>
                        <span className={styles.readOnlyValue}>{deck.serial}</span>
                      </SettingRow>
                      {DEV_TOOLS && (
                        <SettingRow>
                          <Button type="button" size="sm" tone="neutral" onClick={() => void sendStreamDeckTestPattern(deck.serial)}>
                            {t('devices.streamdeck.sendTestPattern')}
                          </Button>
                        </SettingRow>
                      )}
                    </SettingsSection>
                  </div>
                  <div className={styles.previewPane}>
                    <div className={`${styles.previewStage} ${styles.previewStageDimmed}`} aria-hidden="true">
                      {target && (
                        <DeckGrid
                          slots={viewSlots}
                          cols={target.cols}
                          rows={target.rows}
                          square
                          selectable={false}
                          onCell={() => {}}
                        />
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default StreamDeckDevicePage;
