import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { Trash2, X } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { pluralKey } from '../../../lib/pluralKey';
import { lookupApp, sizesForSurface } from '../registry';
import { SIZE_ICONS } from './SizeIcons';
import { WidgetControlGroup } from './WidgetControlGroup';
import { IconLabelButton } from '../../../components/common/IconLabelButton/IconLabelButton';
import { useModalA11y } from '../../../components/common/Overlay/useModalA11y';
import {
  slotLayoutOptionsForSize,
  heroLabelKey,
  resolvedSlotLayout,
  slotLayoutKey,
  type SlotLayout,
} from '../monitoring/perfSlots';
import { SlotLayoutIcon } from '../monitoring/SlotCountIcons';
import type {
  PanelConfigValue,
  PanelSurface,
  PanelWidget,
  PanelWidgetSize,
} from '../../types';
import type { DeckEditView } from '../types';
import styles from './WidgetEditSheet.module.scss';

interface AnchorRect { x: number; y: number; w: number; h: number }

interface WidgetEditSheetProps {
  widget: PanelWidget;
  surface: PanelSurface;
  themeMode?: 'dark' | 'light';
  themeStyle?: CSSProperties;
  title?: string;
  // The widget tile's on-screen rect (CSS pixels). The sheet positions
  // itself adjacent to it (right/left/below/above) without clipping the
  // viewport. When omitted, falls back to viewport center.
  anchorRect?: AnchorRect;
  onResize: (widgetId: string, size: PanelWidgetSize) => void;
  onUpdate: (widgetId: string, config: Record<string, PanelConfigValue>) => void;
  onRemove: (widgetId: string) => void;
  onClose: () => void;
  // Reports the sheet's rendered viewport rect, then `null` on unmount.
  // The desktop overlay drives its host-side hit-test region from this so
  // only the sheet receives clicks; the rest stays click-through.
  onBoundsChange?: (rect: AnchorRect | null) => void;
  // Externally-controlled selected slot for monitoring widgets. When
  // provided, the sheet wires the value into Settings and routes user
  // changes back via onSelectedSlotChange so the parent can pass the same
  // value to the live widget tile (surfacing its dotted-border slot picker).
  // When omitted, the sheet manages slot selection internally.
  selectedSlot?: number;
  onSelectedSlotChange?: (slot: number) => void;
  // Foldered slot-selection widgets (deck): the shared edit-mode view so the
  // live tile and this sheet's Settings navigate the same folder.
  editView?: DeckEditView;
  onEditViewChange?: (view: DeckEditView) => void;
  // Extends click-outside dismissal: clicks on related external surfaces
  // (e.g. the live widget tile being edited on the desktop overlay) don't
  // close the sheet. Clicks elsewhere still dismiss.
  keepOpenOnTarget?: (target: EventTarget | null) => boolean;
}

const PAD = 16;
const SAFE = 8;

