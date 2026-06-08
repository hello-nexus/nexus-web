import { useCallback, useEffect, useState } from 'react';
import { LampCeiling, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '../../../components/common/Button/Button';
import { EmptyState } from '../../../components/common/EmptyState/EmptyState';
import { ViewHeader } from '../../../components/common/ViewHeader/ViewHeader';
import { useTranslation } from '../../../lib/i18n';
import {
  discoverSmartLights,
  fetchSmartLights,
  pairSmartLight,
  removeSmartLight,
  type DiscoveredSmartLight,
  type SmartLight,
} from '../../../api/smartLights';
import type { DashboardSectionNavigate } from '../../panelLayoutHelpers';
import styles from './SmartLightsPage.module.scss';

// Standalone Page props: rendered by the dashboard (not the panel grid), so it
// takes only the deep-link navigator. The Touch facet forwards its WidgetProps
// onSectionNavigate (undefined off-desktop), which matches this shape.
interface SmartLightsPageProps {
  onSectionNavigate?: DashboardSectionNavigate;
}

// Only compatible brands are shown. Add a brand's tile here when its driver
// ships (Hue is the only one wired to the backend today).
const HUE_BRAND = 'hue';

// The Hue pair flow needs the user to press the bridge button; the backend
// reports that as this error string and we re-call pair after the press.
const LINK_BUTTON_ERROR = 'link-button';

type PairState =
  | { kind: 'idle' }
  | { kind: 'pairing'; host: string }
  | { kind: 'link-button'; brand: string; host: string; stableKey: string; name: string }
  | { kind: 'added'; count: number }
  | { kind: 'error'; message: string };

/**
 * Smart-lights management page: brand picker, Hue discovery + pairing, and the
 * paired-device list. Color / brightness / power for paired lights live on the
 * Lighting page (the existing lighting-devices routes); this page only adds and
 * removes them.
 */
export function SmartLightsPage({ onSectionNavigate }: SmartLightsPageProps) {
  const { t } = useTranslation();
  const [paired, setPaired] = useState<SmartLight[]>([]);
  const [discovered, setDiscovered] = useState<DiscoveredSmartLight[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [pairState, setPairState] = useState<PairState>({ kind: 'idle' });

  const refreshPaired = useCallback(async () => {
    const res = await fetchSmartLights();
    if (res?.devices) setPaired(res.devices);
  }, []);

  useEffect(() => {
    void refreshPaired();
  }, [refreshPaired]);

  const handleScan = useCallback(async () => {
    setScanning(true);
    setScanError(null);
    setPairState({ kind: 'idle' });
    const res = await discoverSmartLights(HUE_BRAND);
    setScanning(false);
    if (!res || !res.ok) {
      setScanError(res?.error || t('smartLights.scanFailed'));
      setDiscovered([]);
      return;
    }
    setDiscovered(res.devices ?? []);
  }, [t]);

  const doPair = useCallback(async (brand: string, host: string, stableKey: string, name: string) => {
    setPairState({ kind: 'pairing', host });
    const res = await pairSmartLight(brand, host, stableKey, name);
    if (res?.ok) {
      setPairState({ kind: 'added', count: res.added ?? 0 });
      await refreshPaired();
      return;
    }
    if (res?.error === LINK_BUTTON_ERROR) {
      setPairState({ kind: 'link-button', brand, host, stableKey, name });
      return;
    }
    setPairState({ kind: 'error', message: res?.error || t('smartLights.pairFailed') });
  }, [refreshPaired, t]);

  const handleRemove = useCallback(async (id: string) => {
    const res = await removeSmartLight(id);
    if (res && res.error) return;
    await refreshPaired();
  }, [refreshPaired]);

  return (
    <div className={styles.page}>
      <ViewHeader title={t('smartLights.title')} />
      <div className={styles.body} data-panel-scrollable="true">
        <Section title={t('smartLights.addLights')}>
          <div className={styles.brandGrid}>
            <button
              type="button"
              className={styles.brandTile}
              data-active={scanning ? 'true' : undefined}
              onClick={handleScan}
              disabled={scanning}
            >
              <LampCeiling size={22} aria-hidden="true" />
              <span className={styles.brandName}>{t('smartLights.brandHue')}</span>
              <span className={styles.brandSub}>{scanning ? t('smartLights.scanning') : t('smartLights.scan')}</span>
            </button>
          </div>

          {scanError && <p className={styles.error}>{scanError}</p>}

          {pairState.kind === 'link-button' && (
            <div className={styles.notice}>
              <p className={styles.noticeText}>{t('smartLights.pressBridgeButton')}</p>
              <Button
                size="sm"
                tone="accent"
                icon={<RefreshCw size={14} />}
                onClick={() => void doPair(pairState.brand, pairState.host, pairState.stableKey, pairState.name)}
              >
                {t('smartLights.retry')}
              </Button>
            </div>
          )}
          {pairState.kind === 'added' && (
            <p className={styles.success}>{t('smartLights.addedNLights', { count: pairState.count })}</p>
          )}
          {pairState.kind === 'error' && <p className={styles.error}>{pairState.message}</p>}

          {discovered.length > 0 && (
            <ul className={styles.discoverList}>
              {discovered.map(d => {
                const pairing = pairState.kind === 'pairing' && pairState.host === d.host;
                return (
                  <li key={d.stableKey} className={styles.discoverRow}>
                    <div className={styles.discoverInfo}>
                      <span className={styles.deviceName}>{d.name}</span>
                      <span className={styles.deviceHost}>{d.host}</span>
                    </div>
                    {d.alreadyPaired ? (
                      <span className={styles.badge}>{t('smartLights.paired')}</span>
                    ) : (
                      <Button
                        size="sm"
                        tone="accent"
                        loading={pairing}
                        onClick={() => void doPair(d.brand, d.host, d.stableKey, d.name)}
                      >
                        {pairing ? t('smartLights.pairing') : t('smartLights.pair')}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section title={t('smartLights.paired')}>
          {paired.length === 0 ? (
            <EmptyState
              icon={<LampCeiling size={28} />}
              title={t('smartLights.noLightsYet')}
              compact
            />
          ) : (
            <ul className={styles.pairedList}>
              {paired.map(device => (
                <li key={device.id} className={styles.pairedRow}>
                  <span
                    className={styles.statusDot}
                    data-online={device.online ? 'true' : 'false'}
                    aria-hidden="true"
                  />
                  <div className={styles.discoverInfo}>
                    <span className={styles.deviceName}>{device.name}</span>
                    <span className={styles.deviceHost}>
                      {device.host} · {device.online ? t('smartLights.online') : t('smartLights.offline')}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    tone="ghost"
                    icon={<Trash2 size={14} />}
                    title={t('smartLights.remove')}
                    onClick={() => void handleRemove(device.id)}
                  />
                </li>
              ))}
            </ul>
          )}
          {onSectionNavigate ? (
            <button
              type="button"
              className={styles.linkNote}
              onClick={() => onSectionNavigate('lighting')}
            >
              {t('smartLights.colorOnLightingPage')}
            </button>
          ) : (
            <p className={styles.note}>{t('smartLights.colorOnLightingPage')}</p>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {children}
    </section>
  );
}

export default SmartLightsPage;
