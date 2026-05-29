import { useMemo } from 'react';
import { useUnifiedDevices, type UnifiedDevice } from '../../../hooks/useUnifiedDevices';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { ServiceRequired } from '../ServiceRequired';
import { Placeholder } from '../Placeholder';
import { PanelDevicePage } from './PanelDevicePage';
import { PeripheralDevicePage } from './PeripheralDevicePage';
import { KeebDevicePage } from './KeebDevicePage';
import { Np50DevicePage } from './Np50DevicePage';
import { CnvsDevicePage } from './CnvsDevicePage';
import type { ConnectionState } from '../../../hooks/useServiceStatus';

/**
 * Routed device page. Resolves the device referenced by the URL's
 * `subtab` segment (i.e. /system/device/<deviceKey>) via the
 * shared `useUnifiedDevices` selector, then dispatches to the
 * kind-specific page body:
 *
 *   panel       → PanelDevicePage     (Y70 / Q60 / Q80 / simulator)
 *   peripheral  → PeripheralDevicePage (mice, keyboards, …)
 *   curated     → falls through to "details coming" until each
 *                  curated handler grows its own page.
 *
 * The previous flow opened these as fullscreen modals from
 * DevicesPage; converting them to pages was the point of this
 * refactor so the sidebar's DEVICES section can deep-link.
 */
interface DevicePageProps {
  deviceKey: string;
  serviceOnline: boolean;
  connectionState?: ConnectionState;
}

export function DevicePage({ deviceKey, serviceOnline, connectionState }: DevicePageProps) {
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
        <ViewHeader title="Device" />
        <Placeholder title="Device not found" />
      </section>
    );
  }

  if (device.kind === 'panel' && device.panelDevice) {
    // `key` forces a full unmount + remount when the user navigates
    // from one panel device page to another (e.g. Q60 → Y70).
    // Without it React reuses the same PanelDevicePage instance and
    // the inner PanelEmbedFrame keeps its ResizeObserver-derived
    // `measured` state, its post-handshake iframe content, and its
    // canvasW/H derived from the previous device — so the new device
    // page paints with the old device's scale + sizing until something
    // else (page change → return) tears the tree down. Keying on the
    // unified device key remounts cleanly so the iframe rebuilds
    // against the new device's canvas/DPR from scratch.
    return <PanelDevicePage key={device.key} device={device.panelDevice} />;
  }

  if (device.kind === 'peripheral' && device.peripheral) {
    return <PeripheralDevicePage key={device.key} peripheral={device.peripheral} />;
  }

  if (device.curatedId === 'keeb') {
    return <KeebDevicePage key={device.key} />;
  }

  if (device.curatedId === 'np50') {
    return <Np50DevicePage key={device.key} />;
  }

  if (device.curatedId === 'cnvs') {
    return <CnvsDevicePage key={device.key} />;
  }

  // Curated devices the service knows about but don't yet have a
  // bespoke page. Renders the device name + a hint so a sidebar deep
  // link still lands on something readable.
  return (
    <section>
      <ViewHeader title={device.name} />
      <Placeholder title={`No page yet for ${device.category}`} />
    </section>
  );
}

export default DevicePage;
