import { useMemo } from 'react';
import { useUnifiedDevices, type UnifiedDevice } from '../../../hooks/useUnifiedDevices';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { ServiceRequired } from '../ServiceRequired';
import { Placeholder } from '../Placeholder';
import { PanelDevicePage } from './PanelDevicePage';
import { PeripheralDevicePage } from './PeripheralDevicePage';
import { KeebDevicePage } from './KeebDevicePage';
import { LianLiDevicePage } from './LianLiDevicePage';
import { Np50DevicePage } from './Np50DevicePage';
import { SmartHubDevicePage } from './SmartHubDevicePage';
import { CnvsDevicePage } from './CnvsDevicePage';
import { useTranslation } from '../../../lib/i18n';
import type { ConnectionState } from '../../../hooks/useServiceStatus';

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
interface DevicePageProps {
  deviceKey: string;
  serviceOnline: boolean;
  connectionState?: ConnectionState;
  onOpenFirmware?: () => void;
  onSectionNavigate?: (section: string) => void;
}

export function DevicePage({ deviceKey, serviceOnline, connectionState, onOpenFirmware, onSectionNavigate }: DevicePageProps) {
  const { t } = useTranslation();
  const { unified } = useUnifiedDevices(serviceOnline);
  const device = useMemo<UnifiedDevice | undefined>(
    () => unified.find(d => d.key === deviceKey),
    [unified, deviceKey],
  );

  if (!serviceOnline) {
    return <ServiceRequired state={connectionState} skeleton={<div />} />;
  }

  if (!device) {
    return (
      <section>
        <ViewHeader title={t('devices.page.title')} />
        <Placeholder title={t('devices.page.notFound')} />
      </section>
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

  if (device.curatedId === 'np50') {
    return <Np50DevicePage key={device.key} />;
  }

  if (device.curatedId === 'smarthub') {
    return <SmartHubDevicePage key={device.key} />;
  }

  if (device.curatedId === 'cnvs') {
    return <CnvsDevicePage key={device.key} />;
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

export default DevicePage;
