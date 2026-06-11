import { useEffect, useMemo, useState } from 'react';
import { LayoutDashboard, Star } from 'lucide-react';
import type { ConnectionState } from '../../../hooks/useServiceStatus';
import { useDisplayTopology } from '../../../hooks/useDisplayTopology';
import { demoteDisplayPanel, promoteDisplayToPanel, type TopologyDisplay } from '../../../api/displays';
import { useTranslation } from '../../../lib/i18n';
import { Button } from '../../../components/common/Button/Button';
import { ServiceRequired } from '../ServiceRequired';
import { GenericSkeleton } from '../PageSkeleton/PageSkeleton';
import { MonitorMap } from './MonitorMap';
import styles from './DisplaysView.module.scss';

interface DisplaysViewProps {
  serviceOnline: boolean;
  connectionState?: ConnectionState;
  // Cross-link into a panel's editor page; Dashboard wires this to
  // navigate('system', 'device', key) — the same flow as device cards.
  onDeviceSelect: (deviceKey: string) => void;
}

/**
 * Windows-display-settings-style monitor topology with the monitor → Nexus
 * panel transform. Promote/demote mutate via REST and settle on a refetch;
 * other windows stay in sync through the `displays` topic.
 */
export function DisplaysView({ serviceOnline, connectionState, onDeviceSelect }: DisplaysViewProps) {
  const { t } = useTranslation();
  const { topology, loading, refresh } = useDisplayTopology(serviceOnline);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const displays = useMemo(() => topology?.displays ?? [], [topology]);

  // Default selection: primary, else first. Re-resolves when the selected
  // monitor disappears (unplug).
  useEffect(() => {
    if (displays.length === 0) {
      setSelectedId(null);
      return;
    }
    if (selectedId && displays.some(d => d.id === selectedId)) return;
    setSelectedId((displays.find(d => d.isPrimary) ?? displays[0]).id);
  }, [displays, selectedId]);

  const selected = displays.find(d => d.id === selectedId) ?? null;

  // No header of its own: this view renders as the Displays tab inside the
  // Devices page, which owns the ViewHeader + tab strip.
  if (!serviceOnline) {
    return (
      <section className={styles.view}>
        <ServiceRequired state={connectionState} skeleton={<GenericSkeleton />} />
      </section>
    );
  }

  const promote = async (display: TopologyDisplay) => {
    setError('');
    setPendingId(display.id);
    try {
      const record = await promoteDisplayToPanel(display.id);
      if (!record) {
        setError(t('displays.error.promote'));
        return;
      }
      // Refetch before re-enabling the button so the detail flips against
      // fresh topology (no re-promote window, and e2e runs WS-free).
      await refresh();
    } finally {
      setPendingId(null);
    }
  };

  const demote = async (display: TopologyDisplay) => {
    setError('');
    setPendingId(display.id);
    try {
      const result = await demoteDisplayPanel(display.id);
      if (!result) {
        setError(t('displays.error.demote'));
        return;
      }
      await refresh();
    } finally {
      setPendingId(null);
    }
  };

  return (
    <section className={styles.view}>
      {displays.length === 0 ? (
        <div className={styles.empty}>{loading ? '' : t('displays.empty')}</div>
      ) : (
        <>
          <MonitorMap displays={displays} selectedId={selectedId} onSelect={setSelectedId} />

          {selected && (
            <div className={styles.detail} data-testid="display-detail">
              <div className={styles.detailHeader}>
                <span className={styles.detailName}>{selected.name}</span>
                {(selected.manufacturer || selected.model) && (
                  <span className={styles.detailSub}>
                    {[selected.manufacturer, selected.model].filter(Boolean).join(' · ')}
                  </span>
                )}
              </div>

              <dl className={styles.facts}>
                <div className={styles.factRow}>
                  <dt>{t('displays.resolution')}</dt>
                  <dd>{selected.resolution.width} × {selected.resolution.height}</dd>
                </div>
                {selected.scaleFactor !== null && (
                  <div className={styles.factRow}>
                    <dt>{t('displays.scale')}</dt>
                    <dd>{Math.round(selected.scaleFactor * 100)}%</dd>
                  </div>
                )}
              </dl>

              <div className={styles.chips}>
                {selected.isPrimary && (
                  <span className={styles.chip}><Star size={12} /> {t('displays.primary')}</span>
                )}
                {selected.isInternal && (
                  <span className={styles.chip}>{t('displays.internal')}</span>
                )}
                {selected.isTouch && (
                  <span className={styles.chip}>{t('displays.touch')}</span>
                )}
              </div>

              <div className={styles.actions}>
                {selected.isY70 ? (
                  <>
                    <span className={styles.panelBadge}>
                      <LayoutDashboard size={14} /> {t('displays.panel.activeAuto')}
                    </span>
                    <Button type="button" tone="neutral" size="sm" onClick={() => onDeviceSelect('panel-device:y70')}>
                      {t('displays.panel.open')}
                    </Button>
                  </>
                ) : selected.assignedPanelDeviceId ? (
                  <>
                    <span className={styles.panelBadge}>
                      <LayoutDashboard size={14} /> {t('displays.panel.active')}
                    </span>
                    <Button
                      type="button"
                      tone="neutral"
                      size="sm"
                      onClick={() => onDeviceSelect(`panel-display:${selected.assignedPanelDeviceId}`)}
                    >
                      {t('displays.panel.open')}
                    </Button>
                    <Button
                      type="button"
                      tone="danger"
                      size="sm"
                      disabled={pendingId === selected.id}
                      onClick={() => void demote(selected)}
                    >
                      {t('displays.panel.stop')}
                    </Button>
                  </>
                ) : displays.length <= 1 ? (
                  // A panel takes over its display fullscreen, so the only/main
                  // screen can't host one — you'd lose your desktop.
                  <span className={styles.hint}>{t('displays.panel.singleMonitorHint')}</span>
                ) : selected.isPrimary ? (
                  <span className={styles.hint}>{t('displays.panel.primaryHint')}</span>
                ) : (
                  <>
                    <Button
                      type="button"
                      tone="accent"
                      size="sm"
                      disabled={!topology?.hostingSupported || !selected.hostingSupported || pendingId === selected.id}
                      loading={pendingId === selected.id}
                      onClick={() => void promote(selected)}
                    >
                      {t('displays.panel.use')}
                    </Button>
                    {(!topology?.hostingSupported || !selected.hostingSupported) && (
                      <span className={styles.hint}>{t('displays.panel.unsupportedHint')}</span>
                    )}
                  </>
                )}
              </div>

              {error && <div className={styles.error}>{error}</div>}
              {topology?.hint ? <div className={styles.hint}>{topology.hint}</div> : null}
            </div>
          )}
        </>
      )}
    </section>
  );
}
