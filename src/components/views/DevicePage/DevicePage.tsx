import { useMemo } from 'react';
import { useUnifiedDevices, type UnifiedDevice } from '../../../hooks/useUnifiedDevices';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { ServiceRequired } from '../ServiceRequired';
import { Placeholder } from '../Placeholder';
import { PanelDevicePage } from './PanelDevicePage';
import { PeripheralDevicePage } from './PeripheralDevicePage';
import type { ConnectionState } from '../../../hooks/useServiceStatus';

/**
 * Routed device page. Resolves the device referenced by the URL's
 * `subtab` segment (i.e. /my-computer/device/<deviceKey>) via the
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
    return <PanelDevicePage device={device.panelDevice} />;
  }

  if (device.kind === 'peripheral' && device.peripheral) {
    return <PeripheralDevicePage peripheral={device.peripheral} />;
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
