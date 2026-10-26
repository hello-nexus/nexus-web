import { useEffect, useMemo, useRef, useState } from 'react';
import { ScanEye } from 'lucide-react';
import type { ConnectionState } from '../../../hooks/useServiceStatus';
import { useDisplayTopology } from '../../../hooks/useDisplayTopology';
import { demoteDisplayPanel, identifyDisplays, promoteDisplayToPanel, setDisplayDdc, type TopologyDisplay } from '../../../api/displays';
import { useTranslation } from '../../../lib/i18n';
import { Button } from '../../../components/common/Button/Button';
import { Notice } from '../../../components/common/Notice/Notice';
import { Toggle } from '../../../components/common/Toggle/Toggle';
import { ServiceRequired } from '../ServiceRequired';
import { DisplayDetailHeader } from './DisplayDetailHeader';
import { MonitorMap } from './MonitorMap';
import { identifyPayload, IDENTIFY_SHOWN_MS } from './identifyPayload';
import styles from './DisplaysView.module.scss';

interface DisplaysViewProps {
  serviceOnline: boolean;
  connectionState?: ConnectionState;
  // Cross-link into a panel's editor page; Dashboard wires this to
  // navigate('system', 'device', key) - the same flow as device cards.
  onDeviceSelect: (deviceKey: string) => void;
}

/**
 * Display-settings-style monitor topology with the monitor → Nexus
 * panel transform. Promote/demote mutate via REST and settle on a refetch;
 * other windows stay in sync through the `displays` topic.
 */
export function DisplaysView({ serviceOnline, connectionState, onDeviceSelect }: DisplaysViewProps) {
  const { t } = useTranslation();
  const { topology, loading, refresh } = useDisplayTopology(serviceOnline);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [ddcPendingId, setDdcPendingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [identifying, setIdentifying] = useState(false);
  const identifyTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(identifyTimer.current), []);

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

  // An older service answers 404; that is ignored rather than surfaced.
  const identify = async () => {
    setIdentifying(true);
    window.clearTimeout(identifyTimer.current);
    identifyTimer.current = window.setTimeout(() => setIdentifying(false), IDENTIFY_SHOWN_MS);
    await identifyDisplays(identifyPayload(displays));
  };

  // No header of its own: this view renders as the Displays tab inside the
  // Devices page, which owns the ViewHeader + tab strip.
  if (!serviceOnline) {
    return (
      <section className={styles.view}>
        <ServiceRequired page="nexus" state={connectionState} />
      </section>
    );
  }

  const toggleDdc = async (display: TopologyDisplay, next: boolean) => {
    setError('');
    setDdcPendingId(display.id);
    const result = await setDisplayDdc(display.id, next);
    setDdcPendingId(null);
    if (!result) {
      setError(t('displays.ddc.error'));
      return;
    }
    await refresh();
  };

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
      <Notice tone="info">{t('displays.intro')}</Notice>
      {displays.length === 0 ? (
        <div className={styles.empty}>{loading ? '' : t('displays.empty')}</div>
      ) : (
        <>
          <div className={styles.mapCard}>
            <MonitorMap displays={displays} selectedId={selectedId} onSelect={setSelectedId} />
            <div className={styles.mapActions}>
              {selected && !selected.isY70 && (
                <label className={styles.panelToggle}>
                  <span>{t('displays.panel.active')}</span>
                  <Toggle
                    checked={selected.assignedPanelDeviceId !== null}
                    disabled={pendingId === selected.id || (selected.assignedPanelDeviceId === null && (!topology?.hostingSupported || !selected.hostingSupported))}
                    ariaLabel={t('displays.panel.active')}
                    onChange={next => void (next ? promote(selected) : demote(selected))}
                  />
                </label>
              )}
              <Button type="button" tone="neutral" size="sm" icon={<ScanEye size={14} />} disabled={identifying} onClick={() => void identify()}>
                {t('displays.identify')}
              </Button>
            </div>
          </div>

          {selected && (
            <div className={styles.detail} data-testid="display-detail">
              <DisplayDetailHeader display={selected} onDeviceSelect={onDeviceSelect} />

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
                {selected.isInternal && (
                  <span className={styles.chip}>{t('displays.internal')}</span>
                )}
                {selected.isTouch && (
                  <span className={styles.chip}>{t('displays.touch')}</span>
                )}
              </div>

              {/* Not offered for the Y70: its brightness rides a dedicated
                  transport in the service that does not go through the
                  DDC opt-out, so the switch would promise something it
                  cannot deliver. That panel is driven from its own page. */}
              {!selected.isY70 && (
              <div className={styles.ddcRow}>
                <div className={styles.ddcText}>
                  <span className={styles.ddcLabel}>{t('displays.ddc.label')}</span>
                  <span className={styles.hint}>{t('displays.ddc.hint')}</span>
                </div>
                <Toggle
                  checked={selected.ddcEnabled}
                  disabled={ddcPendingId === selected.id}
                  ariaLabel={t('displays.ddc.label')}
                  onChange={next => void toggleDdc(selected, next)}
                />
              </div>
              )}

              {!selected.isY70 && !selected.assignedPanelDeviceId && (!topology?.hostingSupported || !selected.hostingSupported) && (
                <span className={styles.hint}>{t('displays.panel.unsupportedHint')}</span>
              )}

              {error && <div className={styles.error}>{error}</div>}
              {topology?.hint ? <div className={styles.hint}>{topology.hint}</div> : null}
            </div>
          )}
        </>
      )}
    </section>
  );
}
