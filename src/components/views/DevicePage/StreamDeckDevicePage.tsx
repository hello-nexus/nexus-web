import { useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { AlertTriangle, LayoutGrid, Monitor, Settings as SettingsIcon, Unplug, Trash2 } from 'lucide-react';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, pointerWithin, closestCenter, type DragEndEvent, type DragStartEvent, type CollisionDetection } from '@dnd-kit/core';
import { useTranslation } from '../../../lib/i18n';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { localizeNumbers } from '../../../lib/units';
import { useStreamDecks } from '../../../hooks/useStreamDecks';
import { setStreamDeckNav } from '../../../api/streamdeck';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import type { UnifiedDevice } from '../../../hooks/useUnifiedDevices';
import { useConflictApps } from '../../../hooks/useConflictApps';
import { useDeckInstance } from '../../../panel/widgets/deck/useDeckInstance';
import { useRecentApps } from '../../../panel/widgets/deck/useRecentApps';
import { buildRecentAppsView, type RecentAppsViewKey } from '../../../panel/widgets/deck/recentAppsView';
import { DeckInstanceEditor } from '../../../panel/widgets/deck/DeckInstanceEditor';
import { takePendingDeckEditorTarget, onDeckOpenEditor } from '../../../panel/widgets/deck/deckOpenEditorNav';
import { DeckGrid } from '../../../panel/widgets/deck/DeckGrid';
import { DeckKeyInspector, DeckDefaultTitleSettings, DeckActionDragPreview, slotForPickerKind, type DeckPickerKind } from '../../../panel/widgets/deck/DeckKeyInspector';
import { DeckPageStrip } from '../../../panel/widgets/deck/DeckPageStrip';
import { padSlots, pageHasContent, countBoundSlots, MAX_DECK_PAGES } from '../../../panel/widgets/deck/deckLayout';
import { withPageIndicatorDisplay } from '../../../panel/widgets/deck/deckIcons';
import { resolveTargetView, slotCountAtDepth } from '../../../panel/widgets/deck/deckTarget';
import { isLocalhostUnreachable } from '../../../api/service';
import type { DeckSlot } from '../../../panel/widgets/deck/types';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { ElgatoImportModal } from './ElgatoImportModal';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import type { TabDef } from '../../common/Tabs/Tabs';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { EditableText } from '../../common/Editable/EditableText';
import { SettingRow, SettingSelect, SettingSlider, SettingToggle } from '../../common/SettingRow/SettingRow';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { ConflictAppCard } from '../../common/ConflictAppCard/ConflictAppCard';
import { Button } from '../../common/Button/Button';
import styles from './StreamDeckDevicePage.module.scss';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

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

// Placeholder DeckSlot for one Recent Apps ring key, so DeckGrid's liveTiles
// path renders the service's own key image once pushed (a slot with no
// action/icon/folder reads as "empty" and skips liveSrc entirely) - the
// generic icon shown here is only what's visible before the first frame.
function recentKeyToPlaceholderSlot(key: RecentAppsViewKey): DeckSlot {
  if (key.kind === 'app') return { icon: { kind: 'lucide', value: 'AppWindow' } };
  if (key.kind === 'navNext') return { action: { type: 'page', op: 'next' } };
  if (key.kind === 'navPrev') return { action: { type: 'page', op: 'prev' } };
  return {};
}

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
 * split: the Customize tab has the mode chip + preset toolbar on top, the
 * shared key inspector on the left and, on the right, the top-aligned deck
 * preview with page-number pagination and the model name below it; the
 * Settings tab has device prefs on the left and a read-only preview of the
 * same grid on the right. Each connected/persisted deck gets its own sidebar
 * entry (see useUnifiedDevices), so `device` always identifies exactly one
 * deck by serial - there is no in-page deck picker.
 */
