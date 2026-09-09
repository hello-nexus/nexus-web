import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, LampCeiling, Lightbulb, RefreshCw } from 'lucide-react';
import { Button } from '../../../components/common/Button/Button';
import { Card } from '../../../components/common/Card/Card';
import { CollapsibleSection } from '../../../components/common/CollapsibleSection/CollapsibleSection';
import { EmptyState } from '../../../components/common/EmptyState/EmptyState';
import { HoverTooltip } from '../../../components/common/HoverTooltip/HoverTooltip';
import { SectionHeader } from '../../../components/common/SectionHeader/SectionHeader';
import { Select } from '../../../components/common/Select/Select';
import { Toggle } from '../../../components/common/Toggle/Toggle';
import { ViewHeader } from '../../../components/common/ViewHeader/ViewHeader';
import { useTranslation } from '../../../lib/i18n';
import { SMART_LIGHT_GUIDE_URLS } from '../../../lib/externalLinks';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import {
  fetchSmartLights,
  pairSmartLight,
  scanSmartLights,
  setBrandEnabled,
  setSmartLightEnabled,
  type DiscoveredSmartLight,
  type SmartLight,
} from '../../../api/smartLights';
import type { DashboardSectionNavigate } from '../../engine/panelLayoutHelpers';
import styles from './SmartLightsPage.module.scss';

// Standalone Page props: rendered by the dashboard (not the panel grid), so it
// takes only the deep-link navigator. The Touch facet forwards its WidgetProps
// onSectionNavigate (undefined off-desktop), which matches this shape.
interface SmartLightsPageProps {
  onSectionNavigate?: DashboardSectionNavigate;
}

// Brands with a shipped backend driver, each scannable from its own tile.
// Every other brand stays hidden until it's planned/shipped.
const ACTIVE_BRANDS: ReadonlyArray<readonly [brand: string, labelKey: string]> = [
  ['hue', 'smartLights.brandHue'],
  ['govee', 'smartLights.brandGovee'],
];

// Pair errors that mean "the user must do something on the device/app, then
// retry": Hue's bridge button, Govee's LAN Control app toggle. Anything else
// renders as a failure.
const ACTION_NEEDED_COPY: Record<string, string> = {
  'link-button': 'smartLights.pressBridgeButton',
  'lan-control': 'smartLights.enableLanControl',
};

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
  | { kind: 'action-needed'; copyKey: string; brand: string; host: string; stableKey: string; name: string }
  | { kind: 'added'; count: number }
  | { kind: 'error'; message: string };

// Shared smart-lights state + actions. Consumed by both the desktop Page and
// the immersive Touch facet so the two views stay in sync (and both resync on
// the 'lighting' multiplex topic). Color / brightness / power for paired lights
// live on the Lighting page; this controller only adds and removes them.
export interface SmartLightsController {
  paired: SmartLight[];
  brandEnabled: Record<string, boolean>;
  discovered: DiscoveredSmartLight[];
  // Which brand's scan/pair feedback (discovered list, errors, action notices)
  // is currently shown - it renders inside that brand's card.
  resultBrand: string | null;
  scanningBrand: string | null;
  scanError: string | null;
  pairState: PairState;
  ipBrand: string;
  ipHost: string;
  // Paired lights grouped by brand for the collapsible category sections.
  grouped: Map<string, SmartLight[]>;
  setIpBrand: (brand: string) => void;
  setIpHost: (host: string) => void;
  handleScan: (brand: string) => void;
  handleBrandToggle: (brand: string, enabled: boolean) => void;
  doPair: (brand: string, host: string, stableKey: string, name: string) => void;
  handleAddByIp: () => void;
  handleToggleEnabled: (id: string, enabled: boolean) => void;
}

