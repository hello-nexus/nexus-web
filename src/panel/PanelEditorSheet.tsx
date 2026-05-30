import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Settings2, Trash2, X } from 'lucide-react';
import { usePanelSheetSwipe } from './engine/usePanelSheetSwipe';
import { sizeToSpan } from './engine/grid';
import { lookupApp, sizesForSurface } from './widgets/registry';
import { SIZE_ICONS } from './widgets/common/SizeIcons';
import { WidgetControlGroup } from './widgets/common/WidgetControlGroup';
import { SlotCountIcon } from './widgets/monitoring/SlotCountIcons';
import { slotCountOptionsForSize, resolvedSlotCountForSize } from './widgets/monitoring/perfSlots';
import { PanelWidgetCatalog } from './editor/PanelWidgetCatalog';
import { PanelHostNameSetting } from './editor/PanelHostNameSetting';
import { PanelThemeSettings, type ResolvedPanelThemeMode } from './editor/PanelThemeSettings';
import { IconLabelButton } from '../components/common/IconLabelButton/IconLabelButton';
import { SectionHeader } from '../components/common/SectionHeader/SectionHeader';
import { Toggle } from '../components/common/Toggle/Toggle';
import { useTranslation } from '../lib/i18n';
import type { ThemeMode } from '../lib/settings';
import type { PanelConfigValue, PanelSurface, PanelWidget, PanelWidgetSize } from './types';
import type { PanelBackgroundMode } from './panelBackground';
import type { PanelThemeState } from './panelTheme';
import styles from './PanelApp.module.scss';

export type SheetMode = 'catalog' | 'settings' | 'panelSettings';

