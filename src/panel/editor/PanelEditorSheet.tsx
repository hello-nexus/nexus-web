import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Settings2, Trash2, X } from 'lucide-react';
import { usePanelSheetSwipe } from '../engine/usePanelSheetSwipe';
import { sizeToSpan } from '../engine/grid';
import { lookupApp, sizesForSurface } from '../widgets/registry';
import type { DeckEditView } from '../widgets/types';
import { SIZE_ICONS } from '../widgets/common/SizeIcons';
import { WidgetControlGroup } from '../widgets/common/WidgetControlGroup';
import { SlotCountIcon } from '../widgets/monitoring/SlotCountIcons';
import { slotCountOptionsForSize, resolvedSlotCountForSize } from '../widgets/monitoring/perfSlots';
import { PanelWidgetCatalog } from './PanelWidgetCatalog';
import { PanelHostNameSetting } from './PanelHostNameSetting';
import { PanelThemeSettings, type ResolvedPanelThemeMode } from './PanelThemeSettings';
import { PairRemoteContent } from '../../components/common/PairRemote/PairRemoteContent';
import { PairedPcsContent } from '../../components/common/PairedPcs/PairedPcsContent';
import { IconLabelButton } from '../../components/common/IconLabelButton/IconLabelButton';
import { useTranslation } from '../../lib/i18n';
import type { ThemeMode } from '../../lib/settings';
import type { EffectState } from '../../types/lighting';
import type { PanelConfigValue, PanelSurface, PanelWidget, PanelWidgetSize } from '../types';
import { isSingleWidgetSurface } from '../types';
import type { PanelBackgroundMode } from '../background/panelBackground';
import type { PanelThemeState } from '../theme/panelTheme';
import styles from '../PanelApp.module.scss';

export type SheetMode = 'catalog' | 'settings' | 'panelSettings' | 'pairRemote' | 'pairedPcs';

