import { useEffect, useMemo, useState } from 'react';
import { Unplug } from 'lucide-react';
import { useUnifiedDevices, type UnifiedDevice } from '../../../hooks/useUnifiedDevices';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { ServiceRequired } from '../ServiceRequired';
import { Placeholder } from '../Placeholder';
import { PanelDevicePage } from './PanelDevicePage';
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
import { StreamDeckDevicePage } from './StreamDeckDevicePage';
import { NexusControlCard } from '../../common/NexusControlCard/NexusControlCard';
import { ConflictAppCard } from '../../common/ConflictAppCard/ConflictAppCard';
import { ExperimentalBadge } from '../../common/ExperimentalBadge/ExperimentalBadge';
import { useConflictApps } from '../../../hooks/useConflictApps';
import { useToast } from '../../common/Toast/Toast';
import { promoteDisplayToPanel } from '../../../api/displays';
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
  const { push } = useToast();
  const { unified, controlDevice } = useUnifiedDevices(serviceOnline);
  const device = useMemo<UnifiedDevice | undefined>(
    () => unified.find(d => d.key === deviceKey),
    [unified, deviceKey],
  );

  // The device appearing in `unified` re-renders and dispatches immediately,
  // independent of this timer; the grace only defers the empty-state UI.
  // Also covers a device that resolves but reports itself disconnected (e.g.
  // unplugged, or a Y70 whose monitor cable came out too) - not just one
  // absent from `unified` altogether.
  const notConnected = !device || !device.connected;
  const [graceElapsed, setGraceElapsed] = useState(false);
  useEffect(() => {
    setGraceElapsed(false);
    if (!notConnected) return;
    const id = window.setTimeout(() => setGraceElapsed(true), DETECT_GRACE_MS);
    return () => window.clearTimeout(id);
  }, [notConnected, deviceKey]);

  // Service reachability and its transient-blip grace are owned by
  // useServiceStatus (the /ping poller, via offlineGraceMs). By the time
  // serviceOnline is false here the service has been unreachable past that
  // grace, so a brief display-rotate blip never reaches this point.
  if (!serviceOnline) {
    return <ServiceRequired state={connectionState} skeleton={<div />} />;
  }

  if (notConnected) {
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
        conflictAppId={device.conflictAppId}
        experimental={device.experimental}
        onEnable={() => controlDevice(device.curatedId as string, true)}
      />
    );
  }

  // Promoted-monitor panel with Nexus Control off: the record (layout, theme,
  // settings) persists but hosts no kiosk. The monitor stays physically
  // attached and working as a normal display, unmanaged rather than
  // disconnected - so collapse to the same re-enable gate a curated device
  // gets when Nexus Control is off, instead of falling through to
  // PanelDevicePage (whose toggle only ever renders checked/on).
  const offMonitorDisplayId = device.kind === 'panel' && device.panelDevice?.linkEnabled === false
    ? device.panelDevice.displayId
    : undefined;
  if (offMonitorDisplayId) {
    return (
      <NexusControlOff
        key={device.key}
        deviceName={device.name}
        onEnable={() => {
          void promoteDisplayToPanel(offMonitorDisplayId).then(record => {
            if (!record) push({ title: t('displays.error.promote') });
          });
        }}
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
    return <PanelDevicePage key={device.key} device={device.panelDevice} onOpenFirmware={onOpenFirmware} onSectionNavigate={onSectionNavigate} />;
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

  if (device.curatedId === 'streamdeck') {
    return <StreamDeckDevicePage key={device.key} device={device} controlDevice={controlDevice} />;
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

export function NexusControlOff({ deviceName, conflictAppId, experimental, onEnable }: { deviceName: string; conflictAppId?: string; experimental?: boolean; onEnable: () => void }) {
  const { t } = useTranslation();
  const { conflicts, ready } = useConflictApps(true);
  const activeConflict = conflictAppId ? conflicts.find(c => c.id === conflictAppId) : undefined;
  // Before the first conflicts snapshot resolves, an absent activeConflict is
  // unknown rather than confirmed clear - keep the enable toggle disabled so
  // the user can't turn Control on while a real conflict may still surface.
  const resolvingConflict = Boolean(conflictAppId) && !ready;
  return (
    <section className={styles.page}>
      <div className={styles.controlOff}>
        <h2 className={styles.controlOffTitle}>{deviceName}</h2>
        <div className={styles.controlOffBody}>
          {activeConflict ? (
            <>
              <p className={styles.controlOffHint}>{t('devices.nexusControlOff.conflictHint', { app: activeConflict.displayName })}</p>
              <ConflictAppCard conflict={activeConflict} />
              <NexusControlCard checked={false} disabled onChange={() => {}} />
            </>
          ) : (
            <>
              <p className={styles.controlOffHint}>{t('devices.nexusControlOff.enableHint')}</p>
              <NexusControlCard checked={false} disabled={resolvingConflict} onChange={onEnable} />
            </>
          )}
        </div>
        {experimental && <ExperimentalBadge />}
      </div>
    </section>
  );
}

export default DevicePage;
