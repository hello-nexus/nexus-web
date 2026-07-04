import { useEffect, useMemo, useState } from 'react';
import { Unplug } from 'lucide-react';
import { useUnifiedDevices, type UnifiedDevice } from '../../../hooks/useUnifiedDevices';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { ServiceRequired } from '../ServiceRequired';
import { Placeholder } from '../Placeholder';
import { PanelDevicePage } from './PanelDevicePage';
import { PeripheralDevicePage } from './PeripheralDevicePage';
import { KeebDevicePage } from './KeebDevicePage';
import { LianLiDevicePage } from './LianLiDevicePage';
import { CorsairDevicePage } from './CorsairDevicePage';
import { Np50DevicePage } from './Np50DevicePage';
import { SmartHubDevicePage } from './SmartHubDevicePage';
import { CnvsDevicePage } from './CnvsDevicePage';
import { SdkMarketplacePage } from '../../../panel/widgets/marketplace/SdkMarketplacePage';
import { typeForMarketplace } from '../../../widgets/marketplaceRegistry';
import { LianLiTlDevicePage } from './LianLiTlDevicePage';
import { LianLiWirelessDevicePage } from './LianLiWirelessDevicePage';
import { Galahad2DevicePage } from './Galahad2DevicePage';
import { StrimerDevicePage } from './StrimerDevicePage';
import { TryxDevicePage } from './TryxDevicePage';
import { Toggle } from '../../common/Toggle/Toggle';
import { useTranslation } from '../../../lib/i18n';
import type { ConnectionState } from '../../../hooks/useServiceStatus';
import styles from './DevicePage.module.scss';

/**
 * Routed device page. Resolves the device referenced by the URL's
 * `subtab` segment (i.e. /system/device/<deviceKey>) via the
 * shared `useUnifiedDevices` selector, then dispatches to the
 * kind-specific page body:
 *
 *   panel       → PanelDevicePage     (Y70 / Q60 / Q80 / simulator)
 *   peripheral  → PeripheralDevicePage (mice, keyboards, …)
 *   curated     → its bespoke page (keeb / np50 / smarthub / cnvs); any without one
 *                  falls through to a name + "no page yet" placeholder.
 *
 * Rendering these as pages (rather than fullscreen modals) lets the
 * sidebar's DEVICES section deep-link to each device.
 */
// A device is transiently absent from `unified` while navigating between
// device pages and while the service is still detecting freshly-attached
// hardware. Hold this long before showing the not-connected notice so it
// never flashes before detection lands.
const DETECT_GRACE_MS = 700;

interface DevicePageProps {
  deviceKey: string;
  serviceOnline: boolean;
  connectionState?: ConnectionState;
  onOpenFirmware?: () => void;
  onSectionNavigate?: (section: string) => void;
}

