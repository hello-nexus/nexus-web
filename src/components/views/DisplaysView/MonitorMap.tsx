import { useEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import { LayoutDashboard, Star } from 'lucide-react';
import type { TopologyDisplay } from '../../../api/displays';
import { useTranslation } from '../../../lib/i18n';
import { displayNumberLabel, layoutMonitorRects } from './monitorMapLayout';
import styles from './MonitorMap.module.scss';

interface MonitorMapProps {
  displays: TopologyDisplay[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/**
 * Display-settings-style monitor arrangement: one numbered,
 * selectable rectangle per monitor, positioned/scaled from the topology's
 * virtual-desktop bounds (or rowed when the platform reports none).
 */
export function MonitorMap({ displays, selectedId, onSelect }: MonitorMapProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const rects = layoutMonitorRects(displays, size.width, size.height);
  // Glyph and number scale with the rectangle's short side, within bounds, so small and huge monitors both read.
  const scaled = (rect: { width: number; height: number }, ratio: number, min: number, max: number) =>
    Math.round(Math.min(max, Math.max(min, Math.min(rect.width, rect.height) * ratio)));

  return (
    <div ref={containerRef} className={styles.map} role="listbox" aria-label={t('displays.mapAria')}>
      {rects.map((rect, i) => {
        const display = displays[i];
        const isPanel = display.isY70 || display.assignedPanelDeviceId !== null;
        return (
          <button
            key={display.id}
            type="button"
            role="option"
            aria-selected={display.id === selectedId}
            className={classNames(styles.monitor, {
              [styles.selected]: display.id === selectedId,
              [styles.panel]: isPanel,
            })}
            style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
            onClick={() => onSelect(display.id)}
          >
            <span className={styles.number} style={{ fontSize: scaled(rect, 0.3, 18, 56) }} aria-hidden>
              {displayNumberLabel(display, i)}
            </span>
            <span className={styles.badges}>
              {display.isPrimary && <Star size={scaled(rect, 0.22, 16, 40)} className={styles.primaryBadge} aria-label="primary" />}
              {isPanel && <LayoutDashboard size={scaled(rect, 0.22, 16, 40)} className={styles.panelBadge} aria-label="panel" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
