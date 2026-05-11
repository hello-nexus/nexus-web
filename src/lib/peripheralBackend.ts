// Routes capability writes to the right backend based on a peripheral's source.
// Service-backed peripherals go through the HTTP API; WebHID-backed peripherals
// drive the registered vendor wrapper directly. UI components call these helpers
// without caring which backend handles it.
import type { Peripheral } from '../hooks/usePeripherals';
import { putService } from '../api/service';
import { getWebHidPeripheral } from '../hooks/useWebHidPeripherals';

export async function commitDpi(p: Peripheral, dpi: number): Promise<void> {
  if (p.source === 'webhid') {
    const w = getWebHidPeripheral(p.id);
    if (w?.setDpi) await w.setDpi(dpi);
    return;
  }
  await putService(`/peripherals/${encodeURIComponent(p.id)}/dpi`, { dpi });
}

export async function commitPolling(p: Peripheral, hz: number): Promise<void> {
  if (p.source === 'webhid') {
    const w = getWebHidPeripheral(p.id);
    if (w?.setPolling) await w.setPolling(hz);
    return;
  }
  await putService(`/peripherals/${encodeURIComponent(p.id)}/polling`, { hz });
}

export async function commitSleepIdle(p: Peripheral, idleSeconds: number): Promise<void> {
  if (p.source === 'webhid') {
    const w = getWebHidPeripheral(p.id);
    if (w?.setIdleSeconds) await w.setIdleSeconds(idleSeconds);
    return;
  }
  await putService(`/peripherals/${encodeURIComponent(p.id)}/sleep`, { idleSeconds });
}