export function DevicePage({ deviceKey, serviceOnline, connectionState, onOpenFirmware, onSectionNavigate }: DevicePageProps) {
  const { t } = useTranslation();
  const { unified, controlDevice } = useUnifiedDevices(serviceOnline);
  const device = useMemo<UnifiedDevice | undefined>(
    () => unified.find(d => d.key === deviceKey),
    [unified, deviceKey],
  );

  // The device appearing in `unified` re-renders and dispatches immediately,
  // independent of this timer; the grace only defers the empty-state UI.
  const [graceElapsed, setGraceElapsed] = useState(false);
  useEffect(() => {
    setGraceElapsed(false);
    if (device) return;
    const id = window.setTimeout(() => setGraceElapsed(true), DETECT_GRACE_MS);
    return () => window.clearTimeout(id);
  }, [device, deviceKey]);

  if (!serviceOnline) {
    return <ServiceRequired state={connectionState} skeleton={<div />} />;
  }

  if (!device) {
    return (
      <div className={styles.page}>
        <ViewHeader title={t('devices.page.title')} />
        {graceElapsed && (
          <div className={`${styles.pageBody} pageBody`}>
            <EmptyState icon={<Unplug size={40} />} title={t('devices.page.notConnected')} />
          </div>
        )}
      </div>
    );
  }

  // When the user turns Nexus Control off, the device's settings are
  // meaningless (Nexus holds no connection), so the page collapses to a single
  // re-enable switch instead of the normal body.
  if (device.supportsNexusControl && !device.nexusControlEnabled && device.curatedId) {
    return (
      <NexusControlOff
        key={device.key}
        deviceName={device.name}
        onEnable={() => controlDevice(device.curatedId as string, true)}
      />
    );
  }

  if (device.kind === 'panel' && device.panelDevice) {
    // `key` forces unmount + remount when navigating between panel device
    // pages (e.g. Q60 → Y70). Without it React reuses the same
    // PanelDevicePage and PanelEmbedFrame keeps its ResizeObserver-derived
    // `measured` state, post-handshake iframe content, and canvasW/H from
    // the previous device, so the new page paints at the old device's
    // scale until the tree is torn down. Remounting rebuilds the iframe
    // against the new device's canvas/DPR.
    return <PanelDevicePage key={device.key} device={device.panelDevice} onOpenFirmware={onOpenFirmware} />;
  }

  if (device.kind === 'peripheral' && device.peripheral) {
    return <PeripheralDevicePage key={device.key} peripheral={device.peripheral} />;
  }

  if (device.curatedId === 'keeb') {
    return <KeebDevicePage key={device.key} />;
  }

  if (device.curatedId === 'lianli') {
    return <LianLiDevicePage key={device.key} onSectionNavigate={onSectionNavigate} />;
  }

  if (device.curatedId === 'corsair') {
    return <CorsairDevicePage key={device.key} onSectionNavigate={onSectionNavigate} />;
  }

  if (device.curatedId === 'np50') {
    return <Np50DevicePage key={device.key} />;
  }

  if (device.curatedId === 'smarthub') {
    return <SmartHubDevicePage key={device.key} />;
  }

  if (device.curatedId === 'cnvs') {
    return <CnvsDevicePage key={device.key} />;
  }

  if (device.curatedId === 'lianli-tl') {
    return <LianLiTlDevicePage key={device.key} onSectionNavigate={onSectionNavigate} />;
  }

  if (device.curatedId === 'lianli-aio') {
    return <Galahad2DevicePage key={device.key} onSectionNavigate={onSectionNavigate} />;
  }

  if (device.curatedId === 'lianli-wireless') {
    return <LianLiWirelessDevicePage key={device.key} onSectionNavigate={onSectionNavigate} />;
  }

  if (device.curatedId === 'strimer') {
    return <StrimerDevicePage key={device.key} onSectionNavigate={onSectionNavigate} />;
  }

  if (device.curatedId === 'tryx') {
    return <TryxDevicePage key={device.key} />;
  }

  if (device.kind === 'app-device') {
    const type = typeForMarketplace(device.key.replace('app-device-', ''));
    return (
      <div key={device.key} className={styles.page}>
        <div className={styles.pageBody}>
          <SdkMarketplacePage type={type} />
        </div>
      </div>
    );
  }

  // Curated devices with no bespoke page: render the name + a hint so a
  // sidebar deep link still lands on something readable.
  return (
    <section>
      <ViewHeader title={device.name} />
      <Placeholder title={t('devices.page.noPageYet', { category: device.category })} />
    </section>
  );
}

function NexusControlOff({ deviceName, onEnable }: { deviceName: string; onEnable: () => void }) {
  const { t } = useTranslation();
  return (
    <section className={styles.page}>
      <div className={styles.controlOff}>
        <h2 className={styles.controlOffTitle}>{t('devices.nexusControl')}</h2>
        <p className={styles.controlOffHint}>{t('devices.nexusControlOffHint', { name: deviceName })}</p>
        <Toggle checked={false} onChange={() => onEnable()} ariaLabel={t('devices.nexusControl')} />
      </div>
    </section>
  );
}

export default DevicePage;
