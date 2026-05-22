import { useMemo } from 'react';
import { useUnifiedDevices, type UnifiedDevice } from '../../../hooks/useUnifiedDevices';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { ServiceRequired } from '../ServiceRequired';
import { Placeholder } from '../Placeholder';
import type { ConnectionState } from '../../../hooks/useServiceStatus';

/**
 * Routed device page. Resolves the device referenced by the URL's
 * `subtab` segment (i.e. /my-computer/device/<deviceKey>) and
 * dispatches to the kind-specific page body.
 *
 * Phase A: only the resolver + chrome are in place. The body is a
 * placeholder while the existing PanelDeviceModal / PeripheralModal
 * surfaces are being converted from modal layouts to page layouts in
 * the next phase. Once those land here they'll be looked up by
 * device.kind.
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
    // Either an in-flight enumeration (haven't fetched yet) OR a stale
    // deep link to a device that's since been removed. Both render the
    // same lightweight placeholder so the user isn't staring at chrome.
    return (
      <section>
        <ViewHeader title="Device" />
        <Placeholder title="Loading device…" />
      </section>
    );
  }

  return (
    <section>
      <ViewHeader title={device.name} />
      <Placeholder title={`${device.name} page coming next phase`} />
    </section>
  );
}

export default DevicePage;
