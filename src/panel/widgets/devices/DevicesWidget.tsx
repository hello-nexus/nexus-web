import { useCallback, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Usb } from 'lucide-react';
import { HoverTooltip } from '../../../components/common/HoverTooltip/HoverTooltip';
import { useUnifiedDevices, type UnifiedDevice } from '../../../hooks/useUnifiedDevices';
import { useTranslation } from '../../../lib/i18n';
import type { WidgetProps } from '../types';
import styles from './DevicesWidget.module.scss';

// Number of device thumbnails the widget renders per page at each
// supported size. The thumbnail layout is square (2x2 = 1 tile, 4x2 =
// 1x2 tiles, 4x4 = 2x2 tiles) so devices line up cleanly with the
// widget's own footprint.
const SLOTS_PER_PAGE: Record<string, number> = {
  '2x2': 1,
  '4x2': 2,
  '4x4': 4,
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
        <div className={styles.tileGrid} data-cols={slotsPerPage === 4 ? 2 : slotsPerPage}>
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
