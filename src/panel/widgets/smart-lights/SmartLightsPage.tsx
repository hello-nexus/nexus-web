import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, LampCeiling, RefreshCw } from 'lucide-react';
import { Button } from '../../../components/common/Button/Button';
import { Card } from '../../../components/common/Card/Card';
import { EmptyState } from '../../../components/common/EmptyState/EmptyState';
import { SectionHeader } from '../../../components/common/SectionHeader/SectionHeader';
import { Toggle } from '../../../components/common/Toggle/Toggle';
import { ViewHeader } from '../../../components/common/ViewHeader/ViewHeader';
import { useTranslation } from '../../../lib/i18n';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import {
  discoverSmartLights,
  fetchSmartLights,
  pairSmartLight,
  setSmartLightEnabled,
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

// Hue is wired to the backend. Nanoleaf + Govee are the planned next brands,
// shown as disabled "coming soon" tiles; every other brand stays hidden until
// it's planned/shipped.
const HUE_BRAND = 'hue';
const COMING_SOON_BRANDS = ['Nanoleaf', 'Govee'];

// The Hue pair flow needs the user to press the bridge button; the backend
// reports that as this error string and we re-call pair after the press.
const LINK_BUTTON_ERROR = 'link-button';

// Paired lights are grouped under a collapsible category per brand. Labels are
// proper nouns (not localized).
const BRAND_CATEGORIES: ReadonlyArray<readonly [brand: string, label: string]> = [
  ['hue', 'Philips Hue'],
  ['nanoleaf', 'Nanoleaf'],
  ['wled', 'WLED'],
  ['lifx', 'LIFX'],
  ['govee', 'Govee'],
  ['twinkly', 'Twinkly'],
  ['wiz', 'WiZ'],
  ['yeelight', 'Yeelight'],
  ['elgato', 'Elgato'],
];

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

  // Live-update on smart-light changes (pair/remove/enable, incl. from the
  // Lighting page or another client) — those routes broadcast the 'lighting' topic.
  useTopicCallback('lighting', true, () => { void refreshPaired(); });

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

  const handleToggleEnabled = useCallback(async (id: string, enabled: boolean) => {
    setPaired(prev => prev.map(d => (d.id === id ? { ...d, enabled } : d))); // optimistic
    const res = await setSmartLightEnabled(id, enabled);
    if (!res || res.error) await refreshPaired(); // revert unless the call clearly succeeded
  }, [refreshPaired]);

  // Group paired lights by brand for the collapsible category sections.
  const grouped = new Map<string, SmartLight[]>();
  for (const d of paired) {
    const arr = grouped.get(d.brand);
    if (arr) arr.push(d);
    else grouped.set(d.brand, [d]);
  }

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
            {COMING_SOON_BRANDS.map(brand => (
              <div key={brand} className={styles.brandTile} data-disabled="true" aria-disabled="true">
                <LampCeiling size={22} aria-hidden="true" />
                <span className={styles.brandName}>{brand}</span>
                <span className={styles.brandSub}>{t('smartLights.comingSoon')}</span>
              </div>
            ))}
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
                    {d.alreadyPaired && <span className={styles.badge}>{t('smartLights.paired')}</span>}
                    <Button
                      size="sm"
                      tone="accent"
                      loading={pairing}
                      onClick={() => void doPair(d.brand, d.host, d.stableKey, d.name)}
                    >
                      {pairing ? t('smartLights.pairing') : d.alreadyPaired ? t('smartLights.rePair') : t('smartLights.pair')}
                    </Button>
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
            <div className={styles.categories}>
              {BRAND_CATEGORIES.filter(([brand]) => grouped.has(brand)).map(([brand, label]) => {
                const list = grouped.get(brand)!;
                return (
                  <CollapsibleCategory key={brand} label={label} count={list.length}>
                    {list.map(device => (
                      <Card
                        key={device.id}
                        title={device.name}
                        className={device.enabled ? styles.lightCard : `${styles.lightCard} ${styles.lightCardOff}`}
                      >
                        <div className={styles.cardFooter}>
                          <span className={styles.pairedStatus} data-online={device.online ? 'true' : 'false'}>
                            <span className={styles.statusDot} data-online={device.online ? 'true' : 'false'} aria-hidden="true" />
                            {device.online ? t('smartLights.online') : t('smartLights.offline')}
                          </span>
                          <Toggle
                            checked={device.enabled}
                            onChange={on => void handleToggleEnabled(device.id, on)}
                            ariaLabel={device.name}
                          />
                        </div>
                      </Card>
                    ))}
                  </CollapsibleCategory>
                );
              })}
            </div>
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
      <SectionHeader>{title}</SectionHeader>
      {children}
    </section>
  );
}

// Collapsible brand category: chevron + label + count header that folds the
// grid away. No shared Collapsible primitive exists, so this is composed from
// the standard chevron icon + the section-label typography.
function CollapsibleCategory({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className={styles.category}>
      <button type="button" className={styles.categoryHeader} aria-expanded={open} onClick={() => setOpen(o => !o)}>
        {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
        <span className={styles.categoryLabel}>{label}</span>
        <span className={styles.categoryCount}>{count}</span>
      </button>
      {open && <div className={styles.pairedGrid}>{children}</div>}
    </div>
  );
}

export default SmartLightsPage;
