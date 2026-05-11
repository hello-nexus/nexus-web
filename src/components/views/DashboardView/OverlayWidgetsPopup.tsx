import { useCallback, useEffect, useMemo, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { Overlay } from '../../Overlay/Overlay';
import { Toggle } from '../../Toggle/Toggle';
import { Slider } from '../../Slider/Slider';
import { Select } from '../../Select/Select';
import { fetchService, postService } from '../../../api/service';
import { listOverlayWidgets, deleteOverlayWidget, type OverlayWidgetDto } from '../../../api/overlay';
import { WIDGET_REGISTRY } from '../../../panel/widgets/registry';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import { useTranslation } from '../../../lib/i18n';
import styles from './DesktopWidgetsPopup.module.scss';

interface ServerPrefs {
  overlayWidgetsEnabled?: boolean;
  overlayWidgetScale?: number;
  overlayWidgetOpacity?: number;
  overlayWidgetsMonitor?: number;
}

interface OverlayWidgetsPopupProps {
  open: boolean;
  onClose: () => void;
}

const SCALE_MIN = 50;
const SCALE_MAX = 200;
const SCALE_DEFAULT = 100;
const OPACITY_MIN = 0;
const OPACITY_MAX = 100;
const OPACITY_DEFAULT = 100;

/**
 * Desktop Widgets management surface. Reachable from the dashboard header
 * button next to "Add Widget". Lets the user enable/disable the floating
 * overlay, scale the grid + widget content, and inspect / unpin widgets
 * one at a time.
 */
export function OverlayWidgetsPopup({ open, onClose }: OverlayWidgetsPopupProps) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(false);
  const [scale, setScale] = useState(SCALE_DEFAULT);
  const [opacity, setOpacity] = useState(OPACITY_DEFAULT);
  // 0-based monitor index. Legacy installs may persist -1 (the old
  // "primary fallback" sentinel); we display that as monitor 0 in the
  // dropdown and the next user pick writes a real index.
  const [monitor, setMonitor] = useState<number>(0);
  const [widgets, setWidgets] = useState<OverlayWidgetDto[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const [list, prefs] = await Promise.all([
      listOverlayWidgets(),
      fetchService<ServerPrefs>('/preferences'),
    ]);
    setWidgets(list);
    setEnabled(Boolean(prefs?.overlayWidgetsEnabled));
    setScale(prefs?.overlayWidgetScale ?? SCALE_DEFAULT);
    setOpacity(typeof prefs?.overlayWidgetOpacity === 'number'
      ? Math.round(prefs.overlayWidgetOpacity * 100)
      : OPACITY_DEFAULT);
    // Legacy -1 (primary fallback sentinel) collapses to 0 for display
    // purposes - the user can pick any monitor in the dropdown and the
    // next POST writes a real index.
    const persisted = typeof prefs?.overlayWidgetsMonitor === 'number'
      ? prefs.overlayWidgetsMonitor : 0;
    setMonitor(persisted < 0 ? 0 : persisted);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  // Keep in sync with mutations from anywhere else (overlay's right-click
  // menu, dashboard pin, etc).
  useTopicCallback('prefs', open, () => { void refresh(); });

  const handleToggleEnabled = useCallback(async (next: boolean) => {
    setEnabled(next);
    await postService('/preferences', { overlayWidgetsEnabled: next });
  }, []);

  const handleScaleCommit = useCallback(async (next: number) => {
    const clamped = Math.round(Math.max(SCALE_MIN, Math.min(SCALE_MAX, next)));
    setScale(clamped);
    await postService('/preferences', { overlayWidgetScale: clamped });
  }, []);

  const handleOpacityCommit = useCallback(async (next: number) => {
    const clampedPct = Math.round(Math.max(OPACITY_MIN, Math.min(OPACITY_MAX, next)));
    setOpacity(clampedPct);
    await postService('/preferences', { overlayWidgetOpacity: clampedPct / 100 });
  }, []);

  const handleMonitorChange = useCallback(async (value: string) => {
    const next = Number(value);
    setMonitor(next);
    await postService('/preferences', { overlayWidgetsMonitor: next });
  }, []);

  // Dropdown options: numbered monitors only, no "Primary" entry. We
  // always offer at least 2 monitors so single-display users can still
  // see the control is a list; widgets already referencing a higher
  // index expand the list, and the current selection is always present
  // (covers a user who picked a now-disconnected monitor).
  const monitorOptions = useMemo(() => {
    const referenced = widgets.length > 0 ? Math.max(...widgets.map(w => w.monitor)) : -1;
    const upper = Math.max(1, referenced, monitor);
    const slots: { value: string; label: string }[] = [];
    for (let i = 0; i <= upper; i++) slots.push({ value: String(i), label: `Monitor ${i + 1}` });
    return slots;
  }, [widgets, monitor]);

  const handleUnpin = useCallback(async (id: string) => {
    setWidgets(prev => prev.filter(w => w.id !== id));
    await deleteOverlayWidget(id);
  }, []);

  const handleUnpinAll = useCallback(async () => {
    const all = [...widgets];
    setWidgets([]);
    for (const w of all) {
      await deleteOverlayWidget(w.id);
    }
  }, [widgets]);

  const widgetRows = useMemo(() => widgets.map(entry => {
    const def = WIDGET_REGISTRY[entry.type];
    const Icon = def?.meta.icon;
    const i18nKey = def?.meta.i18nKey;
    const label = i18nKey ? t(i18nKey) : entry.type;
    return { id: entry.id, label, Icon, monitor: entry.monitor, size: entry.size };
  }), [widgets, t]);

  return (
    <Overlay open={open} onClose={onClose} ariaLabel="Desktop widgets" className={styles.surface}>
      <header className={styles.header}>
        <h2 className={styles.title}>Desktop widgets</h2>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      {!loaded ? (
        <div className={styles.loading}>Loading…</div>
      ) : (
        <div className={styles.body}>
          <section className={styles.section}>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Enable</span>
              <Toggle
                checked={enabled}
                onChange={handleToggleEnabled}
                disabled={widgets.length === 0}
                ariaLabel="Enable desktop widgets"
              />
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Monitor</span>
              <Select
                value={String(monitor)}
                onChange={(v) => { void handleMonitorChange(v); }}
                options={monitorOptions}
                ariaLabel="Desktop widget monitor"
              />
            </div>
            <Slider
              label="Scale"
              value={scale}
              min={SCALE_MIN}
              max={SCALE_MAX}
              step={5}
              orientation="inline"
              formatValue={(v) => `${v}%`}
              onChange={(v) => setScale(v)}
              onCommit={(v) => { void handleScaleCommit(v); }}
              ariaLabel="Desktop widget scale"
              trackFill
            />
            <Slider
              label="Opacity"
              value={opacity}
              min={OPACITY_MIN}
              max={OPACITY_MAX}
              step={5}
              orientation="inline"
              formatValue={(v) => `${v}%`}
              onChange={(v) => setOpacity(v)}
              onCommit={(v) => { void handleOpacityCommit(v); }}
              ariaLabel="Desktop widget opacity"
              trackFill
            />
          </section>

          <section className={styles.section}>
            <div className={styles.listHeader}>
              <span>
                {widgets.length === 1 ? '1 widget pinned' : `${widgets.length} widgets pinned`}
              </span>
              {widgets.length > 0 && (
                <button type="button" className={styles.linkBtn} onClick={handleUnpinAll}>
                  Unpin all
                </button>
              )}
            </div>
            {widgets.length === 0 ? (
              <div className={styles.empty}>
                Right-click any widget on the dashboard, then choose <em>Add to desktop</em>.
              </div>
            ) : (
              <ul className={styles.list}>
                {widgetRows.map(({ id, label, Icon, monitor, size }) => (
                  <li key={id} className={styles.item}>
                    {Icon ? <Icon size={14} aria-hidden="true" /> : <span className={styles.itemDot} />}
                    <span className={styles.itemLabel}>{label}</span>
                    <span className={styles.itemMeta}>
                      {size}{monitor > 0 ? ` · monitor ${monitor + 1}` : ''}
                    </span>
                    <button
                      type="button"
                      className={styles.iconBtn}
                      onClick={() => { void handleUnpin(id); }}
                      aria-label={`Unpin ${label}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Overlay>
  );
}
