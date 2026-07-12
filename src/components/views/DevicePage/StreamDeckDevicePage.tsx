import { useState, useCallback, useRef, type ReactNode } from 'react';
import { AlertTriangle, LayoutGrid, Monitor, Settings as SettingsIcon, Unplug, Trash2 } from 'lucide-react';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, pointerWithin, closestCenter, type DragEndEvent, type DragStartEvent, type CollisionDetection } from '@dnd-kit/core';
import { useTranslation } from '../../../lib/i18n';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { localizeNumbers } from '../../../lib/units';
import { useStreamDecks } from '../../../hooks/useStreamDecks';
import { setStreamDeckNav } from '../../../api/streamdeck';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import { useUndoRedo } from '../../../hooks/useUndoRedo';
import type { UnifiedDevice } from '../../../hooks/useUnifiedDevices';
import { useConflictApps } from '../../../hooks/useConflictApps';
import { usePhysicalDeckTarget } from '../../../panel/widgets/deck/usePhysicalDeckTarget';
import { useDeckPresets } from '../../../panel/widgets/deck/useDeckPresets';
import { DeckGrid } from '../../../panel/widgets/deck/DeckGrid';
import { DeckKeyInspector, DeckDefaultTitleSettings, DeckActionDragPreview, slotForPickerKind, type DeckPickerKind } from '../../../panel/widgets/deck/DeckKeyInspector';
import { DeckPageStrip } from '../../../panel/widgets/deck/DeckPageStrip';
import { padSlots, pageHasContent, emptyDeck, MAX_DECK_PAGES } from '../../../panel/widgets/deck/deckLayout';
import { withPageIndicatorDisplay } from '../../../panel/widgets/deck/deckIcons';
import { resolveTargetView, slotCountAtDepth } from '../../../panel/widgets/deck/deckTarget';
import type { DeckConfig, DeckSlot } from '../../../panel/widgets/deck/types';
import { isRemoteOrigin } from '../../../api/service';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { PresetToolbar } from '../../common/PresetToolbar/PresetToolbar';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import type { TabDef } from '../../common/Tabs/Tabs';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { EditableText } from '../../common/Editable/EditableText';
import { SettingRow, SettingSelect, SettingSlider } from '../../common/SettingRow/SettingRow';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { ConflictAppCard } from '../../common/ConflictAppCard/ConflictAppCard';
import { Button } from '../../common/Button/Button';
import styles from './StreamDeckDevicePage.module.scss';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// Total bound keys inside a folder (recursively), so a delete-folder confirm
// can tell the user how many keys go with it.
function countBoundSlots(slots: readonly DeckSlot[]): number {
  let n = 0;
  for (const s of slots) {
    if (s.action || s.folder) n++;
    if (s.folder) n += countBoundSlots(s.folder.slots);
  }
  return n;
}

// Resolve the drop to the key under the pointer (so an assigned/reordered key
// lands where the cursor is, matching the hover highlight), not the nearest
// cell center of the dragged element - which, for a wide picker row, sits off
// to the side and dropped onto the wrong key.
const dropCollision: CollisionDetection = args => {
  const p = pointerWithin(args);
  return p.length > 0 ? p : closestCenter(args);
};

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
 * Routed device page for one physical Stream Deck, in the standard device-page
 * split: the Customize tab has the shared key inspector on the left and, on the
 * right, the top-aligned deck preview with page-number pagination and the model
 * name below it; the Settings tab has device prefs on the left and a read-only
 * preview of the same grid on the right. Each connected/persisted deck gets its
 * own sidebar entry (see useUnifiedDevices), so `device` always identifies
 * exactly one deck by serial - there is no in-page deck picker.
 */