export function useSmartLights(): SmartLightsController {
  const { t } = useTranslation();
  const [paired, setPaired] = useState<SmartLight[]>([]);
  const [brandEnabled, setBrandEnabledState] = useState<Record<string, boolean>>({});
  const [discovered, setDiscovered] = useState<DiscoveredSmartLight[]>([]);
  const [resultBrand, setResultBrand] = useState<string | null>(null);
  const [scanningBrand, setScanningBrand] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [pairState, setPairState] = useState<PairState>({ kind: 'idle' });
  // Manual add-by-IP fallback: multicast discovery is unreliable for Govee over
  // WiFi, so the user can pair a known IP directly. Defaults to Govee.
  const [ipBrand, setIpBrand] = useState<string>('govee');
  const [ipHost, setIpHost] = useState<string>('');

  const refreshPaired = useCallback(async () => {
    const res = await fetchSmartLights();
    if (res?.devices) setPaired(res.devices);
    if (res?.brandEnabled) setBrandEnabledState(res.brandEnabled);
  }, []);

  useEffect(() => {
    void refreshPaired();
  }, [refreshPaired]);

  // Live-update on smart-light changes (pair/remove/enable, incl. from the
  // Lighting page or another client); those routes broadcast the 'lighting' topic.
  useTopicCallback('lighting', true, () => { void refreshPaired(); });

  const handleScan = useCallback(async (brand: string) => {
    setScanningBrand(brand);
    setResultBrand(brand);
    setScanError(null);
    setPairState({ kind: 'idle' });
    setDiscovered([]); // the previous brand's rows must not stay pairable mid-scan
    // Scan reconciles the brand's list (prunes lights no longer present) and
    // returns discovery candidates; the prune broadcasts 'lighting' -> refreshPaired.
    const res = await scanSmartLights(brand);
    setScanningBrand(null);
    if (!res || !res.ok) {
      setScanError(res?.error || t('smartLights.scanFailed'));
      setDiscovered([]);
      return;
    }
    setDiscovered(res.devices ?? []);
  }, [t]);

  const handleBrandToggle = useCallback(async (brand: string, enabled: boolean) => {
    setBrandEnabledState(prev => ({ ...prev, [brand]: enabled })); // optimistic
    await setBrandEnabled(brand, enabled);
    if (enabled) void handleScan(brand); // turning a brand on auto-scans
  }, [handleScan]);

  const doPair = useCallback(async (brand: string, host: string, stableKey: string, name: string) => {
    setPairState({ kind: 'pairing', host });
    const res = await pairSmartLight(brand, host, stableKey, name);
    if (res?.ok) {
      setPairState({ kind: 'added', count: res.added ?? 0 });
      setDiscovered([]); // the candidate is paired now - drop the pairing block
      await refreshPaired();
      return;
    }
    const copyKey = res?.error && Object.hasOwn(ACTION_NEEDED_COPY, res.error)
      ? ACTION_NEEDED_COPY[res.error]
      : undefined;
    if (copyKey) {
      setPairState({ kind: 'action-needed', copyKey, brand, host, stableKey, name });
      return;
    }
    setPairState({ kind: 'error', message: res?.error || t('smartLights.pairFailed') });
  }, [refreshPaired, t]);

  const handleAddByIp = useCallback(() => {
    const host = ipHost.trim();
    if (!host) return;
    // Route this pair's feedback into the chosen brand's card.
    setResultBrand(ipBrand);
    setScanError(null);
    setDiscovered([]);
    // Empty stableKey + name: the service resolves them (Govee probes the IP).
    void doPair(ipBrand, host, '', '');
  }, [doPair, ipBrand, ipHost]);

  const handleToggleEnabled = useCallback(async (id: string, enabled: boolean) => {
    setPaired(prev => prev.map(d => (d.id === id ? { ...d, enabled } : d))); // optimistic
    const res = await setSmartLightEnabled(id, enabled);
    if (!res || res.error) await refreshPaired(); // revert unless the call clearly succeeded
  }, [refreshPaired]);

  const grouped = new Map<string, SmartLight[]>();
  for (const d of paired) {
    const arr = grouped.get(d.brand);
    if (arr) arr.push(d);
    else grouped.set(d.brand, [d]);
  }

  return {
    paired,
    brandEnabled,
    discovered,
    resultBrand,
    scanningBrand,
    scanError,
    pairState,
    ipBrand,
    ipHost,
    grouped,
    setIpBrand,
    setIpHost,
    handleScan: (brand) => { void handleScan(brand); },
    handleBrandToggle: (brand, enabled) => { void handleBrandToggle(brand, enabled); },
    doPair: (brand, host, stableKey, name) => { void doPair(brand, host, stableKey, name); },
    handleAddByIp,
    handleToggleEnabled: (id, enabled) => { void handleToggleEnabled(id, enabled); },
  };
}