function clamp(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

function placeNearAnchor(anchor: AnchorRect, w: number, h: number, vw: number, vh: number): { x: number; y: number } {
  const yAlongAnchor = clamp(anchor.y, SAFE, Math.max(SAFE, vh - h - SAFE));
  const xAlongAnchor = clamp(anchor.x, SAFE, Math.max(SAFE, vw - w - SAFE));

  // Right of the widget.
  const rightX = anchor.x + anchor.w + PAD;
  if (rightX + w <= vw - SAFE) return { x: rightX, y: yAlongAnchor };

  // Left of the widget.
  const leftX = anchor.x - PAD - w;
  if (leftX >= SAFE) return { x: leftX, y: yAlongAnchor };

  // Below the widget.
  const belowY = anchor.y + anchor.h + PAD;
  if (belowY + h <= vh - SAFE) return { x: xAlongAnchor, y: belowY };

  // Above the widget.
  const aboveY = anchor.y - PAD - h;
  if (aboveY >= SAFE) return { x: xAlongAnchor, y: aboveY };

  // Last resort: clamp to viewport, anchored to the side with more space.
  const spaceRight = vw - (anchor.x + anchor.w);
  const spaceLeft = anchor.x;
  const fallbackX = spaceRight >= spaceLeft
    ? clamp(rightX, SAFE, vw - w - SAFE)
    : clamp(leftX, SAFE, vw - w - SAFE);
  return { x: fallbackX, y: yAlongAnchor };
}

export function WidgetEditSheet({
  widget,
  surface,
  themeMode = 'dark',
  themeStyle,
  title: titleOverride,
  anchorRect,
  onResize,
  onUpdate,
  onRemove,
  onClose,
  onBoundsChange,
  selectedSlot: externalSelectedSlot,
  onSelectedSlotChange: externalOnSelectedSlotChange,
  editView,
  onEditViewChange,
  keepOpenOnTarget,
}: WidgetEditSheetProps) {
  const { t, language } = useTranslation();
  const def = lookupApp(widget.type);
  const Settings = def?.Settings;
  const sizes = def ? sizesForSurface(def.meta, surface) : [];
  const isMonitoringWidget = widget.type === 'monitoring';
  // Slot selection is a manifest capability (monitoring + deck), distinct from
  // the monitoring-only size/slot-count controls above.
  const usesSlotSelection = !!def?.meta.usesSlotSelection;
  const slotLayoutOptions = isMonitoringWidget ? slotLayoutOptionsForSize(widget.size) : [];
  const slotLayout = isMonitoringWidget ? resolvedSlotLayout(widget.size, widget.config) : undefined;
  const [internalSelectedSlot, setInternalSelectedSlot] = useState(0);
  const slotControlled = externalSelectedSlot !== undefined;
  const selectedMonitoringSlot = slotControlled ? externalSelectedSlot : internalSelectedSlot;
  // Latest-value ref for the controlled-path updater when the setter fires
  // twice in one frame (e.g. resize + slotCount). Without it the second call
  // computes against a render-time snapshot and clobbers the first update.
  // Mirrors the functional-update guarantee of useState.
  const slotRef = useRef(selectedMonitoringSlot);
  useEffect(() => { slotRef.current = selectedMonitoringSlot; }, [selectedMonitoringSlot]);
  const setSelectedMonitoringSlot = useCallback(
    (next: number | ((prev: number) => number)) => {
      if (slotControlled) {
        const value = typeof next === 'function' ? next(slotRef.current) : next;
        slotRef.current = value;
        externalOnSelectedSlotChange?.(value);
      } else {
        setInternalSelectedSlot(prev => {
          const value = typeof next === 'function' ? next(prev) : next;
          slotRef.current = value;
          return value;
        });
      }
    },
    [slotControlled, externalOnSelectedSlotChange],
  );

  const sheetRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const onBoundsChangeRef = useRef(onBoundsChange);
  useEffect(() => { onBoundsChangeRef.current = onBoundsChange; }, [onBoundsChange]);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // Anchor key for positioning effect. Reposition when the widget moves
  // (col/row patches) or resizes (size changes).
  const anchorKey = anchorRect
    ? `${anchorRect.x}:${anchorRect.y}:${anchorRect.w}:${anchorRect.h}`
    : '';

  useLayoutEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const next = anchorRect
      ? placeNearAnchor(anchorRect, w, h, vw, vh)
      : {
          x: clamp((vw - w) / 2, SAFE, Math.max(SAFE, vw - w - SAFE)),
          y: clamp((vh - h) / 2, SAFE, Math.max(SAFE, vh - h - SAFE)),
        };
    // Measure-then-position: useLayoutEffect reads the rendered size and
    // commits clamped coordinates before paint, so no unpositioned flash.
    setPos(next);
    onBoundsChangeRef.current?.({ x: next.x, y: next.y, w, h });
    // anchorKey is the structural digest of anchorRect; depending on the
    // object reference would re-run on every parent re-render even when the
    // rect is unchanged, repositioning the sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorKey]);

  useEffect(() => () => { onBoundsChangeRef.current?.(null); }, []);

  const keepOpenOnTargetRef = useRef(keepOpenOnTarget);
  useEffect(() => { keepOpenOnTargetRef.current = keepOpenOnTarget; }, [keepOpenOnTarget]);

  // Outside-click dismiss; close only when the click lands outside.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const el = sheetRef.current;
      if (el && e.target instanceof Node && el.contains(e.target)) return;
      // The sensor Select portals its menu onto document.body (outside the
      // sheet subtree), so a click on an option would read as outside and
      // close the sheet; treat the portaled listbox as inside.
      if (e.target instanceof Element && e.target.closest('[role="listbox"]')) return;
      if (keepOpenOnTargetRef.current?.(e.target)) return;
      onCloseRef.current();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
  }, []);

  // Registers with the shared modal stack so Escape is arbitrated against
  // whatever is topmost (e.g. PanelImmersiveOverlay) instead of both firing
  // independently. aria-modal="false" above means this sheet deliberately
  // doesn't trap Tab or lock the background - it coexists with the live
  // widget tile being edited.
  useModalA11y({
    open: true,
    onClose,
    containerRef: sheetRef,
    trapFocus: false,
    lockBackground: false,
    restoreFocus: false,
  });

  const title = titleOverride ?? widget.type;

  const handleResize = useCallback((size: PanelWidgetSize) => {
    if (isMonitoringWidget) {
      const nextSlotCount = resolvedSlotLayout(size, widget.config).count;
      setSelectedMonitoringSlot(prev => Math.min(prev, nextSlotCount - 1));
    }
    onResize(widget.id, size);
  }, [isMonitoringWidget, onResize, widget.config, widget.id, setSelectedMonitoringSlot]);

  const handleSlotLayout = (layout: SlotLayout) => {
    setSelectedMonitoringSlot(prev => Math.min(prev, layout.count - 1));
    onUpdate(widget.id, { slotCount: layout.count, slotHero: layout.hero });
  };

  const sheetStyle = {
    ...themeStyle,
    left: pos?.x ?? 0,
    top: pos?.y ?? 0,
    visibility: pos ? 'visible' : 'hidden',
  } as CSSProperties;

  return (
    <div
      ref={sheetRef}
      className={`panel-root ${styles.sheet}`}
      data-theme={themeMode}
      role="dialog"
      aria-modal="false"
      style={sheetStyle}
    >
      <header className={styles.header}>
        <div className={styles.title}>{title}</div>
        <button
          type="button"
          className={styles.removeButton}
          onClick={() => onRemove(widget.id)}
          aria-label={t('panel.widget.editSheet.removeWidget')}
        >
          <Trash2 size={15} />
        </button>
        <button
          type="button"
          className={styles.iconButton}
          onClick={onClose}
          aria-label={t('app.window.close')}
        >
          <X size={17} />
        </button>
      </header>

      {(sizes.length > 1 || slotLayoutOptions.length > 1) && (
      <div className={styles.actions}>
        <div className={styles.controlPicker}>
          {sizes.length > 1 && (
            <WidgetControlGroup title={isMonitoringWidget ? t('panel.widget.editSheet.layout') : t('panel.widget.editSheet.size')}>
              {sizes.map(size => {
                const Icon = SIZE_ICONS[size];
                return (
                  <IconLabelButton
                    key={size}
                    className={styles.controlButton}
                    active={size === widget.size}
                    icon={Icon ? <Icon aria-hidden="true" /> : undefined}
                    ariaLabel={`${isMonitoringWidget ? t('panel.widget.editSheet.layout') : t('panel.widget.editSheet.size')} ${size}`}
                    title={size}
                    onPress={() => handleResize(size)}
                  />
                );
              })}
            </WidgetControlGroup>
          )}
          {isMonitoringWidget && slotLayoutOptions.length > 0 && (
            <WidgetControlGroup title={t('panel.widget.editSheet.slots')}>
              {slotLayoutOptions.map(option => {
                const slotLabel = option.hero
                  ? t(`panel.editor.${heroLabelKey(widget.size)}`)
                  : t(pluralKey('panel.editor.slotCount', language, option.count), { count: option.count });
                return (
                  <IconLabelButton
                    key={slotLayoutKey(option)}
                    className={styles.controlButton}
                    active={option.count === slotLayout?.count && option.hero === slotLayout?.hero}
                    icon={<SlotLayoutIcon layout={option} size={widget.size} aria-hidden="true" />}
                    ariaLabel={slotLabel}
                    title={slotLabel}
                    onPress={() => handleSlotLayout(option)}
                  />
                );
              })}
            </WidgetControlGroup>
          )}
        </div>
      </div>
      )}

      {Settings ? (
        <div className={styles.body}>
          <Suspense fallback={null}>
            <Settings
              widget={widget}
              surface={surface}
              onUpdate={config => onUpdate(widget.id, config)}
              onResize={handleResize}
              selectedSlot={usesSlotSelection ? selectedMonitoringSlot : undefined}
              onSelectedSlotChange={usesSlotSelection ? setSelectedMonitoringSlot : undefined}
              editView={usesSlotSelection ? editView : undefined}
              onEditViewChange={usesSlotSelection ? onEditViewChange : undefined}
            />
          </Suspense>
        </div>
      ) : (
        <div className={styles.empty}>{t('panel.widget.editSheet.noSettings')}</div>
      )}
    </div>
  );
}