export function PanelEditorSheet({
  mode,
  surface,
  deviceId,
  deviceTouch,
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
  onThemeBackgroundEffectStatePreview,
  onThemeBackgroundEffectStateCommit,
  onThemeBackgroundOpacityPreview,
  onThemeBackgroundOpacityCommit,
  onThemeBackgroundMediaCommit,
  onThemeWidgetOpacityPreview,
  onThemeWidgetOpacityCommit,
  onThemeWidgetLabelsCommit,
  onThemeWidgetBlurCommit,
  onThemeWidgetPaddingPreview,
  onThemeWidgetPaddingCommit,
  showMediaTab = false,
  deviceAspect,
  deviceW,
  deviceH,
  machineName,
  showHostName,
  onMachineNameCommit,
  onAdd,
  onResize,
  onUpdate,
  onRemove,
  selectedMonitoringSlot,
  onSelectedMonitoringSlotChange,
  editView,
  onEditViewChange,
}: {
  mode: SheetMode;
  surface: PanelSurface;
  // This panel's device id, forwarded to the theme editor's cross-panel badge.
  deviceId?: string;
  // Per-device touch capability (promoted monitors) for catalog/size gating.
  deviceTouch?: boolean;
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
  onThemeBackgroundEffectStatePreview: (state: EffectState) => void;
  onThemeBackgroundEffectStateCommit: (state: EffectState) => void;
  onThemeBackgroundOpacityPreview: (opacity: number) => void;
  onThemeBackgroundOpacityCommit: (opacity: number) => void;
  onThemeBackgroundMediaCommit: (mediaId: string | null, type: 'static' | 'animated' | null) => void;
  onThemeWidgetOpacityPreview: (opacity: number) => void;
  onThemeWidgetOpacityCommit: (opacity: number) => void;
  onThemeWidgetLabelsCommit: (enabled: boolean) => void;
  onThemeWidgetBlurCommit: (enabled: boolean) => void;
  onThemeWidgetPaddingPreview: (percent: number) => void;
  onThemeWidgetPaddingCommit: (percent: number) => void;
  showMediaTab?: boolean;
  deviceAspect?: number;
  deviceW?: number;
  deviceH?: number;
  machineName: string;
  // Whether to show the host-name (computer-name) editor. Off on hardwired,
  // non-user-paired surfaces (Y70, Q-series): the machine is self-evident there
  // and the field is unusable without a keyboard. Mirrors the connection
  // identity gate that hides the tray's "Connected to <PC>" line.
  showHostName: boolean;
  onMachineNameCommit: (next: string) => void;
  onAdd: (type: string, size: PanelWidgetSize) => void;
  onResize: (widgetId: string, size: PanelWidgetSize) => void;
  onUpdate: (widgetId: string, config: Record<string, PanelConfigValue>) => void;
  onRemove: (widgetId: string) => void;
  selectedMonitoringSlot: number;
  onSelectedMonitoringSlotChange: (slot: number) => void;
  editView: DeckEditView;
  onEditViewChange: (view: DeckEditView) => void;
}) {
  const { t } = useTranslation();
  const def = editingWidget ? lookupApp(editingWidget.type) : undefined;
  const title = mode === 'panelSettings'
    ? t('panel.actions.settings')
    : mode === 'pairRemote'
    ? t('phonePair.title')
    : mode === 'pairedPcs'
    ? t('pairedPcs.title')
    : mode === 'settings' && editingWidget && def
    ? t(def.meta.i18nKey) || editingWidget.type
    : t('panel.editor.addWidgetTitle');
  const Settings = def?.Settings;
  const isMonitoringWidget = editingWidget?.type === 'monitoring';
  const usesSlotSelection = !!def?.meta.usesSlotSelection;
  const widgetSizes = editingWidget && def ? sizesForSurface(def.meta, surface, deviceTouch) : [];
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
  // Esc closes the sheet. Desktop modals get this via Overlay; the editor
  // sheet keeps its own swipe + dock-motion lifecycle, so wire the handler
  // inline instead of wrapping in Overlay (which would fight the entry/closing
  // animation states).
  useEffect(() => {
    if (closing) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [closing, onClose]);
  // scale(var(--panel-scale, 1)) keeps the monitor-panel chrome scale during
  // a swipe-dismiss drag; no-op on phone/desktop (var unset → 1).
  const sheetTransform = swipe.state === 'idle' && swipe.offset === 0
    ? undefined
    : { transform: `translateY(${swipe.offset}px) scale(var(--panel-scale, 1))` };
  // [data-entered] suppresses the entry keyframe after it plays, so toggling
  // [data-drag] at the end of a snap-back doesn't re-trigger the slide-up. The
  // fallback timer covers the no-interaction case; the effect flips the flag
  // synchronously when dragging starts, before [data-drag] toggles back off.
  const [didEnter, setDidEnter] = useState(false);
  useEffect(() => {
    // Swipe state is external pointer input; flipping the entry latch on first
    // touch (before the 320ms timer) syncs to that gesture stream.
     
    if (swipe.state !== 'idle') setDidEnter(true);
  }, [swipe.state]);
  useEffect(() => {
    const t = window.setTimeout(() => setDidEnter(true), 320);
    return () => window.clearTimeout(t);
  }, []);

  const handleResize = (size: PanelWidgetSize) => {
    if (!editingWidget) return;
    // Monitoring clamps the selected slot to the resized layout's slot count.
    // Other slot-selection widgets (deck) clamp themselves on read.
    if (isMonitoringWidget) {
      const nextSlotCount = resolvedSlotCountForSize(size, editingWidget.config?.slotCount as number | undefined);
      onSelectedMonitoringSlotChange(Math.min(selectedMonitoringSlot, nextSlotCount - 1));
    }
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
          {mode === 'settings' && editingWidget && (
            <button
              type="button"
              className={styles.removeButton}
              onClick={() => onRemove(editingWidget.id)}
              aria-label={t('panel.editor.removeWidget')}
            >
              <Trash2 size={15} />
            </button>
          )}
          <button type="button" className={styles.editorIconButton} onClick={onClose} aria-label={t('app.window.close')}>
            <X size={17} />
          </button>
        </header>

        {mode === 'catalog' && (
          <PanelWidgetCatalog
            surface={surface}
            deviceTouch={deviceTouch}
            onAdd={onAdd}
            // The on-device phone panel is itself the remote session, so hide
            // local-only widgets there.
            remote={surface === 'phone'}
          />
        )}

        {mode === 'settings' && editingWidget && def && (
          <div className={styles.settingsBody}>
            {(widgetSizes.length > 1 || slotCountOptions.length > 1) && (
              <div className={styles.editorActions}>
                <div className={styles.controlPicker}>
                  {widgetSizes.length > 1 && (
                    <WidgetControlGroup title={isMonitoringWidget ? t('panel.editor.layout') : t('panel.editor.size')}>
                      {widgetSizes.map(size => {
                        const SizeIcon = SIZE_ICONS[size];
                        return (
                          <IconLabelButton
                            key={size}
                            className={styles.editorControlButton}
                            active={size === editingWidget.size}
                            icon={SizeIcon ? <SizeIcon aria-hidden="true" /> : undefined}
                            ariaLabel={`${isMonitoringWidget ? t('panel.editor.layout') : t('panel.editor.size')} ${size}`}
                            onPress={() => handleResize(size)}
                            title={size}
                          />
                        );
                      })}
                    </WidgetControlGroup>
                  )}
                  {isMonitoringWidget && slotCountOptions.length > 0 && (
                    <WidgetControlGroup title={t('panel.editor.slots')}>
                      {slotCountOptions.map(n => {
                        const slotLabel = n === 1
                          ? t('panel.editor.slotCount.one', { count: n })
                          : t('panel.editor.slotCount.other', { count: n });
                        return (
                          <IconLabelButton
                            key={n}
                            className={styles.editorControlButton}
                            active={n === slotCount}
                            icon={<SlotCountIcon count={n} size={editingWidget.size} aria-hidden="true" />}
                            ariaLabel={slotLabel}
                            title={slotLabel}
                            onPress={() => handleSlotCount(n)}
                          />
                        );
                      })}
                    </WidgetControlGroup>
                  )}
                </div>
              </div>
            )}
            {Settings ? (
              <Settings
                widget={editingWidget}
                surface={surface}
                onUpdate={config => onUpdate(editingWidget.id, config)}
                onResize={handleResize}
                selectedSlot={usesSlotSelection ? selectedMonitoringSlot : undefined}
                onSelectedSlotChange={usesSlotSelection ? onSelectedMonitoringSlotChange : undefined}
                editView={usesSlotSelection ? editView : undefined}
                onEditViewChange={usesSlotSelection ? onEditViewChange : undefined}
              />
            ) : (
              <div className={styles.settingsEmpty}>
                <Settings2 size={18} />
                <span>{t('panel.editor.noSettings')}</span>
              </div>
            )}
          </div>
        )}

        {mode === 'panelSettings' && (
          <div className={`${styles.settingsBody} ${styles.panelSettingsStack}`}>
            {showHostName && (
              <PanelHostNameSetting
                machineName={machineName}
                onCommit={onMachineNameCommit}
              />
            )}
            <PanelThemeSettings
              theme={panelTheme}
              deviceId={deviceId}
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
              onBackgroundEffectStatePreview={onThemeBackgroundEffectStatePreview}
              onBackgroundEffectStateCommit={onThemeBackgroundEffectStateCommit}
              onBackgroundOpacityPreview={onThemeBackgroundOpacityPreview}
              onBackgroundOpacityCommit={onThemeBackgroundOpacityCommit}
              onBackgroundMediaCommit={onThemeBackgroundMediaCommit}
              showMediaTab={showMediaTab}
              deviceAspect={deviceAspect}
              deviceW={deviceW}
              deviceH={deviceH}
              onWidgetOpacityPreview={onThemeWidgetOpacityPreview}
              onWidgetOpacityCommit={onThemeWidgetOpacityCommit}
              onWidgetLabelsCommit={onThemeWidgetLabelsCommit}
              onWidgetBlurCommit={onThemeWidgetBlurCommit}
              onWidgetPaddingPreview={onThemeWidgetPaddingPreview}
              onWidgetPaddingCommit={onThemeWidgetPaddingCommit}
              hideWidgetChromeControls={isSingleWidgetSurface(surface)}
            />
          </div>
        )}

        {mode === 'pairRemote' && (
          <div className={styles.settingsBody}>
            <PairRemoteContent active layout="stacked" />
          </div>
        )}

        {mode === 'pairedPcs' && (
          <div className={styles.settingsBody}>
            <PairedPcsContent />
          </div>
        )}
      </aside>
    </div>
  );
}