/**
 * Add-lights column: brand picker, per-brand discovery + pairing (Hue,
 * Govee), and the add-by-IP fallback. The lighting-page deep link only shows
 * on the desktop Page (onSectionNavigate is desktop-only).
 *
 * `immersive` fills + scrolls inside an ImmersiveLayout cell; the desktop Page
 * docks it at a fixed width beside the paired list.
 */
export function SmartLightsAddColumn({
  ctrl,
  onSectionNavigate,
  immersive,
}: {
  ctrl: SmartLightsController;
  onSectionNavigate?: DashboardSectionNavigate;
  immersive?: boolean;
}) {
  const { t } = useTranslation();
  const { brandEnabled, scanningBrand, resultBrand, discovered, scanError, pairState, ipBrand, ipHost } = ctrl;
  return (
    <div className={immersive ? `${styles.addColumn} ${styles.columnImmersive}` : styles.addColumn}>
      <SectionHeader className={styles.colHeader}>{t('smartLights.addLights')}</SectionHeader>
      <div className={styles.brandList}>
        {ACTIVE_BRANDS.map(([brand, labelKey]) => {
          const on = brandEnabled[brand] === true;
          const scanning = scanningBrand === brand;
          const mark = `url(/assets/brands/${brand}.svg)`;
          const showResults = resultBrand === brand;
          const found = showResults ? discovered.filter(d => d.brand === brand) : [];
          // Only show the results block (and its divider) when it actually
          // has content - an empty scan must not leave a bare separator.
          const hasResults = showResults && (
            !!scanError
            || (pairState.kind === 'action-needed' && pairState.brand === brand)
            || pairState.kind === 'added'
            || pairState.kind === 'error'
            || found.length > 0
          );
          return (
            <div key={brand} className={styles.brandCard} data-on={on ? 'true' : undefined}>
              <div className={styles.brandRow}>
                <span
                  className={styles.brandMark}
                  style={{ maskImage: mark, WebkitMaskImage: mark }}
                  aria-hidden="true"
                />
                <span className={styles.brandName}>{t(labelKey)}</span>
                <Toggle
                  checked={on}
                  onChange={enabled => ctrl.handleBrandToggle(brand, enabled)}
                  ariaLabel={t(labelKey)}
                />
                <HoverTooltip body={t('smartLights.scan')} side="top">
                  <Button
                    size="sm"
                    tone="ghost"
                    icon={<RefreshCw size={14} />}
                    aria-label={scanning ? t('smartLights.scanning') : t('smartLights.scan')}
                    loading={scanning}
                    disabled={!on || scanningBrand !== null}
                    onClick={() => ctrl.handleScan(brand)}
                  />
                </HoverTooltip>
              </div>

              {on && SMART_LIGHT_GUIDE_URLS[brand] && (
                <Button
                  className={styles.guideLink}
                  size="sm"
                  tone="ghost"
                  icon={<ExternalLink size={13} aria-hidden />}
                  href={SMART_LIGHT_GUIDE_URLS[brand]}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('smartLights.howToConnect')}
                </Button>
              )}

              {hasResults && (
                <div className={styles.brandResults}>
                  {scanError && <p className={styles.error}>{scanError}</p>}
                  {pairState.kind === 'action-needed' && pairState.brand === brand && (
                    <div className={styles.notice}>
                      <p className={styles.noticeText}>{t(pairState.copyKey)}</p>
                      <Button
                        size="sm"
                        tone="accent"
                        icon={<RefreshCw size={14} />}
                        onClick={() => ctrl.doPair(pairState.brand, pairState.host, pairState.stableKey, pairState.name)}
                      >
                        {t('smartLights.retry')}
                      </Button>
                    </div>
                  )}
                  {pairState.kind === 'added' && (
                    <p className={styles.success}>{t('smartLights.addedNLights', { count: pairState.count })}</p>
                  )}
                  {pairState.kind === 'error' && <p className={styles.error}>{pairState.message}</p>}
                  {found.length > 0 && (
                    <ul className={styles.discoverList}>
                      {found.map(d => {
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
                              disabled={scanningBrand !== null}
                              onClick={() => ctrl.doPair(d.brand, d.host, d.stableKey, d.name)}
                            >
                              {pairing ? t('smartLights.pairing') : d.alreadyPaired ? t('smartLights.rePair') : t('smartLights.pair')}
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <SectionHeader className={styles.colHeader}>{t('smartLights.addByIp')}</SectionHeader>
      <form className={styles.ipBox} onSubmit={e => { e.preventDefault(); ctrl.handleAddByIp(); }}>
        <Select
          value={ipBrand}
          onChange={ctrl.setIpBrand}
          options={ACTIVE_BRANDS.map(([brand, labelKey]) => ({ value: brand, label: t(labelKey) }))}
          ariaLabel={t('smartLights.addByIp')}
          className={styles.ipBrandSelect}
        />
        <div className={styles.ipRow}>
          <input
            type="text"
            className={styles.ipInput}
            value={ipHost}
            onChange={e => ctrl.setIpHost(e.target.value)}
            placeholder="192.168.1.50"
            aria-label={t('smartLights.ipAddress')}
          />
          <Button
            type="submit"
            size="sm"
            tone="accent"
            loading={pairState.kind === 'pairing'}
            disabled={!ipHost.trim() || scanningBrand !== null}
          >
            {t('smartLights.add')}
          </Button>
        </div>
      </form>

      {onSectionNavigate && (
        <Button
          className={styles.lightingLink}
          size="sm"
          tone="neutral"
          icon={<Lightbulb size={14} />}
          onClick={() => onSectionNavigate('lighting')}
        >
          {t('smartLights.colorOnLightingPage')}
        </Button>
      )}
    </div>
  );
}

/**
 * Paired-lights column: collapsible brand categories of light cards (online
 * status + enable toggle). `immersive` fills + scrolls inside an ImmersiveLayout
 * cell; the desktop Page lets it fill the space beside the add column.
 */
export function SmartLightsPairedColumn({
  ctrl,
  immersive,
}: {
  ctrl: SmartLightsController;
  immersive?: boolean;
}) {
  const { t } = useTranslation();
  const { paired, grouped } = ctrl;
  return (
    <div className={immersive ? `${styles.pairedColumn} ${styles.columnImmersive}` : styles.pairedColumn}>
      <SectionHeader className={styles.colHeader}>{t('smartLights.paired')}</SectionHeader>
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
                        onChange={on => ctrl.handleToggleEnabled(device.id, on)}
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
    </div>
  );
}

/**
 * Smart-lights management page: brand picker, per-brand discovery + pairing
 * (Hue, Govee), and the paired-device list. Color / brightness /
 * power for paired lights live on the Lighting page (the existing
 * lighting-devices routes); this page only adds and removes them.
 */
export function SmartLightsPage({ onSectionNavigate }: SmartLightsPageProps) {
  const { t } = useTranslation();
  const ctrl = useSmartLights();

  return (
    <div className={styles.page}>
      <ViewHeader title={t('smartLights.title')} />
      <div className={`${styles.body} pageBody`} data-panel-scrollable="true">
        <SmartLightsAddColumn ctrl={ctrl} onSectionNavigate={onSectionNavigate} />
        <SmartLightsPairedColumn ctrl={ctrl} />
      </div>
    </div>
  );
}

// Collapsible brand category folding the paired-light grid away.
function CollapsibleCategory({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <CollapsibleSection
      title={label}
      open={open}
      onToggle={() => setOpen(o => !o)}
      right={<span className={styles.categoryCount}>{count}</span>}
    >
      <div className={styles.pairedGrid}>{children}</div>
    </CollapsibleSection>
  );
}

export default SmartLightsPage;