export function StreamDeckDevicePage({ device }: StreamDeckDevicePageProps) {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  const { decks, loaded, rename, setBrightness, setOrientation, setSleepAfterSeconds } = useStreamDecks(true);
  const serial = device.streamdeckSerial ?? null;
  const [page, setPage] = useState(0);
  const [folderPath, setFolderPath] = useState<number[]>([]);
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [brightnessDraft, setBrightnessDraft] = useState<number | null>(null);
  const [tab, setTab] = useState<StreamDeckTab>('customize');
  const [activeDragKind, setActiveDragKind] = useState<DeckPickerKind | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ index: number; count: number } | null>(null);
  const dragSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const deck = decks.find(d => d.serial === serial) ?? null;
  const deckPresets = useDeckPresets(serial);
  const { scheduleAutoSave } = deckPresets;

  // Every commit funnels through usePhysicalDeckTarget's target.updateSlot/
  // swapSlots/addPage/removePage/setTitleDefault -> persist, the single
  // choke point onCommit fires from - so history + auto-save cover assign/
  // edit/label/icon/color/title/folder/page/clear/drag without instrumenting
  // each widget. pushDeckHistoryRef breaks the circular dependency: onCommit
  // is needed before useUndoRedo (below) exists to supply the real push.
  const pushDeckHistoryRef = useRef<(prev: DeckConfig) => void>(() => {});
  const onDeckConfigCommit = useCallback((prev: DeckConfig) => {
    pushDeckHistoryRef.current(prev);
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  const { target, error: configError, retry: retryConfig, applyConfig } = usePhysicalDeckTarget(deck, folderPath, page, onDeckConfigCommit);
  const { conflicts } = useConflictApps(!!deck?.conflictAppId);
  const activeConflict = deck?.conflictAppId ? conflicts.find(c => c.id === deck.conflictAppId) : undefined;

  // A preset's config + key images are applied server-side; retryConfig()
  // re-fetches usePhysicalDeckTarget's config so the editor reflects it.
  const onDeckPresetLoad = useCallback(async (id: string) => {
    await deckPresets.handleLoad(id);
    retryConfig();
  }, [deckPresets, retryConfig]);

  // Undo/redo apply the restored DeckConfig through applyConfig - the same
  // debounced PUT + key-image resync path a normal edit takes - and re-save
  // the active preset exactly like a fresh edit would.
  const undoRedoRef = useRef<{
    undo: (current: DeckConfig) => DeckConfig | null;
    redo: (current: DeckConfig) => DeckConfig | null;
  }>({ undo: () => null, redo: () => null });

  const handleUndoDeck = useCallback(() => {
    if (!target) return;
    const restored = undoRedoRef.current.undo(target.config);
    if (!restored) return;
    applyConfig(restored);
    scheduleAutoSave();
  }, [target, applyConfig, scheduleAutoSave]);

  const handleRedoDeck = useCallback(() => {
    if (!target) return;
    const restored = undoRedoRef.current.redo(target.config);
    if (!restored) return;
    applyConfig(restored);
    scheduleAutoSave();
  }, [target, applyConfig, scheduleAutoSave]);

  const {
    push: pushDeckHistory,
    undo: undoDeck,
    redo: redoDeck,
    canUndo: canUndoDeck,
    canRedo: canRedoDeck,
  } = useUndoRedo<DeckConfig>({
    maxDepth: 50,
    enabled: tab === 'customize',
    onUndo: handleUndoDeck,
    onRedo: handleRedoDeck,
  });

  undoRedoRef.current = { undo: undoDeck, redo: redoDeck };
  pushDeckHistoryRef.current = pushDeckHistory;

  // Reset pushes the pre-reset config so it can be undone, then clears to a
  // single empty page through the same update path as every other edit.
  const handleDeckReset = useCallback(() => {
    if (!target) return;
    pushDeckHistory(target.config);
    applyConfig(emptyDeck());
    scheduleAutoSave();
  }, [target, applyConfig, pushDeckHistory, scheduleAutoSave]);

  // Follow the physical deck's navigation: pressing prev/next page, go-to-page,
  // or entering/leaving a folder on the hardware broadcasts a `nav` frame, so
  // the editor moves to the same page/folder the deck is showing.
  useTopicCallback('streamdeck', !isRemoteOrigin && !!serial, useCallback((data: unknown) => {
    const f = data as { kind?: string; serial?: string; page?: number; folderPath?: number[] };
    if (f.kind !== 'nav' || f.serial !== serial) return;
    if (typeof f.page === 'number') setPage(f.page);
    setFolderPath(Array.isArray(f.folderPath) ? f.folderPath : []);
    setSelectedSlot(0);
  }, [serial]));

  // Mirror an editor-initiated nav onto the hardware (desktop -> device). Only
  // user actions call this; the `nav`-frame subscription above (device ->
  // desktop) sets state without pushing, so the two directions never echo.
  const pushNav = useCallback((p: number, fp: readonly number[]) => {
    if (serial) void setStreamDeckNav(serial, p, fp);
  }, [serial]);
  const onSelectPage = (next: number) => { setPage(next); setFolderPath([]); setSelectedSlot(0); pushNav(next, []); };
  const onEnterFolder = (next: number[]) => { setFolderPath(next); setSelectedSlot(0); pushNav(page, next); };

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

  if (!deck) {
    return (
      <PageShell>
        <EmptyState icon={<Unplug size={40} />} title={t('devices.streamdeck.notConnected')} />
      </PageShell>
    );
  }

  const brightnessValue = brightnessDraft ?? deck.brightness ?? 60;
  const inFolder = folderPath.length > 0;
  const pageCount = target ? target.config.pages.length : 1;
  const viewCount = target ? slotCountAtDepth(target, folderPath.length) : 0;
  const viewSlots = withPageIndicatorDisplay(
    target ? (resolveTargetView(target, page, folderPath) ?? padSlots([], viewCount)) : [],
    page,
    pageCount,
  );
  const selSlot = clamp(selectedSlot, 0, Math.max(0, viewCount - 1));
  const selectedBound = !!(viewSlots[selSlot]?.action || viewSlots[selSlot]?.folder);

  // First click selects a key; clicking an already-selected folder key enters
  // it (no separate "edit folder" control). Going back is the grid's Back key.
  const onCellClick = (i: number) => {
    if (i === selSlot && viewSlots[i]?.folder) onEnterFolder([...folderPath, i]);
    else setSelectedSlot(i);
  };

  const onBack = () => { const next = folderPath.slice(0, -1); setFolderPath(next); setSelectedSlot(0); pushNav(page, next); };
  const onDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    setActiveDragKind(id.startsWith('pick:') ? (id.slice('pick:'.length) as DeckPickerKind) : null);
  };
  const onDragEnd = (e: DragEndEvent) => {
    setActiveDragKind(null);
    if (!target) return;
    const activeId = String(e.active.id);
    const to = e.over ? Number(e.over.id) : NaN;
    if (!Number.isFinite(to)) return;
    // An action dragged from the picker (`pick:<kind>`) assigns to that slot;
    // otherwise a cell was dragged onto another cell to reorder.
    if (activeId.startsWith('pick:')) {
      const kind = activeId.slice('pick:'.length) as DeckPickerKind;
      target.updateSlot(page, folderPath, to, slotForPickerKind(kind, viewSlots[to] ?? {}, target.config.defaultTitleStyle));
      setSelectedSlot(to);
      return;
    }
    const from = Number(activeId);
    if (!Number.isFinite(from) || from === to) return;
    target.swapSlots(page, folderPath, from, to);
  };

  const clearSlot = (i: number) => { if (target) target.updateSlot(page, folderPath, i, {}); };
  const requestDelete = (i: number) => {
    const s = viewSlots[i];
    const count = s?.folder ? countBoundSlots(s.folder.slots) : 0;
    if (count > 0) setDeleteConfirm({ index: i, count });
    else clearSlot(i);
  };

  const TABS: TabDef[] = [
    { key: 'customize', label: t('devices.streamdeck.tab.customize'), icon: <LayoutGrid size={14} /> },
    { key: 'settings', label: t('devices.streamdeck.tab.settings'), icon: <SettingsIcon size={14} /> },
  ];

  return (
    <div className={styles.page}>
      <ViewHeader
        title={t('devices.streamdeck.modelName', { model: deck.model })}
        tabs={TABS}
        activeTab={tab}
        onTabChange={k => setTab(k as StreamDeckTab)}
        tabActions={tab === 'customize' && deckPresets.available ? (
          <PresetToolbar
            presets={deckPresets.presets}
            activeId={deckPresets.activeId}
            presetCount={deckPresets.presetCount}
            canUndo={canUndoDeck}
            canRedo={canRedoDeck}
            onLoad={onDeckPresetLoad}
            onCreate={deckPresets.handleCreate}
            onRename={deckPresets.handleRename}
            onDelete={deckPresets.handleDelete}
            onReset={handleDeckReset}
            onUndo={handleUndoDeck}
            onRedo={handleRedoDeck}
            // eslint-disable-next-line i18next/no-literal-string -- i18n key name, not literal UI text
            resetLabelKey="devices.streamdeck.presets.reset"
            // eslint-disable-next-line i18next/no-literal-string -- i18n key name, not literal UI text
            resetConfirmKey="devices.streamdeck.presets.resetConfirm"
          />
        ) : undefined}
      />
      <div className={`${styles.pageBody} pageBody`}>
        {deck.warning && (
          <div className={styles.warningBanner}>
            {/* eslint-disable-next-line i18next/no-literal-string -- ARIA boolean attribute */}
            <AlertTriangle size={14} aria-hidden="true" />
            <span>{t('devices.streamdeck.elgatoConflict')}</span>
          </div>
        )}
        {activeConflict && <ConflictAppCard conflict={activeConflict} />}

        {tab === 'customize' ? (
          <DndContext sensors={dragSensors} collisionDetection={dropCollision} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveDragKind(null)}>
          <div className={styles.customizeSplit}>
            <div className={styles.leftCol}>
              <div className={styles.previewTop}>
                <div className={styles.previewStage}>
                  {target && (
                    <DeckGrid
                      slots={viewSlots}
                      cols={target.cols}
                      rows={target.rows}
                      square
                      selectable
                      dragEnabled
                      selectedIndex={selSlot}
                      onCell={onCellClick}
                      backCell={inFolder ? { onBack, ariaLabel: t('panel.settings.deck.back') } : undefined}
                    />
                  )}
                </div>
                {target && (
                  <div className={styles.pageRow}>
                    <div className={styles.pageRowSide} />
                    <DeckPageStrip
                      numbered
                      pageCount={pageCount}
                      currentPage={page}
                      onSelectPage={onSelectPage}
                      onAddPage={() => { if (pageCount >= MAX_DECK_PAGES) return; target.addPage(); onSelectPage(pageCount); }}
                      onRemoveCurrentPage={() => { target.removePage(page); onSelectPage(Math.max(0, page - 1)); }}
                      currentPageHasContent={pageHasContent(target.config.pages[page] ?? { slots: [] })}
                    />
                    <div className={`${styles.pageRowSide} ${styles.pageRowRight}`}>
                      {selectedBound && (
                        <button type="button" className={styles.pageRowBtn} onClick={() => requestDelete(selSlot)} aria-label={t('common.delete')}>
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {!deck.verified && (
                  <span className={styles.experimentalChip}>{t('devices.streamdeck.experimental')}</span>
                )}
              </div>

              <div className={styles.editorPane}>
                {target ? (
                  <DeckKeyInspector
                    target={target}
                    page={page}
                    folderPath={folderPath}
                    onFolderPathChange={onEnterFolder}
                    selectedSlot={selectedSlot}
                    onSelectedSlotChange={setSelectedSlot}
                    // eslint-disable-next-line i18next/no-literal-string -- PanelSurface enum value
                    surface="desktop"
                    desktopEditor
                    // eslint-disable-next-line i18next/no-literal-string -- render-part enum value
                    part="editor"
                    gridEntersFolders
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
            </div>

            {target && (
              <div className={styles.pickerPane}>
                <DeckKeyInspector
                  target={target}
                  page={page}
                  folderPath={folderPath}
                  onFolderPathChange={onEnterFolder}
                  selectedSlot={selectedSlot}
                  onSelectedSlotChange={setSelectedSlot}
                  // eslint-disable-next-line i18next/no-literal-string -- PanelSurface enum value
                  surface="desktop"
                  desktopEditor
                  // eslint-disable-next-line i18next/no-literal-string -- render-part enum value
                  part="picker"
                />
              </div>
            )}
          </div>
          <DragOverlay dropAnimation={null}>
            {activeDragKind ? <DeckActionDragPreview kind={activeDragKind} /> : null}
          </DragOverlay>
          </DndContext>
        ) : (
          <div className={styles.settingsFull}>
            <SettingsSection>
              <SettingRow label={t('devices.streamdeck.deviceName')}>
                <EditableText
                  value={deck.name}
                  onCommit={next => void rename(deck.serial, next)}
                  maxLength={40}
                  ariaLabel={t('devices.streamdeck.deviceName')}
                />
              </SettingRow>
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
            </SettingsSection>
            {target && <DeckDefaultTitleSettings target={target} />}
          </div>
        )}
      </div>
      <ConfirmModal
        open={!!deleteConfirm}
        title={t('panel.settings.deck.deleteFolder.title')}
        message={t('panel.settings.deck.deleteFolder.body', { count: deleteConfirm?.count ?? 0 })}
        destructive
        onConfirm={() => { if (deleteConfirm) clearSlot(deleteConfirm.index); setDeleteConfirm(null); }}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}

export default StreamDeckDevicePage;
