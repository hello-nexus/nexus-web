// WebHID-backed Razer mouse handler. Mirrors the service-side
// RazerMousePeripheral.cs byte-for-byte, driven by the same shared JSON spec.
// This is the browser fallback path: when the qOS service isn't installed
// or running, the user can still configure their mouse via Chrome's WebHID.
import '../types';
import type { WebHidPeripheral, WebHidPeripheralSnapshot } from '../peripheral';
import { RAZER_SPEC, type RazerMouseProfile, getProfile } from './spec';
import { buildFrame, parseReply, type RazerReply } from './framer';

/** Ms to wait between set+get on a feature-report round trip. Matches service default. */
const EXCHANGE_DELAY_MS = 30;
const VARSTORE = 0x01;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class WebHidRazerMouse implements WebHidPeripheral {
  public readonly device: HIDDevice;
  public readonly profile: RazerMouseProfile;

  /** Promise-chain mutex. Razer devices only honor one outstanding feature-report pair
      at a time; concurrent calls without serialization produce interleaved replies
      and scrambled values (wrong bytes parsed as DPI, battery, etc.). */
  private _queue: Promise<unknown> = Promise.resolve();

  constructor(device: HIDDevice, profile: RazerMouseProfile) {
    this.device = device;
    this.profile = profile;
  }

  // --- WebHidPeripheral identity ---
  get id(): string {
    return `webhid-razer-${this.device.productId.toString(16).padStart(4, '0')}-${this.profile.name.toLowerCase().replace(/\s+/g, '-')}`;
  }
  get vendor(): string { return 'Razer'; }
  get name(): string { return `Razer ${this.profile.name}`; }

  static tryWrap(device: HIDDevice): WebHidRazerMouse | null {
    if (device.vendorId !== RAZER_SPEC.vendorId) return null;
    const profile = getProfile(device.productId);
    if (!profile) return null;
    return new WebHidRazerMouse(device, profile);
  }

  /** Ensures device is open; must be called before any exchange. */
  async ensureOpen(): Promise<void> {
    if (!this.device.opened) {
      await this.device.open();
    }
  }

  async close(): Promise<void> {
    if (this.device.opened) {
      try { await this.device.close(); } catch { /* swallow */ }
    }
  }

  /** Serialize an async block so feature-report exchanges don't interleave. */
  private async serialize<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this._queue;
    let release!: (value: unknown) => void;
    this._queue = new Promise(resolve => { release = resolve; });
    try {
      await prev;
      return await fn();
    } finally {
      release(undefined);
    }
  }

  /** Send a command, optionally wait for and parse the reply. Mutex-protected. */
  private async exchange(
    commandKey: string,
    args: readonly number[],
    readResponse: boolean,
  ): Promise<RazerReply | null> {
    return this.serialize(async () => {
      const command = RAZER_SPEC.commands[commandKey];
      if (!command) {
        throw new Error(`Unknown Razer command: ${commandKey}`);
      }
      const frame = buildFrame({ command, transactionId: this.profile.transactionId, args });
      // Chromium's sendFeatureReport expects (reportId, bytesAfterReportId). Strip
      // the leading 0-byte report id.
      const reportId = frame[0];
      const payload = frame.slice(1);
      await this.device.sendFeatureReport(reportId, payload);

      if (!readResponse) return null;

      await sleep(EXCHANGE_DELAY_MS);
      const view = await this.device.receiveFeatureReport(reportId);
      const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
      return parseReply(bytes);
    });
  }

  async getDpi(): Promise<number> {
    await this.ensureOpen();
    const reply = await this.exchange('getDpi', [VARSTORE, 0, 0, 0, 0, 0, 0], true);
    if (!reply) return 0;
    return (reply.args[1] << 8) | reply.args[2];
  }

  async setDpi(dpi: number): Promise<boolean> {
    await this.ensureOpen();
    const clamped = Math.max(100, Math.min(this.profile.maxDpi, dpi));
    const hi = (clamped >> 8) & 0xFF;
    const lo = clamped & 0xFF;
    const args = [VARSTORE, hi, lo, hi, lo, 0, 0];
    await this.exchange('setDpi', args, false);
    return true;
  }

  supportedPolling(): number[] {
    return Object.keys(RAZER_SPEC.pollingMaps[this.profile.polling]).map(Number).sort((a, b) => a - b);
  }

  async getPolling(): Promise<number> {
    await this.ensureOpen();
    const key = this.profile.polling === 'hyperpolling' ? 'getPollingHyper' : 'getPollingStd';
    const reply = await this.exchange(key, [0], true);
    if (!reply) return 0;
    const map = RAZER_SPEC.pollingMaps[this.profile.polling];
    for (const [hz, code] of Object.entries(map)) {
      if (code === reply.args[0]) return parseInt(hz, 10);
    }
    return 0;
  }

  async setPolling(hz: number): Promise<boolean> {
    await this.ensureOpen();
    const map = RAZER_SPEC.pollingMaps[this.profile.polling];
    const code = map[hz];
    if (code === undefined) return false;

    if (this.profile.polling === 'hyperpolling') {
      await this.exchange('setPollingHyper', [VARSTORE, code], false);
    } else {
      await this.exchange('setPollingStd', [code], false);
    }
    return true;
  }

  async getBatteryPercent(): Promise<number> {
    if (!this.profile.hasBattery) return -1;
    await this.ensureOpen();
    const reply = await this.exchange('getBattery', [0, 0], true);
    if (!reply) return -1;
    return Math.round((reply.args[1] * 100) / 255);
  }

  async isCharging(): Promise<boolean> {
    if (!this.profile.hasBattery) return false;
    await this.ensureOpen();
    const reply = await this.exchange('getCharging', [0, 0], true);
    if (!reply) return false;
    return reply.args[1] === 0x01;
  }

  async getIdleSeconds(): Promise<number> {
    if (!this.profile.hasSleep) return -1;
    await this.ensureOpen();
    const reply = await this.exchange('getIdleTime', [0, 0], true);
    if (!reply) return -1;
    return (reply.args[0] << 8) | reply.args[1];
  }

  async setIdleSeconds(seconds: number): Promise<boolean> {
    if (!this.profile.hasSleep) return false;
    await this.ensureOpen();
    const s = Math.max(60, Math.min(900, seconds));
    const hi = (s >> 8) & 0xFF;
    const lo = s & 0xFF;
    await this.exchange('setIdleTime', [hi, lo], false);
    return true;
  }

  /** Reads all capability state sequentially. Calls route through the mutex so replies
   *  don't interleave. Each read is a separate sendFeatureReport + receive round
   *  trip (~30ms); expect ~120-250ms total for a wireless mouse. */
  async snapshot(): Promise<WebHidPeripheralSnapshot> {
    await this.ensureOpen();
    const dpi = await this.getDpi();
    const polling = await this.getPolling();
    const percent = this.profile.hasBattery ? await this.getBatteryPercent() : -1;
    const charging = this.profile.hasBattery ? await this.isCharging() : false;
    const idle = this.profile.hasSleep ? await this.getIdleSeconds() : -1;

    const capabilities: string[] = ['dpi', 'polling'];
    if (this.profile.hasBattery) capabilities.push('battery');
    if (this.profile.hasSleep) capabilities.push('sleep');

    const snap: WebHidPeripheralSnapshot = {
      id: this.id,
      name: this.name,
      vendor: this.vendor,
      category: 'mouse',
      vendorId: `0x${this.device.vendorId.toString(16).toUpperCase().padStart(4, '0')}`,
      productId: `0x${this.device.productId.toString(16).toUpperCase().padStart(4, '0')}`,
      isWireless: this.profile.hasBattery,
      capabilities,
      dpi: { minDpi: 100, maxDpi: this.profile.maxDpi, step: 50, current: dpi },
      polling: { supportedHz: this.supportedPolling(), currentHz: polling },
    };
    if (this.profile.hasBattery) {
      snap.battery = { percent, charging };
    }
    if (this.profile.hasSleep) {
      snap.sleep = { idleSeconds: idle, lowBatteryPercent: 0 };
    }
    return snap;
  }
}