export function PanelEditorSheet({
  mode,
  surface,
  editingWidget,
  panelTheme,
  gridColumns,
  gridRows,
  resolvedThemeMode,
  panelThemeStyle,
  closing,
  onClose,
  onThemeSyncCommit,
  onThemeModeCommit,
  onThemeAccentSyncCommit,
  onThemeAccentPreview,
  onThemeAccentCommit,
  onThemeBackgroundPreview,
  onThemeBackgroundCommit,
  onThemeBackgroundModeCommit,
  onThemeBackgroundEffectCommit,
  onThemeBackgroundTemplateCommit,
  onThemeBackgroundOpacityPreview,
  onThemeBackgroundOpacityCommit,
  onThemeWidgetOpacityPreview,
  onThemeWidgetOpacityCommit,
  onThemeWidgetLabelsCommit,
  onThemeWidgetBlurCommit,
  machineName,
  onMachineNameCommit,
  onAdd,
  onResize,
  onUpdate,
  onRemove,
  selectedMonitoringSlot,
  onSelectedMonitoringSlotChange,
  dockSupported,
  dockEnabled,
  onDockToggle,
}: {
  mode: SheetMode;
  surface: PanelSurface;
  editingWidget: PanelWidget | null;
  panelTheme: PanelThemeState;
  gridColumns: number;
  gridRows: number;
  resolvedThemeMode: ResolvedPanelThemeMode;
  panelThemeStyle: CSSProperties;
  closing: boolean;
  onClose: () => void;
  onThemeSyncCommit: (synced: boolean) => void;
  onThemeModeCommit: (mode: ThemeMode) => void;
  onThemeAccentSyncCommit: (synced: boolean) => void;
  onThemeAccentPreview: (hex: string) => void;
  onThemeAccentCommit: (hex: string) => void;
  onThemeBackgroundPreview: (hex: string) => void;
  onThemeBackgroundCommit: (hex: string) => void;
  onThemeBackgroundModeCommit: (mode: PanelBackgroundMode) => void;
  onThemeBackgroundEffectCommit: (effect: string) => void;
  onThemeBackgroundTemplateCommit: (template: number) => void;
  onThemeBackgroundOpacityPreview: (opacity: number) => void;
  onThemeBackgroundOpacityCommit: (opacity: number) => void;
  onThemeWidgetOpacityPreview: (opacity: number) => void;
  onThemeWidgetOpacityCommit: (opacity: number) => void;
  onThemeWidgetLabelsCommit: (enabled: boolean) => void;
  onThemeWidgetBlurCommit: (enabled: boolean) => void;
  machineName: string;
  onMachineNameCommit: (next: string) => void;
  onAdd: (type: string, size: PanelWidgetSize) => void;
  onResize: (widgetId: string, size: PanelWidgetSize) => void;
  onUpdate: (widgetId: string, config: Record<string, PanelConfigValue>) => void;
  onRemove: (widgetId: string) => void;
  selectedMonitoringSlot: number;
  onSelectedMonitoringSlotChange: (slot: number) => void;
  dockSupported: boolean;
  dockEnabled: boolean;
  onDockToggle: () => void;
}) {
  const { t } = useTranslation();
  const def = editingWidget ? lookupApp(editingWidget.type) : undefined;
  const title = mode === 'panelSettings'
    ? 'Settings'
    : mode === 'settings' && editingWidget && def
    ? t(def.meta.i18nKey) || editingWidget.type
    : 'Add a widget';
  const Settings = def?.Settings;
  const isMonitoringWidget = editingWidget?.type === 'monitoring';
  const widgetSizes = editingWidget && def ? sizesForSurface(def.meta, surface) : [];
  const slotCountOptions = editingWidget && isMonitoringWidget ? slotCountOptionsForSize(editingWidget.size) : [];
  const slotCount = editingWidget && isMonitoringWidget
    ? resolvedSlotCountForSize(editingWidget.size, editingWidget.config?.slotCount as number | undefined)
    : 0;
  const editingSpan = editingWidget ? sizeToSpan(editingWidget.size) : null;
  const editorStyle = {
    ...panelThemeStyle,
    '--panel-columns': gridColumns,
    '--panel-rows': gridRows,
    '--panel-editor-dock-cols': editingSpan?.cols ?? 4,
    '--panel-editor-dock-rows': editingSpan?.rows ?? 4,
  } as CSSProperties;
  const sheetRef = useRef<HTMLElement | null>(null);
  const swipe = usePanelSheetSwipe({
    enabled: !closing,
    sheetRef,
    onDismiss: onClose,
  });
  // Esc closes the sheet. The desktop modals (DeviceModal, ConfirmModal)
  // get this through Overlay; the panel editor sheet keeps its bespoke
  // swipe + dock-motion lifecycle, so we wire the keyboard handler
  // inline rather than wrap the sheet in Overlay (which would conflict
  // with the entry/closing animation states).
  useEffect(() => {
    if (closing) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [closing, onClose]);
  // scale(var(--panel-ui-zoom, 1)) keeps the monitor-panel chrome scale
  // during a swipe-to-dismiss drag; the var falls back to 1 on phone /
  // desktop so it's a no-op there.
  const sheetTransform = swipe.state === 'idle' && swipe.offset === 0
    ? undefined
    : { transform: `translateY(${swipe.offset}px) scale(var(--panel-ui-zoom, 1))` };
  // [data-entered] suppresses the entry keyframe after it has played, so
  // toggling [data-drag] at the end of a snap-back doesn't re-trigger the
  // slide-up. The fallback timer covers the no-interaction case; the
  // state-driven effect flips the flag synchronously the moment the user
  // starts dragging, before [data-drag] ever toggles back off.
  const [didEnter, setDidEnter] = useState(false);
  useEffect(() => {
    // The swipe state is driven by external pointer input; flipping the
    // entry latch when the user first touches the sheet (before the
    // 320ms timer fires) is a sync to that external gesture stream,
    // not a derivable value.
     
    if (swipe.state !== 'idle') setDidEnter(true);
  }, [swipe.state]);
  useEffect(() => {
    const t = window.setTimeout(() => setDidEnter(true), 320);
    return () => window.clearTimeout(t);
  }, []);

  const handleResize = (size: PanelWidgetSize) => {
    if (!editingWidget) return;
    const nextSlotCount = resolvedSlotCountForSize(size, editingWidget.config?.slotCount as number | undefined);
    onSelectedMonitoringSlotChange(Math.min(selectedMonitoringSlot, nextSlotCount - 1));
    onResize(editingWidget.id, size);
  };

  const handleSlotCount = (n: number) => {
    if (!editingWidget) return;
    onSelectedMonitoringSlotChange(Math.min(selectedMonitoringSlot, n - 1));
    onUpdate(editingWidget.id, { slotCount: n });
  };

  return (
    <div
      className={`panel-root ${styles.editorBackdrop}`}
      data-mode={mode}
      data-state={closing ? 'closing' : 'open'}
      data-surface={surface}
      data-theme={resolvedThemeMode}
      style={editorStyle}
      onClick={onClose}
    >
      <aside
        ref={sheetRef}
        className={styles.editorSheet}
        data-drag={swipe.state === 'idle' ? undefined : swipe.state}
        data-entered={didEnter ? 'true' : undefined}
        style={sheetTransform}
        onClick={e => e.stopPropagation()}
        onWheel={e => e.stopPropagation()}
      >
        <span className={styles.editorSheetGrabber} aria-hidden="true" />
        <header className={styles.editorHeader}>
          <div className={styles.editorTitle}>{title}</div>
          <button type="button" className={styles.editorIconButton} onClick={onClose} aria-label="Close">
            <X size={17} />
          </button>
        </header>

        {mode === 'catalog' && (
          <PanelWidgetCatalog
            surface={surface}
            onAdd={onAdd}
          />
        )}

        {mode === 'settings' && editingWidget && def && (
          <>
            <div className={styles.editorActions}>
              {(widgetSizes.length > 1 || slotCountOptions.length > 1) && (
                <div className={styles.controlPicker}>
                  {widgetSizes.length > 1 && (
                    <WidgetControlGroup title={isMonitoringWidget ? 'Layout' : 'Size'}>
                      {widgetSizes.map(size => {
                        const SizeIcon = SIZE_ICONS[size];
                        return (
                          <IconLabelButton
                            key={size}
                            className={styles.editorControlButton}
                            active={size === editingWidget.size}
                            icon={SizeIcon ? <SizeIcon aria-hidden="true" /> : undefined}
                            ariaLabel={`${isMonitoringWidget ? 'Layout' : 'Size'} ${size}`}
                            onPress={() => handleResize(size)}
                            title={size}
                          />
                        );
                      })}
                    </WidgetControlGroup>
                  )}
                  {isMonitoringWidget && slotCountOptions.length > 0 && (
                    <WidgetControlGroup title="Slots">
                      {slotCountOptions.map(n => (
                        <IconLabelButton
                          key={n}
                          className={styles.editorControlButton}
                          active={n === slotCount}
                          icon={<SlotCountIcon count={n} size={editingWidget.size} aria-hidden="true" />}
                          ariaLabel={`${n} ${n === 1 ? 'slot' : 'slots'}`}
                          title={`${n} ${n === 1 ? 'slot' : 'slots'}`}
                          onPress={() => handleSlotCount(n)}
                        />
                      ))}
                    </WidgetControlGroup>
                  )}
                </div>
              )}
              <button
                type="button"
                className={styles.removeButton}
                onClick={() => onRemove(editingWidget.id)}
                aria-label="Remove widget"
              >
                <Trash2 size={15} />
              </button>
            </div>
            {Settings ? (
              <div className={styles.settingsBody}>
                <Settings
                  widget={editingWidget}
                  onUpdate={config => onUpdate(editingWidget.id, config)}
                  onResize={handleResize}
                  selectedSlot={isMonitoringWidget ? selectedMonitoringSlot : undefined}
                  onSelectedSlotChange={isMonitoringWidget ? onSelectedMonitoringSlotChange : undefined}
                />
              </div>
            ) : (
              <div className={styles.settingsEmpty}>
                <Settings2 size={18} />
                <span>No settings</span>
              </div>
            )}
          </>
        )}

        {mode === 'panelSettings' && (
          <div className={`${styles.settingsBody} ${styles.panelSettingsStack}`}>
            <PanelHostNameSetting
              machineName={machineName}
              onCommit={onMachineNameCommit}
            />
            {dockSupported && (
              <div className={styles.dockSection}>
                <SectionHeader>Dock</SectionHeader>
                <div className={styles.dockToggleRow}>
                  <span className={styles.dockToggleHint}>
                    Pin up to 4 shortcuts that stay visible across pages.
                  </span>
                  <Toggle
                    checked={dockEnabled}
                    onChange={onDockToggle}
                    ariaLabel="Dock"
                  />
                </div>
              </div>
            )}
            <PanelThemeSettings
              theme={panelTheme}
              resolvedThemeMode={resolvedThemeMode}
              onThemeSyncCommit={onThemeSyncCommit}
              onThemeModeCommit={onThemeModeCommit}
              onAccentSyncCommit={onThemeAccentSyncCommit}
              onAccentPreview={onThemeAccentPreview}
              onAccentCommit={onThemeAccentCommit}
              onBackgroundPreview={onThemeBackgroundPreview}
              onBackgroundCommit={onThemeBackgroundCommit}
              onBackgroundModeCommit={onThemeBackgroundModeCommit}
              onBackgroundEffectCommit={onThemeBackgroundEffectCommit}
              onBackgroundTemplateCommit={onThemeBackgroundTemplateCommit}
              onBackgroundOpacityPreview={onThemeBackgroundOpacityPreview}
              onBackgroundOpacityCommit={onThemeBackgroundOpacityCommit}
              onWidgetOpacityPreview={onThemeWidgetOpacityPreview}
              onWidgetOpacityCommit={onThemeWidgetOpacityCommit}
              onWidgetLabelsCommit={onThemeWidgetLabelsCommit}
              onWidgetBlurCommit={onThemeWidgetBlurCommit}
            />
          </div>
        )}
      </aside>
    </div>
  );
}
