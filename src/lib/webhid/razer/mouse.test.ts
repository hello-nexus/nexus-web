import { describe, it, expect, vi } from 'vitest';
import { WebHidRazerMouse } from './mouse';
import { RAZER_SPEC, getProfile } from './spec';

/** Builds a minimal HIDDevice stub for tests. Records all outbound frames. */
function mockHidDevice(opts: {
  vendorId: number;
  productId: number;
  reply?: (sentPayload: Uint8Array) => Uint8Array;
}): {
  device: HIDDevice;
  sent: Uint8Array[];
} {
  const sent: Uint8Array[] = [];
  let opened = false;
  const device: Partial<HIDDevice> = {
    vendorId: opts.vendorId,
    productId: opts.productId,
    productName: 'Mock Razer',
    collections: [],
    get opened() { return opened; },
    open: vi.fn(async () => { opened = true; }),
    close: vi.fn(async () => { opened = false; }),
    sendFeatureReport: vi.fn(async (_reportId: number, data: BufferSource) => {
      const arr = data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : new Uint8Array((data as ArrayBufferView).buffer, (data as ArrayBufferView).byteOffset, (data as ArrayBufferView).byteLength);
      sent.push(arr.slice());
    }),
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- mock signature mirrors WebHID API
    receiveFeatureReport: vi.fn(async (_reportId: number) => {
      const last = sent[sent.length - 1];
      const replyPayload = opts.reply ? opts.reply(last) : new Uint8Array(90);
      return new DataView(replyPayload.buffer, replyPayload.byteOffset, replyPayload.byteLength);
    }),
  };
  return { device: device as HIDDevice, sent };
}

