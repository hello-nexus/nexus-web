import { useCallback, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Usb } from 'lucide-react';
import { HoverTooltip } from '../../../components/common/HoverTooltip/HoverTooltip';
import { useUnifiedDevices, type UnifiedDevice } from '../../../hooks/useUnifiedDevices';
import { useTranslation } from '../../../lib/i18n';
import type { WidgetProps } from '../types';
import styles from './DevicesWidget.module.scss';

// Per-page slot counts. Each "2x2 area" of the widget holds two
// stacked wide-rectangle device tiles, so a 2x2 widget shows 2, a
// 4x2 (two 2x2s side by side) shows 4, a 4x4 (four 2x2s) shows 8.
// Tile aspect stays the same across sizes (≈2:1, wide rectangle)
// so the visual rhythm is consistent.
const SLOTS_PER_PAGE: Record<string, number> = {
  '2x2': 2,   // 1 col × 2 rows
  '4x2': 4,   // 2 cols × 2 rows
  '4x4': 8,   // 2 cols × 4 rows
};

export function DevicesWidget({ widget, surface, onSectionNavigate }: WidgetProps) {
  const { t } = useTranslation();
  // Subscribe on every surface so the thumbnails stay accurate even on
  // Y70/phone layouts where the widget renders read-only. Multiplex topics
  // dedupe subscribers at the socket layer so multiple widget instances on
  // the same layout do not multiply network cost.
  const { unified } = useUnifiedDevices(true);
  const slotsPerPage = SLOTS_PER_PAGE[widget.size] ?? 1;
  const [pageIndex, setPageIndex] = useState(0);

  const totalPages = Math.max(1, Math.ceil(unified.length / slotsPerPage));
  // Clamp the current page after the device list shrinks (e.g. a USB
  // device disconnects). Mirrors the lighting widget pattern of letting
  // the visible slice follow the data rather than freezing on a stale
  // page index.
  const clampedPageIndex = Math.min(pageIndex, totalPages - 1);

  const visible = useMemo(() => {
    const start = clampedPageIndex * slotsPerPage;
    return unified.slice(start, start + slotsPerPage);
  }, [unified, clampedPageIndex, slotsPerPage]);

  // Pad the visible slice so the grid keeps its 1x2 / 2x2 shape even
  // when the last page has empty slots — without this the last device on
  // a 4x4 widget with 3 devices would stretch across the row.
  const slots: Array<UnifiedDevice | null> = useMemo(() => {
    const out: Array<UnifiedDevice | null> = visible.slice();
    while (out.length < slotsPerPage) out.push(null);
    return out;
  }, [visible, slotsPerPage]);

  const showArrows = unified.length > slotsPerPage;

  const cyclePage = useCallback((delta: number) => {
    setPageIndex(prev => {
      const base = Math.min(prev, totalPages - 1);
      return (base + delta + totalPages) % totalPages;
    });
  }, [totalPages]);

  const openDevice = useCallback((device: UnifiedDevice) => {
    if (!onSectionNavigate) return;
    onSectionNavigate('devices', { deviceKey: device.key });
  }, [onSectionNavigate]);

  // On the desktop dashboard surface the widget is clickthrough at the
  // cell level (navigates to /devices). Thumbnails inside MUST be real
  // <button>s so usePanelTouchMode's pressOnInteractive detection
  // suppresses the cell-level fallback — that's what lets each
  // thumbnail's own onClick fire with a specific deviceKey instead.
  const isDesktopDashboard = surface === 'desktop' && Boolean(onSectionNavigate);

  if (unified.length === 0) {
    return (
      <div className={styles.devicesWidget} data-size={widget.size}>
        <div className={styles.empty}>
          <Usb className={styles.emptyIcon} aria-hidden="true" />
          <span className={styles.emptyLabel}>{t('panel.widget.devices.empty')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.devicesWidget} data-size={widget.size}>
      <div className={styles.thumbBox} data-slots={slotsPerPage}>
        <div className={styles.tileGrid} data-cols={widget.size === '2x2' ? 1 : 2}>
          {slots.map((d, idx) => (
            d
              ? (
                isDesktopDashboard
                  ? (
                    <HoverTooltip key={d.key} body={d.name} side="top">
                      <button
                        type="button"
                        className={styles.tile}
                        data-connected={d.connected ? 'true' : 'false'}
                        onClick={() => openDevice(d)}
                        aria-label={d.name}
                      >
                        <DeviceThumb device={d} />
                      </button>
                    </HoverTooltip>
                  )
                  : (
                    <div
                      key={d.key}
                      className={styles.tile}
                      data-connected={d.connected ? 'true' : 'false'}
                      role="img"
                      aria-label={d.name}
                    >
                      <DeviceThumb device={d} />
                    </div>
                  )
              )
              : <span key={`empty-${idx}`} className={styles.tilePlaceholder} aria-hidden="true" />
          ))}
        </div>
        {showArrows && (
          <>
            <button
              type="button"
              className={styles.arrowBtn}
              data-side="prev"
              onClick={() => cyclePage(-1)}
              aria-label={t('lighting.panel.prev')}
            >
              <ChevronLeft />
            </button>
            <button
              type="button"
              className={styles.arrowBtn}
              data-side="next"
              onClick={() => cyclePage(1)}
              aria-label={t('lighting.panel.next')}
            >
              <ChevronRight />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function DeviceThumb({ device }: { device: UnifiedDevice }) {
  return (
    <>
      <span
        className={styles.tileIcon}
        role="img"
        aria-hidden="true"
        style={{ ['--icon-url' as string]: `url(${device.iconSrc})` }}
      />
      <span className={styles.tileLabel}>{device.shortName}</span>
    </>
  );
}

export default DevicesWidget;