export function StreamDeckDevicePage({ device }: StreamDeckDevicePageProps) {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  const { decks, loaded, rename, setBrightness, setOrientation, setSleepAfterSeconds, setSleepWhenLocked } = useStreamDecks(true);
  const serial = device.streamdeckSerial ?? null;
  const [page, setPage] = useState(0);
  const [folderPath, setFolderPath] = useState<number[]>([]);
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [pendingFlashSlot, setPendingFlashSlot] = useState<number | null>(null);
  const previewStageRef = useRef<HTMLDivElement | null>(null);
  const [brightnessDraft, setBrightnessDraft] = useState<number | null>(null);
  const [tab, setTab] = useState<StreamDeckTab>('customize');
  const [activeDragKind, setActiveDragKind] = useState<DeckPickerKind | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ index: number; count: number } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const dragSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const deck = decks.find(d => d.serial === serial) ?? null;
  const instanceId = serial ? `streamdeck:${serial}` : null;
  const instanceGrid = useMemo(() => ({ cols: deck?.cols ?? 0, rows: deck?.rows ?? 0 }), [deck?.cols, deck?.rows]);
  const instance = useDeckInstance(instanceId, 'physical', instanceGrid, tab === 'customize');
  const target = instance.target;

  // Recent Apps has no authored preset content to render - every key comes
  // from the live ring, painted server-side and pushed over streamdeckTiles
  // like every other key; the desktop preview mirrors buildRecentAppsView
  // only to know how many pages there are and which keys are nav vs blank.
  const recentAppsMode = instance.instance?.mode === 'recentApps';
  const recentApps = useRecentApps(recentAppsMode);
  const recentPages = useMemo(
    () => buildRecentAppsView(recentApps.apps, recentApps.focusedProcessKey, deck?.cols ?? 0, deck?.rows ?? 0),
    [recentApps.apps, recentApps.focusedProcessKey, deck?.cols, deck?.rows],
  );
  const [recentPage, setRecentPage] = useState(0);
  const recentMaxPage = Math.max(0, recentPages.length - 1);
  useEffect(() => { if (recentPage > recentMaxPage) setRecentPage(recentMaxPage); }, [recentPage, recentMaxPage]);

  // Seeds the initial view from the deck summary's own live page/folder
  // (same fields the 'nav' frame carries) so the editor opens on whatever
  // the hardware is actually showing - page 3, inside a folder - instead of
  // always page 0. One-shot: only the FIRST summary this page instance sees
  // seeds anything, so the deck list's frequent 'streamdeck'-topic-driven
  // refreshes (press events, other decks' brightness, ...) never re-seed
  // over the user's own navigation. Below, the 'nav' frame subscription runs
  // unconditionally on every frame, so a hardware press after this seed has
  // run always wins. A press whose frame arrives before the deck summary's
  // first GET resolves is a known gap: this effect still fires once `deck`
  // loads and unconditionally overwrites page/folderPath with that (by then
  // stale) summary snapshot.
  const seededNavRef = useRef(false);
  useEffect(() => {
    if (seededNavRef.current || !deck) return;
    seededNavRef.current = true;
    if (typeof deck.currentPage === 'number') setPage(deck.currentPage);
    if (Array.isArray(deck.folderPath)) setFolderPath(deck.folderPath);
  }, [deck]);

  // A blank-key hold-to-edit that navigated here (or fired while already on
  // this deck) selects the held key on the Customize tab, and pulses it once
  // the grid has rendered. Marks the nav seed done so the summary's live
  // page/folder can't clobber the held target when `deck` loads afterward.
  const applyEditorTarget = useCallback(() => {
    if (!serial) return;
    const editTarget = takePendingDeckEditorTarget(serial);
    if (!editTarget) return;
    seededNavRef.current = true;
    setTab('customize');
    setPage(editTarget.page);
    setFolderPath(editTarget.folderPath);
    setSelectedSlot(editTarget.keyIndex);
    setPendingFlashSlot(editTarget.keyIndex);
  }, [serial]);
  useEffect(() => {
    applyEditorTarget();
    return onDeckOpenEditor(applyEditorTarget);
  }, [applyEditorTarget]);

  // Live per-key tile frames the service renders for this deck (the same
  // pixels pushed to the hardware), keyed `${page}:${slotPath}` (slotPath per
  // deckTarget.slotPathAt) to a data URI -
  // handed to DeckGrid's liveTiles so the preview is pixel-identical to the
  // physical key by construction rather than approximated in CSS. Frames for
  // a different deck's serial are dropped. clearLiveTiles resets the map
  // wherever the config's topology changes client-side (undo/redo/reset/
  // preset load), so a reordered or deleted slot can never show a frame keyed
  // at the old shape; the subscription itself is gated to the Customize tab,
  // since the grid it feeds isn't mounted on Settings.
  const [liveTiles, setLiveTiles] = useState<Map<string, string>>(new Map());
  const clearLiveTiles = useCallback(() => setLiveTiles(new Map()), []);
  useTopicCallback('streamdeckTiles', !isLocalhostUnreachable() && !!serial && tab === 'customize', useCallback((data: unknown) => {
    const f = data as { serial?: string; page?: number; slotPath?: string; mime?: string; data?: string };
    if (f.serial !== serial || typeof f.page !== 'number' || typeof f.slotPath !== 'string' || typeof f.data !== 'string') return;
    const key = `${f.page}:${f.slotPath}`;
    const src = `data:${f.mime || 'image/jpeg'};base64,${f.data}`;
    setLiveTiles(prev => {
      if (prev.get(key) === src) return prev;
      const next = new Map(prev);
      next.set(key, src);
      return next;
    });
  }, [serial]));

  // Pulse the held key once the grid has rendered it (target loaded), so a
  // hold-to-edit arrival draws the eye to the selected key.
  useEffect(() => {
    if (pendingFlashSlot == null || !target) return;
    const cell = previewStageRef.current?.querySelector<HTMLElement>(`[data-deck-slot-index="${pendingFlashSlot}"]`);
    if (!cell) return;
    setPendingFlashSlot(null);
    cell.animate?.(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }],
      { duration: 480, iterations: 2, easing: 'ease-in-out' },
    );
  }, [pendingFlashSlot, target]);

  const { conflicts } = useConflictApps(!!deck?.conflictAppId);
  const activeConflict = deck?.conflictAppId ? conflicts.find(c => c.id === deck.conflictAppId) : undefined;

  // A preset's config is applied server-side (activation resets nav to page
  // 0); useDeckInstance.activate already refetches the new preset's config.
  const onDeckPresetLoad = useCallback(async (id: string) => {
    await instance.activate(id);
    clearLiveTiles();
    setPage(0);
    setFolderPath([]);
    setSelectedSlot(0);
  }, [instance, clearLiveTiles]);

  // Deleting the active preset promotes the first remaining one server-side;
  // re-render from page 1 so the view shows the promoted preset rather than
  // the deleted one's stale config.
  const onDeckPresetDelete = useCallback(async (id: string) => {
    const wasActive = instance.instance?.activePresetId === id;
    await instance.deletePreset(id);
    if (wasActive) {
      setPage(0);
      setFolderPath([]);
      setSelectedSlot(0);
      clearLiveTiles();
    }
  }, [instance, clearLiveTiles]);

  const handleUndoDeck = useCallback(() => { clearLiveTiles(); instance.undo(); }, [instance, clearLiveTiles]);
  const handleRedoDeck = useCallback(() => { clearLiveTiles(); instance.redo(); }, [instance, clearLiveTiles]);
  const handleDeckReset = useCallback(() => { clearLiveTiles(); instance.reset(); }, [instance, clearLiveTiles]);

  // DeckDefaultTitleSettings (Settings tab) commits through the same
  // instance as the Customize tab's key editor, so a tab switch mid-burst
  // must close it - otherwise an edit on the other tab lands inside a burst
  // anchored on an unrelated field's pre-edit config.
  const handleTabChange = useCallback((next: StreamDeckTab) => {
    instance.endEditBurst();
    setTab(next);
  }, [instance]);

  // Follow the physical deck's navigation: pressing prev/next page, go-to-page,
  // or entering/leaving a folder on the hardware broadcasts a `nav` frame, so
  // the editor moves to the same page/folder the deck is showing.
  useTopicCallback('streamdeck', !isLocalhostUnreachable() && !!serial, useCallback((data: unknown) => {
    const f = data as { kind?: string; serial?: string; page?: number; folderPath?: number[] };
    if (f.kind !== 'nav' || f.serial !== serial) return;
    if (typeof f.page === 'number') {
      setPage(f.page);
      if (recentAppsMode) setRecentPage(f.page);
    }
    setFolderPath(Array.isArray(f.folderPath) ? f.folderPath : []);
    setSelectedSlot(0);
  }, [serial, recentAppsMode]));

  // Mirror an editor-initiated nav onto the hardware (desktop -> device). Only
  // user actions call this; the `nav`-frame subscription above (device ->
  // desktop) sets state without pushing, so the two directions never echo.
  const pushNav = useCallback((p: number, fp: readonly number[]) => {
    if (serial) void setStreamDeckNav(serial, p, fp);
  }, [serial]);
  const onSelectPage = (next: number) => { setPage(next); setFolderPath([]); setSelectedSlot(0); pushNav(next, []); };
  const onEnterFolder = (next: number[]) => { setFolderPath(next); setSelectedSlot(0); pushNav(page, next); };

  // Recent Apps has its own local page index (buildRecentAppsView's auto
  // pagination, not an authored page), but the service still keys its
  // streamdeckTiles pushes off the deck's CURRENT page, so browsing here has
  // to push nav the same way a Fixed-mode page change does or the tiles for
  // the newly selected page never arrive.
  const goToRecentPage = (next: number) => { setRecentPage(next); pushNav(next, []); };

  // /streamdeck/* is .LocalhostOnly(); a remote-paired session (or a browser
  // reaching the dashboard over the relay) would otherwise sit on this page
  // forever with useStreamDecks refusing to fetch and `loaded` never true.
  if (isLocalhostUnreachable()) {
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
  // it, and clicking an already-selected page-nav key (next/prev/goto)
  // navigates the editor to that page, clamped like the physical deck's own
  // page-nav handling (StreamDeckConnectionWorker.HandlePageAction). Going
  // back is the grid's Back key.
  const onCellClick = (i: number) => {
    const slot = viewSlots[i];
    if (i === selSlot) {
      if (slot?.folder) { onEnterFolder([...folderPath, i]); return; }
      if (slot?.action?.type === 'page') {
        const a = slot.action;
        const rawNext = a.op === 'next' ? page + 1 : a.op === 'prev' ? page - 1 : (a.target ?? page);
        onSelectPage(clamp(rawNext, 0, pageCount - 1));
        return;
      }
    }
    setSelectedSlot(i);
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
        onTabChange={k => handleTabChange(k as StreamDeckTab)}
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
          <>
            <DeckInstanceEditor
              deck={instance}
              instanceGrid={instanceGrid}
              kind="physical"
              page={page}
              onPageChange={onSelectPage}
              folderPath={folderPath}
              onFolderPathChange={onEnterFolder}
              selectedSlot={selectedSlot}
              onSelectedSlotChange={setSelectedSlot}
              // eslint-disable-next-line i18next/no-literal-string -- PanelSurface enum value
              surface="desktop"
              desktopEditor
              onImport={() => setImportOpen(true)}
              onLoad={id => void onDeckPresetLoad(id)}
              onDelete={id => void onDeckPresetDelete(id)}
              onUndo={handleUndoDeck}
              onRedo={handleRedoDeck}
              onReset={handleDeckReset}
              // eslint-disable-next-line i18next/no-literal-string -- render-mode enum value
              bodyMode="toolbarOnly"
            />
            {recentAppsMode ? (
              <div className={styles.customizeSplit}>
                <div className={styles.leftCol}>
                  <div className={styles.previewTop}>
                    <div className={styles.previewStage}>
                      <DeckGrid
                        slots={(recentPages[recentPage] ?? []).map(recentKeyToPlaceholderSlot)}
                        cols={deck.cols}
                        rows={deck.rows}
                        square
                        selectable={false}
                        onCell={i => {
                          const key = recentPages[recentPage]?.[i];
                          if (key?.kind === 'navNext') goToRecentPage(Math.min(recentPage + 1, recentMaxPage));
                          else if (key?.kind === 'navPrev') goToRecentPage(Math.max(recentPage - 1, 0));
                        }}
                        liveTiles={liveTiles}
                        page={recentPage}
                        folderPath={[]}
                      />
                    </div>
                    <div className={styles.pageRow}>
                      <div className={styles.pageRowSide} />
                      <DeckPageStrip
                        numbered
                        readOnly
                        pageCount={recentPages.length}
                        currentPage={recentPage}
                        onSelectPage={goToRecentPage}
                      />
                      <div className={`${styles.pageRowSide} ${styles.pageRowRight}`} />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
            <DndContext sensors={dragSensors} collisionDetection={dropCollision} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveDragKind(null)}>
            <div className={styles.customizeSplit}>
              <div className={styles.leftCol}>
                <div className={styles.previewTop}>
                  <div className={styles.previewStage} ref={previewStageRef}>
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
                        onDeleteSlot={requestDelete}
                        liveTiles={liveTiles}
                        page={page}
                        folderPath={folderPath}
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
                      onDeleteSlot={() => requestDelete(selSlot)}
                    />
                  ) : instance.error ? (
                    <div className={styles.loadError}>
                      <span>{t('panel.settings.deck.rail.loadFailed')}</span>
                      <Button type="button" size="sm" tone="neutral" onClick={instance.retry}>{t('panel.settings.deck.rail.retry')}</Button>
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
            )}
          </>
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
              <SettingToggle
                label={t('devices.streamdeck.sleepWhenLocked')}
                checked={deck.sleepWhenLocked ?? true}
                onChange={v => void setSleepWhenLocked(deck.serial, v)}
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
      {serial && (
        <ElgatoImportModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          deckCols={deck.cols}
          deckRows={deck.rows}
          existingPresetNames={instance.presets.map(p => p.name)}
          onImported={id => void onDeckPresetLoad(id)}
        />
      )}
    </div>
  );
}

export default StreamDeckDevicePage;