describe('WebHidRazerMouse', () => {
  describe('tryWrap', () => {
    it('recognizes a Razer PID in the profile table', () => {
      const { device } = mockHidDevice({ vendorId: 0x1532, productId: 0x007D });
      const mouse = WebHidRazerMouse.tryWrap(device);
      expect(mouse).not.toBeNull();
      expect(mouse!.profile.name).toBe('DeathAdder V2 Pro');
    });

    it('rejects non-Razer vendor', () => {
      const { device } = mockHidDevice({ vendorId: 0x046D, productId: 0xC548 });
      expect(WebHidRazerMouse.tryWrap(device)).toBeNull();
    });

    it('rejects unknown Razer PID', () => {
      const { device } = mockHidDevice({ vendorId: 0x1532, productId: 0xFFFF });
      expect(WebHidRazerMouse.tryWrap(device)).toBeNull();
    });
  });

  describe('setDpi', () => {
    it('sends class=0x04 id=0x05 with VARSTORE + DPI bytes', async () => {
      const { device, sent } = mockHidDevice({ vendorId: 0x1532, productId: 0x007D });
      const mouse = WebHidRazerMouse.tryWrap(device)!;
      await mouse.setDpi(1600);

      expect(sent).toHaveLength(1);
      // sendFeatureReport receives 90 bytes (report id stripped). Payload indices shift by 1.
      const payload = sent[0];
      expect(payload.length).toBe(90);
      // status
      expect(payload[0]).toBe(0);
      // transaction id
      expect(payload[1]).toBe(0x3F);
      // data size (set DPI = 7)
      expect(payload[5]).toBe(0x07);
      // command class / id
      expect(payload[6]).toBe(0x04);
      expect(payload[7]).toBe(0x05);
      // VARSTORE
      expect(payload[8]).toBe(0x01);
      // DPI 1600 = 0x0640, hi then lo
      expect(payload[9]).toBe(0x06);
      expect(payload[10]).toBe(0x40);
      // mirrored Y
      expect(payload[11]).toBe(0x06);
      expect(payload[12]).toBe(0x40);
    });

    it('clamps above MaxDpi to profile.maxDpi', async () => {
      const { device, sent } = mockHidDevice({ vendorId: 0x1532, productId: 0x007D });
      const mouse = WebHidRazerMouse.tryWrap(device)!;
      await mouse.setDpi(50000);
      const payload = sent[0];
      // V2 Pro maxDpi = 20000 = 0x4E20
      expect(payload[9]).toBe(0x4E);
      expect(payload[10]).toBe(0x20);
    });

    it('clamps below 100 to 100', async () => {
      const { device, sent } = mockHidDevice({ vendorId: 0x1532, productId: 0x007D });
      const mouse = WebHidRazerMouse.tryWrap(device)!;
      await mouse.setDpi(10);
      const payload = sent[0];
      // 100 = 0x0064
      expect(payload[9]).toBe(0x00);
      expect(payload[10]).toBe(0x64);
    });
  });

  describe('getDpi', () => {
    it('parses the battery-shaped reply correctly', async () => {
      // Build a reply with DPI X = 1600 at args[1..2]
      const { device } = mockHidDevice({
        vendorId: 0x1532,
        productId: 0x007D,
        reply: () => {
          const r = new Uint8Array(90);
          r[0] = 0x02;  // status success (90-byte shape, no report id)
          r[1] = 0x3F;
          r[5] = 0x07;
          r[6] = 0x04;
          r[7] = 0x85;
          // args start at index 8 for 90-byte shape
          r[8] = 0x01;   // varstore echo
          r[9] = 0x06;   // DPI X hi
          r[10] = 0x40;  // DPI X lo
          return r;
        },
      });
      const mouse = WebHidRazerMouse.tryWrap(device)!;
      const dpi = await mouse.getDpi();
      expect(dpi).toBe(0x0640);
    });
  });

  describe('setPolling', () => {
    it('sends standard polling command for standard-variant mouse', async () => {
      const { device, sent } = mockHidDevice({ vendorId: 0x1532, productId: 0x007D });
      const mouse = WebHidRazerMouse.tryWrap(device)!;
      await mouse.setPolling(1000);
      const payload = sent[0];
      // class 0x00, id 0x05, data_size 1, args[0] = 0x01 (1000 Hz)
      expect(payload[5]).toBe(1);
      expect(payload[6]).toBe(0x00);
      expect(payload[7]).toBe(0x05);
      expect(payload[8]).toBe(0x01);
    });

    it('sends hyperpolling command with VARSTORE for V3 Pro', async () => {
      const { device, sent } = mockHidDevice({ vendorId: 0x1532, productId: 0x00B7 });
      const mouse = WebHidRazerMouse.tryWrap(device)!;
      expect(mouse.profile.polling).toBe('hyperpolling');
      await mouse.setPolling(8000);
      const payload = sent[0];
      // class 0x00, id 0x40, data_size 2, args[0] = VARSTORE, args[1] = 0x01 (8000 Hz)
      expect(payload[5]).toBe(2);
      expect(payload[6]).toBe(0x00);
      expect(payload[7]).toBe(0x40);
      expect(payload[8]).toBe(0x01);  // varstore
      expect(payload[9]).toBe(0x01);  // code for 8000 Hz
    });

    it('rejects unsupported polling rate', async () => {
      const { device } = mockHidDevice({ vendorId: 0x1532, productId: 0x007D });
      const mouse = WebHidRazerMouse.tryWrap(device)!;
      const ok = await mouse.setPolling(9999);
      expect(ok).toBe(false);
    });
  });

  describe('getBatteryPercent', () => {
    it('returns -1 for wired-only profile', async () => {
      const { device } = mockHidDevice({ vendorId: 0x1532, productId: 0x007C }); // wired
      const mouse = WebHidRazerMouse.tryWrap(device)!;
      expect(await mouse.getBatteryPercent()).toBe(-1);
    });

    it('scales 0..255 to 0..100', async () => {
      const { device } = mockHidDevice({
        vendorId: 0x1532, productId: 0x007D,
        reply: () => {
          const r = new Uint8Array(90);
          r[0] = 0x02;   // status
          r[9] = 0xFF;   // args[1] = 100%
          return r;
        },
      });
      const mouse = WebHidRazerMouse.tryWrap(device)!;
      expect(await mouse.getBatteryPercent()).toBe(100);
    });

    it('returns 0 for fully-drained battery', async () => {
      const { device } = mockHidDevice({
        vendorId: 0x1532, productId: 0x007D,
        reply: () => new Uint8Array(90),
      });
      const mouse = WebHidRazerMouse.tryWrap(device)!;
      expect(await mouse.getBatteryPercent()).toBe(0);
    });
  });

  it('spec sanity: profile exists for every device in the table', () => {
    for (const pid of RAZER_SPEC.profiles.keys()) {
      expect(getProfile(pid)).toBeDefined();
    }
  });
});
