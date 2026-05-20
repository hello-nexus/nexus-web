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
import { lookupWidget, sizesForSurface } from '../registry';
import { SIZE_ICONS } from './SizeIcons';
import { WidgetControlGroup } from './WidgetControlGroup';
import { IconLabelButton } from '../../../components/common/IconLabelButton/IconLabelButton';
import {
  slotCountOptionsForSize,
  resolvedSlotCountForSize,
} from '../performance/perfSlots';
import { SlotCountIcon } from '../performance/SlotCountIcons';
import type {
  PanelConfigValue,
  PanelSurface,
  PanelWidget,
  PanelWidgetSize,
} from '../../types';
import styles from './WidgetEditSheet.module.scss';

interface AnchorRect { x: number; y: number; w: number; h: number }

interface WidgetEditSheetProps {
  widget: PanelWidget;
  surface: PanelSurface;
  themeMode?: 'dark' | 'light';
  themeStyle?: CSSProperties;
  title?: string;
  // The widget tile's on-screen rect (CSS pixels). The sheet positions
  // itself adjacent to this rect (right/left/below/above) without
  // clipping the viewport. Optional - when omitted, the sheet falls back
  // to the viewport center.
  anchorRect?: AnchorRect;
  onResize: (widgetId: string, size: PanelWidgetSize) => void;
  onUpdate: (widgetId: string, config: Record<string, PanelConfigValue>) => void;
  onRemove: (widgetId: string) => void;
  onClose: () => void;
  // Reports the sheet's rendered viewport rect, then `null` on unmount.
  // The desktop overlay uses this to drive its host-side hit-test region
  // so only the sheet receives clicks - the rest of the screen stays
  // fully see-through and click-through.
  onBoundsChange?: (rect: AnchorRect | null) => void;
  // Externally-controlled selected slot for monitoring widgets. When
  // provided, the sheet wires the value into the Settings component AND
  // routes user changes back through onSelectedSlotChange so the parent
  // can also pass the same value to the live widget tile - which is what
  // surfaces the dotted-border slot picker on the widget itself. When
  // omitted, the sheet manages slot selection internally (legacy path
  // used by surfaces that don't render the live widget independently).
  selectedSlot?: number;
  onSelectedSlotChange?: (slot: number) => void;
  // Lets the parent extend the click-outside dismissal so clicks on
  // related external surfaces (e.g. the live widget tile being edited
  // on the desktop overlay) don't close the sheet. Clicks elsewhere
  // still dismiss as usual.
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
  keepOpenOnTarget,
}: WidgetEditSheetProps) {
  const def = lookupWidget(widget.type);
  const Settings = def?.SettingsComponent;
  const sizes = def ? sizesForSurface(def.meta, surface) : [];
  const isMonitoringWidget = widget.type === 'monitoring';
  const slotCountOptions = isMonitoringWidget ? slotCountOptionsForSize(widget.size) : [];
  const slotCount = isMonitoringWidget
    ? resolvedSlotCountForSize(widget.size, widget.config?.slotCount as number | undefined)
    : 0;
  const [internalSelectedSlot, setInternalSelectedSlot] = useState(0);
  const slotControlled = externalSelectedSlot !== undefined;
  const selectedMonitoringSlot = slotControlled ? externalSelectedSlot : internalSelectedSlot;
  // A latest-value ref keeps the controlled-path updater honest when the
  // setter is invoked twice in the same frame (e.g. resize + slotCount in
  // quick succession). Without it, the second call would compute against
  // a render-time snapshot of `selectedMonitoringSlot` and clobber the
  // first update. Mirrors the functional-update guarantee of useState.
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
    setPos(next);
    onBoundsChangeRef.current?.({ x: next.x, y: next.y, w, h });
  }, [anchorKey]);

  useEffect(() => () => { onBoundsChangeRef.current?.(null); }, []);

  const keepOpenOnTargetRef = useRef(keepOpenOnTarget);
  useEffect(() => { keepOpenOnTargetRef.current = keepOpenOnTarget; }, [keepOpenOnTarget]);

  // Outside-click and Escape dismiss. Sheet content is allowed to receive
  // clicks normally - we only close when the click lands outside.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const el = sheetRef.current;
      if (el && e.target instanceof Node && el.contains(e.target)) return;
      if (keepOpenOnTargetRef.current?.(e.target)) return;
      onCloseRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
      }
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const title = titleOverride ?? widget.type;

  const handleResize = useCallback((size: PanelWidgetSize) => {
    if (isMonitoringWidget) {
      const nextSlotCount = resolvedSlotCountForSize(size, widget.config?.slotCount as number | undefined);
      setSelectedMonitoringSlot(prev => Math.min(prev, nextSlotCount - 1));
    }
    onResize(widget.id, size);
  }, [isMonitoringWidget, onResize, widget.config, widget.id, setSelectedMonitoringSlot]);

  const handleSlotCount = (n: number) => {
    setSelectedMonitoringSlot(prev => Math.min(prev, n - 1));
    onUpdate(widget.id, { slotCount: n });
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
          className={styles.iconButton}
          onClick={onClose}
          aria-label="Close"
        >
          <X size={17} />
        </button>
      </header>

      {/* The actions row always renders so the user can delete the widget;
          the size + slot pickers inside only render when there's more than
          one option to choose from. Hiding the entire row when sizes.length
          == 1 used to swallow the delete button (e.g. for a 1x1 macros
          widget). */}
      <div className={styles.actions}>
        <div className={styles.controlPicker}>
          {sizes.length > 1 && (
            <WidgetControlGroup title={isMonitoringWidget ? 'Layout' : 'Size'}>
              {sizes.map(size => {
                const Icon = SIZE_ICONS[size];
                return (
                  <IconLabelButton
                    key={size}
                    className={styles.controlButton}
                    active={size === widget.size}
                    icon={Icon ? <Icon aria-hidden="true" /> : undefined}
                    ariaLabel={`${isMonitoringWidget ? 'Layout' : 'Size'} ${size}`}
                    title={size}
                    onPress={() => handleResize(size)}
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
                  className={styles.controlButton}
                  active={n === slotCount}
                  icon={<SlotCountIcon count={n} size={widget.size} aria-hidden="true" />}
                  ariaLabel={`${n} ${n === 1 ? 'slot' : 'slots'}`}
                  title={`${n} ${n === 1 ? 'slot' : 'slots'}`}
                  onPress={() => handleSlotCount(n)}
                />
              ))}
            </WidgetControlGroup>
          )}
        </div>
        <button
          type="button"
          className={styles.removeButton}
          onClick={() => onRemove(widget.id)}
          aria-label="Remove widget"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {Settings ? (
        <div className={styles.body}>
          <Suspense fallback={null}>
            <Settings
              widget={widget}
              onUpdate={config => onUpdate(widget.id, config)}
              onResize={handleResize}
              selectedSlot={isMonitoringWidget ? selectedMonitoringSlot : undefined}
              onSelectedSlotChange={isMonitoringWidget ? setSelectedMonitoringSlot : undefined}
            />
          </Suspense>
        </div>
      ) : (
        <div className={styles.empty}>No settings</div>
      )}
    </div>
  );
}
