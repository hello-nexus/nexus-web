// Verifies that WebHidRazerMouse serializes concurrent calls — Razer devices
// only honor one outstanding feature-report pair at a time, so replies for
// interleaved calls can land in the wrong receiver if we don't serialize.
import { describe, it, expect, vi } from 'vitest';
import { WebHidRazerMouse } from './mouse';
import { RAZER_SPEC } from './spec';

function mockDevice(params: {
  vendorId?: number;
  productId?: number;
  // Artificial delay added between sendFeatureReport and receiveFeatureReport
  // completing. Lets us reliably observe concurrent-call serialization.
  delayMs?: number;
} = {}) {
  const delayMs = params.delayMs ?? 5;
  const events: string[] = [];
  let pending = 0;
  let opened = false;
  const device: Partial<HIDDevice> = {
    vendorId: params.vendorId ?? 0x1532,
    productId: params.productId ?? 0x007D,
    productName: 'mock',
    collections: [],
    get opened() { return opened; },
    open: vi.fn(async () => { opened = true; }),
    close: vi.fn(async () => { opened = false; }),
    sendFeatureReport: vi.fn(async () => {
      pending++;
      events.push(`send-start (pending=${pending})`);
      await new Promise(r => setTimeout(r, delayMs));
      events.push(`send-end`);
      pending--;
    }),
    receiveFeatureReport: vi.fn(async () => {
      events.push(`recv`);
      await new Promise(r => setTimeout(r, delayMs));
      return new DataView(new Uint8Array(90).buffer);
    }),
  };
  return { device: device as HIDDevice, events };
}

describe('WebHidRazerMouse mutex', () => {
  it('serializes concurrent snapshot/get calls', async () => {
    const { device, events } = mockDevice({ delayMs: 5 });
    const profile = RAZER_SPEC.profiles.get(0x007D)!;
    const mouse = new WebHidRazerMouse(device, profile);

    // Fire four reads in parallel. Without the mutex these would interleave
    // (multiple `send-start (pending=2)` lines). With the mutex, each pair of
    // send-then-recv must complete before the next starts.
    await Promise.all([
      mouse.getDpi(),
      mouse.getPolling(),
      mouse.getBatteryPercent(),
      mouse.isCharging(),
    ]);

    // No two sends should ever be concurrently pending.
    const maxPending = Math.max(
      ...events
        .filter(e => e.startsWith('send-start'))
        .map(e => Number(e.match(/pending=(\d+)/)![1])),
    );
    expect(maxPending).toBe(1);
  });

  it('snapshot does not throw under concurrent use', async () => {
    const { device } = mockDevice();
    const profile = RAZER_SPEC.profiles.get(0x007D)!;
    const mouse = new WebHidRazerMouse(device, profile);

    const results = await Promise.allSettled([
      mouse.snapshot(),
      mouse.getDpi(),
      mouse.setDpi(1600),
    ]);
    for (const r of results) {
      expect(r.status).toBe('fulfilled');
    }
  });
});
